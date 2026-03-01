/**
 * dashboardData.js — Utility functions for the dashboard.
 * Mock data exports removed — data now comes from the live backend API.
 */

/* ---- Streaming log generator (ambient filler) ---- */
const LOG_TEMPLATES = [
    { level: 'INFO', msg: 'Heartbeat received from node {node}.' },
    { level: 'INFO', msg: 'Chunk replication verified for block #{block}.' },
    { level: 'INFO', msg: 'Read request served — file {file} from node {node}.' },
    { level: 'WARN', msg: 'Latency spike detected on node {node}: {ms}ms.' },
    { level: 'INFO', msg: 'Write operation completed — {chunks} chunks distributed.' },
    { level: 'INFO', msg: 'Health check passed for node {node}.' },
]

const NODE_NAMES = ['1', '2', '3', '4', '5', '6', '7', '8']
const FILE_NAMES = ['report_2026.pdf', 'cosmos_4k.mp4', 'research_data.csv', 'config.yaml']

export function generateLogEntry() {
    const template = LOG_TEMPLATES[Math.floor(Math.random() * LOG_TEMPLATES.length)]
    const now = new Date()
    const time = now.toTimeString().slice(0, 8)
    const msg = template.msg
        .replace('{node}', NODE_NAMES[Math.floor(Math.random() * NODE_NAMES.length)])
        .replace('{file}', FILE_NAMES[Math.floor(Math.random() * FILE_NAMES.length)])
        .replace('{block}', String(Math.floor(Math.random() * 9000) + 1000))
        .replace('{ms}', String(Math.floor(Math.random() * 200) + 50))
        .replace('{chunks}', String(Math.floor(Math.random() * 8) + 1))
    return { time, level: template.level, msg }
}

/* ---- Node angular positions for 3D layout ---- */
export function getNodePositions(count, radius = 4) {
    const positions = []
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2
        positions.push([
            Math.cos(angle) * radius,
            (Math.random() - 0.5) * 0.6,
            Math.sin(angle) * radius,
        ])
    }
    return positions
}
