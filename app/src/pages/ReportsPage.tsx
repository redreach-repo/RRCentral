import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { differenceInCalendarDays, format, parseISO, startOfMonth, subMonths } from 'date-fns'
import { Download } from 'lucide-react'
import { db } from '../lib/db'
import { DIVISIONS, PIPELINE_STAGES, VAT_RATE } from '../lib/config'
import type {
  CrmEntry,
  CustomerPayment,
  CustomerRefund,
  Expense,
  IncomeEntry,
  Invoice,
  Quotation,
  SupplierCommitment,
} from '../lib/types'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { formatAED } from '../lib/money'
import { BASE_CURRENCY, formatMoneyAmount } from '../lib/currency'
import { buildCurrencyReport, cashReceivedByCurrency } from '../lib/currencyReports'
import {
  currentVatQuarter,
  expenseVatParts,
  incomeVatParts,
  isOpenInvoice,
  isRecognizedIncome,
  monthKey,
  quarterMonths,
  type VatQuarter,
} from '../lib/finance'
import { reconcileInvoiceFinance } from '../lib/invoiceFinance'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  downloadCsv,
  escapeCsv,
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
} from '../lib/uiStyles'

type Tab = 'winrate' | 'aging' | 'pnl' | 'vat' | 'funnel' | 'fx'

const tabStyle = (active: boolean): CSSProperties => ({
  ...buttonSecondaryStyle,
  background: active ? colors.accent : 'rgba(255,255,255,0.06)',
  borderColor: active ? colors.accent : colors.border,
})

