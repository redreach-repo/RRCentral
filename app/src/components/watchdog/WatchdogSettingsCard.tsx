import { useEffect, useState } from 'react'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import { parseWatchdogSettingsForm } from '../../lib/schemas/watchdogSettings'
import { exportListCsv } from '../../lib/listIo'
import { DEFAULT_STALE_DAYS, STALE_DAY_KEYS, staleDays, type Pipeline } from '../../lib/watchdog'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, fieldStyle, formGridStyle, inputStyle, labelStyle, sectionTitleStyle } from '../../lib/uiStyles'

const LABELS: Record<Pipeline, string> = { crm: 'CRM leads', sales: 'AI CRM sales deals', ctrm: 'CTRM Next deals' }

/** Days without a touch before the watchdog calls an open deal stale, per pipeline. */
export default function WatchdogSettingsCard() {
  const { settings, updateSetting } = useSettings()
  const { showToast } = useToast()
  const [days, setDays] = useState<Record<Pipeline, string>>({ crm: '', sales: '', ctrm: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const d = staleDays(settings)
    setDays({ crm: String(d.crm), sales: String(d.sales), ctrm: String(d.ctrm) })
  }, [settings])

  async function save() {
    const parsed = parseWatchdogSettingsForm(days)
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    setSaving(true)
    try {
      for (const p of Object.keys(parsed.data) as Pipeline[]) {
        await updateSetting(STALE_DAY_KEYS[p], String(parsed.data[p]))
      }
      showToast('Watchdog settings saved', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the settings'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section style={{ ...cardStyle, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Watchdog: stale deals</h2>
        <button
          type="button"
          style={buttonSecondaryStyle}
          onClick={() => {
            exportListCsv(
              'watchdog-stale-days.csv',
              ['pipeline', 'stale_days', 'default_days'],
              (Object.keys(LABELS) as Pipeline[]).map((p) => ({
                pipeline: LABELS[p],
                stale_days: days[p],
                default_days: DEFAULT_STALE_DAYS[p],
              })),
            )
            showToast('Watchdog settings CSV downloaded', 'success')
          }}
        >
          Export CSV
        </button>
      </div>
      <p style={{ color: colors.muted, fontSize: 13, margin: '8px 0 12px' }}>
        The 07:30 watchdog lists an open deal as stale after this many days without a touch. Defaults: CRM{' '}
        {DEFAULT_STALE_DAYS.crm}, AI CRM sales {DEFAULT_STALE_DAYS.sales}, CTRM {DEFAULT_STALE_DAYS.ctrm}.
      </p>
      <div style={formGridStyle}>
        {(Object.keys(LABELS) as Pipeline[]).map((p) => (
          <div key={p} style={fieldStyle}>
            <label style={labelStyle} htmlFor={`stale-${p}`}>
              {LABELS[p]} (days)
            </label>
            <input
              id={`stale-${p}`}
              style={inputStyle}
              type="number"
              min={1}
              max={365}
              value={days[p]}
              onChange={(e) => setDays((d) => ({ ...d, [p]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void save()}>
        Save
      </button>
    </section>
  )
}
