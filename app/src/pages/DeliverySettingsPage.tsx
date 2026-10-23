import { useCallback, useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import SupportSettingsCard from '../components/support/SupportSettingsCard'
import ContractInvoiceSettingsCard from '../components/invoices/ContractInvoiceSettingsCard'
import { DEFAULT_DELIVERY_RATES, DELIVERY_RATE_KEYS, type DeliveryRates, ratesFromSettings } from '../lib/delivery'
import { listPackages, updatePackage } from '../lib/deliveryStore'
import { can } from '../lib/permissions'
import { errorMessage } from '../lib/errors'
import type { DeliveryPackage } from '../lib/types'
import {
  buttonPrimaryStyle,
  cardStyle,
  colors,
  fieldStyle,
  formGridStyle,
  inputStyle,
  labelStyle,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
  sectionTitleStyle,
} from '../lib/uiStyles'

type NumericField = Exclude<
  keyof DeliveryPackage,
  'id' | 'code' | 'name' | 'support_response' | 'active' | 'updated_at' | 'sort'
>

const PACKAGE_FIELDS: { key: NumericField; label: string; optional?: boolean }[] = [
  { key: 'monthly_fee_a', label: 'Monthly AED (option A)' },
  { key: 'setup_fee_b', label: 'Setup fee AED (option B)' },
  { key: 'monthly_fee_b', label: 'Monthly AED (option B)' },
  { key: 'target_hours', label: 'Target hours a month' },
  { key: 'build_hours_target', label: 'Build hours target' },
  { key: 'included_whatsapp', label: 'Included WhatsApp conversations' },
  { key: 'support_response_days', label: 'Support response, working days (0 = same day)' },
  { key: 'ai_cap_usd', label: 'AI cap a month, USD (blank = not set)', optional: true },
  { key: 'included_lead_credits_usd', label: 'Included lead credits a month, USD', optional: true },
  { key: 'tool_cost_aed', label: 'Fixed tool cost a month, AED (estimate)' },
]

const RATE_FIELDS: { key: keyof DeliveryRates; label: string }[] = [
  { key: 'marketingRateAed', label: 'Marketing message above plan, AED' },
  { key: 'serviceRateAed', label: 'Service or utility message above plan, AED' },
  { key: 'aiMarkupPercent', label: 'AI usage above cap, markup %' },
  { key: 'leadMarkupPercent', label: 'Extra lead credits, markup %' },
  { key: 'internalHourlyRateAed', label: 'Internal hourly rate, AED' },
  { key: 'usdToAed', label: 'USD to AED rate' },
  { key: 'fixedMonthlyCostAed', label: 'Fixed costs a month, AED (estimate, for the dashboard)' },
]

type PackageDraft = Record<string, string>

function toDraft(p: DeliveryPackage): PackageDraft {
  const d: PackageDraft = { name: p.name, support_response: p.support_response }
  for (const f of PACKAGE_FIELDS) d[f.key] = p[f.key] == null ? '' : String(p[f.key])
  return d
}

export default function DeliverySettingsPage() {
  const { userRole } = useAuth()
  const { settings, updateSetting } = useSettings()
  const { showToast } = useToast()
  const [packages, setPackages] = useState<DeliveryPackage[]>([])
  const [drafts, setDrafts] = useState<Record<string, PackageDraft>>({})
  const [rateDraft, setRateDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState('')
  const canPackages = can(userRole, 'delivery.packages')
  const canRates = can(userRole, 'delivery.rates')

  const load = useCallback(async () => {
    try {
      const list = await listPackages()
      setPackages(list)
      setDrafts(Object.fromEntries(list.map((p) => [p.id, toDraft(p)])))
    } catch (e) {
      showToast(errorMessage(e, 'Could not load packages'), 'error')
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const rates = ratesFromSettings(settings)
    setRateDraft(Object.fromEntries(RATE_FIELDS.map((f) => [f.key, String(rates[f.key])])))
  }, [settings])

  async function savePackage(p: DeliveryPackage) {
    const d = drafts[p.id]
    const patch: Partial<DeliveryPackage> = { name: d.name.trim() || p.name, support_response: d.support_response.trim() }
    for (const f of PACKAGE_FIELDS) {
      const raw = d[f.key].trim()
      if (raw === '' && f.optional) {
        ;(patch as Record<string, unknown>)[f.key] = null
        continue
      }
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) {
        showToast(`${f.label} must be a number`, 'error')
        return
      }
      ;(patch as Record<string, unknown>)[f.key] = n
    }
    setSaving(p.id)
    try {
      await updatePackage(p.id, patch)
      showToast(`${patch.name} saved`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the package'), 'error')
    } finally {
      setSaving('')
    }
  }

  async function saveRates() {
    setSaving('rates')
    try {
      for (const f of RATE_FIELDS) {
        const n = Number(rateDraft[f.key])
        if (!Number.isFinite(n) || n < 0) throw new Error(`${f.label} must be a number`)
        await updateSetting(DELIVERY_RATE_KEYS[f.key], String(n))
      }
      showToast('Rates saved', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the rates'), 'error')
    } finally {
      setSaving('')
    }
  }

  if (!canPackages) {
    return (
      <div style={pageStyle}>
        <EmptyState icon={<Package size={22} />} title="Managers and admins only" subtitle="Ask Alfred if a package needs changing." />
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <h1 style={pageTitleStyle}>Packages and rates</h1>
      <p style={pageSubtitleStyle}>
        The AI CRM package catalogue, the rates used for overage and profitability, and support response times. Prices exclude 5% VAT.
        Changes apply to new contracts; existing contracts keep the fees saved on them.
      </p>

      <section style={{ ...cardStyle, marginBottom: 16 }}>
        <h2 style={sectionTitleStyle}>Overage and costing rates</h2>
        <div style={formGridStyle}>
          {RATE_FIELDS.map((f) => (
            <div key={f.key} style={fieldStyle}>
              <label style={labelStyle}>{f.label}</label>
              <input
                style={inputStyle}
                inputMode="decimal"
                value={rateDraft[f.key] ?? ''}
                disabled={!canRates}
                placeholder={String(DEFAULT_DELIVERY_RATES[f.key])}
                onChange={(e) => setRateDraft((r) => ({ ...r, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        {canRates ? (
          <button type="button" style={buttonPrimaryStyle} disabled={saving === 'rates'} onClick={() => void saveRates()}>
            Save rates
          </button>
        ) : (
          <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>Only admins can change rates.</p>
        )}
      </section>

      <ContractInvoiceSettingsCard />

      <SupportSettingsCard canPolicies={can(userRole, 'support.policies')} canWeek={can(userRole, 'support.workingWeek')} />

      {packages.length === 0 ? (
        <EmptyState
          icon={<Package size={22} />}
          title="No packages yet"
          subtitle="Run supabase/migrations/20261024090000_client_delivery.sql in Supabase to add Starter, Growth and Done for you."
        />
      ) : (
        packages.map((p) => {
          const d = drafts[p.id]
          if (!d) return null
          return (
            <section key={p.id} style={{ ...cardStyle, marginBottom: 16 }}>
              <div style={formGridStyle}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Package name</label>
                  <input
                    style={inputStyle}
                    value={d.name}
                    onChange={(e) => setDrafts((all) => ({ ...all, [p.id]: { ...d, name: e.target.value } }))}
                  />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Support response (shown to the team)</label>
                  <input
                    style={inputStyle}
                    value={d.support_response}
                    onChange={(e) =>
                      setDrafts((all) => ({ ...all, [p.id]: { ...d, support_response: e.target.value } }))
                    }
                  />
                </div>
                {PACKAGE_FIELDS.map((f) => (
                  <div key={f.key} style={fieldStyle}>
                    <label style={labelStyle}>{f.label}</label>
                    <input
                      style={inputStyle}
                      inputMode="decimal"
                      value={d[f.key]}
                      onChange={(e) => setDrafts((all) => ({ ...all, [p.id]: { ...d, [f.key]: e.target.value } }))}
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                style={buttonPrimaryStyle}
                disabled={saving === p.id}
                onClick={() => void savePackage(p)}
              >
                Save {p.name}
              </button>
            </section>
          )
        })
      )}
    </div>
  )
}
