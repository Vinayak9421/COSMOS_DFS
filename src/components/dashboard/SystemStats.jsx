import { useState, useEffect, useCallback } from 'react'
import { getSystemStats, clearCache } from '../../services/api'
import { useSystemLogs } from '../../context/SystemLogsContext'

/**
 * SystemStats — Displays GET /system/stats data:
 * overall storage utilization, cache info, per-node utilization bars.
 * Polls every 15 seconds automatically.
 */
export default function SystemStats() {
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [clearing, setClearing] = useState(false)
    const { addLog } = useSystemLogs()

    const fetchStats = useCallback(async () => {
        try {
            const data = await getSystemStats()
            setStats(data)
        } catch (err) {
            addLog('ERROR', `Stats fetch failed: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }, [addLog])

    useEffect(() => {
        fetchStats()
        const id = setInterval(fetchStats, 15000)
        return () => clearInterval(id)
    }, [fetchStats])

    const handleClearCache = async () => {
        setClearing(true)
        try {
            await clearCache()
            addLog('INFO', 'Cache cleared from SystemStats panel')
            await fetchStats()
        } catch (err) {
            addLog('ERROR', `Cache clear failed: ${err.message}`)
        } finally {
            setClearing(false)
        }
    }

    const formatBytes = (bytes) => {
        if (!bytes && bytes !== 0) return '—'
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
        return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
    }

    const statusClass = (s) => {
        const lower = (s || '').toLowerCase()
        if (lower === 'online') return 'online'
        if (lower === 'offline') return 'offline'
        if (lower === 'degraded') return 'warning'
        if (lower === 'maintenance') return 'maintenance'
        return 'offline'
    }

    if (loading) {
        return (
            <div className="panel system-stats">
                <h3 className="panel-heading">System Stats</h3>
                <div className="loading-text">Loading stats…</div>
            </div>
        )
    }

    const overall = stats?.overall || {}
    const cache = stats?.cache || {}
    const nodeStats = stats?.nodes || []
    const utilPct = overall.utilization_percent ?? 0

    return (
        <div className="panel system-stats">
            <h3 className="panel-heading">System Stats</h3>

            {/* Overall Storage */}
            <div className="stats-section">
                <div className="stats-row">
                    <span className="stats-label">Storage Used</span>
                    <span className="stats-value">{formatBytes(overall.total_used_bytes)}</span>
                </div>
                <div className="stats-row">
                    <span className="stats-label">Total Capacity</span>
                    <span className="stats-value">{formatBytes(overall.total_capacity_bytes)}</span>
                </div>
                <div className="stats-row">
                    <span className="stats-label">Utilization</span>
                    <span className={`stats-value ${utilPct >= 80 ? 'stat-red' : utilPct >= 50 ? 'stat-orange' : 'stat-green'}`}>
                        {utilPct.toFixed(1)}%
                    </span>
                </div>

                {/* Overall utilization bar */}
                <div className="util-bar-bg">
                    <div
                        className={`util-bar-fill ${utilPct >= 80 ? 'util-critical' : utilPct >= 50 ? 'util-warning' : 'util-ok'}`}
                        style={{ width: `${Math.min(utilPct, 100)}%` }}
                    />
                </div>
            </div>

            {/* Cache Info */}
            <div className="stats-section" style={{ marginTop: '0.8rem' }}>
                <div className="stats-section-title">Cache</div>
                <div className="stats-row">
                    <span className="stats-label">Cached Chunks</span>
                    <span className="stats-value">{cache.cached_chunks ?? 0}</span>
                </div>
                <div className="stats-row">
                    <span className="stats-label">Max Size</span>
                    <span className="stats-value">{cache.max_size ?? 0}</span>
                </div>
                <button
                    className="btn btn-sm btn-secondary"
                    style={{ marginTop: '0.4rem', width: '100%' }}
                    onClick={handleClearCache}
                    disabled={clearing}
                    title="Clear chunk cache"
                >
                    {clearing ? '⟳ Clearing…' : '🗑 Clear Cache'}
                </button>
            </div>

            {/* Per-Node Utilization */}
            <div className="stats-section" style={{ marginTop: '0.8rem' }}>
                <div className="stats-section-title">Node Utilization</div>
                {nodeStats.map((n) => {
                    const pct = n.utilization_percent ?? 0
                    return (
                        <div key={n.id} className="node-util-row">
                            <span className="chunk-label">
                                <span className={`status-dot status-${statusClass(n.status)}`} />
                                {n.id}
                            </span>
                            <div className="chunk-bar-bg">
                                <div
                                    className={`chunk-bar-fill ${pct >= 80 ? 'util-critical' : pct >= 50 ? 'util-warning' : 'chunk-online'}`}
                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                            </div>
                            <span className="chunk-count">{pct.toFixed(0)}%</span>
                        </div>
                    )
                })}
            </div>

            {/* Refresh button */}
            <button
                className="btn btn-sm btn-secondary"
                style={{ marginTop: '0.6rem', width: '100%' }}
                onClick={fetchStats}
            >
                <span className="btn-icon">⟳</span> Refresh Stats
            </button>
        </div>
    )
}
