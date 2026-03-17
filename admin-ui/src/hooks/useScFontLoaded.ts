import { useState, useEffect } from 'react';
import { preloadFont } from 'troika-three-text';

const REGEX_CJK = /[\u4e00-\u9fa5]/; // Basic CJK check for Chinese characters
const FALLBACK_FONT = '/fonts/RobotoMono-Medium.ttf';
const SC_FONT = '/fonts/NotoSansSC-Medium.otf';

/**
 * Custom hook to dynamically load the large Chinese font (NotoSansSC) only if needed.
 * Returns the font path to use for 3D Text rendering (fallback first, then SC once loaded).
 * 
 * @param agents Dictionary of all agents to check for Chinese names
 * @returns Path to the optimal font to use currently
 */
export function useScFontLoaded(agents?: Record<string, any>) {
    const [fontUrl, setFontUrl] = useState<string>(FALLBACK_FONT);

    useEffect(() => {
        // 1. Check if ANY agent has a CJK character in their display name
        let needsScFont = false;
        if (agents) {
            for (const key in agents) {
                const agent = agents[key];
                if (agent?.boundUser?.displayName && REGEX_CJK.test(agent.boundUser.displayName)) {
                    needsScFont = true;
                    break;
                }
            }
        }

        // 2. If no Chinese characters found, stick with Fallback to save 7MB
        if (!needsScFont) {
            return;
        }

        // 3. Otherwise, preload the SC font in the background without suspending
        let isActive = true;

        preloadFont(
            { font: SC_FONT },
            () => {
                if (isActive) {
                    // Once loaded, swap to the high-res Chinese font
                    setFontUrl(SC_FONT);
                }
            }
        );

        return () => {
            isActive = false;
        };
    }, [agents]);

    return fontUrl;
}
