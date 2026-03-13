package ser

import (
	"github.com/cxmind/ingestion-go/internal/config"

	"context"
	"fmt"
	"time"
	"unsafe"

	"github.com/cxmind/ingestion-go/internal/ser/pb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

var (
	grpcConn   *grpc.ClientConn
	grpcClient pb.EmissionAnalyzerClient
)

// InitRemoteSER connects to the Python SER gRPC server
func InitRemoteSER() error {
	addr := config.Global.GetString("ser.remote.addr")
	if addr == "" {
		return fmt.Errorf("ser.remote.addr not configured")
	}

	conn, err := grpc.Dial(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return fmt.Errorf("failed to dial remote SER at %s: %w", addr, err)
	}

	grpcConn = conn
	grpcClient = pb.NewEmissionAnalyzerClient(conn)
	return nil
}

// float32SliceToBytes provides zero-copy conversion
func float32SliceToBytes(fs []float32) []byte {
	if len(fs) == 0 {
		return nil
	}
	byteLen := len(fs) * 4
	return unsafe.Slice((*byte)(unsafe.Pointer(&fs[0])), byteLen)
}

// AnalyzeRemote sends an AnalyzeRequest to the python server
func AnalyzeRemote(callID string, audioData []float32, sampleRate int) (*AnalysisResult, error) {
	if grpcClient == nil {
		return nil, fmt.Errorf("remote SER client not initialized")
	}

	audioBytes := float32SliceToBytes(audioData)

	timeout := config.Global.GetInt("ser.remote.timeout_ms")
	if timeout <= 0 {
		timeout = 3000
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Millisecond)
	defer cancel()

	req := &pb.AnalyzeRequest{
		CallId:     callID,
		AudioData:  audioBytes,
		SampleRate: int32(sampleRate),
	}

	resp, err := grpcClient.Analyze(ctx, req)
	if err != nil {
		return nil, err
	}

	res := &AnalysisResult{
		Dominant:   resp.Dominant,
		AvgArousal: resp.AvgArousal,
		AvgValence: resp.AvgValence,
	}

	for _, e := range resp.Emotions {
		res.Emotions = append(res.Emotions, EmotionResult{
			Emotion:    e.Emotion,
			Confidence: e.Confidence,
			Arousal:    e.Arousal,
			Valence:    e.Valence,
		})
	}

	return res, nil
}
