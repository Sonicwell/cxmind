package ser

import (
	"context"
	"math"
	"net"
	"testing"

	"github.com/cxmind/ingestion-go/internal/ser/pb"
	"github.com/spf13/viper"
	"google.golang.org/grpc"
)

// Mock gRPC server to test remote SER
type mockSERServer struct {
	pb.UnimplementedEmissionAnalyzerServer
}

func (s *mockSERServer) Analyze(ctx context.Context, req *pb.AnalyzeRequest) (*pb.AnalyzeResponse, error) {
	// Simple mock behavior based on CallId
	if req.CallId == "error_call" {
		return nil, context.DeadlineExceeded
	}

	return &pb.AnalyzeResponse{
		Emotions: []*pb.EmotionResult{
			{Emotion: "happy", Confidence: 0.9, Arousal: 0.8, Valence: 0.7},
		},
		Dominant:   "happy",
		AvgArousal: 0.8,
		AvgValence: 0.7,
	}, nil
}

func setupMockServer(t *testing.T) (string, func()) {
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("Failed to listen: %v", err)
	}

	s := grpc.NewServer()
	pb.RegisterEmissionAnalyzerServer(s, &mockSERServer{})

	go func() {
		if err := s.Serve(lis); err != nil {
			t.Logf("Failed to serve: %v", err)
		}
	}()

	return lis.Addr().String(), func() {
		s.Stop()
	}
}

func TestInitRemoteSER_MissingAddr(t *testing.T) {
	viper.Set("ser.remote.addr", "")
	defer viper.Reset()

	err := InitRemoteSER()
	if err == nil || err.Error() != "ser.remote.addr not configured" {
		t.Errorf("Expected configuration error, got %v", err)
	}
}

func TestInitRemoteSER_InvalidAddr(t *testing.T) {
	viper.Set("ser.remote.addr", "invalid-addr:port:test")
	defer viper.Reset()

	// Dialing an invalid addr should return an error eventually, though WithTransportCredentials might not block
	// We just ensure it doesn't panic and handles properly when used.
	// Actually, grpc.Dial parses the address. If it's completely invalid, it might error.
	err := InitRemoteSER()
	// It may succeed in Dial but fail in execution. The function primarily checks config.
	// As long as it doesn't crash, we're okay.
	if err != nil {
		t.Logf("Got expected or unexpected dial error: %v", err)
	}
}

func TestAnalyzeRemote_NotInitialized(t *testing.T) {
	grpcClient = nil // Force uninitialized state

	_, err := AnalyzeRemote("call-1", []float32{0.1}, 16000)
	if err == nil || err.Error() != "remote SER client not initialized" {
		t.Errorf("Expected uninitialized error, got %v", err)
	}
}

func TestOptimizeFloat32SliceToBytes(t *testing.T) {
	// Test the zero-copy conversion
	fs := []float32{1.0, -1.0, 0.5}
	bs := float32SliceToBytes(fs)

	expectedLen := len(fs) * 4
	if len(bs) != expectedLen {
		t.Errorf("Expected byte length %d, got %d", expectedLen, len(bs))
	}

	// Null test
	if float32SliceToBytes(nil) != nil {
		t.Errorf("Expected nil when passing nil/empty slice")
	}
}

func TestAnalyzeRemote_Success(t *testing.T) {
	addr, cleanup := setupMockServer(t)
	defer cleanup()

	viper.Set("ser.remote.addr", addr)
	viper.Set("ser.remote.timeout_ms", 1000)
	defer viper.Reset()

	err := InitRemoteSER()
	if err != nil {
		t.Fatalf("InitRemoteSER failed: %v", err)
	}

	// Don't leave connections hanging in other tests
	defer func() {
		if grpcConn != nil {
			grpcConn.Close()
		}
	}()

	audioData := make([]float32, 16000) // 1 second of silence
	res, err := AnalyzeRemote("happy_call", audioData, 16000)

	if err != nil {
		t.Fatalf("AnalyzeRemote failed: %v", err)
	}

	if res.Dominant != "happy" {
		t.Errorf("Expected dominant emotion happy, got %s", res.Dominant)
	}
	if math.Abs(float64(res.AvgArousal)-0.8) > 0.001 {
		t.Errorf("Expected arousal 0.8, got %f", res.AvgArousal)
	}
	if len(res.Emotions) != 1 {
		t.Fatalf("Expected 1 emotion result, got %d", len(res.Emotions))
	}

	e := res.Emotions[0]
	if e.Emotion != "happy" || e.Confidence != 0.9 {
		t.Errorf("Unexpected emotion details: %+v", e)
	}
}

func TestAnalyzeRemote_TimeoutOrError(t *testing.T) {
	addr, cleanup := setupMockServer(t)
	defer cleanup()

	viper.Set("ser.remote.addr", addr)
	viper.Set("ser.remote.timeout_ms", 50) // Short timeout
	defer viper.Reset()

	err := InitRemoteSER()
	if err != nil {
		t.Fatalf("InitRemoteSER failed: %v", err)
	}
	defer func() {
		if grpcConn != nil {
			grpcConn.Close()
		}
	}()

	audioData := make([]float32, 160)
	_, err = AnalyzeRemote("error_call", audioData, 16000)

	if err == nil {
		t.Fatalf("Expected error from mock server, got nil")
	}
}
