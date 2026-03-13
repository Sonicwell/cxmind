package siprec

import (
	"bufio"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/cxmind/ingestion-go/internal/hep"
	"github.com/cxmind/ingestion-go/internal/rtp"
	"github.com/cxmind/ingestion-go/internal/sip"
	"github.com/cxmind/ingestion-go/internal/timeutil"
)

// SIPTCPServer listens for raw SIP messages over TCP connections (SIPREC).
type SIPTCPServer struct {
	listener net.Listener
	port     int
	localIP  string
	portPool *PortPool
	sessions *SessionTracker
	stop     chan struct{}
	wg       sync.WaitGroup
	// S-4: Connection limiting to prevent goroutine exhaustion
	maxConns    int32
	activeConns int32 // atomic
}

// MaxSIPRECConnections is the default maximum concurrent SIPREC TCP connections.
const MaxSIPRECConnections = 200

// NewSIPTCPServer creates a new SIP TCP server instance.
func NewSIPTCPServer(port int, localIP string, portPool *PortPool) *SIPTCPServer {
	return &SIPTCPServer{
		port:     port,
		localIP:  localIP,
		portPool: portPool,
		sessions: NewSessionTracker(),
		stop:     make(chan struct{}),
		maxConns: MaxSIPRECConnections,
	}
}

// ActiveConns returns the current number of active connections (for testing/monitoring).
func (s *SIPTCPServer) ActiveConns() int32 {
	return atomic.LoadInt32(&s.activeConns)
}

// Start begins listening for SIP TCP connections.
func (s *SIPTCPServer) Start() error {
	addr := fmt.Sprintf("0.0.0.0:%d", s.port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("SIPREC TCP listen on %s: %w", addr, err)
	}
	s.listener = listener

	log.Printf("[SIPREC] SIP TCP Server listening on %s (max_conns=%d)", addr, s.maxConns)

	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		for {
			conn, err := listener.Accept()
			if err != nil {
				select {
				case <-s.stop:
					return // Graceful shutdown
				default:
					if !errors.Is(err, net.ErrClosed) {
						log.Printf("[SIPREC] Accept error: %v", err)
					}
					return
				}
			}
			// S-4: Check connection limit before spawning goroutine
			if atomic.LoadInt32(&s.activeConns) >= s.maxConns {
				log.Printf("[SIPREC] Connection limit reached (%d), rejecting %s", s.maxConns, conn.RemoteAddr())
				conn.Close()
				continue
			}
			atomic.AddInt32(&s.activeConns, 1)
			s.wg.Add(1)
			go func() {
				defer s.wg.Done()
				defer atomic.AddInt32(&s.activeConns, -1)
				s.handleConnection(conn)
			}()
		}
	}()

	return nil
}

// Stop gracefully shuts down the SIP TCP server.
func (s *SIPTCPServer) Stop() {
	close(s.stop)
	if s.listener != nil {
		s.listener.Close()
	}
	s.wg.Wait()
	log.Println("[SIPREC] SIP TCP Server stopped")
}

// handleConnection processes a single TCP connection, reading SIP messages.
func (s *SIPTCPServer) handleConnection(conn net.Conn) {
	defer conn.Close()
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[SIPREC][PANIC] handleConnection recovered: %v", r)
		}
	}()

	reader := bufio.NewReader(conn)
	remoteAddr := conn.RemoteAddr().String()
	log.Printf("[SIPREC] New connection from %s", remoteAddr)

	for {
		select {
		case <-s.stop:
			return
		default:
		}

		msgBytes, err := ReadSIPMessage(reader)
		if err != nil {
			if err != io.EOF {
				log.Printf("[SIPREC] Read error from %s: %v", remoteAddr, err)
			}
			return
		}

		sipMsg, err := sip.ParseSIP(msgBytes)
		if err != nil {
			log.Printf("[SIPREC] SIP parse error from %s: %v", remoteAddr, err)
			continue
		}

		// Route by method
		switch sipMsg.Method {
		case "INVITE":
			// Check if this is a re-INVITE (session already exists)
			callID := sipMsg.GetCallID()
			if _, exists := s.sessions.Get(callID); exists {
				s.handleReINVITE(sipMsg, msgBytes, conn)
			} else {
				s.handleSIPRECInvite(sipMsg, msgBytes, conn)
			}
		case "BYE":
			s.handleSIPRECBye(sipMsg, msgBytes, conn)
		default:
			// Send 200 OK for other methods (ACK, etc.)
			if sipMsg.IsRequest {
				resp := s.formatSIPResponse(200, "OK",
					sipMsg.GetHeader("via"), sipMsg.GetFrom(), sipMsg.GetTo(),
					sipMsg.GetCallID(), sipMsg.GetCSeq())
				conn.Write([]byte(resp))
			}
		}
	}
}

