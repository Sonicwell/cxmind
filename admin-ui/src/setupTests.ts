import '@testing-library/jest-dom';
import { vi } from 'vitest';

// vi.mock factory 被 vitest hoisted 到 import 之前执行
// 因此不能引用外部 import 的变量（如 enTranslations）。
// 使用 fs.readFileSync 在 factory 内部同步加载 JSON
vi.mock('react-i18next', async () => {
    let enTranslations: Record<string, any> = {};
    try {
        // @ts-ignore — Node builtins available in vitest's node layer, not in browser tsconfig
        const fs = await import('node:fs');
        // @ts-ignore
        const path = await import('node:path');
        // @ts-ignore
        const { fileURLToPath } = await import('node:url');
        const currentDir = path.dirname(fileURLToPath(import.meta.url));
        const jsonPath = path.resolve(currentDir, 'i18n/locales/en.json');
        enTranslations = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    } catch { /* CI 环境读取失败时降级为纯 key/defaultValue 返回 */ }

    const tFn = (key: string, defaultValueOrOptions?: string | Record<string, unknown>) => {
        const keys = key?.split('.') || [];
        let val: any = enTranslations;
        for (const k of keys) {
            if (val && typeof val === 'object') {
                val = val[k];
            } else {
                val = undefined;
                break;
            }
        }

        const opts = (defaultValueOrOptions && typeof defaultValueOrOptions === 'object') ? defaultValueOrOptions : null;
        const defaultValue = typeof defaultValueOrOptions === 'string'
            ? defaultValueOrOptions
            : (opts?.defaultValue as string | undefined);

        let result = (typeof val === 'string') ? val : (defaultValue || key);

        // {{var}} 插值
        if (opts) {
            result = result.replace(/\{\{(\w+)\}\}/g, (_: string, varName: string) => {
                const v = opts[varName];
                return v != null ? String(v) : `{{${varName}}}`;
            });
        }

        return result;
    };

    return {
        useTranslation: () => ({
            t: tFn,
            i18n: { language: 'en', changeLanguage: () => { } },
        }),
        Trans: ({ children }: any) => children,
        initReactI18next: { type: '3rdParty', init: () => { } },
    };
});

