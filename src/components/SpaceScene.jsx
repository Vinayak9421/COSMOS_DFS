import { Suspense, useRef, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import StarsBackground from './StarsBackground'
import Planet from './Planet'

/**
 * CameraRig — Mouse-based parallax camera movement with smooth lerp.
 * Movement is clamped for mobile / touch safety.
 */
function CameraRig() {
    const { camera } = useThree()
    const mouse = useRef({ x: 0, y: 0 })

    /* Track pointer across viewport */
    const onPointerMove = useCallback((e) => {
        /* Normalise to -1…1 range */
        mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1
        mouse.current.y = -(e.clientY / window.innerHeight) * 2 + 1
    }, [])

    /* Attach listener once */
    if (typeof window !== 'undefined') {
        window.onpointermove = onPointerMove
    }

    useFrame((_, delta) => {
        /* Parallax range clamped to ±1.2 units */
        const targetX = THREE.MathUtils.clamp(mouse.current.x * 1.2, -1.2, 1.2)
        const targetY = THREE.MathUtils.clamp(mouse.current.y * 0.8, -0.8, 0.8)

        camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, delta * 2)
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, delta * 2)
        camera.lookAt(0, 0, 0)
    })

    return null
}

/**
 * RotatingLight — Point light orbiting the scene for dynamic shading on the planet.
 */
function RotatingLight() {
    const lightRef = useRef()

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime()
        if (lightRef.current) {
            lightRef.current.position.x = Math.cos(t * 0.3) * 5
            lightRef.current.position.z = Math.sin(t * 0.3) * 5
            lightRef.current.position.y = Math.sin(t * 0.2) * 2
        }
    })

    return <pointLight ref={lightRef} color="#6699ff" intensity={2.5} distance={20} />
}

/**
 * SpaceScene — Isolated <Canvas> container.
 * All Three.js content lives here; no DOM inside Canvas.
 */
export default function SpaceScene({ onPlanetClick }) {
    return (
        <Canvas
            camera={{ position: [0, 0, 6], fov: 55 }}
            dpr={[1, 1.5]}
            gl={{
                antialias: true,
                alpha: true,
                powerPreference: 'high-performance',
            }}
            onCreated={({ gl }) => {
                gl.setClearColor(0x000000, 0)
            }}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: 0,
            }}
        >
            {/* Ambient fog for depth — matches page bg */}
            <fog attach="fog" args={['#050510', 8, 30]} />

            {/* Base lighting */}
            <ambientLight intensity={0.15} />
            <directionalLight position={[3, 2, 4]} intensity={0.6} color="#aaccff" />

            {/* Orbiting dynamic light */}
            <RotatingLight />

            {/* Camera parallax rig */}
            <CameraRig />

            <Suspense fallback={null}>
                {/* Starfield background */}
                <StarsBackground />

                {/* Hero planet */}
                <Planet onClick={onPlanetClick} />
            </Suspense>
        </Canvas>
    )
}
