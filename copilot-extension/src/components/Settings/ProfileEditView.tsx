import { useState, useRef, useEffect } from "react"
import { useAuth } from "~/hooks/useAuth"
import { motion } from "framer-motion"
import { ArrowLeft, Camera, Lock, User, Mail, Save } from "lucide-react"

interface ProfileEditViewProps {
    onBack: () => void
}

export function ProfileEditView({ onBack }: ProfileEditViewProps) {
    const { agentInfo, updateAvatar, updateProfile, changePassword } = useAuth()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [displayName, setDisplayName] = useState(agentInfo?.displayName || "")
    const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" })

    useEffect(() => {
        if (agentInfo?.displayName) {
            setDisplayName(agentInfo.displayName)
        }
    }, [agentInfo])

    const [status, setStatus] = useState({
        loading: false,
        error: "",
        success: ""
    })
    const [uploading, setUploading] = useState(false)
    const [imgError, setImgError] = useState(false)

    // Derived avatar URL logic
    const [apiUrl, setApiUrl] = useState("")
    useEffect(() => {
        chrome.storage.sync.get(["apiUrl"], (res) => { if (res.apiUrl) setApiUrl(res.apiUrl) })
    }, [])

    // avatar变了重置error状态
    useEffect(() => {
        setImgError(false)
    }, [agentInfo?.avatar])

    const avatarUrl = agentInfo?.avatar?.startsWith("http")
        ? agentInfo.avatar
        : agentInfo?.avatar
            ? `${apiUrl}${agentInfo.avatar}`
            : null

    const showImg = avatarUrl && !imgError

    const handleAvatarClick = () => fileInputRef.current?.click()

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (file.size > 2 * 1024 * 1024) {
            alert("Image size too large (max 2MB)")
            return
        }

        setUploading(true)
        try {
            await updateAvatar(file)
        } catch (error) {
            console.error(error)
            setStatus({ loading: false, error: "Failed to upload avatar", success: "" })
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ""
        }
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setStatus({ loading: true, error: "", success: "" })

        try {
            // 1. Update Profile (Display Name)
            if (displayName !== agentInfo?.displayName) {
                await updateProfile({ displayName })
            }

            // 2. Update Password (if filled)
            if (passwords.current || passwords.new || passwords.confirm) {
                if (!passwords.current || !passwords.new || !passwords.confirm) {
                    throw new Error("Please fill all password fields to change password")
                }
                if (passwords.new !== passwords.confirm) {
                    throw new Error("New passwords do not match")
                }
                if (passwords.new.length < 6) {
                    throw new Error("New password must be at least 6 characters")
                }
                await changePassword(passwords.current, passwords.new)
            }

            setStatus({ loading: false, error: "", success: "Profile updated successfully" })
            setPasswords({ current: "", new: "", confirm: "" }) // Clear passwords
        } catch (err: any) {
            setStatus({ loading: false, error: err.message || "Failed to update profile", success: "" })
        }
    }

    return (
        <div className="profile-edit-view animate-fade-in">

            {/* Header */}
            <div className="view-header">
                <button
                    onClick={onBack}
                    className="back-button"
                >
                    <ArrowLeft size={16} />
                    Back
                </button>
            </div>

            <form onSubmit={handleSave} className="profile-form">

                {/* Avatar Section */}
                <div className="avatar-section">
                    <div
                        className="avatar-container"
                        onClick={handleAvatarClick}
                    >
                        {showImg ? (
                            <img
                                src={avatarUrl}
                                alt="Avatar"
                                className="avatar-image"
                                onError={() => setImgError(true)}
                            />
                        ) : (
                            <div className="avatar-placeholder">
                                {agentInfo?.displayName?.charAt(0).toUpperCase()}
                            </div>
                        )}

                        {/* Edit Overlay */}
                        <div className="avatar-overlay">
                            <Camera className="text-white" size={24} />
                        </div>

                        {uploading && (
                            <div className="avatar-loading">
                                <div className="loading-spinner" />
                            </div>
                        )}

                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept="image/*"
                            style={{ display: 'none' }}
                        />
                    </div>
                </div>

                {/* Status Messages */}
                {status.error && (
                    <div className="status-message error">
                        {status.error}
                    </div>
                )}
                {status.success && (
                    <div className="status-message success">
                        {status.success}
                    </div>
                )}

                {/* Basic Info */}
                <div className="form-section">
                    <h3 className="section-title">Basic Information</h3>

                    <div className="form-group">
                        <label>Display Name</label>
                        <div className="input-wrapper">
                            <User size={16} className="input-icon" />
                            <input
                                type="text"
                                className="input-field with-icon"
                                value={displayName}
                                onChange={e => setDisplayName(e.target.value)}
                                placeholder="Your Name"
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Email Address</label>
                        <div className="input-wrapper disabled">
                            <Mail size={16} className="input-icon" />
                            <input
                                type="email"
                                className="input-field with-icon"
                                value={agentInfo?.email || ""}
                                readOnly
                                title="Contact administrator to change email"
                            />
                        </div>
                        <p className="helper-text">Email cannot be changed.</p>
                    </div>
                </div>

                {/* Security */}
                <div className="form-section">
                    <h3 className="section-title">Security</h3>

                    <div className="form-group">
                        <label>Current Password</label>
                        <div className="input-wrapper">
                            <Lock size={16} className="input-icon" />
                            <input
                                type="password"
                                className="input-field with-icon"
                                value={passwords.current}
                                onChange={e => setPasswords({ ...passwords, current: e.target.value })}
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>New Password</label>
                        <div className="input-wrapper">
                            <Lock size={16} className="input-icon" />
                            <input
                                type="password"
                                className="input-field with-icon"
                                value={passwords.new}
                                onChange={e => setPasswords({ ...passwords, new: e.target.value })}
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Confirm New Password</label>
                        <div className="input-wrapper">
                            <Lock size={16} className="input-icon" />
                            <input
                                type="password"
                                className="input-field with-icon"
                                value={passwords.confirm}
                                onChange={e => setPasswords({ ...passwords, confirm: e.target.value })}
                                placeholder="••••••••"
                            />
                        </div>
                    </div>
                </div>

                {/* Save Button */}
                <button
                    type="submit"
                    disabled={status.loading}
                    className="btn btn-primary w-full save-button"
                >
                    {status.loading ? (
                        <>Saving...</>
                    ) : (
                        <>
                            <Save size={18} />
                            Save Changes
                        </>
                    )}
                </button>
            </form>

            <style>{`
                .profile-edit-view {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    padding: var(--spacing-md);
                    position: relative;
                }
                
                .view-header {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    margin-bottom: var(--spacing-md);
                    padding: var(--spacing-sm) 0;
                }

                .back-button {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 12px;
                    border-radius: var(--radius-sm);
                    background: rgba(0, 0, 0, 0.03);
                    border: 1px solid transparent;
                    cursor: pointer;
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                    font-weight: 500;
                    transition: all 0.2s;
                }

                .back-button:hover {
                    background: rgba(0, 0, 0, 0.06);
                    color: var(--text-primary);
                }

                .view-title {
                    font-size: 1rem;
                    font-weight: 600;
                    margin: 0;
                }

                .profile-form {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-lg);
                    padding-bottom: 80px;
                }

                .avatar-section {
                    display: flex;
                    justify-content: center;
                    margin-bottom: var(--spacing-sm);
                }

                .avatar-container {
                    position: relative;
                    cursor: pointer;
                }

                .avatar-container:hover .avatar-overlay {
                    opacity: 1;
                }

                .avatar-image {
                    width: 96px;
                    height: 96px;
                    border-radius: 50%;
                    object-fit: cover;
                    border: 4px solid var(--bg-light);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }

                .avatar-placeholder {
                    width: 96px;
                    height: 96px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, var(--primary), #a855f7);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 2rem;
                    font-weight: 700;
                    border: 4px solid var(--bg-light);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }

                .avatar-overlay {
                    position: absolute;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.4);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    opacity: 0;
                    transition: opacity 0.2s;
                    border: 4px solid transparent;
                }

                .avatar-loading {
                    position: absolute;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.5);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 4px solid transparent;
                }

                .loading-spinner {
                    width: 24px;
                    height: 24px;
                    border: 2px solid white;
                    border-top-color: transparent;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }

                .status-message {
                    padding: 12px;
                    border-radius: var(--radius-sm);
                    font-size: 0.875rem;
                }

                .status-message.error {
                    background: #fee2e2;
                    color: #ef4444;
                }

                .status-message.success {
                    background: #dcfce7;
                    color: #22c55e;
                }

                .form-section {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                }

                .section-title {
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    margin: 0;
                }

                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .form-group label {
                    font-size: 0.875rem;
                    font-weight: 500;
                    color: var(--text-primary);
                }

                .input-wrapper {
                    position: relative;
                }

                .input-wrapper.disabled {
                    opacity: 0.7;
                }

                .input-icon {
                    position: absolute;
                    left: 12px;
                    top: 10px;
                    color: var(--text-muted);
                }

                .input-field.with-icon {
                    padding-left: 38px;
                }
                
                .input-wrapper.disabled .input-field {
                    background: rgba(0,0,0,0.05);
                    cursor: not-allowed;
                }

                .helper-text {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    margin: 0;
                }

                .save-button {
                    margin-top: var(--spacing-md);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    )
}
