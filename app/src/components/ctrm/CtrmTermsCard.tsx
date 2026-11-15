import { useCallback, useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { renewalInfo, renewalText } from '../../lib/ctrmRenewals'
import { listTerms, saveTerms, type TermsDraft } from '../../lib/ctrmTermsStore'
import { errorMessage } from '../../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import { parseCtrmTermsForm } from '../../lib/schemas/ctrmTerms'
import { roleAtLeast } from '../../lib/permissions'
import type { Account, CtrmClientTerms } from '../../lib/types'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, fieldStyle, inputStyle, labelStyle, sectionTitleStyle } from '../../lib/uiStyles'

const smallBtn = { ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }
const muted = { color: colors.muted, fontSize: 13 }
const day = (d: string | null) => (d ? format(parseISO(d), 'd MMM yyyy') : 'Not set')

const TERMS_CSV_HEADERS = ['contract_start', 'renewal_date', 'notice_days', 'stage', 'days_to_renewal', 'notice_by', 'summary'] as const

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
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

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
    const parsed = parseCtrmTermsForm({
      contract_start: draft.contract_start || null,
      renewal_date: draft.renewal_date || null,
      notice: draft.notice,
    })
    if (!parsed.ok) return showToast(parsed.error, 'error')
    setSaving(true)
    try {
      await saveTerms(account.id, terms, parsed.data, author)
      showToast('Contract dates saved', 'success')
      setDraft(null)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the dates'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function importTermsCsv(file: File) {
    if (!canEdit) return
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, rows)
      if (!objects.length) {
        showToast('No terms rows in CSV', 'error')
        return
      }
      const row = objects[0]
      const parsed = parseCtrmTermsForm({
        contract_start: String(row.contract_start ?? '').trim() || null,
        renewal_date: String(row.renewal_date ?? '').trim() || null,
        notice: String(row.notice_days ?? row.notice ?? '').trim(),
      })
      if (!parsed.ok) {
        showToast(parsed.error, 'error')
        return
      }
      await saveTerms(account.id, terms, parsed.data, author)
      showToast('CTRM terms imported', 'success')
      setDraft(null)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'CTRM terms CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const info = terms ? renewalInfo(terms) : null
  const warn = info?.stage ? info.days <= 30 || (info.noticeDaysLeft !== null && info.noticeDaysLeft <= 7) : false

  return (
    <section style={{ ...cardStyle, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Contract and renewal</h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {canEdit && loaded && !draft ? (
            <>
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void importTermsCsv(file)
                }}
              />
              <button
                type="button"
                style={smallBtn}
                disabled={importing}
                onClick={() => importInputRef.current?.click()}
              >
                {importing ? 'Importing…' : 'Import CSV'}
              </button>
            </>
          ) : null}
          {terms && loaded && !draft ? (
            <button
              type="button"
              style={smallBtn}
              onClick={() => {
                exportListCsv(
                  `ctrm-terms-${account.id.slice(0, 8)}.csv`,
                  [...TERMS_CSV_HEADERS],
                  [
                    {
                      contract_start: terms.contract_start || '',
                      renewal_date: terms.renewal_date || '',
                      notice_days: terms.notice_days,
                      stage: info?.stage || '',
                      days_to_renewal: info?.days ?? '',
                      notice_by: info?.noticeBy || '',
                      summary: info?.stage ? renewalText(info) : '',
                    },
                  ],
                )
                showToast('CTRM terms CSV downloaded', 'success')
              }}
            >
              Export CSV
            </button>
          ) : null}
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
