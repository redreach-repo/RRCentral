import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { renewalInfo, renewalText, termsProblem } from '../../lib/ctrmRenewals'
import { listTerms, saveTerms, type TermsDraft } from '../../lib/ctrmTermsStore'
import { errorMessage } from '../../lib/errors'
import { roleAtLeast } from '../../lib/permissions'
import type { Account, CtrmClientTerms } from '../../lib/types'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, fieldStyle, inputStyle, labelStyle, sectionTitleStyle } from '../../lib/uiStyles'

const smallBtn = { ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }
const muted = { color: colors.muted, fontSize: 13 }
const day = (d: string | null) => (d ? format(parseISO(d), 'd MMM yyyy') : 'Not set')

/**
 * Contract start, renewal date and notice period for a CTRM Next client, the
 * same idea as the WorshipHub renewal date. Reminders at 90, 60 and 30 days.
 */
export default function CtrmTermsCard({ account, editable, author }: { account: Account; editable: boolean; author: { appUserId: string | null; email: string } }) {
  const { userRole } = useAuth()
  const { showToast } = useToast()
  const canEdit = editable && roleAtLeast(userRole, 'sales')
  const [terms, setTerms] = useState<CtrmClientTerms | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState<(TermsDraft & { notice: string }) | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setTerms((await listTerms(account.id))[0] ?? null)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load the contract dates'), 'error')
    } finally {
      setLoaded(true)
    }
  }, [account.id, showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!draft) return
    const next = { contract_start: draft.contract_start || null, renewal_date: draft.renewal_date || null, notice_days: Number(draft.notice || 0) }
    const problem = termsProblem(next)
    if (problem) return showToast(problem, 'error')
    setSaving(true)
    try {
      await saveTerms(account.id, terms, next, author)
      showToast('Contract dates saved', 'success')
      setDraft(null)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the dates'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const info = terms ? renewalInfo(terms) : null
  const warn = info?.stage ? info.days <= 30 || (info.noticeDaysLeft !== null && info.noticeDaysLeft <= 7) : false

  return (
    <section style={{ ...cardStyle, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Contract and renewal</h2>
        {canEdit && loaded && !draft ? (
          <button
            type="button"
            style={smallBtn}
            onClick={() =>
              setDraft({
                contract_start: terms?.contract_start ?? null,
                renewal_date: terms?.renewal_date ?? null,
                notice_days: terms?.notice_days ?? 0,
                notice: String(terms?.notice_days ?? ''),
              })
            }
          >
            {terms ? 'Edit' : 'Add dates'}
          </button>
        ) : null}
      </div>
      {!loaded ? <p style={muted}>Loading…</p> : null}
      {loaded && !draft ? (
        terms ? (
          <div style={{ fontSize: 14, marginTop: 8, display: 'grid', gap: 4 }}>
            <div>
              Contract start: {day(terms.contract_start)} · Renewal: {day(terms.renewal_date)} · Notice: {terms.notice_days ? `${terms.notice_days} days` : 'none'}
            </div>
            {info?.stage ? <div style={{ color: warn ? colors.danger : colors.text }}>{renewalText(info)}</div> : null}
          </div>
        ) : (
          <p style={muted}>No contract dates yet. Add them once the client signs so the renewal is not missed.</p>
        )
      ) : null}
      {draft ? (
        <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="terms-start">
                Contract start
              </label>
              <input id="terms-start" type="date" style={inputStyle} value={draft.contract_start ?? ''} onChange={(e) => setDraft({ ...draft, contract_start: e.target.value || null })} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="terms-renewal">
                Renewal date
              </label>
              <input id="terms-renewal" type="date" style={inputStyle} value={draft.renewal_date ?? ''} onChange={(e) => setDraft({ ...draft, renewal_date: e.target.value || null })} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="terms-notice">
                Notice period (days)
              </label>
              <input id="terms-notice" inputMode="numeric" style={inputStyle} value={draft.notice} onChange={(e) => setDraft({ ...draft, notice: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save dates'}
            </button>
            <button type="button" style={buttonSecondaryStyle} disabled={saving} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
