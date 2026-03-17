package audio

// PoolStats holds the global statistics for an ASR connection pool
type PoolStats struct {
	MinSize           int    `json:"min_size"`
	MaxSize           int    `json:"max_size"`
	CurrentSize       int    `json:"current_size"`
	ActiveTasks       int    `json:"active_tasks"`
	Connected         int    `json:"connected"`
	Reconnecting      int    `json:"reconnecting"`
	Failed            int    `json:"failed"`
	PermanentlyFailed int    `json:"permanently_failed"`
	Busy              int    `json:"busy"`
	CircuitBreaker    string `json:"circuit_breaker"`
	Draining          bool   `json:"draining"`
}

type ConnectionState int

const (
	StateConnected ConnectionState = iota
	StateReconnecting
	StateFailed
	StatePermanentlyFailed
)

type CircuitState int

const (
	CircuitClosed CircuitState = iota
	CircuitOpen
	CircuitHalfOpen
)
