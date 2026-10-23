import type { CSSProperties } from 'react'
import { format } from 'date-fns'
import { slaState, type SlaState } from '../../lib/sla'
import { SLA_STATE_LABELS } from '../../lib/support'
import type { Ticket } from '../../lib/types'

const TONES: Record<SlaState, { bg: string; color: string }> = {
  ok: { bg: 'rgba(34,197,94,0.16)', color: '#4ade80' },
  warning: { bg: 'rgba(245,158,11,0.2)', color: '#fbbf24' },
  breached: { bg: 'rgba(239,68,68,0.22)', color: '#f87171' },
  met: { bg: 'rgba(156,163,175,0.18)', color: '#d1d5db' },
  missed: { bg: 'rgba(239,68,68,0.14)', color: '#fca5a5' },
  none: { bg: 'transparent', color: 'inherit' },
}

const pill: CSSProperties = {
  display: 'inline-flex',
  padding: '3px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap',
}

/** First response SLA state with the due time underneath. */
export default function SlaBadge({ ticket, now }: { ticket: Ticket; now?: Date }) {
  const state = slaState(ticket, now)
  if (state === 'none') return <span style={{ fontSize: 12, opacity: 0.5 }}>No clock</span>
  const tone = TONES[state]
  const due = ticket.sla_due_at ? new Date(ticket.sla_due_at) : null
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ ...pill, background: tone.bg, color: tone.color }} data-sla={state}>
        {SLA_STATE_LABELS[state]}
      </span>
      {due && (state === 'ok' || state === 'warning' || state === 'breached') ? (
        <span style={{ fontSize: 11, opacity: 0.6 }}>Reply by {format(due, 'EEE d MMM, HH:mm')}</span>
      ) : null}
    </span>
  )
}
