package ai

import (
	"path/filepath"
	"testing"
)

// TestONNXManager_InitAndDestroy tests the singleton initialization of ONNX Runtime
func TestONNXManager_InitAndDestroy(t *testing.T) {
	manager := GetONNXManager()
	if manager == nil {
		t.Fatal("GetONNXManager returned nil")
	}

	// Should not panic on destroy when not initialized
	manager.DestroyEnvironment()

	// Need a dummy models path. We use the same path resolution as SER.
	modelsDir := filepath.Join("..", "..", "models")
	err := manager.InitializeEnvironment(modelsDir)
	if err != nil {
		// Architecture mismatch (arm64 vs x86_64) or missing library — skip
		t.Skipf("Skipping ONNX init test (platform issue): %v", err)
	}

	if !manager.IsReady() {
		t.Error("ONNXManager should be ready after successful initialization")
	}

	// Calling initialize again should return an error (or a specific "already initialized" signal)
	// but it must NOT panic.
	err = manager.InitializeEnvironment(modelsDir)
	if err == nil {
		t.Error("Expected error when initializing an already running ONNX environment")
	}

	manager.DestroyEnvironment()
	if manager.IsReady() {
		t.Error("ONNXManager should not be ready after destruction")
	}
}

// TestONNXManager_ModelRegistration tests the model visibility registry
func TestONNXManager_ModelRegistry(t *testing.T) {
	manager := GetONNXManager()
	manager.RegisterModel("SER", "wav2vec2-onnx", "/fake/path/model.onnx")
	manager.RegisterModel("Silero VAD", "onnx", "/fake/path/vad.onnx")

	models := manager.GetLoadedModels()
	if len(models) != 2 {
		t.Fatalf("Expected 2 models, got %d", len(models))
	}

	foundSER := false
	for _, m := range models {
		if m.Name == "SER" {
			foundSER = true
			if m.Status != "active" {
				t.Errorf("Expected SER status to be active, got %s", m.Status)
			}
		}
	}

	if !foundSER {
		t.Error("SER model not found in registry")
	}

	// Cleanup test state
	manager.ClearRegistry()
}
