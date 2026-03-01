import { useRef, useState, useMemo, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * OrbitingParticles — Instanced particles orbiting the planet.
 * Uses InstancedMesh for maximum draw-call efficiency.
 */
function OrbitingParticles({ count = 60, radius = 2.2 }) {
    const meshRef = useRef()
    const dummy = useMemo(() => new THREE.Object3D(), [])

    /* Pre-compute orbital parameters once */
    const particles = useMemo(() => {
        const arr = []
        for (let i = 0; i < count; i++) {
            arr.push({
                angle: Math.random() * Math.PI * 2,
                speed: 0.15 + Math.random() * 0.35,
                r: radius + (Math.random() - 0.5) * 0.8,
                yOffset: (Math.random() - 0.5) * 1.6,
                scale: 0.015 + Math.random() * 0.025,
            })
        }
        return arr
    }, [count, radius])

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime()
        const mesh = meshRef.current
        if (!mesh) return

        for (let i = 0; i < count; i++) {
            const p = particles[i]
            const a = p.angle + t * p.speed
            dummy.position.set(
                Math.cos(a) * p.r,
                p.yOffset + Math.sin(t * p.speed * 0.7) * 0.15,
                Math.sin(a) * p.r
            )
            dummy.scale.setScalar(p.scale)
            dummy.updateMatrix()
            mesh.setMatrixAt(i, dummy.matrix)
        }
        mesh.instanceMatrix.needsUpdate = true
    })

    return (
        <instancedMesh ref={meshRef} args={[null, null, count]}>
            <sphereGeometry args={[1, 6, 6]} />
            <meshBasicMaterial color="#88ccff" transparent opacity={0.7} />
        </instancedMesh>
    )
}

/**
 * Planet — Hero 3D sphere with emissive glow, floating sin/cos motion,
 * hover scale-up, click callback, and orbiting particles.
 * All geometry/material memoized for 60fps.
 */
export default function Planet({ onClick }) {
    const groupRef = useRef()
    const meshRef = useRef()
    const glowRef = useRef()
    const [hovered, setHovered] = useState(false)

    /* Responsive scale — smaller on narrow viewports */
    const baseScale = useMemo(() => {
        if (typeof window === 'undefined') return 1.5
        const w = window.innerWidth
        if (w < 480) return 0.85
        if (w < 768) return 1.1
        return 1.5
    }, [])

    /* Memoised geometry + materials — never recreated */
    const planetGeo = useMemo(() => new THREE.SphereGeometry(1, 64, 64), [])
    const glowGeo = useMemo(() => new THREE.SphereGeometry(1.18, 32, 32), [])

    const planetMat = useMemo(
        () =>
            new THREE.MeshStandardMaterial({
                color: new THREE.Color('#1a3a6a'),
                emissive: new THREE.Color('#0055ff'),
                emissiveIntensity: 0.35,
                roughness: 0.55,
                metalness: 0.3,
            }),
        []
    )

    const glowMat = useMemo(
        () =>
            new THREE.MeshBasicMaterial({
                color: new THREE.Color('#2266dd'),
                transparent: true,
                opacity: 0.08,
                side: THREE.BackSide,
            }),
        []
    )

    /* Interpolation targets */
    const targetScale = useRef(baseScale)
    const targetEmissive = useRef(0.35)

    /* Hover handlers */
    const handlePointerOver = useCallback(() => {
        setHovered(true)
        document.body.style.cursor = 'pointer'
    }, [])

    const handlePointerOut = useCallback(() => {
        setHovered(false)
        document.body.style.cursor = 'auto'
    }, [])

    const handleClick = useCallback(() => {
        if (onClick) onClick()
    }, [onClick])

    useFrame(({ clock }, delta) => {
        const t = clock.getElapsedTime()

        /* Floating bob motion */
        if (groupRef.current) {
            groupRef.current.position.y = Math.sin(t * 0.6) * 0.25
            groupRef.current.position.x = Math.cos(t * 0.4) * 0.1
        }

        /* Slow self rotation */
        if (meshRef.current) {
            meshRef.current.rotation.y += delta * 0.18
            meshRef.current.rotation.x += delta * 0.05
        }

        /* Smooth hover scale interpolation */
        targetScale.current = hovered ? baseScale * 1.15 : baseScale
        targetEmissive.current = hovered ? 0.8 : 0.35

        if (groupRef.current) {
            const s = groupRef.current.scale.x
            const newS = THREE.MathUtils.lerp(s, targetScale.current, delta * 4)
            groupRef.current.scale.setScalar(newS)
        }

        /* Smooth emissive intensity transition */
        if (planetMat) {
            planetMat.emissiveIntensity = THREE.MathUtils.lerp(
                planetMat.emissiveIntensity,
                targetEmissive.current,
                delta * 4
            )
        }
    })

    return (
        <group ref={groupRef} scale={baseScale}>
            {/* Main planet sphere */}
            <mesh
                ref={meshRef}
                geometry={planetGeo}
                material={planetMat}
                onPointerOver={handlePointerOver}
                onPointerOut={handlePointerOut}
                onClick={handleClick}
            />

            {/* Outer glow shell */}
            <mesh geometry={glowGeo} material={glowMat} ref={glowRef} />

            {/* Orbiting particles */}
            <OrbitingParticles />
        </group>
    )
}
