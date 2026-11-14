import { useCallback, useEffect, useState } from 'react'
import { Wallet } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import { createPayrollRun, listPayrollRuns, type PayrollRun } from '../lib/featureSliceStores'
import { draftGratuityAccrualAed, buildWpsCsvDraft } from '../lib/wpsGratuity'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, inputStyle, labelStyle } from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M8 first slice: payroll runs + WPS/gratuity draft helpers. */
export default function PayrollPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<PayrollRun[]>([])
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7))
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listPayrollRuns())
    } catch (e) {
      showToast(errorMessage(e, 'Could not load payroll'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    try {
      await createPayrollRun(period)
      showToast('Payroll run created', 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not create run'), 'error')
    }
  }

  function downloadSampleWps() {
    const csv = buildWpsCsvDraft(
      [{ employeeCode: 'E001', employeeName: 'Sample Employee', iban: 'AE070331234567890123456', amountAed: 5000 }],
      new Date().toISOString(),
    )
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wps-draft-${period}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const sampleGratuity = draftGratuityAccrualAed({ yearsOfService: 3, dailyWageAed: 200 })

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Payroll · first slice</p>
          <h1 className={docsStyles.title}>Payroll runs</h1>
          <p className={docsStyles.subtitle}>
            Period runs and WPS/gratuity drafts. Not legal advice — verify UAE labour rules before live pay.
          </p>
        </div>
      </header>

      <form onSubmit={(e) => void onCreate(e)} style={{ ...cardStyle, marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={labelStyle}>
          Period (YYYY-MM)
          <input style={inputStyle} value={period} onChange={(e) => setPeriod(e.target.value)} required pattern="\d{4}-\d{2}" />
        </label>
        <button type="submit" style={buttonPrimaryStyle}>
          Create draft run
        </button>
        <button type="button" style={buttonSecondaryStyle} onClick={downloadSampleWps}>
          Sample WPS CSV
        </button>
      </form>

      <p style={{ ...cardStyle, color: colors.muted, fontSize: 13, marginBottom: 16 }}>
        Sample gratuity accrual (3 years × AED 200/day draft band): <strong style={{ color: colors.text }}>AED {sampleGratuity.toFixed(2)}</strong>
      </p>

      {loading ? (
        <p style={{ color: colors.muted }}>Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Wallet size={22} />} title="No payroll runs" subtitle="Create a draft for this month." />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((r) => (
            <article key={r.id} style={cardStyle}>
              <strong>{r.period_yyyy_mm}</strong>
              <span style={{ marginLeft: 8, color: colors.muted, fontSize: 13 }}>{r.status}</span>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
