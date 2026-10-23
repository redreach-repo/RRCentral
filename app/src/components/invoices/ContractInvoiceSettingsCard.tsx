import { useEffect, useState } from 'react'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import { DIVISIONS, PAYMENT_TERMS } from '../../lib/config'
import {
  CONTRACT_INVOICE_DIVISION_KEY,
  CONTRACT_INVOICE_TERMS_KEY,
  DEFAULT_CONTRACT_INVOICE_DIVISION,
  DEFAULT_CONTRACT_INVOICE_TERMS,
} from '../../lib/contractBilling'
import { errorMessage } from '../../lib/errors'
import { buttonPrimaryStyle, cardStyle, colors, fieldStyle, formGridStyle, labelStyle, sectionTitleStyle, selectStyle } from '../../lib/uiStyles'

/** Which division and payment terms automatic contract invoices use. */
export default function ContractInvoiceSettingsCard() {
  const { settings, updateSetting } = useSettings()
  const { showToast } = useToast()
  const [division, setDivision] = useState(DEFAULT_CONTRACT_INVOICE_DIVISION)
  const [terms, setTerms] = useState(DEFAULT_CONTRACT_INVOICE_TERMS)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDivision(settings[CONTRACT_INVOICE_DIVISION_KEY] || DEFAULT_CONTRACT_INVOICE_DIVISION)
    setTerms(settings[CONTRACT_INVOICE_TERMS_KEY] || DEFAULT_CONTRACT_INVOICE_TERMS)
  }, [settings])

  async function save() {
    setSaving(true)
    try {
      await updateSetting(CONTRACT_INVOICE_DIVISION_KEY, division)
      await updateSetting(CONTRACT_INVOICE_TERMS_KEY, terms)
      showToast('Contract invoice settings saved', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the settings'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section style={{ ...cardStyle, marginBottom: 16 }}>
      <h2 style={sectionTitleStyle}>Automatic contract invoices</h2>
      <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 12px' }}>
        Used for the setup fee and monthly invoices raised from contracts. The division sets the RR reference number given
        when you finalise each draft. Payment reminders go out 3, 7 and 14 days after the due date.
      </p>
      <div style={formGridStyle}>
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="ci-division">
            Division
          </label>
          <select id="ci-division" style={selectStyle} value={division} onChange={(e) => setDivision(e.target.value)}>
            {DIVISIONS.map((d) => (
              <option key={d.code} value={d.code}>
                {d.code} {d.brand}
              </option>
            ))}
          </select>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="ci-terms">
            Payment terms
          </label>
          <select id="ci-terms" style={selectStyle} value={terms} onChange={(e) => setTerms(e.target.value)}>
            {PAYMENT_TERMS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void save()}>
        Save
      </button>
    </section>
  )
}
