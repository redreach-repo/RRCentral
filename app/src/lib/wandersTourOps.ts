import { db } from './db'
import { roundMoney } from './currency'
import {
  buildChristinePartner,
  buildDefaultTourPackages,
  buildKokoPartner,
  buildPhilippinesCostComponents,
  buildPhilippinesDepartures,
  buildPhilippinesKeralaPackage,
  buildPhilippinesSellingPrices,
} from './seedWandersPackages'
import { SEED_IDS } from './wandersTourOpsConfig'
import type {
  CustomerBooking,
  PackageCostComponent,
  PackageSellingPrice,
  ScheduledDeparture,
  TourPackage,
  WandersPartner,
} from './types'

export type DepartureProfitSnapshot = {
  bookedPax: number
  minGroupMet: boolean
  revenue: number
  revenueCurrency: string
  totalCosts: number
  costsCurrency: string
  payments: number
  paymentsCurrency: string
  /** Only set when revenue and cost currencies match or cost converted. */
  profit: number | null
  profitCurrency: string
  note: string
}

/** Sum package cost components — never cross-add different currencies. */
export function sumCostComponents(
  components: PackageCostComponent[],
  opts?: { mealTier?: string[] },
): { byCurrency: Record<string, number>; totalIfSingleCurrency: number | null } {
  const byCurrency: Record<string, number> = {}
  for (const c of components) {
    if (opts?.mealTier?.length) {
      const tier = (c.meal_tier || '').trim()
      if (tier && !opts.mealTier.includes(tier) && !opts.mealTier.includes('')) continue
      // include blank-tier (shared) always
    }
    const cur = (c.currency || 'TBC').toUpperCase()
    byCurrency[cur] = roundMoney((byCurrency[cur] || 0) + (Number(c.amount) || 0))
  }
  const keys = Object.keys(byCurrency)
  return {
    byCurrency,
    totalIfSingleCurrency: keys.length === 1 ? byCurrency[keys[0]] : null,
  }
}

export function computeSellingMargin(opts: {
  sellingAmount: number
  costInSellingCurrency: number
}): { marginAmount: number; marginPct: number } {
  const selling = Number(opts.sellingAmount) || 0
  const cost = Number(opts.costInSellingCurrency) || 0
  const marginAmount = roundMoney(selling - cost)
  const marginPct = selling > 0 ? Math.round((marginAmount / selling) * 1000) / 10 : 0
  return { marginAmount, marginPct }
}

export function refreshDepartureFromBookings(
  departure: ScheduledDeparture,
  bookings: CustomerBooking[],
): ScheduledDeparture {
  const active = bookings.filter((b) => b.departure_id === departure.id && b.status !== 'Cancelled')
  const bookedPax = active.reduce((s, b) => s + (Number(b.pax_count) || 0), 0)
  const revenueByCur: Record<string, number> = {}
  const costByCur: Record<string, number> = {}
  for (const b of active) {
    const rc = (b.selling_currency || departure.revenue_currency || 'TBC').toUpperCase()
    const cc = (b.cost_currency || departure.costs_currency || 'TBC').toUpperCase()
    revenueByCur[rc] = roundMoney((revenueByCur[rc] || 0) + (Number(b.selling_amount) || 0))
    costByCur[cc] = roundMoney((costByCur[cc] || 0) + (Number(b.cost_amount) || 0))
  }
  const revKeys = Object.keys(revenueByCur)
  const costKeys = Object.keys(costByCur)
  const revenue = revKeys.length === 1 ? revenueByCur[revKeys[0]] : departure.revenue
  const revenueCurrency = revKeys.length === 1 ? revKeys[0] : departure.revenue_currency
  const totalCosts = costKeys.length === 1 ? costByCur[costKeys[0]] : departure.total_costs
  const costsCurrency = costKeys.length === 1 ? costKeys[0] : departure.costs_currency
  const sameCurrency = revenueCurrency === costsCurrency
  const profit = sameCurrency ? roundMoney(revenue - totalCosts) : departure.profit
  return {
    ...departure,
    booked_pax: bookedPax,
    min_group_met: bookedPax >= (Number(departure.min_group_size) || 0),
    revenue,
    revenue_currency: revenueCurrency,
    total_costs: totalCosts,
    costs_currency: costsCurrency,
    profit: sameCurrency ? profit : 0,
    profit_currency: sameCurrency ? revenueCurrency : departure.profit_currency,
    status:
      bookedPax >= (Number(departure.min_group_size) || 0) && departure.status === 'Open'
        ? 'Minimum met'
        : departure.status === 'Minimum met' && bookedPax < (Number(departure.min_group_size) || 0)
          ? 'Minimum not met'
          : departure.status,
    updated_at: new Date().toISOString(),
  }
}

