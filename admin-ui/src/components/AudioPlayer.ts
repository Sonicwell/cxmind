import { OpusDecoder } from 'opus-decoder';

/**
 * Recording segment representing a continuous monitoring period
 */
interface RecordingSegment {
    id: string;
    startTime: number;      // Timestamp in ms
    endTime: number;        // Timestamp in ms
    buffers: AudioBuffer[]; // Audio buffers for this segment
    duration: number;       // Duration in seconds
}

/**
 * Gap marker representing a monitoring interruption
 */
interface GapMarker {
    position: number;       // Position in seconds from start
    duration: number;       // Gap duration in seconds
    reason: 'manual' | 'network';
}

/**
 * AudioPlayer class for playing real-time Opus/PCM audio streams
 * Uses Web Audio API for low-latency playback with Opus decoding support
 */
export class AudioPlayer {
    private audioContext: AudioContext;
    private sampleRate: number = 8000; // Input audio is 8kHz
    private nextPlayTime: number = 0;
    private isPlaying: boolean = true;
    private gainNode: GainNode;
    private opusDecoder: any = null;
    private decoderReady: boolean = false;

    // Audio buffering
    private audioQueue: AudioBuffer[] = [];
    private bufferSize: number = 3; // Buffer 3 frames (~60ms) before playing
    private isBuffering: boolean = true;
    private bufferStarted: boolean = false;

    // Recording for playback with segment management
    private recordedBuffers: AudioBuffer[] = [];
    private isRecording: boolean = true;

    // Segment management for handling monitoring interruptions
    private currentSegmentBuffers: AudioBuffer[] = [];
    private segments: RecordingSegment[] = [];
    private gaps: GapMarker[] = [];
    private segmentStartTime: number = 0;

    // Playback mode and position tracking
    private playbackMode: 'live' | 'playback' = 'live';
    private playbackPosition: number = 0; // Current playback position in seconds
    private playbackBufferIndex: number = 0; // Current buffer index during playback
    private playbackTimer: number | null = null;
    private onPlaybackComplete: (() => void) | null = null; // Callback when playback completes

