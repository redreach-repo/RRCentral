import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  CUSTOM_FIELD_OBJECTS,
  displayFieldValue,
  listCustomFieldDefinitions,
  loadCustomFieldValues,
  parseSelectOptions,
  saveCustomFieldValues,
  type CustomFieldDefinition,
} from '../lib/customFields'
import { errorMessage } from '../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../lib/listIo'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  fieldStyle,
  formGridStyle,
  inputStyle,
  labelStyle,
  sectionTitleStyle,
  selectStyle,
} from '../lib/uiStyles'

type Props = {
  objectType: string
  recordId: string
  editable: boolean
  onToast: (message: string, kind: 'success' | 'error') => void
  /** When false, omit outer card chrome (for nested editor panels). */
  framed?: boolean
  /** Optional heading override. */
  title?: string
  style?: CSSProperties
}

function objectLabel(objectType: string): string {
  return CUSTOM_FIELD_OBJECTS.find((o) => o.value === objectType)?.label || objectType
}

/** View / edit tenant custom field values for one record. */
export default function CustomFieldsCard({
  objectType,
  recordId,
  editable,
  onToast,
  framed = true,
  title = 'Custom fields',
  style,
}: Props) {
  const [defs, setDefs] = useState<CustomFieldDefinition[]>([])
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const definitions = await listCustomFieldDefinitions(objectType)
      setDefs(definitions)
      if (!definitions.length) {
        setValues({})
        setDraft({})
        return
      }
      const map = await loadCustomFieldValues(objectType, recordId)
      setValues(map)
      setDraft(map)
    } finally {
      setLoading(false)
    }
  }, [objectType, recordId])

  useEffect(() => {
    setEditing(false)
    void load()
  }, [load])

  const wrapStyle = framed
    ? { ...cardStyle, marginTop: 16, ...style }
    : { marginTop: 12, ...style }

  if (loading) {
    return (
      <section style={wrapStyle}>
        <h2 style={sectionTitleStyle}>{title}</h2>
        <p style={{ margin: 0, color: colors.muted, fontSize: 13 }}>Loading…</p>
      </section>
    )
  }

  if (!defs.length) {
    return (
      <section style={wrapStyle}>
        <h2 style={sectionTitleStyle}>{title}</h2>
        <p style={{ margin: 0, color: colors.muted, fontSize: 13, lineHeight: 1.5 }}>
          No {objectLabel(objectType).toLowerCase()} custom fields yet. Admins can add them under
          Settings → Custom fields.
        </p>
      </section>
    )
  }

  async function save() {
    setSaving(true)
    try {
      await saveCustomFieldValues(objectType, recordId, defs, draft)
      setValues({ ...draft })
      setEditing(false)
      onToast('Custom fields saved', 'success')
    } catch (e) {
      onToast(errorMessage(e, 'Could not save custom fields'), 'error')
    } finally {
      setSaving(false)
    }
  }

  function coerceImportValue(def: CustomFieldDefinition, raw: string): unknown {
    const v = raw.trim()
    if (def.field_type === 'boolean') {
      const lower = v.toLowerCase()
      return lower === 'yes' || lower === 'true' || lower === '1'
    }
    if (def.field_type === 'number') {
      if (!v) return null
      const n = Number(v)
      return Number.isFinite(n) ? n : v
    }
    if (def.field_type === 'multiselect') {
      if (!v) return []
      return v.split(/[|;,]/).map((s) => s.trim()).filter(Boolean)
    }
    return v || null
  }

  async function importValuesCsv(file: File) {
    if (!editable) return
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows } = parseCsv(text)
      if (!headers.length) {
        onToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, rows)
      const byKey = new Map(defs.map((d) => [d.field_key, d]))
      const next = { ...draft }
      let applied = 0
      let skipped = 0
      for (const row of objects) {
        const key = String(row.key || row.field_key || '').trim()
        const def = byKey.get(key)
        if (!def) {
          skipped += 1
          continue
        }
        next[def.id] = coerceImportValue(def, String(row.value ?? ''))
        applied += 1
      }
      setDraft(next)
      setEditing(true)
      await saveCustomFieldValues(objectType, recordId, defs, next)
      setValues({ ...next })
      setEditing(false)
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      onToast(`Imported ${applied} custom field value(s)${skipNote}`, 'success')
    } catch (e) {
      onToast(errorMessage(e, 'Custom fields CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <section style={wrapStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0, fontSize: framed ? undefined : 14 }}>{title}</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importValuesCsv(file)
            }}
          />
          {editable ? (
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
            onClick={() => {
              exportListCsv(
                `custom-fields-${objectType}-${recordId.slice(0, 8)}.csv`,
                ['key', 'label', 'field_type', 'required', 'value'],
                defs.map((d) => ({
                  key: d.field_key,
                  label: d.label,
                  field_type: d.field_type,
                  required: d.required ? 'yes' : 'no',
                  value: displayFieldValue(d, editing ? draft[d.id] : values[d.id]),
                })),
              )
              onToast('Custom fields CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
          {editable ? (
            editing ? (
              <>
                <button
                  type="button"
                  style={buttonSecondaryStyle}
                  disabled={saving}
                  onClick={() => {
                    setDraft(values)
                    setEditing(false)
                  }}
                >
                  Cancel
                </button>
                <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void save()}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <button type="button" style={buttonSecondaryStyle} onClick={() => setEditing(true)}>
                Edit
              </button>
            )
          ) : null}
        </div>
      </div>

      {editing ? (
        <div style={{ ...formGridStyle, marginTop: 12 }}>
          {defs.map((def) => (
            <div key={def.id} style={fieldStyle}>
              <label style={labelStyle}>
                {def.label}
                {def.required ? ' *' : ''}
              </label>
              <FieldInput
                def={def}
                value={draft[def.id]}
                onChange={(next) => setDraft((d) => ({ ...d, [def.id]: next }))}
              />
            </div>
          ))}
        </div>
      ) : (
        <dl
          style={{
            margin: '12px 0 0',
            display: 'grid',
            gridTemplateColumns: 'minmax(120px, 180px) 1fr',
            gap: '8px 16px',
            fontSize: 13,
          }}
        >
          {defs.map((def) => (
            <div key={def.id} style={{ display: 'contents' }}>
              <dt style={{ color: colors.muted }}>{def.label}</dt>
              <dd style={{ margin: 0 }}>{displayFieldValue(def, values[def.id])}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

function FieldInput({
  def,
  value,
  onChange,
}: {
  def: CustomFieldDefinition
  value: unknown
  onChange: (next: unknown) => void
}) {
  const options = parseSelectOptions(def.options)

  if (def.field_type === 'boolean') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        Yes
      </label>
    )
  }

  if (def.field_type === 'select') {
    return (
      <select
        style={selectStyle}
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )
  }

  if (def.field_type === 'multiselect') {
    const selected = Array.isArray(value) ? value.map(String) : []
    return (
      <select
        style={{ ...selectStyle, minHeight: 88 }}
        multiple
        value={selected}
        onChange={(e) =>
          onChange(Array.from(e.target.selectedOptions).map((o) => o.value))
        }
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )
  }

  const inputType =
    def.field_type === 'number'
      ? 'number'
      : def.field_type === 'date'
        ? 'date'
        : def.field_type === 'email'
          ? 'email'
          : def.field_type === 'url'
            ? 'url'
            : def.field_type === 'phone'
              ? 'tel'
              : 'text'

  return (
    <input
      style={inputStyle}
      type={inputType}
      value={value == null ? '' : String(value)}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
