import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { uploadFile } from '../services/api'
import { SystemLogsProvider } from '../context/SystemLogsContext'
import { NodesProvider } from '../context/NodesContext'
import { FileSelectionProvider } from '../context/FileSelectionContext'
import DashboardScene from './dashboard/DashboardScene'
import ParticlesBackground from '../ParticlesBackground'
import '../upload-explorer.css'

/**
 * UploadExplorerInner — Full-screen topology background.
 * Upload card centered initially, moves to bottom-left after upload.
 * Topology smoothly loads into view after upload.
 */
function UploadExplorerInner() {
    const navigate = useNavigate()
    const [uploading, setUploading] = useState(false)
    const [uploaded, setUploaded] = useState(false)
    const [uploadResult, setUploadResult] = useState(null)
    const [error, setError] = useState(null)
    const [dragActive, setDragActive] = useState(false)
    const fileInputRef = useRef(null)

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
        } catch (err) {
            setError(err.message || 'Upload failed')
        } finally {
            setUploading(false)
        }
    }, [])

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

    const formatSize = (bytes) => {
        if (!bytes) return '—'
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    }

    return (
        <div className="upload-page">
            <ParticlesBackground />

            {/* Fullscreen topology — always rendered, opacity transition */}
            <div className={`topo-fullscreen ${uploaded ? 'topo-fullscreen--visible' : ''}`}>
                <DashboardScene />
                <div className="topo-vignette" />
                <div className="topo-top-label">Network Topology</div>
            </div>

            {/* Top bar */}
            <div className="upload-topbar">
                <button className="upload-glass-btn" onClick={() => navigate('/')}>
                    ← Home
                </button>
                <button className="upload-glass-btn upload-glass-btn--primary" onClick={() => navigate('/dashboard')}>
                    ◈ Dashboard
                </button>
            </div>

            {/* Upload card — centered initially, bottom-left after upload */}
            <div className={`upload-overlay ${uploaded ? 'upload-overlay--bottom-left' : ''}`}>
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
                                <button className="glass-cta glass-cta--outline" onClick={() => navigate('/dashboard')}>
                                    ◈ Dashboard
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
