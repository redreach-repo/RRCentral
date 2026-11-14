import { useEffect, useState } from 'react'
import { useI18n } from '../../contexts/I18nContext'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import { HIDE_PIPELINE_DETAIL_NAV_KEY } from '../../lib/pipelineDetailNav'
import {
  buttonPrimaryStyle,
  cardStyle,
  colors,
  fieldStyle,
  labelStyle,
  sectionTitleStyle,
  selectStyle,
} from '../../lib/uiStyles'

/** M3 route soft-hide: optionally hide /sales and /ctrm from non-admin nav. */
export default function PipelineDetailNavCard() {
  const { t } = useI18n()
  const { settings, updateSetting } = useSettings()
  const { showToast } = useToast()
  const [value, setValue] = useState('no')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValue(String(settings[HIDE_PIPELINE_DETAIL_NAV_KEY] || '').toLowerCase() === 'yes' ? 'yes' : 'no')
  }, [settings])

  async function save() {
    setSaving(true)
    try {
      await updateSetting(HIDE_PIPELINE_DETAIL_NAV_KEY, value)
      showToast(
        value === 'yes'
          ? 'AI CRM and CTRM detail links hidden from non-admin nav (URLs still work)'
          : 'AI CRM and CTRM detail links shown in nav again',
        'success',
      )
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the setting'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="pipeline-detail-nav" style={{ ...cardStyle, marginBottom: 16, scrollMarginTop: 72 }}>
      <h2 style={sectionTitleStyle}>{t('page.settings.section.pipelineDetailNav')}</h2>
      <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>
        When on, non-admins no longer see <strong>AI CRM detail</strong> or <strong>CTRM detail</strong> in the
        sidebar. Use <strong>Pipeline</strong> instead. Direct URLs keep working; admins still see both links.
      </p>
      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="hide-pipeline-detail-nav">
          Hide detail lists for non-admins
        </label>
        <select
          id="hide-pipeline-detail-nav"
          style={selectStyle}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        >
          <option value="no">Off (show in nav)</option>
          <option value="yes">On (hide from non-admins)</option>
        </select>
      </div>
      <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void save()}>
        Save
      </button>
    </section>
  )
}
