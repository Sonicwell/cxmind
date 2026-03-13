package rtp

import (
	"crypto/rand"
	"encoding/base64"
	"testing"

	"github.com/pion/rtp"
	"github.com/pion/srtp/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestExtractRTPPayload tests extracting payload from RTP packet
func TestExtractRTPPayload(t *testing.T) {
	tests := []struct {
		name          string
		packet        []byte
		expectedLen   int
		shouldSucceed bool
	}{
		{
			name: "Valid RTP packet with 160-byte payload",
			packet: func() []byte {
				header := rtp.Header{
					Version:        2,
					Padding:        false,
					Extension:      false,
					Marker:         false,
					PayloadType:    0, // PCMU
					SequenceNumber: 1,
					Timestamp:      160,
					SSRC:           12345,
				}
				headerBytes, _ := header.Marshal()
				payload := make([]byte, 160)
				for i := range payload {
					payload[i] = 0xFF // G.711 μ-law silence
				}
				return append(headerBytes, payload...)
			}(),
			expectedLen:   160,
			shouldSucceed: true,
		},
		{
			name:          "Packet too short",
			packet:        []byte{0x80, 0x00},
			expectedLen:   0,
			shouldSucceed: false,
		},
		{
			name: "Empty payload",
			packet: func() []byte {
				header := rtp.Header{
					Version:        2,
					PayloadType:    0,
					SequenceNumber: 1,
					Timestamp:      160,
					SSRC:           12345,
				}
				headerBytes, _ := header.Marshal()
				return headerBytes
			}(),
			expectedLen:   0,
			shouldSucceed: true, // Valid packet, just no payload
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			header := &rtp.Header{}
			_, err := header.Unmarshal(tt.packet)

			if !tt.shouldSucceed {
				assert.Error(t, err)
				return
			}

			require.NoError(t, err)
			offset := header.MarshalSize()

			if offset < len(tt.packet) {
				payload := tt.packet[offset:]
				assert.Equal(t, tt.expectedLen, len(payload))
			} else {
				assert.Equal(t, tt.expectedLen, 0)
			}
		})
	}
}

