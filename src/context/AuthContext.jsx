import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { login as apiLogin, register as apiRegister, getMe, setTokenGetter } from '../services/api'

const AuthContext = createContext(null)

/** Module-level token — avoids re-renders when token refreshes */
let _token = null

export function getToken() {
    return _token
}

/**
 * AuthProvider — manages JWT authentication lifecycle.
 * Persists token in sessionStorage so it survives page refresh.
 */
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)
    const [authError, setAuthError] = useState(null)
    const mountedRef = useRef(true)

    useEffect(() => {
        mountedRef.current = true
        // Wire up the token getter for the API layer
        setTokenGetter(getToken)

        // Restore token from sessionStorage on mount
        const saved = sessionStorage.getItem('cosmeon_token')
        if (saved) {
            _token = saved
            // Validate token by fetching /auth/me
            getMe()
                .then((data) => {
                    if (mountedRef.current) {
                        setUser(data)
                        setLoading(false)
                    }
                })
                .catch(() => {
                    // Token expired/invalid — clear it
                    _token = null
                    sessionStorage.removeItem('cosmeon_token')
                    if (mountedRef.current) setLoading(false)
                })
        } else {
            setLoading(false)
        }

        return () => { mountedRef.current = false }
    }, [])

    const login = useCallback(async (username, password) => {
        setAuthError(null)
        try {
            const data = await apiLogin(username, password)
            _token = data.access_token
            sessionStorage.setItem('cosmeon_token', data.access_token)
            setUser(data.user)
            return data
        } catch (err) {
            setAuthError(err.message)
            throw err
        }
    }, [])

    const register = useCallback(async (username, email, password) => {
        setAuthError(null)
        try {
            const data = await apiRegister(username, email, password)
            return data
        } catch (err) {
            setAuthError(err.message)
            throw err
        }
    }, [])

    const logout = useCallback(() => {
        _token = null
        sessionStorage.removeItem('cosmeon_token')
        setUser(null)
    }, [])

    const isAuthenticated = !!user

    return (
        <AuthContext.Provider value={{ user, isAuthenticated, loading, authError, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
}
