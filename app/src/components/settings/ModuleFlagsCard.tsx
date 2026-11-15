import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../contexts/I18nContext'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import {
  MODULE_FLAGS_KEY,
  SETTINGS_MODULE_FLAGS,
  isModuleFlagEnabled,
  parseModuleFlags,
  serializeModuleFlags,
  withModuleFlag,
} from '../../modules/registry'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  fieldStyle,
  labelStyle,
  sectionTitleStyle,
  selectStyle,
} from '../../lib/uiStyles'

type FlagState = Record<string, boolean>

function truthyEnabled(raw: string): boolean {
  const v = raw.trim().toLowerCase()
  return v === 'yes' || v === 'true' || v === '1' || v === 'on' || v === 'show'
}

/** Soft-hide optional shell modules via app_settings.moduleFlags JSON. */
export default function ModuleFlagsCard() {
  const { t } = useI18n()
  const { settings, updateSetting } = useSettings()
  const { showToast } = useToast()
  const [enabled, setEnabled] = useState<FlagState>(() =>
    Object.fromEntries(SETTINGS_MODULE_FLAGS.map((row) => [row.flag, true])),
  )
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const flags = parseModuleFlags(settings)
    setEnabled(
      Object.fromEntries(
        SETTINGS_MODULE_FLAGS.map((row) => [row.flag, isModuleFlagEnabled(flags, row.flag)]),
      ),
    )
  }, [settings])

  async function save() {
    setSaving(true)
    try {
      let next = parseModuleFlags(settings)
      for (const row of SETTINGS_MODULE_FLAGS) {
        next = withModuleFlag(next, row.flag, enabled[row.flag] !== false)
      }
      await updateSetting(MODULE_FLAGS_KEY, serializeModuleFlags(next))
      const hidden = SETTINGS_MODULE_FLAGS.filter((row) => enabled[row.flag] === false).map(
        (row) => row.flag,
      )
      showToast(
        hidden.length
          ? t('page.settings.moduleFlags.hiddenToast').replace('{flags}', hidden.join(', '))
          : t('page.settings.moduleFlags.shownToast'),
        'success',
      )
    } catch (e) {
      showToast(errorMessage(e, t('page.settings.moduleFlags.saveError')), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function importFlagsCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, rows)
      const known = new Set(SETTINGS_MODULE_FLAGS.map((r) => r.flag))
      const nextEnabled: FlagState = { ...enabled }
      let applied = 0
      let skipped = 0
      for (const row of objects) {
        const flag = String(row.flag || row.key || '').trim()
        if (!flag || !known.has(flag)) {
          skipped += 1
          continue
        }
        nextEnabled[flag] = truthyEnabled(String(row.enabled ?? row.value ?? 'yes'))
        applied += 1
      }
      setEnabled(nextEnabled)
      let next = parseModuleFlags(settings)
      for (const row of SETTINGS_MODULE_FLAGS) {
        next = withModuleFlag(next, row.flag, nextEnabled[row.flag] !== false)
      }
      await updateSetting(MODULE_FLAGS_KEY, serializeModuleFlags(next))
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${applied} module flag(s)${skipNote}`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Module flags CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <section id="module-flags" style={{ ...cardStyle, marginBottom: 16, scrollMarginTop: 72 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'start' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>{t('page.settings.moduleFlags.title')}</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importFlagsCsv(file)
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
              exportListCsv(
                'module-flags.csv',
                ['flag', 'label', 'enabled'],
                SETTINGS_MODULE_FLAGS.map((row) => ({
                  flag: row.flag,
                  label: t(row.labelKey),
                  enabled: enabled[row.flag] !== false ? 'yes' : 'no',
                })),
              )
              showToast('Module flags CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
        </div>
      </div>
      <p style={{ color: colors.muted, fontSize: 13, margin: '12px 0 12px', lineHeight: 1.5 }}>
        {t('page.settings.moduleFlags.bodyLead')}{' '}
        <code style={{ fontSize: 12 }}>moduleFlags</code> {t('page.settings.moduleFlags.bodyMid')}{' '}
        <code style={{ fontSize: 12 }}>
          {'{"overview":false,"hr":false,"payroll":false,"marketing":false,"saasBilling":false,"industryPacks":false}'}
        </code>
        ).
      </p>
      {SETTINGS_MODULE_FLAGS.map((row) => (
        <div key={row.flag} style={fieldStyle}>
          <label style={labelStyle} htmlFor={`module-flag-${row.flag}`}>
            {t(row.labelKey)}
          </label>
          <select
            id={`module-flag-${row.flag}`}
            style={selectStyle}
            value={enabled[row.flag] !== false ? 'yes' : 'no'}
            onChange={(e) =>
              setEnabled((prev) => ({ ...prev, [row.flag]: e.target.value === 'yes' }))
            }
          >
            <option value="yes">{t('page.settings.moduleFlags.show')}</option>
            <option value="no">{t('page.settings.moduleFlags.hide')}</option>
          </select>
        </div>
      ))}
      <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void save()}>
        {t('page.settings.moduleFlags.save')}
      </button>
    </section>
  )
}
