import { useCallback } from 'react'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import SpaceScene from './components/SpaceScene'
import Dashboard from './components/Dashboard'
import UploadExplorer from './components/UploadExplorer'
import './styles.css'

const FEATURES = [
  { icon: '🚀', title: 'Distributed File Chunking', desc: 'Files are split into smaller chunks for efficient and scalable storage.' },
  { icon: '🛰', title: 'Multi-Node Storage Simulation', desc: 'Data is distributed across multiple simulated satellite nodes.' },
  { icon: '⚖', title: 'Smart Load Distribution', desc: 'Chunks are evenly allocated to ensure balanced storage usage.' },
  { icon: '📍', title: 'Metadata Tracking', desc: 'Tracks chunk locations for accurate file reconstruction.' },
  { icon: '🔄', title: 'Seamless File Reconstruction', desc: 'Reassembles all chunks to restore the original file on request.' },
  { icon: '⚠', title: 'Node Failure Simulation', desc: 'Simulate node outages to demonstrate system resilience.' },
  { icon: '🔐', title: 'Integrity Verification', desc: 'Checksum validation ensures secure and corruption-free data retrieval.' },
]

/**
 * HomeNavbar — Top bar matching dashboard aesthetic, without stats.
 */
function HomeNavbar({ onLaunch }) {
  return (
    <nav className="home-navbar">
      <div className="dash-nav-brand">
        <span className="dash-nav-icon">◈</span>
        <span className="dash-nav-title">COSMOS <span className="nav-accent">DFS</span></span>
      </div>
      <button className="hero-cta hero-cta--nav" onClick={onLaunch}>
        Launch Dashboard
      </button>
    </nav>
  )
}

/**
 * HomePage — Cosmic hero landing page with scrollable features section.
 * CTA navigates to /dashboard.
 */
function HomePage() {
  const navigate = useNavigate()

  const handleLaunch = useCallback(() => {
    navigate('/dashboard')
  }, [navigate])

  return (
    <div className="home-page">
      {/* Navbar — fixed at top */}
      <HomeNavbar onLaunch={handleLaunch} />

      {/* Scrollable content layer */}
      <div className="home-scroll">
        {/* Hero — full viewport, contains the 3D scene + planet */}
        <section className="hero-section">
          {/* 3D scene confined to hero only */}
          <SpaceScene onPlanetClick={handleLaunch} />

          <div className="hero-overlay">
            <h1 className="hero-heading">
              Explore the <span className="accent">Cosmos</span>
            </h1>
            <p className="hero-tagline">
              A journey beyond the stars — built for the future.
            </p>
            <button className="hero-cta" onClick={handleLaunch}>
              Launch Dashboard
            </button>
            <button className="hero-cta hero-cta--checkout" onClick={() => navigate('/upload')}>
              Check out →
            </button>
          </div>
          <div className="scroll-hint">
            <span className="scroll-arrow">↓</span>
            <span className="scroll-text">Scroll to explore</span>
          </div>
        </section>

        {/* Features section */}
        <section className="features-section">
          <h2 className="features-heading">
            Powerful <span className="accent">Features</span>
          </h2>
          <p className="features-subtitle">
            A next-generation distributed file system built for resilience, efficiency, and scale.
          </p>
          <div className="features-grid">
            {FEATURES.map((f, i) => (
              <div className="feature-card" key={i} style={{ animationDelay: `${i * 0.08}s` }}>
                <span className="feature-icon">{f.icon}</span>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

/**
 * App — Root component with routing.
 * /          → Cosmic hero landing
 * /dashboard → Distributed storage dashboard
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/upload" element={<UploadExplorer />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  )
}
