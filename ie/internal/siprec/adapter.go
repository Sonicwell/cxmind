package siprec

import (
	"time"

	"github.com/cxmind/ingestion-go/internal/hep"
)

// ToHEPPacket converts a raw SIP message + connection metadata into an HEPPacket
// for processing through the shared HandleSIPPayload pipeline.
// The payload is copied to avoid retaining references to the TCP read buffer.
func ToHEPPacket(sipPayload []byte, srcIP, dstIP string, srcPort, dstPort uint16, timestamp time.Time) *hep.HEPPacket {
	// Copy payload to prevent buffer reuse issues
	payloadCopy := make([]byte, len(sipPayload))
	copy(payloadCopy, sipPayload)

	return &hep.HEPPacket{
		Version:       hep.HEP3_VERSION,
		SrcIP:         srcIP,
		DstIP:         dstIP,
		SrcPort:       srcPort,
		DstPort:       dstPort,
		TimestampSec:  uint32(timestamp.Unix()),
		TimestampUSec: uint32(timestamp.Nanosecond() / 1000),
		ProtocolType:  hep.PROTO_SIP,
		Payload:       payloadCopy,
	}
}
