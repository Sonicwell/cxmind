import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface TranscriptSegment {
    text: string;
    speaker: string;
    timestamp: string;
}

// ── 字级 tokenizer: 中文按字拆, 英文/数字按词拆, 标点独立 ──
function tokenize(text: string): string[] {
    if (!text) return [];
    // 中文字符/CJK 每字一 token, 英文数字连续为一 token, 标点独立
    const tokens: string[] = [];
    const re = /[\u4e00-\u9fff\u3400-\u4dbf]|[a-zA-Z0-9]+|[^\s\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9]/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        tokens.push(m[0]);
    }
    return tokens;
}

// ── Diff token ──
interface DiffToken {
    type: 'equal' | 'insert' | 'delete';
    text: string;
}

// 标点剥离: diff 比较时忽略标点差异
const PUNCT_RE = /[，。！？、；：""''（）《》【】…—·,.!?;:'"()\[\]{}<>\/\\@#$%^&*+=~`|，。？！、；：]/g;
function stripPunct(s: string): string { return s.replace(PUNCT_RE, ''); }
function isPunct(s: string): boolean { return stripPunct(s).length === 0; }

// ── 字级 greedy diff (标点盲比较) ──
function computeCharDiff(oldText: string, newText: string): DiffToken[] {
    const oldToks = tokenize(oldText);
    const newToks = tokenize(newText);
    if (!oldToks.length && !newToks.length) return [];
    if (!oldToks.length) return [{ type: 'insert', text: newText }];
    if (!newToks.length) return [{ type: 'delete', text: oldText }];

    const result: DiffToken[] = [];
    let i = 0, j = 0;

    while (i < oldToks.length && j < newToks.length) {
        // 跳过纯标点 token (视为 equal)
        if (isPunct(oldToks[i])) { result.push({ type: 'equal', text: oldToks[i] }); i++; continue; }
        if (isPunct(newToks[j])) { result.push({ type: 'equal', text: newToks[j] }); j++; continue; }

        if (stripPunct(oldToks[i]) === stripPunct(newToks[j])) {
            // 连续相等 (标点盲比较)
            let buf = newToks[j]; // 用离线侧文本显示
            i++; j++;
            while (i < oldToks.length && j < newToks.length) {
                if (isPunct(oldToks[i])) { buf += oldToks[i]; i++; continue; }
                if (isPunct(newToks[j])) { buf += newToks[j]; j++; continue; }
                if (stripPunct(oldToks[i]) === stripPunct(newToks[j])) {
                    buf += newToks[j];
                    i++; j++;
                } else break;
            }
            result.push({ type: 'equal', text: buf });
        } else {
            const LOOK = 20;
            let foundInNew = -1;
            for (let k = j + 1; k < Math.min(j + LOOK, newToks.length); k++) {
                if (!isPunct(newToks[k]) && stripPunct(oldToks[i]) === stripPunct(newToks[k])) { foundInNew = k; break; }
            }
            let foundInOld = -1;
            for (let k = i + 1; k < Math.min(i + LOOK, oldToks.length); k++) {
                if (!isPunct(oldToks[k]) && stripPunct(oldToks[k]) === stripPunct(newToks[j])) { foundInOld = k; break; }
            }

            if (foundInNew >= 0 && (foundInOld < 0 || (foundInNew - j) <= (foundInOld - i))) {
                result.push({ type: 'insert', text: newToks.slice(j, foundInNew).join('') });
                j = foundInNew;
            } else if (foundInOld >= 0) {
                result.push({ type: 'delete', text: oldToks.slice(i, foundInOld).join('') });
                i = foundInOld;
            } else {
                result.push({ type: 'delete', text: oldToks[i] });
                result.push({ type: 'insert', text: newToks[j] });
                i++; j++;
            }
        }
    }
    if (i < oldToks.length) result.push({ type: 'delete', text: oldToks.slice(i).join('') });
    if (j < newToks.length) result.push({ type: 'insert', text: newToks.slice(j).join('') });
    return result;
}

// ── speaker 归一化 ──
function normSpeaker(s: string): string {
    return s.trim().toLowerCase().replace(/[-_\s]+/g, '');
}

// ── speaker 对齐 (左右气泡) ──
function checkIsRight(speaker: string, caller?: string, callee?: string, direction?: string): boolean {
    const s = speaker.toLowerCase();
    const isOutbound = direction === 'outbound';
    const agentRef = isOutbound ? caller?.toLowerCase() : callee?.toLowerCase();
    const custRef = isOutbound ? callee?.toLowerCase() : caller?.toLowerCase();
    if (agentRef && (s === agentRef || s.includes(agentRef) || agentRef.includes(s))) return true;
    if (custRef && (s === custRef || s.includes(custRef) || custRef.includes(s))) return false;
    return /^(bob|callee|agent|b\s|sys)/i.test(speaker);
}

const formatTime = (ts: string) => {
    try {
        const d = new Date(ts);
        if (!isNaN(d.getTime())) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { /* */ }
    return ts;
};

// ── 顺序消费匹配: 按 speaker 拼接实时全文, 然后按离线段顺序依次消费 ──
interface MatchedSegment {
    pcSeg: TranscriptSegment;
    rtText: string;        // 匹配到的实时文本片段
    diff: DiffToken[];
}

function buildSegmentMatches(
    realtimeSegs: TranscriptSegment[],
    postCallSegs: TranscriptSegment[],
): MatchedSegment[] {
    // 按 speaker 拼接实时全文 tokens
    const rtTokensBySpeaker = new Map<string, string[]>();
    const rtPosBySpeaker = new Map<string, number>();

    for (const seg of realtimeSegs) {
        const spk = normSpeaker(seg.speaker);
        const existing = rtTokensBySpeaker.get(spk) || [];
        existing.push(...tokenize(seg.text));
        rtTokensBySpeaker.set(spk, existing);
        if (!rtPosBySpeaker.has(spk)) rtPosBySpeaker.set(spk, 0);
    }

    const results: MatchedSegment[] = [];

    for (const pcSeg of postCallSegs) {
        const spk = normSpeaker(pcSeg.speaker);
        const rtToks = rtTokensBySpeaker.get(spk) || [];
        const pos = rtPosBySpeaker.get(spk) || 0;

        if (pos >= rtToks.length) {
            // 实时侧已耗尽 → 离线独有
            const diff = [{ type: 'insert' as const, text: pcSeg.text }];
            results.push({ pcSeg, rtText: '', diff });
            continue;
        }

        // 向前扫描: 找到最佳消费长度 (让 diff 的 equal 率最大化)
        const pcToks = tokenize(pcSeg.text);
        const pcLen = pcToks.length;

        // 从实时 token 流中消费 [pos, pos+consumeLen)
        // 尝试区间 [pcLen*0.5, pcLen*2], 取 equal 最多的
        let bestConsumeLen = pcLen;
        let bestEqualCount = 0;

        const minLen = Math.max(1, Math.floor(pcLen * 0.5));
        const maxLen = Math.min(rtToks.length - pos, Math.ceil(pcLen * 2.5));

        for (let tryLen = minLen; tryLen <= maxLen; tryLen++) {
            const rtSlice = rtToks.slice(pos, pos + tryLen);
            // 快速计算 equal tokens 数量 (不用完整 diff, 用 set 交集近似)
            const rtSet = new Set(rtSlice);
            let eqCount = 0;
            for (const t of pcToks) {
                if (rtSet.has(t)) eqCount++;
            }
            if (eqCount > bestEqualCount) {
                bestEqualCount = eqCount;
                bestConsumeLen = tryLen;
            }
        }

        const consumedRt = rtToks.slice(pos, pos + bestConsumeLen).join('');
        rtPosBySpeaker.set(spk, pos + bestConsumeLen);

        const diff = computeCharDiff(consumedRt, pcSeg.text);
        results.push({ pcSeg, rtText: consumedRt, diff });
    }

    return results;
}

// ── Diff Bubble ──
const DiffBubble: React.FC<{
    speaker: string;
    timestamp: string;
    diff: DiffToken[];
    isRight: boolean;
    isOnlyPostCall: boolean;
}> = ({ speaker, timestamp, diff, isRight, isOnlyPostCall }) => {
    const hasDiff = diff.some(d => d.type !== 'equal');

    return (
        <div style={{
            display: 'flex',
            justifyContent: isRight ? 'flex-end' : 'flex-start',
            marginBottom: '0.5rem',
            paddingLeft: isRight ? '15%' : 0,
            paddingRight: isRight ? 0 : '15%',
        }}>
            <div style={{
                background: isOnlyPostCall
                    ? 'rgba(34, 197, 94, 0.06)'
                    : (isRight ? 'rgba(var(--primary-rgb, 99, 102, 241), 0.08)' : 'rgba(var(--text-rgb, 255, 255, 255), 0.04)'),
                border: isOnlyPostCall
                    ? '1px dashed rgba(34, 197, 94, 0.3)'
                    : `1px solid ${isRight ? 'rgba(var(--primary-rgb, 99, 102, 241), 0.2)' : 'var(--glass-border)'}`,
                borderRadius: isRight ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                padding: '0.5rem 0.75rem',
                maxWidth: '100%',
            }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    marginBottom: '0.25rem', fontSize: '0.7rem', color: 'var(--text-muted)',
                }}>
                    <span style={{ fontWeight: 600 }}>{speaker}</span>
                    <span>{formatTime(timestamp)}</span>
                    {isOnlyPostCall && <span style={{ color: 'var(--success)', fontSize: '0.65rem' }}>+离线补充</span>}
                    {hasDiff && !isOnlyPostCall && <span style={{ color: 'var(--warning)', fontSize: '0.65rem' }}>≠修正</span>}
                    {!hasDiff && !isOnlyPostCall && <span style={{ color: 'var(--success)', fontSize: '0.65rem' }}>✓一致</span>}
                </div>

                <div style={{ fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--text-primary)' }}>
                    {hasDiff ? (
                        diff.map((seg, idx) => (
                            <span
                                key={idx}
                                style={{
                                    background: seg.type === 'insert'
                                        ? 'rgba(34, 197, 94, 0.15)'
                                        : seg.type === 'delete'
                                            ? 'rgba(239, 68, 68, 0.12)'
                                            : 'transparent',
                                    color: seg.type === 'delete'
                                        ? 'var(--danger)'
                                        : seg.type === 'insert'
                                            ? 'var(--success)'
                                            : 'inherit',
                                    textDecoration: seg.type === 'delete' ? 'line-through' : 'none',
                                    borderRadius: '2px',
                                    padding: seg.type !== 'equal' ? '0 2px' : '0',
                                }}
                            >
                                {seg.text}
                            </span>
                        ))
                    ) : (
                        diff.map(d => d.text).join('')
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Main Component ──
interface TranscriptDiffProps {
    realtimeTexts: TranscriptSegment[];
    postCallTexts: TranscriptSegment[];
    caller?: string;
    callee?: string;
    direction?: string;
}

export const TranscriptDiff: React.FC<TranscriptDiffProps> = ({
    realtimeTexts,
    postCallTexts,
    caller,
    callee,
    direction,
}) => {
    const { t } = useTranslation();

    const matched = useMemo(
        () => buildSegmentMatches(realtimeTexts, postCallTexts),
        [realtimeTexts, postCallTexts]
    );

    const stats = useMemo(() => {
        let eqChars = 0, insChars = 0, delChars = 0;
        let modified = 0, unchanged = 0, pcOnly = 0;
        for (const m of matched) {
            const hasDiff = m.diff.some(d => d.type !== 'equal');
            if (!m.rtText) { pcOnly++; }
            else if (hasDiff) { modified++; }
            else { unchanged++; }
            for (const d of m.diff) {
                const len = d.text.length;
                if (d.type === 'equal') eqChars += len;
                else if (d.type === 'insert') insChars += len;
                else delChars += len;
            }
        }
        const total = eqChars + Math.max(insChars, delChars);
        const accuracy = total > 0 ? Math.round((eqChars / total) * 100) : 100;
        return { modified, unchanged, pcOnly, accuracy };
    }, [matched]);

    if (postCallTexts.length === 0 || realtimeTexts.length === 0) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⚠️</div>
                <div>{t('transcript.diffNeedBoth')}</div>
            </div>
        );
    }

    return (
        <div>
            {/* Stats bar */}
            <div style={{
                display: 'flex', gap: '1rem', padding: '0.5rem 0.75rem', alignItems: 'center',
                marginBottom: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)',
                borderBottom: '1px solid var(--glass-border)', flexWrap: 'wrap',
            }}>
                <span style={{ fontWeight: 600 }}>
                    {t('transcript.diffAccuracy', '实时准确率')}: {stats.accuracy}%
                </span>
                {stats.unchanged > 0 && <span>✓{stats.unchanged}{t('transcript.diffSame', '段一致')}</span>}
                {stats.modified > 0 && <span style={{ color: 'var(--warning)' }}>≠{stats.modified}{t('transcript.diffModified', '段修正')}</span>}
                {stats.pcOnly > 0 && <span style={{ color: 'var(--success)' }}>+{stats.pcOnly}{t('transcript.diffOnlyPost', '段补充')}</span>}
            </div>

            {/* Conversation bubbles */}
            <div style={{ overflowY: 'auto', maxHeight: '400px', padding: '0.5rem', scrollBehavior: 'smooth' }}>
                {matched.map((m, idx) => (
                    <DiffBubble
                        key={idx}
                        speaker={m.pcSeg.speaker}
                        timestamp={m.pcSeg.timestamp}
                        diff={m.diff}
                        isRight={checkIsRight(m.pcSeg.speaker, caller, callee, direction)}
                        isOnlyPostCall={!m.rtText}
                    />
                ))}
            </div>
        </div>
    );
};

export default TranscriptDiff;
