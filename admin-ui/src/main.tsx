import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// ── Self-hosted fonts (no CDN dependency, works behind Great Firewall) ──
// Inter — English / Spanish / Latin numerics
import '@fontsource/inter/300.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
// Noto Sans SC — Simplified Chinese (fallback for HarmonyOS Sans SC)
import '@fontsource/noto-sans-sc/400.css'
import '@fontsource/noto-sans-sc/500.css'
import '@fontsource/noto-sans-sc/700.css'
// Noto Sans JP — Japanese
import '@fontsource/noto-sans-jp/400.css'
import '@fontsource/noto-sans-jp/700.css'
// Noto Sans KR — Korean
import '@fontsource/noto-sans-kr/400.css'
import '@fontsource/noto-sans-kr/700.css'
// Noto Sans Arabic — Arabic (RTL)
import '@fontsource/noto-sans-arabic/400.css'
import '@fontsource/noto-sans-arabic/700.css'

import './index.css'
import App from './App.tsx'
import { migrateStorage } from './utils/migrate-storage'
import './i18n/config'
// Migrate legacy localStorage keys before React mounts
migrateStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
