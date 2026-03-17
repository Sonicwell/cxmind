import * as THREE from 'three';
import type { ThemeType } from '../../context/ThemeContext';

export interface MapThemeTokens {
    floorBaseNormal: [number, number, number];
    floorGridNormal: [number, number, number];
    floorBaseCritical: [number, number, number];
    floorGridCritical: [number, number, number];
    glassWallBase: string; // fallback color if no label/zone color
    particleColor: string;
    emissiveIntensityMultiplier: number;
    opacityMultiplier: number;
}

export const MAP_THEMES: Record<ThemeType, MapThemeTokens> = {
    light: {
        floorBaseNormal: [0.95, 0.95, 0.98],
        floorGridNormal: [0.8, 0.8, 0.85],
        floorBaseCritical: [0.98, 0.85, 0.85],
        floorGridCritical: [0.96, 0.15, 0.1],
        glassWallBase: '#3b82f6',
        particleColor: '#8b5cf6',
        emissiveIntensityMultiplier: 1.5, // Brighter environment needs stronger glow
        opacityMultiplier: 1.2,
    },
    dark: {
        floorBaseNormal: [0.02, 0.027, 0.04],
        floorGridNormal: [0.0, 0.96, 0.83],
        floorBaseCritical: [0.12, 0.02, 0.02],
        floorGridCritical: [0.96, 0.15, 0.1],
        glassWallBase: '#06b6d4',
        particleColor: '#6C4BF5',
        emissiveIntensityMultiplier: 1.0,
        opacityMultiplier: 1.0,
    },
    midnight: {
        floorBaseNormal: [0.00, 0.00, 0.00],
        floorGridNormal: [0.0, 0.5, 1.0],
        floorBaseCritical: [0.05, 0.0, 0.0],
        floorGridCritical: [1.0, 0.0, 0.0],
        glassWallBase: '#0ea5e9',
        particleColor: '#0055ff',
        emissiveIntensityMultiplier: 1.2, // Pure black backgrounds can take intense glows
        opacityMultiplier: 0.8,
    },
    cyberpunk: {
        floorBaseNormal: [0.03, 0.0, 0.08],
        floorGridNormal: [1.0, 0.0, 0.5], // Neon Pink Grid
        floorBaseCritical: [0.15, 0.0, 0.0],
        floorGridCritical: [1.0, 0.2, 0.0], // Neon Orange alert
        glassWallBase: '#ff007f',
        particleColor: '#00ffff',
        emissiveIntensityMultiplier: 1.5, // Max bloom for cyberpunk
        opacityMultiplier: 1.0,
    },
    forest: {
        floorBaseNormal: [0.02, 0.05, 0.02],
        floorGridNormal: [0.1, 0.8, 0.3],
        floorBaseCritical: [0.12, 0.02, 0.02],
        floorGridCritical: [0.96, 0.15, 0.1],
        glassWallBase: '#10b981',
        particleColor: '#f1f5f9',
        emissiveIntensityMultiplier: 0.9,
        opacityMultiplier: 1.0,
    }
};

/**
 * Dynamically remaps a custom HEX color to ensure visibility and 
 * aesthetic harmony within the current global theme context.
 */
export const applyThemeToZoneColor = (hex: string, theme: ThemeType): THREE.Color => {
    // Treat the incoming hex strictly as sRGB color
    const baseColor = new THREE.Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    baseColor.getHSL(hsl);

    // Remap Saturation and Lightness based on Theme constraints
    switch (theme) {
        case 'light':
            // Darker colors, decent saturation for bright backgrounds
            baseColor.setHSL(hsl.h, Math.max(0.6, hsl.s), 0.4);
            break;
        case 'midnight':
            // High saturation, high lightness for pure black
            baseColor.setHSL(hsl.h, 0.9, 0.6);
            break;
        case 'cyberpunk':
            // Max saturation, slightly shifted lightness for neon bloom
            baseColor.setHSL(hsl.h, 1.0, 0.65);
            break;
        case 'forest':
            // Softer, slightly desaturated tones
            baseColor.setHSL(hsl.h, 0.6, 0.5);
            break;
        case 'dark':
        default:
            // Balanced colors for dark grey
            baseColor.setHSL(hsl.h, 0.8, 0.6);
            break;
    }

    // Returning in sRGB format (assuming MeshPhysicalMaterial color will handle it)
    return baseColor;
};
