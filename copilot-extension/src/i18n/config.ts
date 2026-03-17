import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import zh from './locales/zh.json'
import ja from './locales/ja.json'
import ko from './locales/ko.json'

const resources = {
    en: { translation: en },
    zh: { translation: zh },
    ja: { translation: ja },
    ko: { translation: ko },
}

// 从 chrome.storage 读取保存的语言，异步初始化后切换
const STORAGE_KEY = 'copilot-lang'

i18n
    .use(initReactI18next)
    .init({
        resources,
        fallbackLng: 'en',
        supportedLngs: ['en', 'zh', 'ja', 'ko'],
        lng: navigator.language?.startsWith('zh') ? 'zh'
            : navigator.language?.startsWith('ja') ? 'ja'
                : navigator.language?.startsWith('ko') ? 'ko'
                    : 'en',

        interpolation: {
            escapeValue: false, // React 自动 escape
        },
    })

// 从 chrome.storage 恢复用户手动选择的语言
try {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
        const saved = result[STORAGE_KEY]
        if (saved && i18n.language !== saved) {
            i18n.changeLanguage(saved)
        }
    })
} catch { /* 非扩展环境 fallback */ }

// 语言变更时持久化到 chrome.storage
i18n.on('languageChanged', (lng) => {
    try {
        chrome.storage.local.set({ [STORAGE_KEY]: lng })
    } catch { /* 非扩展环境 */ }
})

export default i18n
