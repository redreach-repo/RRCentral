import { useCallback, useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import {
  createHrEmployee,
  listHrEmployees,
  updateHrEmployee,
  type HrEmployee,
} from '../lib/featureSliceStores'
import {
  dailyWageFromBasicMonthly,
  draftGratuityAccrualAed,
  yearsOfServiceFromStart,
} from '../lib/wpsGratuity'
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

const STATUSES = ['active', 'onboarding', 'leave', 'exited'] as const

/** M6: employee directory with edit + gratuity draft preview. */
export default function HrPeoplePage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<HrEmployee[]>([])
  const [filter, setFilter] = useState('active')
  const [editing, setEditing] = useState<HrEmployee | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState('')
  const [department, setDepartment] = useState('')
  const [code, setCode] = useState('')
  const [salary, setSalary] = useState('')
  const [allowances, setAllowances] = useState('')
  const [iban, setIban] = useState('')
  const [startDate, setStartDate] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listHrEmployees(filter))
    } catch (e) {
      showToast(errorMessage(e, 'Could not load people'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, filter])

  useEffect(() => {
    void load()
  }, [load])

  function resetForm() {
    setEditing(null)
    setName('')
    setEmail('')
    setTitle('')
    setDepartment('')
    setCode('')
    setSalary('')
    setAllowances('')
    setIban('')
    setStartDate('')
  }

  function startEdit(r: HrEmployee) {
    setEditing(r)
    setName(r.full_name)
    setEmail(r.email)
    setTitle(r.job_title)
    setDepartment(r.department)
    setCode(r.employee_code)
    setSalary(r.basic_salary_aed != null ? String(r.basic_salary_aed) : '')
    setAllowances(String(r.allowances_aed || ''))
    setIban(r.iban || '')
    setStartDate(r.start_date || '')
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const payload = {
      full_name: name,
      email,
      job_title: title,
      department,
      employee_code: code || undefined,
      basic_salary_aed: salary ? Number(salary) : null,
      allowances_aed: allowances ? Number(allowances) : 0,
      iban,
      start_date: startDate || null,
    }
    try {
      if (editing) {
        await updateHrEmployee(editing.id, {
          ...payload,
          employee_code: code || editing.employee_code,
        })
        showToast('Person updated', 'success')
      } else {
        await createHrEmployee(payload)
        showToast('Person added', 'success')
      }
      resetForm()
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not save person'), 'error')
    }
  }

  async function setStatus(r: HrEmployee, employment_status: string) {
    try {
      await updateHrEmployee(r.id, { employment_status })
      showToast(`Marked ${employment_status}`, 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not update status'), 'error')
    }
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>HR</p>
          <h1 className={docsStyles.title}>People</h1>
          <p className={docsStyles.subtitle}>
            Directory, pay components, and draft gratuity preview. Not legal advice.
          </p>
        </div>
      </header>

      <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={labelStyle}>
          Filter
          <select style={selectStyle} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        style={{ ...cardStyle, marginBottom: 16, display: 'grid', gap: 10, maxWidth: 640 }}
      >
        <strong>{editing ? 'Edit person' : 'Add person'}</strong>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          <label style={labelStyle}>
            Full name
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label style={labelStyle}>
            Code
            <input style={inputStyle} value={code} onChange={(e) => setCode(e.target.value)} placeholder="auto" />
          </label>
          <label style={labelStyle}>
            Email
            <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label style={labelStyle}>
            Job title
            <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label style={labelStyle}>
            Department
            <input style={inputStyle} value={department} onChange={(e) => setDepartment(e.target.value)} />
          </label>
          <label style={labelStyle}>
            Start date
            <input style={inputStyle} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label style={labelStyle}>
            Basic (AED)
            <input style={inputStyle} type="number" min={0} step="0.01" value={salary} onChange={(e) => setSalary(e.target.value)} />
          </label>
          <label style={labelStyle}>
            Allowances (AED)
            <input
              style={inputStyle}
              type="number"
              min={0}
              step="0.01"
              value={allowances}
              onChange={(e) => setAllowances(e.target.value)}
            />
          </label>
          <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
            IBAN (WPS draft)
            <input style={inputStyle} value={iban} onChange={(e) => setIban(e.target.value)} placeholder="AE…" />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="submit" style={buttonPrimaryStyle}>
            {editing ? 'Save changes' : 'Add person'}
          </button>
          {editing ? (
            <button type="button" style={buttonSecondaryStyle} onClick={resetForm}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      {loading ? (
        <p style={{ color: colors.muted }}>Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Users size={22} />} title="No people yet" subtitle="Add the first employee to start HR." />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((r) => {
            const years = yearsOfServiceFromStart(r.start_date)
            const gratuity = draftGratuityAccrualAed({
              yearsOfService: years,
              dailyWageAed: dailyWageFromBasicMonthly(r.basic_salary_aed),
            })
            return (
              <article key={r.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong>
                      {r.full_name}{' '}
                      <span style={{ color: colors.muted, fontWeight: 400, fontSize: 13 }}>{r.employee_code}</span>
                    </strong>
                    <div style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
                      {[r.job_title, r.department, r.email, r.employment_status].filter(Boolean).join(' · ')}
                    </div>
                    <div style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
                      Basic AED {Number(r.basic_salary_aed || 0).toFixed(2)} · Allowances AED{' '}
                      {Number(r.allowances_aed || 0).toFixed(2)}
                      {r.iban ? ` · ${r.iban}` : ' · no IBAN'}
                    </div>
                    <div style={{ color: colors.muted2, fontSize: 12, marginTop: 4 }}>
                      Draft gratuity ({years}y): AED {gratuity.toFixed(2)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'start' }}>
                    <button type="button" style={buttonSecondaryStyle} onClick={() => startEdit(r)}>
                      Edit
                    </button>
                    <select
                      style={selectStyle}
                      value={r.employment_status}
                      onChange={(e) => void setStatus(r, e.target.value)}
                      aria-label={`Status for ${r.full_name}`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
