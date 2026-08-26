import { useEffect, useState } from 'react'
import { STATUS_MESSAGES } from '../data/verticals'

export default function StatusTicker() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((n) => (n + 1) % STATUS_MESSAGES.length)
    }, 2800)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="site-status" role="status">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="site-status-dot" />
        <span className="site-status-label">System status</span>
      </div>
      <div className="site-status-msg">{STATUS_MESSAGES[index]}</div>
    </div>
  )
}
