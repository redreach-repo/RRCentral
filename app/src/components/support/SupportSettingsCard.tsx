import { useCallback, useEffect, useState } from 'react'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import { SUPPORT_SETTING_KEYS, calendarFromSettings, workingDayHours } from '../../lib/sla'
import { listPolicies, savePolicy } from '../../lib/supportStore'
import { errorMessage } from '../../lib/errors'
import type { SlaPolicy } from '../../lib/types'
import {
  buttonPrimaryStyle,
  cardStyle,
  colors,
  fieldStyle,
  formGridStyle,
  inputStyle,
  labelStyle,
  sectionTitleStyle,
} from '../../lib/uiStyles'

const WEEKDAYS = [
  { iso: 1, label: 'Mon' },
  { iso: 2, label: 'Tue' },
  { iso: 3, label: 'Wed' },
  { iso: 4, label: 'Thu' },
  { iso: 5, label: 'Fri' },
  { iso: 6, label: 'Sat' },
  { iso: 7, label: 'Sun' },
]

const pad = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** SLA hours per package and account type, plus the working week the clock runs on. */
export default function SupportSettingsCard({ canPolicies, canWeek }: { canPolicies: boolean; canWeek: boolean }) {
  const { settings, updateSetting } = useSettings()
  const { showToast } = useToast()
  const [policies, setPolicies] = useState<SlaPolicy[]>([])
  const [hours, setHours] = useState<Record<string, string>>({})
  const [days, setDays] = useState<number[]>([])
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('18:00')
  const [saving, setSaving] = useState('')

  const load = useCallback(async () => {
    try {
      const list = await listPolicies()
      list.sort((a, b) => (a.applies_to === b.applies_to ? a.label.localeCompare(b.label) : a.applies_to === 'package' ? -1 : 1))
      setPolicies(list)
      setHours(Object.fromEntries(list.map((p) => [p.id, String(p.first_response_hours)])))
    } catch (e) {
      showToast(errorMessage(e, 'Could not load SLA policies'), 'error')
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const cal = calendarFromSettings(settings)
    setDays(cal.days)
    setStart(pad(cal.startMinute))
    setEnd(pad(cal.endMinute))
  }, [settings])

  async function savePolicies() {
    setSaving('policies')
    try {
      for (const p of policies) {
        const n = Number(hours[p.id])
        if (!Number.isFinite(n) || n < 0) throw new Error(`${p.label}: hours must be a number`)
        if (n !== Number(p.first_response_hours)) {
          await savePolicy(p.id, {
            applies_to: p.applies_to,
            package_id: p.package_id,
            account_type: p.account_type,
            label: p.label,
            first_response_hours: n,
          })
        }
      }
      showToast('Response times saved. New tickets use them.', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save response times'), 'error')
    } finally {
      setSaving('')
    }
  }

  async function saveWeek() {
    if (!days.length) {
      showToast('Pick at least one working day', 'error')
      return
    }
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || end <= start) {
      showToast('Opening time must be before closing time', 'error')
      return
    }
    setSaving('week')
    try {
      await updateSetting(SUPPORT_SETTING_KEYS.days, [...days].sort().join(','))
      await updateSetting(SUPPORT_SETTING_KEYS.start, start)
      await updateSetting(SUPPORT_SETTING_KEYS.end, end)
      showToast('Working week saved', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the working week'), 'error')
    } finally {
      setSaving('')
    }
  }

  const dayHours = workingDayHours(calendarFromSettings(settings))

  return (
    <section style={{ ...cardStyle, marginBottom: 16 }}>
      <h2 style={sectionTitleStyle}>Support response times</h2>
      <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.55 }}>
        Working hours to the first reply. A working day is {dayHours} hours, so 1 working day is {dayHours} and 2 are{' '}
        {dayHours * 2}. Changes apply to tickets opened after you save.
      </p>
      <div style={formGridStyle}>
        {policies.map((p) => (
          <div key={p.id} style={fieldStyle}>
            <label style={labelStyle} htmlFor={`sla-${p.id}`}>
              {p.label}
            </label>
            <input
              id={`sla-${p.id}`}
              style={inputStyle}
              inputMode="decimal"
              value={hours[p.id] ?? ''}
              disabled={!canPolicies}
              onChange={(e) => setHours((h) => ({ ...h, [p.id]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      {canPolicies ? (
        <button type="button" style={buttonPrimaryStyle} disabled={saving === 'policies'} onClick={() => void savePolicies()}>
          Save response times
        </button>
      ) : null}

      <h3 style={{ ...sectionTitleStyle, fontSize: 15, marginTop: 22 }}>Working week (Dubai time)</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {WEEKDAYS.map((d) => {
          const on = days.includes(d.iso)
          return (
            <label
              key={d.iso}
              style={{
                display: 'inline-flex',
                gap: 6,
                alignItems: 'center',
                padding: '6px 10px',
                borderRadius: 999,
                border: `1px solid ${on ? colors.accent : colors.border}`,
                fontSize: 13,
                color: on ? colors.text : colors.muted,
              }}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={!canWeek}
                onChange={(e) => setDays((all) => (e.target.checked ? [...all, d.iso] : all.filter((x) => x !== d.iso)))}
              />
              {d.label}
            </label>
          )
        })}
      </div>
      <div style={formGridStyle}>
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="support-start">
            Opens
          </label>
          <input id="support-start" type="time" style={inputStyle} value={start} disabled={!canWeek} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="support-end">
            Closes
          </label>
          <input id="support-end" type="time" style={inputStyle} value={end} disabled={!canWeek} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      {canWeek ? (
        <button type="button" style={buttonPrimaryStyle} disabled={saving === 'week'} onClick={() => void saveWeek()}>
          Save working week
        </button>
      ) : (
        <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>Only admins can change the working week.</p>
      )}
    </section>
  )
}
