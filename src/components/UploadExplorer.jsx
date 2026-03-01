import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { uploadFile, listFiles, downloadFile, verifyFile, getFileInfo, deleteFile } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { SystemLogsProvider } from '../context/SystemLogsContext'
import { NodesProvider } from '../context/NodesContext'
import { FileSelectionProvider } from '../context/FileSelectionContext'
import DashboardScene from './dashboard/DashboardScene'
import ParticlesBackground from '../ParticlesBackground'
import '../upload-explorer.css'

/**
 * UploadExplorerInner — Full-screen topology background.
 * File manager panel on left, upload card on right.
 * Satellite topology visible in center background.
 */
function UploadExplorerInner() {
    const navigate = useNavigate()
    const { user } = useAuth()
    const [uploading, setUploading] = useState(false)
    const [uploaded, setUploaded] = useState(false)
    const [uploadResult, setUploadResult] = useState(null)
    const [error, setError] = useState(null)
    const [dragActive, setDragActive] = useState(false)
    const fileInputRef = useRef(null)

    /* ---- File Manager state ---- */
    const [files, setFiles] = useState([])
    const [filesLoading, setFilesLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState({})
    const [expandedInfo, setExpandedInfo] = useState(null)
    const [toast, setToast] = useState(null)

    /* ---- Fetch user's files ---- */
    const fetchFiles = useCallback(async () => {
        try {
            setFilesLoading(true)
            const data = await listFiles()
            setFiles(data.files || [])
        } catch {
            setFiles([])
        } finally {
            setFilesLoading(false)
        }
    }, [])

    useEffect(() => { fetchFiles() }, [fetchFiles])

    /* ---- Show toast ---- */
    const showToast = (msg, type = 'info') => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3000)
    }

    /* ---- Action helpers ---- */
    const setAction = (fileId, action) => setActionLoading(p => ({ ...p, [fileId]: action }))
    const clearAction = (fileId) => setActionLoading(p => { const n = { ...p }; delete n[fileId]; return n })

    /* ---- Upload ---- */
    const handleUpload = useCallback(async (file) => {
        if (!file) return
        setUploading(true)
        setError(null)
        try {
            const res = await uploadFile(file)
            const info = res.uploaded?.[0]
            setUploadResult({
                filename: info?.original_name || file.name,
                chunks: info?.total_chunks ?? '?',
                size: file.size,
            })
            setUploaded(true)
            fetchFiles()
        } catch (err) {
            setError(err.message || 'Upload failed')
        } finally {
            setUploading(false)
        }
    }, [fetchFiles])

    const handleFileChange = (e) => {
        const file = e.target.files?.[0]
        if (file) handleUpload(file)
    }

    const handleDrop = (e) => {
        e.preventDefault()
        setDragActive(false)
        const file = e.dataTransfer.files?.[0]
        if (file) handleUpload(file)
    }

    const handleDragOver = (e) => { e.preventDefault(); setDragActive(true) }
    const handleDragLeave = () => setDragActive(false)

    const handleReset = () => {
        setUploaded(false)
        setUploadResult(null)
        setError(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    /* ---- File actions ---- */
    const handleDownload = async (f) => {
        setAction(f.file_id, 'download')
        try {
            await downloadFile(f.file_id, f.original_name)
            showToast(`Downloaded "${f.original_name}"`, 'success')
        } catch (err) {
            showToast(`Download failed: ${err.message}`, 'error')
        } finally {
            clearAction(f.file_id)
        }
    }

    const handleVerify = async (f) => {
        setAction(f.file_id, 'verify')
        try {
            const result = await verifyFile(f.file_id)
            showToast(`Integrity: ${result.overall_integrity}`, result.overall_integrity === 'PASS' ? 'success' : 'error')
        } catch (err) {
            showToast(`Verify failed: ${err.message}`, 'error')
        } finally {
            clearAction(f.file_id)
        }
    }

    const handleInfo = async (f) => {
        if (expandedInfo?.fileId === f.file_id) { setExpandedInfo(null); return }
        setAction(f.file_id, 'info')
        try {
            const data = await getFileInfo(f.file_id)
            setExpandedInfo({ fileId: f.file_id, data })
        } catch (err) {
            showToast(`Info failed: ${err.message}`, 'error')
        } finally {
            clearAction(f.file_id)
        }
    }

    const handleDelete = async (f) => {
        if (!window.confirm(`Delete "${f.original_name}"? This cannot be undone.`)) return
        setAction(f.file_id, 'delete')
        try {
            await deleteFile(f.file_id)
            showToast(`Deleted "${f.original_name}"`, 'success')
            fetchFiles()
        } catch (err) {
            showToast(`Delete failed: ${err.message}`, 'error')
        } finally {
            clearAction(f.file_id)
        }
    }

    const formatSize = (bytes) => {
        if (!bytes && bytes !== 0) return '—'
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
        return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
    }

    return (
        <div className="upload-page">
            <ParticlesBackground />

            {/* Fullscreen topology — always visible */}
            <div className="topo-fullscreen topo-fullscreen--visible">
                <DashboardScene />
                <div className="topo-vignette" />
                <div className="topo-top-label">Network Topology</div>
            </div>

            {/* Top bar */}
            <div className="upload-topbar">
                <button className="upload-glass-btn" onClick={() => navigate('/')}>
                    ← Home
                </button>
                {user?.role === 'admin' && (
                    <button className="upload-glass-btn upload-glass-btn--primary" onClick={() => navigate('/dashboard')}>
                        ◈ Dashboard
                    </button>
                )}
            </div>

            {/* Toast notification */}
            {toast && (
                <div className={`upload-toast upload-toast--${toast.type}`}>
                    {toast.type === 'success' ? '✓' : toast.type === 'error' ? '⚠' : 'ℹ'} {toast.msg}
                </div>
            )}

            {/* Main content: File Manager (LEFT) + Upload Card (RIGHT) */}
            <div className="upload-content">

                {/* ── File Manager Panel (LEFT) ── */}
                <div className="user-files-panel">
                    <div className="ufp-header">
                        <span className="ufp-icon">📂</span>
                        <h3 className="ufp-title">My Files</h3>
                        <span className="ufp-count">{files.length}</span>
                        <button className="ufp-refresh" onClick={fetchFiles} title="Refresh">↻</button>
                    </div>

                    <div className="ufp-list">
                        {filesLoading ? (
                            <div className="ufp-empty">
                                <div className="ufp-spinner" />
                                Loading files…
                            </div>
                        ) : files.length === 0 ? (
                            <div className="ufp-empty">
                                No files uploaded yet. Upload your first file!
                            </div>
                        ) : (
                            files.map((f) => (
                                <div key={f.file_id} className="ufp-file">
                                    <div className="ufp-file-row">
                                        <span className="ufp-file-icon">📄</span>
                                        <span className="ufp-file-name" title={f.original_name}>
                                            {f.original_name}
                                        </span>
                                        <span className={`ufp-status ufp-status--${(f.status || 'active').toLowerCase()}`}>
                                            {f.status || 'ACTIVE'}
                                        </span>
                                        <span className="ufp-file-size">{formatSize(f.file_size)}</span>
                                    </div>
                                    <div className="ufp-actions">
                                        <button
                                            className="ufp-btn ufp-btn--download"
                                            onClick={() => handleDownload(f)}
                                            disabled={!!actionLoading[f.file_id]}
                                            title="Download"
                                        >
                                            {actionLoading[f.file_id] === 'download' ? '⟳' : '⬇'} Download
                                        </button>
                                        <button
                                            className="ufp-btn ufp-btn--verify"
                                            onClick={() => handleVerify(f)}
                                            disabled={!!actionLoading[f.file_id]}
                                            title="Verify integrity"
                                        >
                                            {actionLoading[f.file_id] === 'verify' ? '⟳' : '✓'} Verify
                                        </button>
                                        <button
                                            className="ufp-btn ufp-btn--info"
                                            onClick={() => handleInfo(f)}
                                            disabled={!!actionLoading[f.file_id]}
                                            title="File info"
                                        >
                                            {actionLoading[f.file_id] === 'info' ? '⟳' : 'ℹ'} Info
                                        </button>
                                        <button
                                            className="ufp-btn ufp-btn--delete"
                                            onClick={() => handleDelete(f)}
                                            disabled={!!actionLoading[f.file_id]}
                                            title="Delete file"
                                        >
                                            {actionLoading[f.file_id] === 'delete' ? '⟳' : '🗑'} Delete
                                        </button>
                                    </div>

                                    {/* Expanded info panel */}
                                    {expandedInfo?.fileId === f.file_id && expandedInfo.data && (
                                        <div className="ufp-info-expand">
                                            <div className="ufp-info-row">
                                                <span>File ID</span>
                                                <span className="mono">{expandedInfo.data.file_id}</span>
                                            </div>
                                            <div className="ufp-info-row">
                                                <span>Checksum</span>
                                                <span className="mono">{expandedInfo.data.checksum?.slice(0, 16)}…</span>
                                            </div>
                                            <div className="ufp-info-row">
                                                <span>Merkle Root</span>
                                                <span className="mono">{expandedInfo.data.merkle_root?.slice(0, 16) || '—'}…</span>
                                            </div>
                                            <div className="ufp-info-row">
                                                <span>Total Chunks</span>
                                                <span>{expandedInfo.data.total_chunks}</span>
                                            </div>
                                            <div className="ufp-info-row">
                                                <span>Version</span>
                                                <span>v{expandedInfo.data.version}</span>
                                            </div>
                                            <div className="ufp-info-row">
                                                <span>Compressed</span>
                                                <span>{expandedInfo.data.is_compressed ? 'Yes' : 'No'}</span>
                                            </div>
                                            {expandedInfo.data.chunks?.length > 0 && (
                                                <div className="ufp-chunk-map">
                                                    <div className="ufp-chunk-title">Chunk Distribution</div>
                                                    {expandedInfo.data.chunks.slice(0, 8).map((c) => (
                                                        <div key={c.chunk_id} className="ufp-chunk-row">
                                                            <span>#{c.chunk_index}</span>
                                                            <span>Node {c.node_id?.slice(0, 8)}</span>
                                                            <span>{formatSize(c.size_bytes)}</span>
                                                            {c.is_replica && <span className="ufp-badge-replica">replica</span>}
                                                        </div>
                                                    ))}
                                                    {expandedInfo.data.chunks.length > 8 && (
                                                        <div className="ufp-chunk-more">
                                                            +{expandedInfo.data.chunks.length - 8} more chunks
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* ── Upload Card (RIGHT) ── */}
                <div className={`upload-glass-card ${uploaded ? 'upload-glass-card--mini' : ''} ${dragActive ? 'upload-glass-card--drag' : ''}`}>
                    {!uploaded ? (
                        <>
                            <h2 className="glass-title">Upload to the Cosmos</h2>
                            <p className="glass-subtitle">
                                Drop a file to distribute it across the orbital network
                            </p>

                            {error && <div className="upload-error">⚠ {error}</div>}

                            <div
                                className={`glass-drop-zone ${uploading ? 'glass-drop-zone--busy' : ''}`}
                                onClick={() => !uploading && fileInputRef.current?.click()}
                                onDrop={handleDrop}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                            >
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    style={{ display: 'none' }}
                                    onChange={handleFileChange}
                                />
                                {uploading ? (
                                    <div className="glass-spinner">
                                        <div className="orbit-ring" />
                                        <span>Distributing chunks…</span>
                                    </div>
                                ) : (
                                    <>
                                        <span className="glass-drop-icon">⬆</span>
                                        <span className="glass-drop-text">
                                            Drop here or <span className="glass-link">browse</span>
                                        </span>
                                        <span className="glass-drop-hint">Any file type</span>
                                    </>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="glass-success-icon">✓</div>
                            <h2 className="glass-title glass-title--sm">Distributed Successfully</h2>

                            <div className="glass-result">
                                <div className="glass-result-item">
                                    <span className="glass-result-label">File</span>
                                    <span className="glass-result-val">{uploadResult?.filename}</span>
                                </div>
                                <div className="glass-result-item">
                                    <span className="glass-result-label">Size</span>
                                    <span className="glass-result-val">{formatSize(uploadResult?.size)}</span>
                                </div>
                                <div className="glass-result-item">
                                    <span className="glass-result-label">Chunks</span>
                                    <span className="glass-result-val">{uploadResult?.chunks}</span>
                                </div>
                            </div>

                            <div className="glass-actions">
                                <button className="glass-cta" onClick={handleReset}>
                                    ⬆ Upload Another
                                </button>
                            </div>
                        </>
                    )}
                </div>

            </div>
        </div>
    )
}

export default function UploadExplorer() {
    return (
        <SystemLogsProvider>
            <NodesProvider>
                <FileSelectionProvider>
                    <UploadExplorerInner />
                </FileSelectionProvider>
            </NodesProvider>
        </SystemLogsProvider>
    )
}
