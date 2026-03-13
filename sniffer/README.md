# CXMind Sniffer

Standalone network packet sniffer that captures SIP/RTP traffic and forwards it as HEPv3 to the CXMind Ingestion Engine.

## When to Use

Use `sniffer` when your PBX doesn't natively support HEP (e.g., Asterisk without `res_hep`, or FreeSWITCH without `mod_hep`). It runs on the same machine as the PBX and captures SIP/RTP directly from the network interface.

## Quick Start

```bash
# Build
go build -o sniffer ./cmd/sniffer

# Run (requires root for raw socket access)
sudo ./sniffer
```

## Configuration

Copy `config.yaml.sample` → `config.yaml`:

```yaml
interface: "eth0"                                    # Network interface to capture from
hep_target: "127.0.0.1:9060"                        # CXMind IE HEP address
hep_id: 2001                                        # HEP capture agent ID
filter: "udp port 5060 or udp portrange 10000-20000" # BPF filter (SIP + RTP)
log_level: "info"                                    # trace/debug/info/warn/error
```

## Deployment Topologies

### Simple (Single Machine)
Sniffer and PBX on the same host. Captures local traffic and forwards to IE.

### Relay (SIP & RTP Separated)
SIP proxy and RTP media on different machines. The RTP machine's sniffer acts as a relay, correlating Call-IDs before forwarding to IE.

```yaml
hep_listen: ":9060"
relay_upstream: true
hep_target: "ie.host:9060"
filter: "udp portrange 10000-20000"
```

### Peer Mesh (HA Cluster)
Multiple PBX nodes share SIP mapping data for cross-node Call-ID correlation.

```yaml
hep_listen: ":9060"
hep_peers: ["server-b:9060", "server-c:9060"]
hep_target: "ie.host:9060"
```

## PBX Integration Guides

To ensure the sniffer captures the correct traffic, your PBX must be configured to expose SIP and RTP on the physical network interface (not just `127.0.0.1` locally).

### FreeSWITCH
Ensure your SIP profiles bind to an external IP.
1. Edit `conf/sip_profiles/internal.xml` and `external.xml`:
   - `<param name="rtp-ip" value="$${local_ip_v4}"/>`
   - `<param name="sip-ip" value="$${local_ip_v4}"/>`
2. Update the sniffer `config.yaml` to match FreeSWITCH's RTP port range (typically `16384-32768`):
   - `filter: "udp port 5060 or udp portrange 16384-32768"`

### Asterisk
Ensure PJSIP transports are bound correctly.
1. Edit `/etc/asterisk/pjsip.conf`:
   ```ini
   [transport-udp]
   type=transport
   protocol=udp
   bind=0.0.0.0:5060
   ```
2. Update the sniffer `config.yaml` to match Asterisk's RTP port range (from `rtp.conf`, typically `10000-20000`).

### Kamailio
Since Kamailio primarily handles SIP signaling, configure the sniffer to only capture SIP if an external media server (like RTPEngine) handles the RTP path remotely.
- `filter: "udp port 5060"`

## Performance

### Benchmark Results

Tested on **Apple M4 (10 cores, arm64)**:

| Benchmark | ops/sec | Latency | Memory |
|-----------|---------|---------|--------|
| HEP3 packet decode | **61.2M** | 17.1 ns/op | **0 alloc** |

### Expected Capacity by Hardware

| Hardware | Concurrent Calls | Notes |
|----------|-----------------|-------|
| 1 vCPU / 512 MB | ~500 | Minimum viable (SIP-only, no RTP) |
| 2 vCPU / 1 GB | ~2,000 | Typical small PBX deployment |
| 4 vCPU / 2 GB | ~5,000 | Medium call center |
| 8+ vCPU / 4 GB | 10,000+ | High-density environment |

> Sniffer is CPU-bound by BPF filter matching and HEP encoding. Memory usage is minimal (~50 MB RSS for 2,000 concurrent calls). Network bandwidth is typically the real bottleneck: 2,000 G.711 calls ≈ 256 Mbps of RTP traffic.

### Resource Usage

- **Idle**: ~8 MB RSS, near-zero CPU
- **Active** (1,000 calls): ~30 MB RSS, ~15% single-core CPU
- **goroutines**: Bounded — 1 capture goroutine + 1 HEP sender per interface

## Prerequisites

- Go 1.22+ (build time only)
- `libpcap-dev` / `libpcap` (build + runtime)
- Root or `CAP_NET_RAW` capability

## systemd Service

```bash
sudo cp sniffer /opt/cxmind/sniffer
sudo tee /etc/systemd/system/cxmind-sniffer.service <<EOF
[Unit]
Description=CXMind Sniffer (HEP capture)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/cxmind
ExecStart=/opt/cxmind/sniffer
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable --now cxmind-sniffer
```
