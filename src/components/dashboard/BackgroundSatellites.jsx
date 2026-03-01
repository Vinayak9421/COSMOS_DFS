import { useRef, useMemo } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import satelliteImg from '../../satellite.png'

/**
 * Generate random positions on a sphere shell.
 * Satellites sit further out than the main orbital ring.
 */
function randomSpherePositions(count, minR, maxR) {
    const positions = []
    for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        const r = minR + Math.random() * (maxR - minR)
        positions.push([
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.sin(phi) * Math.sin(theta) * 0.5, // flatten y
            r * Math.cos(phi),
        ])
    }
    return positions
}

const SAT_COUNT = 15

/**
 * BackgroundSatellites — Decorative small satellite sprites scattered
 * behind the main ring, each with a faint connection line to the origin (master).
 */
export default function BackgroundSatellites() {
    const positions = useMemo(() => randomSpherePositions(SAT_COUNT, 6.5, 10), [])

    return (
        <group>
            {positions.map((pos, i) => (
                <BackgroundSat key={i} position={pos} index={i} />
            ))}
        </group>
    )
}

function BackgroundSat({ position, index }) {
    const groupRef = useRef()
    const spriteRef = useRef()

    const texture = useLoader(THREE.TextureLoader, satelliteImg)

    const spriteMat = useMemo(() => {
        return new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 0.18 + Math.random() * 0.12,
            alphaTest: 0.05,
            depthWrite: false,
        })
    }, [texture])

    /* Faint connection line curve to origin */
    const curvePoints = useMemo(() => {
        const start = new THREE.Vector3(0, 0, 0)
        const end = new THREE.Vector3(...position)
        const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
        mid.y += 0.3
        const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
        return curve.getPoints(20).map((p) => [p.x, p.y, p.z])
    }, [position])

    /* Slow orbital drift */
    useFrame(({ clock }) => {
        const t = clock.getElapsedTime()
        if (groupRef.current) {
            const speed = 0.03 + index * 0.002
            const angle = t * speed
            const [ox, oy, oz] = position
            const r = Math.sqrt(ox * ox + oz * oz)
            const baseAngle = Math.atan2(oz, ox)
            groupRef.current.position.x = Math.cos(baseAngle + angle) * r
            groupRef.current.position.z = Math.sin(baseAngle + angle) * r
            groupRef.current.position.y = oy + Math.sin(t * 0.3 + index) * 0.15
        }
        if (spriteRef.current) {
            const bob = Math.sin(t * 0.5 + index * 2) * 0.02
            const s = 0.35 + bob
            spriteRef.current.scale.set(s, s, s)
        }
    })

    return (
        <>
            <group ref={groupRef} position={position}>
                <sprite
                    ref={spriteRef}
                    material={spriteMat}
                    scale={[0.35, 0.35, 0.35]}
                    raycast={() => null}
                />
            </group>
            {/* Faint line to master */}
            <Line
                points={curvePoints}
                color="#3366aa"
                lineWidth={0.6}
                transparent
                opacity={0.12}
                dashed
                dashSize={0.2}
                gapSize={0.15}
            />
        </>
    )
}
