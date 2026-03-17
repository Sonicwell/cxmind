# PCAP 模拟器

通过 Go 语言编写的专用工具链，用于向服务端推送综合性构造的测试音频包及 SIP 信令链路通讯数据。平台原生下放 4 项执行调度器：
1. **HEP 转发模式**: 对实时服务集群 UDP/TCP 暴露源通过 HEPv3 标准发送仿真负荷包
2. **PCAP 导出模式**: 离线化保存成标准 `.pcap` 打包架构给工程化软件分析预检
3. **SIPREC 数据注入**: 专项模拟面向存证和录音合规接口所使用的 multipart/mixed XML 双流数据构造
4. **引擎重放 (Replay)**: 读取指定的 `.pcap` 真实文件将其直接转抛向远程服务端模拟流量复现

## 系统环境依赖

- **宿主机 Go**: v1.22 开发套件
- **多媒体组件工具**: 仅在需要开启真实模拟 `--upstream` 或 `--downstream` 原声媒体片段混合时要求挂载 `FFmpeg` 包运行环境。

## 安装指南

1. **直接源码拉取生成可解析二进制**:
   ```bash
   cd tools/pcap-simulator
   go mod download
   go build -o simulator_go main.go
   ```
2. **附加底层依赖支撑 (可选)**:
   如果您打算加载自己构造的物理原声音频序列模拟上、下行用户行为流，请通过宿主机操作系统的分发系统补齐音频依赖 (`brew install ffmpeg` 或 `apt-get install ffmpeg` 行径)。

## 组件级能力

- 基于随机逻辑池提供高度仿真的 SIP INVITE 和底层 200 OK 接听模拟链路序列
- **HEP 实时连接层**: 发包层将强制进行 RFC 6347 (HEPv3) 高标准格式化，经由 UDP 套接字派送。
- **PCAP 持久化封装**: 标准 libpcap 流媒体生成规范封装设计
- 自定化构造支持设定特定的分流接口，指定并发数量和包保存导出格式。
- 向下兼容全球技术开发者主流工具如 Wireshark 或者基于内核的抓包套手 tcpdump。

## 常用操作

### HEP 发送直调流程

```bash
# 编撰无关联编译包
go build -o simulator_go

# 提供纯净参数验证默认网关情况 (localhost:9060，并附带 1 条仿真信令)
./simulator_go

# 提供给远程接收机特定高强度配置测试压测
./simulator_go --host 192.168.1.100 --port 9060 --count 50
```

### PCAP 转储封装

```bash
# 执行基于内核模式的标准离线包落盘验证
./simulator_go --mode pcap --output test.pcap

# 在设定流量阀值的范畴下强制将 20 路对话封装到单个集合
./simulator_go --mode pcap --output calls.pcap --count 20
```

### 已有数据文件回放动作

```bash
# 解压数据文件推送到基于本地环回监听端口的 HEP 内聚集群上
./simulator_go -mode replay -input samples/astercc_inner_5001_5002.pcap -host 127.0.0.1 -port 9060 -authKey "my-secret-token"

# 提供超线性速度加倍倍速推送（时间戳相对流失提高至十倍压缩包投递时间）
./simulator_go -mode replay -input capture.pcap -host 10.0.1.50 -port 9060 -speed 10.0
```

## 全局环境变量支撑

- `--mode` - 声明并切断操作状态指令：默认启动 `hep`，还提供 `pcap`、`siprec` 以及 `replay`
- `--input` - 设置作为引物被导入验证的 PCAP 介质读取路径 - **仅限于调用引物回放 `replay` 时生效**
- `--output` - 配置导出的归档标识信息 (回退文件名称: output.pcap) - 限定生成环境 `PCAP 导出模式` 下
- `--host` - 分布式或测试环境中被代理收集信息的服务端入口定位 - 应用与 `HEP / Replay` 下层交互
- `--port` - 明确上游 HEP 包开放口端定位参数 (出场口参数: 9060) - 同用于协同服务端联调接入
- `--count` - 在构造的池子里分配待虚拟投递的对话进程条目 (初始容量: 1)
- `--perfect-quality` - 禁止由于系统发包底层特性夹杂和计算附加的自然通讯数据包抖动丢失。
- `--sip-only` - 剥离和摒除大量多媒体冗长流媒体占用：屏蔽 RTP 负载，专门检验节点系统对通讯实时高可用性处理反应的情况。
- `--speed` - 用于定制解压缩重置包的时间回放周期阀值：`0` 是系统规定的强制隔离 500 毫秒，`1` 指针向严格复刻文件当时原始时分差率去恢复，对于 `2.0+` 以上开启无阈值系统拉高运算峰力复刻能力。

## 集成工作流

### 网络包解析核对

1. 先在工作区部署后端采集服务守护常驻端：
   ```bash
   cd ../../services/ingestion-go
   go run main.go
   ```

