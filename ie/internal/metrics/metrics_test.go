package metrics

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRegistryContainsAllMetrics(t *testing.T) {
	// CounterVec only appears in Gather() after at least one label is used.
	// Initialize a dummy label to ensure it shows up.
	SIPResponses.WithLabelValues("test").Add(0)

	families, err := Registry.Gather()
	if err != nil {
		t.Fatalf("Failed to gather metrics: %v", err)
	}

	names := make(map[string]bool)
	for _, mf := range families {
		names[mf.GetName()] = true
	}

	expected := []string{
		"ie_active_calls",
		"ie_sip_responses_total",
		"ie_asr_connect_duration_seconds",
		"ie_goroutines",
	}

	for _, name := range expected {
		if !names[name] {
			t.Errorf("Expected metric %q not found in registry. Got: %v", name, names)
		}
	}
}

func TestGoroutineGaugePositive(t *testing.T) {
	families, err := Registry.Gather()
	if err != nil {
		t.Fatalf("Failed to gather: %v", err)
	}

	for _, mf := range families {
		if mf.GetName() == "ie_goroutines" {
			val := mf.GetMetric()[0].GetGauge().GetValue()
			if val <= 0 {
				t.Errorf("ie_goroutines should be > 0, got %v", val)
			}
			t.Logf("ie_goroutines = %.0f", val)
			return
		}
	}
	t.Error("ie_goroutines metric not found")
}

func TestSIPResponsesCounterIncrements(t *testing.T) {
	// Increment a specific label
	SIPResponses.WithLabelValues("2xx").Inc()
	SIPResponses.WithLabelValues("2xx").Inc()
	SIPResponses.WithLabelValues("4xx").Inc()

	families, err := Registry.Gather()
	if err != nil {
		t.Fatalf("Failed to gather: %v", err)
	}

	for _, mf := range families {
		if mf.GetName() == "ie_sip_responses_total" {
			for _, m := range mf.GetMetric() {
				for _, lp := range m.GetLabel() {
					if lp.GetName() == "code_class" && lp.GetValue() == "2xx" {
						val := m.GetCounter().GetValue()
						if val < 2 {
							t.Errorf("Expected 2xx counter >= 2, got %v", val)
						}
						return
					}
				}
			}
		}
	}
	t.Error("ie_sip_responses_total{code_class=2xx} not found")
}

func TestHandlerReturnsMetrics(t *testing.T) {
	handler := Handler()
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	resp := w.Result()
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200, got %d", resp.StatusCode)
	}

	bodyStr := string(body)
	if !strings.Contains(bodyStr, "ie_active_calls") {
		t.Error("Response missing ie_active_calls")
	}
	if !strings.Contains(bodyStr, "ie_goroutines") {
		t.Error("Response missing ie_goroutines")
	}
	if !strings.Contains(bodyStr, "ie_sip_responses_total") {
		t.Error("Response missing ie_sip_responses_total")
	}
}