export function departureProfitSnapshot(dep: ScheduledDeparture): DepartureProfitSnapshot {
  const same = (dep.revenue_currency || '').toUpperCase() === (dep.costs_currency || '').toUpperCase()
  return {
    bookedPax: dep.booked_pax,
    minGroupMet: dep.min_group_met,
    revenue: dep.revenue,
    revenueCurrency: dep.revenue_currency,
    totalCosts: dep.total_costs,
    costsCurrency: dep.costs_currency,
    payments: dep.total_customer_payments,
    paymentsCurrency: dep.payments_currency,
    profit: same ? dep.profit : null,
    profitCurrency: dep.profit_currency,
    note: same
      ? 'Profit = revenue − costs in same currency'
      : 'Profit not auto-cross-calculated while revenue and cost currencies differ (INR vs PHP)',
  }
}

async function upsertById(table: string, row: { id: string }): Promise<void> {
  const existing = await db.from(table).select('id').eq('id', row.id).maybeSingle()
  if (existing.data) {
    const { id: _id, ...patch } = row as Record<string, unknown>
    const { error } = await db.from(table).update(patch).eq('id', row.id)
    if (error) throw error
  } else {
    const { error } = await db.from(table).insert(row)
    if (error) throw error
  }
}

export async function ensureTourOpsSeeded(): Promise<{
  packages: TourPackage[]
  partners: WandersPartner[]
  components: PackageCostComponent[]
  prices: PackageSellingPrice[]
  departures: ScheduledDeparture[]
}> {
  // Partners first
  await upsertById('wanders_partners', buildChristinePartner())
  await upsertById('wanders_partners', buildKokoPartner())

  // Default catalogue + Philippines product
  for (const p of buildDefaultTourPackages()) {
    const { data } = await db.from('tour_packages').select('id').eq('id', p.id).maybeSingle()
    if (!data) {
      const { error } = await db.from('tour_packages').insert(p)
      if (error) throw error
    }
  }
  await upsertById('tour_packages', buildPhilippinesKeralaPackage())

  for (const c of buildPhilippinesCostComponents()) {
    await upsertById('package_cost_components', c)
  }
  for (const s of buildPhilippinesSellingPrices()) {
    await upsertById('package_selling_prices', s)
  }
  for (const d of buildPhilippinesDepartures()) {
    const { data } = await db.from('scheduled_departures').select('id').eq('id', d.id).maybeSingle()
    if (!data) {
      const { error } = await db.from('scheduled_departures').insert(d)
      if (error) throw error
    }
  }

  const [packages, partners, components, prices, departures] = await Promise.all([
    db.from('tour_packages').select('*'),
    db.from('wanders_partners').select('*'),
    db.from('package_cost_components').select('*').eq('package_id', SEED_IDS.packagePhilippines),
    db.from('package_selling_prices').select('*').eq('package_id', SEED_IDS.packagePhilippines),
    db.from('scheduled_departures').select('*').eq('package_id', SEED_IDS.packagePhilippines),
  ])
  if (packages.error) throw packages.error
  if (partners.error) throw partners.error
  if (components.error) throw components.error
  if (prices.error) throw prices.error
  if (departures.error) throw departures.error

  return {
    packages: (packages.data || []) as TourPackage[],
    partners: (partners.data || []) as WandersPartner[],
    components: (components.data || []) as PackageCostComponent[],
    prices: (prices.data || []) as PackageSellingPrice[],
    departures: (departures.data || []) as ScheduledDeparture[],
  }
}