// TestSRTPDecryption tests SRTP decryption flow
func TestSRTPDecryption(t *testing.T) {
	// Generate random key and salt
	masterKey := make([]byte, 16)
	masterSalt := make([]byte, 14)
	_, err := rand.Read(masterKey)
	require.NoError(t, err)
	_, err = rand.Read(masterSalt)
	require.NoError(t, err)

	// Create SRTP contexts for encryption and decryption
	encryptContext, err := srtp.CreateContext(masterKey, masterSalt, srtp.ProtectionProfileAes128CmHmacSha1_80)
	require.NoError(t, err)

	decryptContext, err := srtp.CreateContext(masterKey, masterSalt, srtp.ProtectionProfileAes128CmHmacSha1_80)
	require.NoError(t, err)

	// Create RTP packet
	header := rtp.Header{
		Version:        2,
		Padding:        false,
		Extension:      false,
		Marker:         false,
		PayloadType:    0, // PCMU
		SequenceNumber: 1,
		Timestamp:      160,
		SSRC:           12345,
	}

	payload := make([]byte, 160)
	for i := range payload {
		payload[i] = byte(i % 256) // Test pattern
	}

	rtpPacket := &rtp.Packet{
		Header:  header,
		Payload: payload,
	}

	rtpBytes, err := rtpPacket.Marshal()
	require.NoError(t, err)

	t.Run("Encrypt and decrypt RTP packet", func(t *testing.T) {
		// Encrypt
		encrypted, err := encryptContext.EncryptRTP(nil, rtpBytes, nil)
		require.NoError(t, err)
		assert.Greater(t, len(encrypted), len(rtpBytes), "Encrypted packet should be larger (includes auth tag)")

		// Expected size: original RTP + 10 bytes auth tag
		assert.Equal(t, len(rtpBytes)+10, len(encrypted))

		// Decrypt
		decrypted, err := decryptContext.DecryptRTP(nil, encrypted, nil)
		require.NoError(t, err)

		// Verify DecryptRTP returns header + payload (not just payload)
		assert.Equal(t, len(rtpBytes), len(decrypted), "Decrypted should equal original RTP packet size")

		// Verify header is intact
		decryptedHeader := &rtp.Header{}
		_, err = decryptedHeader.Unmarshal(decrypted)
		require.NoError(t, err)
		assert.Equal(t, header.SequenceNumber, decryptedHeader.SequenceNumber)
		assert.Equal(t, header.Timestamp, decryptedHeader.Timestamp)
		assert.Equal(t, header.SSRC, decryptedHeader.SSRC)

		// Verify payload is intact
		offset := decryptedHeader.MarshalSize()
		decryptedPayload := decrypted[offset:]
		assert.Equal(t, payload, decryptedPayload, "Decrypted payload should match original")
	})

	t.Run("Decrypt with wrong key fails", func(t *testing.T) {
		// Create context with different key
		wrongKey := make([]byte, 16)
		wrongSalt := make([]byte, 14)
		_, _ = rand.Read(wrongKey)
		_, _ = rand.Read(wrongSalt)

		wrongContext, err := srtp.CreateContext(wrongKey, wrongSalt, srtp.ProtectionProfileAes128CmHmacSha1_80)
		require.NoError(t, err)

		// Encrypt with original context
		encrypted, err := encryptContext.EncryptRTP(nil, rtpBytes, nil)
		require.NoError(t, err)

		// Try to decrypt with wrong context
		_, err = wrongContext.DecryptRTP(nil, encrypted, nil)
		assert.Error(t, err, "Decryption with wrong key should fail")
	})
}

// TestPCAPPayloadConstruction tests PCAP payload construction for both RTP and SRTP
func TestPCAPPayloadConstruction(t *testing.T) {
	// Create test RTP packet
	header := rtp.Header{
		Version:        2,
		PayloadType:    0,
		SequenceNumber: 100,
		Timestamp:      16000,
		SSRC:           0x1BA6,
	}

	payload := make([]byte, 160)
	for i := range payload {
		payload[i] = 0xFF
	}

	rtpPacket := &rtp.Packet{
		Header:  header,
		Payload: payload,
	}

	rtpBytes, err := rtpPacket.Marshal()
	require.NoError(t, err)

	t.Run("Plain RTP PCAP payload", func(t *testing.T) {
		// For plain RTP, PCAP payload is just the RTP packet
		pcapPayload := rtpBytes

		// Verify we can parse it
		parsedHeader := &rtp.Header{}
		_, err := parsedHeader.Unmarshal(pcapPayload)
		require.NoError(t, err)

		assert.Equal(t, header.SequenceNumber, parsedHeader.SequenceNumber)
		assert.Equal(t, header.SSRC, parsedHeader.SSRC)

		// Verify payload extraction
		offset := parsedHeader.MarshalSize()
		extractedPayload := pcapPayload[offset:]
		assert.Equal(t, payload, extractedPayload)
	})

	t.Run("SRTP PCAP payload", func(t *testing.T) {
		// Setup SRTP
		masterKey := make([]byte, 16)
		masterSalt := make([]byte, 14)
		_, _ = rand.Read(masterKey)
		_, _ = rand.Read(masterSalt)

		encryptCtx, err := srtp.CreateContext(masterKey, masterSalt, srtp.ProtectionProfileAes128CmHmacSha1_80)
		require.NoError(t, err)

		decryptCtx, err := srtp.CreateContext(masterKey, masterSalt, srtp.ProtectionProfileAes128CmHmacSha1_80)
		require.NoError(t, err)

		// Encrypt RTP packet
		encrypted, err := encryptCtx.EncryptRTP(nil, rtpBytes, nil)
		require.NoError(t, err)

		// Decrypt for PCAP (simulating our code)
		decrypted, err := decryptCtx.DecryptRTP(nil, encrypted, nil)
		require.NoError(t, err)

		// PCAP payload should be the decrypted packet (header + payload)
		pcapPayload := decrypted

		// Verify PCAP payload is correct
		parsedHeader := &rtp.Header{}
		_, err = parsedHeader.Unmarshal(pcapPayload)
		require.NoError(t, err)

		assert.Equal(t, header.SequenceNumber, parsedHeader.SequenceNumber)
		assert.Equal(t, header.SSRC, parsedHeader.SSRC)

		// Verify payload extraction
		offset := parsedHeader.MarshalSize()
		extractedPayload := pcapPayload[offset:]
		assert.Equal(t, payload, extractedPayload)

		// Critical: Verify no duplicate headers
		// PCAP payload should be exactly: header (12 bytes) + payload (160 bytes) = 172 bytes
		assert.Equal(t, 172, len(pcapPayload), "PCAP payload should be header + payload, no duplicates")
	})
}

