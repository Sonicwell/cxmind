package simulator

import (
	cryptoRand "crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"math/rand"
	"strings"
	"sync"
	"time"

	"github.com/pion/rtp"
	"github.com/pion/srtp/v2"
)

type sysUser struct {
	Name string
	URI  string
	IP   string
}

func parseUserString(input string) sysUser {
	u := sysUser{URI: input, IP: input}
	if start := strings.Index(input, "<sip:"); start != -1 {
		end := strings.Index(input, ">")
		if end > start {
			u.URI = input[start+1 : end]
			if start > 0 {
				u.Name = strings.TrimSpace(strings.ReplaceAll(input[:start], "\"", ""))
			}
		}
	} else {
		u.URI = "sip:" + input
	}
	parts := strings.Split(u.URI, "@")
	if len(parts) > 1 {
		domain := parts[1]
		ipParts := strings.Split(domain, ":")
		u.IP = ipParts[0]
	}
	return u
}

func randomString(n int) string {
	b := make([]byte, n)
	cryptoRand.Read(b)
	return hex.EncodeToString(b)[:n]
}

func generateSIPPacketWithCT(method, callID, from, to, cseqStr, body, cseqMethod, contentType string) []byte {
	fromInfo := parseUserString(from)
	toInfo := parseUserString(to)

	fromTag := ";tag=" + randomString(9)
	toTag := ""
	if method != "INVITE" && !strings.HasPrefix(method, "1") {
		toTag = ";tag=" + randomString(9)
	}

	fromHeader := fmt.Sprintf("<%s>", fromInfo.URI)
	if fromInfo.Name != "" {
		fromHeader = fmt.Sprintf("\"%s\" <%s>", fromInfo.Name, fromInfo.URI)
	}
	toHeader := fmt.Sprintf("<%s>", toInfo.URI)
	if toInfo.Name != "" {
		toHeader = fmt.Sprintf("\"%s\" <%s>", toInfo.Name, toInfo.URI)
	}

	var firstLine string
	if method == "INVITE" || method == "BYE" || method == "ACK" || method == "CANCEL" {
		firstLine = fmt.Sprintf("%s %s SIP/2.0", method, toInfo.URI)
	} else {
		status := "OK"
		if method == "486" {
			status = "Busy Here"
		} else if method == "180" {
			status = "Ringing"
		} else if method == "487" {
			status = "Request Terminated"
		}
		firstLine = fmt.Sprintf("SIP/2.0 %s %s", method, status)
	}

	if cseqMethod == "" {
		if method == "INVITE" || method == "BYE" || method == "ACK" || method == "CANCEL" {
			cseqMethod = method
		} else {
			cseqMethod = "INVITE"
		}
	}

	branch := "z9hG4bK" + randomString(9)
	headers := fmt.Sprintf("%s\r\nVia: SIP/2.0/UDP %s;branch=%s\r\nFrom: %s%s\r\nTo: %s%s\r\nCall-ID: %s\r\nCSeq: %s %s\r\nContact: <%s>\r\nMax-Forwards: 70\r\nUser-Agent: Go-PCAP-Simulator/2.0\r\n",
		firstLine, fromInfo.IP, branch, fromHeader, fromTag, toHeader, toTag, callID, cseqStr, cseqMethod, fromInfo.URI)

	if len(body) > 0 {
		if contentType == "" {
			contentType = "application/sdp"
		}
		headers += fmt.Sprintf("Content-Type: %s\r\n", contentType)
	}
	headers += fmt.Sprintf("Content-Length: %d\r\n\r\n", len(body))

	return []byte(headers + body)
}

func generateSIPPacket(method, callID, from, to, cseqStr, body, cseqMethod string) []byte {
	return generateSIPPacketWithCT(method, callID, from, to, cseqStr, body, cseqMethod, "")
}

