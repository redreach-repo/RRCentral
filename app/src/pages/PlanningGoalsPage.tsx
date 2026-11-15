import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Target } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import {
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
import { exportListCsv } from '../lib/listIo'
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

/** §6.12 planning goals stub (scenarios later). */
export default function PlanningGoalsPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<PlanningGoal[]>([])
  const [name, setName] = useState('')
  const [metricKey, setMetricKey] = useState('revenue_aed')
  const [target, setTarget] = useState('')
  const [period, setPeriod] = useState(currentPeriodYyyyMm())
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listPlanningGoals())
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
            Period targets for revenue and deals. Scenario builder comes later.
          </p>
        </div>
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
          Export CSV
        </button>
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
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Goals</h2>
            {rows.length === 0 ? (
              <EmptyState title="No goals yet" subtitle="Add a period target above." />
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                {rows.map((r) => {
                  const metric = GOAL_METRICS.find((m) => m.key === r.metric_key)?.label || r.metric_key
                  // Actuals are wired later — progress shows 0 until reporting hooks land.
                  const pct = goalProgressPct(0, r.target_value)
                  return (
                    <li key={r.id} style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 8 }}>
                      <div style={{ fontSize: 13 }}>
                        <strong>{r.name}</strong> · {metric} · target {r.target_value} · {r.period_yyyy_mm} ·{' '}
                        {r.status}
                        <div style={{ color: colors.muted, fontSize: 12 }}>
                          Actual tracking stub · progress {pct}%
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
