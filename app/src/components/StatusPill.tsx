import type { CSSProperties } from 'react'

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  Draft: { bg: 'rgba(156,163,175,0.2)', color: '#9ca3af' },
  Finalized: { bg: 'rgba(59,130,246,0.2)', color: '#60a5fa' },
  Sent: { bg: 'rgba(234,179,8,0.2)', color: '#facc15' },
  Awarded: { bg: 'rgba(34,197,94,0.2)', color: '#4ade80' },
  'Not awarded': { bg: 'rgba(239,68,68,0.2)', color: '#f87171' },
  Expired: { bg: 'rgba(249,115,22,0.2)', color: '#fb923c' },
  Superseded: { bg: 'rgba(168,85,247,0.2)', color: '#c084fc' },
  Cancelled: { bg: 'rgba(156,163,175,0.2)', color: '#9ca3af' },
  Pending: { bg: 'rgba(234,179,8,0.2)', color: '#facc15' },
  Partial: { bg: 'rgba(249,115,22,0.2)', color: '#fb923c' },
  Paid: { bg: 'rgba(34,197,94,0.2)', color: '#4ade80' },
  Overdue: { bg: 'rgba(239,68,68,0.2)', color: '#f87171' },
}

const pillStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  lineHeight: 1.4,
}

interface StatusPillProps {
  status: string
}

export default function StatusPill({ status }: StatusPillProps) {
  const colors = STATUS_COLORS[status] ?? {
    bg: 'rgba(156,163,175,0.2)',
    color: '#9ca3af',
  }

  return (
    <span style={{ ...pillStyle, background: colors.bg, color: colors.color }}>
      {status || '—'}
    </span>
  )
}
