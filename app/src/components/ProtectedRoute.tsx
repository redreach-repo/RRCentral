import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, hasAccess, signOut } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#121417',
          color: 'rgba(255,255,255,0.6)',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        Loading…
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (!hasAccess) {
    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#121417',
          color: 'rgba(255,255,255,0.85)',
          fontFamily: "'DM Sans', sans-serif",
          padding: 16,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, marginBottom: 12 }}>No access to RR Central</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, marginBottom: 20 }}>
            {user.email} is signed in but is not on the RR Central team list. Ask an admin to add
            you under Settings → Users, then sign in again.
          </p>
          <button
            type="button"
            onClick={() => void signOut()}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
