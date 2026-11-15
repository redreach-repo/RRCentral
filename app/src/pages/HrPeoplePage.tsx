import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Users } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import SavedViewsBar from '../components/SavedViewsBar'
import { errorMessage } from '../lib/errors'
import {
  createHrEmployee,
  listHrEmployees,
  restoreHrEmployee,
  softDeleteHrEmployee,
  updateHrEmployee,
  type HrEmployee,
} from '../lib/featureSliceStores'
import {
  dailyWageFromBasicMonthly,
  draftGratuityAccrualAed,
  yearsOfServiceFromStart,
} from '../lib/wpsGratuity'
import { HR_PEOPLE_CSV_COLUMNS } from '../lib/hrPeopleCsv'
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

const STATUSES = ['active', 'onboarding', 'leave', 'exited'] as const

/** M6: employee directory with edit + gratuity draft preview. */
export default function HrPeoplePage() {
  const { appUserId } = useAuth()
  const { showToast } = useToast()
  const [rows, setRows] = useState<HrEmployee[]>([])
  const [directory, setDirectory] = useState<HrEmployee[]>([])
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
  const [labourCard, setLabourCard] = useState('')
  const [routing, setRouting] = useState('')
  const [startDate, setStartDate] = useState('')
  const [reportsToId, setReportsToId] = useState('')
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const peopleViewFilters = useMemo(
    () => ({ status: filter, archived: showArchived ? '1' : '0' }),
    [filter, showArchived],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const listOpts = { includeDeleted: showArchived }
      const [filtered, all] = await Promise.all([
        listHrEmployees(filter, listOpts),
        listHrEmployees('all', listOpts),
      ])
      setRows(filtered)
      setDirectory(all)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load people'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, filter, showArchived])

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
    setLabourCard('')
    setRouting('')
    setStartDate('')
    setReportsToId('')
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
    setLabourCard(r.labour_card_no || '')
    setRouting(r.bank_routing_code || '')
    setStartDate(r.start_date || '')
    setReportsToId(r.reports_to_id || '')
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
      labour_card_no: labourCard,
      bank_routing_code: routing,
      start_date: startDate || null,
      reports_to_id: reportsToId || null,
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

  async function importPeopleCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      const objects = csvRowsToObjects(headers, csvRows).map((row) => {
        const normalized: Record<string, string> = {}
        for (const c of HR_PEOPLE_CSV_COLUMNS) {
          normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
        }
        return normalized
      })
      const { ok, errors } = parseListIoRows(objects, HR_PEOPLE_CSV_COLUMNS)
      if (!ok.length && errors.length) {
        showToast(errors[0] || 'No valid people rows', 'error')
        return
      }
      const byCode = new Map(
        directory
          .filter((p) => p.employee_code)
          .map((p) => [p.employee_code.toLowerCase(), p] as const),
      )
      let saved = 0
      let skipped = errors.length
      for (const row of ok) {
        const status = (STATUSES as readonly string[]).includes(row.employment_status)
          ? row.employment_status
          : 'active'
        const salary = row.basic_salary_aed ? Number(row.basic_salary_aed) : null
        const code = (row.employee_code || '').trim()
        const existing = code ? byCode.get(code.toLowerCase()) : undefined
        if (existing) {
          await updateHrEmployee(existing.id, {
            full_name: row.full_name,
            email: row.email || existing.email,
            job_title: row.job_title || existing.job_title,
            department: row.department || existing.department,
            employment_status: status,
            start_date: row.start_date || existing.start_date,
            basic_salary_aed: salary != null && Number.isFinite(salary) ? salary : existing.basic_salary_aed,
            reports_to_id: row.reports_to_id || existing.reports_to_id,
          })
        } else {
          await createHrEmployee({
            full_name: row.full_name,
            email: row.email || '',
            job_title: row.job_title || '',
            department: row.department || '',
            employee_code: code || undefined,
            employment_status: status,
            start_date: row.start_date || null,
            basic_salary_aed: salary != null && Number.isFinite(salary) ? salary : null,
            reports_to_id: row.reports_to_id || null,
          })
        }
        saved += 1
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} person(s)${skipNote}`, 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'People CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importPeopleCsv(file)
            }}
          />
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={importing}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!rows.length}
            onClick={() => {
              exportListCsv(
                'hr-people.csv',
                [
                  'employee_code',
                  'full_name',
                  'email',
                  'job_title',
                  'department',
                  'employment_status',
                  'start_date',
                  'basic_salary_aed',
                  'reports_to_id',
                ],
                rows.map((r) => ({
                  employee_code: r.employee_code,
                  full_name: r.full_name,
                  email: r.email,
                  job_title: r.job_title,
                  department: r.department,
                  employment_status: r.employment_status,
                  start_date: r.start_date || '',
                  basic_salary_aed: r.basic_salary_aed ?? '',
                  reports_to_id: r.reports_to_id || '',
                })),
              )
              showToast('People CSV downloaded', 'success')
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

      <SavedViewsBar
        moduleId="hr_people"
        filters={peopleViewFilters}
        ownerUserId={appUserId}
        canWrite
        applyDefaultOnLoad={false}
        onApply={(f) => {
          setFilter(String(f.status || 'active'))
          setShowArchived(String(f.archived || '0') === '1')
        }}
        onToast={showToast}
        filtersEqual={(a, b) =>
          String(a.status || 'active') === String(b.status || 'active') &&
          String(a.archived || '0') === String(b.archived || '0')
        }
      />

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
          <label style={labelStyle}>
            Labour / MoL number
            <input style={inputStyle} value={labourCard} onChange={(e) => setLabourCard(e.target.value)} />
          </label>
          <label style={labelStyle}>
            Bank routing (9 digits)
            <input style={inputStyle} value={routing} onChange={(e) => setRouting(e.target.value)} />
          </label>
          <label style={labelStyle}>
            Reports to
            <select
              style={selectStyle}
              value={reportsToId}
              onChange={(e) => setReportsToId(e.target.value)}
              aria-label="Reports to"
            >
              <option value="">—</option>
              {directory
                .filter((r) => r.id !== editing?.id)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.full_name}
                  </option>
                ))}
            </select>
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
            const archived = Boolean(r.deleted_at)
            return (
              <article key={r.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong>
                      {r.full_name}{' '}
                      <span style={{ color: colors.muted, fontWeight: 400, fontSize: 13 }}>{r.employee_code}</span>
                      {archived ? (
                        <span style={{ color: colors.muted, fontWeight: 400, fontSize: 13 }}> · archived</span>
                      ) : null}
                    </strong>
                    <div style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
                      {[r.job_title, r.department, r.email, r.employment_status].filter(Boolean).join(' · ')}
                      {r.reports_to_id
                        ? ` · reports to ${directory.find((m) => m.id === r.reports_to_id)?.full_name || '…'}`
                        : ''}
                    </div>
                    <div style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
                      Basic AED {Number(r.basic_salary_aed || 0).toFixed(2)} · Allowances AED{' '}
                      {Number(r.allowances_aed || 0).toFixed(2)}
                      {r.iban ? ` · ${r.iban}` : ' · no IBAN'}
                      {r.labour_card_no ? ` · MoL ${r.labour_card_no}` : ''}
                      {r.bank_routing_code ? ` · routing ${r.bank_routing_code}` : ''}
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
                    <button
                      type="button"
                      style={buttonSecondaryStyle}
                      onClick={() => {
                        if (
                          !window.confirm(
                            archived ? `Restore ${r.full_name}?` : `Archive ${r.full_name}?`,
                          )
                        ) {
                          return
                        }
                        void (archived ? restoreHrEmployee(r.id) : softDeleteHrEmployee(r.id))
                          .then(() => {
                            showToast(archived ? 'Person restored' : 'Person archived', 'success')
                            if (editing?.id === r.id) resetForm()
                            return load()
                          })
                          .catch((err) => showToast(errorMessage(err, 'Archive failed'), 'error'))
                      }}
                    >
                      {archived ? 'Restore' : 'Archive'}
                    </button>
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
