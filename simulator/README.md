# PCAP Simulator

A Go tool to generate synthetic SIP traffic for testing. Supports four modes:
1. **HEP Mode**: Sends HEPv3-encoded packets to a live server via UDP/TCP
2. **PCAP Mode**: Generates standard `.pcap` files for offline analysis
3. **SIPREC Mode**: Generates multipart/mixed INVITE packets with XML metadata for recording compliance testing
4. **Replay Mode**: Reads an existing `.pcap` file and sends all packets via HEP to a target server

## Requirements

- **Go**: v1.22+
- **FFmpeg**: Required ONLY if using `--upstream` or `--downstream` audio payload injection.

## Installation

1. **Clone & Build**:
   ```bash
   cd tools/pcap-simulator
   go mod download
   go build -o simulator_go main.go
   ```
2. **Audio Dependencies (Optional)**:
   If you plan to inject real audio payloads using `--upstream` or `--downstream`, ensure `ffmpeg` is installed on your system (e.g., `brew install ffmpeg` or `apt-get install ffmpeg`).

## Features

- Generates realistic SIP INVITE and 200 OK messages
- **HEP Mode**: Encodes packets in HEPv3 format (RFC 6347) and sends via UDP
- **PCAP Mode**: Creates standard libpcap format files
- Configurable host, port, call count, and output file
- Compatible with Wireshark, tcpdump, and other PCAP tools

## Usage

### HEP Mode (Live Transmission)

```bash
# Provide standalone build
go build -o simulator_go

# Run with defaults (localhost:9060, 1 call)
./simulator_go

# Custom configuration
./simulator_go --host 192.168.1.100 --port 9060 --count 50
```

### PCAP Mode (File Generation)

```bash
# Generate PCAP file with defaults
./simulator_go --mode pcap --output test.pcap

# Generate with custom call count
./simulator_go --mode pcap --output calls.pcap --count 20
```

### Replay Mode (PCAP Playback)

```bash
# Replay a pcap file to a local HEP server
./simulator_go -mode replay -input samples/astercc_inner_5001_5002.pcap -host 127.0.0.1 -port 9060 -authKey "my-secret-token"

# Fast replay (send at 10x speed relative to pcap timestamps)
./simulator_go -mode replay -input capture.pcap -host 10.0.1.50 -port 9060 -speed 10.0
```

## Options

- `--mode` - Operation mode: `hep` (default), `pcap`, `siprec`, or `replay`
- `--input` - Input PCAP file path - **Replay mode only**
- `--output` - Output PCAP filename (default: output.pcap) - PCAP mode only
- `--host` - HEP server hostname (default: localhost) - HEP/Replay mode
- `--port` - HEP server port (default: 9060) - HEP/Replay mode
- `--count` - Number of calls to simulate (default: 1)
- `--perfect-quality` - Disable simulated packet loss/jitter in generated RTCP RR reports
- `--sip-only` - Replay only SIP packets, skip RTP/RTCP (great for testing real-time stats)
- `--speed` - Replay speed: `0` = fixed 500ms interval (default), `1` = realtime pcap timing, `2.0+` = fast replay

## Testing Flow

### HEP Mode Testing

1. Start the Go Ingestion Service:
   ```bash
   cd ../../services/ingestion-go
   go run main.go
   ```

2. Run the simulator:
   ```bash
   ./simulator_go --count 5
   ```

3. Check the Go service logs for decoded HEP packets

### PCAP Mode Testing

1. Generate a PCAP file:
   ```bash
   ./simulator_go --mode pcap --output test.pcap --count 5
   ```

2. Analyze with Wireshark:
   ```bash
   wireshark test.pcap
   ```

3. Or use tcpdump:
   ```bash
   tcpdump -r test.pcap -n
   ```

## Packet Structure

### SIP Messages

Each simulated call generates:
1. **SIP INVITE** - From customer (192.168.1.100) to agent (192.168.1.200)
2. **SIP 200 OK** - Response from agent to customer

Both packets include:
- Realistic SIP headers (Via, From, To, Call-ID, etc.)
- SDP body with audio codec information

### HEP Mode Packet Structure

- HEPv3 metadata (timestamps, IPs, ports, correlation ID)
- Encapsulated SIP message as payload

### PCAP Mode Packet Structure

Complete network packets with all layers:
- **Ethernet Frame** (14 bytes)
- **IPv4 Header** (20 bytes)
- **UDP Header** (8 bytes)
- **SIP Payload** (variable)

## Examples

### Generate Test Data for Wireshark

```bash
# Create a PCAP with 100 calls
./simulator_go --mode pcap --output large-test.pcap --count 100

# Open in Wireshark
wireshark large-test.pcap
```

### Test HEP Server

```bash
# Send 10 calls to local HEP server
./simulator_go --mode hep --count 10

# Send to remote server
./simulator_go --mode hep --host 10.0.1.50 --port 9060 --count 25
```

### Filter PCAP with tcpdump

```bash
# Show only INVITE messages
tcpdump -r test.pcap -n | grep INVITE

# Show packet details
tcpdump -r test.pcap -n -vv
```

## Sample Files

The `samples/` directory contains pre-built PCAP files for common VoIP scenarios:

| File | Scenario |
|------|----------|
| `basic_call.pcap` | Standard SIP INVITE → 200 OK call flow |
| `cancel_call.pcap` | Call cancelled before answer (INVITE → CANCEL) |
| `reject_call.pcap` | Call rejected by callee |
| `astercc_inner_5001_5002.pcap` | AsterCC internal extension-to-extension call |
| `in_astcc_180-138-5001.pcap` | AsterCC inbound call with ringing |
| `in_wcc_*.pcap` | WCC platform inbound call variants |
| `out_astcc_5001_180.pcap` | AsterCC outbound call |
| `out_wcc_*.pcap` | WCC platform outbound call variants (incl. Chinese locale) |
| `wcc_5001-q1005A.pcap` | WCC queue-routed call |

## E2E Testing Integration

The simulator integrates with Admin UI Playwright E2E tests to verify the full data pipeline: `Simulator → IE → ClickHouse → AS API → AU pages`.

### Running PCAP-driven E2E Tests

```bash
# Prerequisites: IE (port 9060) + AS (port 3000) + AU (port 5173) + ClickHouse must be running

cd services/admin-ui
RUN_PCAP_E2E=true npx playwright test --project=pcap-e2e
```

### How It Works

1. **`pcap-global-setup.ts`** runs `go run ./tools/pcap-simulator -mode replay` to inject sample pcap files into IE
2. IE processes the SIP packets and writes call records to ClickHouse
3. Playwright specs verify the injected calls appear correctly in `/calls`, `/events`, and call detail pages
4. Tests auto-skip if Go is unavailable or IE port 9060 is unreachable

## Roadmap & Future Plans

- [ ] **Concurrency Governance**: Implement a worker-pool or semaphore limit to avoid exploding goroutines when simulating massive counts (e.g., `--count 10000+`).
- [ ] **Authentic SRTP Testing**: Replace the current dummy AES-CM placeholder with real `pion/srtp` crypto contexts to thoroughly stress-test the Ingestion Engine's decryption routines.
- [ ] **Metrics Export**: Expose a lightweight Prometheus `/metrics` endpoint on the simulator to monitor active injection rates and latency during real-time load testing scenarios.
