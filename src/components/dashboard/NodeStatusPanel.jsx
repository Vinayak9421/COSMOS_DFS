import { useState, useCallback } from 'react'
import { useNodes } from '../../context/NodesContext'
import { useSystemLogs } from '../../context/SystemLogsContext'
import { getNodeChunks } from '../../services/api'

/**
 * NodeStatusPanel — Right panel: live node status table + chunk distribution + actions.
 * Actions: Kill (ONLINE) | Recover (OFFLINE/DEGRADED) | Maintenance (ONLINE) | Activate (MAINTENANCE)
 * Data comes from NodesContext (polled via GET /nodes/).
 */
export default function NodeStatusPanel() {
    const { nodes, loading, killNode, recoverNode, maintenanceNode, activateNode } = useNodes()
    const { addLog } = useSystemLogs()
    const [actionLoading, setActionLoading] = useState({})
    const [expandedChunks, setExpandedChunks] = useState(null) // { nodeId, chunks }

    const totalChunks = nodes.reduce((sum, n) => sum + (n.chunk_count || 0), 0)

    /* ---- Helpers ---- */
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

    const setAction = (nodeId, action) =>
        setActionLoading((prev) => ({ ...prev, [nodeId]: action }))
    const clearAction = (nodeId) =>
        setActionLoading((prev) => { const n = { ...prev }; delete n[nodeId]; return n })

    /* ---- Actions ---- */
    const handleKill = useCallback(async (nodeId) => {
        setAction(nodeId, 'kill')
        try {
            await killNode(nodeId)
        } catch (err) { /* logged by context */ }
        finally { clearAction(nodeId) }
    }, [killNode])

    const handleRecover = useCallback(async (nodeId) => {
        setAction(nodeId, 'recover')
        try {
            await recoverNode(nodeId)
        } catch (err) { /* logged by context */ }
        finally { clearAction(nodeId) }
    }, [recoverNode])

    const handleMaintenance = useCallback(async (nodeId) => {
        setAction(nodeId, 'maintenance')
        try {
            await maintenanceNode(nodeId)
        } catch (err) { /* logged by context */ }
        finally { clearAction(nodeId) }
    }, [maintenanceNode])

    const handleActivate = useCallback(async (nodeId) => {
        setAction(nodeId, 'activate')
        try {
            await activateNode(nodeId)
        } catch (err) { /* logged by context */ }
        finally { clearAction(nodeId) }
    }, [activateNode])

    const handleViewChunks = useCallback(async (nodeId) => {
        if (expandedChunks?.nodeId === nodeId) { setExpandedChunks(null); return }
        setAction(nodeId, 'chunks')
        try {
            const data = await getNodeChunks(nodeId)
            setExpandedChunks({ nodeId, chunks: data.chunks || [] })
            addLog('INFO', `Loaded ${data.total_chunks} chunks for ${nodeId}`)
        } catch (err) {
            addLog('ERROR', `Chunk fetch failed for ${nodeId}: ${err.message}`)
        } finally {
            clearAction(nodeId)
        }
    }, [expandedChunks, addLog])

    if (loading) {
        return (
            <div className="panel node-status-panel">
                <h3 className="panel-heading">Node Status</h3>
                <div className="loading-text">Loading nodes…</div>
            </div>
        )
    }

    return (
        <div className="panel node-status-panel">
            {/* ---- Node Status Table ---- */}
            <h3 className="panel-heading">Node Status</h3>
            <div className="node-table-wrap">
                <table className="node-table">
                    <thead>
                        <tr>
                            <th>Node</th>
                            <th>Status</th>
                            <th>Used</th>
                            <th>Cap.</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {nodes.map((n) => (
                            <tr key={n.id}>
                                <td>{n.label}</td>
                                <td>
                                    <span className={`status-dot status-${statusClass(n.status)}`} />
                                    {n.status}
                                </td>
                                <td>{formatBytes(n.used_bytes)}</td>
                                <td>{formatBytes(n.capacity_bytes)}</td>
                                <td className="node-actions-cell">
                                    {/* Kill — only for ONLINE nodes */}
                                    {n.status === 'ONLINE' && (
                                        <button
                                            className="btn-xs btn-danger"
                                            onClick={() => handleKill(n.id)}
                                            disabled={!!actionLoading[n.id]}
                                            title="Kill node (soft)"
                                        >
                                            {actionLoading[n.id] === 'kill' ? '⟳' : '✕'}
                                        </button>
                                    )}

                                    {/* Maintenance — only for ONLINE nodes */}
                                    {n.status === 'ONLINE' && (
                                        <button
                                            className="btn-xs btn-warning"
                                            onClick={() => handleMaintenance(n.id)}
                                            disabled={!!actionLoading[n.id]}
                                            title="Set to Maintenance mode"
                                        >
                                            {actionLoading[n.id] === 'maintenance' ? '⟳' : '🔧'}
                                        </button>
                                    )}

                                    {/* Recover — for OFFLINE or DEGRADED nodes */}
                                    {(n.status === 'OFFLINE' || n.status === 'DEGRADED') && (
                                        <button
                                            className="btn-xs btn-success"
                                            onClick={() => handleRecover(n.id)}
                                            disabled={!!actionLoading[n.id]}
                                            title="Recover node → ONLINE"
                                        >
                                            {actionLoading[n.id] === 'recover' ? '⟳' : '↻'}
                                        </button>
                                    )}

                                    {/* Activate — only for MAINTENANCE nodes */}
                                    {n.status === 'MAINTENANCE' && (
                                        <button
                                            className="btn-xs btn-activate"
                                            onClick={() => handleActivate(n.id)}
                                            disabled={!!actionLoading[n.id]}
                                            title="Activate node → ONLINE"
                                        >
                                            {actionLoading[n.id] === 'activate' ? '⟳' : '▶'}
                                        </button>
                                    )}

                                    {/* View Chunks — always available */}
                                    <button
                                        className="btn-xs btn-action"
                                        onClick={() => handleViewChunks(n.id)}
                                        disabled={!!actionLoading[n.id]}
                                        title="View chunks on this node"
                                    >
                                        {actionLoading[n.id] === 'chunks' ? '⟳' : '◉'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Expanded chunk list */}
            {expandedChunks && (
                <div className="node-chunks-expand">
                    <div className="chunk-map-title">
                        Chunks on {expandedChunks.nodeId} ({expandedChunks.chunks.length})
                    </div>
                    {expandedChunks.chunks.length === 0 ? (
                        <div className="empty-text">No chunks</div>
                    ) : (
                        expandedChunks.chunks.map((c) => (
                            <div key={c.chunk_id} className="chunk-map-row">
                                <span className="mono">#{c.chunk_index}</span>
                                <span className="mono">{c.file_id?.slice(0, 8)}…</span>
                                <span>{formatBytes(c.size_bytes)}</span>
                                {c.is_replica && <span className="badge-replica">R</span>}
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* ---- Chunk Distribution ---- */}
            <h3 className="panel-heading" style={{ marginTop: '1.2rem' }}>Chunk Distribution</h3>
            <div className="chunk-bars">
                {nodes.map((n) => {
                    const pct = totalChunks > 0 ? ((n.chunk_count || 0) / totalChunks) * 100 : 0
                    return (
                        <div key={n.id} className="chunk-row">
                            <span className="chunk-label">{n.label}</span>
                            <div className="chunk-bar-bg">
                                <div
                                    className={`chunk-bar-fill chunk-${statusClass(n.status)}`}
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                            <span className="chunk-count">{n.chunk_count || 0}</span>
                        </div>
                    )
                })}
            </div>

            {/* ---- Quick Simulation Buttons ---- */}
            <h3 className="panel-heading" style={{ marginTop: '1.2rem' }}>Quick Simulation</h3>
            <div className="sim-buttons-bar">
                <button
                    className="btn-sim btn-sim--kill"
                    disabled={!nodes.some(n => n.status === 'ONLINE')}
                    onClick={() => {
                        const online = nodes.filter(n => n.status === 'ONLINE')
                        if (online.length > 0) {
                            const target = online[Math.floor(Math.random() * online.length)]
                            handleKill(target.id)
                            addLog('WARN', `Simulation: Killing node ${target.label}`)
                        }
                    }}
                    title="Kill a random online node"
                >
                    ✕ Kill Node
                </button>
                <button
                    className="btn-sim btn-sim--maint"
                    disabled={!nodes.some(n => n.status === 'ONLINE')}
                    onClick={() => {
                        const online = nodes.filter(n => n.status === 'ONLINE')
                        if (online.length > 0) {
                            const target = online[Math.floor(Math.random() * online.length)]
                            handleMaintenance(target.id)
                            addLog('INFO', `Simulation: Maintenance on node ${target.label}`)
                        }
                    }}
                    title="Put a random online node into maintenance"
                >
                    🔧 Maintenance
                </button>
                <button
                    className="btn-sim btn-sim--recover"
                    disabled={!nodes.some(n => ['OFFLINE', 'DEGRADED', 'MAINTENANCE'].includes(n.status))}
                    onClick={() => {
                        const down = nodes.filter(n => ['OFFLINE', 'DEGRADED'].includes(n.status))
                        const maint = nodes.filter(n => n.status === 'MAINTENANCE')
                        if (down.length > 0) {
                            const target = down[Math.floor(Math.random() * down.length)]
                            handleRecover(target.id)
                            addLog('INFO', `Simulation: Recovering node ${target.label}`)
                        } else if (maint.length > 0) {
                            const target = maint[Math.floor(Math.random() * maint.length)]
                            handleActivate(target.id)
                            addLog('INFO', `Simulation: Activating node ${target.label}`)
                        }
                    }}
                    title="Recover a random offline/degraded node or activate a maintenance node"
                >
                    ↻ Recover
                </button>
            </div>
        </div>
    )
}
