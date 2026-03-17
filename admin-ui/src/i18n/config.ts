import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zh from './locales/zh.json';
import en from './locales/en.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import es from './locales/es.json';
import ar from './locales/ar.json';

const resources = {
    zh: { translation: zh },
    en: { translation: en },
    ja: { translation: ja },
    ko: { translation: ko },
    es: { translation: es },
    ar: { translation: ar },
};

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        fallbackLng: 'en',
        supportedLngs: ['zh', 'en', 'ja', 'ko', 'es', 'ar'],

        interpolation: {
            escapeValue: false, // React already does escaping
        },

        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
        }
    });

// RTL文字方向和per-language字体动态处理
i18n.on('languageChanged', (lng) => {
    const html = document.documentElement;
    html.lang = lng;
    html.dir = i18n.dir(lng);
    // Set data-lang so CSS can apply per-language font-family rules
    html.dataset.lang = lng.slice(0, 2);   // 'zh', 'en', 'ja', 'ko', 'es', 'ar'
});

// 初始加载时应用 (language可能已从localStorage读出来了)
try {
    const saved = localStorage.getItem('i18nextLng')?.slice(0, 2);
    if (saved) document.documentElement.dataset.lang = saved;
} catch { /* SSR */ }

export default i18n;
