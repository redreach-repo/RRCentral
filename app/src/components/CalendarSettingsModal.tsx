import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, RefreshCw } from 'lucide-react'
import Modal from './Modal'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { errorMessage } from '../lib/errors'
import { parseCalendarSettingsForm } from '../lib/schemas/calendarSettings'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../lib/listIo'
import {
  isZohoConfigured,
  listZohoCalendars,
  testZohoConnection,
  type ZohoCalendarInfo,
} from '../lib/zoho'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  colors,
  fieldStyle,
  formGridStyle,
  inputStyle,
  labelStyle,
} from '../lib/uiStyles'

const CALENDAR_SETTINGS_CSV_COLUMNS = [
  'kind',
  'uid',
  'name',
  'is_default',
  'sync_enabled',
  'domain',
  'selected_uid',
] as const

type Props = {
  open: boolean
  onClose: () => void
  onSaved?: () => void
}

function pickSettingsRow(
  objects: Array<Record<string, string>>,
): Record<string, string> | null {
  if (!objects.length) return null
  const settingsRow = objects.find((r) => String(r.kind || '').trim().toLowerCase() === 'settings')
  if (settingsRow) return settingsRow
  return (
    objects.find(
      (r) =>
        String(r.sync_enabled || '').trim() ||
        String(r.domain || '').trim() ||
        String(r.selected_uid || '').trim() ||
        String(r.uid || '').trim(),
    ) || objects[0]
  )
}

