package ai

import (
	"errors"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"github.com/cxmind/ingestion-go/internal/timeutil"
	ort "github.com/yalue/onnxruntime_go"
)

// ModelInfo represents a loaded AI model to be shown via the API
type ModelInfo struct {
	Name        string    `json:"name"`
	Type        string    `json:"type"`
	Status      string    `json:"status"`
	Path        string    `json:"path"`
	MemoryUsage string    `json:"memory_usage"` // Optional/Mocked for now
	LoadedAt    time.Time `json:"loaded_at"`
}

// ONNXManager provides a safe singleton environment for ONNX Runtime CGO library.
type ONNXManager struct {
	mu           sync.Mutex
	isReady      bool
	libPath      string
	loadedModels map[string]*ModelInfo
}

var (
	globalManager *ONNXManager
	managerOnce   sync.Once
)

// GetONNXManager returns the global singleton manager.
func GetONNXManager() *ONNXManager {
	managerOnce.Do(func() {
		globalManager = &ONNXManager{
			loadedModels: make(map[string]*ModelInfo),
		}
	})
	return globalManager
}

// onnxLibName returns the platform-specific ONNX Runtime library name.
func onnxLibName() string {
	switch runtime.GOOS {
	case "darwin":
		return "libonnxruntime.dylib"
	case "windows":
		return "onnxruntime.dll"
	default:
		return "libonnxruntime.so"
	}
}

// InitializeEnvironment loads the ONNX runtime library.
func (m *ONNXManager) InitializeEnvironment(modelsDir string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.isReady {
		return errors.New("ONNX environment is already initialized")
	}

	m.libPath = filepath.Join(modelsDir, onnxLibName())
	ort.SetSharedLibraryPath(m.libPath)

	err := ort.InitializeEnvironment()
	if err != nil {
		return err
	}

	m.isReady = true
	return nil
}

// DestroyEnvironment cleans up the global ONNX state.
func (m *ONNXManager) DestroyEnvironment() {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.isReady {
		ort.DestroyEnvironment()
		m.isReady = false
		m.loadedModels = make(map[string]*ModelInfo) // clear registry
	}
}

// IsReady checks if ONNX has been initialized globally.
func (m *ONNXManager) IsReady() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.isReady
}

// RegisterModel records a loaded model so it can be viewed by the API.
func (m *ONNXManager) RegisterModel(name, modelType, path string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.loadedModels[name] = &ModelInfo{
		Name:     name,
		Type:     modelType,
		Status:   "active",
		Path:     path,
		LoadedAt: timeutil.Now(),
	}
}

// GetLoadedModels returns a list of registered AI models.
func (m *ONNXManager) GetLoadedModels() []ModelInfo {
	m.mu.Lock()
	defer m.mu.Unlock()

	results := make([]ModelInfo, 0, len(m.loadedModels))
	for _, info := range m.loadedModels {
		results = append(results, *info)
	}
	return results
}

// ClearRegistry is mainly for testing.
func (m *ONNXManager) ClearRegistry() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.loadedModels = make(map[string]*ModelInfo)
}
