import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { listNodes, killNode as apiKillNode, recoverNode as apiRecoverNode, setNodeMaintenance as apiSetMaintenance, activateNode as apiActivateNode } from '../services/api'
import { useSystemLogs } from './SystemLogsContext'

const NodesContext = createContext(null)

const PLANET_LABELS = {
    node_01: '1',
    node_02: '2',
    node_03: '3',
    node_04: '4',
    node_05: '5',
    node_06: '6',
    node_07: '7',
    node_08: '8',
}

/**
 * Provider — fetches & polls node data, exposes actions.
 */
export function NodesProvider({ children }) {
    const [nodes, setNodes] = useState([])
    const [loading, setLoading] = useState(true)
    const { addLog } = useSystemLogs()
    const intervalRef = useRef(null)

    const fetchNodes = useCallback(async () => {
        try {
            const data = await listNodes()
            const enriched = (data.nodes || []).map((n) => ({
                ...n,
                label: PLANET_LABELS[n.id] || n.id,
                type: 'planet',
            }))
            setNodes(enriched)
        } catch (err) {
            addLog('ERROR', `Failed to fetch nodes: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }, [addLog])

    useEffect(() => {
        fetchNodes()
        intervalRef.current = setInterval(fetchNodes, 10000)
        return () => clearInterval(intervalRef.current)
    }, [fetchNodes])

    const killNode = useCallback(async (nodeId, hard = false) => {
        try {
            const res = await apiKillNode(nodeId, hard)
            addLog('WARN', res.message || `Node ${nodeId} killed`)
            await fetchNodes()
            return res
        } catch (err) {
            addLog('ERROR', `Kill node ${nodeId} failed: ${err.message}`)
            throw err
        }
    }, [addLog, fetchNodes])

    const recoverNode = useCallback(async (nodeId) => {
        try {
            const res = await apiRecoverNode(nodeId)
            addLog('INFO', res.message || `Node ${nodeId} recovered`)
            await fetchNodes()
            return res
        } catch (err) {
            addLog('ERROR', `Recover node ${nodeId} failed: ${err.message}`)
            throw err
        }
    }, [addLog, fetchNodes])

    const maintenanceNode = useCallback(async (nodeId) => {
        try {
            const res = await apiSetMaintenance(nodeId)
            addLog('WARN', res.message || `Node ${nodeId} set to MAINTENANCE`)
            await fetchNodes()
            return res
        } catch (err) {
            addLog('ERROR', `Maintenance node ${nodeId} failed: ${err.message}`)
            throw err
        }
    }, [addLog, fetchNodes])

    const activateNode = useCallback(async (nodeId) => {
        try {
            const res = await apiActivateNode(nodeId)
            addLog('INFO', res.message || `Node ${nodeId} activated → ONLINE`)
            await fetchNodes()
            return res
        } catch (err) {
            addLog('ERROR', `Activate node ${nodeId} failed: ${err.message}`)
            throw err
        }
    }, [addLog, fetchNodes])

    return (
        <NodesContext.Provider value={{ nodes, loading, fetchNodes, killNode, recoverNode, maintenanceNode, activateNode }}>
            {children}
        </NodesContext.Provider>
    )
}

export function useNodes() {
    const ctx = useContext(NodesContext)
    if (!ctx) throw new Error('useNodes must be used within NodesProvider')
    return ctx
}
