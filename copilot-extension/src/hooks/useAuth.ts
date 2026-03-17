import { useState, useEffect, useCallback } from "react"
import { decodeJWT, extractAgentInfo } from "~/utils/jwt"
import { DEMO_ENABLED } from "~/utils/demo-flag"

interface AuthState {
    token: string | null
    isAuthenticated: boolean
    agentInfo: {
        userId: string
        agentId?: string
        displayName: string
        sipNumber: string
        email: string
        role: 'agent' | 'supervisor' | 'admin'
        avatar?: string // Added avatar
        groupIds?: string[]
        googleEmail?: string | null
        isDemo?: boolean // Added for Demo Mode
    } | null
    isLoading: boolean
    error: string | null
}

// decodeJWT + extractAgentInfo 已统一到 ~/utils/jwt.ts

export function useAuth() {
    const [state, setState] = useState<AuthState>({
        token: null,
        isAuthenticated: false,
        agentInfo: null,
        isLoading: true,
        error: null
    })

    // Helper to fetch full profile including avatar
    const fetchProfile = async (token: string, apiUrl: string) => {
        try {
            const res = await fetch(`${apiUrl}/api/profile`, {
                headers: { "Authorization": `Bearer ${token}` }
            })
            if (res.ok) {
                const profile = await res.json()
                return profile
            }
        } catch (e) {
            console.error("Failed to fetch profile", e)
        }
        return null
    }

    // Helper to update local state and storage
    const syncProfileToStorage = async (newProfile: Partial<typeof state.agentInfo>) => {
        const current = state.agentInfo || {}
        const updated = { ...current, ...newProfile }
        // We persist the 'userProfile' separately or just rely on 'token' + this side channel
        // Let's use a specific key 'userProfile' to override/augment token data
        await chrome.storage.local.set({ userProfile: updated })
    }

    // Load token and profile from storage on mount
    useEffect(() => {
        const init = async () => {
            const [localRes, syncRes] = await Promise.all([
                chrome.storage.local.get(["token", "userProfile"]),
                chrome.storage.sync.get(["apiUrl"])
            ])

            if (localRes.token) {
                let agentInfo = extractAgentInfo(localRes.token)

                // Override with stored profile if available (instant load)
                if (localRes.userProfile) {
                    agentInfo = { ...agentInfo, ...localRes.userProfile }
                }

                // Profile data is cached in userProfile during login,
                // no need to fetch /api/profile on every mount.

                if (agentInfo) {
                    setState({
                        token: localRes.token,
                        isAuthenticated: true,
                        agentInfo,
                        isLoading: false,
                        error: null
                    })

                    // Asynchronously fetch latest profile to ensure fields like googleEmail are up-to-date
                    if (syncRes.apiUrl) {
                        fetchProfile(localRes.token, syncRes.apiUrl).then((profile: any) => {
                            if (profile) {
                                chrome.storage.local.get(["userProfile"], (res) => {
                                    const current = res.userProfile || agentInfo || {}
                                    const updated = {
                                        ...current,
                                        googleEmail: profile.googleEmail,
                                        avatar: profile.avatar,
                                        displayName: profile.displayName
                                    }
                                    chrome.storage.local.set({ userProfile: updated })
                                })
                            }
                        }).catch(console.error)
                    }

                } else {
                    setState((s) => ({ ...s, isLoading: false }))
                }
            } else {
                setState((s) => ({ ...s, isLoading: false }))
            }
        }
        init()

        // Listen for token changes and profile changes
        const listener = (changes: Record<string, chrome.storage.StorageChange>, namespace: string) => {
            if (namespace === "local") {
                if (changes.token) {
                    // ... existing token logic ...
                    const newToken = changes.token.newValue
                    if (!newToken) {
                        setState({ token: null, isAuthenticated: false, agentInfo: null, isLoading: false, error: null })
                    } else {
                        // Token changed, we might need to reload profile or wait for userProfile update
                        // For simplicity, reload everything or let the init logic handle it on refresh.
                        // But for same-runtime updates:
                        const info = extractAgentInfo(newToken)
                        if (info) setState(s => ({ ...s, token: newToken, isAuthenticated: true, agentInfo: info }))
                    }
                }

                if (changes.userProfile) {
                    const newProfile = changes.userProfile.newValue
                    if (newProfile) {
                        setState(s => ({
                            ...s,
                            agentInfo: { ...s.agentInfo, ...newProfile }
                        }))
                    }
                }
            }
        }
        chrome.storage.onChanged.addListener(listener)
        return () => chrome.storage.onChanged.removeListener(listener)
    }, [])

    const login = useCallback(async (apiUrl: string, username: string, password: string) => {
        setState((s) => ({ ...s, isLoading: true, error: null }))
        try {
            // == 注入: Demo 免密体验拦截 (编译时 flag 控制) ==
            if (DEMO_ENABLED && username.toLowerCase() === 'demo@example.com') {
                const demoToken = 'demo-mode-token'
                const demoInfo = extractAgentInfo(demoToken)

                await chrome.runtime.sendMessage({ type: "clearActiveCall" }).catch(() => { })
                await chrome.storage.local.set({ token: demoToken, userProfile: demoInfo })
                await chrome.storage.sync.set({ apiUrl: 'https://demo.cxmi.ai' })

                setState({
                    token: demoToken,
                    isAuthenticated: true,
                    agentInfo: demoInfo as any,
                    isLoading: false,
                    error: null
                })
                return
            }
            // =========================

            const res = await fetch(`${apiUrl}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: username, password })
            })

            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.error || `Login failed (${res.status})`)
            }

            const data = await res.json()
            const token = data.token

            // Use user info from login response directly
            const initialAgentInfo = extractAgentInfo(token)
            const mergedInfo = initialAgentInfo ? {
                ...initialAgentInfo,
                displayName: data.user.displayName || initialAgentInfo.displayName,
                email: data.user.email || initialAgentInfo.email,
                role: data.user.role || initialAgentInfo.role,
                avatar: data.user.avatar,
                googleEmail: data.user.googleEmail || initialAgentInfo.googleEmail || null
            } : null

            // Save to chrome.storage (token AND profile)
            await chrome.runtime.sendMessage({ type: "clearActiveCall" }).catch(() => { })
            await chrome.storage.local.set({ token, userProfile: mergedInfo })
            await chrome.storage.sync.set({ apiUrl })

            // State update will happen via listener or we can set it here too for immediate feedback
            setState({
                token,
                isAuthenticated: true,
                agentInfo: mergedInfo,
                isLoading: false,
                error: null
            })
        } catch (err: any) {
            setState((s) => ({
                ...s,
                isLoading: false,
                error: err.message || "Login failed"
            }))
        }
    }, [])

    const loginWithGoogle = useCallback(async (apiUrl: string) => {
        setState((s) => ({ ...s, isLoading: true, error: null }))
        try {
            // Get Google Identity token
            const tokenResponse = await new Promise<string>((resolve, reject) => {
                chrome.identity.getAuthToken({ interactive: true }, function (token) {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message))
                    } else if (token) {
                        resolve(token)
                    } else {
                        reject(new Error("Failed to get Google Auth token"))
                    }
                })
            })

            // Send Google token to our backend
            const res = await fetch(`${apiUrl}/api/auth/google/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: tokenResponse })
            })

            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                // Clear the cached token if it was invalid
                if (res.status === 401) {
                    chrome.identity.removeCachedAuthToken({ token: tokenResponse }, () => { })
                }
                throw new Error(data.error || `Google Login failed (${res.status})`)
            }

            const data = await res.json()
            const token = data.token

            // Use user info from login response directly
            const initialAgentInfo = extractAgentInfo(token)
            const mergedInfo = initialAgentInfo ? {
                ...initialAgentInfo,
                displayName: data.user.displayName || initialAgentInfo.displayName,
                email: data.user.email || initialAgentInfo.email,
                role: data.user.role || initialAgentInfo.role,
                avatar: data.user.avatar,
                googleEmail: data.user.googleEmail || initialAgentInfo.googleEmail || null
            } : null

            // Save to chrome.storage (token AND profile)
            await chrome.runtime.sendMessage({ type: "clearActiveCall" }).catch(() => { })
            await chrome.storage.local.set({ token, userProfile: mergedInfo })
            await chrome.storage.sync.set({ apiUrl })

            // State update
            setState({
                token,
                isAuthenticated: true,
                agentInfo: mergedInfo,
                isLoading: false,
                error: null
            })

            return true
        } catch (err: any) {
            setState((s) => ({
                ...s,
                isLoading: false,
                error: err.message || "Google Login failed"
            }))
            return false
        }
    }, [])

    const bindGoogleAccount = useCallback(async () => {
        if (!state.token) {
            throw new Error("You must be logged in to bind a Google Account")
        }

        try {
            const { apiUrl } = await chrome.storage.sync.get(["apiUrl"])
            if (!apiUrl) throw new Error("API URL not set")

            // Get Google Identity token
            const tokenResponse = await new Promise<string>((resolve, reject) => {
                chrome.identity.getAuthToken({ interactive: true }, function (token) {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message))
                    } else if (token) {
                        resolve(token)
                    } else {
                        reject(new Error("Failed to get Google Auth token"))
                    }
                })
            })

            // Send Google token to our backend for binding
            const res = await fetch(`${apiUrl}/api/auth/google/bind`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${state.token}`
                },
                body: JSON.stringify({ token: tokenResponse })
            })

            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                // Clear the cached token if it was invalid
                if (res.status === 401) {
                    chrome.identity.removeCachedAuthToken({ token: tokenResponse }, () => { })
                }
                throw new Error(data.error || `Google Bind failed (${res.status})`)
            }

            // 立即更新本地profile
            const bindData = await res.json()
            if (bindData.googleEmail) {
                chrome.storage.local.get(["userProfile"], (result) => {
                    const current = result.userProfile || state.agentInfo || {}
                    const updated = { ...current, googleEmail: bindData.googleEmail }
                    chrome.storage.local.set({ userProfile: updated })
                })
            }

            return true
        } catch (err: any) {
            console.error("Bind Google Account error:", err)
            throw err
        }
    }, [state.token])

    const unbindGoogleAccount = useCallback(async () => {
        if (!state.token) {
            throw new Error("You must be logged in to unbind a Google Account")
        }

        try {
            const { apiUrl } = await chrome.storage.sync.get(["apiUrl"])
            if (!apiUrl) throw new Error("API URL not set")

            // Send unbind request to backend
            const res = await fetch(`${apiUrl}/api/auth/google/unbind`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${state.token}`
                }
            })

            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.error || `Google Unbind failed (${res.status})`)
            }

            // Clear googleEmail from local profile immediately
            chrome.storage.local.get(["userProfile"], (result) => {
                const current = result.userProfile || state.agentInfo || {}
                const updated = { ...current, googleEmail: null }
                chrome.storage.local.set({ userProfile: updated })
            })

            return true
        } catch (err: any) {
            console.error("Unbind Google Account error:", err)
            throw err
        }
    }, [state.token])

    const logout = useCallback(async () => {
        await chrome.storage.local.remove(["token", "userProfile", "currentCall"])
        chrome.runtime.sendMessage({ type: "logout" })
        setState({
            token: null,
            isAuthenticated: false,
            agentInfo: null,
            isLoading: false,
            error: null
        })
    }, [])

    const updateAvatar = useCallback(async (file: File) => {
        if (!state.token) return

        try {
            const { apiUrl } = await chrome.storage.sync.get(["apiUrl"])
            if (!apiUrl) throw new Error("API URL not set")

            const formData = new FormData()
            formData.append("avatar", file)

            const res = await fetch(`${apiUrl}/api/profile/avatar`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${state.token}` },
                body: formData
            })

            if (!res.ok) throw new Error("Failed to upload avatar")

            const data = await res.json()

            // 更新本地state和storage
            const newAvatar = data.avatar
            await chrome.storage.local.get(["userProfile"], (result) => {
                const current = result.userProfile || state.agentInfo || {}
                chrome.storage.local.set({ userProfile: { ...current, avatar: newAvatar } })
            })

            return newAvatar
        } catch (error) {
            console.error("Update avatar error:", error)
            throw error
        }
    }, [state.token, state.agentInfo])

    const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
        if (!state.token) return

        try {
            const { apiUrl } = await chrome.storage.sync.get(["apiUrl"])
            if (!apiUrl) throw new Error("API URL not set")

            const res = await fetch(`${apiUrl}/api/profile/password`, {
                method: "PATCH",
                headers: {
                    "Authorization": `Bearer ${state.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ currentPassword, newPassword })
            })

            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.error || "Failed to change password")
            }

            return true
        } catch (error) {
            console.error("Change password error:", error)
            throw error
        }
    }, [state.token])

    const updateProfile = useCallback(async (data: { displayName?: string }) => {
        if (!state.token) return

        try {
            const { apiUrl } = await chrome.storage.sync.get(["apiUrl"])
            if (!apiUrl) throw new Error("API URL not set")

            const res = await fetch(`${apiUrl}/api/profile`, {
                method: "PATCH",
                headers: {
                    "Authorization": `Bearer ${state.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(data)
            })

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}))
                throw new Error(errorData.error || "Failed to update profile")
            }

            const responseData = await res.json()
            const newName = responseData.user.displayName

            // 更新localStorage触发跨组件同步
            await chrome.storage.local.get(["userProfile"], (result) => {
                const current = result.userProfile || state.agentInfo || {}
                chrome.storage.local.set({ userProfile: { ...current, displayName: newName } })
            })

            return true
        } catch (error) {
            console.error("Update profile error:", error)
            throw error
        }
    }, [state.token, state.agentInfo])

    return { ...state, login, logout, updateAvatar, changePassword, updateProfile, loginWithGoogle, bindGoogleAccount, unbindGoogleAccount }
}
