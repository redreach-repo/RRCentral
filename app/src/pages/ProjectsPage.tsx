import { useCallback, useEffect, useState } from 'react'
import { Briefcase } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import { projectCostTotal, projectHealth } from '../lib/projectAccounting'
import {
  addProjectCost,
  createDeliveryProject,
  listDeliveryProjects,
  listProjectCosts,
  type DeliveryProject,
  type ProjectCostLine,
} from '../lib/opsSliceStores'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, inputStyle, labelStyle, selectStyle } from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M9b: project headers + cost lines. */
export default function ProjectsPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<DeliveryProject[]>([])
  const [selected, setSelected] = useState<DeliveryProject | null>(null)
  const [costs, setCosts] = useState<ProjectCostLine[]>([])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [budget, setBudget] = useState('')
  const [category, setCategory] = useState('labour')
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listDeliveryProjects())
    } catch (e) {
      showToast(errorMessage(e, 'Could not load projects'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function openProject(p: DeliveryProject) {
    setSelected(p)
    try {
      setCosts(await listProjectCosts(p.id))
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
          <p className={docsStyles.subtitle}>Track delivery projects and cost lines against a budget.</p>
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
              })
                .then(() => {
                  showToast('Project created', 'success')
                  setCode('')
                  setName('')
                  setBudget('')
                  return load()
                })
                .catch((err) => showToast(errorMessage(err, 'Create failed'), 'error'))
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: 16 }}>New project</h2>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr 1fr' }}>
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
                {rows.map((p) => (
                  <li key={p.id}>
                    <button type="button" style={buttonSecondaryStyle} onClick={() => void openProject(p)}>
                      {p.code || p.id.slice(0, 8)} · {p.name} · {p.status}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selected ? (
              <div style={{ marginTop: 12 }}>
                <h3 style={{ fontSize: 14 }}>
                  {selected.name} — spent {spent.toFixed(2)} AED · health {health}
                </h3>
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
              </div>
            ) : null}
          </section>
        </div>
      )}
    </div>
  )
}
