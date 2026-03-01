import { useState, useEffect, useCallback, useRef } from 'react'
import {
    listFiles,
    uploadFile,
    downloadFile,
    verifyFile,
    getFileInfo,
    deleteFile,
    getFileVersions,
    downloadFileByName,
} from '../../services/api'
import { useSystemLogs } from '../../context/SystemLogsContext'
import { useFileSelection } from '../../context/FileSelectionContext'
import { useAuth } from '../../context/AuthContext'

/**
 * FileManager — Left panel: flat file list from backend,
 * upload / download / verify / info / delete / versions actions.
 */
export default function FileManager() {
    const [files, setFiles] = useState([])
    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState(false)
    const [expandedInfo, setExpandedInfo] = useState(null)     // { fileId, data }
    const [expandedVersions, setExpandedVersions] = useState(null) // { filename, data }
    const [actionLoading, setActionLoading] = useState({})    // { [fileId]: action }
    const [toast, setToast] = useState(null)
    const fileInputRef = useRef(null)
    const { addLog } = useSystemLogs()
    const { selectFile, triggerTransfer } = useFileSelection()
    const { user } = useAuth()
    const isAdmin = user?.role === 'admin'

    const fetchFiles = useCallback(async () => {
        try {
            const data = await listFiles()
            setFiles(data.files || [])
        } catch (err) {
            addLog('ERROR', `Failed to fetch files: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }, [addLog])

    useEffect(() => {
        fetchFiles()
    }, [fetchFiles])

    /* ---- Toast helper ---- */
    const showToast = (msg, type = 'info') => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3500)
    }

    const setAction = (fileId, action) =>
        setActionLoading((prev) => ({ ...prev, [fileId]: action }))
    const clearAction = (fileId) =>
        setActionLoading((prev) => { const n = { ...prev }; delete n[fileId]; return n })

    /* ---- Upload ---- */
    const handleUpload = async (e) => {
        const selected = e.target.files
        if (!selected || selected.length === 0) return
        setUploading(true)
        try {
            // Upload each selected file individually (backend supports up to 20)
            for (const file of selected) {
                const res = await uploadFile(file)
                const uploaded = res.uploaded?.[0]
                addLog('INFO', `Uploaded "${file.name}" — ${uploaded?.total_chunks ?? '?'} chunks`)
            }
            // Trigger chunk transfer animation (master → nodes)
            triggerTransfer('upload', 4000)
            showToast(`Uploaded ${selected.length} file(s)`, 'success')
            await fetchFiles()
        } catch (err) {
            addLog('ERROR', `Upload failed: ${err.message}`)
            showToast(`Upload failed: ${err.message}`, 'error')
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    /* ---- Download ---- */
    const handleDownload = async (f) => {
        console.log('[Download] file_id:', f.file_id, 'name:', f.original_name,
            'owner_id:', f.owner_id, 'user.id:', user?.id,
            'match:', f.owner_id === user?.id)
        setAction(f.file_id, 'download')
        try {
            // Trigger chunk transfer animation (nodes → master)
            triggerTransfer('download', 3000)
            await downloadFile(f.file_id, f.original_name)
            addLog('INFO', `Downloaded "${f.original_name}"`)
        } catch (err) {
            console.error('[Download] FAILED:', err.message, 'status:', err.status, err)
            addLog('ERROR', `Download failed: ${err.message}`)
            showToast(`Download failed: ${err.message}`, 'error')
        } finally {
            clearAction(f.file_id)
        }
    }

    /* ---- Verify ---- */
    const handleVerify = async (f) => {
        setAction(f.file_id, 'verify')
        try {
            const res = await verifyFile(f.file_id)
            const ok = res.overall_integrity === 'PASS'
            addLog(ok ? 'INFO' : 'WARN', `Integrity ${res.overall_integrity} for "${f.original_name}"`)
            showToast(`Integrity: ${res.overall_integrity}`, ok ? 'success' : 'error')
        } catch (err) {
            addLog('ERROR', `Verify failed: ${err.message}`)
            showToast(`Verify failed: ${err.message}`, 'error')
        } finally {
            clearAction(f.file_id)
        }
    }

    /* ---- Info ---- */
    const handleInfo = async (f) => {
        if (expandedInfo?.fileId === f.file_id) { setExpandedInfo(null); return }
        setAction(f.file_id, 'info')
        try {
            const data = await getFileInfo(f.file_id)
            setExpandedInfo({ fileId: f.file_id, data })
            addLog('INFO', `Loaded info for "${f.original_name}"`)
        } catch (err) {
            addLog('ERROR', `Info failed: ${err.message}`)
            showToast(`Info failed: ${err.message}`, 'error')
        } finally {
            clearAction(f.file_id)
        }
    }

    /* ---- Delete ---- */
    const handleDelete = async (f) => {
        if (!window.confirm(`Delete "${f.original_name}"?`)) return
        setAction(f.file_id, 'delete')
        try {
            await deleteFile(f.file_id)
            addLog('WARN', `Deleted "${f.original_name}"`)
            showToast(`Deleted ${f.original_name}`, 'success')
            // Close expanded panels if they were showing this file
            if (expandedInfo?.fileId === f.file_id) setExpandedInfo(null)
            if (expandedVersions?.filename === f.original_name) setExpandedVersions(null)
            await fetchFiles()
        } catch (err) {
            addLog('ERROR', `Delete failed: ${err.message}`)
            showToast(`Delete failed: ${err.message}`, 'error')
        } finally {
            clearAction(f.file_id)
        }
    }

    /* ---- Versions ---- */
    const handleVersions = async (f) => {
        if (expandedVersions?.filename === f.original_name) { setExpandedVersions(null); return }
        setAction(f.file_id, 'versions')
        try {
            const data = await getFileVersions(f.original_name)
            setExpandedVersions({ filename: f.original_name, data })
            addLog('INFO', `Loaded ${data.total_versions} version(s) for "${f.original_name}"`)
        } catch (err) {
            addLog('ERROR', `Versions fetch failed: ${err.message}`)
            showToast(`Versions failed: ${err.message}`, 'error')
        } finally {
            clearAction(f.file_id)
        }
    }

    /* ---- Click file name to show chunk distribution in topology ---- */
    const handleFileClick = useCallback(async (f) => {
        // Toggle off if same file is already selected
        if (selectFile && triggerTransfer) {
            try {
                const info = await getFileInfo(f.file_id)
                const nodeIds = info.chunks?.map(c => c.node_id) || []
                const uniqueNodes = [...new Set(nodeIds)]
                selectFile({
                    file_id: f.file_id,
                    original_name: f.original_name,
                    nodes: uniqueNodes,
                    chunks: info.chunks || [],
                })
            } catch (err) {
                addLog('ERROR', `File info failed: ${err.message}`)
            }
        }
    }, [selectFile, triggerTransfer, addLog])

    /* ---- Helpers ---- */
    const formatSize = (bytes) => {
        if (!bytes && bytes !== 0) return '—'
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
        return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
    }

    /* ---- Split files for admin ---- */
    const adminOwnFiles = isAdmin ? files.filter(f => f.owner_id === user?.id) : files
    const adminOtherFiles = isAdmin ? files.filter(f => f.owner_id !== user?.id) : []

    /* ---- Render a single file item (reused in both sections) ---- */
    const renderFileItem = (f, { showDownloadDelete = true } = {}) => (
        <div key={f.file_id} className="file-item">
            <div className="file-row">
                <span className="file-icon">📄</span>
                <span
                    className="file-name file-name--clickable"
                    title={`Click to view chunk distribution for ${f.original_name}`}
                    onClick={() => handleFileClick(f)}
                >
                    {f.original_name}
                </span>
                <span className={`file-status-badge status-badge-${(f.status || 'active').toLowerCase()}`}>
                    {f.status || 'ACTIVE'}
                </span>
                <span className="file-size">{formatSize(f.file_size)}</span>
            </div>

            {/* Action buttons */}
            <div className="file-action-row">
                {/* Download — only own files */}
                {showDownloadDelete && (
                    <button
                        className="btn-xs btn-action"
                        onClick={() => handleDownload(f)}
                        disabled={!!actionLoading[f.file_id]}
                        title="Download"
                    >
                        {actionLoading[f.file_id] === 'download' ? '⟳' : '⬇'}
                    </button>
                )}

                {/* Verify Integrity */}
                <button
                    className="btn-xs btn-action"
                    onClick={() => handleVerify(f)}
                    disabled={!!actionLoading[f.file_id]}
                    title="Verify integrity"
                >
                    {actionLoading[f.file_id] === 'verify' ? '⟳' : '✓'}
                </button>

                {/* File Info / Chunk Map */}
                <button
                    className="btn-xs btn-action"
                    onClick={() => handleInfo(f)}
                    disabled={!!actionLoading[f.file_id]}
                    title="File info & chunk map"
                >
                    {actionLoading[f.file_id] === 'info' ? '⟳' : 'ℹ'}
                </button>

                {/* Version History */}
                <button
                    className="btn-xs btn-versions"
                    onClick={() => handleVersions(f)}
                    disabled={!!actionLoading[f.file_id]}
                    title="Version history"
                >
                    {actionLoading[f.file_id] === 'versions' ? '⟳' : '📋'}
                </button>

                {/* Delete — only own files */}
                {showDownloadDelete && (
                    <button
                        className="btn-xs btn-danger"
                        onClick={() => handleDelete(f)}
                        disabled={!!actionLoading[f.file_id]}
                        title="Delete file"
                    >
                        {actionLoading[f.file_id] === 'delete' ? '⟳' : '🗑'}
                    </button>
                )}

                {/* Owner badge for other users' files */}
                {!showDownloadDelete && (
                    <span className="profile-owner-badge" style={{ fontSize: '0.6rem', marginLeft: 'auto' }}>
                        user:{f.owner_id?.slice(0, 6)}
                    </span>
                )}
            </div>

            {/* Expanded info */}
            {expandedInfo?.fileId === f.file_id && (
                <div className="file-info-expand">
                    <div className="info-row"><span>ID:</span> <span>{expandedInfo.data.file_id}</span></div>
                    <div className="info-row"><span>Checksum:</span> <span className="mono">{expandedInfo.data.checksum?.slice(0, 16)}…</span></div>
                    <div className="info-row"><span>Chunks:</span> <span>{expandedInfo.data.total_chunks}</span></div>
                    <div className="info-row"><span>Version:</span> <span>{expandedInfo.data.version}</span></div>
                    <div className="chunk-map">
                        <div className="chunk-map-title">Chunk Map</div>
                        {(expandedInfo.data.chunks || []).map((c) => (
                            <div key={c.chunk_id} className="chunk-map-row">
                                <span className="mono">#{c.chunk_index}</span>
                                <span>{c.node_id}</span>
                                <span>{formatSize(c.size_bytes)}</span>
                                {c.is_replica && <span className="badge-replica">R</span>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Expanded versions */}
            {expandedVersions?.filename === f.original_name && (
                <div className="versions-expand">
                    <div className="chunk-map-title">
                        Version History ({expandedVersions.data.total_versions} version{expandedVersions.data.total_versions !== 1 ? 's' : ''})
                    </div>
                    {(expandedVersions.data.versions || []).map((v) => (
                        <div key={v.file_id} className="version-row">
                            <span className="version-badge">v{v.version}</span>
                            <span className="mono">{formatSize(v.file_size)}</span>
                            <span className="version-chunks">{v.total_chunks} chunks</span>
                            <span className={`file-status-badge status-badge-${(v.status || 'active').toLowerCase()}`}>
                                {v.status}
                            </span>
                            {showDownloadDelete && (
                                <button
                                    className="btn-xs btn-action"
                                    onClick={() => downloadFileByName(f.original_name, v.version)}
                                    title={`Download v${v.version}`}
                                >
                                    ⬇ v{v.version}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )

    return (
        <div className="panel file-manager">
            <h3 className="panel-heading">File Manager</h3>

            {/* Toast */}
            {toast && (
                <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
            )}

            {/* ---- Section 1: My Files ---- */}
            {isAdmin && (
                <div className="file-section-heading">
                    <span className="file-section-icon">👤</span> My Uploaded Files
                    <span className="file-section-count">{adminOwnFiles.length}</span>
                </div>
            )}
            <div className="file-tree">
                {loading ? (
                    <div className="loading-text">Loading files…</div>
                ) : adminOwnFiles.length === 0 ? (
                    <div className="empty-text">{isAdmin ? 'No files uploaded by you' : 'No files uploaded yet'}</div>
                ) : (
                    adminOwnFiles.map((f) => renderFileItem(f, { showDownloadDelete: true }))
                )}
            </div>

            {/* ---- Section 2: All Users' Files (admin only) ---- */}
            {isAdmin && (
                <>
                    <div className="file-section-heading" style={{ marginTop: '0.8rem' }}>
                        <span className="file-section-icon">👥</span> All Users' Files
                        <span className="file-section-count">{adminOtherFiles.length}</span>
                    </div>
                    <div className="file-tree">
                        {adminOtherFiles.length === 0 ? (
                            <div className="empty-text">No files uploaded by other users</div>
                        ) : (
                            adminOtherFiles.map((f) => renderFileItem(f, { showDownloadDelete: false }))
                        )}
                    </div>
                </>
            )}

            {/* Actions */}
            <div className="file-actions">
                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    multiple
                    onChange={handleUpload}
                />
                <button
                    className="btn btn-primary"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                >
                    <span className="btn-icon">{uploading ? '⟳' : '⬆'}</span>
                    {uploading ? 'Uploading…' : 'Upload File(s)'}
                </button>
                <button className="btn btn-secondary" onClick={fetchFiles}>
                    <span className="btn-icon">⟳</span> Refresh
                </button>
            </div>
        </div>
    )
}
