import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { Plane, Plus, Shield } from 'lucide-react'
import WandersTourOpsPanel from './WandersTourOpsPanel'
import {
  WANDERS_BOOKING_STATUSES,
  WANDERS_COMM_CHANNELS,
  WANDERS_CUSTOMER_TYPES,
  WANDERS_DESTINATION_REGIONS,
  WANDERS_FLIGHT_STATES,
  WANDERS_LOST_REASONS,
  WANDERS_PRODUCT_TYPES,
  WANDERS_SALES_STAGES,
  WANDERS_SOURCE_MARKETS,
  WANDERS_VISA_STATUSES,
  resolveWandersBaseCurrency,
} from '../lib/wandersConfig'
import { buildWandersTermsText } from '../lib/wandersTerms'
import {
  QUALIFICATION_MESSAGE,
  acceptWandersTerms,
  deletePassenger,
  emptyWandersDeal,
  ensureTourPackagesSeeded,
  ensureWandersSettings,
  loadPassengers,
  loadWandersDeals,
  quoteFollowUpMessage,
  recomputeCommercial,
  savePassenger,
  saveWandersDeal,
} from '../lib/wandersDeals'
import type { TourPackage, WandersDeal, WandersPassenger } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import StatusPill from '../components/StatusPill'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  fieldStyle,
  formGridStyle,
  inputStyle,
  labelStyle,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
  selectStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
  toolbarStyle,
  sectionTitleStyle,
} from '../lib/uiStyles'
import { buildWhatsAppUrl } from '../lib/whatsapp'

type Tab = 'trip' | 'passengers' | 'commercial' | 'terms' | 'packages'
type Mode = 'leads' | 'tourops'

