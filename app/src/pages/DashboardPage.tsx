import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  FileText,
  Receipt,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { addDays, format, isWithinInterval, parseISO, startOfDay, startOfMonth } from 'date-fns'
import { db } from '../lib/db'
import { DIVISIONS, PIPELINE_STAGES } from '../lib/config'
import type { CrmEntry, Expense, IncomeEntry, Invoice, Quotation } from '../lib/types'
import {
  isInMonth,
  isOpenInvoice,
  isRecognizedIncome,
  sortByDateDesc,
  sumExpenses,
  sumRecognizedIncome,
} from '../lib/finance'
import { displayDocumentReference } from '../lib/documents'
import { hydrateContacts, primaryContact } from '../lib/contacts'
import StatusPill from '../components/StatusPill'
import EmptyState from '../components/EmptyState'
import {
  cardStyle,
  colors,
  dualPanelGridStyle,
  formatMoney,
  kpiGridStyle,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
  sectionTitleStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
} from '../lib/uiStyles'

interface KpiCardProps {
  label: string
  value: string
  icon: ReactNode
  accent?: string
  hint?: string
  to?: string
}

function KpiCard({ label, value, icon, accent = colors.accent, hint, to }: KpiCardProps) {
  const inner = (
    <div
      style={{
        ...cardStyle,
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
        minWidth: 0,
        background: `linear-gradient(135deg, ${accent}18 0%, ${colors.card} 55%)`,
        textDecoration: 'none',
        color: 'inherit',
        cursor: to ? 'pointer' : undefined,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: `${accent}22`,
          color: accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>{label}</div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {value}
        </div>
        {hint ? (
          <div style={{ fontSize: 11, color: colors.muted2, marginTop: 4 }}>{hint}</div>
        ) : null}
      </div>
    </div>
  )
  return to ? (
    <Link to={to} style={{ textDecoration: 'none', color: 'inherit', minWidth: 0 }}>
      {inner}
    </Link>
  ) : (
    inner
  )
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [income, setIncome] = useState<IncomeEntry[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [crm, setCrm] = useState<CrmEntry[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [qRes, iRes, incRes, expRes, crmRes] = await Promise.all([
        db.from('quotations').select('*'),
        db.from('invoices').select('*'),
        db.from('income').select('*'),
        db.from('expenses').select('*'),
        db.from('crm').select('*').order('follow_up_date', { ascending: true }),
      ])

      if (qRes.error) throw qRes.error
      if (iRes.error) throw iRes.error
      if (incRes.error) throw incRes.error
      if (expRes.error) throw expRes.error
      if (crmRes.error) throw crmRes.error

      setQuotations(sortByDateDesc((qRes.data as Quotation[]) ?? []))
      setInvoices(sortByDateDesc((iRes.data as Invoice[]) ?? []))
      setIncome((incRes.data as IncomeEntry[]) ?? [])
      setExpenses((expRes.data as Expense[]) ?? [])
      setCrm((crmRes.data as CrmEntry[]) ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const thisMonth = startOfMonth(new Date())
  const monthLabel = format(thisMonth, 'MMM yyyy')

  const recognizedIncome = useMemo(() => income.filter(isRecognizedIncome), [income])

  const monthIncome = useMemo(
    () =>
      recognizedIncome
        .filter((r) => isInMonth(r.date, thisMonth))
        .reduce((s, r) => s + Number(r.total_amount || 0), 0),
    [recognizedIncome, thisMonth],
  )

  const monthExpenses = useMemo(
    () =>
      expenses
        .filter((r) => isInMonth(r.date, thisMonth))
        .reduce((s, r) => s + Number(r.amount || 0), 0),
    [expenses, thisMonth],
  )

  const monthNet = monthIncome - monthExpenses
  const ytdIncome = useMemo(() => sumRecognizedIncome(income), [income])
  const ytdExpenses = useMemo(() => sumExpenses(expenses), [expenses])

  const openQuotes = useMemo(
    () =>
      quotations.filter((q) =>
        ['Draft', 'Finalized', 'Sent'].includes(q.status),
      ).length,
    [quotations],
  )

  const pendingInvoices = useMemo(
    () => invoices.filter(isOpenInvoice).length,
    [invoices],
  )

  const overdueFollowUps = useMemo(() => {
    const today = startOfDay(new Date())
    return crm.filter((c) => {
      if (!c.follow_up_date) return false
      try {
        return parseISO(c.follow_up_date) < today
      } catch {
        return false
      }
    }).length
  }, [crm])

  const pipelineCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of PIPELINE_STAGES) counts[s] = 0
    for (const c of crm) {
      const s = c.pipeline_stage || 'Lead'
      counts[s] = (counts[s] || 0) + 1
    }
    return counts
  }, [crm])

  const openPipeline = useMemo(
    () =>
      crm.filter((c) => !['Won', 'Lost'].includes(c.pipeline_stage || 'Lead')).length,
    [crm],
  )

  const ownerWorkload = useMemo(() => {
    const today = startOfDay(new Date())
    const map = new Map<string, { open: number; overdue: number }>()
    for (const c of crm) {
      const owner = c.owner || 'Unassigned'
      const cur = map.get(owner) || { open: 0, overdue: 0 }
      if (!['Won', 'Lost'].includes(c.pipeline_stage || 'Lead')) cur.open += 1
      if (c.follow_up_date) {
        try {
          if (parseISO(c.follow_up_date) < today) cur.overdue += 1
        } catch {
          /* ignore */
        }
      }
      map.set(owner, cur)
    }
    return Array.from(map.entries())
      .map(([owner, v]) => ({ owner, ...v }))
      .sort((a, b) => b.open - a.open || b.overdue - a.overdue || a.owner.localeCompare(b.owner))
  }, [crm])

  /** Pipeline = open quotes only. Awarded = won revenue potential (not income until paid). */
  const divisionBreakdown = useMemo(() => {
    return DIVISIONS.map((d) => {
      const rows = quotations.filter((q) => (q.division_code || '01') === d.code)
      const open = rows.filter((q) => ['Draft', 'Finalized', 'Sent'].includes(q.status))
      const awarded = rows.filter((q) => q.status === 'Awarded')
      return {
        code: d.code,
        brand: d.brand,
        openCount: open.length,
        openAmount: open.reduce((s, q) => s + Number(q.amount || 0), 0),
        awardedCount: awarded.length,
        awardedAmount: awarded.reduce((s, q) => s + Number(q.amount || 0), 0),
      }
    })
  }, [quotations])

  const recentQuotes = quotations.slice(0, 6)
  const recentInvoices = invoices.filter((i) => i.status !== 'Cancelled').slice(0, 6)

  const upcomingFollowUps = useMemo(() => {
    const today = startOfDay(new Date())
    const end = addDays(today, 7)
    return crm
      .filter((c) => {
        if (!c.follow_up_date) return false
        try {
          const d = parseISO(c.follow_up_date)
          return isWithinInterval(d, { start: today, end })
        } catch {
          return false
        }
      })
      .slice(0, 10)
  }, [crm])

  if (loading) {
    return (
      <div style={pageStyle}>
        <h1 style={pageTitleStyle}>Dashboard</h1>
        <p style={pageSubtitleStyle}>Loading metrics…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={pageStyle}>
        <h1 style={pageTitleStyle}>Dashboard</h1>
        <div style={{ ...cardStyle, color: colors.danger }}>{error}</div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <h1 style={pageTitleStyle}>Dashboard</h1>
      <p style={pageSubtitleStyle}>
        This month ({monthLabel}) — income only counts paid / awarded invoices, not lost quotes
      </p>

      <div style={kpiGridStyle}>
        <KpiCard
          label={`Income · ${monthLabel}`}
          value={formatMoney(monthIncome)}
          icon={<TrendingUp size={18} />}
          accent="#22c55e"
          hint={`YTD paid ${formatMoney(ytdIncome)}`}
        />
        <KpiCard
          label={`Expenses · ${monthLabel}`}
          value={formatMoney(monthExpenses)}
          icon={<TrendingDown size={18} />}
          accent="#ef4444"
          hint={`YTD ${formatMoney(ytdExpenses)}`}
        />
        <KpiCard
          label={`Net · ${monthLabel}`}
          value={formatMoney(monthNet)}
          icon={<Wallet size={18} />}
          accent={monthNet >= 0 ? '#22c55e' : '#ef4444'}
        />
        <KpiCard
          label="Open Quotes"
          value={String(openQuotes)}
          icon={<FileText size={18} />}
          accent="#60a5fa"
          hint="Draft / Finalized / Sent"
        />
        <KpiCard
          label="Open CRM deals"
          value={String(openPipeline)}
          icon={<Users size={18} />}
          accent="#a78bfa"
          hint="Not Won / Lost"
          to="/crm"
        />
        <KpiCard
          label="Pending Invoices"
          value={String(pendingInvoices)}
          icon={<Receipt size={18} />}
          accent="#facc15"
        />
        <KpiCard
          label="Overdue Follow-ups"
          value={String(overdueFollowUps)}
          icon={<AlertTriangle size={18} />}
          accent="#fb923c"
          to="/follow-ups"
        />
      </div>

      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <h2 style={sectionTitleStyle}>CRM pipeline</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PIPELINE_STAGES.map((s) => (
            <Link
              key={s}
              to={`/crm?stage=${encodeURIComponent(s)}`}
              style={{
                textDecoration: 'none',
                color: colors.text,
                border: `1px solid ${colors.border}`,
                borderRadius: 10,
                padding: '10px 14px',
                minWidth: 88,
                background: 'rgba(255,255,255,0.03)',
              }}
            >
              <div style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>{s}</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{pipelineCounts[s] || 0}</div>
            </Link>
          ))}
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <h2 style={sectionTitleStyle}>Division Breakdown</h2>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Division</th>
                <th style={thStyle}>Open quotes</th>
                <th style={thStyle}>Open amount</th>
                <th style={thStyle}>Awarded</th>
                <th style={thStyle}>Awarded amount</th>
              </tr>
            </thead>
            <tbody>
              {divisionBreakdown.map((d) => (
                <tr key={d.code}>
                  <td style={tdStyle}>
                    <span style={{ color: colors.muted2, marginRight: 8 }}>{d.code}</span>
                    {d.brand}
                  </td>
                  <td style={tdStyle}>{d.openCount}</td>
                  <td style={tdStyle}>{formatMoney(d.openAmount)}</td>
                  <td style={tdStyle}>{d.awardedCount}</td>
                  <td style={tdStyle}>{formatMoney(d.awardedAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 12, color: colors.muted }}>
          Not awarded / expired quotes are excluded from open and awarded amounts. Awarded is not income until invoiced and paid.
        </p>
      </div>

      <div style={{ ...dualPanelGridStyle, marginBottom: 24 }}>
        <div style={cardStyle}>
          <h2 style={sectionTitleStyle}>Recent Quotes</h2>
          {recentQuotes.length === 0 ? (
            <EmptyState title="No quotes yet" subtitle="New quotations will appear here." />
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Ref</th>
                    <th style={thStyle}>Client</th>
                    <th style={thStyle}>Amount</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentQuotes.map((q) => (
                    <tr key={q.id}>
                      <td style={tdStyle}>
                        {q.date ? format(parseISO(q.date.slice(0, 10)), 'dd MMM yyyy') : '—'}
                      </td>
                      <td style={tdStyle}>
                        {displayDocumentReference({
                          referenceNumber: q.reference_number,
                          fallbackId: q.quote_id,
                          status: q.status,
                        })}
                      </td>
                      <td style={tdStyle}>{q.client || '—'}</td>
                      <td style={tdStyle}>{formatMoney(q.amount)}</td>
                      <td style={tdStyle}>
                        <StatusPill status={q.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <h2 style={sectionTitleStyle}>Recent Invoices</h2>
          {recentInvoices.length === 0 ? (
            <EmptyState title="No invoices yet" subtitle="New invoices will appear here." />
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Ref</th>
                    <th style={thStyle}>Client</th>
                    <th style={thStyle}>Amount</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <td style={tdStyle}>
                        {inv.date ? format(parseISO(inv.date.slice(0, 10)), 'dd MMM yyyy') : '—'}
                      </td>
                      <td style={tdStyle}>{inv.reference_number || '—'}</td>
                      <td style={tdStyle}>{inv.client || '—'}</td>
                      <td style={tdStyle}>{formatMoney(inv.amount)}</td>
                      <td style={tdStyle}>
                        <StatusPill status={inv.payment_status || inv.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div style={{ ...dualPanelGridStyle, marginBottom: 24 }}>
        <div style={cardStyle}>
          <h2 style={sectionTitleStyle}>Sales owner workload</h2>
          {ownerWorkload.length === 0 ? (
            <EmptyState title="No CRM owners yet" subtitle="Assign sales owners on CRM companies." />
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Owner</th>
                    <th style={thStyle}>Open deals</th>
                    <th style={thStyle}>Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {ownerWorkload.map((r) => (
                    <tr key={r.owner}>
                      <td style={tdStyle}>
                        <Link
                          to={`/crm?owner=${encodeURIComponent(r.owner)}`}
                          style={{ color: colors.accent, textDecoration: 'none' }}
                        >
                          {r.owner}
                        </Link>
                      </td>
                      <td style={tdStyle}>{r.open}</td>
                      <td style={{ ...tdStyle, color: r.overdue ? colors.danger : colors.muted }}>
                        {r.overdue}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <h2 style={sectionTitleStyle}>Upcoming Follow-ups (7 days)</h2>
          {upcomingFollowUps.length === 0 ? (
            <EmptyState
              icon={<AlertTriangle size={22} />}
              title="No upcoming follow-ups"
              subtitle="CRM follow-ups due in the next 7 days will show here."
            />
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Company</th>
                    <th style={thStyle}>Contact</th>
                    <th style={thStyle}>Action</th>
                    <th style={thStyle}>Owner</th>
                    <th style={thStyle}>Quote</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingFollowUps.map((c) => {
                    const p = primaryContact(hydrateContacts(c))
                    return (
                      <tr key={c.id}>
                        <td style={tdStyle}>
                          {c.follow_up_date
                            ? format(parseISO(c.follow_up_date), 'dd MMM yyyy')
                            : '—'}
                        </td>
                        <td style={tdStyle}>
                          <Link
                            to={`/crm?edit=${c.id}`}
                            style={{ color: colors.accent, textDecoration: 'none' }}
                          >
                            {c.company_name}
                          </Link>
                        </td>
                        <td style={tdStyle}>{p?.name || c.primary_contact || '—'}</td>
                        <td style={tdStyle}>{c.next_action || '—'}</td>
                        <td style={tdStyle}>{c.owner || '—'}</td>
                        <td style={tdStyle}>
                          {c.quote_ref ? (
                            <Link
                              to={`/quotations?ref=${encodeURIComponent(c.quote_ref)}`}
                              style={{ color: colors.accent, textDecoration: 'none' }}
                            >
                              {c.quote_ref}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
