// Package metrics centralises all Prometheus metric definitions for IE.
// Uses a custom (non-default) registry so that /metrics only exposes CXMind
// counters — Go runtime stats are NOT leaked, minimising the attack surface.
package metrics

import (
	"net/http"
	"runtime"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// ─── Custom registry (no Go runtime / process metrics) ───

var Registry = prometheus.NewRegistry()

// ─── Gauge: current active calls ───

var ActiveCalls = prometheus.NewGauge(prometheus.GaugeOpts{
	Namespace: "ie",
	Name:      "active_calls",
	Help:      "Number of currently active voice calls tracked by the RTP sniffer.",
})

// ─── Counter: SIP responses by code class (2xx, 3xx, 4xx, 5xx, 6xx) ───

var SIPResponses = prometheus.NewCounterVec(prometheus.CounterOpts{
	Namespace: "ie",
	Name:      "sip_responses_total",
	Help:      "Total SIP response messages processed, partitioned by status code class.",
}, []string{"code_class"})

// ─── Histogram: ASR connection acquisition latency ───

var ASRConnectDuration = prometheus.NewHistogram(prometheus.HistogramOpts{
	Namespace: "ie",
	Name:      "asr_connect_duration_seconds",
	Help:      "Time to acquire an ASR connection from the pool and start a streaming task.",
	Buckets:   []float64{0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10},
})

// ─── Gauge: goroutine count (auto-reads runtime.NumGoroutine on scrape) ───

var Goroutines = prometheus.NewGaugeFunc(prometheus.GaugeOpts{
	Namespace: "ie",
	Name:      "goroutines",
	Help:      "Current number of goroutines in the IE process.",
}, func() float64 {
	return float64(runtime.NumGoroutine())
})

// ─── Histogram: SER (Emotion) ONNX inference latency ───

var SERInferenceDuration = prometheus.NewHistogram(prometheus.HistogramOpts{
	Namespace: "ie",
	Name:      "ser_inference_duration_seconds",
	Help:      "Time taken for one pass of emotion recognition over the ONNX audio segment.",
	Buckets:   []float64{0.05, 0.1, 0.25, 0.5, 1, 2, 5},
})

// ─── Gauge: SER degradation status (0=healthy, 1=degraded/post-call) ───

var SERDegradedStatus = prometheus.NewGauge(prometheus.GaugeOpts{
	Namespace: "ie",
	Name:      "ser_degraded_status",
	Help:      "Current operating mode of SER. 0 = healthy real-time, 1 = degraded post-call mode.",
})

// ─── Counter: HEP parsing panics ───

var HEPPanics = prometheus.NewCounter(prometheus.CounterOpts{
	Namespace: "ie",
	Name:      "hep_panics_total",
	Help:      "Total number of panics recovered during HEP packet decoding and processing.",
})

func init() {
	Registry.MustRegister(ActiveCalls)
	Registry.MustRegister(SIPResponses)
	Registry.MustRegister(ASRConnectDuration)
	Registry.MustRegister(Goroutines)
	Registry.MustRegister(SERInferenceDuration)
	Registry.MustRegister(SERDegradedStatus)
	Registry.MustRegister(HEPPanics)
}

// Handler returns an http.Handler that serves /metrics using the custom registry.
func Handler() http.Handler {
	return promhttp.HandlerFor(Registry, promhttp.HandlerOpts{})
}
