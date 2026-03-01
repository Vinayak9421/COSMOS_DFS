import { useRef, useMemo, useState, useCallback } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import satelliteImg from '../../satellite.png'

/**
 * STATUS → GLOW COLOUR MAP
 */
const STATUS_COLOURS = {
    online: '#00cc44',
    offline: '#ff2222',
    warning: '#ff8800',
    maintenance: '#e8a317',
}

/**
 * StorageNode — Satellite node with reduced, subtle glow and name label below.
 */
export default function StorageNode({ id, label, status = 'online', position, highlighted = false, focusPosition = null }) {
    const groupRef = useRef()
    const spriteRef = useRef()
    const glowRef = useRef()
    const highlightRef = useRef(0)
    const hoverRef = useRef(0)
    const animatedPos = useRef(new THREE.Vector3(...position))
    const [hovered, setHovered] = useState(false)

    const glowColour = STATUS_COLOURS[status] || STATUS_COLOURS.online

    const texture = useLoader(THREE.TextureLoader, satelliteImg)

    const spriteMat = useMemo(() => {
        return new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.1,
            depthWrite: false,
        })
    }, [texture])

    /* Single glow ring — subtle */
    const glowGeo = useMemo(() => new THREE.RingGeometry(0.42, 0.50, 32), [])
    const glowMat = useMemo(
        () => new THREE.MeshBasicMaterial({
            color: new THREE.Color(glowColour),
            transparent: true,
            opacity: 0.0,
            side: THREE.DoubleSide,
        }),
        [glowColour]
    )

    const handlePointerOver = useCallback((e) => {
        e.stopPropagation()
        setHovered(true)
        document.body.style.cursor = 'pointer'
    }, [])

    const handlePointerOut = useCallback((e) => {
        e.stopPropagation()
        setHovered(false)
        document.body.style.cursor = 'auto'
    }, [])

    useFrame(({ clock }, delta) => {
        const t = clock.getElapsedTime()

        const targetH = highlighted ? 1 : 0
        highlightRef.current += (targetH - highlightRef.current) * Math.min(delta * 4, 1)
        const h = highlightRef.current

        const targetHov = hovered ? 1 : 0
        hoverRef.current += (targetHov - hoverRef.current) * Math.min(delta * 8, 1)
        const hv = hoverRef.current

        /* Position */
        const targetPos = (highlighted && focusPosition)
            ? new THREE.Vector3(...focusPosition)
            : new THREE.Vector3(...position)
        const lerpSpeed = highlighted ? 2.5 : 3.5
        animatedPos.current.lerp(targetPos, 1 - Math.exp(-lerpSpeed * delta))

        if (groupRef.current) {
            groupRef.current.position.copy(animatedPos.current)
            const bobAmount = highlighted ? 0.03 : 0.1
            groupRef.current.position.y += Math.sin(t * 0.7 + position[0]) * bobAmount
        }

        /* Scale */
        const baseScale = 0.7
        const scale = baseScale + hv * 0.12 + h * 0.4
        if (spriteRef.current) {
            spriteRef.current.scale.set(scale, scale, scale)
        }

        /* Glow ring — very subtle, only on hover or highlight */
        if (glowRef.current) {
            const glowOpacity = Math.max(hv * 0.2, h * 0.4)
            const pulse = (highlighted || hovered) ? Math.sin(t * 2.5) * 0.06 : 0
            glowMat.opacity = glowOpacity + pulse
            const ringScale = 1 + hv * 0.1 + h * 0.3
            glowRef.current.scale.setScalar(ringScale)
            glowRef.current.lookAt(glowRef.current.parent.localToWorld(new THREE.Vector3(0, 0, 10)))
        }

        /* Offline flicker */
        if (spriteRef.current) {
            if (status === 'offline' && !highlighted) {
                const flicker = Math.sin(t * 8) * 0.12 + 0.6
                spriteMat.opacity = flicker
            } else {
                spriteMat.opacity = 0.9 + h * 0.1
            }
        }
    })

    return (
        <group ref={groupRef} position={position}>
            {/* Satellite sprite */}
            <sprite
                ref={spriteRef}
                material={spriteMat}
                scale={[0.7, 0.7, 0.7]}
                onPointerOver={handlePointerOver}
                onPointerOut={handlePointerOut}
            />

            {/* Subtle glow ring */}
            <mesh ref={glowRef} geometry={glowGeo} material={glowMat} />

            {/* Node name label below */}
            <Html
                position={[0, -0.6, 0]}
                center
                distanceFactor={8}
                style={{ pointerEvents: 'none' }}
            >
                <div style={{
                    color: status === 'offline' ? '#ff6666' : status === 'maintenance' ? '#e8a317' : '#88ffaa',
                    fontSize: '10px',
                    fontFamily: "'Outfit', sans-serif",
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    textShadow: `0 0 6px ${glowColour}33`,
                    whiteSpace: 'nowrap',
                    textAlign: 'center',
                    userSelect: 'none',
                }}>
                    {label || id}
                </div>
            </Html>

            {/* Point light — only when highlighted, very subtle otherwise */}
            {highlighted && (
                <pointLight color={glowColour} intensity={2} distance={5} />
            )}
        </group>
    )
}
