import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import * as THREE from 'three'

/**
 * StarsBackground — Animated starfield with depth-based parallax and slow Z rotation.
 * Reduces star count on narrow viewports for mobile performance.
 */
export default function StarsBackground() {
  const groupRef = useRef()

  /* Responsive star count — fewer on mobile */
  const starCount = useMemo(() => {
    if (typeof window === 'undefined') return 4000
    return window.innerWidth < 768 ? 2000 : 5000
  }, [])

  /* Slow Z-axis rotation for ambient motion */
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.z += delta * 0.015
    }
  })

  return (
    <group ref={groupRef}>
      {/* Primary star layer — close, small, fast rotation illusion */}
      <Stars
        radius={80}
        depth={60}
        count={starCount}
        factor={4}
        saturation={0.1}
        fade
        speed={0.8}
      />

      {/* Secondary layer — far, large, creates depth parallax */}
      <Stars
        radius={150}
        depth={100}
        count={Math.floor(starCount * 0.4)}
        factor={7}
        saturation={0}
        fade
        speed={0.3}
      />
    </group>
  )
}
