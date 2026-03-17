package main

import (
	"github.com/cxmind/ingestion-go/internal/config"

	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	_ "net/http/pprof" // registers /debug/pprof/ handlers on DefaultServeMux; we manually wire to our mux
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/cxmind/ingestion-go/internal/ai"
	"github.com/cxmind/ingestion-go/internal/api"
	"github.com/cxmind/ingestion-go/internal/audio"
	"github.com/cxmind/ingestion-go/internal/callsession"
	"github.com/cxmind/ingestion-go/internal/clickhouse"
	"github.com/cxmind/ingestion-go/internal/demovad"
	"github.com/cxmind/ingestion-go/internal/geoip"
	"github.com/cxmind/ingestion-go/internal/hep"
	"github.com/cxmind/ingestion-go/internal/metrics"
	"github.com/cxmind/ingestion-go/internal/pcap"
	"github.com/cxmind/ingestion-go/internal/redis"
	"github.com/cxmind/ingestion-go/internal/rtp"
	"github.com/cxmind/ingestion-go/internal/ser"
	"github.com/cxmind/ingestion-go/internal/siprec"
	"github.com/cxmind/ingestion-go/internal/sniffer"

	"github.com/spf13/viper"
)

const (
	// asrReloadMaxBodySize is the max request body for ASR config reload (1KB).
	asrReloadMaxBodySize = 1024
)

var httpServer *http.Server
var startTime = time.Now() // For uptime calculation in /health

