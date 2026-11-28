import { db } from './db'
import { toSalesDocs, type SalesDoc, type TeamMember } from './salesDocuments'

const LIMIT = 500

type Row = Record<string, unknown>

async function rows(table: string, columns: string, since: string): Promise<Row[]> {
  const run = (cols: string) =>
    db.from(table).select(cols).gte('created_at', since).order('created_at', { ascending: false }).limit(LIMIT)
  // Archived documents are left out; older databases have no deleted_at column.
  let { data, error } = await run(`${columns}, deleted_at`)
  if (error) ({ data, error } = await run(columns))
  if (error) return []
  return (data || []) as Row[]
}

/**
 * Documents made since `since`, plus the team (to tell Sales users apart).
 * A table the person cannot read, or a column not there yet (client POs
 * before document-created-by.sql), reads as empty instead of failing Home.
 */
export async function loadSalesDocuments(since: string): Promise<{ docs: SalesDoc[]; team: TeamMember[]; poMakerMissing: boolean }> {
  const [team, quotes, invoices, deliveryNotes, clientPosRes] = await Promise.all([
    db.from('app_users').select('email, name, role, active'),
    rows('quotations', 'id, reference_number, quote_id, client, amount, currency, quotation_currency, status, created_at, created_by', since),
    rows('invoices', 'id, reference_number, client, amount, currency, status, created_at, created_by', since),
    rows('delivery_notes', 'id, reference_number, client, status, created_at, created_by', since),
    db
      .from('client_purchase_orders')
      .select('id, po_number, client_id, account_id, amount, currency, status, created_at, created_by')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(LIMIT),
  ])
  const poMakerMissing = Boolean(clientPosRes.error && /created_by/i.test(clientPosRes.error.message || ''))
  const clientPos = clientPosRes.error ? [] : ((clientPosRes.data || []) as Row[])

  const clientIds = [...new Set(clientPos.map((r) => r.client_id).filter(Boolean).map(String))]
  const accountIds = [...new Set(clientPos.map((r) => r.account_id).filter(Boolean).map(String))]
  const [clientsRes, accountsRes] = await Promise.all([
    clientIds.length ? db.from('clients').select('id, company_name').in('id', clientIds) : Promise.resolve({ data: [] }),
    accountIds.length ? db.from('accounts').select('id, name').in('id', accountIds) : Promise.resolve({ data: [] }),
  ])
  const clientNames = new Map(
    ((clientsRes.data || []) as Row[]).map((r) => [String(r.id), String(r.company_name ?? '')] as const),
  )
  const accountNames = new Map(((accountsRes.data || []) as Row[]).map((r) => [String(r.id), String(r.name ?? '')] as const))

  return {
    docs: toSalesDocs({ quotes, invoices, deliveryNotes, clientPos }, accountNames, clientNames),
    team: ((team.data || []) as TeamMember[]).map((m) => ({ ...m, email: String(m.email || '') })),
    poMakerMissing,
  }
}