// handleSIPRECInvite processes a SIPREC INVITE with multipart body.
func (s *SIPTCPServer) handleSIPRECInvite(sipMsg *sip.SIPMessage, rawMsg []byte, conn net.Conn) {
	callID := sipMsg.GetCallID()
	log.Printf("[SIPREC] INVITE received — CallID=%s", callID)

	// #4: Send 100 Trying immediately (SBC compatibility)
	s.sessions.StorePending(callID)
	tryingResp := s.formatSIPResponse(100, "Trying",
		sipMsg.GetHeader("via"), sipMsg.GetFrom(), sipMsg.GetTo(),
		callID, sipMsg.GetCSeq())
	conn.Write([]byte(tryingResp))
	log.Printf("[SIPREC] 100 Trying sent — CallID=%s", callID)

	// Extract all audio media streams from the SDP
	streams := sipMsg.ExtractAllMediaStreams()
	if len(streams) == 0 {
		// Try multipart body
		parts := sipMsg.ParseMultipartBody()
		for _, part := range parts {
			if part.ContentType == "application/sdp" {
				sdpMsg := &sip.SIPMessage{Body: part.Body}
				streams = sdpMsg.ExtractAllMediaStreams()
				break
			}
		}
	}

	if len(streams) == 0 {
		log.Printf("[SIPREC] No audio streams found in INVITE — CallID=%s", callID)
		s.sessions.Delete(callID)
		resp := s.formatSIPResponse(488, "Not Acceptable Here",
			sipMsg.GetHeader("via"), sipMsg.GetFrom(), sipMsg.GetTo(),
			callID, sipMsg.GetCSeq())
		conn.Write([]byte(resp))
		return
	}

	// Parse recording metadata (if present)
	var metadata *RecordingMetadata
	parts := sipMsg.ParseMultipartBody()
	for _, part := range parts {
		if strings.Contains(part.ContentType, "rs-metadata") {
			md, err := ParseRecordingMetadata(part.Body)
			if err != nil {
				log.Printf("[SIPREC] Metadata parse error — CallID=%s: %v", callID, err)
			} else {
				metadata = md
			}
			break
		}
	}

	// Allocate local RTP ports for each stream
	localPorts := make([]int, 0, len(streams))
	for range streams {
		port, err := s.portPool.Allocate(callID)
		if err != nil {
			log.Printf("[SIPREC] Port allocation failed — CallID=%s: %v", callID, err)
			// Release already allocated ports
			for _, p := range localPorts {
				s.portPool.Release(p)
			}
			s.sessions.Delete(callID)
			resp := s.formatSIPResponse(503, "Service Unavailable",
				sipMsg.GetHeader("via"), sipMsg.GetFrom(), sipMsg.GetTo(),
				callID, sipMsg.GetCSeq())
			conn.Write([]byte(resp))
			return
		}
		localPorts = append(localPorts, port)
	}

	// Start RTP listeners on allocated ports
	for i, port := range localPorts {
		speakerName := fmt.Sprintf("stream-%d", i+1)
		if metadata != nil && i < len(metadata.Streams) && metadata.Streams[i].ParticipantID != "" {
			for _, p := range metadata.Participants {
				if p.ID == metadata.Streams[i].ParticipantID {
					if p.Name != "" {
						speakerName = p.Name
					}
					break
				}
			}
		}

		if err := rtp.GlobalSniffer.StartListener(port, callID, speakerName); err != nil {
			log.Printf("[SIPREC] Failed to start RTP listener on port %d — CallID=%s: %v", port, callID, err)
		} else {
			log.Printf("[SIPREC] RTP listener started on port %d — CallID=%s Speaker=%s", port, callID, speakerName)
		}
	}

	// #5: Track session with allocated ports
	localTag := generateTag()
	s.sessions.Confirm(callID, localPorts, localTag)

	// Build 200 OK with SDP Answer
	sdpAnswer := s.buildSDP200OK(streams, localPorts)

	// Forward INVITE to the shared HEP pipeline
	srcIP := extractIPFromAddr(conn.RemoteAddr().String())
	packet := ToHEPPacket(rawMsg, srcIP, s.localIP, 5060, uint16(s.port), timeutil.Now())
	hep.HandleSIPPayload(packet)

	// Send 200 OK response
	response := s.formatSIP200OKWithSDP(
		sipMsg.GetHeader("via"), sipMsg.GetFrom(), sipMsg.GetTo(),
		callID, sipMsg.GetCSeq(), sdpAnswer)
	conn.Write([]byte(response))

	log.Printf("[SIPREC] 200 OK sent — CallID=%s Ports=%v ActiveSessions=%d",
		callID, localPorts, s.sessions.ActiveCount())
}

