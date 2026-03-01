import { createContext, useContext, useState, useCallback } from 'react'

const FileSelectionContext = createContext(null)

/**
 * Provider — wraps the dashboard so FileManager and DashboardScene can share:
 *   - selectedFile: { file_id, original_name, chunks: [...] } or null
 *   - transferState: { active, direction } for chunk transfer animation
 */
export function FileSelectionProvider({ children }) {
    const [selectedFile, setSelectedFile] = useState(null)
    const [transferState, setTransferState] = useState({ active: false, direction: 'upload' })

    const selectFile = useCallback((file) => {
        setSelectedFile((prev) => (prev?.file_id === file?.file_id ? null : file)) // toggle
    }, [])

    const clearFile = useCallback(() => setSelectedFile(null), [])

    /** Trigger chunk transfer animation for a duration */
    const triggerTransfer = useCallback((direction = 'upload', durationMs = 4000) => {
        setTransferState({ active: true, direction })
        setTimeout(() => {
            setTransferState({ active: false, direction: 'upload' })
        }, durationMs)
    }, [])

    return (
        <FileSelectionContext.Provider value={{ selectedFile, selectFile, clearFile, transferState, triggerTransfer }}>
            {children}
        </FileSelectionContext.Provider>
    )
}

/**
 * Hook — consume file selection state.
 */
export function useFileSelection() {
    const ctx = useContext(FileSelectionContext)
    if (!ctx) throw new Error('useFileSelection must be used within FileSelectionProvider')
    return ctx
}