export default function CalendarSettingsModal({ open, onClose, onSaved }: Props) {
  const { settings, updateSetting } = useSettings()
  const { showToast } = useToast()
  const [enabled, setEnabled] = useState('no')
  const [domain, setDomain] = useState('https://calendar.zoho.com')
  const [calendarUid, setCalendarUid] = useState('')
  const [calendars, setCalendars] = useState<ZohoCalendarInfo[]>([])
  const [loadingCals, setLoadingCals] = useState(false)
  const [calError, setCalError] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState('')
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const configured = isZohoConfigured(settings)

  useEffect(() => {
    if (!open) return
    setEnabled((settings.zohoCalendarEnabled || 'no').toLowerCase() === 'yes' ? 'yes' : 'no')
    setDomain(settings.zohoCalendarDomain || 'https://calendar.zoho.com')
    setCalendarUid(settings.zohoCalendarUid || '')
    setTestResult('')
    setCalError('')
  }, [open, settings.zohoCalendarEnabled, settings.zohoCalendarDomain, settings.zohoCalendarUid])

  const loadCalendars = useCallback(async () => {
    if (!configured) {
      setCalendars([])
      setCalError('Add Zoho Client ID / Secret / Refresh Token in Settings first.')
      return
    }
    setLoadingCals(true)
    setCalError('')
    try {
      const draft = {
        ...settings,
        zohoCalendarEnabled: 'yes',
        zohoCalendarDomain: domain.trim() || 'https://calendar.zoho.com',
      }
      const rows = await listZohoCalendars(draft)
      setCalendars(rows)
      if (!calendarUid && rows.length) {
        const def = rows.find((c) => c.isDefault) || rows[0]
        if (def) setCalendarUid(def.uid)
      }
    } catch (e) {
      setCalendars([])
      setCalError(errorMessage(e, 'Could not list Zoho calendars'))
    } finally {
      setLoadingCals(false)
    }
  }, [configured, settings, domain, calendarUid])

  useEffect(() => {
    if (!open || !configured) return
    void loadCalendars()
  }, [open, configured]) // eslint-disable-line react-hooks/exhaustive-deps -- load once on open

  async function save() {
    const parsed = parseCalendarSettingsForm({ enabled, domain, calendarUid })
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    setSaving(true)
    try {
      await updateSetting('zohoCalendarEnabled', parsed.data.enabled)
      await updateSetting('zohoCalendarDomain', parsed.data.domain)
      await updateSetting('zohoCalendarUid', parsed.data.calendarUid)
      showToast('Calendar settings saved', 'success')
      onSaved?.()
      onClose()
    } catch (e) {
      showToast(errorMessage(e, 'Save failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function test() {
    setTesting(true)
    setTestResult('')
    try {
      const draft = {
        ...settings,
        zohoCalendarEnabled: enabled,
        zohoCalendarDomain: domain.trim(),
        zohoCalendarUid: calendarUid.trim(),
      }
      const result = await testZohoConnection(draft)
      setTestResult(result)
      showToast(result, /Calendar:.*fail|401|400/i.test(result) ? 'error' : 'success')
    } catch (e) {
      const msg = errorMessage(e, 'Test failed')
      setTestResult(msg)
      showToast(msg, 'error')
    } finally {
      setTesting(false)
    }
  }

  async function importSettingsCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, rows)
      const row = pickSettingsRow(objects)
      if (!row) {
        showToast('No calendar settings rows in CSV', 'error')
        return
      }

      const kind = String(row.kind || '').trim().toLowerCase()
      const nextEnabledRaw = String(row.sync_enabled ?? '').trim()
      const nextDomainRaw = String(row.domain ?? '').trim()
      const selectedUid = String(row.selected_uid ?? '').trim()
      const uid = String(row.uid ?? '').trim()
      const nextUid =
        selectedUid || (kind === 'settings' ? uid : '') || (kind === '' ? uid : '') || calendarUid

      if (!nextEnabledRaw && !nextDomainRaw && !selectedUid && !(kind === 'settings' && uid)) {
        showToast('CSV had no matching calendar settings fields', 'error')
        return
      }

      const nextEnabled = nextEnabledRaw
        ? nextEnabledRaw.toLowerCase() === 'yes'
          ? 'yes'
          : 'no'
        : enabled
      const nextDomain = nextDomainRaw || domain

      const parsed = parseCalendarSettingsForm({
        enabled: nextEnabled,
        domain: nextDomain,
        calendarUid: nextUid,
      })
      if (!parsed.ok) {
        showToast(parsed.error, 'error')
        return
      }

      setEnabled(parsed.data.enabled)
      setDomain(parsed.data.domain)
      setCalendarUid(parsed.data.calendarUid)

      await updateSetting('zohoCalendarEnabled', parsed.data.enabled)
      await updateSetting('zohoCalendarDomain', parsed.data.domain)
      await updateSetting('zohoCalendarUid', parsed.data.calendarUid)

      showToast('Calendar settings imported', 'success')
      onSaved?.()
    } catch (e) {
      showToast(errorMessage(e, 'Calendar settings CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <Modal open={open} title="Calendar settings" onClose={onClose} width={560}>
      <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.45 }}>
        Choose which Zoho Calendar Central uses for the Schedule board and follow-up sync. This is
        the calendar owned by the Zoho account on the refresh token in Settings (often{' '}
        <code>info@redreach.ae</code>), not each person’s personal login.
      </p>

      {!configured ? (
        <p style={{ color: colors.warn, fontSize: 13, lineHeight: 1.45 }}>
          Zoho Client ID / Secret / Refresh Token are missing.{' '}
          <Link to="/settings" style={{ color: colors.accent }} onClick={onClose}>
            Open Settings → Zoho
          </Link>{' '}
          to paste credentials first.
        </p>
      ) : null}

      <div style={formGridStyle}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Calendar sync</label>
          <select style={inputStyle} value={enabled} onChange={(e) => setEnabled(e.target.value)}>
            <option value="yes">yes — show meetings &amp; sync follow-ups</option>
            <option value="no">no — CRM follow-ups only</option>
          </select>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Calendar domain</label>
          <input
            style={inputStyle}
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="https://calendar.zoho.com"
          />
        </div>
        <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Which calendar</label>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void importSettingsCsv(file)
                }}
              />
              <button
                type="button"
                style={{ ...buttonSecondaryStyle, padding: '4px 8px', fontSize: 12 }}
                disabled={importing}
                onClick={() => importInputRef.current?.click()}
              >
                {importing ? 'Importing…' : 'Import CSV'}
              </button>
              <button
                type="button"
                style={{ ...buttonSecondaryStyle, padding: '4px 8px', fontSize: 12 }}
                disabled={calendars.length === 0 && !enabled && !domain && !calendarUid}
                onClick={() => {
                  const rows =
                    calendars.length > 0
                      ? calendars.map((c) => ({
                          kind: 'calendar',
                          uid: c.uid,
                          name: c.name,
                          is_default: c.isDefault ? 'yes' : 'no',
                          sync_enabled: enabled,
                          domain,
                          selected_uid: calendarUid,
                        }))
                      : [
                          {
                            kind: 'settings',
                            uid: calendarUid,
                            name: '',
                            is_default: '',
                            sync_enabled: enabled,
                            domain,
                            selected_uid: calendarUid,
                          },
                        ]
                  exportListCsv(
                    'calendar-settings.csv',
                    [...CALENDAR_SETTINGS_CSV_COLUMNS],
                    rows,
                  )
                  showToast('Calendar settings CSV downloaded', 'success')
                }}
              >
                Export CSV
              </button>
              <button
                type="button"
                style={{ ...buttonSecondaryStyle, padding: '4px 8px', fontSize: 12 }}
                disabled={!configured || loadingCals}
                onClick={() => void loadCalendars()}
              >
                {loadingCals ? <Loader2 size={12} /> : <RefreshCw size={12} />}
                Reload list
              </button>
            </span>
          </div>
          {calendars.length > 0 ? (
            <select
              style={{ ...inputStyle, marginTop: 8 }}
              value={calendarUid}
              onChange={(e) => setCalendarUid(e.target.value)}
            >
              <option value="">Default calendar (auto)</option>
              {calendars.map((c) => (
                <option key={c.uid} value={c.uid}>
                  {c.name}
                  {c.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
          ) : (
            <input
              style={{ ...inputStyle, marginTop: 8 }}
              value={calendarUid}
              onChange={(e) => setCalendarUid(e.target.value)}
              placeholder="Leave blank for default, or paste Calendar UID"
            />
          )}
          {calError ? (
            <p style={{ color: colors.danger, fontSize: 12, margin: '6px 0 0' }}>{calError}</p>
          ) : (
            <p style={{ color: colors.muted2, fontSize: 12, margin: '6px 0 0' }}>
              Leave blank to use Zoho’s default calendar for that account.
            </p>
          )}
        </div>
      </div>

      {testResult ? (
        <p style={{ color: colors.muted, fontSize: 12, margin: '0 0 12px', lineHeight: 1.45 }}>
          {testResult}
        </p>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
        <Link
          to="/settings"
          onClick={onClose}
          style={{ ...buttonSecondaryStyle, textDecoration: 'none', alignSelf: 'center' }}
        >
          Full Zoho settings
        </Link>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={testing || !configured}
            onClick={() => void test()}
          >
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