2. 打开独立开发窗口执行发包器发送：
   ```bash
   ./simulator_go --count 5
   ```

3. 跳转查看对应的接收端终端监听是否响应抛出日志数据包内容。

### 导出归档数据解析测试法

1. 基于工具库导出一份完整数据存档内容：
   ```bash
   ./simulator_go --mode pcap --output test.pcap --count 5
   ```

2. 透传图形化工程器去解读报文验证正确性：
   ```bash
   wireshark test.pcap
   ```

3. 或在系统指令行完成对导出结构体做纯命令行检查方式：
   ```bash
   tcpdump -r test.pcap -n
   ```

## 数据构成模型

### SIP 信令事务

一旦拉起每次呼叫生命周期，对应内部必然衍生：
1. **呼叫起点 (INVITE)** - 基于主叫机 IP 逻辑发送接通指令 
2. **呼叫反馈 (200 OK)** - 受机 IP 的交互性答复接通信令指令

同时保证信令体系拥有：
- 能够完成跨网透穿及校验标准的参数组合件。 (包括但不限源出处路由报文标记 `Via, From, To, Call-ID`)。
- 在附加体下明确具备了协议定义中约定的有效编码识别 `SDP` 的信息块结构解析配置。

### HEPv3 流推送格式组成部件规范

- 加载系统级别的原始发包包数据 `HEPv3 metadata`。 (其封装容纳并定义时间轴戳标识、收信双方的真实主机参数标识映射及业务追踪所需的事件哈希关联值)。
- 作为 Payload 后缀封测进去的对应业务级信令原报文结构体对象内容数据。

### PCAP 标准模型体内部解析

所有归档到离散文件的格式块具备标准 7 层协议解析层次：
- **链路介质层数据** (默认占据 14 bytes)
- **网络逻辑寻址 IP 头标区** (承载占用 20 bytes)
- **协议栈载体封装框架头 (UDP)** (分配使用额度为 8 bytes)
- **独立 SIP 自定义可延伸体** (未设配封顶变量)

## 工程实操片段

### 提供针对图形化系统的批量素材压测样本制成

```bash
# 模拟创造拥有包含 100 通高密度关联通话体系存档供做样本使用。
./simulator_go --mode pcap --output large-test.pcap --count 100

# 抛离由图形应用调用打开核对文件系统兼容度。
wireshark large-test.pcap
```

### 提供远端探测验证连通度操作

```bash
# 在内部环回链路触发请求连通验证包推算 (发包指令定为 10 条)。
./simulator_go --mode hep --count 10

# 利用跨环境机制向真实被侦测服务地址丢包处理动作和校验参数匹配解析力。
./simulator_go --mode hep --host 10.0.1.50 --port 9060 --count 25
```

### Linux 指令下的底层筛选测试动作演示

```bash
# 利用命令行参数在全部数据中清洗过滤单次指令下所有的连接申请信息对象。
tcpdump -r test.pcap -n | grep INVITE

# 完全把详细被隐藏协议封装展开提供开发组进行分析。
tcpdump -r test.pcap -n -vv
```



## E2E 接口测试工具挂钩指引

可以有效复用到涵盖了 `管理层前端 (Administration System)` 中内部分散流程体系。完成整套测试链: `Simulator（抓包下放模拟投递环境） →  IE 引擎运算池 → ClickHouse  入写队列核对  → App Server 平台 API 取信  → UI 组件内容对应显示验证模块检查 ` 操作校验逻辑集成度确认操作体系。

### E2E 驱动框架调用规则

```bash
# 先决基础条件说明: 必需存在正在工作及关联上行的 IE(服务通道开放 9060) 和业务调度层级 AS(处于 3000 活动)。同样前端环境 AU 存在，及其后置落盘核心的 ClickHouse 表项能够关联接应响应配置就绪。

cd services/admin-ui
RUN_PCAP_E2E=true npx playwright test --project=pcap-e2e
```

### 通联运作原理说明及剖面介绍

1. 全局配置初始 `pcap-global-setup.ts` 运行挂钩器加载，后台启动并注入进程命令参数：`go run ./tools/pcap-simulator -mode replay` 向目标端系统持续倾倒测试准备素材体系模型对象进去。
2. 基础的运算模块单元会剥除数据皮做实质解码运算存留进后端数仓表格中做逻辑比对存根操作准备记录待选调阅体系资源组块部分保存项。
3. Playwright E2E 中枢利用模拟用户行经路径，模拟打开对 `呼叫列出 (calls)`、`特定业务事分列(events)` 的报表拉出，并且对于每页面中出现的属性是否严格一致化核验检查一致化信息内容符合。
4. 提供优雅降级安全容错配置，检测如果在缺乏支持 Go 运行工具库、以及探测后如果出现服务组件死链或者没有启动，脚本能自主过滤执行不干预业务运行和发版逻辑规则强校验流程体系中断现象的生成机制保障行为执行可靠。
