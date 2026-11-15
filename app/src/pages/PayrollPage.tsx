import { useCallback, useEffect, useState } from 'react'
import { Wallet } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import {
  createPayrollRun,
  generatePayrollLinesFromHr,
  listPayrollLines,
  listPayrollRuns,
  setPayrollRunStatus,
  submitPayrollForApproval,
  type PayrollLine,
  type PayrollRun,
} from '../lib/featureSliceStores'
import { buildWpsCsvDraft } from '../lib/wpsGratuity'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, inputStyle, labelStyle } from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M8: payroll runs, lines from HR, WPS draft export, maker-checker submit. */
export default function PayrollPage() {
  const { appUserId } = useAuth()
  const { showToast } = useToast()
  const [rows, setRows] = useState<PayrollRun[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [lines, setLines] = useState<PayrollLine[]>([])
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7))
  const [loading, setLoading] = useState(true)
  const [linesLoading, setLinesLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const runs = await listPayrollRuns()
      setRows(runs)
      if (selectedId && !runs.some((r) => r.id === selectedId)) setSelectedId(null)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load payroll'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, selectedId])

  const loadLines = useCallback(
    async (runId: string) => {
      setLinesLoading(true)
      try {
        setLines(await listPayrollLines(runId))
      } catch (e) {
        showToast(errorMessage(e, 'Could not load lines'), 'error')
      } finally {
        setLinesLoading(false)
      }
    },
    [showToast],
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (selectedId) void loadLines(selectedId)
    else setLines([])
  }, [selectedId, loadLines])

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    try {
      const id = await createPayrollRun(period, appUserId)
      showToast('Payroll run created', 'success')
      setSelectedId(id)
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not create run'), 'error')
    }
  }

  async function onGenerate() {
    if (!selectedId) return
    try {
      const n = await generatePayrollLinesFromHr(selectedId)
      showToast(n ? `Generated ${n} line(s) from active people` : 'No active people to generate', n ? 'success' : 'info')
      await loadLines(selectedId)
    } catch (err) {
      showToast(errorMessage(err, 'Could not generate lines'), 'error')
    }
  }

  async function onSubmitApproval() {
    if (!selectedId) return
    try {
      const result = await submitPayrollForApproval(selectedId, appUserId)
      showToast(
        result.needsApproval
          ? `Submitted for approval (AED ${result.totalNet.toFixed(2)})`
          : `Auto-approved under threshold (AED ${result.totalNet.toFixed(2)})`,
        'success',
      )
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not submit'), 'error')
    }
  }

  async function onMarkPaid() {
    if (!selectedId) return
    try {
      await setPayrollRunStatus(selectedId, 'paid', appUserId)
      showToast('Marked paid', 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not mark paid'), 'error')
    }
  }

  function downloadWps() {
    const selected = rows.find((r) => r.id === selectedId)
    const csv = buildWpsCsvDraft(
      lines.map((l) => ({
        employeeCode: l.hr_employees?.employee_code || l.employee_id.slice(0, 8),
        employeeName: l.hr_employees?.full_name || 'Employee',
        iban: l.hr_employees?.iban || '',
        amountAed: Number(l.net_aed || 0),
      })),
      `${selected?.period_yyyy_mm || period}-28`,
    )
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wps-draft-${selected?.period_yyyy_mm || period}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const selected = rows.find((r) => r.id === selectedId) || null
  const totalNet = lines.reduce((s, l) => s + Number(l.net_aed || 0), 0)
  const totalGratuity = lines.reduce((s, l) => s + Number(l.gratuity_accrual_aed || 0), 0)

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Payroll</p>
          <h1 className={docsStyles.title}>Payroll runs</h1>
          <p className={docsStyles.subtitle}>
            Generate lines from HR, export WPS drafts, and route large runs through Approvals. Not legal advice.
          </p>
        </div>
      </header>

      <form
        onSubmit={(e) => void onCreate(e)}
        style={{ ...cardStyle, marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}
      >
        <label style={labelStyle}>
          Period (YYYY-MM)
          <input style={inputStyle} value={period} onChange={(e) => setPeriod(e.target.value)} required pattern="\d{4}-\d{2}" />
        </label>
        <button type="submit" style={buttonPrimaryStyle}>
          Create draft run
        </button>
      </form>

      {loading ? (
        <p style={{ color: colors.muted }}>Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Wallet size={22} />} title="No payroll runs" subtitle="Create a draft for this month." />
      ) : (
        <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
          {rows.map((r) => (
            <article
              key={r.id}
              style={{
                ...cardStyle,
                cursor: 'pointer',
                borderColor: selectedId === r.id ? colors.accent : undefined,
              }}
              onClick={() => setSelectedId(r.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setSelectedId(r.id)
              }}
              role="button"
              tabIndex={0}
            >
              <strong>{r.period_yyyy_mm}</strong>
              <span style={{ marginLeft: 8, color: colors.muted, fontSize: 13 }}>{r.status}</span>
            </article>
          ))}
        </div>
      )}

      {selected ? (
        <section style={{ ...cardStyle, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <strong>
                {selected.period_yyyy_mm} · {selected.status}
              </strong>
              <div style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
                Net AED {totalNet.toFixed(2)} · Draft gratuity AED {totalGratuity.toFixed(2)} · {lines.length} line(s)
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {selected.status === 'draft' ? (
                <>
                  <button type="button" style={buttonSecondaryStyle} onClick={() => void onGenerate()}>
                    Generate from HR
                  </button>
                  <button type="button" style={buttonPrimaryStyle} onClick={() => void onSubmitApproval()} disabled={!lines.length}>
                    Submit / approve
                  </button>
                </>
              ) : null}
              {selected.status === 'approved' ? (
                <button type="button" style={buttonPrimaryStyle} onClick={() => void onMarkPaid()}>
                  Mark paid
                </button>
              ) : null}
              <button type="button" style={buttonSecondaryStyle} onClick={downloadWps} disabled={!lines.length}>
                Download WPS CSV
              </button>
            </div>
          </div>

          {linesLoading ? (
            <p style={{ color: colors.muted, margin: 0 }}>Loading lines…</p>
          ) : lines.length === 0 ? (
            <p style={{ color: colors.muted, margin: 0 }}>No lines yet — generate from active people.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: colors.muted }}>
                    <th style={{ padding: '6px 8px' }}>Employee</th>
                    <th style={{ padding: '6px 8px' }}>Basic</th>
                    <th style={{ padding: '6px 8px' }}>Allow.</th>
                    <th style={{ padding: '6px 8px' }}>Deduct.</th>
                    <th style={{ padding: '6px 8px' }}>Net</th>
                    <th style={{ padding: '6px 8px' }}>Gratuity</th>
                    <th style={{ padding: '6px 8px' }}>WPS</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} style={{ borderTop: `1px solid ${colors.border}` }}>
                      <td style={{ padding: '6px 8px' }}>
                        {l.hr_employees?.full_name || l.employee_id.slice(0, 8)}
                        <div style={{ color: colors.muted, fontSize: 11 }}>{l.hr_employees?.employee_code}</div>
                      </td>
                      <td style={{ padding: '6px 8px' }}>{Number(l.basic_aed).toFixed(2)}</td>
                      <td style={{ padding: '6px 8px' }}>{Number(l.allowances_aed).toFixed(2)}</td>
                      <td style={{ padding: '6px 8px' }}>{Number(l.deductions_aed).toFixed(2)}</td>
                      <td style={{ padding: '6px 8px' }}>{Number(l.net_aed).toFixed(2)}</td>
                      <td style={{ padding: '6px 8px' }}>{Number(l.gratuity_accrual_aed).toFixed(2)}</td>
                      <td style={{ padding: '6px 8px' }}>{l.wps_ready ? 'ready' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
}
