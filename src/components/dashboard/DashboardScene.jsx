import { Suspense, useMemo, useRef, useEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Stars, OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import MasterNode from './MasterNode'
import StorageNode from './StorageNode'
import ConnectionLines from './ConnectionLines'
import BackgroundSatellites from './BackgroundSatellites'
import { getNodePositions } from '../../data/dashboardData'
import { useFileSelection } from '../../context/FileSelectionContext'
import { useNodes } from '../../context/NodesContext'

/**
 * Smoothly adjusts OrbitControls camera distance when a file is selected/deselected.
 */
function ZoomController({ active, controlsRef }) {
    const { camera } = useThree()

    useEffect(() => {
        if (!controlsRef.current) return
        const controls = controlsRef.current

        if (active) {
            controls.minDistance = 3
            controls.maxDistance = 14
            const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize()
            const targetPos = controls.target.clone().add(dir.multiplyScalar(5))
            camera.position.lerp(targetPos, 0.3)
        } else {
            controls.minDistance = 3
            controls.maxDistance = 14
        }
    }, [active, camera, controlsRef])

    return null
}

/**
 * Compute a "focus" position that moves a node ~40% closer to the camera.
 */
function computeFocusPosition(originalPos) {
    const orig = new THREE.Vector3(...originalPos)
    const focusTarget = new THREE.Vector3(0, 0.3, 2)
    return orig.clone().lerp(focusTarget, 0.45).toArray()
}

/**
 * ChunkInfoPopup — Floating glassmorphic popup showing chunk distribution
 * when a file is clicked in the FileManager.
 */
function ChunkInfoPopup({ selectedFile, positions, planetNodes }) {
    if (!selectedFile || !selectedFile.chunks || selectedFile.chunks.length === 0) return null

    // Group chunks by node_id
    const chunksByNode = {}
    for (const c of selectedFile.chunks) {
        if (!chunksByNode[c.node_id]) chunksByNode[c.node_id] = []
        chunksByNode[c.node_id].push(c)
    }

    return (
        <>
            {planetNodes.map((node, i) => {
                const nodeChunks = chunksByNode[node.id]
                if (!nodeChunks || nodeChunks.length === 0) return null
                return (
                    <Html
                        key={node.id}
                        position={[positions[i][0], positions[i][1] + 0.85, positions[i][2]]}
                        center
                        distanceFactor={8}
                        style={{ pointerEvents: 'none' }}
                    >
                        <div style={{
                            background: 'rgba(8, 14, 30, 0.65)',
                            backdropFilter: 'blur(16px)',
                            WebkitBackdropFilter: 'blur(16px)',
                            border: '1px solid rgba(100, 180, 255, 0.2)',
                            borderRadius: '10px',
                            padding: '6px 10px',
                            color: '#c8e0ff',
                            fontSize: '10px',
                            fontFamily: "'Outfit', sans-serif",
                            whiteSpace: 'nowrap',
                            boxShadow: '0 0 20px rgba(60, 140, 255, 0.2), 0 0 40px rgba(60, 120, 255, 0.08), inset 0 0 12px rgba(60, 140, 255, 0.05)',
                            animation: 'popupGlow 2s ease-in-out infinite alternate',
                            textAlign: 'center',
                            userSelect: 'none',
                        }}>
                            <div style={{ fontWeight: 700, color: '#88ccff', marginBottom: '2px', fontSize: '11px' }}>
                                {node.label || node.id}
                            </div>
                            <div style={{ color: 'rgba(200, 220, 255, 0.7)' }}>
                                {nodeChunks.length} chunk{nodeChunks.length !== 1 ? 's' : ''}
                                {nodeChunks.some(c => c.is_replica) && (
                                    <span style={{
                                        marginLeft: '4px',
                                        background: 'rgba(255, 170, 51, 0.2)',
                                        color: '#ffaa33',
                                        padding: '1px 4px',
                                        borderRadius: '3px',
                                        fontSize: '8px',
                                        fontWeight: 600,
                                    }}>R</span>
                                )}
                            </div>
                        </div>
                    </Html>
                )
            })}
        </>
    )
}

/**
 * DashboardScene — Isolated <Canvas> for the 3D node-network visualization.
 * Uses live node data from NodesContext.
 * Supports chunk transfer animations and file-click chunk popups.
 */
export default function DashboardScene() {
    const { selectedFile, transferState } = useFileSelection()
    const { nodes } = useNodes()
    const controlsRef = useRef()

    /* Only planet-type nodes (exclude master) */
    const planetNodes = useMemo(
        () => nodes.filter((n) => n.type === 'planet'),
        [nodes]
    )
    const positions = useMemo(
        () => getNodePositions(planetNodes.length, 3.8),
        [planetNodes.length]
    )

    /* Map backend status to display status */
    const statusMap = (s) => {
        const lower = (s || '').toLowerCase()
        if (lower === 'online') return 'online'
        if (lower === 'offline') return 'offline'
        if (lower === 'degraded') return 'warning'
        if (lower === 'maintenance') return 'maintenance'
        return 'offline'
    }

    const statuses = useMemo(
        () => planetNodes.map((n) => statusMap(n.status)),
        [planetNodes]
    )

    /* Determine which nodes are highlighted based on selected file */
    const highlightedNodeIds = useMemo(
        () => (selectedFile?.nodes ? new Set(selectedFile.nodes) : new Set()),
        [selectedFile]
    )
    const highlightedIndices = useMemo(
        () => planetNodes.map((n, i) => highlightedNodeIds.has(n.id)).map((h, i) => (h ? i : -1)).filter((i) => i !== -1),
        [planetNodes, highlightedNodeIds]
    )

    /* Compute focus positions for highlighted nodes */
    const focusPositions = useMemo(
        () => positions.map((pos, i) =>
            highlightedNodeIds.has(planetNodes[i]?.id) ? computeFocusPosition(pos) : null
        ),
        [positions, planetNodes, highlightedNodeIds]
    )

    return (
        <Canvas
            camera={{ position: [0, 3, 8], fov: 50 }}
            dpr={[1, 1.5]}
            gl={{
                antialias: true,
                alpha: true,
                powerPreference: 'high-performance',
            }}
            style={{
                width: '100%',
                height: '100%',
                borderRadius: '12px',
            }}
        >
            {/* Deep space fog */}
            <fog attach="fog" args={['#060612', 6, 25]} />

            {/* Lighting */}
            <ambientLight intensity={0.12} />
            <directionalLight position={[5, 4, 3]} intensity={0.4} color="#aaddff" />

            {/* Interactive orbit controls */}
            <OrbitControls
                ref={controlsRef}
                enablePan={false}
                enableZoom={true}
                enableRotate={true}
                minDistance={3}
                maxDistance={14}
                autoRotate={true}
                autoRotateSpeed={0.4}
                enableDamping={true}
                dampingFactor={0.08}
                rotateSpeed={0.8}
            />

            {/* Subtle zoom when file selected */}
            <ZoomController active={!!selectedFile} controlsRef={controlsRef} />

            <Suspense fallback={null}>
                {/* Background stars */}
                <Stars
                    radius={60}
                    depth={50}
                    count={1500}
                    factor={3}
                    saturation={0.1}
                    fade
                    speed={0.4}
                />

                {/* Background decorative satellites */}
                <BackgroundSatellites />

                {/* Master metadata server — center */}
                <MasterNode highlighted={!!selectedFile || transferState.active} />

                {/* Orbital storage nodes */}
                {planetNodes.map((node, i) => (
                    <StorageNode
                        key={node.id}
                        id={node.id}
                        label={node.label}
                        status={statusMap(node.status)}
                        position={positions[i]}
                        highlighted={highlightedNodeIds.has(node.id)}
                        focusPosition={focusPositions[i]}
                    />
                ))}

                {/* Connection lines from master to each node */}
                <ConnectionLines
                    positions={positions}
                    statuses={statuses}
                    highlightedIndices={highlightedIndices}
                    transferActive={transferState.active}
                    transferDirection={transferState.direction}
                />

                {/* Chunk info popups when file is selected */}
                <ChunkInfoPopup
                    selectedFile={selectedFile}
                    positions={positions}
                    planetNodes={planetNodes}
                />
            </Suspense>
        </Canvas>
    )
}
