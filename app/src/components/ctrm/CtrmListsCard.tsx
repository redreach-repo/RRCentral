import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../contexts/I18nContext'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import { CTRM_LISTS } from '../../lib/ctrmLists'
import { parseSettingsList } from '../../lib/fitSheet'
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
} from '../../lib/uiStyles'

function matchCtrmList(listKey: string, listLabel: string) {
  const key = listKey.trim()
  const label = listLabel.trim().toLowerCase()
  return CTRM_LISTS.find((l) => l.key === key || (label && l.label.toLowerCase() === label))
}

/** Settings card for the CTRM Next pick lists, one item per line. */
export default function CtrmListsCard() {
  const { t } = useI18n()
  const { settings, updateSetting } = useSettings()
  const { showToast } = useToast()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(Object.fromEntries(CTRM_LISTS.map((l) => [l.key, parseSettingsList(settings[l.key], l.fallback).join('\n')])))
  }, [settings])

  async function save() {
    setSaving(true)
    try {
      for (const l of CTRM_LISTS) await updateSetting(l.key, parseSettingsList(draft[l.key], l.fallback).join('\n'))
      showToast('CTRM Next lists saved', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Save failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function importListsCsv(file: File) {
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
        showToast('No rows in CSV', 'error')
        return
      }

      const grouped = new Map<string, string[]>()
      let skipped = 0
      for (const row of objects) {
        const list = matchCtrmList(String(row.list_key || ''), String(row.list_label || ''))
        const item = String(row.item ?? '').trim()
        if (!list || !item) {
          skipped += 1
          continue
        }
        const bucket = grouped.get(list.key) || []
        if (!bucket.includes(item)) bucket.push(item)
        grouped.set(list.key, bucket)
      }

      if (!grouped.size) {
        showToast('No matching CTRM list rows in CSV', 'error')
        return
      }

      const next = { ...draft }
      for (const [key, items] of grouped) {
        next[key] = items.join('\n')
      }
      setDraft(next)

      for (const l of CTRM_LISTS) {
        if (!grouped.has(l.key)) continue
        await updateSetting(l.key, parseSettingsList(next[l.key], l.fallback).join('\n'))
      }

      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${grouped.size} CTRM list(s)${skipNote}`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'CTRM lists CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'start' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>{t('page.settings.section.ctrmLists')}</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importListsCsv(file)
            }}
          />
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={importing}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            style={buttonSecondaryStyle}
            onClick={() => {
              const rows: Array<{ list_key: string; list_label: string; item: string }> = []
              for (const l of CTRM_LISTS) {
                for (const item of parseSettingsList(draft[l.key], l.fallback)) {
                  rows.push({ list_key: l.key, list_label: l.label, item })
                }
              }
              exportListCsv('ctrm-lists.csv', ['list_key', 'list_label', 'item'], rows)
              showToast('CTRM lists CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
        </div>
      </div>
      <p style={{ color: colors.muted, fontSize: 13, marginTop: 12 }}>One item per line. Leave a list empty to go back to the standard one.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {CTRM_LISTS.map((l) => (
          <div key={l.key} style={fieldStyle}>
            <label style={labelStyle} htmlFor={`list-${l.key}`}>
              {l.label}
            </label>
            <textarea
              id={`list-${l.key}`}
              rows={8}
              style={{ ...inputStyle, resize: 'vertical' }}
              value={draft[l.key] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [l.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
