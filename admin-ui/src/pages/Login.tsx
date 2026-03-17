import { Checkbox } from '../components/ui/Checkbox';
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import api, { getDeviceId } from '../services/api';
import { Mail, Lock, Loader, Shield, Check, KeyRound } from 'lucide-react';
import { OrganicCard } from '../components/ui/OrganicCard';
import { MotionButton } from '../components/ui/MotionButton';
import { STORAGE_KEYS } from '../constants/storage-keys';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import './Login.css';
import { Button } from '../components/ui/button';

declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;

const LANGUAGES = [
    { code: 'zh', label: '中文' },
    { code: 'en', label: 'EN' },
    { code: 'ja', label: '日本語' },
    { code: 'ko', label: '한국어' },
    { code: 'es', label: 'ES' },
    { code: 'ar', label: 'عربي' },
];


const Login: React.FC = () => {
    const { t, i18n } = useTranslation();
    const [email, setEmail] = useState(() => localStorage.getItem(STORAGE_KEYS.AUTH_SAVED_EMAIL) || '');
    const [password, setPassword] = useState('');
    const isDemoSite = import.meta.env.VITE_MOCK_MODE === 'true';
    const [loginMode] = useState<'password' | 'otp'>(isDemoSite ? 'otp' : 'password');
    const [otpCode, setOtpCode] = useState('');
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
    const turnstileRef = useRef<TurnstileInstance>(null);
    const [verificationToken, setVerificationToken] = useState('');
    const [countdown, setCountdown] = useState(0);
    const [isSendingOtp, setIsSendingOtp] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [rememberMe, setRememberMe] = useState(() => localStorage.getItem(STORAGE_KEYS.AUTH_REMEMBER_ME) === 'true');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSendOtp = async () => {
        if (!email) {
            setError(t('login.emailRequired', 'Email is required'));
            return;
        }
        setIsSendingOtp(true);
        setError('');
        try {
            const res = await api.post('/auth/send-otp', { email, source: 'Demo Platform', turnstileToken });
            if (res.data?.verificationToken) {
                setVerificationToken(res.data.verificationToken);
            }
            setCountdown(60);
            const timer = setInterval(() => {
                setCountdown((prev) => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } catch (err: any) {
            setError(err.response?.data?.error || t('login.sendOtpFailed', 'Failed to send verification code'));
        } finally {
            setIsSendingOtp(false);
            if (isDemoSite && turnstileRef.current) {
                turnstileRef.current.reset();
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            let response;
            if (loginMode === 'password') {
                response = await api.post('/auth/login', { email, password, deviceId: getDeviceId() });
            } else {
                response = await api.post('/auth/verify-otp', {
                    email,
                    code: otpCode,
                    verificationToken,
                    deviceId: getDeviceId()
                });
            }

            const { token, refreshToken, permissions, user } = response.data;
            login(token, refreshToken, permissions || [], user, rememberMe);

            // Save or clear email based on rememberMe (password is never stored)
            if (rememberMe) {
                localStorage.setItem(STORAGE_KEYS.AUTH_REMEMBER_ME, 'true');
                localStorage.setItem(STORAGE_KEYS.AUTH_SAVED_EMAIL, email);
            } else {
                localStorage.removeItem(STORAGE_KEYS.AUTH_REMEMBER_ME);
                localStorage.removeItem(STORAGE_KEYS.AUTH_SAVED_EMAIL);
            }

            // Check if setup wizard needs to run (skip for Demo Site)
            try {
                if (!isDemoSite) {
                    const setupRes = await api.get('/setup/status');
                    if (!setupRes.data.setupCompleted && user.role === 'platform_admin') {
                        navigate('/setup');
                        return;
                    }
                }
            } catch {
                // If setup status check fails, proceed to dashboard
            }
            // Redirect: back to intended path if set, otherwise dashboard
            const redirectTo = sessionStorage.getItem('cxmind:auth:redirect-after-login') || '/dashboard';
            sessionStorage.removeItem('cxmind:auth:redirect-after-login');
            navigate(redirectTo);
        } catch (err: any) {
            setError(err.response?.data?.error || t('login.loginFailed', 'Login failed'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="login-container">
            {/* SVG filter for organic blob distortion */}
            <svg width="0" height="0" style={{ position: 'absolute' }}>
                <defs>
                    <filter id="organic-blob-filter">
                        <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="3" result="noise" />
                        <feDisplacementMap in="SourceGraphic" in2="noise" scale="30" />
                    </filter>
                </defs>
            </svg>

            {/* Animated Background Blobs */}
            <div className="blob-bg blob-1"></div>
            <div className="blob-bg blob-2"></div>
            <div className="blob-bg blob-3"></div>

            <OrganicCard variant="glass" className="w-full p-8" delay={0.1} style={{ maxWidth: '420px' }}>
                <div className="login-logo-container">
                    <div className="p-3 rounded-full bg-primary/10 mb-4 organic-shape flex items-center justify-center w-16 h-16">
                        <Shield size={32} className="text-primary" />
                    </div>
                    <h1 className="text-3xl font-bold text-gradient mb-2">CXMind</h1>
                    <p className="text-muted text-center">{t('login.subtitle', 'Enter your credentials to access the platform')}</p>
                </div>

                {error && (
                    <div className="p-3 mb-6 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="login-form">
                    <div className="login-input-group">
                        <label htmlFor="email" className="login-label">{t('login.email', 'Email')}</label>
                        <div className="login-input-wrapper">
                            <Mail size={18} className="login-icon" />
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="admin@platform.com"
                                required
                                className="login-input"
                            />
                        </div>
                    </div>

                    {loginMode === 'password' ? (
                        <div className="login-input-group">
                            <label htmlFor="password" className="login-label">{t('login.password', 'Password')}</label>
                            <div className="login-input-wrapper">
                                <Lock size={18} className="login-icon" />
                                <input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    className="login-input"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="login-input-group">
                            <label htmlFor="otpCode" className="login-label">{t('login.verificationCode', 'Verification Code')}</label>
                            <div className="flex gap-2">
                                <div className="login-input-wrapper flex-1">
                                    <KeyRound size={18} className="login-icon" />
                                    <input
                                        id="otpCode"
                                        type="text"
                                        value={otpCode}
                                        onChange={(e) => setOtpCode(e.target.value)}
                                        placeholder="6-digit code"
                                        required
                                        maxLength={6}
                                        className="login-input"
                                    />
                                </div>
                                <Button
                                    type="button"
                                    variant="none"
                                    onClick={handleSendOtp}
                                    disabled={countdown > 0 || isSendingOtp || !email || (isDemoSite && !turnstileToken)}
                                    style={{ border: 'none', outline: 'none', cursor: 'pointer' }}
                                    className="px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                >
                                    {isSendingOtp ? <Loader size={16} className="animate-spin" /> : countdown > 0 ? `${countdown}s` : t('login.sendCode', 'Send Code')}
                                </Button>
                            </div>
                            {isDemoSite && (
                                <div className="mt-4 flex justify-center">
                                    <Turnstile
                                        ref={turnstileRef}
                                        siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'}
                                        onSuccess={(token) => setTurnstileToken(token)}
                                        onError={() => setError(t('login.captchaFailed', 'Captcha verification failed. Please try again.'))}
                                        onExpire={() => setTurnstileToken(null)}
                                        options={{ size: 'flexible' }}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    <div className="login-checkbox-wrapper">
                        <div className="login-checkbox-container">
                            <Checkbox
                                id="remember"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                                className="login-checkbox"
                            />
                            <Check
                                size={12}
                                className="login-checkbox-icon"
                            />
                        </div>
                        <label htmlFor="remember" className="login-checkbox-label">
                            {t('login.rememberMe', 'Remember my email (auto sign-in)')}
                        </label>
                    </div>

                    <MotionButton
                        type="submit"
                        variant="primary"
                        className="w-full py-3 text-lg justify-center shadow-lg"
                        disabled={isLoading}
                    >
                        {isLoading ? <Loader className="animate-spin" size={20} /> : t('login.signIn', 'Sign In')}
                    </MotionButton>

                    {isDemoSite && (
                        <div className="mt-5 text-[11px] text-muted-foreground/80 text-center leading-normal">
                            By entering your email and proceeding, you agree to receive product updates, tips, and promotional offers from CXMind. You can unsubscribe at any time.
                        </div>
                    )}
                </form>

                {/* ── Language Selector at bottom of card ── */}
                <div className="login-lang-row">
                    {LANGUAGES.map(lang => (
                        <Button
                            key={lang.code}
                            className={`login-lang-btn${i18n.language?.startsWith(lang.code) ? ' active' : ''}`}
                            onClick={() => i18n.changeLanguage(lang.code)}
                        >
                            {lang.label}
                        </Button>
                    ))}
                </div>
                {/* Version Information */}
                <div className="mt-4 text-[10px] text-muted-foreground/50 text-center uppercase tracking-wider">
                    v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'}
                    {typeof __APP_COMMIT__ !== 'undefined' && __APP_COMMIT__ !== 'unknown' && (
                        <span style={{ opacity: 0.6 }}>{' '}({__APP_COMMIT__})</span>
                    )}
                </div>
            </OrganicCard>
        </div >
    );
};

export default Login;
