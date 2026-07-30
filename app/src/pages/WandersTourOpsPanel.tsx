import { useCallback, useEffect, useMemo, useState } from 'react'
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

type OpsTab = 'packages' | 'partners' | 'costs' | 'prices' | 'departures' | 'bookings'

export default function WandersTourOpsPanel({ deals }: { deals: WandersDeal[] }) {
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
      showToast(e instanceof Error ? e.message : 'Tour ops load failed', 'error')
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
        showToast(e instanceof Error ? e.message : 'Failed to load package detail', 'error')
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
      showToast(e instanceof Error ? e.message : 'Save failed', 'error')
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
      showToast(e instanceof Error ? e.message : 'Save failed', 'error')
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
      showToast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function linkBookingFromDeal() {
    if (!selectedPkg || !departures[0]) {
      showToast('Select a package with at least one departure', 'error')
      return
    }
    const deal = deals[0]
    if (!deal) {
      showToast('Create a customer lead/deal first, then link a booking', 'error')
      return
    }
    const dealId = window.prompt('Deal id to link (from Leads tab)', deal.id)
    if (!dealId) return
    const matched = deals.find((d) => d.id === dealId)
    if (!matched) {
      showToast('Deal not found — leads stay separate from packages', 'error')
      return
    }
    const depId = window.prompt('Departure id', departures[0].id) || departures[0].id
    const pax = Number(window.prompt('Passenger count', '2') || '2')
    const row: CustomerBooking = {
      id: crypto.randomUUID(),
      deal_id: matched.id,
      package_id: selectedPkg.id,
      departure_id: depId,
      supplier_id: selectedPkg.primary_supplier_id,
      coordinator_id: selectedPkg.primary_coordinator_id,
      client_name: matched.client_name,
      lead_contact: matched.lead_contact,
      pax_count: pax,
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
      showToast(e instanceof Error ? e.message : 'Link failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ ...cardStyle, color: colors.muted }}>Loading tour operations…</div>
  }

  return (
    <div>
      <div style={{ ...cardStyle, marginBottom: 12 }}>
        <h2 style={{ ...sectionTitleStyle, marginTop: 0 }}>Tour products & operations</h2>
        <p style={{ margin: '0 0 10px', fontSize: 13, color: colors.muted }}>
          Packages, partners, departures and bookings are first-class records — not Zoho Lead
          description text. Customer leads remain on the Leads tab.
        </p>
        <label style={labelStyle}>Active package</label>
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

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {(
          [
            ['packages', 'Packages'],
            ['partners', 'Suppliers & coordinators'],
            ['costs', 'Cost components'],
            ['prices', 'Selling prices'],
            ['departures', 'Departures'],
            ['bookings', 'Customer bookings'],
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
                        Save
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
                Save price
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
                  Save departure
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
              Bookings link a lead/deal to package, departure, supplier and coordinator.
            </p>
            <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void linkBookingFromDeal()}>
              Link booking from lead
            </button>
          </div>
          {bookings.length === 0 ? (
            <div style={{ color: colors.muted }}>No customer bookings yet.</div>
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
