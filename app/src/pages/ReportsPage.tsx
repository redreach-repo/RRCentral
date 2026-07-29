import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { differenceInCalendarDays, format, parseISO, startOfMonth, subMonths } from 'date-fns'
import { Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DIVISIONS } from '../lib/config'
import type { Expense, IncomeEntry, Invoice, Quotation } from '../lib/types'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { formatAED } from '../lib/money'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  downloadCsv,
  escapeCsv,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
} from '../lib/uiStyles'

type Tab = 'winrate' | 'aging' | 'pnl'

const tabStyle = (active: boolean): CSSProperties => ({
  ...buttonSecondaryStyle,
  background: active ? colors.accent : 'rgba(255,255,255,0.06)',
  borderColor: active ? colors.accent : colors.border,
})

export default function ReportsPage() {
  const { showToast } = useToast()
  const [tab, setTab] = useState<Tab>('winrate')
  const [loading, setLoading] = useState(true)
  const [quotes, setQuotes] = useState<Quotation[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [income, setIncome] = useState<IncomeEntry[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [q, i, inc, exp] = await Promise.all([
        supabase.from('quotations').select('*'),
        supabase.from('invoices').select('*'),
        supabase.from('income').select('*'),
        supabase.from('expenses').select('*'),
      ])
      if (q.error) throw q.error
      if (i.error) throw i.error
      if (inc.error) throw inc.error
      if (exp.error) throw exp.error
      setQuotes((q.data || []) as Quotation[])
      setInvoices((i.data || []) as Invoice[])
      setIncome((inc.data || []) as IncomeEntry[])
      setExpenses((exp.data || []) as Expense[])
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load reports', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const winRate = useMemo(() => {
    return DIVISIONS.map((d) => {
      const rows = quotes.filter((q) => (q.division_code || '01') === d.code)
      const total = rows.length
      const awarded = rows.filter((q) => q.status === 'Awarded').length
      const notAwarded = rows.filter((q) => q.status === 'Not awarded').length
      const expired = rows.filter((q) => q.status === 'Expired').length
      const decided = awarded + notAwarded + expired
      const winPct = decided > 0 ? Math.round((awarded / decided) * 1000) / 10 : 0
      return { ...d, total, awarded, notAwarded, expired, winPct }
    })
  }, [quotes])

  const aging = useMemo(() => {
    const buckets = [
      { key: 'Current', min: -Infinity, max: 0, count: 0, amount: 0 },
      { key: '1–30 days', min: 1, max: 30, count: 0, amount: 0 },
      { key: '31–60 days', min: 31, max: 60, count: 0, amount: 0 },
      { key: '61–90 days', min: 61, max: 90, count: 0, amount: 0 },
      { key: '90+ days', min: 91, max: Infinity, count: 0, amount: 0 },
    ]
    const today = new Date()
    for (const inv of invoices) {
      if (['Paid', 'Cancelled'].includes(inv.payment_status) || inv.status === 'Cancelled') continue
      const dateStr = inv.date
      if (!dateStr) continue
      const age = differenceInCalendarDays(today, parseISO(dateStr.slice(0, 10)))
      const amt = Number(inv.amount) || 0
      for (const b of buckets) {
        if (age >= b.min && age <= b.max) {
          b.count += 1
          b.amount += amt
          break
        }
      }
    }
    return buckets
  }, [invoices])

  const monthlyPnl = useMemo(() => {
    const months: { key: string; label: string; income: number; expenses: number; net: number }[] = []
    const now = startOfMonth(new Date())
    for (let i = 11; i >= 0; i--) {
      const m = subMonths(now, i)
      const key = format(m, 'yyyy-MM')
      months.push({ key, label: format(m, 'MMM yyyy'), income: 0, expenses: 0, net: 0 })
    }
    for (const row of income) {
      if (!row.date) continue
      const key = row.date.slice(0, 7)
      const m = months.find((x) => x.key === key)
      if (m) m.income += Number(row.total_amount) || 0
    }
    for (const row of expenses) {
      if (!row.date) continue
      const key = row.date.slice(0, 7)
      const m = months.find((x) => x.key === key)
      if (m) m.expenses += Number(row.amount) || 0
    }
    for (const m of months) m.net = m.income - m.expenses
    return months
  }, [income, expenses])

  const maxPnl = Math.max(1, ...monthlyPnl.map((m) => Math.max(m.income, m.expenses)))

  function exportCsv() {
    if (tab === 'winrate') {
      const header = ['Division', 'Brand', 'Total', 'Awarded', 'Not awarded', 'Expired', 'Win %']
      const rows = winRate.map((r) =>
        [r.code, r.brand, r.total, r.awarded, r.notAwarded, r.expired, r.winPct]
          .map(escapeCsv)
          .join(','),
      )
      downloadCsv('win-rate-by-division.csv', [header.join(','), ...rows].join('\n'))
    } else if (tab === 'aging') {
      const header = ['Bucket', 'Count', 'Amount']
      const rows = aging.map((r) => [r.key, r.count, r.amount].map(escapeCsv).join(','))
      downloadCsv('invoice-aging.csv', [header.join(','), ...rows].join('\n'))
    } else {
      const header = ['Month', 'Income', 'Expenses', 'Net']
      const rows = monthlyPnl.map((r) =>
        [r.label, r.income, r.expenses, r.net].map(escapeCsv).join(','),
      )
      downloadCsv('monthly-pnl.csv', [header.join(','), ...rows].join('\n'))
    }
    showToast('CSV downloaded', 'success')
  }

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <h1 style={pageTitleStyle}>Reports</h1>
          <p style={pageSubtitleStyle}>Sales, aging, and P&L</p>
        </div>
        <button type="button" style={buttonPrimaryStyle} onClick={exportCsv} disabled={loading}>
          <Download size={16} /> Export CSV
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <button type="button" style={tabStyle(tab === 'winrate')} onClick={() => setTab('winrate')}>
          Win rate by division
        </button>
        <button type="button" style={tabStyle(tab === 'aging')} onClick={() => setTab('aging')}>
          Invoice aging
        </button>
        <button type="button" style={tabStyle(tab === 'pnl')} onClick={() => setTab('pnl')}>
          Monthly P&L
        </button>
      </div>

      {loading ? (
        <div style={{ ...cardStyle, color: colors.muted }}>Loading reports…</div>
      ) : tab === 'winrate' ? (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Division</th>
                  <th style={thStyle}>Total</th>
                  <th style={thStyle}>Awarded</th>
                  <th style={thStyle}>Not awarded</th>
                  <th style={thStyle}>Expired</th>
                  <th style={thStyle}>Win %</th>
                </tr>
              </thead>
              <tbody>
                {winRate.map((r) => (
                  <tr key={r.code}>
                    <td style={tdStyle}>{r.code} — {r.brand}</td>
                    <td style={tdStyle}>{r.total}</td>
                    <td style={tdStyle}>{r.awarded}</td>
                    <td style={tdStyle}>{r.notAwarded}</td>
                    <td style={tdStyle}>{r.expired}</td>
                    <td style={tdStyle}>{r.winPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'aging' ? (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          {aging.every((b) => b.count === 0) ? (
            <EmptyState title="No open invoices" subtitle="Aging appears for unpaid invoices." />
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Bucket</th>
                    <th style={thStyle}>Count</th>
                    <th style={thStyle}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {aging.map((b) => (
                    <tr key={b.key}>
                      <td style={tdStyle}>{b.key}</td>
                      <td style={tdStyle}>{b.count}</td>
                      <td style={tdStyle}>{formatAED(b.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div style={cardStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {monthlyPnl.map((m) => (
              <div key={m.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                  <strong>{m.label}</strong>
                  <span style={{ color: m.net >= 0 ? colors.success : colors.danger }}>
                    Net {formatAED(m.net)}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Bar label="Income" value={m.income} max={maxPnl} color="#22c55e" />
                  <Bar label="Expenses" value={m.expenses} max={maxPnl} color="#ef4444" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 110px', gap: 8, alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: colors.muted }}>{label}</span>
      <div style={{ height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999 }} />
      </div>
      <span style={{ fontSize: 12, textAlign: 'right' }}>{formatAED(value)}</span>
    </div>
  )
}
