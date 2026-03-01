import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSystemHealth, clearCache } from '../../services/api'
import { useSystemLogs } from '../../context/SystemLogsContext'
import { useAuth } from '../../context/AuthContext'

/**
 * Navbar — Futuristic top bar with live system stats from /system/health.
 * Polls every 10s.  Includes home button and user info.
 */
export default function Navbar() {
    const [health, setHealth] = useState(null)
    const [loading, setLoading] = useState(true)
    const [clearing, setClearing] = useState(false)
    const { addLog } = useSystemLogs()
    const { user } = useAuth()
    const navigate = useNavigate()

    const fetchHealth = useCallback(async () => {
        try {
            const data = await getSystemHealth()
            setHealth(data)
        } catch (err) {
            addLog('ERROR', `Health fetch failed: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }, [addLog])

    useEffect(() => {
        fetchHealth()
        const id = setInterval(fetchHealth, 10000)
        return () => clearInterval(id)
    }, [fetchHealth])

    const handleClearCache = async () => {
        setClearing(true)
        try {
            await clearCache()
            addLog('INFO', 'Chunk cache cleared successfully')
            await fetchHealth()
        } catch (err) {
            addLog('ERROR', `Cache clear failed: ${err.message}`)
        } finally {
            setClearing(false)
        }
    }

    /* Derive display values */
    const nodes = health?.nodes || {}
    const totalNodes = nodes.total || 0
    const onlineCount = nodes.online || 0
    const healthPct =
        totalNodes > 0 ? Math.round((onlineCount / totalNodes) * 100) : 0

    const roleClass = user?.role === 'admin' ? 'auth-role-badge--admin' : 'auth-role-badge--user'

    return (
        <nav className="dash-navbar">
            {/* Left: Brand + Home */}
            <div className="dash-nav-brand">
                <span className="dash-nav-icon">◈</span>
                <span className="dash-nav-title">COSMOS <span className="nav-accent">DFS</span></span>
                <button
                    className="nav-home-btn"
                    onClick={() => navigate('/')}
                    title="Go to Home"
                >
                    🏠
                </button>
            </div>

            {/* Center: Stats row */}
            <div className="dash-nav-stats">
                {loading ? (
                    <>
                        <SkeletonBadge />
                        <SkeletonBadge />
                        <SkeletonBadge />
                        <SkeletonBadge />
                    </>
                ) : (
                    <>
                        <StatBadge label="Files" value={String(health?.total_files ?? 0)} />
                        <StatBadge label="Chunks" value={String(health?.total_chunks ?? 0)} />
                        <StatBadge
                            label="Nodes"
                            value={`${onlineCount} / ${totalNodes}`}
                        />
                        <StatBadge
                            label="Health"
                            value={`${healthPct}%`}
                            accent={healthPct >= 90 ? 'green' : healthPct >= 50 ? 'orange' : 'red'}
                        />
                        <StatBadge label="Cache" value={String(health?.cache_size ?? 0)} />
                    </>
                )}
            </div>

            {/* Right: Cache button + User info */}
            <div className="dash-nav-right">
                <button
                    className="btn btn-sm btn-secondary"
                    onClick={handleClearCache}
                    disabled={clearing}
                    title="Clear chunk cache"
                >
                    {clearing ? '⟳' : '🗑'} Cache
                </button>

                {user && (
                    <div className="nav-user-badge">
                        <span className="nav-username">{user.username}</span>
                        <span className={`auth-role-badge ${roleClass}`}>{user.role}</span>
                    </div>
                )}
            </div>
        </nav>
    )
}

function StatBadge({ label, value, accent }) {
    return (
        <div className="stat-badge">
            <span className="stat-label">{label}</span>
            <span className={`stat-value ${accent ? `stat-${accent}` : ''}`}>{value}</span>
        </div>
    )
}

function SkeletonBadge() {
    return (
        <div className="stat-badge">
            <span className="stat-label skeleton-line" style={{ width: 40 }}>&nbsp;</span>
            <span className="stat-value skeleton-line" style={{ width: 50 }}>&nbsp;</span>
        </div>
    )
}
