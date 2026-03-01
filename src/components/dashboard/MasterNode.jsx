import { useRef, useMemo } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import masterImg from '../../master.png'

/**
 * MasterNode — Central metadata server node.
 * Renders master.png as a billboard sprite with animated pulse, rotating energy halo, and label.
 * @param {{ highlighted: boolean }} props
 */
export default function MasterNode({ highlighted = false }) {
    const groupRef = useRef()
    const spriteRef = useRef()
    const haloRef = useRef()
    const pulseRef = useRef()
    const highlightRef = useRef(0)

    /* Load master texture */
    const texture = useLoader(THREE.TextureLoader, masterImg)

    /* Sprite material with master texture */
    const spriteMat = useMemo(() => {
        const mat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.05,
            depthWrite: false,
        })
        return mat
    }, [texture])

    /* Memoised geometry + materials */
    const haloGeo = useMemo(() => new THREE.TorusGeometry(1.1, 0.025, 16, 100), [])
    const pulseGeo = useMemo(() => new THREE.SphereGeometry(0.85, 32, 32), [])

    const haloMat = useMemo(
        () =>
            new THREE.MeshBasicMaterial({
                color: new THREE.Color('#4499ff'),
                transparent: true,
                opacity: 0.6,
            }),
        []
    )

    const pulseMat = useMemo(
        () =>
            new THREE.MeshBasicMaterial({
                color: new THREE.Color('#4499ff'),
                transparent: true,
                opacity: 0.0,
                side: THREE.BackSide,
            }),
        []
    )

    useFrame(({ clock }, delta) => {
        const t = clock.getElapsedTime()

        /* Smoothly interpolate highlight factor */
        const targetH = highlighted ? 1 : 0
        highlightRef.current += (targetH - highlightRef.current) * Math.min(delta * 4, 1)
        const h = highlightRef.current

        /* Sprite scale — bigger than storage nodes, slight pulse */
        if (spriteRef.current) {
            const baseScale = 1.6
            const breathe = Math.sin(t * 0.8) * 0.04
            const s = baseScale + breathe + h * 0.25
            spriteRef.current.scale.set(s, s, s)
            spriteMat.opacity = 0.9 + h * 0.1
        }

        /* Halo rotation — tilted ring orbiting the sprite */
        if (haloRef.current) {
            haloRef.current.rotation.x = Math.PI / 2.8
            haloRef.current.rotation.z += delta * (0.5 + h * 1.2)
            haloMat.opacity = 0.6 + h * 0.35
        }

        /* Pulsing glow effect — more intense when highlighted */
        if (pulseRef.current) {
            const pulse = Math.sin(t * (1.5 + h * 2)) * 0.5 + 0.5
            pulseRef.current.scale.setScalar(1 + pulse * (0.3 + h * 0.35))
            pulseMat.opacity = 0.08 + pulse * 0.12 + h * 0.15
        }

        /* Gentle floating */
        if (groupRef.current) {
            groupRef.current.position.y = Math.sin(t * 0.5) * 0.12
        }
    })

    return (
        <group ref={groupRef} position={[0, 0, 0]}>
            {/* Master sprite */}
            <sprite
                ref={spriteRef}
                material={spriteMat}
                scale={[1.6, 1.6, 1.6]}
            />

            {/* Pulse aura */}
            <mesh ref={pulseRef} geometry={pulseGeo} material={pulseMat} />

            {/* Rotating energy halo */}
            <mesh ref={haloRef} geometry={haloGeo} material={haloMat} />

            {/* Point light emanating from master — brighter when highlighted */}
            <pointLight color="#4499ff" intensity={3 + highlightRef.current * 6} distance={12} />
        </group>
    )
}
