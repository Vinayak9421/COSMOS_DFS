import { useState } from 'react'
import Navbar from './dashboard/Navbar'
import FileManager from './dashboard/FileManager'
import DashboardScene from './dashboard/DashboardScene'
import NodeStatusPanel from './dashboard/NodeStatusPanel'
import SystemLogs from './dashboard/SystemLogs'
import SystemStats from './dashboard/SystemStats'
import { FileSelectionProvider } from '../context/FileSelectionContext'
import { SystemLogsProvider } from '../context/SystemLogsContext'
import { NodesProvider } from '../context/NodesContext'
import '../dashboard.css'
import '../auth.css'

/**
 * Dashboard — Main dashboard page layout.
 * Wraps children with SystemLogs → Nodes → FileSelection providers so
 * every panel can push real-time logs and share live node data.
 * Supports collapsible panels and an Advanced Section for the right panel.
 */
export default function Dashboard() {
    const [leftOpen, setLeftOpen] = useState(true)
    const [rightOpen, setRightOpen] = useState(false)
    const [logsOpen, setLogsOpen] = useState(true)

    return (
        <SystemLogsProvider>
            <NodesProvider>
                <FileSelectionProvider>
                    <div className="dashboard">
                        {/* Top — Navbar */}
                        <Navbar />

                        {/* Main content area */}
                        <div className="dash-body">
                            {/* Left panel — collapsible file manager */}
                            <aside className={`dash-left ${leftOpen ? '' : 'dash-panel--collapsed'}`}>
                                <button
                                    className="panel-collapse-btn"
                                    onClick={() => setLeftOpen(!leftOpen)}
                                    title={leftOpen ? 'Collapse File Manager' : 'Expand File Manager'}
                                >
                                    <span className="collapse-icon">{leftOpen ? '◂' : '▸'}</span>
                                    {leftOpen && <span className="collapse-label">Files</span>}
                                </button>
                                {leftOpen && <FileManager />}
                            </aside>

                            {/* Center — 3D Network Visualization */}
                            <main className="dash-center">
                                <div className="scene-container">
                                    <div className="scene-label">Network Topology</div>
                                    <DashboardScene />
                                </div>
                            </main>

                            {/* Right panel — Advanced Section toggle */}
                            <aside className={`dash-right ${rightOpen ? '' : 'dash-panel--collapsed'}`}>
                                <button
                                    className="panel-collapse-btn advanced-toggle-btn"
                                    onClick={() => setRightOpen(!rightOpen)}
                                    title={rightOpen ? 'Collapse Advanced' : 'Open Advanced'}
                                >
                                    <span className="collapse-icon">{rightOpen ? '▸' : '◂'}</span>
                                    {!rightOpen && <span className="collapse-label-vertical">Advanced</span>}
                                    {rightOpen && <span className="collapse-label">Advanced</span>}
                                </button>
                                {rightOpen && (
                                    <>
                                        <NodeStatusPanel />
                                        <SystemStats />
                                    </>
                                )}
                            </aside>
                        </div>

                        {/* Bottom — System Logs (collapsible) */}
                        <div className={`dash-bottom ${logsOpen ? '' : 'dash-bottom--collapsed'}`}>
                            <button
                                className="panel-collapse-btn logs-toggle-btn"
                                onClick={() => setLogsOpen(!logsOpen)}
                                title={logsOpen ? 'Collapse Logs' : 'Expand Logs'}
                            >
                                <span className="collapse-icon">{logsOpen ? '▾' : '▴'}</span>
                                <span className="collapse-label">System Logs</span>
                            </button>
                            {logsOpen && <SystemLogs />}
                        </div>
                    </div>
                </FileSelectionProvider>
            </NodesProvider>
        </SystemLogsProvider>
    )
}
