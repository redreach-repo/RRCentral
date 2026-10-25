import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { CLIENT_UPDATE_DAYS, VENDOR_STATUSES, clientUpdateDue, needsClientUpdate } from '../../lib/ctrmIssues'
import type { TicketPatch } from '../../lib/supportStore'
import type { Ticket, VendorStatus } from '../../lib/types'
import { buttonSecondaryStyle, cardStyle, colors, fieldStyle, inputStyle, labelStyle, sectionTitleStyle, selectStyle } from '../../lib/uiStyles'

const smallBtn = { ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }

/**
 * The CTRM Next side of an issue: the vendor's ticket number and status, and
 * when the client was last updated. Typed in by hand; nothing is synced with
 * the vendor. A reply to the client sets the update date on its own.
 */
export default function CtrmIssueBox({
  ticket,
  editable,
  busy,
  onChange,
}: {
  ticket: Ticket
  editable: boolean
  busy: boolean
  onChange: (patch: TicketPatch) => Promise<void>
}) {
  const [ref, setRef] = useState(ticket.vendor_ticket_ref ?? '')
  useEffect(() => setRef(ticket.vendor_ticket_ref ?? ''), [ticket.vendor_ticket_ref])
  const flagged = needsClientUpdate(ticket)
  const disabled = !editable || busy

  return (
    <section style={{ ...cardStyle, marginBottom: 16, borderColor: flagged ? colors.danger : colors.border }}>
      <h2 style={sectionTitleStyle}>CTRM Next issue</h2>
      {flagged ? (
        <p style={{ color: colors.danger, fontSize: 13, marginTop: 0 }}>
          The client has had no update for {CLIENT_UPDATE_DAYS} working days. Send them a reply, or note the update you gave below.
        </p>
      ) : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div style={{ ...fieldStyle, minWidth: 160 }}>
          <label style={labelStyle} htmlFor="t-vendor-ref">
            Vendor ticket number
          </label>
          <input
            id="t-vendor-ref"
            style={inputStyle}
            maxLength={60}
            value={ref}
            disabled={disabled}
            onChange={(e) => setRef(e.target.value)}
            onBlur={() => ref.trim() !== (ticket.vendor_ticket_ref ?? '') && void onChange({ vendor_ticket_ref: ref.trim() })}
          />
        </div>
        <div style={{ ...fieldStyle, minWidth: 180 }}>
          <label style={labelStyle} htmlFor="t-vendor-status">
            Vendor side
          </label>
          <select
            id="t-vendor-status"
            style={selectStyle}
            value={ticket.vendor_status || 'not_raised'}
            disabled={disabled}
            onChange={(e) => void onChange({ vendor_status: e.target.value as VendorStatus })}
          >
            {VENDOR_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ ...fieldStyle, minWidth: 180 }}>
          <label style={labelStyle} htmlFor="t-client-updated">
            Last update sent to client
          </label>
          <input
            id="t-client-updated"
            type="date"
            style={inputStyle}
            value={ticket.client_updated_at ? format(new Date(ticket.client_updated_at), 'yyyy-MM-dd') : ''}
            max={format(new Date(), 'yyyy-MM-dd')}
            disabled={disabled}
            onChange={(e) => void onChange({ client_updated_at: e.target.value ? new Date(`${e.target.value}T12:00:00`).toISOString() : null })}
          />
        </div>
        {editable ? (
          <button type="button" style={smallBtn} disabled={busy} onClick={() => void onChange({ client_updated_at: new Date().toISOString() })}>
            Updated them today
          </button>
        ) : null}
      </div>
      <p style={{ color: colors.muted, fontSize: 12, marginBottom: 0 }}>
        {ticket.vendor_fixed_at ? `Vendor fixed it on ${format(new Date(ticket.vendor_fixed_at), 'd MMM yyyy')}. ` : ''}
        Next update due by {format(clientUpdateDue(ticket), 'EEE d MMM')}. The owner is the person it is assigned to.
      </p>
    </section>
  )
}
