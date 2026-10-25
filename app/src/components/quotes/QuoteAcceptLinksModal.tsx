import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import Modal from '../Modal'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import {
  ACCEPT_STATE_LABELS,
  acceptLinkState,
  canHaveAcceptLink,
  canSeeAcceptance,
  type AcceptLinkRow,
} from '../../lib/quoteAccept'
import {
  createAcceptLink,
  listAcceptances,
  listAcceptLinks,
  revokeAcceptLink,
  type QuoteAcceptance,
} from '../../lib/quoteAcceptStore'
import type { Quotation } from '../../lib/types'
import { buttonPrimaryStyle, buttonSecondaryStyle, colors, inputStyle, labelStyle } from '../../lib/uiStyles'

const when = (iso: string | null) => (iso ? format(parseISO(iso), 'd MMM yyyy, HH:mm') : '')

/**
 * Private links a client opens to see the quote PDF and accept it. Each link
 * carries the PDF as it is when the link is made, has an expiry date and can
 * be turned off. Admins see the full acceptance record.
 */
export default function QuoteAcceptLinksModal({
  open,
  onClose,
  quote,
  makePdfBase64,
}: {
  open: boolean
  onClose: () => void
  quote: Quotation
  makePdfBase64: () => Promise<string>
}) {
  const { user, userRole } = useAuth()
  const { showToast } = useToast()
  const [rows, setRows] = useState<AcceptLinkRow[]>([])
  const [missing, setMissing] = useState(false)
  const [acceptances, setAcceptances] = useState<QuoteAcceptance[]>([])
  const [label, setLabel] = useState('')
  const [newLink, setNewLink] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await listAcceptLinks(quote.id)
    setRows(r.rows)
    setMissing(r.missingTable)
    if (canSeeAcceptance(userRole)) setAcceptances(await listAcceptances(quote.id))
  }, [quote.id, userRole])

  useEffect(() => {
    if (open) void load().catch((e) => showToast(errorMessage(e, 'Could not load the links'), 'error'))
  }, [open, load, showToast])

  async function create() {
    setBusy(true)
    try {
      const pdf = await makePdfBase64()
      const link = await createAcceptLink(quote, pdf, label, user?.email || '')
      setNewLink(link)
      setLabel('')
      await load()
      try {
        await navigator.clipboard.writeText(link)
        showToast('Link made and copied. Send it to the client.', 'success')
      } catch {
        showToast('Link made. Copy it below and send it to the client.', 'success')
      }
    } catch (e) {
      showToast(errorMessage(e, 'Could not make the link'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function turnOff(id: string) {
    try {
      await revokeAcceptLink(id)
      await load()
      showToast('Link turned off', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Could not turn the link off'), 'error')
    }
  }

  const accepted = rows.find((r) => r.accepted_at)

  return (
    <Modal open={open} title={`Accept link for ${quote.reference_number}`} onClose={onClose} width={560}>
      {missing ? (
        <p style={{ fontSize: 14 }}>Run the "Quote accept link" SQL first (SQL copy page), then try again.</p>
      ) : (
        <>
          <p style={{ color: colors.muted, fontSize: 13, marginTop: 0 }}>
            The client opens the link, sees this quote's PDF and accepts it with their name and the date. The quote
            then shows Accepted. The AI CRM deal with this quote moves to Signed with a draft contract. Nothing is
            invoiced: mark the quote Awarded and activate the contract yourself.
          </p>

          {accepted ? (
            <div style={{ borderLeft: `3px solid ${colors.success}`, paddingLeft: 10, marginBottom: 12, fontSize: 14 }}>
              Accepted by <strong>{accepted.accepted_name}</strong> on {when(accepted.accepted_at)}.
              {acceptances.map((a) => (
                <div key={a.id} style={{ color: colors.muted, fontSize: 13 }}>
                  Signed for {a.accepted_date}, from address {a.ip || 'unknown'}.
                  {a.contract_id ? ' A draft contract was made.' : ''}
                  {a.crm_id ? ' The CRM lead moved to Won.' : ''}
                </div>
              ))}
            </div>
          ) : null}

          {canHaveAcceptLink(quote) ? (
            <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              <label style={labelStyle} htmlFor="accept-label">
                Who it is for (optional)
              </label>
              <input id="accept-label" style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value)} />
              <button type="button" style={buttonPrimaryStyle} disabled={busy} onClick={() => void create()}>
                {busy ? 'Making the PDF…' : 'Make a new link'}
              </button>
              {newLink ? (
                <input style={inputStyle} readOnly value={newLink} onFocus={(e) => e.currentTarget.select()} aria-label="New link" />
              ) : null}
            </div>
          ) : !accepted ? (
            <p style={{ fontSize: 14 }}>Finalise the quote before making a link.</p>
          ) : null}

          {rows.length ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              {rows.map((r) => {
                const state = acceptLinkState(r)
                return (
                  <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, alignItems: 'center' }}>
                    <span>
                      <strong>{ACCEPT_STATE_LABELS[state]}</strong>
                      {r.label ? `, ${r.label}` : ''}, made {when(r.created_at)}
                      {state === 'active' && r.expires_at ? `, works until ${when(r.expires_at)}` : ''}
                      {r.last_opened_at ? `, last opened ${when(r.last_opened_at)}` : ', not opened yet'}
                    </span>
                    {state === 'active' ? (
                      <button type="button" style={buttonSecondaryStyle} onClick={() => void turnOff(r.id)}>
                        Turn off
                      </button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </>
      )}
    </Modal>
  )
}
