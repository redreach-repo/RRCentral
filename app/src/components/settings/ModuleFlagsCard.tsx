import { useEffect, useState } from 'react'
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
          ? `Hidden from sidebar: ${hidden.join(', ')} (URLs still work)`
          : 'All optional modules shown in the sidebar again',
        'success',
      )
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the setting'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="module-flags" style={{ ...cardStyle, marginBottom: 16, scrollMarginTop: 72 }}>
      <h2 style={sectionTitleStyle}>Module flags</h2>
      <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>
        Soft-hide optional sidebar modules for everyone. Direct URLs keep working. Stored as{' '}
        <code style={{ fontSize: 12 }}>moduleFlags</code> JSON in settings (for example{' '}
        <code style={{ fontSize: 12 }}>
          {'{"overview":false,"sales":false,"ops":false,"finance":false,"delivery":false,"clients":false}'}
        </code>
        ).
      </p>
      {SETTINGS_MODULE_FLAGS.map((row) => (
        <div key={row.flag} style={fieldStyle}>
          <label style={labelStyle} htmlFor={`module-flag-${row.flag}`}>
            {row.label}
          </label>
          <select
            id={`module-flag-${row.flag}`}
            style={selectStyle}
            value={enabled[row.flag] !== false ? 'yes' : 'no'}
            onChange={(e) =>
              setEnabled((prev) => ({ ...prev, [row.flag]: e.target.value === 'yes' }))
            }
          >
            <option value="yes">Show in sidebar</option>
            <option value="no">Hide from sidebar</option>
          </select>
        </div>
      ))}
      <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void save()}>
        Save
      </button>
    </section>
  )
}
