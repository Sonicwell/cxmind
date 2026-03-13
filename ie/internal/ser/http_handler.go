package ser

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"

	"github.com/gofiber/fiber/v2"
)

// RegisterRoutes registers the internal SER HTTP routes on a Fiber app.
// These are internal APIs called by the Node.js app-server service.
func RegisterRoutes(app *fiber.App, analyzer *Analyzer, monitor *ResourceMonitor) {
	g := app.Group("/ser")

	// POST /ser/analyze — analyze PCM audio data
	// Body: raw PCM bytes (signed 16-bit LE)
	// Query: ?sample_rate=8000&segment_sec=15
	g.Post("/analyze", func(c *fiber.Ctx) error {
		pcm := c.Body()
		if len(pcm) == 0 {
			return c.Status(400).JSON(fiber.Map{"error": "empty body"})
		}

		sampleRate, _ := strconv.Atoi(c.Query("sample_rate", "8000"))
		// segmentSec is not used directly anymore by Analyze, it handles splitting internally
		// segmentSec, _ := strconv.ParseFloat(c.Query("segment_sec", "15"), 32)

		segment := &AudioSegment{
			Data:       PcmToFloat32(pcm),
			SampleRate: sampleRate,
		}

		result, err := analyzer.Analyze(segment)
		if err != nil {
			log.Printf("[SER/HTTP] analyze error: %v", err)
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}

		return c.JSON(result)
	})

	// GET /ser/status — resource monitor status
	g.Get("/status", func(c *fiber.Ctx) error {
		if monitor == nil {
			return c.JSON(fiber.Map{
				"mode":   "post_call",
				"status": "monitor not initialized",
			})
		}
		return c.JSON(monitor.GetStats())
	})

	// GET /ser/health — quick health check
	g.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":      "ok",
			"initialized": analyzer.initialized,
			"mode":        monitor.GetMode(),
		})
	})

	log.Println("[SER/HTTP] Routes registered: POST /ser/analyze, GET /ser/status, GET /ser/health")
}

// StandaloneHandler creates a standard net/http handler for the analyze endpoint.
// Useful for embedding in non-Fiber servers.
func StandaloneHandler(analyzer *Analyzer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		pcm, err := io.ReadAll(r.Body)
		if err != nil || len(pcm) == 0 {
			http.Error(w, "empty or unreadable body", http.StatusBadRequest)
			return
		}
		defer r.Body.Close()

		sampleRate, _ := strconv.Atoi(r.URL.Query().Get("sample_rate"))
		if sampleRate == 0 {
			sampleRate = 8000
		}

		// Parse optional silence threshold (VAD sensitivity)
		var silenceThreshold float32
		if st := r.URL.Query().Get("silence_threshold"); st != "" {
			if v, err := strconv.ParseFloat(st, 32); err == nil && v > 0 && v < 1 {
				silenceThreshold = float32(v)
			}
		}

		segment := &AudioSegment{
			Data:             PcmToFloat32(pcm),
			SampleRate:       sampleRate,
			SilenceThreshold: silenceThreshold,
		}

		result, err := analyzer.Analyze(segment)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	}
}
