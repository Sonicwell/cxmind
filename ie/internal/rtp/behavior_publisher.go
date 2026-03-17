package rtp

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/cxmind/ingestion-go/internal/redis"
)

// BehaviorPublishInterval is how often behavior snapshots are collected and published.
const BehaviorPublishInterval = 5 * time.Second

// BehaviorPublisher periodically collects BehaviorSnapshots from all active
// RTP streams and publishes them to Redis for AS consumption.
//
// Design: Single goroutine with 5s ticker. On each tick:
// 1. Range over listeners + virtualListeners (lock-free sync.Map)
// 2. For each stream with a behavior collector: call Snapshot() (auto-resets)
// 3. Batch-publish all snapshots to Redis `call:behavior:{callId}`
//
// This avoids per-stream timers and keeps Redis PUBLISH rate at ~1/5s per call.
type BehaviorPublisher struct {
	sniffer *Sniffer
	stopCh  chan struct{}
	wg      sync.WaitGroup
}

// NewBehaviorPublisher creates a publisher bound to the given sniffer.
func NewBehaviorPublisher(sniffer *Sniffer) *BehaviorPublisher {
	return &BehaviorPublisher{
		sniffer: sniffer,
		stopCh:  make(chan struct{}),
	}
}

// Start begins the periodic snapshot collection loop.
func (bp *BehaviorPublisher) Start() {
	bp.wg.Add(1)
	go bp.loop()
	log.Printf("[C2-P1] BehaviorPublisher started (interval=%s)", BehaviorPublishInterval)
}

// Stop signals the loop to exit and waits for completion.
func (bp *BehaviorPublisher) Stop() {
	close(bp.stopCh)
	bp.wg.Wait()
	log.Printf("[C2-P1] BehaviorPublisher stopped")
}

func (bp *BehaviorPublisher) loop() {
	defer bp.wg.Done()
	ticker := time.NewTicker(BehaviorPublishInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			bp.collectAndPublish()
		case <-bp.stopCh:
			return
		}
	}
}

// collectAndPublish iterates all active streams, collects snapshots,
// and publishes them to Redis.
func (bp *BehaviorPublisher) collectAndPublish() {
	var snapshots []*BehaviorSnapshot

	// Collect from port-based listeners
	bp.sniffer.listeners.Range(func(_, value any) bool {
		stream := value.(*RTPStream)
		if stream.isRTCP {
			return true
		}
		if stream.behavior == nil {
			return true
		}
		snap := stream.behavior.Snapshot()
		if snap.AgentTalkMs > 0 || snap.CustTalkMs > 0 {
			snap.AgentID = stream.agentID
			snapshots = append(snapshots, snap)
		}
		return true
	})

	// Collect from virtual listeners (HEP streams)
	bp.sniffer.virtualListeners.Range(func(_, value any) bool {
		stream := value.(*RTPStream)
		if stream.isRTCP {
			return true
		}
		if stream.behavior == nil {
			return true
		}
		snap := stream.behavior.Snapshot()
		if snap.AgentTalkMs > 0 || snap.CustTalkMs > 0 {
			snap.AgentID = stream.agentID
			snapshots = append(snapshots, snap)
		}
		return true
	})

	if len(snapshots) == 0 {
		return
	}

	// Publish each snapshot to its own channel
	for _, snap := range snapshots {
		data, err := json.Marshal(snap)
		if err != nil {
			log.Printf("[C2-P1] Failed to marshal behavior snapshot for call %s: %v", snap.CallID, err)
			continue
		}
		channel := "call:behavior:" + snap.CallID
		if redis.Client != nil {
			if err := redis.Client.Publish(redis.Ctx(), channel, data).Err(); err != nil {
				log.Printf("[C2-P1] Failed to publish behavior snapshot for call %s: %v", snap.CallID, err)
			}
		}
	}

	log.Printf("[C2-P1] Published %d behavior snapshots", len(snapshots))
}
