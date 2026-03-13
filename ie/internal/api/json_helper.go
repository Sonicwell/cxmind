package api

import (
	"encoding/json"
	"log"
	"net/http"
)

// jsonEncode encodes v as JSON to w and logs any encoding error.
// This avoids the "G104: errors unhandled" gosec warning from bare
// json.NewEncoder(w).Encode(v) calls throughout the HTTP handlers.
func jsonEncode(w http.ResponseWriter, v interface{}) {
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("[WARN] jsonEncode: failed to write JSON response: %v", err)
	}
}
