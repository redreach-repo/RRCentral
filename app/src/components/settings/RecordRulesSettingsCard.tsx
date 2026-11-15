import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Plus } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import { can } from '../../lib/permissions'
import { createRecordRule, listRecordRules, type RecordRuleRow } from '../../lib/recordRulesStore'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
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
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
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

  async function importRulesCsv(file: File) {
    if (!manage) return
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const existing = new Set(rows.map((r) => `${r.object_type}::${r.name}`.toLowerCase()))
      let saved = 0
      let skipped = 0
      for (const row of objects) {
        const objectType = String(row.object_type || row.objectType || '').trim()
        const name = String(row.name || '').trim()
        const scope = String(row.scope || 'owner').trim() || 'owner'
        if (!objectType || !name) {
          skipped += 1
          continue
        }
        const key = `${objectType}::${name}`.toLowerCase()
        if (existing.has(key)) {
          skipped += 1
          continue
        }
        await createRecordRule({ objectType, name, scope })
        existing.add(key)
        saved += 1
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} record rule(s)${skipNote}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Record rules CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <section id="record-rules" style={{ ...cardStyle, marginBottom: 16, scrollMarginTop: 72 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'start' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Record rules (stub)</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importRulesCsv(file)
            }}
          />
          {manage ? (
            <button
              type="button"
              style={buttonSecondaryStyle}
              disabled={importing}
              onClick={() => importInputRef.current?.click()}
            >
              {importing ? 'Importing…' : 'Import CSV'}
            </button>
          ) : null}
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={!rows.length}
            onClick={() => {
              exportListCsv(
                'record-rules.csv',
                ['name', 'object_type', 'scope', 'active'],
                rows.map((r) => ({
                  name: r.name,
                  object_type: r.object_type,
                  scope: r.scope,
                  active: r.active ? 'yes' : 'no',
                })),
              )
              showToast('Record rules CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
        </div>
      </div>
      <p style={{ color: colors.muted, fontSize: 13, margin: '12px 0 12px', lineHeight: 1.5 }}>
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
