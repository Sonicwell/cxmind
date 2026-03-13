package simulator

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"net"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/google/gopacket/pcapgo"
)

// Config holds the configuration for generating simulated calls.
type Config struct {
	Host            string
	Port            int
	Count           int
	Scenario        string // answer, reject, cancel, busy
	Direction       string // inbound, outbound
	Duration        int    // Call duration in sec
	Mode            string // hep, pcap, siprec
	Transport       string // udp, tcp
	OutputFile      string // Output PCAP filename
	AuthKey         string
	UseSRTP         bool
	PerfectQual     bool
	AgentIP         string
	CustomerIP      string
	UpstreamFile    string
	DownstreamFile  string
	UpstreamAudio   []byte
	DownstreamAudio []byte
}

func DefaultConfig() Config {
	return Config{
		Host:       "127.0.0.1",
		Port:       9060,
		Count:      1,
		Scenario:   "answer",
		Direction:  "inbound",
		Duration:   5,
		Mode:       "hep",
		Transport:  "udp",
		OutputFile: "output.pcap",
		AgentIP:    "1.1.1.1:5060",
		CustomerIP: "8.8.8.8:5060",
	}
}

// Client is the simulator client used to inject test calls.
type Client struct {
	config     Config
	pcapWriter *pcapgo.Writer
	pcapFile   *os.File
	pcapMutex  sync.Mutex

	hepConn  net.Conn
	hepMutex sync.Mutex
}

// NewClient initializes a new simulator client based on the given config.
func NewClient(cfg Config) (*Client, error) {
	if cfg.UpstreamFile != "" && len(cfg.UpstreamAudio) == 0 {
		buf, err := LoadAudio(cfg.UpstreamFile)
		if err != nil {
			return nil, fmt.Errorf("failed to load upstream audio: %w", err)
		}
		cfg.UpstreamAudio = buf
	}
	if cfg.DownstreamFile != "" && len(cfg.DownstreamAudio) == 0 {
		buf, err := LoadAudio(cfg.DownstreamFile)
		if err != nil {
			return nil, fmt.Errorf("failed to load downstream audio: %w", err)
		}
		cfg.DownstreamAudio = buf
	}

	c := &Client{
		config: cfg,
	}

	if cfg.Mode == "pcap" {
		f, err := os.Create(cfg.OutputFile)
		if err != nil {
			return nil, fmt.Errorf("failed to create pcap file: %w", err)
		}
		c.pcapFile = f
		c.pcapWriter = pcapgo.NewWriter(f)
		c.pcapWriter.WriteFileHeader(65536, layers.LinkTypeEthernet)
	} else {
		// hep mode
		addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
		var err error
		if cfg.Transport == "tcp" {
			c.hepConn, err = net.Dial("tcp", addr)
		} else {
			c.hepConn, err = net.Dial("udp", addr)
		}
		if err != nil {
			return nil, fmt.Errorf("failed to connect to HEP server: %w", err)
		}
	}

	return c, nil
}

func (c *Client) Close() {
	if c.pcapFile != nil {
		c.pcapFile.Close()
	}
	if c.hepConn != nil {
		c.hepConn.Close()
	}
}

// GenerateCallID created a random realistic realistic looking Call-ID.
func (c *Client) GenerateCallID() string {
	b := make([]byte, 6)
	rand.Read(b)
	return fmt.Sprintf("sim-%d-%s@simulator", time.Now().UnixNano(), hex.EncodeToString(b))
}

// sendPacket implements the common dispatch logic for HEP or direct PCAP.
func (c *Client) sendPacket(payload []byte, srcIP, dstIP string, protoType uint8, srcPort, dstPort uint16, callID string) {
	c.sendPacketWithTime(payload, srcIP, dstIP, protoType, srcPort, dstPort, time.Now(), callID)
}

// sendPacketWithTime allows callers to specify a custom timestamp (e.g. pcap original timestamp for replay)
func (c *Client) sendPacketWithTime(payload []byte, srcIP, dstIP string, protoType uint8, srcPort, dstPort uint16, ts time.Time, callID string) {
	srcParsed := net.ParseIP(strings.Split(srcIP, ":")[0])
	dstParsed := net.ParseIP(strings.Split(dstIP, ":")[0])
	if srcParsed == nil {
		srcParsed = net.IPv4(1, 1, 1, 1)
	}
	if dstParsed == nil {
		dstParsed = net.IPv4(8, 8, 8, 8)
	}

	if c.hepConn != nil {
		hepBytes := EncodeHEP3(payload, srcParsed, dstParsed, srcPort, dstPort, ts, protoType, c.config.AuthKey, callID)
		c.hepMutex.Lock()
		c.hepConn.Write(hepBytes)
		c.hepMutex.Unlock()
	} else if c.config.Mode == "pcap" {
		eth := &layers.Ethernet{
			SrcMAC:       net.HardwareAddr{0x00, 0x00, 0x00, 0x00, 0x00, 0x01},
			DstMAC:       net.HardwareAddr{0x00, 0x00, 0x00, 0x00, 0x00, 0x02},
			EthernetType: layers.EthernetTypeIPv4,
		}
		ip4 := &layers.IPv4{
			SrcIP:    srcParsed,
			DstIP:    dstParsed,
			Version:  4,
			TTL:      64,
			Protocol: layers.IPProtocolUDP,
		}
		udp := &layers.UDP{
			SrcPort: layers.UDPPort(srcPort),
			DstPort: layers.UDPPort(dstPort),
		}
		udp.SetNetworkLayerForChecksum(ip4)

		buf := gopacket.NewSerializeBuffer()
		opts := gopacket.SerializeOptions{
			FixLengths:       true,
			ComputeChecksums: true,
		}
		gopacket.SerializeLayers(buf, opts, eth, ip4, udp, gopacket.Payload(payload))

		packetBytes := buf.Bytes()
		if c.pcapWriter != nil {
			c.pcapMutex.Lock()
			c.pcapWriter.WritePacket(gopacket.CaptureInfo{
				Timestamp:     ts,
				CaptureLength: len(packetBytes),
				Length:        len(packetBytes),
			}, packetBytes)
			c.pcapMutex.Unlock()
		}
	}
}

// logger for simulator
func (c *Client) logf(format string, args ...any) {
	log.Printf("[Simulator] "+format, args...)
}
