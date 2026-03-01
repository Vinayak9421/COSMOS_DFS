import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'

const SystemLogsContext = createContext(null)

const INITIAL_LOGS = [
    { time: new Date().toTimeString().slice(0, 8), level: 'INFO', msg: 'Dashboard initialized. Connecting to backend…' },
]

/**
 * Provider — wraps Dashboard so any component can push log entries
 * that appear in the SystemLogs panel.
 */
export function SystemLogsProvider({ children }) {
    const [logs, setLogs] = useState(INITIAL_LOGS)
    const scrollRef = useRef(null)

    const addLog = useCallback((level, msg) => {
        const time = new Date().toTimeString().slice(0, 8)
        setLogs((prev) => {
            const next = [...prev, { time, level, msg }]
            return next.length > 120 ? next.slice(-120) : next
        })
    }, [])

    const value = { logs, addLog, scrollRef }

    return (
        <SystemLogsContext.Provider value={value}>
            {children}
        </SystemLogsContext.Provider>
    )
}

export function useSystemLogs() {
    const ctx = useContext(SystemLogsContext)
    if (!ctx) throw new Error('useSystemLogs must be used within SystemLogsProvider')
    return ctx
}
