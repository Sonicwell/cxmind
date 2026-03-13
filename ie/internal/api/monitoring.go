package api

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
)

// MonitoringCache 监听状态缓存
type MonitoringCache struct {
	callMonitoring  sync.Map // callID -> bool
	agentMonitoring sync.Map // agentID -> bool
}

// GlobalMonitoringCache 全局监听缓存实例
var GlobalMonitoringCache = &MonitoringCache{}

// MonitoringUpdateRequest HTTP 请求体
type MonitoringUpdateRequest struct {
	Action   string `json:"action"`    // "start" or "stop"
	Type     string `json:"type"`      // "call" or "agent"
	TargetID string `json:"target_id"` // callID or agentID
}

// MonitoringUpdateResponse HTTP 响应体
type MonitoringUpdateResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

// HandleMonitoringUpdate 处理监听状态更新
func HandleMonitoringUpdate(w http.ResponseWriter, r *http.Request) {
	// 设置 CORS 头 (based on whitelist)
	SetCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	// 处理 OPTIONS 请求
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req MonitoringUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Failed to decode request body: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// 验证请求
	if req.Action != "start_monitoring" && req.Action != "stop_monitoring" {
		http.Error(w, "Invalid action: must be 'start_monitoring' or 'stop_monitoring'", http.StatusBadRequest)
		return
	}
	if req.Type != "call" && req.Type != "agent" {
		http.Error(w, "Invalid type: must be 'call' or 'agent'", http.StatusBadRequest)
		return
	}
	if req.TargetID == "" {
		http.Error(w, "Missing target_id", http.StatusBadRequest)
		return
	}

	// 更新缓存
	// ML-2 fix: Use Delete on stop to prevent sync.Map entry leak
	// Previously stored false, which still occupies memory
	if req.Action == "start_monitoring" {
		if req.Type == "call" {
			GlobalMonitoringCache.callMonitoring.Store(req.TargetID, true)
			log.Printf("Started call monitoring: %s", req.TargetID)
		} else {
			GlobalMonitoringCache.agentMonitoring.Store(req.TargetID, true)
			log.Printf("Started agent monitoring: %s", req.TargetID)
		}
	} else {
		// stop_monitoring: DELETE entry entirely to prevent sync.Map leak
		if req.Type == "call" {
			GlobalMonitoringCache.callMonitoring.Delete(req.TargetID)
			log.Printf("Stopped call monitoring: %s", req.TargetID)
		} else {
			GlobalMonitoringCache.agentMonitoring.Delete(req.TargetID)
			log.Printf("Stopped agent monitoring: %s", req.TargetID)
		}
	}

	// 返回成功响应
	response := MonitoringUpdateResponse{
		Status:  "success",
		Message: "Monitoring status updated",
	}

	w.WriteHeader(http.StatusOK)
	jsonEncode(w, response)
}

// IsCallMonitored 检查通话是否被监听（从缓存）
func (mc *MonitoringCache) IsCallMonitored(callID string) bool {
	if val, ok := mc.callMonitoring.Load(callID); ok {
		return val.(bool)
	}
	return false
}

// IsAgentMonitored 检查坐席是否被监听（从缓存）
func (mc *MonitoringCache) IsAgentMonitored(agentID string) bool {
	if val, ok := mc.agentMonitoring.Load(agentID); ok {
		return val.(bool)
	}
	return false
}

// ShouldMonitorCall 综合判断是否应该监听
func (mc *MonitoringCache) ShouldMonitorCall(callID string, agentID string) bool {
	// 检查通话级监听
	if mc.IsCallMonitored(callID) {
		return true
	}

	// 检查坐席级监听
	if agentID != "" && mc.IsAgentMonitored(agentID) {
		return true
	}

	return false
}

// SetCallMonitored sets a call as monitored (convenience method for cross-package access).
func (mc *MonitoringCache) SetCallMonitored(callID string) {
	mc.callMonitoring.Store(callID, true)
}

// ClearCall 清理通话监听状态（通话结束时调用）
func (mc *MonitoringCache) ClearCall(callID string) {
	mc.callMonitoring.Delete(callID)
	log.Printf("Cleared call monitoring cache for: %s", callID)
}

// ClearAgent 清理坐席监听状态
func (mc *MonitoringCache) ClearAgent(agentID string) {
	mc.agentMonitoring.Delete(agentID)
	log.Printf("Cleared agent monitoring cache for: %s", agentID)
}

// GetActiveMonitoring 获取所有活跃的监听状态（用于调试）
func (mc *MonitoringCache) GetActiveMonitoring() map[string]interface{} {
	result := map[string]interface{}{
		"calls":  []string{},
		"agents": []string{},
	}

	calls := []string{}
	mc.callMonitoring.Range(func(key, value interface{}) bool {
		if value.(bool) {
			calls = append(calls, key.(string))
		}
		return true
	})
	result["calls"] = calls

	agents := []string{}
	mc.agentMonitoring.Range(func(key, value interface{}) bool {
		if value.(bool) {
			agents = append(agents, key.(string))
		}
		return true
	})
	result["agents"] = agents

	return result
}

// HandleMonitoringStatus 获取监听状态（调试端点）
func HandleMonitoringStatus(w http.ResponseWriter, r *http.Request) {
	SetCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	status := GlobalMonitoringCache.GetActiveMonitoring()
	w.WriteHeader(http.StatusOK)
	jsonEncode(w, status)
}
