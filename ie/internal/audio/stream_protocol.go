package audio

import "net/http"

// EventType 标准化的流式事件类型
type EventType int

const (
	EventTaskStarted  EventType = iota // 任务已启动
	EventInterim                       // 中间结果 (非 final)
	EventFinal                         // 最终结果
	EventTaskFailed                    // 任务失败
	EventTaskFinished                  // 任务正常结束
	EventUnknown                       // 未知/忽略
)

// StreamEvent 协议解析后的标准化事件
type StreamEvent struct {
	TaskID     string
	Type       EventType
	Text       string
	Confidence float64
	BeginTime  int64  // ms
	EndTime    int64  // ms
	Error      string // EventTaskFailed 时填充
}

// StreamProtocol 定义 vendor 特定的 WebSocket 协议适配器
type StreamProtocol interface {
	// Endpoint 返回 WebSocket URL
	Endpoint() string

	// AuthHeaders 返回连接认证所需的 HTTP headers
	AuthHeaders() http.Header

	// StartTaskFrame 构造开始任务的消息; 如果不需要返回 nil 即可
	StartTaskFrame(taskID string, sampleRate int, language string) ([]byte, error)

	// StopTaskFrame 构造结束任务的消息; 如果不需要返回 nil 即可
	StopTaskFrame(taskID string) ([]byte, error)

	// ParseMessage 解析收到的消息为标准化事件
	ParseMessage(message []byte) (*StreamEvent, error)

	// SendAudioAsBinary 标识是否以 binary frame 发送音频 (true)，或者需包装成 JSON (false)
	SendAudioAsBinary() bool
}
