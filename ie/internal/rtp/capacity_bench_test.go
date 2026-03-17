package rtp

import (
	"runtime"
	"sync"
	"testing"
	"time"
)

// BenchmarkConcurrentStreams_10K 验证 10K 并发流的 sync.Map 读写性能。
// 模拟 10000 路同时活跃的 RTP stream，每路做 100 次 Load + Store 操作。
func BenchmarkConcurrentStreams_10K(b *testing.B) {
	benchmarkConcurrentStreams(b, 10000)
}

// BenchmarkConcurrentStreams_20K 验证 20K 并发流。
func BenchmarkConcurrentStreams_20K(b *testing.B) {
	benchmarkConcurrentStreams(b, 20000)
}

// BenchmarkConcurrentStreams_50K 验证 50K 并发流。
func BenchmarkConcurrentStreams_50K(b *testing.B) {
	benchmarkConcurrentStreams(b, 50000)
}

func benchmarkConcurrentStreams(b *testing.B, numStreams int) {
	s := NewSniffer()
	defer s.Stop()

	// 预注册 numStreams 个虚拟 stream
	for i := 0; i < numStreams; i++ {
		callID := generateCallID(i)
		stream := &RTPStream{
			callID:       callID,
			lastActivity: time.Now().UnixNano(),
		}
		s.virtualListeners.Store(callID+":"+"10.0.0.1", stream)
	}

	var memBefore, memAfter runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&memBefore)

	b.ResetTimer()
	for n := 0; n < b.N; n++ {
		var wg sync.WaitGroup
		wg.Add(numStreams)
		for i := 0; i < numStreams; i++ {
			go func(idx int) {
				defer wg.Done()
				callID := generateCallID(idx)
				key := callID + ":" + "10.0.0.1"
				// 每个 stream 做 100 次读写，模拟 100 个 RTP 包到达
				for j := 0; j < 100; j++ {
					val, ok := s.virtualListeners.Load(key)
					if ok {
						stream := val.(*RTPStream)
						stream.lastActivity = time.Now().UnixNano()
					}
				}
			}(i)
		}
		wg.Wait()
	}
	b.StopTimer()

	runtime.GC()
	runtime.ReadMemStats(&memAfter)

	heapMB := float64(memAfter.HeapAlloc-memBefore.HeapAlloc) / 1024 / 1024
	b.Logf("[%dK streams] 每 stream %d 次读写，堆内存增量 %.1f MB，goroutines %d",
		numStreams/1000, 100, heapMB, runtime.NumGoroutine())
}

func generateCallID(i int) string {
	// 用固定格式避免 fmt.Sprintf 的分配开销
	buf := make([]byte, 0, 16)
	buf = append(buf, "call-"...)
	n := i
	if n == 0 {
		buf = append(buf, '0')
	} else {
		digits := [10]byte{}
		pos := 0
		for n > 0 {
			digits[pos] = byte('0' + n%10)
			n /= 10
			pos++
		}
		for pos > 0 {
			pos--
			buf = append(buf, digits[pos])
		}
	}
	return string(buf)
}
