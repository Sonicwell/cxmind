package main

import (
	"flag"
	"log"
	"os"
	"sync"
	"time"

	"github.com/cxmind/pcap-simulator/simulator"
)

var (
	host            string
	port            int
	count           int
	scenario        string
	direction       string
	duration        int
	mode            string
	transport       string
	outputFile      string
	authKey         string
	useSRTP         bool
	perfectQual     bool
	agentIP         string
	customerIP      string
	upstreamFile    string
	downstreamFile  string
	inputFile       string
	upstreamAudio   []byte
	downstreamAudio []byte
	sipOnly         bool
	speed           float64
)

func main() {
	flag.StringVar(&host, "host", "localhost", "Target HEP server IP")
	flag.IntVar(&port, "port", 9060, "Target HEP server port")
	flag.IntVar(&count, "count", 1, "Number of calls to simulate")
	flag.StringVar(&scenario, "scenario", "answer", "answer, reject, cancel, busy")
	flag.StringVar(&direction, "direction", "inbound", "inbound, outbound")
	flag.IntVar(&duration, "duration", 5, "Call duration in sec")
	flag.StringVar(&mode, "mode", "hep", "hep, pcap, siprec, replay")
	flag.StringVar(&transport, "transport", "udp", "udp, tcp")
	flag.StringVar(&outputFile, "output", "output.pcap", "Output PCAP filename")
	flag.StringVar(&authKey, "authKey", "", "HEP Auth Key")
	flag.BoolVar(&useSRTP, "srtp", false, "Enable SRTP encryption (dummy in Go so far)")
	flag.BoolVar(&perfectQual, "perfect-quality", false, "Disable packet loss/jitter")
	flag.StringVar(&agentIP, "agent", "1.1.1.1:5060", "Agent SIP URI or IP")
	flag.StringVar(&customerIP, "customer", "8.8.8.8:5060", "Customer SIP URI or IP")
	flag.StringVar(&upstreamFile, "upstream", "", "Path to upstream MP3/WAV file")
	flag.StringVar(&downstreamFile, "downstream", "", "Path to downstream MP3/WAV file")
	flag.StringVar(&inputFile, "input", "", "Path to input PCAP file (replay mode)")
	flag.BoolVar(&sipOnly, "sip-only", false, "Replay only SIP packets, skip RTP/RTCP")
	flag.Float64Var(&speed, "speed", 0, "Replay speed: 0=fixed 500ms interval (default), 1=realtime pcap timing, 2=2x fast")
	flag.Parse()

	log.Printf("Starting simulator CLI: mode=%s, count=%d, dir=%s, scenario=%s", mode, count, direction, scenario)

	cfg := simulator.Config{
		Host:           host,
		Port:           port,
		Count:          count,
		Scenario:       scenario,
		Direction:      direction,
		Duration:       duration,
		Mode:           mode,
		Transport:      transport,
		OutputFile:     outputFile,
		AuthKey:        authKey,
		UseSRTP:        useSRTP,
		PerfectQual:    perfectQual,
		AgentIP:        agentIP,
		CustomerIP:     customerIP,
		UpstreamFile:   upstreamFile,
		DownstreamFile: downstreamFile,
	}

	client, err := simulator.NewClient(cfg)
	if err != nil {
		log.Fatalf("Failed to initialize simulator client: %v", err)
	}
	defer client.Close()

	if mode == "replay" {
		if inputFile == "" {
			log.Fatalf("replay mode requires -input <pcap file>")
		}
		if _, err := os.Stat(inputFile); os.IsNotExist(err) {
			log.Fatalf("input file not found: %s", inputFile)
		}

		opts := simulator.ReplayOptions{
			SIPOnly: sipOnly,
			Speed:   speed,
		}
		log.Printf("🔄 Replaying PCAP: %s (sip-only=%v, speed=%.1fx)", inputFile, sipOnly, speed)
		newCallID, err := client.ReplayPCAPFileWithOptions(inputFile, "", opts)
		if err != nil {
			log.Fatalf("Replay failed: %v", err)
		}
		log.Printf("✅ Replay finished. New Call-ID: %s", newCallID)
		return
	}

	var wg sync.WaitGroup

	for i := 0; i < count; i++ {
		wg.Add(1)

		// Throttle goroutine startup slightly to avoid immediate CPU choke on huge counts
		time.Sleep(2 * time.Millisecond)

		go func() {
			defer wg.Done()
			callID := client.GenerateCallID()
			if err := client.RunSingleCall(callID); err != nil {
				log.Printf("Call %s failed: %v", callID, err)
			}
		}()
	}

	wg.Wait()
	log.Println("All calls finished simulation.")
}
