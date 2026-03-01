import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'

/**
 * ConnectionLines — Glowing animated lines from master node (origin) to each orbital node.
 * - Thicker base lines for visibility
 * - Chunk transfer particles travel along lines when transferActive
 * - Upload: master → node direction | Download: node → master direction
 *
 * @param {{ positions, statuses, highlightedIndices, transferActive, transferDirection }} props
 */
export default function ConnectionLines({
    positions,
    statuses,
    highlightedIndices = [],
    transferActive = false,
    transferDirection = 'upload', // 'upload' = master→node, 'download' = node→master
}) {
    const highlightSet = useMemo(() => new Set(highlightedIndices), [highlightedIndices])

    return (
        <group>
            {positions.map((pos, i) => (
                <ConnectionLine
                    key={i}
                    target={pos}
                    status={statuses[i]}
                    highlighted={highlightSet.has(i)}
                    transferActive={transferActive}
                    transferDirection={transferDirection}
                />
            ))}
        </group>
    )
}

/* Colour for connection based on node status */
const LINE_COLOURS = {
    online: '#00ff55',
    offline: '#ff2222',
    warning: '#ff8800',
    maintenance: '#e8a317',
}

const HIGHLIGHT_COLOUR = '#66ddff'
const TRANSFER_COLOUR = '#44ff88'

function ConnectionLine({ target, status, highlighted, transferActive, transferDirection }) {
    const colour = highlighted ? HIGHLIGHT_COLOUR : (LINE_COLOURS[status] || LINE_COLOURS.online)
    const pulseRef = useRef()
    const transferPulseRefs = [useRef(), useRef(), useRef()] // 3 data particles for transfer

    /* Build curve — slight arc from origin to target */
    const curve = useMemo(() => {
        const start = new THREE.Vector3(0, 0, 0)
        const end = new THREE.Vector3(...target)
        const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
        mid.y += 0.6
        return new THREE.QuadraticBezierCurve3(start, mid, end)
    }, [target])

    const curvePoints = useMemo(() => {
        return curve.getPoints(50).map((p) => [p.x, p.y, p.z])
    }, [curve])

    /* Highlight data pulse */
    const pulseMat = useMemo(
        () => new THREE.MeshBasicMaterial({
            color: new THREE.Color(HIGHLIGHT_COLOUR),
            transparent: true,
            opacity: 0.9,
        }),
        []
    )
    const pulseGeo = useMemo(() => new THREE.SphereGeometry(0.07, 12, 12), [])

    /* Transfer data particles */
    const transferMats = useMemo(() => [
        new THREE.MeshBasicMaterial({ color: new THREE.Color(TRANSFER_COLOUR), transparent: true, opacity: 0.8 }),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#88ffcc'), transparent: true, opacity: 0.7 }),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#aaffdd'), transparent: true, opacity: 0.6 }),
    ], [])
    const transferGeo = useMemo(() => new THREE.SphereGeometry(0.05, 8, 8), [])

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime()

        /* Highlight pulse */
        if (pulseRef.current && highlighted) {
            const progress = (t * 0.6) % 1
            const point = curve.getPoint(progress)
            pulseRef.current.position.copy(point)
            pulseRef.current.visible = true
            const glow = Math.sin(t * 8) * 0.3 + 0.7
            pulseMat.opacity = glow
        } else if (pulseRef.current) {
            pulseRef.current.visible = false
        }

        /* Transfer chunk particles — 3 staggered particles */
        if (transferActive && status === 'online') {
            transferPulseRefs.forEach((ref, idx) => {
                if (!ref.current) return
                ref.current.visible = true
                const offset = idx * 0.33
                let progress = ((t * 0.8) + offset) % 1
                // Reverse direction for download
                if (transferDirection === 'download') progress = 1 - progress
                const point = curve.getPoint(progress)
                ref.current.position.copy(point)
                const glow = Math.sin(t * 6 + idx * 2) * 0.2 + 0.8
                transferMats[idx].opacity = glow
            })
        } else {
            transferPulseRefs.forEach((ref) => {
                if (ref.current) ref.current.visible = false
            })
        }
    })

    return (
        <group>
            <Line
                points={curvePoints}
                color={colour}
                lineWidth={highlighted ? 4 : (status === 'offline' ? 1.5 : 2.5)}
                transparent
                opacity={highlighted ? 0.9 : (status === 'offline' ? 0.35 : 0.65)}
                dashed={!highlighted && !transferActive}
                dashSize={0.15}
                gapSize={0.08}
            />
            {/* Highlight data pulse */}
            <mesh ref={pulseRef} geometry={pulseGeo} material={pulseMat} visible={false} />
            {/* Transfer chunk particles */}
            {transferPulseRefs.map((ref, i) => (
                <mesh key={i} ref={ref} geometry={transferGeo} material={transferMats[i]} visible={false} />
            ))}
        </group>
    )
}
