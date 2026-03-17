declare module 'screenfull' {
    export interface Screenfull {
        isEnabled: boolean;
        isFullscreen: boolean;
        request(element?: Element): Promise<void>;
        exit(): Promise<void>;
        toggle(element?: Element): Promise<void>;
        on(event: string, handler: (event: Event) => void): void;
        off(event: string, handler: (event: Event) => void): void;
        onchange(handler: (event: Event) => void): void;
        onerror(handler: (event: Event) => void): void;
    }

    const screenfull: Screenfull;
    export = screenfull;
}