export default function WandersPage() {
  const { user, userRole } = useAuth()
  const { settings, refresh } = useSettings()
  const { showToast } = useToast()
  const [mode, setMode] = useState<Mode>('leads')
  const [deals, setDeals] = useState<WandersDeal[]>([])
  const [packages, setPackages] = useState<TourPackage[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [form, setForm] = useState<WandersDeal | null>(null)
  const [passengers, setPassengers] = useState<WandersPassenger[]>([])
  const [tab, setTab] = useState<Tab>('trip')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [paxOpen, setPaxOpen] = useState(false)
  const [paxForm, setPaxForm] = useState<WandersPassenger | null>(null)
  const [stageFilter, setStageFilter] = useState('All')
  const canViewSensitive = userRole === 'admin' || userRole === 'sales'

  const baseCurrency = resolveWandersBaseCurrency(settings.wandersBaseCurrency)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      await ensureWandersSettings()
      await refresh()
      const [d, pkgs] = await Promise.all([loadWandersDeals(), ensureTourPackagesSeeded()])
      setDeals(d)
      setPackages(pkgs)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load Wanders CRM', 'error')
    } finally {
      setLoading(false)
    }
  }, [refresh, showToast])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!selectedId) {
      setForm(null)
      setPassengers([])
      return
    }
    const d = deals.find((x) => x.id === selectedId)
    setForm(d ? { ...d } : null)
    void loadPassengers(selectedId)
      .then(setPassengers)
      .catch((e) => showToast(e instanceof Error ? e.message : 'Passenger load failed', 'error'))
  }, [selectedId, deals, showToast])

  const filtered = useMemo(() => {
    if (stageFilter === 'All') return deals
    return deals.filter((d) => d.sales_stage === stageFilter)
  }, [deals, stageFilter])

  function newDeal() {
    const d = emptyWandersDeal({
      sales_owner: user?.email || '',
      operations_owner: user?.email || '',
      deposit_percent: Number(settings.wandersDepositPercent) || 50,
      hold_business_days: Number(settings.wandersHoldBusinessDays) || 3,
      terms_version: settings.wandersTermsVersion || 'WAN-TERMS-2026-07-DRAFT',
      booking_currency: baseCurrency,
      quote_currency: baseCurrency,
      budget_currency: baseCurrency,
      terms_text: buildWandersTermsText({
        depositPercent: Number(settings.wandersDepositPercent) || 50,
        holdBusinessDays: Number(settings.wandersHoldBusinessDays) || 3,
        balanceDaysBefore: settings.wandersBalanceDaysBefore || '30-45',
        version: settings.wandersTermsVersion,
        governingLaw: settings.wandersGoverningLaw,
        disputeJurisdiction: settings.wandersDisputeJurisdiction,
      }),
    })
    setDeals((prev) => [d, ...prev])
    setSelectedId(d.id)
    setForm(d)
    setTab('trip')
  }

  async function saveDeal() {
    if (!form) return
    if (!form.client_name.trim()) {
      showToast('Client / booker name is required', 'error')
      return
    }
    setSaving(true)
    try {
      const saved = await saveWandersDeal(form, user?.email || '')
      setDeals((prev) => {
        const others = prev.filter((d) => d.id !== saved.id)
        return [saved, ...others]
      })
      setForm(saved)
      setSelectedId(saved.id)
      showToast('Wanders deal saved', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function recordTermsAcceptance() {
    if (!form) return
    if (!form.terms_version) {
      showToast('Terms version required before acceptance', 'error')
      return
    }
    const acceptedBy = window.prompt('Accepted by (customer name)', form.lead_contact || form.client_name)
    if (!acceptedBy) return
    setSaving(true)
    try {
      const { deal } = await acceptWandersTerms({
        deal: form,
        acceptedBy,
        method: 'Recorded in CRM',
        userEmail: user?.email || '',
        governingLaw: settings.wandersGoverningLaw,
        disputeJurisdiction: settings.wandersDisputeJurisdiction,
      })
      setForm(deal)
      setDeals((prev) => prev.map((d) => (d.id === deal.id ? deal : d)))
      showToast('Terms acceptance recorded (immutable copy stored)', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Acceptance failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  function applyPackage(pkg: TourPackage) {
    if (!form) return
    setForm((f) =>
      f
        ? {
            ...f,
            package_code: pkg.code,
            product_type: pkg.product_type,
            destination_regions: pkg.destination,
            nights: pkg.nights,
            quote_currency: pkg.default_currency || f.quote_currency,
            notes: [f.notes, pkg.summary].filter(Boolean).join('\n'),
          }
        : f,
    )
    showToast(`Applied package ${pkg.code} (internal catalogue)`, 'success')
  }

  function openNewPassenger() {
    if (!form) return
    setPaxForm({
      id: crypto.randomUUID(),
      deal_id: form.id,
      title: '',
      full_passport_name: '',
      is_lead: passengers.length === 0,
      passport_number: '',
      nationality: '',
      date_of_birth: null,
      gender: '',
      passport_issue_date: null,
      passport_expiry_date: null,
      passport_issuing_country: '',
      country_of_residence: '',
      residency_status: '',
      visa_status: '',
      mobile: '',
      email: '',
      emergency_contact: '',
      dietary_requirements: '',
      medical_accessibility_notes: '',
      passenger_class: 'Adult',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: user?.email || '',
    })
    setPaxOpen(true)
  }

  async function savePax() {
    if (!paxForm || !canViewSensitive) return
    setSaving(true)
    try {
      const saved = await savePassenger(paxForm, user?.email || '')
      setPassengers((prev) => {
        const others = prev.filter((p) => p.id !== saved.id)
        return [...others, saved]
      })
      setPaxOpen(false)
      showToast('Passenger saved (private record)', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Passenger save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const commercial = form ? recomputeCommercial(form) : null

  return (
    <div style={pageStyle}>
      <div style={toolbarStyle}>
        <div>
          <h1 style={pageTitleStyle}>RR Wanders CRM</h1>
          <p style={pageSubtitleStyle}>
            Travel deals, packages, partners, departures and bookings — separate from RR Threads. Base
            currency: <strong>{baseCurrency}</strong>
            {baseCurrency === 'TBC' ? ' (confirm in Settings before production)' : ''}.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            style={{
              ...buttonSecondaryStyle,
              background: mode === 'leads' ? colors.accent : 'rgba(255,255,255,0.06)',
              borderColor: mode === 'leads' ? colors.accent : colors.border,
            }}
            onClick={() => setMode('leads')}
          >
            Customer leads
          </button>
          <button
            type="button"
            style={{
              ...buttonSecondaryStyle,
              background: mode === 'tourops' ? colors.accent : 'rgba(255,255,255,0.06)',
              borderColor: mode === 'tourops' ? colors.accent : colors.border,
            }}
            onClick={() => setMode('tourops')}
          >
            Tour products & ops
          </button>
          {mode === 'leads' ? (
            <button type="button" style={buttonPrimaryStyle} onClick={newDeal}>
              <Plus size={16} /> New enquiry
            </button>
          ) : null}
        </div>
      </div>

      {mode === 'tourops' ? (
        <WandersTourOpsPanel deals={deals} />
      ) : (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(260px, 320px) 1fr',
          gap: 16,
          alignItems: 'start',
        }}
        className="wanders-grid"
      >
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${colors.border}` }}>
            <label style={labelStyle}>Sales stage</label>
            <select
              style={selectStyle}
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
            >
              <option value="All">All</option>
              {WANDERS_SALES_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {loading ? (
            <div style={{ padding: 16, color: colors.muted }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Plane size={22} />}
              title="No Wanders deals yet"
              subtitle="Create an enquiry — Threads CRM stays unchanged."
            />
          ) : (
            <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
              {filtered.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedId(d.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '12px 14px',
                    border: 'none',
                    borderBottom: `1px solid ${colors.border}`,
                    background: selectedId === d.id ? 'rgba(96,165,250,0.12)' : 'transparent',
                    color: colors.text,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{d.client_name || 'Untitled'}</div>
                  <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    {d.destination_regions || '—'} · {d.sales_stage}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <StatusPill status={d.booking_status} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          {!form ? (
            <EmptyState
              icon={<Plane size={22} />}
              title="Select a deal"
              subtitle="Or start a new enquiry for Kerala / Philippines tours."
            />
          ) : (
            <>
              <div style={{ ...cardStyle, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>{form.client_name || 'New enquiry'}</div>
                    <div style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
                      Sales: {form.sales_owner || '—'} · Ops: {form.operations_owner || '—'} · Package{' '}
                      {form.package_code || '—'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <a
                      href={buildWhatsAppUrl(
                        form.mobile,
                        QUALIFICATION_MESSAGE.replace('[Name]', form.lead_contact || form.client_name || 'there'),
                        settings.whatsappCountryCode || '971',
                      )}
                      target="_blank"
                      rel="noreferrer"
                      style={{ ...buttonSecondaryStyle, textDecoration: 'none' }}
                    >
                      Qualify WhatsApp
                    </a>
                    <a
                      href={buildWhatsAppUrl(
                        form.mobile,
                        quoteFollowUpMessage(form.lead_contact || form.client_name, form.destination_regions),
                        settings.whatsappCountryCode || '971',
                      )}
                      target="_blank"
                      rel="noreferrer"
                      style={{ ...buttonSecondaryStyle, textDecoration: 'none' }}
                    >
                      Quote follow-up
                    </a>
                    <Link to="/payments" style={{ ...buttonSecondaryStyle, textDecoration: 'none' }}>
                      Payments
                    </Link>
                    <Link
                      to={`/quotations?client=${encodeURIComponent(form.client_name)}&new=1&division=02`}
                      style={{ ...buttonSecondaryStyle, textDecoration: 'none' }}
                    >
                      Create quote
                    </Link>
                    <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void saveDeal()}>
                      Save deal
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {(
                  [
                    ['trip', 'Trip'],
                    ['passengers', 'Passengers'],
                    ['commercial', 'Deposit & value'],
                    ['terms', 'Terms'],
                    ['packages', 'Packages'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    style={{
                      ...buttonSecondaryStyle,
                      background: tab === id ? colors.accent : 'rgba(255,255,255,0.06)',
                      borderColor: tab === id ? colors.accent : colors.border,
                    }}
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'trip' ? (
                <div style={cardStyle}>
                  <h2 style={sectionTitleStyle}>Trip & pipeline</h2>
                  <div style={formGridStyle}>
                    <Field label="Client / booker">
                      <input
                        style={inputStyle}
                        value={form.client_name}
                        onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                      />
                    </Field>
                    <Field label="Lead contact">
                      <input
                        style={inputStyle}
                        value={form.lead_contact}
                        onChange={(e) => setForm({ ...form, lead_contact: e.target.value })}
                      />
                    </Field>
                    <Field label="Email">
                      <input
                        style={inputStyle}
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                      />
                    </Field>
                    <Field label="Mobile">
                      <input
                        style={inputStyle}
                        value={form.mobile}
                        onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                      />
                    </Field>
                    <Field label="Customer type">
                      <select
                        style={selectStyle}
                        value={form.customer_type}
                        onChange={(e) => setForm({ ...form, customer_type: e.target.value })}
                      >
                        {WANDERS_CUSTOMER_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Source market">
                      <select
                        style={selectStyle}
                        value={form.source_market}
                        onChange={(e) => setForm({ ...form, source_market: e.target.value })}
                      >
                        {WANDERS_SOURCE_MARKETS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Destination region">
                      <select
                        style={selectStyle}
                        value={form.destination_regions}
                        onChange={(e) => setForm({ ...form, destination_regions: e.target.value })}
                      >
                        {WANDERS_DESTINATION_REGIONS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Product type">
                      <select
                        style={selectStyle}
                        value={form.product_type}
                        onChange={(e) => setForm({ ...form, product_type: e.target.value })}
                      >
                        {WANDERS_PRODUCT_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Departure date">
                      <input
                        type="date"
                        style={inputStyle}
                        value={form.departure_date || ''}
                        onChange={(e) => setForm({ ...form, departure_date: e.target.value || null })}
                      />
                    </Field>
                    <Field label="Return date">
                      <input
                        type="date"
                        style={inputStyle}
                        value={form.return_date || ''}
                        onChange={(e) => setForm({ ...form, return_date: e.target.value || null })}
                      />
                    </Field>
                    <Field label="Nights">
                      <input
                        type="number"
                        style={inputStyle}
                        value={form.nights}
                        onChange={(e) => setForm({ ...form, nights: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Departure airport">
                      <input
                        style={inputStyle}
                        value={form.departure_airport}
                        onChange={(e) => setForm({ ...form, departure_airport: e.target.value })}
                      />
                    </Field>
                    <Field label="Adults">
                      <input
                        type="number"
                        style={inputStyle}
                        value={form.adults}
                        onChange={(e) => setForm({ ...form, adults: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Children">
                      <input
                        type="number"
                        style={inputStyle}
                        value={form.children}
                        onChange={(e) => setForm({ ...form, children: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Child ages">
                      <input
                        style={inputStyle}
                        value={form.child_ages}
                        onChange={(e) => setForm({ ...form, child_ages: e.target.value })}
                      />
                    </Field>
                    <Field label="Infants">
                      <input
                        type="number"
                        style={inputStyle}
                        value={form.infants}
                        onChange={(e) => setForm({ ...form, infants: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Flights">
                      <select
                        style={selectStyle}
                        value={form.flight_state}
                        onChange={(e) => setForm({ ...form, flight_state: e.target.value })}
                      >
                        {WANDERS_FLIGHT_STATES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Visa documentation assistance">
                      <select
                        style={selectStyle}
                        value={form.visa_status}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            visa_status: e.target.value,
                            visa_assistance_required: e.target.value !== 'Not required',
                          })
                        }
                      >
                        {WANDERS_VISA_STATUSES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Sales stage">
                      <select
                        style={selectStyle}
                        value={form.sales_stage}
                        onChange={(e) => setForm({ ...form, sales_stage: e.target.value })}
                      >
                        {WANDERS_SALES_STAGES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Booking status">
                      <select
                        style={selectStyle}
                        value={form.booking_status}
                        onChange={(e) => setForm({ ...form, booking_status: e.target.value })}
                      >
                        {WANDERS_BOOKING_STATUSES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Sales owner">
                      <input
                        style={inputStyle}
                        value={form.sales_owner}
                        onChange={(e) => setForm({ ...form, sales_owner: e.target.value })}
                      />
                    </Field>
                    <Field label="Operations owner">
                      <input
                        style={inputStyle}
                        value={form.operations_owner}
                        onChange={(e) => setForm({ ...form, operations_owner: e.target.value })}
                      />
                    </Field>
                    <Field label="Next action">
                      <input
                        style={inputStyle}
                        value={form.next_action}
                        onChange={(e) => setForm({ ...form, next_action: e.target.value })}
                      />
                    </Field>
                    <Field label="Follow-up date">
                      <input
                        type="date"
                        style={inputStyle}
                        value={form.follow_up_date || ''}
                        onChange={(e) => setForm({ ...form, follow_up_date: e.target.value || null })}
                      />
                    </Field>
                    <Field label="Preferred channel">
                      <select
                        style={selectStyle}
                        value={form.preferred_channel}
                        onChange={(e) => setForm({ ...form, preferred_channel: e.target.value })}
                      >
                        {WANDERS_COMM_CHANNELS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Lost reason">
                      <select
                        style={selectStyle}
                        value={form.lost_reason}
                        onChange={(e) => setForm({ ...form, lost_reason: e.target.value })}
                      >
                        <option value="">—</option>
                        {WANDERS_LOST_REASONS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field label="Notes">
                    <textarea
                      style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    />
                  </Field>
                  <p style={{ fontSize: 12, color: colors.muted2, marginBottom: 0 }}>
                    Visa service name: <em>Visa documentation/application assistance</em> — never “visa
                    provided/guaranteed”. Flights are excluded unless separately arranged and paid.
                  </p>
                </div>
              ) : null}

              {tab === 'passengers' ? (
                <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
                  <div
                    style={{
                      padding: 14,
                      borderBottom: `1px solid ${colors.border}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Passengers</h2>
                      <div style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
                        <Shield size={12} style={{ verticalAlign: -1 }} /> Passport / medical fields are
                        private — not for marketing or public views.
                      </div>
                    </div>
                    <button type="button" style={buttonPrimaryStyle} onClick={openNewPassenger}>
                      <Plus size={14} /> Add passenger
                    </button>
                  </div>
                  {!canViewSensitive ? (
                    <div style={{ padding: 16, color: colors.muted }}>No access.</div>
                  ) : passengers.length === 0 ? (
                    <div style={{ padding: 16, color: colors.muted }}>No passengers yet.</div>
                  ) : (
                    <div style={tableWrapStyle}>
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={thStyle}>Name</th>
                            <th style={thStyle}>Class</th>
                            <th style={thStyle}>Lead</th>
                            <th style={thStyle}>Passport</th>
                            <th style={thStyle}>Expiry</th>
                            <th style={thStyle}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {passengers.map((p) => (
                            <tr key={p.id}>
                              <td style={tdStyle}>{p.full_passport_name || '—'}</td>
                              <td style={tdStyle}>{p.passenger_class}</td>
                              <td style={tdStyle}>{p.is_lead ? 'Yes' : ''}</td>
                              <td style={tdStyle}>{maskPassport(p.passport_number)}</td>
                              <td style={tdStyle}>{p.passport_expiry_date || '—'}</td>
                              <td style={tdStyle}>
                                <button
                                  type="button"
                                  style={buttonSecondaryStyle}
                                  onClick={() => {
                                    setPaxForm(p)
                                    setPaxOpen(true)
                                  }}
                                >
                                  Edit
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : null}

              {tab === 'commercial' ? (
                <div style={cardStyle}>
                  <h2 style={sectionTitleStyle}>Deposit, balance & estimate</h2>
                  <p style={{ fontSize: 12, color: colors.muted }}>
                    CRM deal value ≠ accounting revenue (recognition rule: {settings.wandersAccountingRevenueRule || 'TBC'}).
                    Tax treatment: {settings.wandersTaxRules || 'TBC'}.
                  </p>
                  <div style={formGridStyle}>
                    <Field label={`Quote value (${form.quote_currency || baseCurrency})`}>
                      <input
                        type="number"
                        style={inputStyle}
                        value={form.quote_value}
                        onChange={(e) => setForm({ ...form, quote_value: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Quote currency">
                      <input
                        style={inputStyle}
                        value={form.quote_currency}
                        onChange={(e) => setForm({ ...form, quote_currency: e.target.value })}
                        placeholder="TBC"
                      />
                    </Field>
                    <Field label="Estimated cost">
                      <input
                        type="number"
                        style={inputStyle}
                        value={form.estimated_cost}
                        onChange={(e) => setForm({ ...form, estimated_cost: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Deposit % (default 50)">
                      <input
                        type="number"
                        style={inputStyle}
                        value={form.deposit_percent}
                        onChange={(e) => setForm({ ...form, deposit_percent: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Deposit amount">
                      <input style={inputStyle} value={commercial?.deposit_amount ?? 0} readOnly />
                    </Field>
                    <Field label="Deposit deadline">
                      <input
                        type="date"
                        style={inputStyle}
                        value={form.deposit_deadline || ''}
                        onChange={(e) => setForm({ ...form, deposit_deadline: e.target.value || null })}
                      />
                    </Field>
                    <Field label="Deposit status">
                      <select
                        style={selectStyle}
                        value={form.deposit_status}
                        onChange={(e) => setForm({ ...form, deposit_status: e.target.value })}
                      >
                        {['Expected', 'Pending', 'Received', 'Cleared', 'Failed'].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Balance amount">
                      <input style={inputStyle} value={commercial?.balance_amount ?? 0} readOnly />
                    </Field>
                    <Field label="Balance deadline">
                      <input
                        type="date"
                        style={inputStyle}
                        value={form.balance_deadline || ''}
                        onChange={(e) => setForm({ ...form, balance_deadline: e.target.value || null })}
                      />
                    </Field>
                    <Field label="Balance status">
                      <select
                        style={selectStyle}
                        value={form.balance_status}
                        onChange={(e) => setForm({ ...form, balance_status: e.target.value })}
                      >
                        {['Expected', 'Pending', 'Received', 'Cleared', 'Failed'].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Hold (business days)">
                      <input
                        type="number"
                        style={inputStyle}
                        value={form.hold_business_days}
                        onChange={(e) => setForm({ ...form, hold_business_days: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Est. profit / margin %">
                      <input
                        style={inputStyle}
                        readOnly
                        value={`${commercial?.estimated_profit ?? 0} · ${commercial?.estimated_margin_pct ?? 0}%`}
                      />
                    </Field>
                    <Field label="Quote ref">
                      <input
                        style={inputStyle}
                        value={form.quote_ref}
                        onChange={(e) => setForm({ ...form, quote_ref: e.target.value })}
                      />
                    </Field>
                    <Field label="Booking / reporting currency">
                      <input
                        style={inputStyle}
                        value={form.booking_currency}
                        onChange={(e) => setForm({ ...form, booking_currency: e.target.value })}
                        placeholder="TBC"
                      />
                    </Field>
                  </div>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={form.gifts_included}
                      onChange={(e) => setForm({ ...form, gifts_included: e.target.checked })}
                    />
                    Gifts included (track as real cost)
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 6 }}>
                    <input
                      type="checkbox"
                      checked={form.photography_included}
                      onChange={(e) => setForm({ ...form, photography_included: e.target.checked })}
                    />
                    Photography included (promotional use needs separate consent)
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 6 }}>
                    <input
                      type="checkbox"
                      checked={form.marketing_photo_consent}
                      onChange={(e) => setForm({ ...form, marketing_photo_consent: e.target.checked })}
                    />
                    Separate promotional-media consent recorded
                  </label>
                </div>
              ) : null}

              {tab === 'terms' ? (
                <div style={cardStyle}>
                  <h2 style={sectionTitleStyle}>Quotation terms</h2>
                  <p style={{ fontSize: 12, color: colors.muted }}>
                    Legal entity / governing law remain TBC until confirmed. Incomplete legal placeholders
                    must not be published on live customer documents.
                  </p>
                  <div style={formGridStyle}>
                    <Field label="Terms version">
                      <input
                        style={inputStyle}
                        value={form.terms_version}
                        onChange={(e) => setForm({ ...form, terms_version: e.target.value })}
                      />
                    </Field>
                    <Field label="Accepted?">
                      <input style={inputStyle} readOnly value={form.terms_accepted ? 'Yes' : 'No'} />
                    </Field>
                    <Field label="Accepted at">
                      <input
                        style={inputStyle}
                        readOnly
                        value={form.terms_accepted_at ? format(new Date(form.terms_accepted_at), 'dd MMM yyyy HH:mm') : '—'}
                      />
                    </Field>
                    <Field label="Accepted by">
                      <input style={inputStyle} readOnly value={form.terms_accepted_by || '—'} />
                    </Field>
                  </div>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={form.insurance_recommended}
                      onChange={(e) => setForm({ ...form, insurance_recommended: e.target.checked })}
                    />
                    Travel insurance recommended
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 6 }}>
                    <input
                      type="checkbox"
                      checked={form.insurance_declined}
                      onChange={(e) => setForm({ ...form, insurance_declined: e.target.checked })}
                    />
                    Customer declined insurance
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 6 }}>
                    <input
                      type="checkbox"
                      checked={form.special_requirements_declared}
                      onChange={(e) => setForm({ ...form, special_requirements_declared: e.target.checked })}
                    />
                    Special-requirements declaration captured
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 6 }}>
                    <input
                      type="checkbox"
                      checked={form.passenger_details_checked}
                      onChange={(e) => setForm({ ...form, passenger_details_checked: e.target.checked })}
                    />
                    Passenger details checked
                  </label>
                  <Field label="Terms text (versioned)">
                    <textarea
                      style={{ ...inputStyle, minHeight: 220, resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
                      value={form.terms_text}
                      onChange={(e) => setForm({ ...form, terms_text: e.target.value })}
                    />
                  </Field>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      style={buttonSecondaryStyle}
                      onClick={() =>
                        setForm({
                          ...form,
                          terms_text: buildWandersTermsText({
                            includeFlightsClause: form.flight_state !== 'Flights excluded',
                            depositPercent: form.deposit_percent,
                            holdBusinessDays: form.hold_business_days,
                            balanceDaysBefore: settings.wandersBalanceDaysBefore,
                            version: form.terms_version,
                            governingLaw: settings.wandersGoverningLaw,
                            disputeJurisdiction: settings.wandersDisputeJurisdiction,
                          }),
                        })
                      }
                    >
                      Refresh draft terms
                    </button>
                    <button
                      type="button"
                      style={buttonPrimaryStyle}
                      disabled={saving || form.terms_accepted}
                      onClick={() => void recordTermsAcceptance()}
                    >
                      Record acceptance
                    </button>
                  </div>
                </div>
              ) : null}

              {tab === 'packages' ? (
                <div style={cardStyle}>
                  <h2 style={sectionTitleStyle}>Internal package catalogue</h2>
                  <p style={{ fontSize: 12, color: colors.muted }}>
                    Inspiration/enquiry products only — internal costs, supplier details and fixed prices
                    are not published automatically.
                  </p>
                  <div style={tableWrapStyle}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Code</th>
                          <th style={thStyle}>Name</th>
                          <th style={thStyle}>Destination</th>
                          <th style={thStyle}>Nights</th>
                          <th style={thStyle}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {packages.map((p) => (
                          <tr key={p.id}>
                            <td style={tdStyle}>{p.code}</td>
                            <td style={tdStyle}>{p.name}</td>
                            <td style={tdStyle}>{p.destination}</td>
                            <td style={tdStyle}>{p.nights || '—'}</td>
                            <td style={tdStyle}>
                              <button type="button" style={buttonSecondaryStyle} onClick={() => applyPackage(p)}>
                                Use on deal
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
      )}

      <Modal open={paxOpen} title="Passenger (private)" onClose={() => setPaxOpen(false)} width={640}>
        {paxForm ? (
          <>
            <div style={formGridStyle}>
              <Field label="Full passport name">
                <input
                  style={inputStyle}
                  value={paxForm.full_passport_name}
                  onChange={(e) => setPaxForm({ ...paxForm, full_passport_name: e.target.value })}
                />
              </Field>
              <Field label="Class">
                <select
                  style={selectStyle}
                  value={paxForm.passenger_class}
                  onChange={(e) => setPaxForm({ ...paxForm, passenger_class: e.target.value })}
                >
                  {['Adult', 'Child', 'Infant'].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Passport number">
                <input
                  style={inputStyle}
                  value={paxForm.passport_number}
                  onChange={(e) => setPaxForm({ ...paxForm, passport_number: e.target.value })}
                />
              </Field>
              <Field label="Nationality">
                <input
                  style={inputStyle}
                  value={paxForm.nationality}
                  onChange={(e) => setPaxForm({ ...paxForm, nationality: e.target.value })}
                />
              </Field>
              <Field label="Date of birth">
                <input
                  type="date"
                  style={inputStyle}
                  value={paxForm.date_of_birth || ''}
                  onChange={(e) => setPaxForm({ ...paxForm, date_of_birth: e.target.value || null })}
                />
              </Field>
              <Field label="Passport expiry">
                <input
                  type="date"
                  style={inputStyle}
                  value={paxForm.passport_expiry_date || ''}
                  onChange={(e) =>
                    setPaxForm({ ...paxForm, passport_expiry_date: e.target.value || null })
                  }
                />
              </Field>
              <Field label="Mobile">
                <input
                  style={inputStyle}
                  value={paxForm.mobile}
                  onChange={(e) => setPaxForm({ ...paxForm, mobile: e.target.value })}
                />
              </Field>
              <Field label="Emergency contact">
                <input
                  style={inputStyle}
                  value={paxForm.emergency_contact}
                  onChange={(e) => setPaxForm({ ...paxForm, emergency_contact: e.target.value })}
                />
              </Field>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={paxForm.is_lead}
                onChange={(e) => setPaxForm({ ...paxForm, is_lead: e.target.checked })}
              />
              Lead passenger
            </label>
            <Field label="Dietary / medical / accessibility (private)">
              <textarea
                style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
                value={[paxForm.dietary_requirements, paxForm.medical_accessibility_notes]
                  .filter(Boolean)
                  .join('\n')}
                onChange={(e) =>
                  setPaxForm({
                    ...paxForm,
                    dietary_requirements: e.target.value,
                    medical_accessibility_notes: '',
                  })
                }
              />
            </Field>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                style={buttonSecondaryStyle}
                onClick={async () => {
                  if (!paxForm.id) return
                  await deletePassenger(paxForm.id)
                  setPassengers((prev) => prev.filter((p) => p.id !== paxForm.id))
                  setPaxOpen(false)
                  showToast('Passenger removed', 'success')
                }}
              >
                Delete
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={buttonSecondaryStyle} onClick={() => setPaxOpen(false)}>
                  Cancel
                </button>
                <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void savePax()}>
                  Save passenger
                </button>
              </div>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={fieldStyle}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

function maskPassport(n: string): string {
  const s = (n || '').trim()
  if (!s) return '—'
  if (s.length <= 4) return '••••'
  return `${'•'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`
}
