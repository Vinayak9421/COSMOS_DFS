/**
 * api.js — Reusable API service layer for COSMEON FS-LITE backend.
 * All endpoints target the FastAPI backend at localhost:8000.
 * Includes JWT auth, timeout, defensive parsing, and AbortController support.
 */

const API_BASE = 'http://localhost:8000/api/v1'
const REQUEST_TIMEOUT_MS = 15000
const DOWNLOAD_TIMEOUT_MS = 120000 // 2 min for file downloads (reconstruction can be slow)

/** Token getter — wired up by AuthContext on mount */
let _getToken = () => null

export function setTokenGetter(fn) {
    _getToken = fn
}

/* ────────────────── Helpers ────────────────── */

function buildHeaders(extra = {}) {
    const headers = { ...extra }
    const token = _getToken()
    if (token) {
        headers['Authorization'] = `Bearer ${token}`
    }
    return headers
}

async function request(path, options = {}) {
    const { timeout: customTimeout, ...fetchOptions } = options
    const controller = new AbortController()
    const timeout = customTimeout || REQUEST_TIMEOUT_MS
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
        const res = await fetch(`${API_BASE}${path}`, {
            ...fetchOptions,
            signal: fetchOptions.signal || controller.signal,
            headers: {
                ...buildHeaders(),
                ...(fetchOptions.headers || {}),
            },
        })

        clearTimeout(timeoutId)

        if (!res.ok) {
            let detail = `Request failed: ${res.status}`
            try {
                const body = await res.json()
                if (body && body.detail) detail = body.detail
            } catch { /* response body wasn't JSON */ }
            const err = new Error(detail)
            err.status = res.status
            throw err
        }
        return res
    } catch (err) {
        clearTimeout(timeoutId)
        if (err.name === 'AbortError') {
            throw new Error('Request timed out — backend may be unreachable')
        }
        throw err
    }
}

async function json(path, options) {
    const res = await request(path, options)
    try {
        return await res.json()
    } catch {
        return {}
    }
}

/* ────────────────── Auth ────────────────── */

/** POST /auth/login — OAuth2 form-encoded login */
export async function login(username, password) {
    const body = new URLSearchParams()
    body.append('username', username)
    body.append('password', password)

    const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    })

    if (!res.ok) {
        let detail = 'Login failed'
        try {
            const data = await res.json()
            if (data && data.detail) detail = data.detail
        } catch { /* no JSON body */ }
        throw new Error(detail)
    }

    return res.json()
}

/** POST /auth/register — JSON body (now includes security Q&A) */
export async function register(username, email, password, securityQuestion, securityAnswer) {
    const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username,
            email,
            password,
            security_question: securityQuestion,
            security_answer: securityAnswer,
        }),
    })

    if (!res.ok) {
        let detail = 'Registration failed'
        try {
            const data = await res.json()
            if (data && data.detail) detail = data.detail
        } catch { /* no JSON body */ }
        throw new Error(detail)
    }

    return res.json()
}

/** GET /auth/me — returns current user profile */
export async function getMe() {
    return json('/auth/me')
}

/* ────────────────── Security Q&A (Forgot Password) ────────────────── */

/** GET /auth/security-question/{username} → { username, question } */
export async function getSecurityQuestion(username) {
    return json(`/auth/security-question/${encodeURIComponent(username)}`)
}

/** POST /auth/verify-security → { verified, reset_token } */
export async function verifySecurityAnswer(username, answer) {
    return json('/auth/verify-security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, answer }),
    })
}

/** POST /auth/reset-password → { success, message } */
export async function resetPassword(username, resetToken, newPassword) {
    return json('/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username,
            reset_token: resetToken,
            new_password: newPassword,
        }),
    })
}

/* ────────────────── Files ────────────────── */

/** GET /files/list → { files: [...] } */
export async function listFiles() {
    return json('/files/list')
}

/** POST /files/upload (multipart) → { success, uploaded, failed } */
export async function uploadFile(file) {
    const form = new FormData()
    form.append('files', file)
    // Don't set Content-Type — browser sets it with boundary for multipart
    return json('/files/upload', { method: 'POST', body: form })
}

/** POST /files/upload with multiple files */
export async function uploadFiles(fileList) {
    const form = new FormData()
    for (const f of fileList) form.append('files', f)
    return json('/files/upload', { method: 'POST', body: form })
}

/** DELETE /files/{file_id} → { success, data } */
export async function deleteFile(fileId) {
    return json(`/files/${fileId}`, { method: 'DELETE' })
}

/** GET /files/versions/{filename} → { filename, total_versions, versions } */
export async function getFileVersions(filename) {
    return json(`/files/versions/${encodeURIComponent(filename)}`)
}

/** GET /files/by-name/{filename}?version=N → Blob download */
export async function downloadFileByName(filename, version = null) {
    const qs = version != null ? `?version=${version}` : ''
    const res = await request(`/files/by-name/${encodeURIComponent(filename)}${qs}`, {
        timeout: DOWNLOAD_TIMEOUT_MS,
    })
    const blob = await res.blob()
    if (blob.size === 0) throw new Error('Empty file received from server')
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
}

/** GET /files/download/{file_id} → Blob download */
export async function downloadFile(fileId, originalName) {
    const res = await request(`/files/download/${fileId}`, {
        timeout: DOWNLOAD_TIMEOUT_MS,
    })
    const blob = await res.blob()
    if (blob.size === 0) throw new Error('Empty file received from server')
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = originalName || 'download'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
}

/** GET /files/{file_id}/info → file details + chunk map */
export async function getFileInfo(fileId) {
    return json(`/files/${fileId}/info`)
}

/** POST /files/{file_id}/verify → integrity report */
export async function verifyFile(fileId) {
    return json(`/files/${fileId}/verify`, { method: 'POST' })
}

/* ────────────────── Nodes ────────────────── */

/** GET /nodes/ → { nodes: [...] } */
export async function listNodes() {
    return json('/nodes/')
}

/** POST /nodes/{node_id}/kill?hard=false → kill result */
export async function killNode(nodeId, hard = false) {
    return json(`/nodes/${nodeId}/kill?hard=${hard}`, { method: 'POST' })
}

/** POST /nodes/{node_id}/recover → recovery result */
export async function recoverNode(nodeId) {
    return json(`/nodes/${nodeId}/recover`, { method: 'POST' })
}

/** POST /nodes/{node_id}/maintenance → set node to MAINTENANCE */
export async function setNodeMaintenance(nodeId) {
    return json(`/nodes/${nodeId}/maintenance`, { method: 'POST' })
}

/** POST /nodes/{node_id}/activate → bring MAINTENANCE node back ONLINE */
export async function activateNode(nodeId) {
    return json(`/nodes/${nodeId}/activate`, { method: 'POST' })
}

/** GET /nodes/{node_id}/chunks → chunk list */
export async function getNodeChunks(nodeId) {
    return json(`/nodes/${nodeId}/chunks`)
}

/* ────────────────── System ────────────────── */

/** GET /system/health → health summary */
export async function getSystemHealth() {
    return json('/system/health')
}

/** GET /system/stats → detailed stats */
export async function getSystemStats() {
    return json('/system/stats')
}

/** DELETE /system/cache/clear → cache clear confirmation */
export async function clearCache() {
    return json('/system/cache/clear', { method: 'DELETE' })
}