    constructor() {
        // Create AudioContext with 8kHz to match input audio sample rate
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
            sampleRate: this.sampleRate,
            latencyHint: 'playback'
        });

        console.log('[AudioPlayer] AudioContext created with sample rate:', this.audioContext.sampleRate);

        // Create gain node for volume control
        this.gainNode = this.audioContext.createGain();
        this.gainNode.connect(this.audioContext.destination);
        this.gainNode.gain.value = 1.0;

        // 初始化播放时间
        this.nextPlayTime = this.audioContext.currentTime;

        // 初始化Opus decoder
        this.initOpusDecoder();
    }

    /**
     * Initialize Opus decoder (async)
     */
    private async initOpusDecoder() {
        // 初始化Opus decoder
        try {
            this.opusDecoder = new OpusDecoder();
            await this.opusDecoder.ready;
            this.decoderReady = true;
            console.log('✅ Opus decoder initialized');
        } catch (error) {
            console.error('Failed to initialize Opus decoder:', error);
            this.decoderReady = false;
        }
    }

    /**
     * Start a new recording segment
     * Called when monitoring starts or resumes
     */
    startNewSegment() {
        // If there was a previous segment, finalize it
        if (this.currentSegmentBuffers.length > 0) {
            this.finalizeCurrentSegment();
        }

        this.currentSegmentBuffers = [];
        this.segmentStartTime = Date.now();
        console.log('[AudioPlayer] Started new recording segment');
    }

    /**
     * Stop current recording segment
     * Called when monitoring stops or pauses
     */
    stopCurrentSegment(): number {
        if (this.currentSegmentBuffers.length === 0) {
            return 0;
        }

        this.finalizeCurrentSegment();
        const duration = this.getRecordingDuration();
        console.log(`[AudioPlayer] Stopped segment, total duration: ${duration.toFixed(2)}s`);
        return duration;
    }

    /**
     * Finalize current segment and detect gaps
     */
    private finalizeCurrentSegment() {
        if (this.currentSegmentBuffers.length === 0) return;

        const segmentDuration = this.currentSegmentBuffers.reduce(
            (sum, buf) => sum + buf.duration, 0
        );

        const segment: RecordingSegment = {
            id: crypto.randomUUID(),
            startTime: this.segmentStartTime,
            endTime: Date.now(),
            buffers: [...this.currentSegmentBuffers],
            duration: segmentDuration
        };

        // Detect gap if there was a previous segment
        if (this.segments.length > 0) {
            const lastSegment = this.segments[this.segments.length - 1];
            const gapDuration = (segment.startTime - lastSegment.endTime) / 1000;

            if (gapDuration > 0.5) { // Gap > 500ms
                const gap: GapMarker = {
                    position: this.getRecordingDuration(),
                    duration: gapDuration,
                    reason: 'manual'
                };
                this.gaps.push(gap);
                console.log(`[AudioPlayer] Detected gap: ${gapDuration.toFixed(2)}s`);
            }
        }

        this.segments.push(segment);
        this.recordedBuffers.push(...this.currentSegmentBuffers);
        this.currentSegmentBuffers = [];
    }

    /**
     * Test playback with a known frequency (440Hz A note)
     * If playback is correct, you'll hear a clear A note
     * If slow-motion, you'll hear a lower pitch
     */
    playTestTone() {
        const sampleRate = this.audioContext.sampleRate;
        const duration = 1.0; // 1 second
        const frequency = 440; // A4 note
        const numSamples = Math.floor(sampleRate * duration);

        const audioBuffer = this.audioContext.createBuffer(1, numSamples, sampleRate);
        const channelData = audioBuffer.getChannelData(0);

        // Generate 440Hz sine wave
        for (let i = 0; i < numSamples; i++) {
            channelData[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.3;
        }

        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.gainNode);
        source.start(this.audioContext.currentTime);
    }

    /**
     * Play an audio frame
     * @param audioFrame Audio frame with Opus or PCM data
     */
    async playAudioFrame(audioFrame: any) {
        // Always process frames for recording, even when paused
        // The schedulePlayback() method will handle pause state

        // 确保AudioContext active, 否则decode不了
        if (this.audioContext.state === 'suspended' && this.isPlaying) {
            await this.audioContext.resume();
        }

        try {
            // Opus格式 (首选)
            if (audioFrame.opus_data) {
                await this.playOpusFrame(audioFrame);
            }
            // 老版PCM格式
            else if (audioFrame.pcm_data) {
                this.playPCMFrame(audioFrame);
            } else {
                // Audio frame has no opus_data or pcm_data
            }
        } catch (error) {
            // Failed to play audio frame
        }
    }

    /**
     * Play Opus encoded frame
     */
    private async playOpusFrame(audioFrame: any) {
        if (!this.decoderReady || !this.opusDecoder) {
            // Opus decoder not ready, skipping frame
            return;
        }

        try {
            // Decode Base64 Opus data
            const opusData = this.base64ToArrayBuffer(audioFrame.opus_data);
            const opusUint8 = new Uint8Array(opusData);

            // Decode Opus to PCM using opus-decoder
            // @ts-ignore
            const decoded = await this.opusDecoder.decodeFrame(opusUint8);

            if (!decoded || decoded.channelData.length === 0) {
                // Opus decode returned empty data
                return;
            }

            // decoded.channelData is Float32Array[] (array of channels)
            const pcmData = decoded.channelData[0]; // Get first channel (mono)

            // IMPORTANT: Opus decoder outputs at 8kHz, but AudioContext might be 48kHz
            // resample到AudioContext的采样率
            const decodedSampleRate = decoded.sampleRate || 8000;
            const targetSampleRate = this.audioContext.sampleRate;

            let resampledData: Float32Array;

            if (decodedSampleRate !== targetSampleRate) {
                // Resample from decodedSampleRate to targetSampleRate
                const ratio = targetSampleRate / decodedSampleRate;
                const newLength = Math.floor(pcmData.length * ratio);
                resampledData = new Float32Array(newLength);

                // Simple linear interpolation resampling
                for (let i = 0; i < newLength; i++) {
                    const srcIndex = i / ratio;
                    const srcIndexFloor = Math.floor(srcIndex);
                    const srcIndexCeil = Math.min(srcIndexFloor + 1, pcmData.length - 1);
                    const fraction = srcIndex - srcIndexFloor;

                    resampledData[i] = pcmData[srcIndexFloor] * (1 - fraction) +
                        pcmData[srcIndexCeil] * fraction;
                }
            } else {
                resampledData = pcmData;
            }

            // Create audio buffer with AudioContext's sample rate
            const audioBuffer = this.audioContext.createBuffer(
                1,  // mono
                resampledData.length,
                targetSampleRate
            );

            audioBuffer.getChannelData(0).set(resampledData);

            // Schedule playback
            this.schedulePlayback(audioBuffer);
        } catch (error) {
            // Failed to decode Opus frame
        }
    }

    /**
     * Play PCM encoded frame (legacy)
     */
    private playPCMFrame(audioFrame: any) {
        // Decode Base64 PCM data
        const pcmData = this.base64ToArrayBuffer(audioFrame.pcm_data);
        const int16Array = new Int16Array(pcmData);

        // Convert to Float32Array for Web Audio API
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0; // Normalize to [-1, 1]
        }

        // Create audio buffer - CRITICAL: Use AudioContext's sample rate!
        const audioBuffer = this.audioContext.createBuffer(
            1,  // mono
            float32Array.length,
            this.audioContext.sampleRate  // Use AudioContext's actual sample rate
        );

        audioBuffer.getChannelData(0).set(float32Array);

        // Schedule playback
        this.schedulePlayback(audioBuffer);
    }

    /**
     * Schedule audio buffer for playback with buffering
     */
    private schedulePlayback(audioBuffer: AudioBuffer) {
        // Add to current segment if recording
        if (this.isRecording) {
            this.currentSegmentBuffers.push(audioBuffer);
        }

        // Add to queue
        this.audioQueue.push(audioBuffer);

        // Start playing once buffer is filled
        if (this.isBuffering && this.audioQueue.length >= this.bufferSize) {
            this.isBuffering = false;
            this.bufferStarted = true;

            // nextPlayTime初始化为当前时间
            this.nextPlayTime = this.audioContext.currentTime;

            // Schedule all buffered frames
            this.playFromQueue();
        } else if (!this.isBuffering && this.bufferStarted) {
            // Only schedule if we're running low on scheduled audio
            // Check if we need to schedule more frames
            const now = this.audioContext.currentTime;
            const scheduledAhead = this.nextPlayTime - now;

            // If we have less than 100ms of audio scheduled, schedule more
            if (scheduledAhead < 0.1) {
                this.playFromQueue();
            }
        }
    }

    /**
     * Play audio from queue
     */
    private playFromQueue() {
        const now = this.audioContext.currentTime;
        let framesScheduled = 0;

        // nextPlayTime落后了就重置
        if (this.nextPlayTime < now) {
            this.nextPlayTime = now;
        }


        // Schedule all available frames
        while (this.audioQueue.length > 0) {
            const audioBuffer = this.audioQueue.shift()!;
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.gainNode);

            source.start(this.nextPlayTime);

            // Update next play time
            this.nextPlayTime += audioBuffer.duration;
            framesScheduled++;
        }
    }


    /**
     * Replay recorded audio
     */
    async replay() {
        if (this.recordedBuffers.length === 0) {
            console.warn('No recorded audio to replay');
            return;
        }

        console.log(`🔄 Replaying ${this.recordedBuffers.length} frames (${this.getRecordingDuration()}s)`);

        // Pause live playback
        const wasPlaying = this.isPlaying;
        this.pause();

        // Clear queue
        this.audioQueue = [];
        this.nextPlayTime = this.audioContext.currentTime;

        // Play all recorded buffers
        for (const buffer of this.recordedBuffers) {
            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.gainNode);
            source.start(this.nextPlayTime);
            this.nextPlayTime += buffer.duration;
        }

        // Resume live playback after replay
        if (wasPlaying) {
            setTimeout(() => {
                this.resume();
            }, this.getRecordingDuration() * 1000);
        }
    }

    /**
     * Get recording duration in seconds
     * Includes both finalized segments and current segment
     */
    getRecordingDuration(): number {
        // Sum finalized segments
        const finalizedDuration = this.recordedBuffers.reduce((total, buffer) => total + buffer.duration, 0);

        // Add current segment duration
        const currentDuration = this.currentSegmentBuffers.reduce((total, buffer) => total + buffer.duration, 0);

        return finalizedDuration + currentDuration;
    }

    /**
     * Clear recorded audio
     */
    clearRecording() {
        this.recordedBuffers = [];
        this.segments = [];
        this.gaps = [];
        this.currentSegmentBuffers = [];
        console.log('🗑️ Recording cleared');
    }

    /**
     * Get all recording segments
     */
    getSegments(): RecordingSegment[] {
        return this.segments;
    }

    /**
     * Get all gap markers
     */
    getGaps(): GapMarker[] {
        return this.gaps;
    }

    /**
     * Get recording statistics
     */
    getRecordingStats() {
        return {
            totalDuration: this.getRecordingDuration(),
            segmentCount: this.segments.length,
            gapCount: this.gaps.length,
            gaps: this.gaps, // Add gaps array for timeline markers
            totalGapDuration: this.gaps.reduce((sum, gap) => sum + gap.duration, 0),
            recordedFrames: this.recordedBuffers.length,
            estimatedMemoryMB: (this.recordedBuffers.length * 320) / (1024 * 1024)
        };
    }

    /**
     * Set buffer size (number of frames to buffer)
     */
    setBufferSize(size: number) {
        this.bufferSize = Math.max(1, Math.min(50, size)); // 1-50 frames
        console.log(`📊 Buffer size set to ${this.bufferSize} frames (~${this.bufferSize * 20}ms)`);
    }

    /**
     * Get buffer status
     */
    getBufferStatus() {
        return {
            queueLength: this.audioQueue.length,
            bufferSize: this.bufferSize,
            isBuffering: this.isBuffering,
            recordedFrames: this.recordedBuffers.length,
            recordingDuration: this.getRecordingDuration()
        };
    }

    /**
     * Decode Base64 string to ArrayBuffer
     */
    private base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * Pause audio playback
     */
    pause() {
        this.isPlaying = false;
        this.audioContext.suspend();
    }

    /**
     * Resume audio playback
     */
    resume() {
        this.isPlaying = true;
        this.audioContext.resume();
        this.nextPlayTime = this.audioContext.currentTime;
    }

    /**
     * Stop and cleanup
     */
    stop() {
        this.isPlaying = false;
        this.audioContext.close();
    }

    /**
     * Set volume (0.0 to 1.0)
     */
    setVolume(volume: number) {
        const clampedVolume = Math.max(0, Math.min(1, volume));
        this.gainNode.gain.value = clampedVolume;
        console.log('[AudioPlayer] setVolume called:', {
            requestedVolume: volume,
            clampedVolume,
            actualGainValue: this.gainNode.gain.value
        });
    }

    /**
     * Get current state
     */
    getState() {
        return {
            isPlaying: this.isPlaying,
            currentTime: this.audioContext.currentTime,
            state: this.audioContext.state
        };
    }

    /**
     * Get current playback position in seconds
     */
    getCurrentPosition(): number {
        if (this.playbackMode === 'live') {
            return this.getRecordingDuration();
        }
        return this.playbackPosition;
    }

    /**
     * Check if playback position is near live (within threshold seconds)
     */
    isNearLive(threshold: number = 2): boolean {
        const totalDuration = this.getRecordingDuration();
        const currentPosition = this.getCurrentPosition();
        return (totalDuration - currentPosition) < threshold;
    }

    /**
     * Play from a specific position in seconds
     * Enters playback mode and starts playing from the specified position
     */
    async playFromPosition(positionSeconds: number) {
        // Stop any existing playback timer
        if (this.playbackTimer) {
            clearTimeout(this.playbackTimer);
            this.playbackTimer = null;
        }

        // 确保playing状态且AudioContext在跑
        this.isPlaying = true;
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        this.playbackMode = 'playback';
        this.playbackPosition = positionSeconds;

        // Find the buffer index corresponding to this position
        let accumulatedTime = 0;
        this.playbackBufferIndex = 0;

        for (let i = 0; i < this.currentSegmentBuffers.length; i++) {
            const buffer = this.currentSegmentBuffers[i];
            if (accumulatedTime + buffer.duration >= positionSeconds) {
                this.playbackBufferIndex = i;
                break;
            }
            accumulatedTime += buffer.duration;
        }

        // Check if we're already at the end
        if (this.playbackBufferIndex >= this.currentSegmentBuffers.length) {
            if (this.onPlaybackComplete) {
                this.isPlaying = false;
                this.playbackPosition = 0;
                this.playbackBufferIndex = 0;
                this.onPlaybackComplete();
            }
            return;
        }

        // Reset audio timing
        this.nextPlayTime = this.audioContext.currentTime;

        // Start playback loop
        this.startPlaybackLoop();
    }

    /**
     * Playback loop - plays buffers sequentially from current index
     */
    private startPlaybackLoop() {
        if (!this.isPlaying) return;

        // Check if we've reached the end of available buffers
        if (this.playbackBufferIndex >= this.currentSegmentBuffers.length) {

            // Playback complete
            if (this.onPlaybackComplete) {
                // Call ended - stop and reset
                this.isPlaying = false;
                this.playbackPosition = 0;
                this.playbackBufferIndex = 0;
                this.onPlaybackComplete();
            } else {
                // Call ongoing - switch to live mode
                this.switchToLive();
            }
            return;
        }

        const buffer = this.currentSegmentBuffers[this.playbackBufferIndex];

        // Play this buffer
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.gainNode);

        const currentTime = this.audioContext.currentTime;
        if (this.nextPlayTime < currentTime) {
            this.nextPlayTime = currentTime;
        }

        source.start(this.nextPlayTime);
        this.nextPlayTime += buffer.duration;

        // Update position and index
        this.playbackPosition += buffer.duration;
        this.playbackBufferIndex++;

        // Schedule next buffer
        this.playbackTimer = window.setTimeout(
            () => this.startPlaybackLoop(),
            buffer.duration * 1000
        );
    }

    /**
     * Set callback for when playback completes (for ended calls)
     */
    setPlaybackCompleteCallback(callback: (() => void) | null) {
        this.onPlaybackComplete = callback;
    }

    /**
     * Switch to live mode
     * Stops playback loop and resumes real-time streaming
     */
    switchToLive() {
        // Clear playback timer
        if (this.playbackTimer) {
            clearTimeout(this.playbackTimer);
            this.playbackTimer = null;
        }

        this.playbackMode = 'live';
        this.playbackBufferIndex = this.currentSegmentBuffers.length;
        this.playbackPosition = this.getRecordingDuration();

        // Reset timing for live playback
        this.nextPlayTime = this.audioContext.currentTime;
    }
}
