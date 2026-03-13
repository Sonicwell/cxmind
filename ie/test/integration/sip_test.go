//go:build integration
// +build integration

package integration

import (
	"context"
	"testing"
	"time"

	"github.com/cxmind/pcap-simulator/simulator"
	"github.com/spf13/viper"
)

func TestBasicCallAnswerAndBye(t *testing.T) {
	// Enable recordings for this test to verify PCAP generation
	viper.Set("recordings.enabled", true)
	defer viper.Set("recordings.enabled", false)

	// Ensure our standard test agents are ready in ClickHouse
	refreshMockAgents()

	simConfig := simulator.DefaultConfig()
	simConfig.Host = "127.0.0.1"
	simConfig.Port = 9060
	simConfig.Scenario = "answer"
	simConfig.Duration = 3 // Generate 3 seconds of media
	simConfig.Mode = "hep"
	simConfig.Transport = "udp"
	// Set IP strings matching the mock dictionaries
	simConfig.CustomerIP = "1.1.1.1:5060"
	simConfig.AgentIP = "10.0.0.10:5060"
	simConfig.Direction = "inbound"

	client, err := simulator.NewClient(simConfig)
	if err != nil {
		t.Fatalf("Failed to initialize simulator client: %v", err)
	}
	defer client.Close()

	callID := client.GenerateCallID()

	// Capture the start time to ensure DB assertions fall within logical boundaries
	testStartTime := time.Now()

	t.Logf("Running test scenario %s for call ID: %s", simConfig.Scenario, callID)
	if err := client.RunSingleCall(callID); err != nil {
		t.Fatalf("Simulator failed to run call: %v", err)
	}

	// Give ClickHouse BatchWriters time to flush (set to 100ms in TestMain)
	time.Sleep(500 * time.Millisecond)

	ctx := context.Background()

	// 1. Assert sip_calls Table
	callRecord, err := fetchSipCallFromDB(ctx, callID)
	if err != nil {
		t.Fatalf("Failed to fetch sip_call record: %v", err)
	}
	if callRecord.Status != "completed" {
		t.Errorf("Expected call status 'completed', got %q", callRecord.Status)
	}
	if callRecord.Direction != "inbound" {
		t.Errorf("Expected call direction 'inbound', got %q", callRecord.Direction)
	}
	if callRecord.Duration < 2 || callRecord.Duration > 4 {
		t.Errorf("Expected call duration approx 3s, got %d", callRecord.Duration)
	}
	if callRecord.StartTime.Before(testStartTime) {
		t.Errorf("Call start time looks invalid: %v vs %v", callRecord.StartTime, testStartTime)
	}

	// Verified dictionary lookup correctly resolved the client ID!
	if callRecord.ClientID != "test_client_1" {
		t.Errorf("Expected resolved client_id 'test_client_1', got %q", callRecord.ClientID)
	}

	// 2. Assert sip_messages Table
	messages, err := fetchSipMessagesFromDB(ctx, callID)
	if err != nil {
		t.Fatalf("Failed to fetch sip_messages: %v", err)
	}
	// "180" and "200" are status codes mapped by our helper
	expectedMessages := []string{"INVITE", "180", "200", "ACK", "BYE"}
	AssertSipMethodsExist(t, messages, expectedMessages)

	// 3. Assert call_events Table
	events, err := fetchCallEventsFromDB(ctx, callID)
	if err != nil {
		t.Fatalf("Failed to fetch call_events: %v", err)
	}
	expectedEvents := []string{"call_create", "caller_ringing", "call_answer", "call_hangup"}
	AssertEventsExist(t, events, expectedEvents)

	// 4. Assert quality_metrics Table (RTCP statistics)
	metrics, err := fetchQualityMetricsFromDB(ctx, callID)
	if err != nil {
		t.Fatalf("Failed to fetch quality_metrics: %v", err)
	}
	if len(metrics) == 0 {
		t.Errorf("Expected quality_metrics to be generated from RTCP streams, but none found")
	}

	// 5. Verify PCAP recording
	AssertPcapFileGenerated(t, callID)

	// 6. Assert Redis cleanup
	AssertRedisCallStateCleaned(t, callID)
}

