import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import {
  DEFAULT_FIT_MODULES,
  FIT_FOCUS,
  FIT_MODULES_SETTING,
  FIT_SHEET_NOTE,
  emptyFitSheet,
  fitSheetMissing,
  fitSheetRows,
  parseSettingsList,
  parseUserCount,
  type FitSheetDraft,
} from '../../lib/fitSheet'
import { loadFitSheet, saveFitSheet } from '../../lib/fitSheetStore'
import type { Account, AccountContact, CtrmFitFocus, CtrmFitSheet } from '../../lib/types'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, fieldStyle, inputStyle, labelStyle, sectionTitleStyle, selectStyle } from '../../lib/uiStyles'

const smallBtn = { ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }
const muted = { color: colors.muted, fontSize: 13 }

/**
 * The prospect fit sheet on a CTRM Next account: what they trade, focus,
 * users, current system, decision maker, modules of interest. It must be
 * filled in before a deal moves to Demo done. One page PDF on the letterhead.
 */
export default function FitSheetCard({
  account,
  contacts,
  editable,
  author,
}: {
  account: Account
  contacts: AccountContact[]
  editable: boolean
  author: { appUserId: string | null; email: string }
}) {
  const { showToast } = useToast()
  const { settings } = useSettings()
  const modules = parseSettingsList(settings[FIT_MODULES_SETTING], DEFAULT_FIT_MODULES)
  const [sheet, setSheet] = useState<CtrmFitSheet | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState<FitSheetDraft | null>(null)
  const [users, setUsers] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setSheet(await loadFitSheet(account.id))
    } catch (e) {
      showToast(errorMessage(e, 'Could not load the fit sheet'), 'error')
    } finally {
      setLoaded(true)
    }
  }, [account.id, showToast])

  useEffect(() => {
    void load()
  }, [load])

  function edit() {
    const d = sheet ? { ...sheet, modules: [...sheet.modules] } : emptyFitSheet()
    setDraft(d)
    setUsers(d.user_count === null ? '' : String(d.user_count))
  }

  async function save() {
    if (!draft) return
    setSaving(true)
    try {
      await saveFitSheet(account.id, sheet, { ...draft, user_count: parseUserCount(users) }, author)
      showToast('Fit sheet saved', 'success')
      setDraft(null)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the fit sheet'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const dmName = (id: string | null) => {
    const c = contacts.find((x) => x.id === id)
    return c ? [c.name, c.role].filter(Boolean).join(', ') : ''
  }
  const missing = fitSheetMissing(sheet)
  // Modules saved earlier that are no longer in the Settings list still show.
  const moduleChoices = [...new Set([...modules, ...(draft?.modules ?? [])])]

  return (
    <section style={{ ...cardStyle, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Fit sheet</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {sheet ? (
            <Link to={`/accounts/${account.id}/fit-sheet`} style={{ ...smallBtn, textDecoration: 'none' }}>
              <FileText size={14} /> PDF
            </Link>
          ) : null}
          {editable && !draft && loaded ? (
            <button type="button" style={smallBtn} onClick={edit}>
              {sheet ? 'Edit' : 'Fill in'}
            </button>
          ) : null}
        </div>
      </div>

      {!loaded ? <p style={muted}>Loading…</p> : null}
      {loaded && !draft ? (
        <>
          <p style={{ ...muted, color: missing.length ? colors.danger : colors.muted }}>
            {missing.length ? `Needed before the demo: ${missing.join(', ')}.` : 'Ready for the demo.'}
          </p>
          {sheet ? (
            <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, max-content) 1fr', gap: '6px 16px', margin: 0, fontSize: 14 }}>
              {fitSheetRows(sheet, dmName(sheet.decision_maker_id)).map((r) => (
                <div key={r.label} style={{ display: 'contents' }}>
                  <dt style={{ color: colors.muted }}>{r.label}</dt>
                  <dd style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </>
      ) : null}

      {draft ? (
        <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
          <p style={{ ...muted, margin: 0 }}>{FIT_SHEET_NOTE}</p>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="fit-commodities">
              Commodities and products
            </label>
            <input
              id="fit-commodities"
              style={inputStyle}
              placeholder="Crude, diesel, jet fuel, bitumen…"
              value={draft.commodities}
              onChange={(e) => setDraft({ ...draft, commodities: e.target.value })}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="fit-focus">
                Focus
              </label>
              <select id="fit-focus" style={selectStyle} value={draft.focus} onChange={(e) => setDraft({ ...draft, focus: e.target.value as CtrmFitFocus })}>
                <option value="">Pick one</option>
                {FIT_FOCUS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="fit-users">
                Number of users
              </label>
              <input id="fit-users" style={inputStyle} inputMode="numeric" value={users} onChange={(e) => setUsers(e.target.value.replace(/\D/g, ''))} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="fit-system">
                Current system
              </label>
              <input
                id="fit-system"
                style={inputStyle}
                placeholder="Spreadsheets, another CTRM…"
                value={draft.current_system}
                onChange={(e) => setDraft({ ...draft, current_system: e.target.value })}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="fit-dm">
                Decision maker
              </label>
              <select
                id="fit-dm"
                style={selectStyle}
                value={draft.decision_maker_id ?? ''}
                onChange={(e) => setDraft({ ...draft, decision_maker_id: e.target.value || null })}
              >
                <option value="">Not known yet</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {[c.name, c.role].filter(Boolean).join(', ')}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <div style={labelStyle}>Modules of interest</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 14 }}>
              {moduleChoices.map((m) => (
                <label key={m} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={draft.modules.includes(m)}
                    onChange={(e) =>
                      setDraft({ ...draft, modules: e.target.checked ? [...draft.modules, m] : draft.modules.filter((x) => x !== m) })
                    }
                  />
                  {m}
                </label>
              ))}
            </div>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="fit-notes">
              Notes
            </label>
            <textarea
              id="fit-notes"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save fit sheet'}
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
