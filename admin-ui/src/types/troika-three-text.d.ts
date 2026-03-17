declare module 'troika-three-text' {
    export const Text: any;
    export function preloadFont(
        options: { font: string; characters?: string | string[] },
        callback: () => void
    ): void;
}
