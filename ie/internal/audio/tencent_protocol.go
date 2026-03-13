package audio

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"net/http"
	"net/url"
	"sort"
	"strings"

	"github.com/cxmind/ingestion-go/internal/timeutil"
	"github.com/google/uuid"
)

// TencentProtocol implements StreamProtocol for Tencent Cloud WS ASR
type TencentProtocol struct {
	appID      string
	secretID   string
	secretKey  string
	engine     string // e.g. "16k_zh"
	sampleRate int
}

func NewTencentProtocol(appID, apiKey, model string, sampleRate int) *TencentProtocol {
	// apiKey is expected to be "SecretId,SecretKey"
	secretID := ""
	secretKey := ""
	parts := strings.SplitN(apiKey, ",", 2)
	if len(parts) == 2 {
		secretID = strings.TrimSpace(parts[0])
		secretKey = strings.TrimSpace(parts[1])
	} else {
		// fallback or let it fail signature
		secretID = apiKey
	}

	if model == "" || model == "auto" {
		model = "16k_zh"
	}

	return &TencentProtocol{
		appID:      appID,
		secretID:   secretID,
		secretKey:  secretKey,
		engine:     model,
		sampleRate: sampleRate,
	}
}

// createSignature generates the Tencent Cloud HMAC-SHA1 signature
func (t *TencentProtocol) createSignature(params map[string]string) string {
	// Sort keys
	var keys []string
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	// Build raw string
	var queryStr string
	for _, k := range keys {
		if queryStr != "" {
			queryStr += "&"
		}
		queryStr += fmt.Sprintf("%s=%s", k, params[k])
	}

	signStr := fmt.Sprintf("GETasr.cloud.tencent.com/asr/v2/%s?%s", t.appID, queryStr)

	// HMAC-SHA1
	mac := hmac.New(sha1.New, []byte(t.secretKey))
	mac.Write([]byte(signStr))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

func (t *TencentProtocol) Endpoint() string {
	// Generate new voice_id for this connection
	voiceID := strings.ReplaceAll(uuid.New().String(), "-", "")
	if len(voiceID) > 16 {
		voiceID = voiceID[:16]
	}

	timestamp := timeutil.Now().Unix()
	expired := timestamp + 86400
	nonce := rand.IntN(100000)

	params := map[string]string{
		"secretid":          t.secretID,
		"timestamp":         fmt.Sprintf("%d", timestamp),
		"expired":           fmt.Sprintf("%d", expired),
		"nonce":             fmt.Sprintf("%d", nonce),
		"engine_model_type": t.engine,
		"voice_id":          voiceID,
		"voice_format":      "1", // 1: PCM
		"needvad":           "1", // 1: enable VAD
	}

	signature := t.createSignature(params)

	// URL Encoding for request
	q := url.Values{}
	for k, v := range params {
		q.Set(k, v)
	}
	q.Set("signature", signature)

	return fmt.Sprintf("wss://asr.cloud.tencent.com/asr/v2/%s?%s", t.appID, q.Encode())
}

func (t *TencentProtocol) AuthHeaders() http.Header {
	return http.Header{}
}

func (t *TencentProtocol) StartTaskFrame(taskID string, sampleRate int, language string) ([]byte, error) {
	// Tencent does not require a start frame.
	return nil, nil
}

func (t *TencentProtocol) StopTaskFrame(taskID string) ([]byte, error) {
	// Tencent closes the stream upon sending {"type":"end"}
	stopFrame := map[string]string{"type": "end"}
	return json.Marshal(stopFrame)
}

func (t *TencentProtocol) ParseMessage(message []byte) (*StreamEvent, error) {
	var resp struct {
		Code      int    `json:"code"`
		Message   string `json:"message"`
		VoiceID   string `json:"voice_id"`
		MessageID string `json:"message_id"`
		Result    struct {
			SliceType    int    `json:"slice_type"`
			VoiceTextStr string `json:"voice_text_str"`
		} `json:"result"`
		Final int `json:"final"` // 1 means full utterance is done
	}

	if err := json.Unmarshal(message, &resp); err != nil {
		return nil, err
	}

	event := &StreamEvent{}

	if resp.Code != 0 {
		event.Type = EventTaskFailed
		event.Error = fmt.Sprintf("Tencent ASR Error %d: %s", resp.Code, resp.Message)
		return event, nil
	}

	event.Text = resp.Result.VoiceTextStr

	if resp.Final == 1 {
		event.Type = EventFinal
		event.Confidence = 0.95 // Default
	} else {
		event.Type = EventInterim
	}

	return event, nil
}

func (t *TencentProtocol) SendAudioAsBinary() bool {
	// Tencent accepts raw binary
	return true
}