export async function loadPartners(): Promise<WandersPartner[]> {
  const { data, error } = await db.from('wanders_partners').select('*').order('name', { ascending: true })
  if (error) throw error
  return (data || []) as WandersPartner[]
}

export async function loadDepartures(packageId?: string): Promise<ScheduledDeparture[]> {
  let q = db.from('scheduled_departures').select('*').order('departure_date', { ascending: true })
  if (packageId) q = q.eq('package_id', packageId)
  const { data, error } = await q
  if (error) throw error
  return (data || []) as ScheduledDeparture[]
}

export async function loadBookings(filters?: {
  packageId?: string
  departureId?: string
  dealId?: string
}): Promise<CustomerBooking[]> {
  let q = db.from('customer_bookings').select('*').order('created_at', { ascending: false })
  if (filters?.packageId) q = q.eq('package_id', filters.packageId)
  if (filters?.departureId) q = q.eq('departure_id', filters.departureId)
  if (filters?.dealId) q = q.eq('deal_id', filters.dealId)
  const { data, error } = await q
  if (error) throw error
  return (data || []) as CustomerBooking[]
}

export async function loadCostComponents(packageId: string): Promise<PackageCostComponent[]> {
  const { data, error } = await db
    .from('package_cost_components')
    .select('*')
    .eq('package_id', packageId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data || []) as PackageCostComponent[]
}

export async function loadSellingPrices(packageId: string): Promise<PackageSellingPrice[]> {
  const { data, error } = await db
    .from('package_selling_prices')
    .select('*')
    .eq('package_id', packageId)
  if (error) throw error
  return (data || []) as PackageSellingPrice[]
}

export async function saveCustomerBooking(
  booking: CustomerBooking,
): Promise<CustomerBooking> {
  const row = { ...booking, updated_at: new Date().toISOString() }
  await upsertById('customer_bookings', row)
  // Refresh linked departure aggregates
  if (row.departure_id) {
    const { data: dep } = await db
      .from('scheduled_departures')
      .select('*')
      .eq('id', row.departure_id)
      .maybeSingle()
    if (dep) {
      const bookings = await loadBookings({ departureId: row.departure_id })
      const next = refreshDepartureFromBookings(dep as ScheduledDeparture, bookings)
      const { id: _id, ...patch } = next
      await db.from('scheduled_departures').update(patch).eq('id', next.id)
    }
  }
  return row
}

export async function saveDeparture(dep: ScheduledDeparture): Promise<ScheduledDeparture> {
  const row = { ...dep, updated_at: new Date().toISOString() }
  await upsertById('scheduled_departures', row)
  return row
}

export async function saveCostComponent(c: PackageCostComponent): Promise<PackageCostComponent> {
  const row = { ...c, updated_at: new Date().toISOString() }
  await upsertById('package_cost_components', row)
  return row
}

export async function saveSellingPrice(p: PackageSellingPrice): Promise<PackageSellingPrice> {
  const margin = computeSellingMargin({
    sellingAmount: p.selling_amount,
    costInSellingCurrency:
      p.fx_rate_to_selling > 0
        ? roundMoney((Number(p.cost_amount) || 0) * Number(p.fx_rate_to_selling))
        : Number(p.cost_amount) || 0,
  })
  const row = {
    ...p,
    margin_amount: margin.marginAmount,
    margin_pct: margin.marginPct,
    updated_at: new Date().toISOString(),
  }
  await upsertById('package_selling_prices', row)
  return row
}
