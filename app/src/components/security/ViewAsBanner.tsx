import { useEffect, useState } from 'react'
import { Eye } from 'lucide-react'
import { minutesLeft, stopViewAs, type ViewAsInfo } from '../../lib/viewAs'

/**
 * Shown on every page while an admin is viewing as a team member. Stop (or
 * the 30 minute limit) ends it and returns to the admin's own sign in.
 */
export default function ViewAsBanner({ info }: { info: ViewAsInfo }) {
  const [left, setLeft] = useState(() => minutesLeft(info.expiresAt))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const tick = () => {
      const m = minutesLeft(info.expiresAt)
      setLeft(m)
      if (m <= 0) void stopViewAs()
    }
    const id = window.setInterval(tick, 15000)
    return () => window.clearInterval(id)
  }, [info.expiresAt])

  async function stop() {
    setBusy(true)
    try {
      await stopViewAs()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="status"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 16px',
        background: '#b91c1c',
        color: '#fff',
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      <Eye size={16} aria-hidden="true" />
      <span>
        Viewing as {info.targetEmail}. Anything you change is saved as them. Ends in {left} min.
      </span>
      <button
        type="button"
        onClick={() => void stop()}
        disabled={busy}
        style={{
          padding: '4px 12px',
          borderRadius: 6,
          border: '1px solid #fff',
          background: '#fff',
          color: '#b91c1c',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        {busy ? 'Stopping…' : `Stop, back to ${info.admin || 'my account'}`}
      </button>
    </div>
  )
}
