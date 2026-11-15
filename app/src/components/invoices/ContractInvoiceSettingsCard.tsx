import { useEffect, useRef, useState } from 'react'
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
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import { parseContractInvoiceSettings } from '../../lib/schemas/contractInvoiceSettings'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, fieldStyle, formGridStyle, labelStyle, sectionTitleStyle, selectStyle } from '../../lib/uiStyles'

/** Resolve export-style "01 RR Threads" or a bare code to a division code. */
function parseDivisionValue(raw: string): string {
  const v = raw.trim()
  if (!v) return v
  const exact = DIVISIONS.find((d) => d.code === v || `${d.code} ${d.brand}` === v)
  if (exact) return exact.code
  const byPrefix = DIVISIONS.find((d) => v.startsWith(`${d.code} `))
  if (byPrefix) return byPrefix.code
  const byBrand = DIVISIONS.find((d) => d.brand.toLowerCase() === v.toLowerCase())
  if (byBrand) return byBrand.code
  return v.split(/\s+/)[0] || v
}

/** Which division and payment terms automatic contract invoices use. */
export default function ContractInvoiceSettingsCard() {
  const { settings, updateSetting } = useSettings()
  const { showToast } = useToast()
  const [division, setDivision] = useState(DEFAULT_CONTRACT_INVOICE_DIVISION)
  const [terms, setTerms] = useState(DEFAULT_CONTRACT_INVOICE_TERMS)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDivision(settings[CONTRACT_INVOICE_DIVISION_KEY] || DEFAULT_CONTRACT_INVOICE_DIVISION)
    setTerms(settings[CONTRACT_INVOICE_TERMS_KEY] || DEFAULT_CONTRACT_INVOICE_TERMS)
  }, [settings])

  async function save() {
    const parsed = parseContractInvoiceSettings({ division, terms })
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    setSaving(true)
    try {
      await updateSetting(CONTRACT_INVOICE_DIVISION_KEY, parsed.data.division)
      await updateSetting(CONTRACT_INVOICE_TERMS_KEY, parsed.data.terms)
      showToast('Contract invoice settings saved', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the settings'), 'error')
    } finally {
      setSaving(false)
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
      if (!objects.length) {
        showToast('No settings rows in CSV', 'error')
        return
      }

      let nextDivision = division
      let nextTerms = terms
      let foundDivision = false
      let foundTerms = false

      for (const row of objects) {
        const key = String(row.setting || row.key || '').trim().toLowerCase()
        const value = String(row.value ?? '').trim()
        if (!key || !value) continue
        if (key === 'division' || key === 'contract_invoice_division') {
          nextDivision = parseDivisionValue(value)
          foundDivision = true
        } else if (
          key === 'payment_terms' ||
          key === 'terms' ||
          key === 'contract_invoice_terms'
        ) {
          nextTerms = value
          foundTerms = true
        }
      }

      if (!foundDivision && !foundTerms) {
        showToast('CSV had no matching setting rows (division / payment_terms)', 'error')
        return
      }

      const parsed = parseContractInvoiceSettings({
        division: foundDivision ? nextDivision : division,
        terms: foundTerms ? nextTerms : terms,
      })
      if (!parsed.ok) {
        showToast(parsed.error, 'error')
        return
      }

      setDivision(parsed.data.division)
      setTerms(parsed.data.terms)
      await updateSetting(CONTRACT_INVOICE_DIVISION_KEY, parsed.data.division)
      await updateSetting(CONTRACT_INVOICE_TERMS_KEY, parsed.data.terms)
      showToast('Contract invoice settings imported', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Could not import contract invoice settings CSV'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <section style={{ ...cardStyle, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Automatic contract invoices</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
            style={buttonSecondaryStyle}
            disabled={importing}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            style={buttonSecondaryStyle}
            onClick={() => {
              const div = DIVISIONS.find((d) => d.code === division)
              exportListCsv(
                'contract-invoice-settings.csv',
                ['setting', 'value'],
                [
                  { setting: 'division', value: div ? `${div.code} ${div.brand}` : division },
                  { setting: 'payment_terms', value: terms },
                ],
              )
              showToast('Contract invoice settings CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
        </div>
      </div>
      <p style={{ color: colors.muted, fontSize: 13, margin: '8px 0 12px' }}>
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
