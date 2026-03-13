package ser

import (
	"reflect"
	"testing"
)

func TestResamplePCM(t *testing.T) {
	// 4 samples, values: 0, 1000, 2000, 3000
	pcmIn := []byte{
		0x00, 0x00, // 0
		0xE8, 0x03, // 1000
		0xD0, 0x07, // 2000
		0xB8, 0x0B, // 3000
	}

	// Same rate -> should return exact same slice
	outSame := resamplePCM(pcmIn, 8000, 8000)
	if !reflect.DeepEqual(outSame, pcmIn) {
		t.Errorf("Expected identical output for same sample rate, got %v", outSame)
	}

	// Double rate: 8000 -> 16000
	// We expect 8 samples out.
	outDouble := resamplePCM(pcmIn, 8000, 16000)
	if len(outDouble) != 16 { // 8 samples * 2 bytes
		t.Errorf("Expected 16 bytes output, got %d", len(outDouble))
	}

	// Just check the first few interpolated values
	// Expected roughly: 0, 500, 1000, 1500, 2000, 2500, 3000, 3000
	// 500 in hex is 01F4
	val1 := int16(outDouble[2]) | int16(outDouble[3])<<8
	if val1 != 500 {
		t.Errorf("Expected interpolated value 500, got %d", val1)
	}
}

func TestResampleLinear(t *testing.T) {
	input := []float32{0.0, 0.5, 1.0}

	// Same rate
	outSame := ResampleLinear(input, 16000, 16000)
	if !reflect.DeepEqual(outSame, input) {
		t.Errorf("Expected identical output for same sample rate, got %v", outSame)
	}

	// Double rate: 3 samples -> ceil(3 * 2) = 6 samples
	outDouble := ResampleLinear(input, 8000, 16000)
	if len(outDouble) != 6 {
		t.Errorf("Expected 6 samples output, got %d", len(outDouble))
	}

	// Check interpolated values
	expected := []float32{0.0, 0.25, 0.5, 0.75, 1.0, 1.0}
	for i, v := range expected {
		if outDouble[i] != v {
			t.Errorf("At index %d expected %f, got %f", i, v, outDouble[i])
		}
	}
}
