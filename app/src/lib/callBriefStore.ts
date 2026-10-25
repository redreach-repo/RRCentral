import { format } from 'date-fns'
import { db } from './db'
import { buildBrief, type Brief } from './callBrief'
import { listActivities } from './accountsStore'
import { listBuildTasks } from './buildTemplatesStore'
import { listDeals as listCtrmDeals } from './ctrmStore'
import { isMissingRelationError } from './errors'
import { listTickets } from './supportStore'
import type { CtrmDeal, Invoice, SalesDeal } from './types'

async function rows<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await query
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as T[]
}

/** Everything the brief needs for one account, read only. Lists the person cannot see come back empty. */
export async function loadBrief(accountId: string): Promise<Brief> {
  const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[])
  const [activities, tickets, invoices, salesDeals, ctrmDeals, tasks] = await Promise.all([
    safe(listActivities(accountId)),
    safe(listTickets(accountId)),
    safe(rows<Invoice>(db.from('invoices').select('*').eq('account_id', accountId))),
    safe(rows<SalesDeal>(db.from('sales_deals').select('*').eq('account_id', accountId))),
    safe(listCtrmDeals(accountId) as Promise<CtrmDeal[]>),
    safe(listBuildTasks(accountId)),
  ])
  const refs = invoices.map((i) => i.reference_number).filter(Boolean)
  const payments = refs.length
    ? await safe(rows<{ invoice_ref: string; amount: number }>(db.from('payment_log').select('invoice_ref, amount').in('invoice_ref', refs)))
    : []
  return buildBrief({
    today: format(new Date(), 'yyyy-MM-dd'),
    activities,
    tickets,
    invoices,
    payments,
    salesDeals,
    ctrmDeals,
    goLive: tasks,
  })
}