// RunSingleCall coordinates SIP and media for a single call flow using the client's config.
func (c *Client) RunSingleCall(callID string) error {
	c.logf("Starting %s (%s) - ID: %s\n", c.config.Scenario, c.config.Direction, callID)

	var src, dst, srcUser, dstUser, srcName, dstName string
	if c.config.Direction == "inbound" {
		src = c.config.CustomerIP
		srcUser = "1001"
		srcName = "Alice"
		dst = c.config.AgentIP
		dstUser = "1002"
		dstName = "Bob"
	} else {
		src = c.config.AgentIP
		srcUser = "1002"
		srcName = "Bob"
		dst = c.config.CustomerIP
		dstUser = "1001"
		dstName = "Alice"
	}
	srcURI := fmt.Sprintf("\"%s\" <sip:%s@%s>", srcName, srcUser, src)
	dstURI := fmt.Sprintf("\"%s\" <sip:%s@%s>", dstName, dstUser, dst)
	srcIPOnly := strings.Split(src, ":")[0]
	dstIPOnly := strings.Split(dst, ":")[0]

	var srtpCtxUp, srtpCtxDown *srtp.Context
	cryptoLine := ""
	if c.config.UseSRTP {
		masterKey := make([]byte, 16)
		masterSalt := make([]byte, 14)
		cryptoRand.Read(masterKey)
		cryptoRand.Read(masterSalt)

		var err error
		srtpCtxUp, err = srtp.CreateContext(masterKey, masterSalt, srtp.ProtectionProfileAes128CmHmacSha1_80)
		srtpCtxDown, err = srtp.CreateContext(masterKey, masterSalt, srtp.ProtectionProfileAes128CmHmacSha1_80)
		if err != nil {
			return fmt.Errorf("failed to create SRTP contexts: %v", err)
		}

		keySaltBase64 := base64.StdEncoding.EncodeToString(append(masterKey, masterSalt...))
		cryptoLine = fmt.Sprintf("a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:%s\r\n", keySaltBase64)
	}

	sdp := fmt.Sprintf("v=0\r\no=user 123 123 IN IP4 %s\r\ns=Talk\r\nc=IN IP4 %s\r\nt=0 0\r\nm=audio 7078 RTP/AVP 0\r\na=rtpmap:0 PCMU/8000\r\n%s", srcIPOnly, srcIPOnly, cryptoLine)

	var finalBody = sdp
	var contentType = "application/sdp"
	if c.config.Mode == "siprec" {
		boundary := "siprec-boundary-" + randomString(6)
		contentType = "multipart/mixed;boundary=" + boundary

		xmlData := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<recording xmlns="urn:ietf:params:xml:ns:recording:1">
  <datamode>complete</datamode>
  <session session_id="%s"/>
</recording>`, randomString(12))

		finalBody = fmt.Sprintf("--%s\r\nContent-Type: application/sdp\r\n\r\n%s\r\n--%s\r\nContent-Type: application/rs-metadata+xml\r\nContent-Disposition: recording-session\r\n\r\n%s\r\n--%s--", boundary, sdp, boundary, xmlData, boundary)
	}

	// 1. INVITE
	c.sendPacket(generateSIPPacketWithCT("INVITE", callID, srcURI, dstURI, "1", finalBody, "", contentType), src, dst, 1, 5060, 5060, callID)

	if c.config.Scenario == "reject" {
		time.Sleep(200 * time.Millisecond)
		c.sendPacket(generateSIPPacket("486", callID, dstURI, srcURI, "1", "", "INVITE"), dst, src, 1, 5060, 5060, callID)
		time.Sleep(100 * time.Millisecond)
		c.sendPacket(generateSIPPacket("ACK", callID, srcURI, dstURI, "1", "", ""), src, dst, 1, 5060, 5060, callID)
	} else if c.config.Scenario == "cancel" {
		time.Sleep(200 * time.Millisecond)
		c.sendPacket(generateSIPPacket("180", callID, dstURI, srcURI, "1", "", "INVITE"), dst, src, 1, 5060, 5060, callID)
		time.Sleep(1 * time.Second)
		c.sendPacket(generateSIPPacket("CANCEL", callID, srcURI, dstURI, "1", "", ""), src, dst, 1, 5060, 5060, callID)
		c.sendPacket(generateSIPPacket("200", callID, dstURI, srcURI, "1", "", "CANCEL"), dst, src, 1, 5060, 5060, callID)
		c.sendPacket(generateSIPPacket("487", callID, dstURI, srcURI, "1", "", "INVITE"), dst, src, 1, 5060, 5060, callID)
		c.sendPacket(generateSIPPacket("ACK", callID, srcURI, dstURI, "1", "", ""), src, dst, 1, 5060, 5060, callID)
	} else {
		// default answer
		time.Sleep(200 * time.Millisecond)
		c.sendPacket(generateSIPPacket("180", callID, dstURI, srcURI, "1", "", "INVITE"), dst, src, 1, 5060, 5060, callID)
		time.Sleep(200 * time.Millisecond)
		sdpAns := fmt.Sprintf("v=0\r\no=user 123 123 IN IP4 %s\r\ns=Talk\r\nc=IN IP4 %s\r\nt=0 0\r\nm=audio 9078 RTP/AVP 0\r\na=rtpmap:0 PCMU/8000\r\n%s", dstIPOnly, dstIPOnly, cryptoLine)
		c.sendPacket(generateSIPPacket("200", callID, dstURI, srcURI, "1", sdpAns, "INVITE"), dst, src, 1, 5060, 5060, callID)
		time.Sleep(100 * time.Millisecond)
		c.sendPacket(generateSIPPacket("ACK", callID, srcURI, dstURI, "1", "", ""), src, dst, 1, 5060, 5060, callID)

		// Create a stop channel for media
		stopMedia := make(chan bool)
		var mediaWg sync.WaitGroup
		mediaWg.Add(2)

		go c.streamMedia(stopMedia, srcIPOnly, dstIPOnly, 7078, 9078, callID, &mediaWg, c.config.UpstreamAudio, srtpCtxUp)
		go c.streamMedia(stopMedia, dstIPOnly, srcIPOnly, 9078, 7078, callID, &mediaWg, c.config.DownstreamAudio, srtpCtxDown)

		// Wait duration
		d := time.Duration(c.config.Duration) * time.Second
		if c.config.Mode == "pcap" {
			// Write fast in pcap mode
			d = 100 * time.Millisecond
		}
		time.Sleep(d)
		close(stopMedia)
		mediaWg.Wait() // wait for rtp routines to finish to avoid bleeding

		// BYE
		c.sendPacket(generateSIPPacket("BYE", callID, srcURI, dstURI, "2", "", ""), src, dst, 1, 5060, 5060, callID)
		time.Sleep(10 * time.Millisecond)
		c.sendPacket(generateSIPPacket("200", callID, dstURI, srcURI, "2", "", "BYE"), dst, src, 1, 5060, 5060, callID)
	}
	return nil
}

func (c *Client) streamMedia(stop chan bool, srcIP, dstIP string, srcPort, dstPort uint16, callID string, wg *sync.WaitGroup, audioBuf []byte, srtpCtx *srtp.Context) {
	defer wg.Done()
	seq := uint16(rand.Intn(65535))
	ts := rand.Uint32()
	ssrc := uint32(srcPort)
	packetCount := 0
	offset := 0

	ticker := time.NewTicker(20 * time.Millisecond)
	if c.config.Mode == "pcap" {
		ticker = time.NewTicker(1 * time.Microsecond)
	}
	defer ticker.Stop()

	rtcpTicker := time.NewTicker(1 * time.Second)
	if c.config.Mode == "pcap" {
		rtcpTicker = time.NewTicker(1 * time.Millisecond)
	}
	defer rtcpTicker.Stop()

	rtpBuf := make([]byte, 12+160)

	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			// RTP packet (silence)
			rtpBuf[0] = 0x80
			if packetCount == 0 {
				rtpBuf[1] = 0x80 // marker bit
			} else {
				rtpBuf[1] = 0x00 // pcmu
			}
			binary.BigEndian.PutUint16(rtpBuf[2:4], seq)
			binary.BigEndian.PutUint32(rtpBuf[4:8], ts)
			binary.BigEndian.PutUint32(rtpBuf[8:12], ssrc)

			if len(audioBuf) > 0 {
				if offset+160 > len(audioBuf) {
					offset = 0 // loop
				}
				if offset+160 <= len(audioBuf) {
					copy(rtpBuf[12:172], audioBuf[offset:offset+160])
				} else {
					for i := 12; i < 172; i++ {
						rtpBuf[i] = 0xFF
					}
				}
				offset += 160
			} else {
				for i := 12; i < 172; i++ {
					rtpBuf[i] = 0xFF // PCMU silence
				}
			}

			if srtpCtx != nil {
				pkt := &rtp.Packet{}
				if err := pkt.Unmarshal(rtpBuf[:172]); err == nil {
					if encrypted, err := srtpCtx.EncryptRTP(nil, pkt.Payload, &pkt.Header); err == nil {
						c.sendPacket(encrypted, srcIP, dstIP, 34, srcPort, dstPort, callID)
						goto skipPlain
					}
				}
			}
			c.sendPacket(rtpBuf, srcIP, dstIP, 34, srcPort, dstPort, callID)
		skipPlain:

			seq++
			ts += 160
			packetCount++
		case <-rtcpTicker.C:
			// Sent simple RTCP Sender Report (28 bytes)
			rtcp := make([]byte, 28)
			rtcp[0] = 0x80
			rtcp[1] = 200 // SR
			binary.BigEndian.PutUint16(rtcp[2:4], 6)
			binary.BigEndian.PutUint32(rtcp[4:8], ssrc)
			binary.BigEndian.PutUint32(rtcp[16:20], ts)
			binary.BigEndian.PutUint32(rtcp[20:24], uint32(packetCount))
			binary.BigEndian.PutUint32(rtcp[24:28], uint32(packetCount*160))

			// SDES packet
			cname := fmt.Sprintf("user-%d@%s", ssrc, srcIP)
			cnameLen := len(cname)
			contentSize := 4 + 2 + cnameLen + 1
			padSize := (4 - (contentSize % 4)) % 4
			chunkLen := contentSize + padSize
			sdesWordLen := (4+chunkLen)/4 - 1

			sdesBuf := make([]byte, 4+chunkLen)
			sdesBuf[0] = 0x81
			sdesBuf[1] = 202 // SDES
			binary.BigEndian.PutUint16(sdesBuf[2:4], uint16(sdesWordLen))
			binary.BigEndian.PutUint32(sdesBuf[4:8], ssrc)
			sdesBuf[8] = 0x01
			sdesBuf[9] = byte(cnameLen)
			copy(sdesBuf[10:], []byte(cname))

			srSdes := append(rtcp, sdesBuf...)
			c.sendPacket(srSdes, srcIP, dstIP, 5, srcPort+1, dstPort+1, callID)

			// Receiver Report (RR)
			rrBuf := make([]byte, 32)
			rrBuf[0] = 0x81 // V=2, P=0, RC=1 (1 block)
			rrBuf[1] = 201  // RR
			binary.BigEndian.PutUint16(rrBuf[2:4], 7)
			binary.BigEndian.PutUint32(rrBuf[4:8], ssrc)
			binary.BigEndian.PutUint32(rrBuf[8:12], uint32(dstPort))

			fractionLost := uint8(0)
			jitter := uint32(0)
			if !c.config.PerfectQual {
				fractionLost = uint8(rand.Intn(10))
				jitter = uint32(rand.Intn(30) * 8)
			}
			rrBuf[12] = fractionLost

			cumulativeLost := uint32(packetCount) * uint32(fractionLost) / 256
			rrBuf[13] = byte(cumulativeLost >> 16)
			rrBuf[14] = byte(cumulativeLost >> 8)
			rrBuf[15] = byte(cumulativeLost)

			binary.BigEndian.PutUint32(rrBuf[16:20], uint32(seq))
			binary.BigEndian.PutUint32(rrBuf[20:24], jitter)

			rrSdes := append(rrBuf, sdesBuf...)
			c.sendPacket(rrSdes, srcIP, dstIP, 5, srcPort+1, dstPort+1, callID)
		}
	}
}
