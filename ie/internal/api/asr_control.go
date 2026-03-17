package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/cxmind/ingestion-go/internal/redis"
)

// ASR Control Callbacks (set by main.go to avoid circular imports)
var (
	EnableASRCallback    func(callID string) error
	DisableASRCallback   func(callID string) error
	GetASRStatusCallback func(callID string) map[string]interface{}

	// CheckASRPermissionFunc is overridable for testing (defaults to checkASRPermission)
	CheckASRPermissionFunc = checkASRPermission
)

// ASRControlRequest is the HTTP request body for ASR control endpoints.
type ASRControlRequest struct {
	CallID string `json:"call_id"`
}

// ASRControlResponse is the HTTP response body for ASR control endpoints.
type ASRControlResponse struct {
	Status  string                 `json:"status"`
	Message string                 `json:"message"`
	Data    map[string]interface{} `json:"data,omitempty"`
}

// HandleASRControl handles ASR enable/disable requests.
func HandleASRControl(w http.ResponseWriter, r *http.Request) {
	SetCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		sendErrorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req ASRControlRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Failed to decode request body: %v", err)
		sendErrorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.CallID == "" {
		sendErrorResponse(w, http.StatusBadRequest, "Missing call_id")
		return
	}

	// Check permission (uses overridable function for testability)
	canEnable, reason, err := CheckASRPermissionFunc(req.CallID)
	if err != nil {
		log.Printf("Failed to check ASR permission for call %s: %v", req.CallID, err)
		sendErrorResponse(w, http.StatusInternalServerError, "Internal server error")
		return
	}

	if !canEnable {
		sendErrorResponse(w, http.StatusForbidden, reason)
		return
	}

	// Determine action from URL path
	action := "enable"
	if r.URL.Path == "/api/asr/disable" {
		action = "disable"
	}

	if action == "enable" {
		if EnableASRCallback == nil {
			sendErrorResponse(w, http.StatusInternalServerError, "ASR control not initialized")
			return
		}

		if err := EnableASRCallback(req.CallID); err != nil {
			log.Printf("Failed to enable ASR for call %s: %v", req.CallID, err)
			sendErrorResponse(w, http.StatusInternalServerError, "Internal server error")
			return
		}
		log.Printf("ASR enabled for call %s via API", req.CallID)
		sendSuccessResponse(w, "ASR enabled successfully", nil)
	} else {
		if DisableASRCallback == nil {
			sendErrorResponse(w, http.StatusInternalServerError, "ASR control not initialized")
			return
		}

		if err := DisableASRCallback(req.CallID); err != nil {
			log.Printf("Failed to disable ASR for call %s: %v", req.CallID, err)
			sendErrorResponse(w, http.StatusInternalServerError, "Internal server error")
			return
		}
		log.Printf("ASR disabled for call %s via API", req.CallID)
		sendSuccessResponse(w, "ASR disabled successfully", nil)
	}
}

// checkASRPermission checks if ASR can be toggled for the given call.
// Returns (canEnable, reason, error).
func checkASRPermission(callID string) (bool, string, error) {
	state, err := redis.GetCallState(callID)
	if err != nil {
		return false, "", fmt.Errorf("failed to get call state: %v", err)
	}

	if state == nil {
		return false, "Call not found", nil
	}

	globalPolicy, _ := state["global_asr_policy"].(string)
	if globalPolicy == "" {
		globalPolicy = "optional"
	}

	agentPolicy, _ := state["agent_asr_policy"].(string)
	if agentPolicy == "" {
		agentPolicy = "optional"
	}

	// Policy check: disabled > required > optional
	if globalPolicy == "disabled" {
		return false, "ASR is globally disabled", nil
	}
	if agentPolicy == "disabled" {
		return false, "ASR is disabled for this agent", nil
	}
	if globalPolicy == "required" {
		return false, "ASR is globally enforced, no manual toggle needed", nil
	}
	if agentPolicy == "required" {
		return false, "ASR is enforced for this agent, no manual toggle needed", nil
	}
	if globalPolicy == "optional" && agentPolicy == "optional" {
		return true, "", nil
	}

	return false, "ASR permission check failed", nil
}

// HandleASRStatus returns the ASR status for a given call.
func HandleASRStatus(w http.ResponseWriter, r *http.Request) {
	SetCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodGet {
		sendErrorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	callID := r.URL.Query().Get("call_id")
	if callID == "" {
		sendErrorResponse(w, http.StatusBadRequest, "Missing call_id parameter")
		return
	}

	if GetASRStatusCallback == nil {
		sendErrorResponse(w, http.StatusInternalServerError, "ASR control not initialized")
		return
	}

	status := GetASRStatusCallback(callID)
	if status == nil {
		sendErrorResponse(w, http.StatusNotFound, "Call not found")
		return
	}

	sendSuccessResponse(w, "ASR status retrieved", status)
}

func sendSuccessResponse(w http.ResponseWriter, message string, data map[string]interface{}) {
	response := ASRControlResponse{
		Status:  "success",
		Message: message,
		Data:    data,
	}
	w.WriteHeader(http.StatusOK)
	jsonEncode(w, response)
}

func sendErrorResponse(w http.ResponseWriter, statusCode int, message string) {
	response := ASRControlResponse{
		Status:  "error",
		Message: message,
	}
	w.WriteHeader(statusCode)
	jsonEncode(w, response)
}