// TestSRTPKeyParsing tests parsing SRTP keys from base64
func TestSRTPKeyParsing(t *testing.T) {
	tests := []struct {
		name        string
		keyBase64   string
		expectError bool
	}{
		{
			name: "Valid 30-byte key+salt",
			keyBase64: func() string {
				key := make([]byte, 16)
				salt := make([]byte, 14)
				_, _ = rand.Read(key)
				_, _ = rand.Read(salt)
				return base64.StdEncoding.EncodeToString(append(key, salt...))
			}(),
			expectError: false,
		},
		{
			name:        "Invalid base64",
			keyBase64:   "not-valid-base64!!!",
			expectError: true,
		},
		{
			name: "Wrong length (too short)",
			keyBase64: func() string {
				short := make([]byte, 20)
				_, _ = rand.Read(short)
				return base64.StdEncoding.EncodeToString(short)
			}(),
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			keySalt, err := base64.StdEncoding.DecodeString(tt.keyBase64)

			if tt.expectError {
				if err == nil {
					// Check length
					assert.NotEqual(t, 30, len(keySalt), "Should have wrong length")
				}
				return
			}

			require.NoError(t, err)
			assert.Equal(t, 30, len(keySalt), "Key+Salt should be 30 bytes (16+14)")

			// Try to create SRTP context
			masterKey := keySalt[:16]
			masterSalt := keySalt[16:]

			_, err = srtp.CreateContext(masterKey, masterSalt, srtp.ProtectionProfileAes128CmHmacSha1_80)
			require.NoError(t, err)
		})
	}
}

// BenchmarkSRTPDecryption benchmarks SRTP decryption performance
func BenchmarkSRTPDecryption(b *testing.B) {
	// Setup
	masterKey := make([]byte, 16)
	masterSalt := make([]byte, 14)
	_, _ = rand.Read(masterKey)
	_, _ = rand.Read(masterSalt)

	encryptCtx, _ := srtp.CreateContext(masterKey, masterSalt, srtp.ProtectionProfileAes128CmHmacSha1_80)

	decryptCtx, _ := srtp.CreateContext(masterKey, masterSalt, srtp.ProtectionProfileAes128CmHmacSha1_80)

	// Create RTP packet
	header := rtp.Header{
		Version:        2,
		PayloadType:    0,
		SequenceNumber: 1,
		Timestamp:      160,
		SSRC:           12345,
	}
	payload := make([]byte, 160)
	rtpPacket := &rtp.Packet{Header: header, Payload: payload}
	rtpBytes, _ := rtpPacket.Marshal()

	// Encrypt once
	encrypted, _ := encryptCtx.EncryptRTP(nil, rtpBytes, nil)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = decryptCtx.DecryptRTP(nil, encrypted, nil)
	}
}
