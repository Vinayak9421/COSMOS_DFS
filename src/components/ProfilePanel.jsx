import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { listFiles, downloadFile } from '../services/api'
import '../auth.css'

/**
 * ProfilePanel — Slide-out panel showing user details, uploaded files,
 * and for admin: all users' files with owner USERNAME (not UUID).
 */
export default function ProfilePanel({ open, onClose }) {
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const [files, setFiles] = useState([])
    const [loading, setLoading] = useState(false)
    const [dlLoading, setDlLoading] = useState(null)

    const isAdmin = user?.role === 'admin'

    const fetchFiles = useCallback(async () => {
        if (!open || !user) return
        setLoading(true)
        try {
            const data = await listFiles()
            setFiles(data.files || [])
        } catch {
            setFiles([])
        } finally {
            setLoading(false)
        }
    }, [open, user])

    useEffect(() => {
        if (open) fetchFiles()
    }, [open, fetchFiles])

    const handleDownload = useCallback(async (f) => {
        setDlLoading(f.file_id)
        try {
            await downloadFile(f.file_id, f.original_name)
        } catch { /* silent */ }
        finally { setDlLoading(null) }
    }, [])

    const handleLogout = useCallback(() => {
        onClose()
        logout()
        navigate('/login')
    }, [logout, navigate, onClose])

    if (!open) return null

    const formatSize = (bytes) => {
        if (!bytes && bytes !== 0) return '—'
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
        return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
    }

    /* Separate own files vs others for admin */
    const ownFiles = isAdmin
        ? files.filter(f => f.owner_id === user.id)
        : files
    const otherFiles = isAdmin
        ? files.filter(f => f.owner_id !== user.id)
        : []

    const totalSize = files.reduce((sum, f) => sum + (f.file_size || 0), 0)
    const ownSize = ownFiles.reduce((sum, f) => sum + (f.file_size || 0), 0)

    const roleClass = isAdmin ? 'auth-role-badge--admin' : 'auth-role-badge--user'

    return (
        <div className="profile-overlay">
            <div className="profile-backdrop" onClick={onClose} />
            <div className="profile-panel">
                {/* Header */}
                <div className="profile-header">
                    <span className="profile-title">Profile</span>
                    <button className="profile-close-btn" onClick={onClose}>✕</button>
                </div>

                {/* User card */}
                <div className="profile-user-card">
                    <div className="profile-user-avatar">
                        {(user?.username || '?')[0]}
                    </div>
                    <div className="profile-user-info">
                        <div className="profile-user-name">
                            {user?.username}
                            <span className={`auth-role-badge ${roleClass}`}>{user?.role}</span>
                        </div>
                        <div className="profile-user-email">{user?.email}</div>
                    </div>
                </div>

                {/* Stats */}
                <div className="profile-stats-row">
                    <div className="profile-stat-card">
                        <div className="profile-stat-value">{isAdmin ? files.length : ownFiles.length}</div>
                        <div className="profile-stat-label">{isAdmin ? 'Total Files' : 'Files'}</div>
                    </div>
                    <div className="profile-stat-card">
                        <div className="profile-stat-value">{formatSize(isAdmin ? totalSize : ownSize)}</div>
                        <div className="profile-stat-label">{isAdmin ? 'Total Size' : 'Size'}</div>
                    </div>
                    <div className="profile-stat-card">
                        <div className="profile-stat-value">{isAdmin ? ownFiles.length : files.reduce((s, f) => s + (f.total_chunks || 0), 0)}</div>
                        <div className="profile-stat-label">{isAdmin ? 'My Files' : 'Chunks'}</div>
                    </div>
                </div>

                {loading ? (
                    <div className="profile-loading">Loading files…</div>
                ) : (
                    <>
                        {/* My Files */}
                        <div className="profile-section-title">
                            {isAdmin ? 'My Uploaded Files' : 'My Files'}
                        </div>
                        {ownFiles.length === 0 ? (
                            <div className="profile-empty">No files uploaded yet</div>
                        ) : (
                            <div className="profile-table-container">
                                <table className="profile-files-table">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Size</th>
                                            <th>Chunks</th>
                                            <th>Status</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ownFiles.map(f => (
                                            <tr key={f.file_id}>
                                                <td>{f.original_name}</td>
                                                <td className="mono">{formatSize(f.file_size)}</td>
                                                <td>{f.total_chunks}</td>
                                                <td>
                                                    <span className={`profile-file-status profile-file-status--${(f.status || 'active').toLowerCase()}`}>
                                                        {f.status || 'ACTIVE'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <button
                                                        className="profile-dl-btn"
                                                        onClick={() => handleDownload(f)}
                                                        disabled={dlLoading === f.file_id}
                                                        title="Download"
                                                    >
                                                        {dlLoading === f.file_id ? '⟳' : '⬇'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Admin: All Users' Files — now shows usernames! */}
                        {isAdmin && (
                            <div className="profile-admin-section">
                                <div className="profile-section-title">All Users' Files</div>
                                {otherFiles.length === 0 ? (
                                    <div className="profile-empty">No files uploaded by other users</div>
                                ) : (
                                    <div className="profile-table-container">
                                        <table className="profile-files-table">
                                            <thead>
                                                <tr>
                                                    <th>Name</th>
                                                    <th>Size</th>
                                                    <th>Chunks</th>
                                                    <th>Owner</th>
                                                    <th>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {otherFiles.map(f => (
                                                    <tr key={f.file_id}>
                                                        <td>{f.original_name}</td>
                                                        <td className="mono">{formatSize(f.file_size)}</td>
                                                        <td>{f.total_chunks}</td>
                                                        <td>
                                                            <span className="profile-owner-badge">
                                                                {f.owner_username || f.owner_id?.slice(0, 8) + '…'}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <span className={`profile-file-status profile-file-status--${(f.status || 'active').toLowerCase()}`}>
                                                                {f.status || 'ACTIVE'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

                {/* Actions */}
                <div className="profile-actions-row">
                    {isAdmin && (
                        <button
                            className="profile-action-btn profile-action-btn--primary"
                            onClick={() => { onClose(); navigate('/dashboard') }}
                        >
                            ◈ Dashboard
                        </button>
                    )}
                    <button
                        className="profile-action-btn profile-action-btn--outline"
                        onClick={() => { onClose(); navigate('/upload') }}
                    >
                        ⬆ Upload
                    </button>
                    <button
                        className="profile-action-btn profile-action-btn--danger"
                        onClick={handleLogout}
                    >
                        ⏻ Logout
                    </button>
                </div>
            </div>
        </div>
    )
}
