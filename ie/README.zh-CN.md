# CXMind 采集引擎 (IE)

基于 Go 语言构建的高性能 SIP/RTP 报文捕获与音频处理引擎。

## 概览

采集引擎是 CXMind 的数据收集核心。它通过 HEP (Homer Encapsulation Protocol) 协议被动提取网络中的 SIP 信令与 RTP 音频流，执行实时语音识别，并将事件发布至 Redis 供下游业务服务消费。

## 核心能力

- **多编码 RTP 处理**: G.711 μ-law/A-law、G.722、G.729、Opus (通过 SDP 动态解析 PT)
- **毫秒级 ASR 预连接**: 在检测到 INVITE 阶段即建立 ASR WebSocket 连接，最小化首字识别延迟
- **ASR 连接池化**: 高效的 WebSocket 连接池，支持接入 DashScope、FunASR、Azure、Google 等服务商并包含健康检查机制
- **ClickHouse 分析存储**: 批量写入 SIP 事件、通话状态以及音质指标
- **PCAP 录音存档**: 支持双工全量通话录像，提供双轨立体声分离
- **RTCP 音质评估**: 基于 Sender/Receiver Report 提取抖动 (Jitter)、丢包率，计算 MOS 核心指标
- **支持 SIPREC 协议**: 原生支持基于 TCP 的 SIP 录音会话 (RFC 7866)、multipart MIME 解析与多流 SDP
- **PCI-DSS 隐私合规**: DTMF 按键音掩码拦截 (RFC 4733)、通过 API 暂停/恢复录音能力
- **内建嗅探模式**: 提供基于 libpcap 的被动旁路抓包能力 (可替代外部 HEP 探针)
- **SRTP 流解密**: 支持实时解密 SRTP 数据流进行内容分析
- **端点检测 (VAD)**: 音频活动检测 (RMS 能量检测结合 Silero ONNX 模型)
- **SER 情感识别**: 语音情感识别支持 (内置 wav2vec2 XLSR ONNX 模型或调用外部 gRPC 服务)
- **Schema 自动迁移**: 启动时自动升级和维护 ClickHouse 表结构

## 性能指标

### 设计容量基线

| 维度 | 容量 | 机制 |
|-----------|----------|-----------|
| 并发呼叫 | **50,000** (压测验证) | `sync.Map` 监听管理，热路径无锁化 |
| UDP Rps | **250,000+** | 可配信号量控制，零拷贝直接透传 |
| TCP 连接池 | **5,000** (配置化) | 原子级 `ConnectionLimiter` |
| ASR WebSocket | **20–10,000** | 动态伸缩扩展结合熔断机制 |
| PCAP 并发录制 | 最大 **6,000** | 原子级计数与异步落盘 IO |
| ClickHouse 吞吐 | **批量写入** (100条/5s) | 泛型 `GenericBatchWriter[T]` 缓冲写入 |

### 基准测试结果

测试环境: **Apple M4 (10 cores, arm64)**:

| Benchmark | ops/sec | Latency | Memory |
|-----------|---------|---------|--------|
| 并发流管理 (10K × 100 读写) | 93 | 10.7 ms | ~3 MB 堆内存 |
| 并发流管理 (50K × 100 读写) | 24 | 53.6 ms | ~9 MB 堆内存 |
| SIP 消息解析引擎 | 1.84M | 629 ns/op | 1.7 KB/op |
| SRTP 实时解密 (AES-128-CM) | 3.78M | 325 ns/op | 332 B/op |
| µ-law / A-law 解码 (160 采样) | 27M | 44 ns/op | **0 alloc** |
| G.722 → PCM16k 解码 | 368K | 3.5 µs/op | 320 B/op |
| RTP 更新锁竞争极值测试 | 42.7M | 28.6 ns/op | **0 alloc** |
| 会话管理器高并发更新 | 5.5M | 192 ns/op | 128 B/op |

> 并发流扩展呈现线性相关：50K 的处理时间约为 10K 的 5 倍，无明显的锁降级。此场景下系统瓶颈主要集中于网卡(NIC)与 CPU 算力，而非内存申请或并发锁竞争。

### 内存安全防护机制

| 组件 | 上限机制 |
|-----------|-------|
| HTTP 上传负载 | `MaxBytesReader` (强制限制为 10 MB) |
| UDP 接收缓冲区 | 每数据包最多 65,535 字节 |
| PCAP 写入队列 | 限定每通道 100 数据包的缓冲深度 |
| 事件派发总线 | 使用带长度限制的 Channel 防止阻塞蔓延 |
| 多路混音 Jitter | 深度严格限制为最高配置的包数 |

## 运行配置

生产环境默认读取 `/etc/cxmind/config.yaml`，开发环境读取 `config/config.yaml`。

核心节区配置示例：
```yaml
hep:
  port: 9060               # HEP 接收监听端口 (UDP)
http:
  port: 8081               # 管理 API 及健康检查端口
asr:
  provider: dashscope      # 供应商标识 dashscope | funasr
clickhouse:
  dsn: "clickhouse://..."
redis:
  addr: "localhost:6379"
```

## HTTP API 规范

开放端口 `8081` (可通过 `http.port` 覆盖)：

| 路径 | 谓词 | 描述 |
|----------|--------|-------------|
| `/health` | GET | Liveness 探针 |
| `/api/asr/enable` | POST | 在活跃通话中强行启用 ASR (坐席侧) |
| `/api/asr/disable` | POST | 挂断特定的 ASR WebSocket 推送 |
| `/api/asr/status` | GET | 返回当前通话的话单与 ASR 执行状态 |
| `/api/monitoring/update` | POST | 接收监听指令并推送实时流 |
| `/api/config/reload` | POST | 执行业务逻辑热更新机制 |

## 研发指南

### 前置资源依赖
- Go 1.24+
- `libpcap-dev` (Linux) 或 `libpcap` (macOS - Homebrew)
- Redis 与 ClickHouse 本地服务

### GeoIP 库初始化 (可选功能)

引擎内建了对 MaxMind GeoLite2-City 的支持以展示经纬度和城市分布。不配置不影响核心逻辑加载。

```bash
# 1. 访问 https://www.maxmind.com/en/geolite2/signup 注册免费账号
# 2. 从 https://www.maxmind.com/en/accounts/current/license-key 获取 License Key
# 3. 在项目根目录执行：
MAXMIND_LICENSE_KEY=your_key ./scripts/download-geoip.sh
```

数据库会自动落盘至 `services/ingestion-go/config/GeoLite2-City.mmdb`（已被 git 忽略）。

### 构建工程
```bash
go mod download
go build -o ie .
./ie
```

### 用例验证
```bash
go test -v -cover ./...
```

## 数据流架构拓扑

```
HEP/UDP:9060 ──► SIP 解析层 ──► 核心会话调度器 (Session Manager)
                                        │
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
              RTP 流监听器        ClickHouse 批写器    Redis 集群广播
                    │                                     │
                    ▼                                     ▼
             ASR WebSocket 长连                     上层业务系统 (AS)
                    │
                    ▼
          文本转换结果 → Redis Pub/Sub
```