export default function ReportsPage() {
  const { showToast } = useToast()
  const { settings } = useSettings()
  const vatRate = Number(settings.vatRate || VAT_RATE) || VAT_RATE
  const [tab, setTab] = useState<Tab>('vat')
  const [loading, setLoading] = useState(true)
  const [quotes, setQuotes] = useState<Quotation[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [income, setIncome] = useState<IncomeEntry[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [crm, setCrm] = useState<CrmEntry[]>([])
  const [payments, setPayments] = useState<CustomerPayment[]>([])
  const [refunds, setRefunds] = useState<CustomerRefund[]>([])
  const [suppliers, setSuppliers] = useState<SupplierCommitment[]>([])

  const nowQ = currentVatQuarter()
  const [vatYear, setVatYear] = useState(nowQ.year)
  const [vatQuarter, setVatQuarter] = useState<VatQuarter>(nowQ.quarter)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      await reconcileInvoiceFinance()
      const [q, i, inc, exp, c, pay, ref, sup] = await Promise.all([
        db.from('quotations').select('*'),
        db.from('invoices').select('*'),
        db.from('income').select('*'),
        db.from('expenses').select('*'),
        db.from('crm').select('*'),
        db.from('customer_payments').select('*'),
        db.from('customer_refunds').select('*'),
        db.from('supplier_commitments').select('*'),
      ])
      if (q.error) throw q.error
      if (i.error) throw i.error
      if (inc.error) throw inc.error
      if (exp.error) throw exp.error
      if (c.error) throw c.error
      if (pay.error) throw pay.error
      if (ref.error) throw ref.error
      if (sup.error) throw sup.error
      setQuotes((q.data || []) as Quotation[])
      setInvoices((i.data || []) as Invoice[])
      setIncome((inc.data || []) as IncomeEntry[])
      setExpenses((exp.data || []) as Expense[])
      setCrm((c.data || []) as CrmEntry[])
      setPayments((pay.data || []) as CustomerPayment[])
      setRefunds((ref.data || []) as CustomerRefund[])
      setSuppliers((sup.data || []) as SupplierCommitment[])
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load reports', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const recognizedIncome = useMemo(() => income.filter(isRecognizedIncome), [income])

  const fxReport = useMemo(
    () =>
      buildCurrencyReport({
        quotes,
        payments,
        refunds,
        suppliers,
      }),
    [quotes, payments, refunds, suppliers],
  )
  const cashByCurrency = useMemo(() => cashReceivedByCurrency(payments), [payments])

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

  const crmFunnel = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of PIPELINE_STAGES) counts[s] = 0
    const reasons: Record<string, number> = {}
    let won = 0
    let lost = 0
    for (const c of crm) {
      const s = c.pipeline_stage || 'Lead'
      counts[s] = (counts[s] || 0) + 1
      if (s === 'Won') {
        won += 1
        const r = (c.outcome_reason || 'Unspecified').trim() || 'Unspecified'
        reasons[r] = (reasons[r] || 0) + 1
      } else if (s === 'Lost') {
        lost += 1
        const r = (c.outcome_reason || 'Unspecified').trim() || 'Unspecified'
        reasons[r] = (reasons[r] || 0) + 1
      }
    }
    const decided = won + lost
    const winPct = decided > 0 ? Math.round((won / decided) * 1000) / 10 : 0
    const reasonRows = Object.entries(reasons)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
    return {
      stages: PIPELINE_STAGES.map((s) => ({ stage: s, count: counts[s] || 0 })),
      won,
      lost,
      winPct,
      reasonRows,
      total: crm.length,
    }
  }, [crm])

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
      if (!isOpenInvoice(inv)) continue
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
    for (const row of recognizedIncome) {
      const key = monthKey(row.date)
      if (!key) continue
      const m = months.find((x) => x.key === key)
      if (m) m.income += Number(row.total_amount) || 0
    }
    for (const row of expenses) {
      const key = monthKey(row.date)
      if (!key) continue
      const m = months.find((x) => x.key === key)
      if (m) m.expenses += Number(row.amount) || 0
    }
    for (const m of months) m.net = m.income - m.expenses
    return months
  }, [recognizedIncome, expenses])

  const vatMonths = useMemo(() => quarterMonths(vatYear, vatQuarter), [vatYear, vatQuarter])

  const vatReport = useMemo(() => {
    const monthSet = new Set(vatMonths)
    const incomeRows = recognizedIncome
      .filter((r) => {
        const k = monthKey(r.date)
        return k != null && monthSet.has(k)
      })
      .map((r) => {
        const parts = incomeVatParts(r, vatRate)
        return {
          id: r.id,
          date: r.date,
          month: monthKey(r.date) || '',
          client: r.client_source,
          reference: r.reference_number,
          description: r.description || r.category,
          ...parts,
        }
      })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))

    const expenseRows = expenses
      .filter((r) => {
        const k = monthKey(r.date)
        return k != null && monthSet.has(k)
      })
      .map((r) => {
        const parts = expenseVatParts(r, vatRate)
        return {
          id: r.id,
          date: r.date,
          month: monthKey(r.date) || '',
          vendor: r.vendor,
          category: r.category,
          reference: r.references_text,
          notes: r.notes,
          ...parts,
        }
      })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))

    const byMonth = vatMonths.map((key) => {
      const inc = incomeRows.filter((r) => r.month === key)
      const exp = expenseRows.filter((r) => r.month === key)
      const outputVat = inc.reduce((s, r) => s + r.vat, 0)
      const inputVat = exp.reduce((s, r) => s + r.vat, 0)
      const supplies = inc.reduce((s, r) => s + r.exclusive, 0)
      const purchases = exp.reduce((s, r) => s + r.exclusive, 0)
      return {
        key,
        label: format(parseISO(`${key}-01`), 'MMM yyyy'),
        supplies,
        outputVat,
        purchases,
        inputVat,
        netVat: outputVat - inputVat,
        incomeCount: inc.length,
        expenseCount: exp.length,
      }
    })

    const totals = byMonth.reduce(
      (acc, m) => ({
        supplies: acc.supplies + m.supplies,
        outputVat: acc.outputVat + m.outputVat,
        purchases: acc.purchases + m.purchases,
        inputVat: acc.inputVat + m.inputVat,
        netVat: acc.netVat + m.netVat,
      }),
      { supplies: 0, outputVat: 0, purchases: 0, inputVat: 0, netVat: 0 },
    )

    return { incomeRows, expenseRows, byMonth, totals }
  }, [recognizedIncome, expenses, vatMonths, vatRate])

  const maxPnl = Math.max(1, ...monthlyPnl.map((m) => Math.max(m.income, m.expenses)))

  function exportCsv() {
    if (tab === 'fx') {
      const lines = [
        'MULTI-CURRENCY REPORT',
        `Bookings,${fxReport.bookingCount}`,
        '',
        'CUSTOMER REVENUE BY ORIGINAL CURRENCY (invoiced)',
        'Currency,Amount',
        ...Object.entries(fxReport.revenueByCurrency).map(([c, a]) => `${escapeCsv(c)},${a}`),
        '',
        `Customer revenue converted to ${BASE_CURRENCY},${fxReport.revenueBase}`,
        '',
        'CASH RECEIVED BY PAYMENT CURRENCY',
        'Currency,Amount',
        ...Object.entries(cashByCurrency).map(([c, a]) => `${escapeCsv(c)},${a}`),
        '',
        'OUTSTANDING BALANCES BY CURRENCY',
        'Currency,Amount',
        ...Object.entries(fxReport.outstandingByCurrency).map(([c, a]) => `${escapeCsv(c)},${a}`),
        `Outstanding ${BASE_CURRENCY} equiv.,${fxReport.outstandingBase}`,
        '',
        'SUPPLIER PAYABLES BY CURRENCY',
        'Currency,Amount',
        ...Object.entries(fxReport.supplierPayablesByCurrency).map(([c, a]) => `${escapeCsv(c)},${a}`),
        `Supplier payables ${BASE_CURRENCY},${fxReport.supplierPayablesBase}`,
        '',
        `Currency-conversion fees (raw),${fxReport.conversionFees}`,
        `Currency-conversion fees ${BASE_CURRENCY},${fxReport.conversionFeesBase}`,
        `Exchange-rate gains and losses ${BASE_CURRENCY},${fxReport.fxGainLossBase}`,
        '',
        'GROSS PROFIT BY BOOKING CURRENCY (est. in AED keyed by quote currency)',
        'Quote currency,Est GP AED',
        ...Object.entries(fxReport.estimatedGpByBookingCurrency).map(([c, a]) => `${escapeCsv(c)},${a}`),
        `Estimated GP ${BASE_CURRENCY},${fxReport.estimatedGpBase}`,
        `Actual GP ${BASE_CURRENCY},${fxReport.actualGpBase}`,
      ]
      downloadCsv('multi-currency-report.csv', lines.join('\n'))
    } else if (tab === 'funnel') {
      const header = ['Stage', 'Count']
      const rows = crmFunnel.stages.map((r) => [r.stage, r.count].map(escapeCsv).join(','))
      const reasonHeader = ['Outcome reason', 'Count']
      const reasonRows = crmFunnel.reasonRows.map((r) =>
        [r.reason, r.count].map(escapeCsv).join(','),
      )
      downloadCsv(
        'crm-funnel.csv',
        [
          'PIPELINE',
          header.join(','),
          ...rows,
          '',
          `Won,${crmFunnel.won}`,
          `Lost,${crmFunnel.lost}`,
          `Win %,${crmFunnel.winPct}`,
          '',
          'OUTCOME REASONS',
          reasonHeader.join(','),
          ...reasonRows,
        ].join('\n'),
      )
    } else if (tab === 'winrate') {
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
    } else if (tab === 'pnl') {
      const header = ['Month', 'Income (paid)', 'Expenses', 'Net']
      const rows = monthlyPnl.map((r) =>
        [r.label, r.income, r.expenses, r.net].map(escapeCsv).join(','),
      )
      downloadCsv('monthly-pnl.csv', [header.join(','), ...rows].join('\n'))
    } else {
      const qLabel = `Q${vatQuarter}-${vatYear}`
      const summaryHeader = ['Month', 'Taxable supplies', 'Output VAT', 'Purchases (ex VAT)', 'Input VAT', 'Net VAT']
      const summaryRows = [
        ...vatReport.byMonth.map((m) =>
          [m.label, m.supplies, m.outputVat, m.purchases, m.inputVat, m.netVat].map(escapeCsv).join(','),
        ),
        ['TOTAL', vatReport.totals.supplies, vatReport.totals.outputVat, vatReport.totals.purchases, vatReport.totals.inputVat, vatReport.totals.netVat]
          .map(escapeCsv)
          .join(','),
      ]
      const incomeHeader = ['Date', 'Client', 'Reference', 'Description', 'Exclusive', 'VAT', 'Inclusive']
      const incomeRows = vatReport.incomeRows.map((r) =>
        [r.date, r.client, r.reference, r.description, r.exclusive, r.vat, r.inclusive]
          .map(escapeCsv)
          .join(','),
      )
      const expenseHeader = ['Date', 'Vendor', 'Category', 'Reference', 'Exclusive', 'VAT', 'Inclusive']
      const expenseRows = vatReport.expenseRows.map((r) =>
        [r.date, r.vendor, r.category, r.reference, r.exclusive, r.vat, r.inclusive]
          .map(escapeCsv)
          .join(','),
      )
      const body = [
        `VAT Report ${qLabel}`,
        '',
        'SUMMARY',
        summaryHeader.join(','),
        ...summaryRows,
        '',
        'INCOME (Output VAT)',
        incomeHeader.join(','),
        ...incomeRows,
        '',
        'EXPENSES (Input VAT — amounts treated as VAT-inclusive)',
        expenseHeader.join(','),
        ...expenseRows,
      ].join('\n')
      downloadCsv(`vat-report-${qLabel}.csv`, body)
    }
    showToast('CSV downloaded', 'success')
  }

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear()
    return [y, y - 1, y - 2]
  }, [])

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <h1 style={pageTitleStyle}>Reports</h1>
          <p style={pageSubtitleStyle}>VAT, sales, aging, multi-currency, and P&L — income excludes not-awarded quotes</p>
        </div>
        <button type="button" style={buttonPrimaryStyle} onClick={exportCsv} disabled={loading}>
          <Download size={16} /> Export CSV
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <button type="button" style={tabStyle(tab === 'vat')} onClick={() => setTab('vat')}>
          VAT report
        </button>
        <button type="button" style={tabStyle(tab === 'fx')} onClick={() => setTab('fx')}>
          Multi-currency
        </button>
        <button type="button" style={tabStyle(tab === 'funnel')} onClick={() => setTab('funnel')}>
          CRM funnel
        </button>
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
      ) : tab === 'fx' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>
            Amounts stay in their original currencies — never cross-added. Base currency is {BASE_CURRENCY}.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 10,
            }}
          >
            <FxKpi
              label={`Revenue (${BASE_CURRENCY})`}
              value={formatMoneyAmount(fxReport.revenueBase, BASE_CURRENCY)}
            />
            <FxKpi
              label={`Outstanding (${BASE_CURRENCY})`}
              value={formatMoneyAmount(fxReport.outstandingBase, BASE_CURRENCY)}
            />
            <FxKpi
              label={`Supplier payables (${BASE_CURRENCY})`}
              value={formatMoneyAmount(fxReport.supplierPayablesBase, BASE_CURRENCY)}
            />
            <FxKpi
              label={`FX gain / loss (${BASE_CURRENCY})`}
              value={formatMoneyAmount(fxReport.fxGainLossBase, BASE_CURRENCY)}
            />
            <FxKpi
              label={`Conversion fees (${BASE_CURRENCY})`}
              value={formatMoneyAmount(fxReport.conversionFeesBase, BASE_CURRENCY)}
            />
            <FxKpi
              label={`Est. GP (${BASE_CURRENCY})`}
              value={formatMoneyAmount(fxReport.estimatedGpBase, BASE_CURRENCY)}
            />
            <FxKpi
              label={`Actual GP (${BASE_CURRENCY})`}
              value={formatMoneyAmount(fxReport.actualGpBase, BASE_CURRENCY)}
            />
          </div>
          <CurrencyTable title="Customer revenue by original currency (invoiced)" rows={fxReport.revenueByCurrency} />
          <CurrencyTable title="Cash received by payment currency" rows={cashByCurrency} />
          <CurrencyTable title="Outstanding balances by currency" rows={fxReport.outstandingByCurrency} />
          <CurrencyTable title="Supplier payables by currency" rows={fxReport.supplierPayablesByCurrency} />
          <CurrencyTable
            title={`Gross profit (est. ${BASE_CURRENCY}) keyed by booking/quote currency`}
            rows={fxReport.estimatedGpByBookingCurrency}
            asBase
          />
        </div>
      ) : tab === 'funnel' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={cardStyle}>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: colors.muted }}>
              {crmFunnel.total} companies · Won {crmFunnel.won} · Lost {crmFunnel.lost} · Win rate{' '}
              {crmFunnel.winPct}% (of decided)
            </p>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Stage</th>
                    <th style={thStyle}>Count</th>
                    <th style={thStyle}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {crmFunnel.stages.map((r) => (
                    <tr key={r.stage}>
                      <td style={tdStyle}>{r.stage}</td>
                      <td style={tdStyle}>{r.count}</td>
                      <td style={tdStyle}>
                        {crmFunnel.total > 0
                          ? `${Math.round((r.count / crmFunnel.total) * 1000) / 10}%`
                          : '0%'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div style={cardStyle}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Won / Lost reasons</h2>
            {crmFunnel.reasonRows.length === 0 ? (
              <EmptyState
                title="No outcomes yet"
                subtitle="Set Won/Lost on CRM companies or sync from quote outcomes."
              />
            ) : (
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Reason</th>
                      <th style={thStyle}>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crmFunnel.reasonRows.map((r) => (
                      <tr key={r.reason}>
                        <td style={tdStyle}>{r.reason}</td>
                        <td style={tdStyle}>{r.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : tab === 'vat' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ ...cardStyle, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'end' }}>
            <div>
              <label style={labelStyle}>Year</label>
              <select
                style={selectStyle}
                value={vatYear}
                onChange={(e) => setVatYear(Number(e.target.value))}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Quarter</label>
              <select
                style={{ ...selectStyle, ...inputStyle }}
                value={vatQuarter}
                onChange={(e) => setVatQuarter(Number(e.target.value) as VatQuarter)}
              >
                <option value={1}>Q1 (Jan–Mar)</option>
                <option value={2}>Q2 (Apr–Jun)</option>
                <option value={3}>Q3 (Jul–Sep)</option>
                <option value={4}>Q4 (Oct–Dec)</option>
              </select>
            </div>
            <div style={{ fontSize: 13, color: colors.muted, paddingBottom: 8 }}>
              VAT rate {(vatRate * 100).toFixed(0)}% · Not-awarded quotes excluded from income
            </div>
          </div>

          <div style={cardStyle}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Quarter summary</h2>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Month</th>
                    <th style={thStyle}>Taxable supplies</th>
                    <th style={thStyle}>Output VAT</th>
                    <th style={thStyle}>Purchases (ex VAT)</th>
                    <th style={thStyle}>Input VAT</th>
                    <th style={thStyle}>Net VAT</th>
                  </tr>
                </thead>
                <tbody>
                  {vatReport.byMonth.map((m) => (
                    <tr key={m.key}>
                      <td style={tdStyle}>{m.label}</td>
                      <td style={tdStyle}>{formatAED(m.supplies)}</td>
                      <td style={tdStyle}>{formatAED(m.outputVat)}</td>
                      <td style={tdStyle}>{formatAED(m.purchases)}</td>
                      <td style={tdStyle}>{formatAED(m.inputVat)}</td>
                      <td style={{
                        ...tdStyle,
                        fontWeight: 700,
                        color: m.netVat >= 0 ? colors.success : colors.danger,
                      }}>
                        {formatAED(m.netVat)}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>TOTAL Q{vatQuarter}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{formatAED(vatReport.totals.supplies)}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{formatAED(vatReport.totals.outputVat)}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{formatAED(vatReport.totals.purchases)}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{formatAED(vatReport.totals.inputVat)}</td>
                    <td style={{
                      ...tdStyle,
                      fontWeight: 700,
                      color: vatReport.totals.netVat >= 0 ? colors.success : colors.danger,
                    }}>
                      {formatAED(vatReport.totals.netVat)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style={cardStyle}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Income / Output VAT</h2>
            {vatReport.incomeRows.length === 0 ? (
              <EmptyState title="No paid income this quarter" subtitle="Only paid / awarded income is included." />
            ) : (
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Client</th>
                      <th style={thStyle}>Reference</th>
                      <th style={thStyle}>Exclusive</th>
                      <th style={thStyle}>VAT</th>
                      <th style={thStyle}>Inclusive</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vatReport.incomeRows.map((r) => (
                      <tr key={r.id}>
                        <td style={tdStyle}>{r.date || '—'}</td>
                        <td style={tdStyle}>{r.client || '—'}</td>
                        <td style={tdStyle}>{r.reference || '—'}</td>
                        <td style={tdStyle}>{formatAED(r.exclusive)}</td>
                        <td style={tdStyle}>{formatAED(r.vat)}</td>
                        <td style={tdStyle}>{formatAED(r.inclusive)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={cardStyle}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Expenses / Input VAT</h2>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: colors.muted }}>
              Expense amounts are treated as VAT-inclusive and split at {(vatRate * 100).toFixed(0)}%.
            </p>
            {vatReport.expenseRows.length === 0 ? (
              <EmptyState title="No expenses this quarter" subtitle="Add expenses to calculate input VAT." />
            ) : (
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Vendor</th>
                      <th style={thStyle}>Category</th>
                      <th style={thStyle}>Exclusive</th>
                      <th style={thStyle}>VAT</th>
                      <th style={thStyle}>Inclusive</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vatReport.expenseRows.map((r) => (
                      <tr key={r.id}>
                        <td style={tdStyle}>{r.date || '—'}</td>
                        <td style={tdStyle}>{r.vendor || '—'}</td>
                        <td style={tdStyle}>{r.category || '—'}</td>
                        <td style={tdStyle}>{formatAED(r.exclusive)}</td>
                        <td style={tdStyle}>{formatAED(r.vat)}</td>
                        <td style={tdStyle}>{formatAED(r.inclusive)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
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
          <p style={{ margin: '0 0 14px', fontSize: 12, color: colors.muted }}>
            Income includes paid / awarded entries only — not awarded quotes are excluded.
          </p>
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

function FxKpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ ...cardStyle, padding: 12 }}>
      <div style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{value}</div>
    </div>
  )
}

function CurrencyTable({
  title,
  rows,
  asBase,
}: {
  title: string
  rows: Record<string, number>
  asBase?: boolean
}) {
  const entries = Object.entries(rows)
  return (
    <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.border}`, fontWeight: 700 }}>
        {title}
      </div>
      {entries.length === 0 ? (
        <div style={{ padding: 16, color: colors.muted, fontSize: 13 }}>No rows yet.</div>
      ) : (
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Currency</th>
                <th style={thStyle}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([c, a]) => (
                <tr key={c}>
                  <td style={tdStyle}>{c}</td>
                  <td style={tdStyle}>
                    {asBase ? formatMoneyAmount(a, BASE_CURRENCY) : formatMoneyAmount(a, c)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
