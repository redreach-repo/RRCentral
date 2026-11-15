import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  departureProfitSnapshot,
  ensureTourOpsSeeded,
  loadBookings,
  loadCostComponents,
  loadDepartures,
  loadSellingPrices,
  saveCostComponent,
  saveCustomerBooking,
  saveDeparture,
  saveSellingPrice,
  sumCostComponents,
} from '../lib/wandersTourOps'
import { SEED_IDS } from '../lib/wandersTourOpsConfig'
import type {
  CustomerBooking,
  PackageCostComponent,
  PackageSellingPrice,
  ScheduledDeparture,
  TourPackage,
  WandersDeal,
  WandersPartner,
} from '../lib/types'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
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
  sectionTitleStyle,
  selectStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
} from '../lib/uiStyles'
import { errorMessage } from '../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../lib/listIo'
import { parseTourOpsLinkForm } from '../lib/schemas/tourOpsLink'

function parseYesNo(raw: string, defaultValue: boolean): boolean {
  const v = raw.trim().toLowerCase()
  if (!v) return defaultValue
  return !(v === 'no' || v === 'false' || v === '0' || v === 'off' || v === 'n')
}

function numOr(raw: string, fallback: number): number {
  const n = Number(String(raw).trim())
  return Number.isFinite(n) ? n : fallback
}

type OpsTab = 'packages' | 'partners' | 'costs' | 'prices' | 'departures' | 'bookings'

