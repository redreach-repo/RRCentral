import { format } from 'date-fns'
import { BASE_CURRENCY, netReceived, toBaseAmount } from './currency'
import { db } from './db'
import type {
  CustomerPayment,
  CustomerRefund,
  FxRateEntry,
  Quotation,
  SupplierCommitment,
} from './types'

export async function loadPaymentsForBooking(bookingId: string): Promise<CustomerPayment[]> {
  const { data, error } = await db
    .from('customer_payments')
    .select('*')
    .eq('booking_id', bookingId)
    .order('payment_date', { ascending: false })
  if (error) throw error
  return (data || []) as CustomerPayment[]
}

export async function loadRefundsForBooking(bookingId: string): Promise<CustomerRefund[]> {
  const { data, error } = await db
    .from('customer_refunds')
    .select('*')
    .eq('booking_id', bookingId)
    .order('refund_date', { ascending: false })
  if (error) throw error
  return (data || []) as CustomerRefund[]
}

export async function saveCustomerPayment(
  input: Omit<CustomerPayment, 'id' | 'created_at' | 'updated_at' | 'net_amount' | 'base_amount'> & {
    id?: string
    net_amount?: number
    base_amount?: number
  },
): Promise<CustomerPayment> {
  const net = netReceived({
    amountReceived: input.amount_received,
    processingFee: input.processing_fee,
    conversionFee: input.conversion_fee,
  })
  // Preserve original amount_received / currency — only compute derived fields
  const base =
    input.base_amount != null && input.base_amount > 0
      ? input.base_amount
      : toBaseAmount(net, Number(input.fx_rate) || 1)
  const now = new Date().toISOString()
  const row: CustomerPayment = {
    id: input.id || crypto.randomUUID(),
    booking_id: input.booking_id,
    quote_ref: input.quote_ref || '',
    invoice_ref: input.invoice_ref || '',
    client: input.client || '',
    payment_date: input.payment_date,
    amount_received: Number(input.amount_received) || 0,
    currency: (input.currency || BASE_CURRENCY).toUpperCase(),
    fx_rate: Number(input.fx_rate) || 1,
    fx_rate_date: input.fx_rate_date,
    fx_rate_approved_by: input.fx_rate_approved_by || '',
    base_amount: base,
    payment_method: input.payment_method || '',
    bank_provider: input.bank_provider || '',
    processing_fee: Number(input.processing_fee) || 0,
    conversion_fee: Number(input.conversion_fee) || 0,
    net_amount: net,
    payment_type: input.payment_type || 'Deposit',
    transaction_ref: input.transaction_ref || '',
    proof_url: input.proof_url || '',
    status: input.status || 'Pending',
    notes: input.notes || '',
    created_by: input.created_by || '',
    created_at: now,
    updated_at: now,
  }

  if (input.id) {
    const { id: _id, created_at: _c, ...patch } = row
    const { error } = await db.from('customer_payments').update(patch).eq('id', input.id)
    if (error) throw error
    return { ...row, id: input.id }
  }
  const { error } = await db.from('customer_payments').insert(row)
  if (error) throw error
  return row
}

export async function saveCustomerRefund(
  input: Omit<CustomerRefund, 'id' | 'created_at'> & { id?: string },
): Promise<CustomerRefund> {
  const now = new Date().toISOString()
  const row: CustomerRefund = {
    ...input,
    id: input.id || crypto.randomUUID(),
    original_currency: (input.original_currency || BASE_CURRENCY).toUpperCase(),
    refund_currency: (input.refund_currency || input.original_currency || BASE_CURRENCY).toUpperCase(),
    amount_refunded: Number(input.amount_refunded) || 0,
    original_amount_received: Number(input.original_amount_received) || 0,
    fx_rate: Number(input.fx_rate) || 1,
    conversion_fee: Number(input.conversion_fee) || 0,
    bank_fee: Number(input.bank_fee) || 0,
    base_amount:
      Number(input.base_amount) ||
      toBaseAmount(Number(input.amount_refunded) || 0, Number(input.fx_rate) || 1),
    fx_gain_loss: Number(input.fx_gain_loss) || 0,
    status: input.status || 'Refunded',
    created_at: now,
  }
  const { error } = await db.from('customer_refunds').insert(row)
  if (error) throw error
  return row
}

export async function approveFxRate(opts: {
  from: string
  to?: string
  rate: number
  rateDate?: string
  approvedBy: string
  notes?: string
  source?: string
}): Promise<FxRateEntry> {
  const row: FxRateEntry = {
    id: crypto.randomUUID(),
    from_currency: opts.from.toUpperCase(),
    to_currency: (opts.to || BASE_CURRENCY).toUpperCase(),
    rate: Number(opts.rate) || 0,
    rate_date: opts.rateDate || format(new Date(), 'yyyy-MM-dd'),
    source: opts.source || 'manual',
    approved_by: opts.approvedBy,
    approved_at: new Date().toISOString(),
    notes: opts.notes || '',
    created_at: new Date().toISOString(),
  }
  const { error } = await db.from('fx_rates').insert(row)
  if (error) throw error
  return row
}

export async function loadSuppliersForBooking(bookingId: string): Promise<SupplierCommitment[]> {
  const { data, error } = await db
    .from('supplier_commitments')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as SupplierCommitment[]
}

export async function saveSupplierCommitment(
  input: Omit<SupplierCommitment, 'id' | 'created_at' | 'base_amount'> & {
    id?: string
    base_amount?: number
  },
): Promise<SupplierCommitment> {
  const now = new Date().toISOString()
  const row: SupplierCommitment = {
    id: input.id || crypto.randomUUID(),
    booking_id: input.booking_id,
    quote_ref: input.quote_ref || '',
    supplier_name: input.supplier_name || '',
    description: input.description || '',
    amount: Number(input.amount) || 0,
    currency: (input.currency || BASE_CURRENCY).toUpperCase(),
    fx_rate: Number(input.fx_rate) || 1,
    fx_rate_date: input.fx_rate_date,
    base_amount:
      Number(input.base_amount) || toBaseAmount(Number(input.amount) || 0, Number(input.fx_rate) || 1),
    status: input.status || 'Open',
    due_date: input.due_date,
    notes: input.notes || '',
    created_at: now,
  }
  const { error } = await db.from('supplier_commitments').insert(row)
  if (error) throw error
  return row
}

export function quotationCurrencyDefaults(partial?: Partial<Quotation>): Partial<Quotation> {
  return {
    currency: 'AED',
    quotation_currency: 'AED',
    payment_currency: 'AED',
    supplier_currency: 'AED',
    booking_currency: 'AED',
    fx_rate: 1,
    fx_rate_date: format(new Date(), 'yyyy-MM-dd'),
    fx_rate_approved_by: '',
    fx_rate_approved_at: null,
    base_amount: 0,
    conversion_fee_estimate: 0,
    bank_fee_estimate: 0,
    charges_borne_by: 'Customer',
    net_amount_required: '',
    accept_other_payment_currency: true,
    rate_valid_until: null,
    payment_instructions: '',
    supplier_cost_base: 0,
    estimated_gross_profit_base: 0,
    ...partial,
  }
}
