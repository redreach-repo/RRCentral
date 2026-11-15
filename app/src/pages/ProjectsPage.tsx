import { useCallback, useEffect, useState } from 'react'
import { Briefcase } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import { computeWipAed, projectCostTotal, projectHealth } from '../lib/projectAccounting'
import {
  addProjectBillingSchedule,
  addProjectCost,
  createDeliveryProject,
  listDeliveryProjects,
  listProjectBillingSchedules,
  listProjectCosts,
  markProjectMilestoneBilled,
  refreshProjectWip,
  restoreDeliveryProject,
  softDeleteDeliveryProject,
  updateProjectBilling,
  type DeliveryProject,
  type ProjectBillingSchedule,
  type ProjectCostLine,
} from '../lib/opsSliceStores'
import { exportListCsv } from '../lib/listIo'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, inputStyle, labelStyle, selectStyle } from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M9b: project headers + cost lines. */
export default function ProjectsPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<DeliveryProject[]>([])
  const [selected, setSelected] = useState<DeliveryProject | null>(null)
  const [costs, setCosts] = useState<ProjectCostLine[]>([])
  const [schedules, setSchedules] = useState<ProjectBillingSchedule[]>([])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [budget, setBudget] = useState('')
  const [retention, setRetention] = useState('0')
  const [billed, setBilled] = useState('')
  const [category, setCategory] = useState('labour')
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [mileLabel, setMileLabel] = useState('')
  const [milePct, setMilePct] = useState('25')
  const [mileAmount, setMileAmount] = useState('')
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listDeliveryProjects({ includeDeleted: showArchived }))
    } catch (e) {
      showToast(errorMessage(e, 'Could not load projects'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, showArchived])

  useEffect(() => {
    void load()
  }, [load])

  async function reloadSelected(projectId: string) {
    const next = (await listDeliveryProjects({ includeDeleted: showArchived })).find(
      (p) => p.id === projectId,
    )
    if (next) await openProject(next)
  }

  async function openProject(p: DeliveryProject) {
    setSelected(p)
    try {
      const [c, s] = await Promise.all([listProjectCosts(p.id), listProjectBillingSchedules(p.id)])
      setCosts(c)
      setSchedules(s)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load costs'), 'error')
    }
  }

  const spent = projectCostTotal(costs)
  const health = selected ? projectHealth(selected.budget_aed, spent) : 'unbudgeted'

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Delivery · M9b</p>
          <h1 className={docsStyles.title}>
            <Briefcase size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Projects
          </h1>
          <p className={docsStyles.subtitle}>
            Track delivery projects, cost lines, WIP and retention (Unverified stub — not full job-cost accounting).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!rows.length}
            onClick={() => {
              exportListCsv(
                'projects.csv',
                ['code', 'name', 'status', 'budget_aed', 'retention_pct', 'billed_to_date_aed', 'wip_aed'],
                rows.map((r) => ({
                  code: r.code,
                  name: r.name,
                  status: r.status,
                  budget_aed: r.budget_aed ?? '',
                  retention_pct: r.retention_pct,
                  billed_to_date_aed: r.billed_to_date_aed,
                  wip_aed: r.wip_aed,
                })),
              )
              showToast('Projects CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
        </div>
      </header>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <form
            style={cardStyle}
            onSubmit={(e) => {
              e.preventDefault()
              void createDeliveryProject({
                code,
                name,
                budgetAed: budget ? Number(budget) : null,
                retentionPct: Number(retention) || 0,
              })
                .then(() => {
                  showToast('Project created', 'success')
                  setCode('')
                  setName('')
                  setBudget('')
                  setRetention('0')
                  return load()
                })
                .catch((err) => showToast(errorMessage(err, 'Create failed'), 'error'))
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: 16 }}>New project</h2>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
              <label style={labelStyle}>
                Code
                <input style={inputStyle} value={code} onChange={(e) => setCode(e.target.value)} />
              </label>
              <label style={labelStyle}>
                Name
                <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label style={labelStyle}>
                Budget (AED)
                <input style={inputStyle} type="number" min={0} step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} />
              </label>
              <label style={labelStyle}>
                Retention %
                <input style={inputStyle} type="number" min={0} max={100} step="0.01" value={retention} onChange={(e) => setRetention(e.target.value)} />
              </label>
            </div>
            <button type="submit" style={{ ...buttonPrimaryStyle, marginTop: 10 }}>
              Create
            </button>
          </form>

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Projects</h2>
            {rows.length === 0 ? (
              <EmptyState title="No projects" subtitle="Create one above after applying the project accounting migration." />
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                {rows.map((p) => {
                  const archived = Boolean(p.deleted_at)
                  return (
                    <li key={p.id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button type="button" style={buttonSecondaryStyle} onClick={() => void openProject(p)}>
                        {p.code || p.id.slice(0, 8)} · {p.name} · {p.status}
                        {archived ? ' · archived' : ''}
                      </button>
                      <button
                        type="button"
                        style={buttonSecondaryStyle}
                        onClick={() => {
                          if (
                            !window.confirm(
                              archived ? `Restore ${p.code || p.name}?` : `Archive ${p.code || p.name}?`,
                            )
                          ) {
                            return
                          }
                          void (archived
                            ? restoreDeliveryProject(p.id)
                            : softDeleteDeliveryProject(p.id))
                            .then(() => {
                              showToast(archived ? 'Project restored' : 'Project archived', 'success')
                              if (selected?.id === p.id) setSelected(null)
                              return load()
                            })
                            .catch((err) => showToast(errorMessage(err, 'Archive failed'), 'error'))
                        }}
                      >
                        {archived ? 'Restore' : 'Archive'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {selected ? (
              <div style={{ marginTop: 12 }}>
                <h3 style={{ fontSize: 14 }}>
                  {selected.name} — spent {spent.toFixed(2)} AED · health {health} · WIP{' '}
                  {computeWipAed({
                    spentAed: spent,
                    billedToDateAed: selected.billed_to_date_aed,
                    retentionPct: selected.retention_pct,
                  }).toFixed(2)}{' '}
                  AED
                </h3>
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr auto', marginTop: 8, alignItems: 'end' }}>
                  <label style={labelStyle}>
                    Billed to date (AED)
                    <input style={inputStyle} type="number" min={0} step="0.01" value={billed} onChange={(e) => setBilled(e.target.value)} placeholder={String(selected.billed_to_date_aed)} />
                  </label>
                  <label style={labelStyle}>
                    Retention %
                    <input style={inputStyle} type="number" min={0} max={100} step="0.01" value={retention} onChange={(e) => setRetention(e.target.value)} />
                  </label>
                  <button
                    type="button"
                    style={buttonSecondaryStyle}
                    onClick={() => {
                      void updateProjectBilling({
                        projectId: selected.id,
                        billedToDateAed: billed === '' ? selected.billed_to_date_aed : Number(billed),
                        retentionPct: Number(retention) || selected.retention_pct,
                      })
                        .then(async () => {
                          showToast('Billing / WIP updated', 'success')
                          await load()
                          await reloadSelected(selected.id)
                        })
                        .catch((err) => showToast(errorMessage(err, 'WIP update failed'), 'error'))
                    }}
                  >
                    Save billing
                  </button>
                </div>
                <button
                  type="button"
                  style={{ ...buttonSecondaryStyle, marginTop: 8 }}
                  onClick={() => {
                    void refreshProjectWip(selected.id)
                      .then(async () => {
                        showToast('WIP refreshed', 'success')
                        await load()
                        await reloadSelected(selected.id)
                      })
                      .catch((err) => showToast(errorMessage(err, 'Refresh failed'), 'error'))
                  }}
                >
                  Refresh WIP
                </button>
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 2fr 1fr', marginTop: 8 }}>
                  <select style={selectStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
                    {['labour', 'materials', 'subcontractor', 'expense', 'other'].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input style={inputStyle} placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
                  <input style={inputStyle} type="number" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <button
                  type="button"
                  style={{ ...buttonPrimaryStyle, marginTop: 8 }}
                  onClick={() => {
                    void addProjectCost({
                      projectId: selected.id,
                      category,
                      description: desc,
                      amountAed: Number(amount),
                      costDate: new Date().toISOString().slice(0, 10),
                    })
                      .then(async () => {
                        showToast('Cost added', 'success')
                        setDesc('')
                        setAmount('')
                        await openProject(selected)
                      })
                      .catch((err) => showToast(errorMessage(err, 'Add failed'), 'error'))
                  }}
                >
                  Add cost
                </button>
                <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 13, color: colors.muted }}>
                  {costs.map((c) => (
                    <li key={c.id}>
                      {c.cost_date} · {c.category} · {c.description} · {Number(c.amount_aed).toFixed(2)}
                    </li>
                  ))}
                </ul>
                <h4 style={{ fontSize: 13, marginTop: 16 }}>Billing schedule</h4>
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '2fr 1fr 1fr auto', marginTop: 8 }}>
                  <input style={inputStyle} placeholder="Milestone" value={mileLabel} onChange={(e) => setMileLabel(e.target.value)} />
                  <input style={inputStyle} type="number" placeholder="%" value={milePct} onChange={(e) => setMilePct(e.target.value)} />
                  <input style={inputStyle} type="number" placeholder="AED" value={mileAmount} onChange={(e) => setMileAmount(e.target.value)} />
                  <button
                    type="button"
                    style={buttonPrimaryStyle}
                    onClick={() => {
                      void addProjectBillingSchedule({
                        projectId: selected.id,
                        label: mileLabel,
                        pct: Number(milePct) || 0,
                        amountAed: Number(mileAmount) || 0,
                      })
                        .then(async () => {
                          showToast('Milestone added', 'success')
                          setMileLabel('')
                          await openProject(selected)
                        })
                        .catch((err) => showToast(errorMessage(err, 'Milestone failed'), 'error'))
                    }}
                  >
                    Add
                  </button>
                </div>
                <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 13, color: colors.muted }}>
                  {schedules.map((s) => (
                    <li key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>
                        {s.milestone_label} · {s.pct}% · {Number(s.amount_aed).toFixed(2)} · {s.status}
                      </span>
                      {s.status === 'planned' ? (
                        <button
                          type="button"
                          style={buttonSecondaryStyle}
                          onClick={() => {
                            void markProjectMilestoneBilled(s.id)
                              .then(async () => {
                                showToast('Milestone billed', 'success')
                                await load()
                                await reloadSelected(selected.id)
                              })
                              .catch((err) => showToast(errorMessage(err, 'Mark billed failed'), 'error'))
                          }}
                        >
                          Mark billed
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </div>
      )}
    </div>
  )
}
