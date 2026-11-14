import { useEffect, useState } from 'react'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import {
  MODULE_FLAGS_KEY,
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

/** Soft-hide optional shell modules via app_settings.moduleFlags JSON. */
export default function ModuleFlagsCard() {
  const { settings, updateSetting } = useSettings()
  const { showToast } = useToast()
  const [opsEnabled, setOpsEnabled] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const flags = parseModuleFlags(settings)
    setOpsEnabled(isModuleFlagEnabled(flags, 'ops'))
  }, [settings])

  async function save() {
    setSaving(true)
    try {
      const next = withModuleFlag(parseModuleFlags(settings), 'ops', opsEnabled)
      await updateSetting(MODULE_FLAGS_KEY, serializeModuleFlags(next))
      showToast(
        opsEnabled
          ? 'Operations module shown in the sidebar again'
          : 'Operations module hidden from the sidebar (URLs still work)',
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
        <code style={{ fontSize: 12 }}>{'{"ops":false}'}</code>).
      </p>
      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="module-flag-ops">
          Operations (Wanders, Catalog, Inventory, Templates, Domains)
        </label>
        <select
          id="module-flag-ops"
          style={selectStyle}
          value={opsEnabled ? 'yes' : 'no'}
          onChange={(e) => setOpsEnabled(e.target.value === 'yes')}
        >
          <option value="yes">Show in sidebar</option>
          <option value="no">Hide from sidebar</option>
        </select>
      </div>
      <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void save()}>
        Save
      </button>
    </section>
  )
}