func TestCallCancel(t *testing.T) {
	refreshMockAgents()

	simConfig := simulator.DefaultConfig()
	simConfig.Host = "127.0.0.1"
	simConfig.Port = 9060
	simConfig.Scenario = "cancel"
	simConfig.Duration = 1 // short delay before cancel
	simConfig.Mode = "hep"
	simConfig.Transport = "udp"
	simConfig.CustomerIP = "1.1.1.1:5060"
	simConfig.AgentIP = "10.0.0.10:5060"
	simConfig.Direction = "inbound"

	client, err := simulator.NewClient(simConfig)
	if err != nil {
		t.Fatalf("Failed to initialize simulator client: %v", err)
	}
	defer client.Close()

	callID := client.GenerateCallID()

	if err := client.RunSingleCall(callID); err != nil {
		t.Fatalf("Simulator failed to run call: %v", err)
	}

	time.Sleep(500 * time.Millisecond)

	ctx := context.Background()

	// Assert sip_calls Table
	callRecord, err := fetchSipCallFromDB(ctx, callID)
	if err != nil {
		t.Fatalf("Failed to fetch sip_call record: %v", err)
	}
	if callRecord.Status != "missed" && callRecord.Status != "failed" { // Assuming canceled is missed or failed
		t.Errorf("Expected call status 'missed' or 'failed', got %q", callRecord.Status)
	}

	// Assert sip_messages Table
	messages, err := fetchSipMessagesFromDB(ctx, callID)
	if err != nil {
		t.Fatalf("Failed to fetch sip_messages: %v", err)
	}
	// "180" Ringing, "CANCEL", "200" (for cancel), "487" Request Terminated, "ACK"
	expectedMessages := []string{"INVITE", "180", "CANCEL", "200", "487", "ACK"}
	AssertSipMethodsExist(t, messages, expectedMessages)

	// Assert call_events Table
	events, err := fetchCallEventsFromDB(ctx, callID)
	if err != nil {
		t.Fatalf("Failed to fetch call_events: %v", err)
	}
	expectedEvents := []string{"call_create", "caller_ringing", "call_cancel"} // Assuming call_cancel is emitted
	AssertEventsExist(t, events, expectedEvents)

	// Assert Redis cleanup
	AssertRedisCallStateCleaned(t, callID)
}

func TestCallReject(t *testing.T) {
	refreshMockAgents()

	simConfig := simulator.DefaultConfig()
	simConfig.Host = "127.0.0.1"
	simConfig.Port = 9060
	simConfig.Scenario = "reject"
	simConfig.Duration = 1
	simConfig.Mode = "hep"
	simConfig.Transport = "udp"
	simConfig.CustomerIP = "1.1.1.1:5060"
	simConfig.AgentIP = "10.0.0.10:5060"
	simConfig.Direction = "inbound"

	client, err := simulator.NewClient(simConfig)
	if err != nil {
		t.Fatalf("Failed to initialize simulator client: %v", err)
	}
	defer client.Close()

	callID := client.GenerateCallID()

	if err := client.RunSingleCall(callID); err != nil {
		t.Fatalf("Simulator failed to run call: %v", err)
	}

	time.Sleep(500 * time.Millisecond)

	ctx := context.Background()

	// Assert sip_calls Table
	callRecord, err := fetchSipCallFromDB(ctx, callID)
	if err != nil {
		t.Fatalf("Failed to fetch sip_call record: %v", err)
	}
	if callRecord.Status != "failed" { // Assuming reject is mapped to failed
		t.Errorf("Expected call status 'failed', got %q", callRecord.Status)
	}

	// Assert call_events Table
	events, err := fetchCallEventsFromDB(ctx, callID)
	if err != nil {
		t.Fatalf("Failed to fetch call_events: %v", err)
	}
	expectedEvents := []string{"call_create", "call_fail"} // 486 busy here is a failure
	AssertEventsExist(t, events, expectedEvents)

	// Assert Redis cleanup
	AssertRedisCallStateCleaned(t, callID)
}
