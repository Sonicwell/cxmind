package rtp

import (
	"log"

	"github.com/pion/rtp"
	"github.com/pion/srtp/v2"
)

// decryptAndParseRTP handles SRTP decryption and RTP header parsing.
// Returns:
//   - rtpBody:      the audio payload (after RTP header); empty if too short or decrypt fails
//   - pcapPayload:  the packet data to write to PCAP (decrypted if SRTP, original otherwise)
//   - payloadType:  RTP Payload Type field (0=PCMU, 8=PCMA, 9=G722, dynamic 96-127 for Opus…)
//
// Used by both captureLoop (physical sniffing) and InjectRTP (HEP injection).
func decryptAndParseRTP(payload []byte, srtpCtx *srtp.Context) (rtpBody []byte, pcapPayload []byte, payloadType uint8) {
	pcapPayload = payload

	if srtpCtx != nil {
		decrypted, err := srtpCtx.DecryptRTP(nil, payload, nil)
		if err != nil {
			log.Printf("[ERROR] SRTP decryption failed: %v", err)
			return nil, pcapPayload, 0
		}
		pcapPayload = decrypted

		// Parse RTP header to find payload offset and codec
		header := &rtp.Header{}
		if _, err := header.Unmarshal(decrypted); err == nil {
			offset := header.MarshalSize()
			if offset < len(decrypted) {
				rtpBody = decrypted[offset:]
			}
			payloadType = header.PayloadType
		}
	} else {
		// Non-SRTP: parse RTP header properly (handles CSRC, extensions, padding).
		// Previously skipped a fixed 12 bytes, which was incorrect for packets with
		// CSRC entries (+4 bytes each) or header extensions (variable length).
		header := &rtp.Header{}
		if _, err := header.Unmarshal(payload); err == nil {
			offset := header.MarshalSize()
			if offset < len(payload) {
				rtpBody = payload[offset:]
			}
			payloadType = header.PayloadType
		}
	}

	return rtpBody, pcapPayload, payloadType
}

// extractRTPTimestamp reads the 32-bit RTP timestamp from a raw RTP packet.
// Bytes 4–7 of the RTP header carry the timestamp in network byte order.
// Returns 0 if the packet is too short (< 8 bytes).
// This is used to preserve timing metadata in JBPacket for future
// codecs (G.722, Opus) that require accurate frame-duration negotiation.
func extractRTPTimestamp(packet []byte) uint32 {
	if len(packet) < 8 {
		return 0
	}
	return uint32(packet[4])<<24 | uint32(packet[5])<<16 | uint32(packet[6])<<8 | uint32(packet[7])
}
