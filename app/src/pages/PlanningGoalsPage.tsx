import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Target } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import { db } from '../lib/db'
import {
  actualForGoalMetric,
  currentPeriodYyyyMm,
  GOAL_METRICS,
  goalProgressPct,
} from '../lib/planningGoals'
import {
  createPlanningGoal,
  listPlanningGoals,
  setPlanningGoalStatus,
  type PlanningGoal,
} from '../lib/planningGoalsStore'
import {
  createPlanningScenario,
  deactivatePlanningScenario,
  listPlanningScenarios,
  type PlanningScenario,
} from '../lib/planningScenariosStore'
import { PLANNING_GOALS_CSV_COLUMNS, PLANNING_SCENARIOS_CSV_COLUMNS } from '../lib/planningCsv'
import { csvRowsToObjects, exportListCsv, parseCsv, parseListIoRows } from '../lib/listIo'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  labelStyle,
  selectStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** §6.12 planning goals + scenario stubs. */
export default function PlanningGoalsPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<PlanningGoal[]>([])
  const [scenarios, setScenarios] = useState<PlanningScenario[]>([])
  const [invoices, setInvoices] = useState<
    { amount?: number; status?: string; date?: string | null; created_at?: string | null }[]
  >([])
  const [deals, setDeals] = useState<{ created_at?: string | null }[]>([])
  const [name, setName] = useState('')
  const [metricKey, setMetricKey] = useState('revenue_aed')
  const [target, setTarget] = useState('')
  const [period, setPeriod] = useState(currentPeriodYyyyMm())
  const [scenarioName, setScenarioName] = useState('')
  const [scenarioAssumptions, setScenarioAssumptions] = useState('{"revenue_uplift_pct":0}')
  const [loading, setLoading] = useState(true)
  const [importingGoals, setImportingGoals] = useState(false)
  const [importingScenarios, setImportingScenarios] = useState(false)
  const goalsImportRef = useRef<HTMLInputElement>(null)
  const scenariosImportRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [goals, inv, sd, sc] = await Promise.all([
        listPlanningGoals(),
        db.from('invoices').select('amount, status, date, created_at').limit(500),
        db.from('sales_deals').select('created_at').limit(500),
        listPlanningScenarios().catch(() => [] as PlanningScenario[]),
      ])
      setRows(goals)
      setInvoices((inv.data || []) as typeof invoices)
      setDeals((sd.data || []) as typeof deals)
      setScenarios(sc)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load goals'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    try {
      await createPlanningGoal({
        name,
        metricKey,
        targetValue: Number(target) || 0,
        periodYyyyMm: period,
      })
      showToast('Goal saved', 'success')
      setName('')
      setTarget('')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not save goal'), 'error')
    }
  }

  async function importGoalsCsv(file: File) {
    setImportingGoals(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      const objects = csvRowsToObjects(headers, csvRows).map((row) => {
        const normalized: Record<string, string> = {}
        for (const c of PLANNING_GOALS_CSV_COLUMNS) {
          normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
        }
        return normalized
      })
      const { ok, errors } = parseListIoRows(objects, PLANNING_GOALS_CSV_COLUMNS)
      if (!ok.length && errors.length) {
        showToast(errors[0] || 'No valid goal rows', 'error')
        return
      }
      const metricKeys = new Set<string>(GOAL_METRICS.map((m) => m.key))
      let saved = 0
      let skipped = errors.length
      for (const row of ok) {
        const metric = metricKeys.has(row.metric_key) ? row.metric_key : 'revenue_aed'
        const periodYyyyMm = /^\d{4}-\d{2}$/.test(row.period_yyyy_mm)
          ? row.period_yyyy_mm
          : currentPeriodYyyyMm()
        await createPlanningGoal({
          name: row.name,
          metricKey: metric,
          targetValue: Number(row.target_value) || 0,
          periodYyyyMm,
          notes: row.notes || '',
          status: row.status || 'active',
        })
        saved += 1
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} goal(s)${skipNote}`, 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Goals CSV import failed'), 'error')
    } finally {
      setImportingGoals(false)
      if (goalsImportRef.current) goalsImportRef.current.value = ''
    }
  }

  async function importScenariosCsv(file: File) {
    setImportingScenarios(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      const objects = csvRowsToObjects(headers, csvRows).map((row) => {
        const normalized: Record<string, string> = {}
        for (const c of PLANNING_SCENARIOS_CSV_COLUMNS) {
          normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
        }
        return normalized
      })
      const { ok, errors } = parseListIoRows(objects, PLANNING_SCENARIOS_CSV_COLUMNS)
      if (!ok.length && errors.length) {
        showToast(errors[0] || 'No valid scenario rows', 'error')
        return
      }
      let saved = 0
      let skipped = errors.length
      for (const row of ok) {
        let assumptions: Record<string, unknown> = { revenue_uplift_pct: 0 }
        if (row.assumptions_json) {
          try {
            const parsed = JSON.parse(row.assumptions_json) as unknown
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              assumptions = parsed as Record<string, unknown>
            } else {
              skipped += 1
              continue
            }
          } catch {
            skipped += 1
            continue
          }
        }
        await createPlanningScenario({
          name: row.name,
          description: row.description || '',
          assumptions,
        })
        saved += 1
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} scenario(s)${skipNote}`, 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Scenarios CSV import failed'), 'error')
    } finally {
      setImportingScenarios(false)
      if (scenariosImportRef.current) scenariosImportRef.current.value = ''
    }
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Planning · M12</p>
          <h1 className={docsStyles.title}>
            <Target size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Goals
          </h1>
          <p className={docsStyles.subtitle}>
            Period targets for revenue and deals. Scenario stubs hold assumptions only — no live forecast.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={goalsImportRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importGoalsCsv(file)
            }}
          />
          <input
            ref={scenariosImportRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importScenariosCsv(file)
            }}
          />
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={importingGoals}
            onClick={() => goalsImportRef.current?.click()}
          >
            {importingGoals ? 'Importing…' : 'Import goals CSV'}
          </button>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!rows.length}
            onClick={() => {
              exportListCsv(
                'planning-goals.csv',
                ['name', 'metric_key', 'target_value', 'period_yyyy_mm', 'status'],
                rows.map((r) => ({
                  name: r.name,
                  metric_key: r.metric_key,
                  target_value: r.target_value,
                  period_yyyy_mm: r.period_yyyy_mm,
                  status: r.status,
                })),
              )
              showToast('Goals CSV downloaded', 'success')
            }}
          >
            Export goals CSV
          </button>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={importingScenarios}
            onClick={() => scenariosImportRef.current?.click()}
          >
            {importingScenarios ? 'Importing…' : 'Import scenarios CSV'}
          </button>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!scenarios.length}
            onClick={() => {
              exportListCsv(
                'planning-scenarios.csv',
                ['name', 'description', 'assumptions_json', 'active'],
                scenarios.map((s) => ({
                  name: s.name,
                  description: s.description || '',
                  assumptions_json: JSON.stringify(s.assumptions_json ?? {}),
                  active: s.active,
                })),
              )
              showToast('Scenarios CSV downloaded', 'success')
            }}
          >
            Export scenarios CSV
          </button>
        </div>
      </header>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <form style={cardStyle} onSubmit={(e) => void onCreate(e)}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>New goal</h2>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '2fr 1fr 1fr 1fr' }}>
              <label style={labelStyle}>
                Name
                <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label style={labelStyle}>
                Metric
                <select style={selectStyle} value={metricKey} onChange={(e) => setMetricKey(e.target.value)}>
                  {GOAL_METRICS.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                Target
                <input
                  style={inputStyle}
                  type="number"
                  min={0}
                  step="0.01"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  required
                />
              </label>
              <label style={labelStyle}>
                Period (YYYY-MM)
                <input style={inputStyle} value={period} onChange={(e) => setPeriod(e.target.value)} required />
              </label>
            </div>
            <button type="submit" style={{ ...buttonPrimaryStyle, marginTop: 10 }}>
              Save goal
            </button>
          </form>

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Scenarios (stub)</h2>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: colors.muted }}>
              Named what-if rows with assumptions JSON. Forecasting engine later.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <input
                style={{ ...inputStyle, maxWidth: 240 }}
                placeholder="Scenario name"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
              />
              <input
                style={{ ...inputStyle, maxWidth: 280, fontFamily: 'monospace', fontSize: 12 }}
                placeholder='Assumptions JSON e.g. {"revenue_uplift_pct":5}'
                value={scenarioAssumptions}
                onChange={(e) => setScenarioAssumptions(e.target.value)}
              />
              <button
                type="button"
                style={buttonSecondaryStyle}
                disabled={!scenarioName.trim()}
                onClick={() => {
                  let assumptions: Record<string, unknown> = { revenue_uplift_pct: 0 }
                  try {
                    const parsed = JSON.parse(scenarioAssumptions || '{}')
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                      assumptions = parsed as Record<string, unknown>
                    } else {
                      showToast('Assumptions must be a JSON object', 'error')
                      return
                    }
                  } catch {
                    showToast('Assumptions JSON is invalid', 'error')
                    return
                  }
                  void createPlanningScenario({ name: scenarioName, assumptions })
                    .then(() => {
                      showToast('Scenario saved', 'success')
                      setScenarioName('')
                      setScenarioAssumptions('{"revenue_uplift_pct":0}')
                      return load()
                    })
                    .catch((err) => showToast(errorMessage(err, 'Could not save scenario'), 'error'))
                }}
              >
                Add scenario
              </button>
            </div>
            {scenarios.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>No scenarios yet.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                {scenarios.map((s) => (
                  <li
                    key={s.id}
                    style={{
                      fontSize: 13,
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      alignItems: 'flex-start',
                      borderTop: `1px solid ${colors.border}`,
                      paddingTop: 6,
                    }}
                  >
                    <div>
                      <strong>{s.name}</strong>
                      {s.description ? ` · ${s.description}` : ''}
                      <div style={{ color: colors.muted, fontSize: 12, fontFamily: 'monospace' }}>
                        {JSON.stringify(s.assumptions_json ?? {})}
                      </div>
                    </div>
                    <button
                      type="button"
                      style={{ ...buttonSecondaryStyle, padding: '2px 8px', fontSize: 12 }}
                      onClick={() => {
                        void deactivatePlanningScenario(s.id)
                          .then(() => {
                            showToast('Scenario deactivated', 'success')
                            return load()
                          })
                          .catch((err) => showToast(errorMessage(err, 'Could not deactivate'), 'error'))
                      }}
                    >
                      Deactivate
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Goals</h2>
            {rows.length === 0 ? (
              <EmptyState title="No goals yet" subtitle="Add a period target above." />
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                {rows.map((r) => {
                  const metric = GOAL_METRICS.find((m) => m.key === r.metric_key)?.label || r.metric_key
                  const actual = actualForGoalMetric(r.metric_key, r.period_yyyy_mm, { invoices, deals })
                  const pct = goalProgressPct(actual, r.target_value)
                  return (
                    <li key={r.id} style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 8 }}>
                      <div style={{ fontSize: 13 }}>
                        <strong>{r.name}</strong> · {metric} · target {r.target_value} · {r.period_yyyy_mm} ·{' '}
                        {r.status}
                        <div style={{ color: colors.muted, fontSize: 12 }}>
                          Actual {actual} · progress {pct}% (Unverified)
                        </div>
                      </div>
                      {r.status === 'active' ? (
                        <button
                          type="button"
                          style={{ ...buttonSecondaryStyle, marginTop: 6 }}
                          onClick={() => {
                            void setPlanningGoalStatus(r.id, 'achieved')
                              .then(() => {
                                showToast('Marked achieved', 'success')
                                return load()
                              })
                              .catch((err) => showToast(errorMessage(err, 'Update failed'), 'error'))
                          }}
                        >
                          Mark achieved
                        </button>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
