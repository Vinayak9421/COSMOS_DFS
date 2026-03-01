import { useCallback, useState } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import SpaceScene from './components/SpaceScene'
import Dashboard from './components/Dashboard'
import UploadExplorer from './components/UploadExplorer'
import AuthPage from './components/AuthPage'
import ProfilePanel from './components/ProfilePanel'
import './styles.css'
import './auth.css'

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
 * ProtectedRoute — redirects to /login if not authenticated.
 */
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div style={{
        width: '100%',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#050510',
        color: 'rgba(180,210,255,0.6)',
        fontFamily: "'Outfit', sans-serif",
        fontSize: '1rem',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 32, height: 32, margin: '0 auto 1rem',
            border: '2px solid rgba(60,120,255,0.2)',
            borderTopColor: '#4488ff',
            borderRadius: '50%',
            animation: 'authSpin 0.7s linear infinite',
          }} />
          Initializing…
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return children
}

/**
 * AdminRoute — only allows admin users, redirects others to home.
 */
function AdminRoute({ children }) {
  const { user, isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div style={{
        width: '100%', height: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#050510', color: 'rgba(180,210,255,0.6)',
        fontFamily: "'Outfit', sans-serif", fontSize: '1rem',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 32, height: 32, margin: '0 auto 1rem',
            border: '2px solid rgba(60,120,255,0.2)',
            borderTopColor: '#4488ff', borderRadius: '50%',
            animation: 'authSpin 0.7s linear infinite',
          }} />
          Initializing…
        </div>
      </div>
    )
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.role !== 'admin') return <Navigate to="/" replace />

  return children
}

/**
 * HomeNavbar — Top bar with profile button (if authenticated) or sign-in button.
 */
function HomeNavbar({ onProfileOpen }) {
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuth()

  return (
    <nav className="home-navbar">
      <div className="dash-nav-brand">
        <span className="dash-nav-icon">◈</span>
        <span className="dash-nav-title">COSMOS <span className="nav-accent">DFS</span></span>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {isAuthenticated ? (
          <button className="profile-nav-btn" onClick={onProfileOpen}>
            <span className="profile-nav-avatar">{(user?.username || '?')[0]}</span>
            {user?.username}
          </button>
        ) : (
          <button className="hero-cta hero-cta--nav" onClick={() => navigate('/login')}>
            Sign In
          </button>
        )}
      </div>
    </nav>
  )
}

/**
 * HomePage — Cosmic hero landing page with scrollable features section.
 * Shows profile panel (slide-out) when user clicks their avatar.
 */
function HomePage() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const [profileOpen, setProfileOpen] = useState(false)

  const handleLaunch = useCallback(() => {
    navigate(isAuthenticated ? '/upload' : '/login')
  }, [navigate, isAuthenticated])

  return (
    <div className="home-page">
      <HomeNavbar onProfileOpen={() => setProfileOpen(true)} />

      <div className="home-scroll">
        <section className="hero-section">
          <SpaceScene onPlanetClick={handleLaunch} />

          <div className="hero-overlay">
            <h1 className="hero-heading">
              Explore the <span className="accent">Cosmos</span>
            </h1>
            <p className="hero-tagline">
              A journey beyond the stars — built for the future.
            </p>
            <div style={{ display: 'flex', gap: '0.6rem', pointerEvents: 'auto' }}>
              <button className="hero-cta" onClick={handleLaunch}>
                {isAuthenticated ? 'Upload Files' : 'Get Started'}
              </button>
              {isAuthenticated && (
                <button className="hero-cta hero-cta--checkout" onClick={() => setProfileOpen(true)}>
                  My Profile →
                </button>
              )}
            </div>
          </div>
          <div className="scroll-hint">
            <span className="scroll-arrow">↓</span>
            <span className="scroll-text">Scroll to explore</span>
          </div>
        </section>

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

      {/* Profile slide-out panel */}
      {isAuthenticated && (
        <ProfilePanel open={profileOpen} onClose={() => setProfileOpen(false)} />
      )}
    </div>
  )
}

/**
 * App — Root component with routing and auth.
 */
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/upload" element={<ProtectedRoute><UploadExplorer /></ProtectedRoute>} />
          <Route path="/dashboard" element={<AdminRoute><Dashboard /></AdminRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
