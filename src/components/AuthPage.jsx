import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getSecurityQuestion, verifySecurityAnswer, resetPassword } from '../services/api'
import '../auth.css'

const SECURITY_QUESTIONS = [
    'What is your pet\'s name?',
    'What city were you born in?',
    'What is your mother\'s maiden name?',
    'What was the name of your first school?',
    'What is your favorite movie?',
    'What is your favorite color?',
]

/**
 * Password strength checker — returns { score (0-4), label, color }
 */
function checkPasswordStrength(pw) {
    if (!pw) return { score: 0, label: '', color: 'transparent' }
    let score = 0
    if (pw.length >= 8) score++
    if (pw.length >= 12) score++
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
    if (/\d/.test(pw)) score++
    if (/[^A-Za-z0-9]/.test(pw)) score++

    const levels = [
        { label: 'Very Weak', color: '#ff3344' },
        { label: 'Weak', color: '#ff6633' },
        { label: 'Fair', color: '#ffaa22' },
        { label: 'Strong', color: '#44cc66' },
        { label: 'Very Strong', color: '#22dd88' },
    ]
    const idx = Math.min(score, 4)
    return { score: idx, ...levels[idx] }
}

/**
 * AuthPage — Cosmic login/register page with glassmorphic card.
 * Supports: Sign In, Create Account (with security question), Admin Login, Forgot Password.
 */