// #3: handleReINVITE processes a re-INVITE (SDP update mid-session).
func (s *SIPTCPServer) handleReINVITE(sipMsg *sip.SIPMessage, rawMsg []byte, conn net.Conn) {
	callID := sipMsg.GetCallID()
	log.Printf("[SIPREC] re-INVITE received — CallID=%s", callID)

	// Send 100 Trying
	tryingResp := s.formatSIPResponse(100, "Trying",
		sipMsg.GetHeader("via"), sipMsg.GetFrom(), sipMsg.GetTo(),
		callID, sipMsg.GetCSeq())
	conn.Write([]byte(tryingResp))

	// Extract new streams from SDP
	streams := sipMsg.ExtractAllMediaStreams()
	if len(streams) == 0 {
		parts := sipMsg.ParseMultipartBody()
		for _, part := range parts {
			if part.ContentType == "application/sdp" {
				sdpMsg := &sip.SIPMessage{Body: part.Body}
				streams = sdpMsg.ExtractAllMediaStreams()
				break
			}
		}
	}

	sess, _ := s.sessions.Get(callID)

	if len(streams) == 0 || sess == nil {
		// If no streams or no session, just ACK with existing SDP
		resp := s.formatSIPResponse(200, "OK",
			sipMsg.GetHeader("via"), sipMsg.GetFrom(), sipMsg.GetTo(),
			callID, sipMsg.GetCSeq())
		conn.Write([]byte(resp))
		return
	}

	// If stream count changed, reallocate ports
	if len(streams) != len(sess.Ports) {
		// Release old ports
		for _, port := range sess.Ports {
			s.portPool.Release(port)
		}

		// Allocate new ports
		newPorts := make([]int, 0, len(streams))
		for range streams {
			port, err := s.portPool.Allocate(callID)
			if err != nil {
				log.Printf("[SIPREC] re-INVITE port allocation failed — CallID=%s: %v", callID, err)
				resp := s.formatSIPResponse(503, "Service Unavailable",
					sipMsg.GetHeader("via"), sipMsg.GetFrom(), sipMsg.GetTo(),
					callID, sipMsg.GetCSeq())
				conn.Write([]byte(resp))
				return
			}
			newPorts = append(newPorts, port)
		}
		s.sessions.UpdatePorts(callID, newPorts)
		sess.Ports = newPorts
	}

	// Forward to pipeline
	srcIP := extractIPFromAddr(conn.RemoteAddr().String())
	packet := ToHEPPacket(rawMsg, srcIP, s.localIP, 5060, uint16(s.port), timeutil.Now())
	hep.HandleSIPPayload(packet)

	// Send 200 OK with updated SDP
	sdpAnswer := s.buildSDP200OK(streams, sess.Ports)
	response := s.formatSIP200OKWithSDP(
		sipMsg.GetHeader("via"), sipMsg.GetFrom(), sipMsg.GetTo(),
		callID, sipMsg.GetCSeq(), sdpAnswer)
	conn.Write([]byte(response))

	log.Printf("[SIPREC] re-INVITE 200 OK sent — CallID=%s Ports=%v", callID, sess.Ports)
}

