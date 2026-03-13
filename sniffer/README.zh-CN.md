# CXMind 嗅探器 (Sniffer)

独立的网络抓包代理应用，用于提取交换机或网卡流量中的 SIP/RTP 数据包，将其封转为 HEPv3 协议后推送至 CXMind 采集引擎 (IE)。

## 应用场景

PBX 原生不支持 HEP 协议时 (如未加载 `res_hep` 的 Asterisk，或未安装 `mod_hep` 的 FreeSWITCH)，可将 `sniffer` 部署在同一个主机或汇聚交换机的镜像口 (Mirror Port) 上，直接在物理网络层剥离呼叫数据。

## 快速运行

```bash
# 编译可执行文件
go build -o sniffer ./cmd/sniffer

# 启动代理 (由于需要直接挂载网卡创建原始套接字，必须以 root 权限运行)
sudo ./sniffer
```

## 默认配置参数

复制并重命名 `config.yaml.sample` 为 `config.yaml` 进行覆盖：

```yaml
interface: "eth0"                                    # 指定要监听混杂模式的物理网卡名称
hep_target: "127.0.0.1:9060"                        # CXMind IE 的内网接收地址
hep_id: 2001                                        # 当前节点的 HEP 探针 ID (用于拓扑标识)
filter: "udp port 5060 or udp portrange 10000-20000" # libpcap 过滤语法 (必须同时包含信令和媒体端口)
log_level: "info"                                    # 打印层级: trace/debug/info/warn/error
```

## 分布式组网拓扑

### 基础单机部署
嗅探器和 PBX 软交换在同台服务器中运行。直接获取本地协议报文并传输至 IE 模块。

### 信令/媒体相分离 (代理中继策略)
信令网关 (SIP Proxy) 与媒体转发服务器在不同的机器上。运行在媒体机上的 sniffer 将开启跨层关联模式，首先校验 Call-ID 的合法性再转发给 IE。

```yaml
hep_listen: ":9060"
relay_upstream: true
hep_target: "ie.host:9060"
filter: "udp portrange 10000-20000"
```

### 多节点高可用群集 (Peer Mesh)
PBX 集群多活。节点间将互相提供 SIP 信令事务表进行关联核验。

```yaml
hep_listen: ":9060"
hep_peers: ["server-b:9060", "server-c:9060"]
hep_target: "ie.host:9060"
```

## PBX 对接指引

嗅探器通过底层 pcap 截获流量时，对应的 PBX 必须将 SIP 和 RTP 服务监听在真实的网关接口 IP 上验证（脱离 `127.0.0.1` 本地回环网络）。

### FreeSWITCH
验证 SIP profiles 是否绑定外部网络。
1. 编辑 `conf/sip_profiles/internal.xml` 与 `external.xml` 配置文件：
   - `<param name="rtp-ip" value="$${local_ip_v4}"/>`
   - `<param name="sip-ip" value="$${local_ip_v4}"/>`
2. 同步 sniffer `config.yaml` 配置文件，使 `filter` 断言覆盖系统中的媒体端口范围 (默认通常为 `16384-32768`):
   - `filter: "udp port 5060 or udp portrange 16384-32768"`

### Asterisk
校验 PJSIP 是否将 UDP 绑定于 0.0.0.0。
1. 更新 `/etc/asterisk/pjsip.conf`:
   ```ini
   [transport-udp]
   type=transport
   protocol=udp
   bind=0.0.0.0:5060
   ```
2. 更新 sniffer `config.yaml` ，在 `rtp.conf` 核对分配空间。一般为默认的 `10000-20000`。

### Kamailio
鉴于 Kamailio 为单纯的信令路由，如果下游采用 RTPEngine 提供媒体代理，当前主机配置应只抓取 SIP 信息：
- `filter: "udp port 5060"`

## 性能与消耗

### 基准测试数据

压测环境: **Apple M4 (10 cores, arm64)**:

| Benchmark | ops/sec | Latency | Memory |
|-----------|---------|---------|--------|
| HEPv3 C 结构体映射反序列 | **61.2M** | 17.1 ns/op | **0 alloc** |

### 参考实例机型容量

| 服务器规格 | 并发链路 | 参考描述 |
|----------|-----------------|-------|
| 1 核 / 512 MB | ~500 | 最简部署配置 (纯抓取 SIP 控制流，规避 RTP 分组) |
| 2 核 / 1 GB | ~2,000 | 满足基础 PBX 单体架构通信吞吐 |
| 4 核 / 2 GB | ~5,000 | 覆盖中型联络中心 |
| 8+ 核 / 4 GB | 10,000+ | 核心运营商高密环境支撑 |

> 本工程为 CPU 敏感型业务，限制瓶颈来自于 BPF 网络内核层的规则轮询机制和 HEP 序列化。内存泄露可能极小 (2000 线满载 RSS 不超过 50MB)。整体上行需考量宿主机自身宽带容量上线：例如抛开信令层，2000 路基于 G.711 的音频呼叫将常驻挤占高达 256 Mbps 的流量带宽。

### 使用率预估

- **完全闲置**: 内存消耗 ~8 MB，CPU 无周期运算。
- **重载运行** (约 1,000 线呼叫): 内存维持在 ~30 MB RSS 左右，需吃掉约 15% 的单核心计算资源。
- **协程调度**: 无并发创建；保持网卡监听协程 x1，与 HEP Sender x1。

## 开发编译要求

- 仅构建环节依赖 Go 1.22+
- 底层依赖 `libpcap-dev` 包支持组件
- 环境有充分赋予管理员的 Root 操作权限机制、或者 `CAP_NET_RAW` Linux 发行版网络 Capability 规则支持

## Systemd 托管

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
