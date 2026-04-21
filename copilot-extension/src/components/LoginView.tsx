import { useState, useEffect } from "react"
import { useAuth } from "~/hooks/useAuth"
import { LogIn, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react"
import { useTranslation } from "react-i18next"
import { DEMO_ENABLED } from "~/utils/demo-flag"

export function LoginView() {
  const { login, loginWithGoogle, isLoading, error } = useAuth()
  const { t, i18n } = useTranslation()
  const [apiUrl, setApiUrl] = useState("http://localhost:3000")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)

  // Load saved credentials on mount
  useEffect(() => {
    chrome.storage.local.get(["rememberMe", "savedEmail", "savedPassword", "savedApiUrl"], (result) => {
      if (result.rememberMe) {
        setRememberMe(true)
        if (result.savedEmail) setUsername(result.savedEmail)
        if (result.savedPassword) setPassword(result.savedPassword)
        if (result.savedApiUrl) setApiUrl(result.savedApiUrl)
      }
    })
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // 对 demo 模式免密码 (编译时 flag 控制)
    const isDemo = DEMO_ENABLED && username.toLowerCase() === 'demo@example.com';
    if (!username || (!password && !isDemo)) return

    // Persist or clear saved credentials based on Remember Me
    if (rememberMe) {
      chrome.storage.local.set({ rememberMe: true, savedEmail: username, savedPassword: password, savedApiUrl: apiUrl })
    } else {
      chrome.storage.local.remove(["rememberMe", "savedEmail", "savedPassword", "savedApiUrl"])
    }

    login(apiUrl, username, password)
  }

  return (
    <div className="login-view">
      <div className="login-brand">
        <div className="login-logo-glow">
          <img className="login-logo" src={require("url:~/assets/copilot-logo.svg")} alt="CXMind Copilot" />
        </div>
        <h1 className="login-title">{t('login.title')}</h1>
        <p className="login-subtitle">{t('login.subtitle')}</p>
      </div>

      <form className="login-form glass-card" onSubmit={handleSubmit}>
        {error && (
          <div className="login-error animate-fade-in">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="login-field">
          <label>{t('login.serverUrl')}</label>
          <input
            className="input-field"
            type="url"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="http://localhost:3000"
          />
        </div>

        <div className="login-field">
          <label>{t('login.email')}</label>
          <input
            className="input-field"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="agent@example.com"
            autoFocus
          />
        </div>

        <div className="login-field">
          <label>{t('login.password')}</label>
          <div className="password-wrapper">
            <input
              className="input-field"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('login.enterPassword')}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <label className="remember-me">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
          />
          <span>{t('login.rememberMe')}</span>
        </label>

        <button
          className="btn btn-primary w-full"
          type="submit"
          disabled={isLoading || !username || (!password && !(DEMO_ENABLED && username.toLowerCase() === 'demo@example.com'))}
        >
          {isLoading ? (
            <Loader2 size={16} className="spin" />
          ) : (
            <LogIn size={16} />
          )}
          {isLoading ? t('login.signingIn') : t('login.signIn')}
        </button>

        <div className="login-divider" style={{ margin: 'var(--spacing-md) 0', textAlign: 'center', position: 'relative' }}>
          <span style={{ background: 'var(--bg-glass)', padding: '0 8px', color: 'var(--text-muted)', fontSize: '0.8rem', position: 'relative', zIndex: 1 }}>{t('common.or')}</span>
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'var(--glass-border)' }}></div>
        </div>

        <button
          type="button"
          className="btn btn-secondary w-full"
          style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => loginWithGoogle?.(apiUrl)}
          disabled={isLoading}
        >
          <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
            <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
            <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
            <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
          </svg>
          {t('login.signInGoogle')}
        </button>
      </form>

      {/* 登录前语言切换 */}
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        {[
          { code: 'en', flag: '🇺🇸' },
          { code: 'zh', flag: '🇨🇳' },
          { code: 'ja', flag: '🇯🇵' },
          { code: 'ko', flag: '🇰🇷' },
        ].map(lang => (
          <button
            key={lang.code}
            onClick={() => i18n.changeLanguage(lang.code)}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: '0.85rem',
              border: i18n.language === lang.code ? '1.5px solid var(--primary)' : '1px solid var(--glass-border)',
              background: i18n.language === lang.code ? 'rgba(108,75,245,0.08)' : 'transparent',
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
            }}
          >
            {lang.flag}
          </button>
        ))}
      </div>

      <style>{`
        .login-view {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: var(--spacing-xl);
          gap: var(--spacing-lg);
        }
        .login-brand {
          text-align: center;
        }
        .login-logo-glow {
          position: relative;
          display: inline-block;
          margin-bottom: var(--spacing-md);
        }
        .login-logo-glow::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 120px;
          height: 120px;
          background: radial-gradient(circle, rgba(124, 58, 237, 0.3) 0%, rgba(99, 102, 241, 0.15) 40%, transparent 70%);
          border-radius: 50%;
          filter: blur(8px);
          z-index: 0;
        }
        .login-logo {
          position: relative;
          z-index: 1;
          width: 72px;
          height: 72px;
          border-radius: var(--radius-md);
          filter: drop-shadow(0 0 12px rgba(124, 58, 237, 0.4));
        }
        .login-title {
          font-size: 1.5rem;
          background: linear-gradient(135deg, var(--primary) 0%, #a855f7 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .login-subtitle {
          color: var(--text-muted);
          font-size: 0.875rem;
          margin-top: 4px;
        }
        .login-form {
          width: 100%;
          max-width: 320px;
          padding: var(--spacing-lg);
          display: flex;
          flex-direction: column;
          gap: var(--spacing-md);
        }
        .login-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .login-field label {
          font-size: 0.8rem;
          font-weight: 500;
          color: var(--text-secondary);
        }
        .password-wrapper {
          position: relative;
        }
        .password-wrapper .input-field {
          padding-right: 2.5rem;
        }
        .password-toggle {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
        }
        .login-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: var(--spacing-sm) var(--spacing-md);
          background: hsla(0, 75%, 55%, 0.08);
          color: var(--danger);
          border-radius: var(--radius-sm);
          font-size: 0.8rem;
        }
        .remember-me {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.8rem;
          color: var(--text-secondary);
          cursor: pointer;
          user-select: none;
        }
        .remember-me input[type="checkbox"] {
          width: 16px;
          height: 16px;
          accent-color: var(--primary);
          border-radius: 4px;
          cursor: pointer;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
