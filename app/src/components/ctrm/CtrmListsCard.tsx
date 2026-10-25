import { useEffect, useState } from 'react'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import { CTRM_LISTS } from '../../lib/ctrmLists'
import { parseSettingsList } from '../../lib/fitSheet'
import { buttonPrimaryStyle, cardStyle, colors, fieldStyle, inputStyle, labelStyle, sectionTitleStyle } from '../../lib/uiStyles'

/** Settings card for the CTRM Next pick lists, one item per line. */
export default function CtrmListsCard() {
  const { settings, updateSetting } = useSettings()
  const { showToast } = useToast()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

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

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <h2 style={sectionTitleStyle}>CTRM Next lists</h2>
      <p style={{ color: colors.muted, fontSize: 13, marginTop: 0 }}>One item per line. Leave a list empty to go back to the standard one.</p>
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