func main() {
	// --- Config Loading: common.yaml (shared DB creds) → ie.yaml (IE-specific) ---
	// Priority for each file: /etc/cxmind/ > ./config/ > current directory
	viper.SetConfigType("yaml")
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	viper.AutomaticEnv()

	// Register all defaults before loading any config files.
	// Viper's priority order: env > config file > default, so defaults are safe here.
	viper.SetDefault("server.port", "8080")
	viper.SetDefault("hep.port", "9060")
	viper.SetDefault("redis.addr", "localhost:6379")
	viper.SetDefault("redis.password", "")
	viper.SetDefault("redis.db", 0)
	viper.SetDefault("clickhouse.host", "localhost:9000")
	viper.SetDefault("clickhouse.database", "cxmi")
	viper.SetDefault("clickhouse.username", "default")
	viper.SetDefault("clickhouse.password", "")
	viper.SetDefault("asr.provider", "funasr")
	viper.SetDefault("asr.funasr.url", "http://localhost:8000")
	viper.SetDefault("asr.funasr.key", "")
	viper.SetDefault("asr.dashscope.url", "wss://dashscope.aliyuncs.com/api-ws/v1/inference")
	viper.SetDefault("asr.dashscope.key", "")
	viper.SetDefault("ser.enabled", true)
	viper.SetDefault("ser.mode", "embedded")
	viper.SetDefault("ser.embedded.model_path", "./models/wav2vec2-ser.onnx")
	viper.SetDefault("ser.embedded.num_threads", 2)
	viper.SetDefault("ser.embedded.window_seconds", 5.0)
	viper.SetDefault("ser.remote.addr", "ser-service:50051")
	viper.SetDefault("ser.remote.timeout_ms", 3000)
	viper.SetDefault("vad.mode", "silero")
	viper.SetDefault("vad.silero_model", "./models/silero_vad.onnx")
	viper.SetDefault("vad.silero_threshold", 0.5)
	viper.SetDefault("vad.hangover_ms", 300)
	viper.SetDefault("processing.default_level", 1)
	viper.SetDefault("sniffer.hep_enabled", true)
	viper.SetDefault("sniffer.sip_pcap_enabled", false)
	viper.SetDefault("sniffer.rtp_pcap_enabled", true)

	// Step 1: Load common.yaml (shared Redis / ClickHouse / MongoDB credentials)
	viper.SetConfigName("common")
	viper.AddConfigPath("/etc/cxmind")
	viper.AddConfigPath("./config")
	viper.AddConfigPath(".")
	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			log.Fatalf("Error reading common.yaml: %v", err)
		}
		log.Println("[Config] common.yaml not found, will try ie.yaml or config.yaml")
	} else {
		log.Printf("[Config] Loaded common.yaml from: %s", viper.ConfigFileUsed())
	}

	// Print build mode for operational clarity
	if config.IsDebug() {
		log.Println("[Config] Build mode: DEVELOPMENT — verbose logging enabled")
	} else {
		log.Printf("[Config] Build mode: %s", config.BuildMode)
	}

	// Step 2: Merge ie.yaml (IE-specific: ASR, HEP, VAD, Sniffer, Storage)
	viper.SetConfigName("ie")
	if err := viper.MergeInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			log.Fatalf("Error merging ie.yaml: %v", err)
		}
		// ie.yaml missing → try legacy config.yaml for backward compat
		viper.SetConfigName("config")
		if err2 := viper.MergeInConfig(); err2 == nil {
			log.Printf("[Config] Using legacy config.yaml from: %s", viper.ConfigFileUsed())
		}
	} else {
		log.Printf("[Config] Merged ie.yaml from: %s", viper.ConfigFileUsed())
	}

	// Step 3: Build redis.addr from host+port if not set (common.yaml uses host+port format)
	if config.Global.GetString("redis.addr") == "" {
		redisHost := config.Global.GetString("redis.host")
		redisPort := config.Global.GetString("redis.port")
		if redisHost == "" {
			redisHost = "localhost"
		}
		if redisPort == "" {
			redisPort = "6379"
		}
		viper.Set("redis.addr", redisHost+":"+redisPort)
	}

	// Step 4: Build clickhouse.host (native port) from host+native_port if needed
	if config.Global.GetString("clickhouse.host") == "" || !strings.Contains(config.Global.GetString("clickhouse.host"), ":") {
		chHost := config.Global.GetString("clickhouse.host")
		if chHost == "" {
			chHost = "localhost"
		}
		chPort := config.Global.GetInt("clickhouse.native_port")
		if chPort == 0 {
			chPort = 9000
		}
		viper.Set("clickhouse.host", fmt.Sprintf("%s:%d", chHost, chPort))
	}

	log.Printf("[Config] Redis addr: %s", config.Global.GetString("redis.addr"))
	log.Printf("[Config] ClickHouse host: %s", config.Global.GetString("clickhouse.host"))

	// 2. Initialize Redis
	log.Println("Connecting to Redis...")
	if err := redis.Initialize(); err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	log.Println("Redis connected")

	// Initialize async event publisher (replaces sync PublishCallEvent)
	redis.InitEventPublisher(5000, 4) // 5000 buffer, 4 workers

	// Load active ASR config from Redis on startup
	func() {
		activeVendorID, err := redis.Client.Get(redis.Ctx(), "asr:active_vendor_id").Result()
		if err == nil && activeVendorID != "" {
			log.Printf("[ASR] Found active vendor in Redis: %s", activeVendorID)
			redisKey := "asr:vendor:" + activeVendorID
			result, err := redis.Client.HGetAll(redis.Ctx(), redisKey).Result()
			if err == nil && len(result) > 0 {
				poolSize, _ := strconv.Atoi(result["pool_size"])
				cfg := audio.DynamicASRConfig{
					Provider:     result["provider"],
					URL:          result["url"],
					APIKey:       result["api_key"],
					Model:        result["model"],
					PoolSize:     poolSize,
					VendorID:     activeVendorID,
					CustomParams: result["custom_params"],
				}
				if err := audio.SetDynamicASRConfig(cfg); err != nil {
					log.Printf("[ASR] Failed to apply startup dynamic config: %v", err)
				} else {
					log.Printf("[ASR] Startup config loaded: vendor=%s provider=%s model=%s pool=%d customParams=%q",
						activeVendorID, cfg.Provider, cfg.Model, cfg.PoolSize, cfg.CustomParams)
				}
			} else {
				log.Printf("[ASR] Vendor config not found in Redis for id: %s", activeVendorID)
			}
		} else {
			log.Printf("[ASR] No active ASR vendor found in Redis (using config.yaml defaults)")
		}
	}()

	// Initialize Call Session Manager (Hybrid Memory/Redis)
	callsession.Initialize()

	// 2.5 Initialize GeoIP
	log.Println("Loading GeoIP database...")
	if err := geoip.Initialize(); err != nil {
		log.Printf("Warning: GeoIP initialization failed: %v", err)
	}

	// 3. Initialize ClickHouse
	log.Println("Connecting to ClickHouse...")
	if err := clickhouse.Initialize(); err != nil {
		log.Fatalf("Failed to connect to ClickHouse: %v", err)
	}
	log.Println("ClickHouse connected")

	// 3a. Wire cancelable context for graceful shutdown.
	// When SIGTERM/SIGINT arrives, cancel() is called, which cancels all
	// in-flight Redis, ClickHouse, and callsession operations.
	appCtx, appCancel := context.WithCancel(context.Background())
	defer appCancel()
	redis.SetContext(appCtx)
	clickhouse.SetContext(appCtx)
	callsession.SetContext(appCtx)

	// 3b. Initialize additional ClickHouse batch writers (CH-1/2/3 audit fixes)
	{
		batchSize := config.Global.GetInt("clickhouse.batch_size")
		if batchSize <= 0 {
			batchSize = 1000
		}
		flushMs := config.Global.GetInt("clickhouse.flush_interval_ms")
		if flushMs <= 0 {
			flushMs = 2000
		}
		flushInterval := time.Duration(flushMs) * time.Millisecond
		clickhouse.InitSipCallBatchWriter(batchSize, flushInterval)
		clickhouse.InitTranscriptionBatchWriter(batchSize, flushInterval)
		clickhouse.InitQualityBatchWriter(batchSize, flushInterval)
		// R2: InitRTCPBatchWriter moved to InitSharedPipeline (N5 fix)
		log.Printf("ClickHouse batch writers initialized (batch_size=%d, flush_interval=%v)", batchSize, flushInterval)
	}

	// 3.8 Initialize centralized ONNX Manager
	onnxManager := ai.GetONNXManager()

	// 3.8b Initialize SER
	if config.Global.GetBool("ser.enabled") {
		switch config.Global.GetString("ser.mode") {
		case "embedded":
			log.Println("Initializing Embedded SER (ONNX)...")

			if err := ser.GetAnalyzer().Initialize(onnxManager); err != nil {
				log.Printf("Warning: Failed to initialize Embedded SER: %v (SER will be disabled)", err)
			} else {
				log.Println("Embedded SER initialized successfully")

				// Setup resource monitor (CPU threshold 75%, auto mode) only if init was successful
				// It will degrade to post_call if CPU > 75%
				ser.InitResourceMonitor(75.0, "auto", func(oldMode, newMode string) {
					log.Printf("[SER] Operating mode altered: %s -> %s", oldMode, newMode)
				})
			}
		case "remote":
			log.Println("Initializing Remote SER (gRPC)...")
			if err := ser.InitRemoteSER(); err != nil {
				log.Printf("Warning: Failed to initialize Remote SER: %v (SER will be disabled)", err)
			} else {
				log.Println("Remote SER initialized successfully")
			}
		default:
			log.Printf("Warning: Unknown SER mode '%s' configured, SER will be disabled", config.Global.GetString("ser.mode"))
		}
	}

	// 3.5 Initialize PCAP Storage
	pcapPath := config.Global.GetString("storage.pcap_path")
	if pcapPath == "" {
		pcapPath = "./recordings"
	}
	log.Printf("Initializing PCAP storage at: %s", pcapPath)
	pcap.Init(pcapPath)

	// 4. Start Ingestion Layer (independent switches)
	hep.InitLocalIPCache()

	// ServerIPs 统一初始化（方向判定 + Raw 模式流向识别都需要）
	sniffer.InitServerIPs()

	// 注入方向判定回调，避免 hep→sniffer 循环依赖
	hep.IsServerIPFunc = sniffer.IsServerIP

	// HEP Server（场景 1/2/4）
	if config.Global.GetBool("sniffer.hep_enabled") {
		hepPort := config.Global.GetString("hep.port")
		log.Printf("[MODE] Starting HEP server on port %s", hepPort)
		go func() {
			if err := hep.StartHEPServer(hepPort); err != nil {
				log.Fatalf("HEP Server error: %v", err)
			}
		}()
	} else {
		// 不开 HEP 也要初始化共享 Pipeline（batch writers, cache）
		hep.InitSharedPipeline()
	}

	// SIP PCAP Sniffer（场景 3/4）
	if config.Global.GetBool("sniffer.sip_pcap_enabled") {
		log.Println("[MODE] Starting SIP PCAP sniffer")
		sipSniffer := sniffer.NewSIPSniffer()
		go func() {
			if err := sipSniffer.Start(); err != nil {
				log.Fatalf("SIP Sniffer error: %v", err)
			}
		}()
	}

	// RTP PCAP Sniffer（场景 2/3/4: 本机网卡抓 RTP）
	if config.Global.GetBool("sniffer.rtp_pcap_enabled") {
		log.Println("[MODE] Starting RTP PCAP sniffer")
		go func() {
			if err := rtp.GlobalSniffer.Start(); err != nil {
				log.Printf("Failed to start RTP sniffer: %v", err)
			}
		}()
	}

	// ── SIPREC Mode: Start SIP TCP Server for native SIPREC recording sessions ──
	var siprecServer *siprec.SIPTCPServer
	if config.Global.GetBool("siprec.enabled") {
		siprecPort := config.Global.GetInt("siprec.port")
		if siprecPort == 0 {
			siprecPort = 5080
		}
		rtpMin := config.Global.GetInt("siprec.rtp_port_min")
		if rtpMin == 0 {
			rtpMin = 30000
		}
		rtpMax := config.Global.GetInt("siprec.rtp_port_max")
		if rtpMax == 0 {
			rtpMax = 40000
		}
		localIP := config.Global.GetString("siprec.local_ip")
		if localIP == "" {
			localIP = config.Global.GetString("sip.public_ip")
		}

		portPool := siprec.NewPortPool(rtpMin, rtpMax)
		siprecServer = siprec.NewSIPTCPServer(siprecPort, localIP, portPool)

		// 共享 Pipeline 在 HEP 启动时已初始化，否则在上方 else 分支初始化
		// 无需额外处理

		if err := siprecServer.Start(); err != nil {
			log.Fatalf("SIPREC Server error: %v", err)
		}
		log.Printf("[SIPREC] Server started on port %d (RTP ports: %d-%d)", siprecPort, rtpMin, rtpMax)
	}

	// ── PCI-DSS: DTMF Suppression + Recording Pause/Resume ──
	if config.Global.GetBool("recording.dtmf_suppression") {
		pcap.DTMFSuppressEnabled = true
		pcap.SuppressDTMFCallback = rtp.SuppressDTMF
		log.Println("[PCI-DSS] DTMF suppression enabled for PCAP recordings")
	}
	pcap.PauseCheckCallback = rtp.GetRecordingControl().IsPaused
	api.RecordingPauseCallback = rtp.GetRecordingControl().Pause
	api.RecordingResumeCallback = rtp.GetRecordingControl().Resume
	api.RecordingIsPausedCallback = rtp.GetRecordingControl().IsPaused

	// ── Policy-Based Retention: Automatic PCAP cleanup ──
	retentionPolicy := pcap.RetentionPolicy{
		Enabled:           config.Global.GetBool("recording.retention.enabled"),
		MaxAgeDays:        config.Global.GetInt("recording.retention.max_age_days"),
		MaxSizeGB:         config.Global.GetFloat64("recording.retention.max_size_gb"),
		ScanIntervalHours: config.Global.GetInt("recording.retention.scan_interval_hours"),
	}
	pcap.StartRetentionWorker(retentionPolicy)

	// Start Behavior Publisher (C2-P1) — collects snapshots from all active streams every 5s
	behaviorPublisher := rtp.NewBehaviorPublisher(rtp.GlobalSniffer)
	behaviorPublisher.Start()

	// Start RTP Quality Publisher — computes & publishes MOS from RTP packets every 3s
	qualityPublisher := rtp.NewRTPQualityPublisher()
	go qualityPublisher.Start()

	// Start SIP online status cleanup goroutine (cleans expired ZSET entries)
	sipOnlineStop := make(chan struct{})
	hep.StartSIPOnlineCleanup(sipOnlineStop)

	// 6. Start HTTP API Server (Monitoring Control + Config Reload)
	httpAPIPort := config.Global.GetString("http.port")
	if httpAPIPort == "" {
		httpAPIPort = "8081"
	}
	go func() {
		mux := http.NewServeMux()

		// Initialize middleware (load trusted sources + CORS from config)
		api.InitMiddleware()

		// Set up ASR control callbacks
		api.EnableASRCallback = rtp.GlobalSniffer.EnableASRForCall
		api.DisableASRCallback = rtp.GlobalSniffer.DisableASRForCall
		api.GetASRStatusCallback = rtp.GlobalSniffer.GetASRStatus

		// Monitoring Control APIs (wrapped with IP restriction middleware)
		mux.HandleFunc("/api/monitoring/update", api.RequireLocalAccess(api.HandleMonitoringUpdate))
		mux.HandleFunc("/api/monitoring/status", api.RequireLocalAccess(api.HandleMonitoringStatus))

		// ASR Control APIs (wrapped with IP restriction middleware)
		mux.HandleFunc("/api/asr/enable", api.RequireLocalAccess(api.HandleASRControl))
		mux.HandleFunc("/api/asr/disable", api.RequireLocalAccess(api.HandleASRControl))
		mux.HandleFunc("/api/asr/status", api.RequireLocalAccess(api.HandleASRStatus))

		// Recording Control APIs (PCI-DSS: pause/resume recording)
		mux.HandleFunc("/api/recording/pause", api.RequireLocalAccess(api.HandleRecordingPause))
		mux.HandleFunc("/api/recording/resume", api.RequireLocalAccess(api.HandleRecordingResume))
		mux.HandleFunc("/api/recording/status", api.RequireLocalAccess(api.HandleRecordingStatus))

		// Demo API: Synchronous ASR transcription (for admin-ui demo page)
		mux.HandleFunc("/api/demo/transcribe", api.RequireLocalAccess(audio.DemoTranscribeHandler))
		// Demo API: WebSocket streaming ASR transcription
		mux.HandleFunc("/api/demo/transcribe/ws", api.RequireLocalAccess(audio.DemoTranscribeWSHandler))
		// Demo API: WebSocket streaming Emotion analysis
		mux.HandleFunc("/api/demo/emotion/ws", api.RequireLocalAccess(audio.DemoEmotionWSHandler))
		// Demo API: HTTP Emotion Configuration Status
		mux.HandleFunc("/api/demo/emotion/status", api.RequireLocalAccess(audio.DemoEmotionStatusHandler))

		// Audio Ingestion APIs (External entry points for raw PCM pushes)
		mux.HandleFunc("/api/audio/ingest", api.RequireLocalAccess(audio.AudioIngestHandler))
		mux.HandleFunc("/api/audio/stream", api.RequireLocalAccess(audio.StreamAudioHandler))

		// Demo API: Real IE VAD analysis (Silero/RMS)
		// Inject VAD and ASR creation functions to avoid import cycles (demovad has no rtp/audio imports)
		demovad.CreateVADFunc = func(threshold float32) (demovad.VADInstance, string) {
			vad := rtp.NewSileroVAD(threshold)
			vadMode := "rms"
			if err := rtp.TryInitializeSileroForDemo(vad); err == nil && vad.IsAvailable() {
				vadMode = "silero"
			}
			return vad, vadMode
		}
		demovad.TranscribeFunc = func(audioData []byte, sampleRate int, language string, r *http.Request) (map[string]interface{}, error) {
			provider := audio.GetCurrentASRProvider()
			result, err := provider.Transcribe(audioData, sampleRate, language)
			if err != nil {
				return nil, err
			}
			resp := map[string]interface{}{
				"text":       result.Text,
				"confidence": result.Confidence,
				"is_final":   result.IsFinal,
			}
			cfg := audio.GetDynamicASRConfig()
			if cfg != nil {
				resp["provider"] = cfg.Provider
				resp["vendor_id"] = cfg.VendorID
			}
			return resp, nil
		}
		mux.HandleFunc("/api/demo/vad", api.RequireLocalAccess(demovad.HandleDemoVAD))
		mux.HandleFunc("/api/demo/transcribe-with-vad", api.RequireLocalAccess(demovad.HandleDemoTranscribeWithVAD))

		// SER API: Speech Emotion Recognition (ONNX wav2vec2 model)
		serAnalyzer := ser.GetAnalyzer()
		if !serAnalyzer.IsInitialized() {
			log.Printf("[SER] SER analyzer not initialized — /ser/analyze endpoint will not be registered")
		} else {
			mux.HandleFunc("/ser/analyze", api.RequireLocalAccess(ser.StandaloneHandler(serAnalyzer)))
			log.Println("[SER] Registered /ser/analyze on HTTP API server")
		}

		// AI Models visibility API (returns loaded ONNX models for admin dashboard)
		mux.HandleFunc("/api/system/ai-models", api.RequireLocalAccess(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			models := onnxManager.GetLoadedModels()
			json.NewEncoder(w).Encode(map[string]interface{}{
				"onnx_ready": onnxManager.IsReady(),
				"models":     models,
			})
		}))

		// NOTE: TextFilter (MiniLM / Toxic detection) has been migrated to the
		// centralized Python SER service, called by App-Server (Node.js).
		// IE no longer performs text analysis — it focuses on audio capture & ASR.

		// Config Reload API (wrapped with IP restriction middleware)
		mux.HandleFunc("/api/config/reload", api.RequireLocalAccess(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodPost {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}

			log.Println("Reloading configuration...")
			if err := viper.ReadInConfig(); err != nil {
				log.Printf("Error reloading config: %v", err)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(map[string]string{
					"error": "Failed to reload configuration",
				})
				return
			}

			// Reload trusted sources and CORS config
			api.InitMiddleware()

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]string{
				"message": "Configuration reloaded",
			})
		}))

		// ASR Config Hot-Reload API (called by App Server when vendor is activated)
		// IP restriction is handled by RequireLocalAccess middleware
		mux.HandleFunc("/api/config/asr-reload", api.RequireLocalAccess(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")

			if r.Method != http.MethodPost {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}

			// Limit request body size
			r.Body = http.MaxBytesReader(w, r.Body, asrReloadMaxBodySize)

			var req struct {
				VendorID string `json:"vendor_id"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.VendorID == "" {
				log.Printf("Failed to decode ASR reload request: %v", err)
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{"error": "vendor_id is required"})
				return
			}

			log.Printf("ASR hot-reload request: vendorId=%s", req.VendorID)

			// Read vendor config from Redis
			if redis.Client == nil {
				w.WriteHeader(http.StatusServiceUnavailable)
				json.NewEncoder(w).Encode(map[string]string{"error": "Redis not available"})
				return
			}

			redisKey := "asr:vendor:" + req.VendorID
			result, err := redis.Client.HGetAll(redis.Ctx(), redisKey).Result()
			if err != nil || len(result) == 0 {
				log.Printf("Vendor config not found in Redis: key=%s, err=%v", redisKey, err)
				w.WriteHeader(http.StatusNotFound)
				json.NewEncoder(w).Encode(map[string]string{"error": "vendor not found in Redis"})
				return
			}

			poolSize, _ := strconv.Atoi(result["pool_size"])
			cfg := audio.DynamicASRConfig{
				Provider:     result["provider"],
				URL:          result["url"],
				APIKey:       result["api_key"],
				Model:        result["model"],
				PoolSize:     poolSize,
				VendorID:     req.VendorID,
				CustomParams: result["custom_params"],
			}

			if err := audio.SetDynamicASRConfig(cfg); err != nil {
				log.Printf("ASR hot-reload failed: %v", err)
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
				return
			}

			log.Printf("[ASR] Hot-reload applied: vendor=%s provider=%s model=%s pool=%d customParams=%q",
				cfg.VendorID, cfg.Provider, cfg.Model, cfg.PoolSize, cfg.CustomParams)

			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]string{
				"message":   "ASR config reloaded",
				"provider":  cfg.Provider,
				"vendor_id": cfg.VendorID,
			})
		}))

		// Prometheus metrics endpoint (custom registry — no Go runtime stats)
		mux.Handle("/metrics", metrics.Handler())

		// pprof — enabled only when PPROF_ENABLED=true (never expose in production without auth)
		if os.Getenv("PPROF_ENABLED") == "true" {
			log.Println("[pprof] Profiling endpoints enabled on /debug/pprof/")
			for _, route := range []string{
				"/debug/pprof/",
				"/debug/pprof/cmdline",
				"/debug/pprof/profile",
				"/debug/pprof/symbol",
				"/debug/pprof/trace",
			} {
				route := route // capture loop var
				mux.Handle(route, http.DefaultServeMux)
			}
		}

		// Health Check — rich subsystem metrics
		mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")

			response := map[string]interface{}{
				"status":         "ok",
				"version":        "dev-beta", // Statically defined IE version fallback
				"uptime_seconds": int(time.Since(startTime).Seconds()),
			}

			// ASR pool stats
			asrInfo := map[string]interface{}{
				"provider": config.Global.GetString("asr.provider"),
			}
			// Get stats for the primary dashscope pool
			if poolStats := audio.GetVendorPoolStats("dashscope"); poolStats != nil {
				asrInfo["pool"] = poolStats
			} else {
				asrInfo["pool"] = "not_initialized"
			}
			response["asr"] = asrInfo

			// RTP sniffer stats
			if rtp.GlobalSniffer != nil {
				response["rtp"] = rtp.GlobalSniffer.Stats()
			}

			// Session manager stats
			if callsession.GlobalManager != nil {
				response["sessions"] = map[string]interface{}{
					"active": callsession.GlobalManager.ActiveSessionCount(),
				}
			}

			// AI Subsystems status (SER & ONNX)
			aiStatus := map[string]interface{}{}
			if config.Global.GetBool("ser.enabled") {
				if ser.GetAnalyzer().IsInitialized() {
					aiStatus["ser"] = "initialized"
				} else {
					aiStatus["ser"] = "degraded_or_failed"
					response["status"] = "degraded"
				}
			} else {
				aiStatus["ser"] = "disabled"
			}
			aiStatus["onnx_v2"] = onnxManager.IsReady()
			response["ai"] = aiStatus

			// Dependency health checks
			deps := map[string]interface{}{}
			if redis.Client != nil {
				if err := redis.Client.Ping(redis.Ctx()).Err(); err != nil {
					deps["redis"] = "error: " + err.Error()
					response["status"] = "degraded"
				} else {
					deps["redis"] = "ok"
				}
			} else {
				deps["redis"] = "not_initialized"
			}
			if err := clickhouse.Ping(); err != nil {
				deps["clickhouse"] = "error: " + err.Error()
				response["status"] = "degraded"
			} else {
				deps["clickhouse"] = "ok"
			}
			response["dependencies"] = deps

			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(response)
		})

		httpServer = &http.Server{
			Addr:        ":" + httpAPIPort,
			Handler:     mux,
			ReadTimeout: 15 * time.Second,
			// WriteTimeout set high to accommodate WebSocket endpoints
			// (/api/demo/transcribe/ws, /api/demo/emotion/ws)
			WriteTimeout: 5 * time.Minute,
			IdleTimeout:  60 * time.Second,
		}

		log.Printf("HTTP API Server starting on port %s", httpAPIPort)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP API Server error: %v", err)
		}
	}()

	// 7. Graceful Shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// Correct shutdown order: flush first, cancel context last.
	// Stops accepting → drains publishers → flushes writers → cancels context → closes connections.

	// 7a. Stop HTTP API server (stop accepting new requests)
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	if httpServer != nil {
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			log.Printf("HTTP server shutdown error: %v", err)
		} else {
			log.Println("HTTP server stopped")
		}
	}

	// 7b. Stop SIP online cleanup goroutine
	close(sipOnlineStop)
	log.Println("SIP online cleanup stopped")

	// 7c. Stop Behavior Publisher (C2-P1, before sniffer stop)
	behaviorPublisher.Stop()
	log.Println("BehaviorPublisher stopped")

	// 7c-2. Stop RTP Quality Publisher
	qualityPublisher.Stop()
	log.Println("RTPQualityPublisher stopped")

	// 7c-3. Stop SIPREC Server (if enabled)
	if siprecServer != nil {
		siprecServer.Stop()
		log.Println("SIPREC server stopped")
	}

	// 7c. Stop HEP Server (close UDP/TCP listeners + flush batch writers)
	hep.StopHEPServer()
	log.Println("HEP server stopped")

	// 7c-4. Stop Retention Worker
	pcap.StopRetentionWorker()
	log.Println("Retention worker stopped")

	// 7d. Stop RTP Sniffer (stop timeout monitor)
	rtp.GlobalSniffer.Stop()
	log.Println("RTP sniffer stopped")

	// 7d. Stop CallSession Manager (stop session expiration checks)
	callsession.GlobalManager.Stop()
	log.Println("CallSession manager stopped")

	// 7e. Drain ASR connection pool (waits for active tasks, max 30s)
	audio.CloseGlobalPool()
	log.Println("ASR connection pool drained")

	// 7f. Flush and close all PCAP recorders
	pcap.CloseAll()
	log.Println("PCAP recorders flushed")

	// 7g. Stop async event publisher (drain remaining events while Redis is still open)
	if redis.GlobalEventPublisher != nil {
		redis.GlobalEventPublisher.Stop()
		log.Println("EventPublisher drained")
	}

	// 7h. Flush and stop additional batch writers (before context cancel)
	if clickhouse.GlobalSipCallWriter != nil {
		clickhouse.GlobalSipCallWriter.Stop()
		log.Println("SipCall batch writer flushed")
	}
	if clickhouse.GlobalTranscriptionWriter != nil {
		clickhouse.GlobalTranscriptionWriter.Stop()
		log.Println("Transcription batch writer flushed")
	}
	if clickhouse.GlobalQualityWriter != nil {
		clickhouse.GlobalQualityWriter.Stop()
		log.Println("Quality batch writer flushed")
	}
	if clickhouse.GlobalRTCPWriter != nil {
		clickhouse.GlobalRTCPWriter.Stop()
		log.Println("RTCP batch writer flushed")
	}

	// Cancel app-level context (after all flushes are complete)
	appCancel()

	// 7j. Close ClickHouse
	if err := clickhouse.Close(); err != nil {
		log.Printf("ClickHouse close error: %v", err)
	} else {
		log.Println("ClickHouse closed")
	}

	// 7k. Close Redis
	if err := redis.Close(); err != nil {
		log.Printf("Redis close error: %v", err)
	} else {
		log.Println("Redis closed")
	}

	// 7l. Destroy ONNX environment (after all models are done)
	onnxManager.DestroyEnvironment()
	log.Println("ONNX environment destroyed")

	log.Println("Server shutdown complete")
}
