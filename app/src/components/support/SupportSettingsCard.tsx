import { useCallback, useEffect, useRef, useState } from 'react'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import { SUPPORT_SETTING_KEYS, calendarFromSettings, workingDayHours } from '../../lib/sla'
import { parseSupportPoliciesForm, parseSupportWeekForm } from '../../lib/schemas/supportSettings'
import { listPolicies, savePolicy } from '../../lib/supportStore'
import { errorMessage } from '../../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import type { SlaPolicy } from '../../lib/types'
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

function parseWorkingDaysCsv(raw: string): number[] {
  const parts = raw
    .trim()
    .split(/[\s,;|]+/)
    .map((p) => p.trim())
    .filter(Boolean)
  const out: number[] = []
  for (const part of parts) {
    const byLabel = WEEKDAYS.find((w) => w.label.toLowerCase() === part.toLowerCase())
    if (byLabel) {
      out.push(byLabel.iso)
      continue
    }
    const n = Number(part)
    if (Number.isInteger(n) && n >= 1 && n <= 7) out.push(n)
  }
  return [...new Set(out)].sort((a, b) => a - b)
}

function matchPolicy(policies: SlaPolicy[], row: Record<string, string>): SlaPolicy | undefined {
  const applies = String(row.applies_to || '').trim()
  const packageId = String(row.package_id || '').trim()
  const accountType = String(row.account_type || '').trim()
  const label = String(row.label || '').trim()
  if (applies === 'package' && packageId) {
    const byPkg = policies.find((p) => p.applies_to === 'package' && (p.package_id || '') === packageId)
    if (byPkg) return byPkg
  }
  if (applies === 'account_type' && accountType) {
    const byType = policies.find((p) => p.applies_to === 'account_type' && (p.account_type || '') === accountType)
    if (byType) return byType
  }
  if (label) {
    return policies.find((p) => p.label.toLowerCase() === label.toLowerCase())
  }
  return undefined
}

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
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

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
    const parsed = parseSupportPoliciesForm(policies.map((p) => ({ id: p.id, label: p.label, hours: hours[p.id] ?? '' })))
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    setSaving('policies')
    try {
      for (const row of parsed.data) {
        const p = policies.find((x) => x.id === row.id)
        if (!p) continue
        if (row.first_response_hours !== Number(p.first_response_hours)) {
          await savePolicy(p.id, {
            applies_to: p.applies_to,
            package_id: p.package_id,
            account_type: p.account_type,
            label: p.label,
            first_response_hours: row.first_response_hours,
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
    const parsed = parseSupportWeekForm({ days, start, end })
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    setSaving('week')
    try {
      await updateSetting(SUPPORT_SETTING_KEYS.days, parsed.data.days.join(','))
      await updateSetting(SUPPORT_SETTING_KEYS.start, parsed.data.start)
      await updateSetting(SUPPORT_SETTING_KEYS.end, parsed.data.end)
      showToast('Working week saved', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the working week'), 'error')
    } finally {
      setSaving('')
    }
  }

  async function importSupportCsv(file: File) {
    if (!canPolicies && !canWeek) return
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      if (!objects.length) {
        showToast('No rows in CSV', 'error')
        return
      }

      const nextHours: Record<string, string> = { ...hours }
      let policiesUpdated = 0
      let policiesSkipped = 0
      const matchedIds = new Set<string>()

      if (canPolicies) {
        for (const row of objects) {
          const policy = matchPolicy(policies, row)
          const hoursRaw = String(row.first_response_hours ?? '').trim()
          if (!policy || hoursRaw === '') {
            policiesSkipped += 1
            continue
          }
          if (matchedIds.has(policy.id)) {
            policiesSkipped += 1
            continue
          }
          const n = Number(hoursRaw)
          if (!Number.isFinite(n) || n < 0) {
            policiesSkipped += 1
            continue
          }
          matchedIds.add(policy.id)
          nextHours[policy.id] = String(n)
          if (n !== Number(policy.first_response_hours)) {
            await savePolicy(policy.id, {
              applies_to: policy.applies_to,
              package_id: policy.package_id,
              account_type: policy.account_type,
              label: policy.label,
              first_response_hours: n,
            })
          }
          policiesUpdated += 1
        }
        setHours(nextHours)
      }

      let weekApplied = false
      if (canWeek) {
        const weekRow =
          objects.find((r) => String(r.working_days || r.opens || r.closes || '').trim()) || objects[0]
        const nextDays = String(weekRow.working_days || '').trim()
          ? parseWorkingDaysCsv(String(weekRow.working_days))
          : days
        const nextStart = String(weekRow.opens || '').trim() || start
        const nextEnd = String(weekRow.closes || '').trim() || end
        const parsed = parseSupportWeekForm({ days: nextDays, start: nextStart, end: nextEnd })
        if (parsed.ok) {
          setDays(parsed.data.days)
          setStart(parsed.data.start)
          setEnd(parsed.data.end)
          await updateSetting(SUPPORT_SETTING_KEYS.days, parsed.data.days.join(','))
          await updateSetting(SUPPORT_SETTING_KEYS.start, parsed.data.start)
          await updateSetting(SUPPORT_SETTING_KEYS.end, parsed.data.end)
          weekApplied = true
        }
      }

      if (canPolicies) await load()

      const parts: string[] = []
      if (canPolicies) {
        const skipNote = policiesSkipped ? ` · ${policiesSkipped} policy row(s) skipped` : ''
        parts.push(`Updated ${policiesUpdated} SLA polic${policiesUpdated === 1 ? 'y' : 'ies'}${skipNote}`)
      }
      if (weekApplied) parts.push('working week applied')
      else if (canWeek) parts.push('working week unchanged (invalid or empty)')
      showToast(parts.join(' · ') || 'Nothing imported', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Support SLA CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const dayHours = workingDayHours(calendarFromSettings(settings))
  const canImport = canPolicies || canWeek

  return (
    <section style={{ ...cardStyle, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Support response times</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importSupportCsv(file)
            }}
          />
          {canImport ? (
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
            disabled={!policies.length}
            onClick={() => {
              exportListCsv(
                'support-sla-policies.csv',
                ['label', 'applies_to', 'package_id', 'account_type', 'first_response_hours', 'working_days', 'opens', 'closes'],
                policies.map((p) => ({
                  label: p.label,
                  applies_to: p.applies_to,
                  package_id: p.package_id || '',
                  account_type: p.account_type || '',
                  first_response_hours: hours[p.id] ?? p.first_response_hours,
                  working_days: days.map((d) => WEEKDAYS.find((w) => w.iso === d)?.label || d).join(' '),
                  opens: start,
                  closes: end,
                })),
              )
              showToast('Support SLA CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
        </div>
      </div>
      <p style={{ color: colors.muted, fontSize: 13, marginTop: 8, lineHeight: 1.55 }}>
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
