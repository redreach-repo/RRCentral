import { describe, expect, it } from 'vitest'
import {
  computeSellingMargin,
  departureProfitSnapshot,
  refreshDepartureFromBookings,
  sumCostComponents,
} from './wandersTourOps'
import { buildChristinePartner, buildKokoPartner, buildPhilippinesKeralaPackage } from './seedWandersPackages'
import { SEED_IDS } from './wandersTourOpsConfig'
import type { CustomerBooking, PackageCostComponent, ScheduledDeparture } from './types'

describe('Philippines seed records', () => {
  it('stores Christine and Koko as partners, not lead notes', () => {
    const christine = buildChristinePartner()
    const koko = buildKokoPartner()
    expect(christine.id).toBe(SEED_IDS.supplierChristine)
    expect(christine.partner_type).toBe('Local supplier/travel agency')
    expect(christine.communication_route).toBe('Through Koko')
    expect(koko.partner_type).toBe('Philippines coordinator')
    expect(koko.status).toBe('Active')
  })

  it('captures settled package market facts without inventing INR price', () => {
    const pkg = buildPhilippinesKeralaPackage()
    expect(pkg.advertising_market).toBe('Kerala, India')
    expect(pkg.destination).toBe('Philippines')
    expect(pkg.travel_period).toBe('January–March 2027')
    expect(pkg.min_group_size).toBe(10)
    expect(pkg.supplier_currency).toBe('PHP')
    expect(pkg.customer_selling_currency).toBe('INR')
    expect(pkg.guide_price).toBe(0)
    expect(pkg.primary_supplier_id).toBe(SEED_IDS.supplierChristine)
    expect(pkg.primary_coordinator_id).toBe(SEED_IDS.coordinatorKoko)
  })
})

describe('cost and margin helpers', () => {
  it('adds component costs without cross-currency summing', () => {
    const rows: PackageCostComponent[] = [
      {
        id: '1',
        package_id: 'p',
        category: 'Hotel',
        description: 'A',
        meal_tier: 'Breakfast only',
        supplier_id: '',
        amount: 1000,
        currency: 'PHP',
        per_person: true,
        notes: '',
        sort_order: 1,
        created_at: '',
        updated_at: '',
      },
      {
        id: '2',
        package_id: 'p',
        category: 'Transport',
        description: 'B',
        meal_tier: '',
        supplier_id: '',
        amount: 500,
        currency: 'PHP',
        per_person: true,
        notes: '',
        sort_order: 2,
        created_at: '',
        updated_at: '',
      },
      {
        id: '3',
        package_id: 'p',
        category: 'Other',
        description: 'C',
        meal_tier: '',
        supplier_id: '',
        amount: 50,
        currency: 'USD',
        per_person: false,
        notes: '',
        sort_order: 3,
        created_at: '',
        updated_at: '',
      },
    ]
    const sum = sumCostComponents(rows)
    expect(sum.byCurrency).toEqual({ PHP: 1500, USD: 50 })
    expect(sum.totalIfSingleCurrency).toBeNull()
  })

  it('computes margin when selling and converted cost are known', () => {
    expect(computeSellingMargin({ sellingAmount: 100000, costInSellingCurrency: 70000 })).toEqual({
      marginAmount: 30000,
      marginPct: 30,
    })
  })
})

describe('departure aggregates', () => {
  it('tracks pax, min-group and keeps currencies separate for profit', () => {
    const dep: ScheduledDeparture = {
      id: 'd1',
      package_id: 'p',
      label: 'Jan',
      departure_date: '2027-01-15',
      return_date: '2027-01-22',
      capacity: 20,
      booked_pax: 0,
      min_group_size: 10,
      min_group_met: false,
      booking_deadline: null,
      supplier_confirmation_status: 'Not requested',
      status: 'Open',
      total_customer_payments: 0,
      payments_currency: 'INR',
      total_costs: 0,
      costs_currency: 'PHP',
      revenue: 0,
      revenue_currency: 'INR',
      profit: 0,
      profit_currency: 'INR',
      supplier_id: '',
      coordinator_id: '',
      notes: '',
      created_at: '',
      updated_at: '',
    }
    const bookings: CustomerBooking[] = [
      {
        id: 'b1',
        deal_id: 'deal1',
        package_id: 'p',
        departure_id: 'd1',
        supplier_id: '',
        coordinator_id: '',
        client_name: 'Test',
        lead_contact: '',
        pax_count: 6,
        meal_tier: 'Breakfast only',
        selling_amount: 60000,
        selling_currency: 'INR',
        cost_amount: 30000,
        cost_currency: 'PHP',
        margin_amount: 0,
        margin_pct: 0,
        deposit_status: 'Expected',
        payment_status: 'Expected',
        status: 'Enquiry linked',
        notes: '',
        created_at: '',
        updated_at: '',
      },
      {
        id: 'b2',
        deal_id: 'deal2',
        package_id: 'p',
        departure_id: 'd1',
        supplier_id: '',
        coordinator_id: '',
        client_name: 'Test2',
        lead_contact: '',
        pax_count: 5,
        meal_tier: 'Full board',
        selling_amount: 55000,
        selling_currency: 'INR',
        cost_amount: 28000,
        cost_currency: 'PHP',
        margin_amount: 0,
        margin_pct: 0,
        deposit_status: 'Expected',
        payment_status: 'Expected',
        status: 'Confirmed',
        notes: '',
        created_at: '',
        updated_at: '',
      },
    ]
    const next = refreshDepartureFromBookings(dep, bookings)
    expect(next.booked_pax).toBe(11)
    expect(next.min_group_met).toBe(true)
    expect(next.revenue).toBe(115000)
    expect(next.revenue_currency).toBe('INR')
    expect(next.total_costs).toBe(58000)
    expect(next.costs_currency).toBe('PHP')
    const snap = departureProfitSnapshot(next)
    expect(snap.profit).toBeNull()
    expect(snap.note).toMatch(/currencies differ/i)
  })
})
