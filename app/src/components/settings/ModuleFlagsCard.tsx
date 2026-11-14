import { useEffect, useState } from 'react'
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
import {
  buttonPrimaryStyle,
  cardStyle,
  colors,
  fieldStyle,
  labelStyle,
  sectionTitleStyle,
  selectStyle,
} from '../../lib/uiStyles'

type FlagState = Record<string, boolean>

/** Soft-hide optional shell modules via app_settings.moduleFlags JSON. */
export default function ModuleFlagsCard() {
  const { t } = useI18n()
  const { settings, updateSetting } = useSettings()
  const { showToast } = useToast()
  const [enabled, setEnabled] = useState<FlagState>(() =>
    Object.fromEntries(SETTINGS_MODULE_FLAGS.map((row) => [row.flag, true])),
  )
  const [saving, setSaving] = useState(false)

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

  return (
    <section id="module-flags" style={{ ...cardStyle, marginBottom: 16, scrollMarginTop: 72 }}>
      <h2 style={sectionTitleStyle}>{t('page.settings.moduleFlags.title')}</h2>
      <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>
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
