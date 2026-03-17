export interface TranscriptSegment {
    timestamp: string;
    text: string;
    speaker: string;
    emotion?: string;
}

class DemoAudioManager {
    private synthesis: SpeechSynthesis;
    private isPlaying: boolean = false;
    private currentUtterance: SpeechSynthesisUtterance | null = null;
    private voices: SpeechSynthesisVoice[] = [];

    constructor() {
        this.synthesis = window.speechSynthesis;
        this.loadVoices();
        if (this.synthesis.onvoiceschanged !== undefined) {
            this.synthesis.onvoiceschanged = () => this.loadVoices();
        }
    }

    private loadVoices() {
        this.voices = this.synthesis.getVoices();
    }

    private getVoice(speaker: string): SpeechSynthesisVoice | null {
        // Try to find distinct voices for caller vs callee
        // Prefer "Google" voices if available as they sound better usually
        const googleVoices = this.voices.filter(v => v.name.includes('Google'));
        const voices = googleVoices.length > 0 ? googleVoices : this.voices;

        if (speaker === 'caller') {
            // Try to find a male-sounding or specific voice
            return voices.find(v => v.name.includes('Male') || v.name.includes('David') || v.name.includes('James')) || voices[0];
        } else {
            // Try to find a female-sounding voice
            return voices.find(v => v.name.includes('Female') || v.name.includes('Zira') || v.name.includes('Samantha')) || voices[1] || voices[0];
        }
    }

    public playSegment(text: string, speaker: string, onEnd?: () => void) {
        if (!text) {
            if (onEnd) onEnd();
            return;
        }

        this.currentUtterance = new SpeechSynthesisUtterance(text);

        // Select voice
        const voice = this.getVoice(speaker);
        if (voice) this.currentUtterance.voice = voice;

        // Adjust pitch/rate based on speaker to distinguish them further
        if (speaker === 'caller') {
            this.currentUtterance.pitch = 0.9;
            this.currentUtterance.rate = 1.0;
        } else {
            this.currentUtterance.pitch = 1.1;
            this.currentUtterance.rate = 1.05;
        }

        this.currentUtterance.onend = () => {
            if (onEnd) onEnd();
        };

        this.currentUtterance.onerror = (e) => {
            console.error('TTS Error:', e);
            if (onEnd) onEnd();
        };

        this.synthesis.speak(this.currentUtterance);
    }

    public playConversation(transcript: TranscriptSegment[], onProgress?: (index: number) => void, onComplete?: () => void) {
        this.stop();
        this.isPlaying = true;

        let index = 0;

        const playNext = () => {
            if (!this.isPlaying || index >= transcript.length) {
                this.isPlaying = false;
                if (onComplete) onComplete();
                return;
            }

            const segment = transcript[index];
            if (onProgress) onProgress(index);

            // Add a small delay between speakers
            setTimeout(() => {
                if (!this.isPlaying) return;
                this.playSegment(segment.text, segment.speaker, () => {
                    index++;
                    playNext();
                });
            }, 500);
        };

        playNext();
    }

    public stop() {
        this.isPlaying = false;
        this.synthesis.cancel();
    }

    public isDemoPlaying() {
        return this.isPlaying;
    }
}

export const demoAudio = new DemoAudioManager();
