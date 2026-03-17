import { execSync } from 'child_process';
import { writeFileSync, existsSync } from 'fs';
import path from 'path';
import { createSocket } from 'dgram';

/**
 * PCAP E2E GlobalSetup: 注入真实 SIP 流量到 IE
 * 前提条件: Go 环境 + IE:9060 + ClickHouse + AS 全栈在线
 * 通过 RUN_PCAP_E2E=true 门控
 */

const REPO_ROOT = path.resolve(__dirname, '../../../');
const SIMULATOR_DIR = path.join(REPO_ROOT, 'tools/pcap-simulator');
const SAMPLES_DIR = path.join(SIMULATOR_DIR, 'samples');
const CONTEXT_FILE = '/tmp/pcap-e2e-context.json';
const IE_HOST = '127.0.0.1';
const IE_PORT = 9060;

// 需要注入的场景列表
const SCENARIOS = [
    { name: 'basic_call', pcap: 'basic_call.pcap' },
    { name: 'cancel_call', pcap: 'cancel_call.pcap' },
    { name: 'reject_call', pcap: 'reject_call.pcap' },
    { name: 'outbound_call', pcap: 'out_wcc_1005-180-138A.pcap' },
];

function checkGoAvailable(): boolean {
    try {
        execSync('which go', { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

// 简单 UDP 探测 IE 端口是否有服务在监听
async function probeIEPort(): Promise<boolean> {
    return new Promise((resolve) => {
        const client = createSocket('udp4');
        const timeout = setTimeout(() => {
            client.close();
            // UDP 无连接，发出去没报错就当可达
            resolve(true);
        }, 2000);

        client.send(Buffer.from('probe'), IE_PORT, IE_HOST, (err) => {
            clearTimeout(timeout);
            client.close();
            resolve(!err);
        });
    });
}

// 执行 go run 注入一个 pcap，捕获 stdout 中的 Call-ID
function replayPcap(pcapFile: string): string | null {
    const pcapPath = path.join(SAMPLES_DIR, pcapFile);
    if (!existsSync(pcapPath)) {
        console.warn(`⚠️ PCAP file not found: ${pcapPath}, skipping`);
        return null;
    }

    try {
        const cmd = [
            'go', 'run', '.',
            '-mode', 'replay',
            '-input', pcapPath,
            '-host', IE_HOST,
            '-port', String(IE_PORT),
            '-sip-only',
            '-speed', '0',
        ].join(' ');

        console.log(`🔄 Replaying: ${pcapFile}`);
        const output = execSync(cmd, {
            cwd: SIMULATOR_DIR,
            timeout: 30_000,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        // simulator 输出格式: "✅ Replay finished. New Call-ID: sim-xxx@simulator"
        const match = output.match(/New Call-ID:\s*(\S+)/);
        const callId = match?.[1] || null;

        if (callId) {
            console.log(`  ✅ Call-ID: ${callId}`);
        } else {
            console.warn(`  ⚠️ Could not extract Call-ID from output:\n${output}`);
        }

        return callId;
    } catch (err: any) {
        console.error(`  ❌ Replay failed for ${pcapFile}: ${err.message}`);
        return null;
    }
}

async function globalSetup() {
    if (process.env.RUN_PCAP_E2E !== 'true') {
        console.log('ℹ️  RUN_PCAP_E2E not set, skipping PCAP E2E setup');
        return;
    }

    // 前置检查
    if (!checkGoAvailable()) {
        console.warn('⚠️ Go not found in PATH, skipping PCAP E2E');
        writeFileSync(CONTEXT_FILE, JSON.stringify({ skipped: true, reason: 'go_not_found' }));
        return;
    }

    const ieReachable = await probeIEPort();
    if (!ieReachable) {
        console.warn('⚠️ IE port 9060 unreachable, skipping PCAP E2E');
        writeFileSync(CONTEXT_FILE, JSON.stringify({ skipped: true, reason: 'ie_unreachable' }));
        return;
    }

    // 逐个注入场景
    const results: Record<string, string | null> = {};

    for (const scenario of SCENARIOS) {
        const callId = replayPcap(scenario.pcap);
        results[scenario.name] = callId;

        // 场景之间间隔 1 秒，避免 IE 并发处理压力
        await new Promise(r => setTimeout(r, 1000));
    }

    // 等待 IE 异步写入 ClickHouse
    console.log('⏳ Waiting 5s for IE to flush to ClickHouse...');
    await new Promise(r => setTimeout(r, 5000));

    // 写出 context 文件供 spec 读取
    const context = { skipped: false, scenarios: results, timestamp: new Date().toISOString() };
    writeFileSync(CONTEXT_FILE, JSON.stringify(context, null, 2));
    console.log(`📝 Context written to ${CONTEXT_FILE}`);
    console.log('✅ PCAP E2E setup complete');
}

export default globalSetup;
