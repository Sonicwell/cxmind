// src/workers/vad.worker.ts

// Since Web Worker cannot directly access the window or DOM, we receive
// the Float32Array channel data via postMessage.
self.onmessage = (e: MessageEvent) => {
    const { leftData, rightData, sampleRate, threshold = 0.02, minDurationSec = 0.15 } = e.data;

    if (!leftData || !rightData || !sampleRate) {
        self.postMessage({ error: 'Missing required audio data for VAD' });
        return;
    }

    try {
        const leftVAD = detectVAD(leftData, sampleRate, threshold, minDurationSec);
        const rightVAD = detectVAD(rightData, sampleRate, threshold, minDurationSec);
        const crosstalk = computeCrosstalk(leftVAD, rightVAD);

        // Send back the results
        self.postMessage({ leftVAD, rightVAD, crosstalk });
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.message : 'Unknown VAD error' });
    }
};

// Amplitude-based Voice Activity Detection from PCM audio data (Float32Array)
function detectVAD(data: Float32Array, sampleRate: number, threshold: number, minDurationSec: number): { start: number; end: number }[] {
    // Analyze in 50ms frames
    const frameSize = Math.floor(sampleRate * 0.05);
    const regions: { start: number; end: number }[] = [];

    let inSpeech = false;
    let speechStart = 0;

    for (let i = 0; i < data.length; i += frameSize) {
        // Compute RMS energy for this frame
        let sumSq = 0;
        const end = Math.min(i + frameSize, data.length);
        for (let j = i; j < end; j++) {
            sumSq += data[j] * data[j];
        }
        const rms = Math.sqrt(sumSq / (end - i));

        const timeSec = i / sampleRate;

        if (rms > threshold) {
            if (!inSpeech) {
                inSpeech = true;
                speechStart = timeSec;
            }
        } else {
            if (inSpeech) {
                inSpeech = false;
                const dur = timeSec - speechStart;
                if (dur >= minDurationSec) {
                    regions.push({ start: speechStart, end: timeSec });
                }
            }
        }
    }
    // Close any open region
    if (inSpeech) {
        const endTime = data.length / sampleRate;
        if (endTime - speechStart >= minDurationSec) {
            regions.push({ start: speechStart, end: endTime });
        }
    }

    // Merge regions that are very close together (< 200ms gap)
    const merged: { start: number; end: number }[] = [];
    for (const r of regions) {
        if (merged.length > 0 && r.start - merged[merged.length - 1].end < 0.2) {
            merged[merged.length - 1].end = r.end;
        } else {
            merged.push({ ...r });
        }
    }
    return merged;
}

// Compute cross-talk: overlapping regions between two VAD results
function computeCrosstalk(
    leftVAD: { start: number; end: number }[],
    rightVAD: { start: number; end: number }[]
): { start: number; end: number }[] {
    const overlaps: { start: number; end: number }[] = [];
    for (const l of leftVAD) {
        for (const r of rightVAD) {
            const overlapStart = Math.max(l.start, r.start);
            const overlapEnd = Math.min(l.end, r.end);
            if (overlapStart < overlapEnd && (overlapEnd - overlapStart) >= 0.1) {
                overlaps.push({ start: overlapStart, end: overlapEnd });
            }
        }
    }
    return overlaps;
}