// #5: handleSIPRECBye processes a BYE request — releases ports and cleans up.
func (s *SIPTCPServer) handleSIPRECBye(sipMsg *sip.SIPMessage, rawMsg []byte, conn net.Conn) {
	callID := sipMsg.GetCallID()
	log.Printf("[SIPREC] BYE received — CallID=%s", callID)

	// Forward to shared pipeline
	srcIP := extractIPFromAddr(conn.RemoteAddr().String())
	packet := ToHEPPacket(rawMsg, srcIP, s.localIP, 5060, uint16(s.port), timeutil.Now())
	hep.HandleSIPPayload(packet)

	// Release all ports allocated to this call
	released := s.portPool.ReleaseByCallID(callID)
	log.Printf("[SIPREC] Released %d RTP ports — CallID=%s", released, callID)

	// Clean up recording control state
	rtp.GetRecordingControl().Cleanup(callID)

	// Remove session
	s.sessions.Delete(callID)

	// Send 200 OK
	resp := s.formatSIPResponse(200, "OK",
		sipMsg.GetHeader("via"), sipMsg.GetFrom(), sipMsg.GetTo(),
		callID, sipMsg.GetCSeq())
	conn.Write([]byte(resp))

	log.Printf("[SIPREC] BYE 200 OK sent — CallID=%s ActiveSessions=%d", callID, s.sessions.ActiveCount())
}

// buildSDP200OK generates an SDP Answer with local RTP ports.
func (s *SIPTCPServer) buildSDP200OK(offerStreams []sip.MediaStream, localPorts []int) string {
	var sb strings.Builder
	sb.WriteString("v=0\r\n")
	sb.WriteString(fmt.Sprintf("o=CXMind-IE 0 0 IN IP4 %s\r\n", s.localIP))
	sb.WriteString("s=SIPREC Recording\r\n")
	sb.WriteString(fmt.Sprintf("c=IN IP4 %s\r\n", s.localIP))
	sb.WriteString("t=0 0\r\n")

	for i, port := range localPorts {
		sb.WriteString(fmt.Sprintf("m=audio %d RTP/AVP 0\r\n", port))
		sb.WriteString("a=rtpmap:0 PCMU/8000\r\n")
		sb.WriteString("a=recvonly\r\n")
		if i < len(offerStreams) && offerStreams[i].Label != "" {
			sb.WriteString(fmt.Sprintf("a=label:%s\r\n", offerStreams[i].Label))
		}
	}

	return sb.String()
}

// formatSIPResponse builds a simple SIP response string (no body).
// #6: SBC-compatible format with all mandatory RFC 3261 headers.
func (s *SIPTCPServer) formatSIPResponse(statusCode int, statusText, via, from, to, callID, cseq string) string {
	return fmt.Sprintf("SIP/2.0 %d %s\r\n"+
		"Via: %s\r\n"+
		"From: %s\r\n"+
		"To: %s\r\n"+
		"Call-ID: %s\r\n"+
		"CSeq: %s\r\n"+
		"Content-Length: 0\r\n"+
		"\r\n",
		statusCode, statusText,
		via, from, to, callID, cseq,
	)
}

// formatSIP200OKWithSDP builds a 200 OK response with SDP body.
// #6: SBC-compatible format with Contact, Content-Type, To-tag.
func (s *SIPTCPServer) formatSIP200OKWithSDP(via, from, to, callID, cseq, sdpBody string) string {
	return fmt.Sprintf("SIP/2.0 200 OK\r\n"+
		"Via: %s\r\n"+
		"From: %s\r\n"+
		"To: %s;tag=%s\r\n"+
		"Call-ID: %s\r\n"+
		"CSeq: %s\r\n"+
		"Contact: <sip:%s:%d;transport=tcp>\r\n"+
		"Content-Type: application/sdp\r\n"+
		"Content-Length: %d\r\n"+
		"\r\n"+
		"%s",
		via, from, to, generateTag(),
		callID, cseq,
		s.localIP, s.port,
		len(sdpBody),
		sdpBody,
	)
}

// generateTag generates a cryptographically random SIP tag.
// R-8: Replaced time-based tag to prevent collisions under high call rate.
func generateTag() string {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		// Fallback to time-based if crypto/rand fails (extremely unlikely)
		return fmt.Sprintf("ie-%d", time.Now().UnixNano()%1000000)
	}
	return fmt.Sprintf("ie-%x", b)
}

// extractIPFromAddr extracts the IP from a "host:port" string.
func extractIPFromAddr(addr string) string {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return addr
	}
	return host
}
