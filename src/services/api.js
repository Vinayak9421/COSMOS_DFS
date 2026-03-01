/**
 * api.js — Reusable API service layer for COSMEON FS-LITE backend.
 * All endpoints target the FastAPI backend at localhost:8000.
 */

const API_BASE = 'http://localhost:8000/api/v1'

/* ────────────────── Helpers ────────────────── */

async function request(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, options)
    if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Request failed: ${res.status}`)
    }
    return res
}

async function json(path, options) {
    const res = await request(path, options)
    return res.json()
}

/* ────────────────── Files ────────────────── */

/** GET /files/list → { files: [...] } */
export async function listFiles() {
    return json('/files/list')
}

/** POST /files/upload (multipart) → { success, uploaded, failed } */
export async function uploadFile(file) {
    const form = new FormData()
    // Backend expects field name 'files' (List[UploadFile])
    form.append('files', file)
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
    const res = await request(`/files/by-name/${encodeURIComponent(filename)}${qs}`)
    const blob = await res.blob()
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
    const res = await request(`/files/download/${fileId}`)
    const blob = await res.blob()
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
