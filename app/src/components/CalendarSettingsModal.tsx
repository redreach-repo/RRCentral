import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, RefreshCw } from 'lucide-react'
import Modal from './Modal'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { errorMessage } from '../lib/errors'
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

type Props = {
  open: boolean
  onClose: () => void
  onSaved?: () => void
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
    setSaving(true)
    try {
      await updateSetting('zohoCalendarEnabled', enabled)
      await updateSetting('zohoCalendarDomain', domain.trim() || 'https://calendar.zoho.com')
      await updateSetting('zohoCalendarUid', calendarUid.trim())
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Which calendar</label>
            <button
              type="button"
              style={{ ...buttonSecondaryStyle, padding: '4px 8px', fontSize: 12 }}
              disabled={!configured || loadingCals}
              onClick={() => void loadCalendars()}
            >
              {loadingCals ? <Loader2 size={12} /> : <RefreshCw size={12} />}
              Reload list
            </button>
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