export default function WandersTourOpsPanel({ deals }: { deals: WandersDeal[] }) {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [tab, setTab] = useState<OpsTab>('packages')
  const [loading, setLoading] = useState(true)
  const [packages, setPackages] = useState<TourPackage[]>([])
  const [partners, setPartners] = useState<WandersPartner[]>([])
  const [components, setComponents] = useState<PackageCostComponent[]>([])
  const [prices, setPrices] = useState<PackageSellingPrice[]>([])
  const [departures, setDepartures] = useState<ScheduledDeparture[]>([])
  const [bookings, setBookings] = useState<CustomerBooking[]>([])
  const [packageId, setPackageId] = useState<string>(SEED_IDS.packagePhilippines)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const seeded = await ensureTourOpsSeeded()
      setPackages(seeded.packages)
      setPartners(seeded.partners)
      setComponents(seeded.components)
      setPrices(seeded.prices)
      setDepartures(seeded.departures)
      const b = await loadBookings({ packageId: SEED_IDS.packagePhilippines })
      setBookings(b)
      if (!seeded.packages.find((p) => p.id === packageId) && seeded.packages[0]) {
        setPackageId(seeded.packages[0].id)
      }
    } catch (e) {
      showToast(errorMessage(e, 'Tour ops load failed'), 'error')
    } finally {
      setLoading(false)
    }
  }, [packageId, showToast])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!packageId) return
    void (async () => {
      try {
        const [c, p, d, b] = await Promise.all([
          loadCostComponents(packageId),
          loadSellingPrices(packageId),
          loadDepartures(packageId),
          loadBookings({ packageId }),
        ])
        setComponents(c)
        setPrices(p)
        setDepartures(d)
        setBookings(b)
      } catch (e) {
        showToast(errorMessage(e, 'Failed to load package detail'), 'error')
      }
    })()
  }, [packageId, showToast])

  const selectedPkg = useMemo(
    () => packages.find((p) => p.id === packageId) || null,
    [packages, packageId],
  )

  const costSum = useMemo(() => sumCostComponents(components), [components])

  async function persistComponent(c: PackageCostComponent) {
    setSaving(true)
    try {
      const saved = await saveCostComponent(c)
      setComponents((prev) => prev.map((x) => (x.id === saved.id ? saved : x)))
      showToast('Cost component saved', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Save failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function persistPrice(p: PackageSellingPrice) {
    setSaving(true)
    try {
      const saved = await saveSellingPrice(p)
      setPrices((prev) => prev.map((x) => (x.id === saved.id ? saved : x)))
      showToast('Selling price saved', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Save failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function persistDeparture(d: ScheduledDeparture) {
    setSaving(true)
    try {
      const saved = await saveDeparture(d)
      setDepartures((prev) => prev.map((x) => (x.id === saved.id ? saved : x)))
      showToast('Departure saved', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Save failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function importTourOpsCsv(file: File) {
    if (tab === 'packages' || tab === 'partners') {
      showToast('Import CSV updates costs, prices, departures, or bookings — switch tab first', 'error')
      if (importInputRef.current) importInputRef.current.value = ''
      return
    }
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
        showToast('No tour ops rows in CSV', 'error')
        return
      }

      let saved = 0
      let skipped = 0

      if (tab === 'costs') {
        const next = [...components]
        for (const row of objects) {
          const category = String(row.category || '').trim()
          const description = String(row.description || '').trim()
          const meal_tier = String(row.meal_tier || '').trim()
          const match = next.find(
            (c) =>
              c.category === category &&
              c.description === description &&
              (c.meal_tier || '') === meal_tier,
          )
          if (!match) {
            skipped += 1
            continue
          }
          const updated: PackageCostComponent = {
            ...match,
            amount: Object.prototype.hasOwnProperty.call(row, 'amount')
              ? numOr(String(row.amount ?? ''), match.amount)
              : match.amount,
            currency: Object.prototype.hasOwnProperty.call(row, 'currency')
              ? String(row.currency ?? '').trim() || match.currency
              : match.currency,
            per_person: Object.prototype.hasOwnProperty.call(row, 'per_person')
              ? parseYesNo(String(row.per_person ?? ''), match.per_person)
              : match.per_person,
            notes: Object.prototype.hasOwnProperty.call(row, 'notes')
              ? String(row.notes ?? '').trim()
              : match.notes,
          }
          const persisted = await saveCostComponent(updated)
          const idx = next.findIndex((c) => c.id === persisted.id)
          if (idx >= 0) next[idx] = persisted
          saved += 1
        }
        setComponents(next)
      } else if (tab === 'prices') {
        const next = [...prices]
        for (const row of objects) {
          const label = String(row.label || '').trim()
          const meal_tier = String(row.meal_tier || '').trim()
          const match = next.find(
            (p) => p.label === label && (!meal_tier || p.meal_tier === meal_tier),
          )
          if (!match) {
            skipped += 1
            continue
          }
          const updated: PackageSellingPrice = {
            ...match,
            selling_amount: Object.prototype.hasOwnProperty.call(row, 'selling_amount')
              ? numOr(String(row.selling_amount ?? ''), match.selling_amount)
              : match.selling_amount,
            selling_currency: Object.prototype.hasOwnProperty.call(row, 'selling_currency')
              ? String(row.selling_currency ?? '').trim() || match.selling_currency
              : match.selling_currency,
            cost_amount: Object.prototype.hasOwnProperty.call(row, 'cost_amount')
              ? numOr(String(row.cost_amount ?? ''), match.cost_amount)
              : match.cost_amount,
            cost_currency: Object.prototype.hasOwnProperty.call(row, 'cost_currency')
              ? String(row.cost_currency ?? '').trim() || match.cost_currency
              : match.cost_currency,
            status: Object.prototype.hasOwnProperty.call(row, 'status')
              ? String(row.status ?? '').trim() || match.status
              : match.status,
          }
          const persisted = await saveSellingPrice(updated)
          const idx = next.findIndex((p) => p.id === persisted.id)
          if (idx >= 0) next[idx] = persisted
          saved += 1
        }
        setPrices(next)
      } else if (tab === 'departures') {
        const next = [...departures]
        for (const row of objects) {
          const label = String(row.label || '').trim()
          const match = next.find((d) => d.label === label)
          if (!match) {
            skipped += 1
            continue
          }
          const updated: ScheduledDeparture = {
            ...match,
            departure_date: Object.prototype.hasOwnProperty.call(row, 'departure_date')
              ? String(row.departure_date ?? '').trim() || null
              : match.departure_date,
            return_date: Object.prototype.hasOwnProperty.call(row, 'return_date')
              ? String(row.return_date ?? '').trim() || null
              : match.return_date,
            capacity: Object.prototype.hasOwnProperty.call(row, 'capacity')
              ? numOr(String(row.capacity ?? ''), match.capacity)
              : match.capacity,
            booked_pax: Object.prototype.hasOwnProperty.call(row, 'booked_pax')
              ? numOr(String(row.booked_pax ?? ''), match.booked_pax)
              : match.booked_pax,
            status: Object.prototype.hasOwnProperty.call(row, 'status')
              ? String(row.status ?? '').trim() || match.status
              : match.status,
            min_group_met: Object.prototype.hasOwnProperty.call(row, 'min_group_met')
              ? parseYesNo(String(row.min_group_met ?? ''), match.min_group_met)
              : match.min_group_met,
            booking_deadline: Object.prototype.hasOwnProperty.call(row, 'booking_deadline')
              ? String(row.booking_deadline ?? '').trim() || null
              : match.booking_deadline,
          }
          const persisted = await saveDeparture(updated)
          const idx = next.findIndex((d) => d.id === persisted.id)
          if (idx >= 0) next[idx] = persisted
          saved += 1
        }
        setDepartures(next)
      } else {
        const next = [...bookings]
        for (const row of objects) {
          const client_name = String(row.client_name || '').trim()
          const lead_contact = String(row.lead_contact || '').trim()
          const match = next.find(
            (b) =>
              b.client_name === client_name &&
              (!lead_contact || b.lead_contact === lead_contact),
          )
          if (!match) {
            skipped += 1
            continue
          }
          const updated: CustomerBooking = {
            ...match,
            pax_count: Object.prototype.hasOwnProperty.call(row, 'pax_count')
              ? numOr(String(row.pax_count ?? ''), match.pax_count)
              : match.pax_count,
            meal_tier: Object.prototype.hasOwnProperty.call(row, 'meal_tier')
              ? String(row.meal_tier ?? '').trim() || match.meal_tier
              : match.meal_tier,
            selling_amount: Object.prototype.hasOwnProperty.call(row, 'selling_amount')
              ? numOr(String(row.selling_amount ?? ''), match.selling_amount)
              : match.selling_amount,
            selling_currency: Object.prototype.hasOwnProperty.call(row, 'selling_currency')
              ? String(row.selling_currency ?? '').trim() || match.selling_currency
              : match.selling_currency,
            deposit_status: Object.prototype.hasOwnProperty.call(row, 'deposit_status')
              ? String(row.deposit_status ?? '').trim() || match.deposit_status
              : match.deposit_status,
            payment_status: Object.prototype.hasOwnProperty.call(row, 'payment_status')
              ? String(row.payment_status ?? '').trim() || match.payment_status
              : match.payment_status,
          }
          const persisted = await saveCustomerBooking(updated)
          const idx = next.findIndex((b) => b.id === persisted.id)
          if (idx >= 0) next[idx] = persisted
          saved += 1
        }
        setBookings(next)
      }

      if (!saved) {
        showToast('No matching tour ops rows to update in CSV', 'error')
        return
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} tour ops row(s)${skipNote}`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Tour ops CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  async function linkBookingFromDeal() {
    const deal = deals[0]
    const dealIdRaw = deal
      ? window.prompt('Deal id to link (from Leads tab)', deal.id)
      : null
    if (dealIdRaw == null && deal) return
    const depIdRaw =
      selectedPkg && departures[0]
        ? window.prompt('Departure id', departures[0].id) || departures[0].id
        : ''
    const paxRaw =
      selectedPkg && departures[0] ? window.prompt('Passenger count', '2') || '2' : '0'
    const parsed = parseTourOpsLinkForm({
      packageId: selectedPkg?.id || '',
      departureId: depIdRaw || '',
      dealId: (dealIdRaw || '').trim(),
      pax: paxRaw,
    })
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    const matched = deals.find((d) => d.id === parsed.data.dealId)
    if (!matched) {
      showToast('Deal not found — leads stay separate from packages', 'error')
      return
    }
    if (!selectedPkg) {
      showToast('Select a package with at least one departure', 'error')
      return
    }
    const row: CustomerBooking = {
      id: crypto.randomUUID(),
      deal_id: matched.id,
      package_id: parsed.data.packageId,
      departure_id: parsed.data.departureId,
      supplier_id: selectedPkg.primary_supplier_id,
      coordinator_id: selectedPkg.primary_coordinator_id,
      client_name: matched.client_name,
      lead_contact: matched.lead_contact,
      pax_count: parsed.data.pax,
      meal_tier: 'Breakfast only',
      selling_amount: 0,
      selling_currency: selectedPkg.customer_selling_currency || 'INR',
      cost_amount: 0,
      cost_currency: selectedPkg.supplier_currency || 'PHP',
      margin_amount: 0,
      margin_pct: 0,
      deposit_status: 'Expected',
      payment_status: 'Expected',
      status: 'Enquiry linked',
      notes: 'Linked from lead — package/partner data lives on ops records, not in lead description.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setSaving(true)
    try {
      await saveCustomerBooking(row)
      const [b, d] = await Promise.all([
        loadBookings({ packageId: selectedPkg.id }),
        loadDepartures(selectedPkg.id),
      ])
      setBookings(b)
      setDepartures(d)
      showToast('Booking linked to package + departure + partners', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Link failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ ...cardStyle, color: colors.muted }}>{t('page.wandersOps.loading')}</div>
  }

  return (
    <div>
      <div style={{ ...cardStyle, marginBottom: 12 }}>
        <h2 style={{ ...sectionTitleStyle, marginTop: 0 }}>{t('page.wandersOps.title')}</h2>
        <p style={{ margin: '0 0 10px', fontSize: 13, color: colors.muted }}>
          {t('page.wandersOps.subtitle')}
        </p>
        <label style={labelStyle}>{t('page.wandersOps.activePackage')}</label>
        <select
          style={selectStyle}
          value={packageId}
          onChange={(e) => setPackageId(e.target.value)}
        >
          {packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        {(
          [
            ['packages', t('page.wandersOps.tabPackages')],
            ['partners', t('page.wandersOps.tabPartners')],
            ['costs', t('page.wandersOps.tabCosts')],
            ['prices', t('page.wandersOps.tabPrices')],
            ['departures', t('page.wandersOps.tabDepartures')],
            ['bookings', t('page.wandersOps.tabBookings')],
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
        <input
          ref={importInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void importTourOpsCsv(file)
          }}
        />
        <button
          type="button"
          style={buttonSecondaryStyle}
          disabled={importing || saving}
          onClick={() => importInputRef.current?.click()}
        >
          {importing ? 'Importing…' : 'Import CSV'}
        </button>
        <button
          type="button"
          style={buttonSecondaryStyle}
          disabled={importing}
          onClick={() => {
            if (tab === 'packages') {
              exportListCsv(
                'wanders-packages.csv',
                ['code', 'name', 'destination', 'destination_country', 'nights', 'days', 'product_type', 'supplier_currency', 'summary'],
                packages.map((p) => ({
                  code: p.code,
                  name: p.name,
                  destination: p.destination,
                  destination_country: p.destination_country,
                  nights: p.nights,
                  days: p.days,
                  product_type: p.product_type,
                  supplier_currency: p.supplier_currency,
                  summary: p.summary,
                })),
              )
            } else if (tab === 'partners') {
              exportListCsv(
                'wanders-partners.csv',
                ['name', 'partner_type', 'country', 'destination', 'status', 'contact_name', 'contact_email', 'contact_phone', 'active'],
                partners.map((p) => ({
                  name: p.name,
                  partner_type: p.partner_type,
                  country: p.country,
                  destination: p.destination,
                  status: p.status,
                  contact_name: p.contact_name,
                  contact_email: p.contact_email,
                  contact_phone: p.contact_phone,
                  active: p.active ? 'yes' : 'no',
                })),
              )
            } else if (tab === 'costs') {
              exportListCsv(
                'wanders-costs.csv',
                ['category', 'description', 'meal_tier', 'amount', 'currency', 'per_person', 'notes'],
                components.map((c) => ({
                  category: c.category,
                  description: c.description,
                  meal_tier: c.meal_tier,
                  amount: c.amount,
                  currency: c.currency,
                  per_person: c.per_person ? 'yes' : 'no',
                  notes: c.notes,
                })),
              )
            } else if (tab === 'prices') {
              exportListCsv(
                'wanders-prices.csv',
                ['label', 'meal_tier', 'selling_amount', 'selling_currency', 'cost_amount', 'cost_currency', 'margin_pct', 'status'],
                prices.map((p) => ({
                  label: p.label,
                  meal_tier: p.meal_tier,
                  selling_amount: p.selling_amount,
                  selling_currency: p.selling_currency,
                  cost_amount: p.cost_amount,
                  cost_currency: p.cost_currency,
                  margin_pct: p.margin_pct,
                  status: p.status,
                })),
              )
            } else if (tab === 'departures') {
              exportListCsv(
                'wanders-departures.csv',
                ['label', 'departure_date', 'return_date', 'capacity', 'booked_pax', 'status', 'min_group_met', 'booking_deadline'],
                departures.map((d) => ({
                  label: d.label,
                  departure_date: d.departure_date || '',
                  return_date: d.return_date || '',
                  capacity: d.capacity,
                  booked_pax: d.booked_pax,
                  status: d.status,
                  min_group_met: d.min_group_met ? 'yes' : 'no',
                  booking_deadline: d.booking_deadline || '',
                })),
              )
            } else {
              exportListCsv(
                'wanders-bookings.csv',
                ['client_name', 'lead_contact', 'pax_count', 'meal_tier', 'selling_amount', 'selling_currency', 'deposit_status', 'payment_status'],
                bookings.map((b) => ({
                  client_name: b.client_name,
                  lead_contact: b.lead_contact,
                  pax_count: b.pax_count,
                  meal_tier: b.meal_tier,
                  selling_amount: b.selling_amount,
                  selling_currency: b.selling_currency,
                  deposit_status: b.deposit_status,
                  payment_status: b.payment_status,
                })),
              )
            }
            showToast('Tour ops CSV downloaded', 'success')
          }}
        >
          Export CSV
        </button>
      </div>

      {tab === 'packages' && selectedPkg ? (
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>{selectedPkg.name}</h3>
          <div style={formGridStyle}>
            <Info label="Code" value={selectedPkg.code} />
            <Info label="Advertising market" value={selectedPkg.advertising_market} />
            <Info label="Destination" value={selectedPkg.destination} />
            <Info label="Travel period" value={selectedPkg.travel_period} />
            <Info label="Min group" value={String(selectedPkg.min_group_size)} />
            <Info label="Smaller groups" value={selectedPkg.smaller_group_policy} />
            <Info label="Meal tiers" value={selectedPkg.meal_tiers.replace(/\|/g, ' · ')} />
            <Info label="Costing method" value={selectedPkg.costing_method} />
            <Info label="Supplier currency" value={selectedPkg.supplier_currency} />
            <Info label="Customer selling currency" value={selectedPkg.customer_selling_currency} />
            <Info label="Status" value={selectedPkg.status} />
          </div>
          <p style={{ fontSize: 12, color: colors.muted2 }}>{selectedPkg.notes}</p>
        </div>
      ) : null}

      {tab === 'partners' ? (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Communication</th>
                  <th style={thStyle}>Next involvement</th>
                  <th style={thStyle}>Booking responsibility</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((p) => (
                  <tr key={p.id}>
                    <td style={tdStyle}>{p.name}</td>
                    <td style={tdStyle}>{p.partner_type}</td>
                    <td style={tdStyle}>
                      <StatusPill status={p.status} />
                    </td>
                    <td style={tdStyle}>{p.communication_route}</td>
                    <td style={tdStyle}>{p.next_involvement}</td>
                    <td style={tdStyle}>{p.booking_stage_responsibility}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === 'costs' ? (
        <div style={cardStyle}>
          <p style={{ fontSize: 13, color: colors.muted }}>
            Costing method: add component costs. Totals by currency:{' '}
            {Object.entries(costSum.byCurrency)
              .map(([c, a]) => `${c} ${a}`)
              .join(' · ') || '—'}
            {costSum.totalIfSingleCurrency == null
              ? ' (currencies not cross-added)'
              : ''}
          </p>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Category</th>
                  <th style={thStyle}>Description</th>
                  <th style={thStyle}>Meal tier</th>
                  <th style={thStyle}>Amount (PHP)</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {components.map((c) => (
                  <tr key={c.id}>
                    <td style={tdStyle}>{c.category}</td>
                    <td style={tdStyle}>{c.description}</td>
                    <td style={tdStyle}>{c.meal_tier || 'Shared'}</td>
                    <td style={tdStyle}>
                      <input
                        type="number"
                        style={inputStyle}
                        value={c.amount}
                        onChange={(e) =>
                          setComponents((prev) =>
                            prev.map((x) =>
                              x.id === c.id ? { ...x, amount: Number(e.target.value) } : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td style={tdStyle}>
                      <button
                        type="button"
                        style={buttonSecondaryStyle}
                        disabled={saving}
                        onClick={() => void persistComponent(c)}
                      >
                        {t('page.wandersOps.save')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === 'prices' ? (
        <div style={cardStyle}>
          <p style={{ fontSize: 13, color: colors.muted }}>
            Kerala selling prices in INR — leave at 0 until finalized. Enter FX (PHP→INR) to compute
            margin; do not invent rates.
          </p>
          {prices.map((p) => (
            <div
              key={p.id}
              style={{
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <strong>{p.label}</strong>
              <div style={formGridStyle}>
                <Field label={`Selling (${p.selling_currency})`}>
                  <input
                    type="number"
                    style={inputStyle}
                    value={p.selling_amount}
                    onChange={(e) =>
                      setPrices((prev) =>
                        prev.map((x) =>
                          x.id === p.id ? { ...x, selling_amount: Number(e.target.value) } : x,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label={`Cost (${p.cost_currency})`}>
                  <input
                    type="number"
                    style={inputStyle}
                    value={p.cost_amount}
                    onChange={(e) =>
                      setPrices((prev) =>
                        prev.map((x) =>
                          x.id === p.id ? { ...x, cost_amount: Number(e.target.value) } : x,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="FX rate (1 cost → selling)">
                  <input
                    type="number"
                    step="0.0001"
                    style={inputStyle}
                    value={p.fx_rate_to_selling}
                    onChange={(e) =>
                      setPrices((prev) =>
                        prev.map((x) =>
                          x.id === p.id ? { ...x, fx_rate_to_selling: Number(e.target.value) } : x,
                        ),
                      )
                    }
                  />
                </Field>
                <Info label="Margin" value={`${p.margin_amount} (${p.margin_pct}%)`} />
                <Info label="Status" value={p.status} />
              </div>
              <button
                type="button"
                style={buttonPrimaryStyle}
                disabled={saving}
                onClick={() => void persistPrice(p)}
              >
                {t('page.wandersOps.savePrice')}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'departures' ? (
        <div style={cardStyle}>
          {departures.map((d) => {
            const snap = departureProfitSnapshot(d)
            return (
              <div
                key={d.id}
                style={{
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <strong>{d.label}</strong>
                  <StatusPill status={d.status} />
                </div>
                <div style={formGridStyle}>
                  <Field label="Departure date">
                    <input
                      type="date"
                      style={inputStyle}
                      value={d.departure_date || ''}
                      onChange={(e) =>
                        setDepartures((prev) =>
                          prev.map((x) =>
                            x.id === d.id ? { ...x, departure_date: e.target.value || null } : x,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label="Capacity">
                    <input
                      type="number"
                      style={inputStyle}
                      value={d.capacity}
                      onChange={(e) =>
                        setDepartures((prev) =>
                          prev.map((x) =>
                            x.id === d.id ? { ...x, capacity: Number(e.target.value) } : x,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label="Booking deadline">
                    <input
                      type="date"
                      style={inputStyle}
                      value={d.booking_deadline || ''}
                      onChange={(e) =>
                        setDepartures((prev) =>
                          prev.map((x) =>
                            x.id === d.id ? { ...x, booking_deadline: e.target.value || null } : x,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label="Supplier confirmation">
                    <input
                      style={inputStyle}
                      value={d.supplier_confirmation_status}
                      onChange={(e) =>
                        setDepartures((prev) =>
                          prev.map((x) =>
                            x.id === d.id
                              ? { ...x, supplier_confirmation_status: e.target.value }
                              : x,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Info label="Booked pax" value={String(d.booked_pax)} />
                  <Info label="Min group met" value={d.min_group_met ? 'Yes' : 'No'} />
                  <Info
                    label="Revenue"
                    value={`${d.revenue} ${d.revenue_currency}`}
                  />
                  <Info label="Costs" value={`${d.total_costs} ${d.costs_currency}`} />
                  <Info
                    label="Profit"
                    value={
                      snap.profit == null
                        ? snap.note
                        : `${snap.profit} ${snap.profitCurrency}`
                    }
                  />
                  <Info
                    label="Customer payments"
                    value={`${d.total_customer_payments} ${d.payments_currency}`}
                  />
                </div>
                <button
                  type="button"
                  style={buttonSecondaryStyle}
                  disabled={saving}
                  onClick={() => void persistDeparture(d)}
                >
                  {t('page.wandersOps.saveDeparture')}
                </button>
              </div>
            )
          })}
        </div>
      ) : null}

      {tab === 'bookings' ? (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>
              {t('page.wandersOps.bookingsHint')}
            </p>
            <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void linkBookingFromDeal()}>
              {t('page.wandersOps.linkFromLead')}
            </button>
          </div>
          {bookings.length === 0 ? (
            <div style={{ color: colors.muted }}>{t('page.wandersOps.noBookings')}</div>
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Client</th>
                    <th style={thStyle}>Deal</th>
                    <th style={thStyle}>Departure</th>
                    <th style={thStyle}>Pax</th>
                    <th style={thStyle}>Sell</th>
                    <th style={thStyle}>Cost</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b.id}>
                      <td style={tdStyle}>{b.client_name}</td>
                      <td style={tdStyle}>{b.deal_id.slice(0, 8)}…</td>
                      <td style={tdStyle}>{b.departure_id}</td>
                      <td style={tdStyle}>{b.pax_count}</td>
                      <td style={tdStyle}>
                        {b.selling_amount} {b.selling_currency}
                      </td>
                      <td style={tdStyle}>
                        {b.cost_amount} {b.cost_currency}
                      </td>
                      <td style={tdStyle}>
                        <StatusPill status={b.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={fieldStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: 13 }}>{value || '—'}</div>
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
