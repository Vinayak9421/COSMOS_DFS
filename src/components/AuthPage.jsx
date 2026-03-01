import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
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
 * Save security Q&A to localStorage keyed by username.
 */
function saveSecurityData(username, question, answer) {
    const data = JSON.parse(localStorage.getItem('cosmeon_security') || '{}')
    data[username.toLowerCase()] = { question, answer: answer.toLowerCase().trim() }
    localStorage.setItem('cosmeon_security', JSON.stringify(data))
}

function getSecurityData(username) {
    const data = JSON.parse(localStorage.getItem('cosmeon_security') || '{}')
    return data[username.toLowerCase()] || null
}

/**
 * AuthPage — Cosmic login/register page with glassmorphic card.
 * Supports: Sign In, Create Account (with security question), Forgot Password.
 */
export default function AuthPage() {
    const navigate = useNavigate()
    const { login, register } = useAuth()

    const [mode, setMode] = useState('login') // 'login' | 'register' | 'forgot'
    const [username, setUsername] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [securityQuestion, setSecurityQuestion] = useState(SECURITY_QUESTIONS[0])
    const [securityAnswer, setSecurityAnswer] = useState('')
    const [forgotAnswer, setForgotAnswer] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [forgotQuestion, setForgotQuestion] = useState(null)
    const [securityVerified, setSecurityVerified] = useState(false)
    const [newPassword, setNewPassword] = useState('')

    const resetForm = () => {
        setUsername('')
        setEmail('')
        setPassword('')
        setSecurityAnswer('')
        setForgotAnswer('')
        setNewPassword('')
        setError(null)
        setSuccess(null)
        setForgotQuestion(null)
        setSecurityVerified(false)
    }

    const handleTabSwitch = (tab) => {
        setMode(tab)
        resetForm()
    }

    /* ---- Forgot password: look up security question ---- */
    const handleForgotLookup = useCallback((e) => {
        e.preventDefault()
        setError(null)
        if (!username.trim()) { setError('Enter your username first'); return }
        const data = getSecurityData(username.trim())
        if (!data) {
            setError('No security question found for this username. Please contact admin.')
            return
        }
        setForgotQuestion(data.question)
    }, [username])

    /* ---- Forgot password: verify security answer ---- */
    const handleForgotVerify = useCallback((e) => {
        e.preventDefault()
        setError(null)
        const data = getSecurityData(username.trim())
        if (!data) { setError('Security data not found'); return }
        if (forgotAnswer.toLowerCase().trim() !== data.answer) {
            setError('Security answer is incorrect')
            return
        }
        setSecurityVerified(true)
        setSuccess('Security verified! Enter your new password below and sign in.')
    }, [username, forgotAnswer])

    /* ---- Forgot password: login with new password (re-register not possible, so login) ---- */
    const handleForgotLogin = useCallback(async (e) => {
        e.preventDefault()
        setError(null)
        if (!newPassword.trim()) { setError('Enter your password'); return }
        setLoading(true)
        try {
            await login(username.trim(), newPassword)
            navigate('/')
        } catch (err) {
            setError(err.message || 'Login failed. Make sure you entered your actual password.')
        } finally {
            setLoading(false)
        }
    }, [username, newPassword, login, navigate])

    /* ---- Main submit (login / register) ---- */
    const handleSubmit = useCallback(async (e) => {
        e.preventDefault()
        setError(null)
        setSuccess(null)

        if (!username.trim()) { setError('Username is required'); return }
        if (mode === 'register' && !email.trim()) { setError('Email is required'); return }
        if (!password.trim()) { setError('Password is required'); return }
        if (mode === 'register' && password.length < 4) {
            setError('Password must be at least 4 characters'); return
        }
        if (mode === 'register' && !securityAnswer.trim()) {
            setError('Security answer is required'); return
        }

        setLoading(true)

        try {
            if (mode === 'login') {
                await login(username.trim(), password)
                navigate('/')
            } else {
                await register(username.trim(), email.trim(), password)
                // Save security Q&A to localStorage
                saveSecurityData(username.trim(), securityQuestion, securityAnswer)
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

    return (
        <div className="auth-page">
            <div className="auth-card">
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
                </div>

                {/* Error / Success */}
                {error && <div className="auth-error">⚠ {error}</div>}
                {success && <div className="auth-success">✓ {success}</div>}

                {/* ================ FORGOT PASSWORD MODE ================ */}
                {mode === 'forgot' && (
                    <div className="auth-form">
                        <div className="auth-input-group">
                            <label className="auth-label" htmlFor="forgot-user">Username</label>
                            <input
                                id="forgot-user"
                                className="auth-input"
                                type="text"
                                placeholder="Enter your username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                disabled={!!forgotQuestion}
                            />
                        </div>

                        {!forgotQuestion && (
                            <button className="auth-submit" onClick={handleForgotLookup}>
                                Look Up Security Question
                            </button>
                        )}

                        {forgotQuestion && !securityVerified && (
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
                                    />
                                </div>
                                <button type="submit" className="auth-submit">Verify</button>
                            </form>
                        )}

                        {securityVerified && (
                            <form onSubmit={handleForgotLogin}>
                                <div className="auth-input-group" style={{ marginBottom: '1rem' }}>
                                    <label className="auth-label" htmlFor="forgot-pwd">Password</label>
                                    <input
                                        id="forgot-pwd"
                                        className="auth-input"
                                        type="password"
                                        placeholder="Enter your password to sign in"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        disabled={loading}
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className={`auth-submit ${loading ? 'auth-submit--loading' : ''}`}
                                    disabled={loading}
                                >
                                    {loading && <span className="auth-spinner" />}
                                    Sign In
                                </button>
                            </form>
                        )}

                        <button className="auth-home-link" onClick={() => handleTabSwitch('login')} style={{ marginTop: '1rem' }}>
                            ← Back to Sign In
                        </button>
                    </div>
                )}

                {/* ================ LOGIN / REGISTER MODE ================ */}
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
                                        placeholder="Enter password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
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
                                className={`auth-submit ${loading ? 'auth-submit--loading' : ''}`}
                                disabled={loading}
                            >
                                {loading && <span className="auth-spinner" />}
                                {mode === 'login' ? 'Sign In' : 'Create Account'}
                            </button>
                        </form>

                        {/* Forgot password link — login mode only */}
                        {mode === 'login' && (
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
