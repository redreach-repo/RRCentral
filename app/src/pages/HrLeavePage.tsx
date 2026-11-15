import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { CalendarDays } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import SavedViewsBar from '../components/SavedViewsBar'
import { errorMessage } from '../lib/errors'
import { listHrEmployees, type HrEmployee } from '../lib/featureSliceStores'
import { LEAVE_TYPES, leaveDaysInclusive, type LeaveType } from '../lib/hrLeave'
import { HR_LEAVE_CSV_COLUMNS } from '../lib/hrLeaveCsv'
import {
  createHrLeaveRequest,
  decideHrLeave,
  listHrLeaveRequests,
  type HrLeaveRequest,
} from '../lib/hrLeaveStore'
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

/** M6: leave requests (manager+). */
export default function HrLeavePage() {
  const { appUserId } = useAuth()
  const { showToast } = useToast()
  const [people, setPeople] = useState<HrEmployee[]>([])
  const [rows, setRows] = useState<HrLeaveRequest[]>([])
  const [filter, setFilter] = useState('pending')
  const [employeeId, setEmployeeId] = useState('')
  const [leaveType, setLeaveType] = useState<LeaveType>('annual')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const leaveViewFilters = useMemo(() => ({ status: filter }), [filter])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, r] = await Promise.all([listHrEmployees('active'), listHrLeaveRequests(filter)])
      setPeople(p)
      setRows(r)
      if (!employeeId && p[0]) setEmployeeId(p[0].id)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load leave'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, filter, employeeId])

  useEffect(() => {
    void load()
  }, [load])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    try {
      await createHrLeaveRequest({ employeeId, leaveType, startsOn, endsOn, reason })
      showToast('Leave request submitted', 'success')
      setReason('')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not create leave'), 'error')
    }
  }

  async function onDecide(id: string, decision: 'approve' | 'reject' | 'cancel') {
    try {
      await decideHrLeave(id, decision)
      showToast(`Leave ${decision}d`, 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not update leave'), 'error')
    }
  }

  async function importLeaveCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      const objects = csvRowsToObjects(headers, csvRows).map((row) => {
        const normalized: Record<string, string> = {}
        for (const c of HR_LEAVE_CSV_COLUMNS) {
          normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
        }
        return normalized
      })
      const { ok, errors } = parseListIoRows(objects, HR_LEAVE_CSV_COLUMNS)
      if (!ok.length && errors.length) {
        showToast(errors[0] || 'No valid leave rows', 'error')
        return
      }
      const byCode = new Map(
        people
          .filter((p) => p.employee_code)
          .map((p) => [p.employee_code.toLowerCase(), p] as const),
      )
      let saved = 0
      let skipped = errors.length
      for (const row of ok) {
        const emp = byCode.get(row.employee_code.toLowerCase())
        if (!emp) {
          skipped += 1
          continue
        }
        const lt = (LEAVE_TYPES as readonly string[]).includes(row.leave_type)
          ? (row.leave_type as LeaveType)
          : 'annual'
        await createHrLeaveRequest({
          employeeId: emp.id,
          leaveType: lt,
          startsOn: row.starts_on,
          endsOn: row.ends_on,
          reason: row.reason || '',
        })
        saved += 1
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} leave request(s)${skipNote}`, 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Leave CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const daysPreview = startsOn && endsOn ? leaveDaysInclusive(startsOn, endsOn) : 0

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>HR · M6</p>
          <h1 className={docsStyles.title}>
            <CalendarDays size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Leave
          </h1>
          <p className={docsStyles.subtitle}>Request and approve annual, sick, unpaid or other leave.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importLeaveCsv(f)
            }}
          />
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={importing || people.length === 0}
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
                'hr-leave.csv',
                ['employee_code', 'employee', 'leave_type', 'starts_on', 'ends_on', 'days', 'status', 'reason'],
                rows.map((r) => ({
                  employee_code: r.hr_employees?.employee_code || '',
                  employee: r.hr_employees?.full_name || r.employee_id,
                  leave_type: r.leave_type,
                  starts_on: r.starts_on,
                  ends_on: r.ends_on,
                  days: r.days,
                  status: r.status,
                  reason: r.reason,
                })),
              )
              showToast('Leave CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
        </div>
      </header>

      {loading ? (
        <p>Loading…</p>
      ) : people.length === 0 ? (
        <EmptyState title="No active people" subtitle="Add employees on People first, or apply the HR migrations." />
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <form style={cardStyle} onSubmit={(e) => void onCreate(e)}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>New request</h2>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
              <label style={labelStyle}>
                Employee
                <select style={selectStyle} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                Type
                <select
                  style={selectStyle}
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                >
                  {LEAVE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                Starts
                <input
                  style={inputStyle}
                  type="date"
                  value={startsOn}
                  onChange={(e) => setStartsOn(e.target.value)}
                  required
                />
              </label>
              <label style={labelStyle}>
                Ends
                <input
                  style={inputStyle}
                  type="date"
                  value={endsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                  required
                />
              </label>
            </div>
            <label style={{ ...labelStyle, marginTop: 10 }}>
              Reason
              <input style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <p style={{ color: colors.muted, fontSize: 13 }}>
              {daysPreview > 0 ? `${daysPreview} calendar day(s)` : 'Pick dates'}
            </p>
            <button type="submit" style={buttonPrimaryStyle}>
              Submit
            </button>
          </form>

          <SavedViewsBar
            moduleId="hr_leave"
            filters={leaveViewFilters}
            ownerUserId={appUserId}
            canWrite
            applyDefaultOnLoad={false}
            onApply={(f) => setFilter(String(f.status || 'pending'))}
            onToast={showToast}
            filtersEqual={(a, b) => String(a.status || 'pending') === String(b.status || 'pending')}
          />

          <section style={cardStyle}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 16, flex: 1 }}>Requests</h2>
              <select style={selectStyle} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter">
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="all">All</option>
              </select>
            </div>
            {rows.length === 0 ? (
              <p style={{ color: colors.muted }}>No leave requests.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                {rows.map((r) => (
                  <li key={r.id} style={{ borderTop: `1px solid ${colors.border || '#e5e5e5'}`, paddingTop: 10 }}>
                    <strong>{r.hr_employees?.full_name || r.employee_id}</strong> · {r.leave_type} · {r.starts_on}→
                    {r.ends_on} ({r.days}d) · {r.status}
                    {r.reason ? <div style={{ color: colors.muted, fontSize: 13 }}>{r.reason}</div> : null}
                    {r.status === 'pending' ? (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button type="button" style={buttonPrimaryStyle} onClick={() => void onDecide(r.id, 'approve')}>
                          Approve
                        </button>
                        <button
                          type="button"
                          style={buttonSecondaryStyle}
                          onClick={() => void onDecide(r.id, 'reject')}
                        >
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