export default function AuthPage() {
    const navigate = useNavigate()
    const { login, register } = useAuth()

    const [mode, setMode] = useState('login') // 'login' | 'register' | 'admin' | 'forgot'
    const [username, setUsername] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [securityQuestion, setSecurityQuestion] = useState(SECURITY_QUESTIONS[0])
    const [securityAnswer, setSecurityAnswer] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)

    // Forgot password state
    const [forgotStep, setForgotStep] = useState(0) // 0=enter user, 1=answer Q, 2=new password
    const [forgotQuestion, setForgotQuestion] = useState('')
    const [forgotAnswer, setForgotAnswer] = useState('')
    const [resetToken, setResetToken] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmNewPassword, setConfirmNewPassword] = useState('')

    const passwordStrength = useMemo(() => checkPasswordStrength(
        mode === 'register' ? password : newPassword
    ), [mode, password, newPassword])

    const resetForm = () => {
        setUsername('')
        setEmail('')
        setPassword('')
        setSecurityAnswer('')
        setForgotAnswer('')
        setNewPassword('')
        setConfirmNewPassword('')
        setError(null)
        setSuccess(null)
        setForgotStep(0)
        setForgotQuestion('')
        setResetToken('')
    }

    const handleTabSwitch = (tab) => {
        setMode(tab)
        resetForm()
    }

    /* ──── FORGOT PASSWORD FLOW ──── */

    // Step 0 → 1: Look up security question from backend
    const handleForgotLookup = useCallback(async (e) => {
        e.preventDefault()
        setError(null)
        if (!username.trim()) { setError('Enter your username first'); return }
        setLoading(true)
        try {
            const data = await getSecurityQuestion(username.trim())
            setForgotQuestion(data.question)
            setForgotStep(1)
        } catch (err) {
            setError(err.message || 'No security question found for this username')
        } finally {
            setLoading(false)
        }
    }, [username])

    // Step 1 → 2: Verify security answer via backend
    const handleForgotVerify = useCallback(async (e) => {
        e.preventDefault()
        setError(null)
        if (!forgotAnswer.trim()) { setError('Enter your answer'); return }
        setLoading(true)
        try {
            const data = await verifySecurityAnswer(username.trim(), forgotAnswer.trim())
            if (data.verified && data.reset_token) {
                setResetToken(data.reset_token)
                setForgotStep(2)
                setSuccess('Security verified! Set your new password below.')
            } else {
                setError('Security answer is incorrect')
            }
        } catch (err) {
            setError(err.message || 'Verification failed')
        } finally {
            setLoading(false)
        }
    }, [username, forgotAnswer])

    // Step 2: Reset password via backend + auto-login
    const handleForgotReset = useCallback(async (e) => {
        e.preventDefault()
        setError(null)
        if (!newPassword.trim()) { setError('Enter a new password'); return }
        if (newPassword !== confirmNewPassword) { setError('Passwords do not match'); return }
        if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return }
        setLoading(true)
        try {
            await resetPassword(username.trim(), resetToken, newPassword)
            setSuccess('Password reset! Logging you in…')
            setTimeout(async () => {
                try {
                    await login(username.trim(), newPassword)
                    navigate('/')
                } catch {
                    setError('Password reset succeeded. Please sign in manually.')
                    setMode('login')
                    setSuccess(null)
                }
            }, 600)
        } catch (err) {
            setError(err.message || 'Password reset failed')
        } finally {
            setLoading(false)
        }
    }, [username, newPassword, confirmNewPassword, resetToken, login, navigate])

    /* ──── MAIN SUBMIT (LOGIN / REGISTER / ADMIN) ──── */
    const handleSubmit = useCallback(async (e) => {
        e.preventDefault()
        setError(null)
        setSuccess(null)

        if (!username.trim()) { setError('Username is required'); return }
        if (mode === 'register' && !email.trim()) { setError('Email is required'); return }
        if (!password.trim()) { setError('Password is required'); return }
        if (mode === 'register' && password.length < 8) {
            setError('Password must be at least 8 characters'); return
        }
        if (mode === 'register' && !/\d/.test(password)) {
            setError('Password must contain at least one number'); return
        }
        if (mode === 'register' && !/[A-Z]/.test(password)) {
            setError('Password must contain at least one uppercase letter'); return
        }
        if (mode === 'register' && !securityAnswer.trim()) {
            setError('Security answer is required'); return
        }

        setLoading(true)

        try {
            if (mode === 'login' || mode === 'admin') {
                const data = await login(username.trim(), password)

                // Admin tab: verify role
                if (mode === 'admin' && data.user?.role !== 'admin') {
                    setError('This account does not have admin privileges')
                    setLoading(false)
                    return
                }

                navigate('/')
            } else {
                await register(
                    username.trim(),
                    email.trim(),
                    password,
                    securityQuestion,
                    securityAnswer.trim(),
                )
                setSuccess('Account created! Logging you in…')
                setTimeout(async () => {
                    try {
                        await login(username.trim(), password)
                        navigate('/')
                    } catch {
                        setError('Registered but auto-login failed. Please log in manually.')
                        setMode('login')
                        setSuccess(null)
                    }
                }, 800)
            }
        } catch (err) {
            setError(err.message || 'Something went wrong')
        } finally {
            setLoading(false)
        }
    }, [username, email, password, mode, securityQuestion, securityAnswer, login, register, navigate])

    const isLoginLike = mode === 'login' || mode === 'admin'

    return (
        <div className="auth-page">
            <div className={`auth-card ${mode === 'admin' ? 'auth-card--admin' : ''}`}>
                {/* Brand */}
                <div className="auth-brand">
                    <span className="auth-brand-icon">◈</span>
                    <div className="auth-brand-title">
                        COSMOS <span className="auth-brand-accent">DFS</span>
                    </div>
                </div>

                {/* Tabs */}
                <div className="auth-tabs">
                    <button
                        className={`auth-tab ${mode === 'login' ? 'auth-tab--active' : ''}`}
                        onClick={() => handleTabSwitch('login')}
                        type="button"
                    >
                        Sign In
                    </button>
                    <button
                        className={`auth-tab ${mode === 'register' ? 'auth-tab--active' : ''}`}
                        onClick={() => handleTabSwitch('register')}
                        type="button"
                    >
                        Create Account
                    </button>
                    <button
                        className={`auth-tab auth-tab--admin-btn ${mode === 'admin' ? 'auth-tab--active auth-tab--admin-active' : ''}`}
                        onClick={() => handleTabSwitch('admin')}
                        type="button"
                    >
                        🔐 Admin
                    </button>
                </div>

                {/* Admin badge */}
                {mode === 'admin' && (
                    <div className="auth-admin-badge">
                        <span className="auth-admin-shield">🛡️</span>
                        <span>Administrator Access</span>
                    </div>
                )}

                {/* Error / Success */}
                {error && <div className="auth-error">⚠ {error}</div>}
                {success && <div className="auth-success">✓ {success}</div>}

                {/* ═══════════════ FORGOT PASSWORD MODE ═══════════════ */}
                {mode === 'forgot' && (
                    <div className="auth-form">
                        {/* Step 0: Enter username */}
                        {forgotStep === 0 && (
                            <form onSubmit={handleForgotLookup}>
                                <div className="auth-input-group">
                                    <label className="auth-label" htmlFor="forgot-user">Username</label>
                                    <input
                                        id="forgot-user"
                                        className="auth-input"
                                        type="text"
                                        placeholder="Enter your username"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        disabled={loading}
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className={`auth-submit ${loading ? 'auth-submit--loading' : ''}`}
                                    disabled={loading}
                                >
                                    {loading && <span className="auth-spinner" />}
                                    Look Up Security Question
                                </button>
                            </form>
                        )}

                        {/* Step 1: Answer security question */}
                        {forgotStep === 1 && (
                            <form onSubmit={handleForgotVerify}>
                                <div className="auth-input-group" style={{ marginBottom: '1rem' }}>
                                    <label className="auth-label">Security Question</label>
                                    <div className="auth-security-display">{forgotQuestion}</div>
                                </div>
                                <div className="auth-input-group" style={{ marginBottom: '1rem' }}>
                                    <label className="auth-label" htmlFor="forgot-answer">Your Answer</label>
                                    <input
                                        id="forgot-answer"
                                        className="auth-input"
                                        type="text"
                                        placeholder="Enter your answer"
                                        value={forgotAnswer}
                                        onChange={(e) => setForgotAnswer(e.target.value)}
                                        disabled={loading}
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className={`auth-submit ${loading ? 'auth-submit--loading' : ''}`}
                                    disabled={loading}
                                >
                                    {loading && <span className="auth-spinner" />}
                                    Verify Answer
                                </button>
                            </form>
                        )}

                        {/* Step 2: Set new password */}
                        {forgotStep === 2 && (
                            <form onSubmit={handleForgotReset}>
                                <div className="auth-input-group" style={{ marginBottom: '0.8rem' }}>
                                    <label className="auth-label" htmlFor="forgot-new-pwd">New Password</label>
                                    <input
                                        id="forgot-new-pwd"
                                        className="auth-input"
                                        type="password"
                                        placeholder="Enter new password (min 8 chars)"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        disabled={loading}
                                    />
                                </div>
                                {newPassword && (
                                    <div className="auth-strength-bar">
                                        <div
                                            className="auth-strength-fill"
                                            style={{
                                                width: `${(passwordStrength.score / 4) * 100}%`,
                                                background: passwordStrength.color,
                                            }}
                                        />
                                        <span className="auth-strength-label" style={{ color: passwordStrength.color }}>
                                            {passwordStrength.label}
                                        </span>
                                    </div>
                                )}
                                <div className="auth-input-group" style={{ marginBottom: '1rem' }}>
                                    <label className="auth-label" htmlFor="forgot-confirm-pwd">Confirm Password</label>
                                    <input
                                        id="forgot-confirm-pwd"
                                        className="auth-input"
                                        type="password"
                                        placeholder="Re-enter new password"
                                        value={confirmNewPassword}
                                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                                        disabled={loading}
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className={`auth-submit ${loading ? 'auth-submit--loading' : ''}`}
                                    disabled={loading}
                                >
                                    {loading && <span className="auth-spinner" />}
                                    Reset Password & Sign In
                                </button>
                            </form>
                        )}

                        <button className="auth-home-link" onClick={() => handleTabSwitch('login')} style={{ marginTop: '1rem' }}>
                            ← Back to Sign In
                        </button>
                    </div>
                )}

                {/* ═══════════════ LOGIN / REGISTER / ADMIN MODE ═══════════════ */}
                {mode !== 'forgot' && (
                    <>
                        <form className="auth-form" onSubmit={handleSubmit}>
                            <div className="auth-input-group">
                                <label className="auth-label" htmlFor="auth-username">Username</label>
                                <input
                                    id="auth-username"
                                    className="auth-input"
                                    type="text"
                                    placeholder="Enter username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    autoComplete="username"
                                    disabled={loading}
                                />
                            </div>

                            {mode === 'register' && (
                                <div className="auth-input-group">
                                    <label className="auth-label" htmlFor="auth-email">Email</label>
                                    <input
                                        id="auth-email"
                                        className="auth-input"
                                        type="email"
                                        placeholder="you@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        autoComplete="email"
                                        disabled={loading}
                                    />
                                </div>
                            )}

                            <div className="auth-input-group">
                                <label className="auth-label" htmlFor="auth-password">Password</label>
                                <div className="auth-input-wrapper">
                                    <input
                                        id="auth-password"
                                        className="auth-input"
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder={mode === 'register' ? 'Min 8 chars, 1 uppercase, 1 number' : 'Enter password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        autoComplete={isLoginLike ? 'current-password' : 'new-password'}
                                        disabled={loading}
                                    />
                                    <button
                                        type="button"
                                        className="auth-eye-btn"
                                        onClick={() => setShowPassword(!showPassword)}
                                        tabIndex={-1}
                                    >
                                        {showPassword ? '◉' : '◎'}
                                    </button>
                                </div>
                            </div>

                            {/* Password strength — Register only */}
                            {mode === 'register' && password && (
                                <div className="auth-strength-bar">
                                    <div
                                        className="auth-strength-fill"
                                        style={{
                                            width: `${(passwordStrength.score / 4) * 100}%`,
                                            background: passwordStrength.color,
                                        }}
                                    />
                                    <span className="auth-strength-label" style={{ color: passwordStrength.color }}>
                                        {passwordStrength.label}
                                    </span>
                                </div>
                            )}

                            {/* Security Question — Register only */}
                            {mode === 'register' && (
                                <>
                                    <div className="auth-input-group">
                                        <label className="auth-label" htmlFor="auth-sec-q">Security Question</label>
                                        <select
                                            id="auth-sec-q"
                                            className="auth-input auth-select"
                                            value={securityQuestion}
                                            onChange={(e) => setSecurityQuestion(e.target.value)}
                                            disabled={loading}
                                        >
                                            {SECURITY_QUESTIONS.map((q) => (
                                                <option key={q} value={q}>{q}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="auth-input-group">
                                        <label className="auth-label" htmlFor="auth-sec-a">Security Answer</label>
                                        <input
                                            id="auth-sec-a"
                                            className="auth-input"
                                            type="text"
                                            placeholder="Your answer (used for password recovery)"
                                            value={securityAnswer}
                                            onChange={(e) => setSecurityAnswer(e.target.value)}
                                            disabled={loading}
                                        />
                                    </div>
                                </>
                            )}

                            <button
                                type="submit"
                                className={`auth-submit ${loading ? 'auth-submit--loading' : ''} ${mode === 'admin' ? 'auth-submit--admin' : ''}`}
                                disabled={loading}
                            >
                                {loading && <span className="auth-spinner" />}
                                {mode === 'login' ? 'Sign In' : mode === 'admin' ? '🔐 Admin Sign In' : 'Create Account'}
                            </button>
                        </form>

                        {/* Forgot password link — login/admin mode only */}
                        {isLoginLike && (
                            <button
                                className="auth-forgot-link"
                                onClick={() => handleTabSwitch('forgot')}
                                type="button"
                            >
                                Forgot password?
                            </button>
                        )}

                        <div className="auth-divider">
                            <span className="auth-divider-line" />
                            <span className="auth-divider-text">or</span>
                            <span className="auth-divider-line" />
                        </div>

                        <button className="auth-home-link" onClick={() => navigate('/')}>
                            ← Back to Home
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}
