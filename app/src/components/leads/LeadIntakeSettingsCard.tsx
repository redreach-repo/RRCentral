import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import { listTeam } from '../../lib/accountsStore'
import { errorMessage } from '../../lib/errors'
import { canSetLeadOwners, DEFAULT_LEAD_WHATSAPP, LEAD_OWNER_KEYS, LEAD_WHATSAPP_KEY } from '../../lib/leadIntake'
import type { AppUser } from '../../lib/types'
import { buttonPrimaryStyle, cardStyle, colors, fieldStyle, formGridStyle, inputStyle, labelStyle, sectionTitleStyle } from '../../lib/uiStyles'

/** Who gets new leads from lead-intake, and the number WhatsApp links open. */
export default function LeadIntakeSettingsCard() {
  const { userRole } = useAuth()
  const { settings, updateSetting } = useSettings()
  const { showToast } = useToast()
  const [team, setTeam] = useState<AppUser[]>([])
  const [mode, setMode] = useState('fixed')
  const [fixed, setFixed] = useState('')
  const [pool, setPool] = useState<string[]>([])
  const [whatsapp, setWhatsapp] = useState('')
  const [saving, setSaving] = useState(false)
  const allowed = canSetLeadOwners(userRole)

  useEffect(() => {
    if (allowed) void listTeam().then(setTeam)
  }, [allowed])

  useEffect(() => {
    setMode(settings[LEAD_OWNER_KEYS.mode] === 'round_robin' ? 'round_robin' : 'fixed')
    setFixed(settings[LEAD_OWNER_KEYS.fixed] || '')
    setPool(String(settings[LEAD_OWNER_KEYS.pool] || '').split(',').filter(Boolean))
    setWhatsapp(settings[LEAD_WHATSAPP_KEY] || '')
  }, [settings])

  if (!allowed) return null
  const sellers = team.filter((u) => u.role === 'admin' || u.role === 'manager' || u.role === 'sales')

  async function save() {
    if (mode === 'round_robin' && pool.length === 0) {
      showToast('Tick at least one person for the round robin', 'error')
      return
    }
    const digits = whatsapp.replace(/\D/g, '')
    if (whatsapp && digits.length < 8) {
      showToast('Enter the WhatsApp number with the country code, for example 971501234567', 'error')
      return
    }
    setSaving(true)
    try {
      await updateSetting(LEAD_OWNER_KEYS.mode, mode)
      await updateSetting(LEAD_OWNER_KEYS.fixed, fixed)
      await updateSetting(LEAD_OWNER_KEYS.pool, pool.join(','))
      await updateSetting(LEAD_WHATSAPP_KEY, digits)
      showToast('Lead settings saved', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the settings'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section style={{ ...cardStyle, marginBottom: 16 }}>
      <h2 style={sectionTitleStyle}>New leads: who gets them</h2>
      <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 12px' }}>
        Leads from the website, WhatsApp and the AI CRM landing page get this owner. With no owner set they
        arrive unassigned and show on the dashboard for everyone in sales.
      </p>
      <div style={formGridStyle}>
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="lead-mode">
            How
          </label>
          <select id="lead-mode" style={inputStyle} value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="fixed">Always the same person</option>
            <option value="round_robin">Take turns (round robin)</option>
          </select>
        </div>
        {mode === 'fixed' ? (
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="lead-fixed">
              Owner
            </label>
            <select id="lead-fixed" style={inputStyle} value={fixed} onChange={(e) => setFixed(e.target.value)}>
              <option value="">Nobody (unassigned)</option>
              {sellers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <fieldset style={{ ...fieldStyle, border: 'none', padding: 0, margin: 0 }}>
            <legend style={labelStyle}>Taking turns</legend>
            {sellers.map((u) => (
              <label key={u.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={pool.includes(u.id)}
                  onChange={(e) => setPool((p) => (e.target.checked ? [...p, u.id] : p.filter((id) => id !== u.id)))}
                />
                {u.name || u.email}
              </label>
            ))}
          </fieldset>
        )}
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="lead-wa">
            WhatsApp number for click to chat links
          </label>
          <input
            id="lead-wa"
            style={inputStyle}
            value={whatsapp}
            placeholder={DEFAULT_LEAD_WHATSAPP}
            onChange={(e) => setWhatsapp(e.target.value)}
          />
        </div>
      </div>
      <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void save()}>
        Save
      </button>
    </section>
  )
}
