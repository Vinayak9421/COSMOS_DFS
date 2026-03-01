import { useEffect, useRef } from 'react'
import { useSystemLogs } from '../../context/SystemLogsContext'
import { generateLogEntry } from '../../data/dashboardData'

/**
 * SystemLogs — Bottom console with auto-scroll.
 * Merges:
 *   - Streaming ambient logs (generateLogEntry every 3–5s)
 *   - Real API action logs pushed via SystemLogsContext
 */
export default function SystemLogs() {
    const { logs, addLog, scrollRef } = useSystemLogs()
    const ambientIntervalRef = useRef(null)

    /* Stream ambient log entries every 3–5 seconds */
    useEffect(() => {
        ambientIntervalRef.current = setInterval(() => {
            const entry = generateLogEntry()
            addLog(entry.level, entry.msg)
        }, 3000 + Math.random() * 2000)

        return () => clearInterval(ambientIntervalRef.current)
    }, [addLog])

    /* Auto-scroll to bottom on new logs */
    useEffect(() => {
        if (scrollRef?.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [logs, scrollRef])

    return (
        <div className="panel system-logs">
            <h3 className="panel-heading">System Logs</h3>
            <div className="logs-console" ref={scrollRef}>
                {logs.map((log, i) => (
                    <div key={i} className={`log-line log-${log.level.toLowerCase()}`}>
                        <span className="log-time">{log.time}</span>
                        <span className="log-level">[{log.level}]</span>
                        <span className="log-msg">{log.msg}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
