package audio

import (
	"log"

	"github.com/cxmind/ingestion-go/internal/config"

	"encoding/json"
	"net/http"
	"strings"
)

// DashScopeProtocol implements StreamProtocol for Alibaba DashScope
type DashScopeProtocol struct {
	apiURL       string
	apiKey       string
	customParams string // 用户自定义 JSON，覆盖默认 params
}

func NewDashScopeProtocol(apiURL, apiKey string) *DashScopeProtocol {
	return &DashScopeProtocol{
		apiURL: apiURL,
		apiKey: apiKey,
	}
}

// SetCustomParams sets user-defined JSON to merge into StartTaskFrame parameters
func (d *DashScopeProtocol) SetCustomParams(params string) {
	d.customParams = params
}

func (d *DashScopeProtocol) Endpoint() string {
	return d.apiURL
}

func (d *DashScopeProtocol) AuthHeaders() http.Header {
	headers := http.Header{}
	headers.Set("Authorization", "Bearer "+d.apiKey)
	return headers
}

func (d *DashScopeProtocol) StartTaskFrame(taskID string, sampleRate int, language string) ([]byte, error) {
	model := config.Global.GetString("asr.dashscope.model")
	if model == "" {
		model = "paraformer-realtime-v2"
	}

	startFrame := DashScopeStartFrame{}
	startFrame.Header.Action = "run-task"
	startFrame.Header.TaskID = taskID
	startFrame.Header.Streaming = "duplex"
	startFrame.Payload.TaskGroup = "audio"
	startFrame.Payload.Task = "asr"
	startFrame.Payload.Function = "recognition"
	startFrame.Payload.Model = model
	startFrame.Payload.Input = map[string]interface{}{}
	params := map[string]interface{}{
		"format":                            "pcm",
		"sample_rate":                       sampleRate,
		"audio_encoding":                    "pcm",
		"bits_per_sample":                   16,
		"enable_intermediate_result":        true,
		"enable_punctuation_prediction":     true,
		"enable_inverse_text_normalization": true,
		"semantic_punctuation_enabled":      false,
	}

	// VAD 分句策略（可组合）
	if strings.HasPrefix(model, "paraformer") {
		params["vad"] = map[string]interface{}{
			"type":                "server_vad",
			"threshold":           0.3,
			"silence_duration_ms": 600,
		}
	}
	if strings.Contains(model, "fun-asr") {
		params["max_sentence_silence"] = 800
		params["multi_threshold_mode_enabled"] = true
		params["speech_noise_threshold"] = 0
	}

	startFrame.Payload.Parameters = params

	// 合并用户自定义参数（覆盖默认值）
	if d.customParams != "" {
		var userParams map[string]interface{}
		if err := json.Unmarshal([]byte(d.customParams), &userParams); err != nil {
			log.Printf("[DashScope] WARNING: invalid customParams JSON, skipping: %v", err)
		} else {
			for k, v := range userParams {
				params[k] = v
			}
			log.Printf("[DashScope] Merged %d custom params into StartTaskFrame", len(userParams))
		}
	}

	return json.Marshal(startFrame)
}

func (d *DashScopeProtocol) StopTaskFrame(taskID string) ([]byte, error) {
	stopFrame := map[string]interface{}{
		"header": map[string]interface{}{
			"action":  "finish-task",
			"task_id": taskID,
		},
		"payload": map[string]interface{}{
			"input": map[string]interface{}{},
		},
	}
	return json.Marshal(stopFrame)
}

func (d *DashScopeProtocol) ParseMessage(message []byte) (*StreamEvent, error) {
	var resp struct {
		Header struct {
			TaskID string `json:"task_id"`
			Event  string `json:"event"`
			Action string `json:"action"`
		} `json:"header"`
		Payload struct {
			Result     string  `json:"result"`
			Confidence float64 `json:"confidence"`
			Output     struct {
				Sentence struct {
					Text        string      `json:"text"`
					Begin       int64       `json:"begin_time"`
					End         int64       `json:"end_time"`
					SentenceEnd interface{} `json:"sentence_end"` // bool 或 int，标记句尾
				} `json:"sentence"`
			} `json:"output"`
		} `json:"payload"`
	}

	if err := json.Unmarshal(message, &resp); err != nil {
		return nil, err
	}

	event := &StreamEvent{
		TaskID: resp.Header.TaskID,
	}

	if resp.Header.Event == "task-failed" {
		event.Type = EventTaskFailed
		event.Error = "DashScope task failed" // In a real scenario we'd extract error message
		return event, nil
	}

	if resp.Header.Event == "task-finished" {
		event.Type = EventTaskFinished
		return event, nil
	}

	if resp.Header.Event == "result-generated" || resp.Header.Event == "sentence-end" {
		text := resp.Payload.Result
		if text == "" {
			text = resp.Payload.Output.Sentence.Text
		}

		event.Text = text
		event.Confidence = resp.Payload.Confidence
		event.BeginTime = resp.Payload.Output.Sentence.Begin
		event.EndTime = resp.Payload.Output.Sentence.End

		if resp.Header.Event == "sentence-end" {
			event.Type = EventFinal
		} else {
			// result-generated 也可能通过 sentence_end 字段内联标记句尾
			se := resp.Payload.Output.Sentence.SentenceEnd
			if se == true || se == float64(1) {
				event.Type = EventFinal
			} else {
				event.Type = EventInterim
			}
		}
		return event, nil
	}

	event.Type = EventUnknown
	return event, nil
}

func (d *DashScopeProtocol) SendAudioAsBinary() bool {
	return true
}

// DashScopeStartFrame structure for JSON
type DashScopeStartFrame struct {
	Header struct {
		Action    string `json:"action"`
		TaskID    string `json:"task_id"`
		Streaming string `json:"streaming"`
	} `json:"header"`
	Payload struct {
		TaskGroup  string                 `json:"task_group"`
		Task       string                 `json:"task"`
		Function   string                 `json:"function"`
		Model      string                 `json:"model"`
		Input      map[string]interface{} `json:"input"`
		Parameters map[string]interface{} `json:"parameters"`
	} `json:"payload"`
}
