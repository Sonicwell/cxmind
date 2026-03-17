/**
 * Singleton service for UI sound effects using Web Audio API.
 *
 * Micro-delight sounds are intentionally short (<100ms) and quiet
 * to convey tactile feedback without being annoying.
 */

const STORAGE_KEY = 'cxmind_pref_sound_enabled';

export type SoundType = 'click' | 'hover' | 'success' | 'error' | 'toggle' | 'confirm' | 'alert' | 'bubble';

export class SoundService {
    private static instance: SoundService;
    private ctx: AudioContext | null = null;
    private enabled = true;

    private constructor() {
        // Restore preference from localStorage
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored !== null) {
                this.enabled = stored === 'true';
            }
        }
    }

    public static getInstance(): SoundService {
        if (!SoundService.instance) {
            SoundService.instance = new SoundService();
        }
        return SoundService.instance;
    }

    private initContext() {
        if (!this.ctx && typeof window !== 'undefined' && window.AudioContext) {
            this.ctx = new window.AudioContext();
        }
    }

    public setEnabled(enabled: boolean) {
        this.enabled = enabled;
        if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, String(enabled));
        }
    }

    public isEnabled(): boolean {
        return this.enabled;
    }

    public play(type: SoundType) {
        if (!this.enabled) return;

        // Initialize context on first user interaction
        if (!this.ctx) {
            this.initContext();
        }

        if (this.ctx?.state === 'suspended') {
            this.ctx.resume().catch(() => { });
        }

        if (!this.ctx) return;

        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        switch (type) {
            case 'click':
                // Short high-pitched click — tactile "press" feel
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, t);
                osc.frequency.exponentialRampToValueAtTime(400, t + 0.05);
                gain.gain.setValueAtTime(0.3, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
                osc.start(t);
                osc.stop(t + 0.05);
                break;

            case 'hover':
                // Very subtle pop — barely audible presence
                osc.type = 'sine';
                osc.frequency.setValueAtTime(400, t);
                osc.frequency.exponentialRampToValueAtTime(600, t + 0.03);
                gain.gain.setValueAtTime(0.05, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.03);
                osc.start(t);
                osc.stop(t + 0.03);
                break;

            case 'success':
                // Ascending major third — positive confirmation
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, t);
                osc.frequency.setValueAtTime(554.37, t + 0.1); // C#5
                gain.gain.setValueAtTime(0.2, t);
                gain.gain.linearRampToValueAtTime(0.2, t + 0.1);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
                osc.start(t);
                osc.stop(t + 0.3);
                break;

            case 'error':
                // Descending sawtooth — something went wrong
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(150, t);
                osc.frequency.linearRampToValueAtTime(100, t + 0.2);
                gain.gain.setValueAtTime(0.2, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
                osc.start(t);
                osc.stop(t + 0.2);
                break;

            case 'toggle':
                // Short "tick" — physical switch feel
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1200, t);
                osc.frequency.exponentialRampToValueAtTime(800, t + 0.03);
                gain.gain.setValueAtTime(0.15, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.03);
                osc.start(t);
                osc.stop(t + 0.03);
                break;

            case 'confirm':
                // Ascending double-note — form saved / action confirmed
                osc.type = 'sine';
                osc.frequency.setValueAtTime(523.25, t);       // C5
                osc.frequency.setValueAtTime(659.25, t + 0.08); // E5
                gain.gain.setValueAtTime(0.18, t);
                gain.gain.linearRampToValueAtTime(0.18, t + 0.08);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
                osc.start(t);
                osc.stop(t + 0.2);
                break;

            case 'alert':
                // Short attention pulse — warning notification
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(300, t);
                osc.frequency.linearRampToValueAtTime(200, t + 0.15);
                gain.gain.setValueAtTime(0.15, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
                osc.start(t);
                osc.stop(t + 0.15);
                break;

            case 'bubble':
                // Bubbly pop — playful, lighter than click
                osc.type = 'sine';
                osc.frequency.setValueAtTime(200, t);
                osc.frequency.exponentialRampToValueAtTime(800, t + 0.08);
                gain.gain.setValueAtTime(0.12, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
                osc.start(t);
                osc.stop(t + 0.08);
                break;
        }
    }
}
