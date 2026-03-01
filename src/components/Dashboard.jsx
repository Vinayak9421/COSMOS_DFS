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

/**
 * Dashboard — Main dashboard page layout.
 * Wraps children with SystemLogs → Nodes → FileSelection providers so
 * every panel can push real-time logs and share live node data.
 */
export default function Dashboard() {
    return (
        <SystemLogsProvider>
            <NodesProvider>
                <FileSelectionProvider>
                    <div className="dashboard">
                        {/* Top — Navbar */}
                        <Navbar />

                        {/* Main content area */}
                        <div className="dash-body">
                            {/* Left panel */}
                            <aside className="dash-left">
                                <FileManager />
                            </aside>

                            {/* Center — 3D Network Visualization */}
                            <main className="dash-center">
                                <div className="scene-container">
                                    <div className="scene-label">Network Topology</div>
                                    <DashboardScene />
                                </div>
                            </main>

                            {/* Right panel */}
                            <aside className="dash-right">
                                <NodeStatusPanel />
                                <SystemStats />
                            </aside>
                        </div>

                        {/* Bottom — System Logs */}
                        <div className="dash-bottom">
                            <SystemLogs />
                        </div>
                    </div>
                </FileSelectionProvider>
            </NodesProvider>
        </SystemLogsProvider>
    )
}
