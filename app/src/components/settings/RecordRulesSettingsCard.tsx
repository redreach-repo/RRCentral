import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Plus } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import { can } from '../../lib/permissions'
import { createRecordRule, listRecordRules, type RecordRuleRow } from '../../lib/recordRulesStore'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  fieldStyle,
  inputStyle,
  labelStyle,
  sectionTitleStyle,
  selectStyle,
} from '../../lib/uiStyles'

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: `1px solid ${colors.border}`,
  fontWeight: 600,
  fontSize: 12,
  color: colors.muted,
}
const tdStyle: CSSProperties = {
  padding: '8px 10px',
  borderBottom: `1px solid ${colors.border}`,
  verticalAlign: 'middle',
}

/** Settings → Record rules stub (app evaluate; not RLS). */
export default function RecordRulesSettingsCard() {
  const { userRole } = useAuth()
  const { showToast } = useToast()
  const manage = can(userRole, 'settings.manage')
  const [rows, setRows] = useState<RecordRuleRow[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ objectType: 'deal', name: '', scope: 'owner' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listRecordRules())
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function add() {
    if (!manage) return
    setBusy(true)
    try {
      await createRecordRule({
        objectType: form.objectType,
        name: form.name || `${form.objectType} ${form.scope}`,
        scope: form.scope,
      })
      setForm({ objectType: 'deal', name: '', scope: 'owner' })
      showToast('Record rule added (app-side stub)', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not add record rule'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section id="record-rules" style={{ ...cardStyle, marginBottom: 16, scrollMarginTop: 72 }}>
      <h2 style={sectionTitleStyle}>Record rules (stub)</h2>
      <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>
        Visibility scopes evaluated in the app only — RLS is not rewritten yet. Admin viewers bypass
        owner/team filters.
      </p>
      {manage ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12, alignItems: 'end' }}>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="rr-object">
              Object
            </label>
            <input
              id="rr-object"
              style={inputStyle}
              value={form.objectType}
              onChange={(e) => setForm((f) => ({ ...f, objectType: e.target.value }))}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="rr-name">
              Name
            </label>
            <input
              id="rr-name"
              style={inputStyle}
              value={form.name}
              placeholder="Owner only"
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="rr-scope">
              Scope
            </label>
            <select
              id="rr-scope"
              style={selectStyle}
              value={form.scope}
              onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
            >
              <option value="all">all</option>
              <option value="owner">owner</option>
              <option value="team">team</option>
            </select>
          </div>
          <button type="button" style={buttonPrimaryStyle} disabled={busy} onClick={() => void add()}>
            <Plus size={14} style={{ marginRight: 4 }} />
            Add
          </button>
          <button type="button" style={buttonSecondaryStyle} onClick={() => void load()}>
            Refresh
          </button>
        </div>
      ) : null}
      {loading ? (
        <p style={{ color: colors.muted, fontSize: 13 }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: 13 }}>No record rules yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Object</th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Scope</th>
                <th style={thStyle}>Active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={tdStyle}>{r.object_type}</td>
                  <td style={tdStyle}>{r.name}</td>
                  <td style={tdStyle}>{r.scope}</td>
                  <td style={tdStyle}>{r.active === false ? 'no' : 'yes'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
