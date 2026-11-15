import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Clock } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import { listHrEmployees, type HrEmployee } from '../lib/featureSliceStores'
import {
  ATTENDANCE_STATUSES,
  attendanceLabel,
  defaultHoursForStatus,
  type AttendanceStatus,
} from '../lib/hrAttendance'
import { listHrAttendanceDays, upsertHrAttendanceDay, type HrAttendanceDay } from '../lib/hrAttendanceStore'
import { exportListCsv } from '../lib/listIo'
import {
  buttonPrimaryStyle,
  cardStyle,
  colors,
  inputStyle,
  labelStyle,
  selectStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M12b: attendance day stub (not WPS / labour certified). */
export default function HrAttendancePage() {
  const { showToast } = useToast()
  const [people, setPeople] = useState<HrEmployee[]>([])
  const [rows, setRows] = useState<HrAttendanceDay[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [status, setStatus] = useState<AttendanceStatus>('present')
  const [hours, setHours] = useState('8')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, r] = await Promise.all([listHrEmployees('active'), listHrAttendanceDays()])
      setPeople(p)
      setRows(r)
      if (!employeeId && p[0]) setEmployeeId(p[0].id)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load attendance'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, employeeId])

  useEffect(() => {
    void load()
  }, [load])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      await upsertHrAttendanceDay({
        employeeId,
        workDate,
        status,
        hours: Number(hours),
        notes,
      })
      showToast('Attendance saved', 'success')
      setNotes('')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not save attendance'), 'error')
    }
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>HR · M12b</p>
          <h1 className={docsStyles.title}>
            <Clock size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Attendance
          </h1>
          <p className={docsStyles.subtitle}>
            Day-level present/absent stub. Not labour-law or WPS attendance.
          </p>
        </div>
        <button
          type="button"
          className={docsStyles.newBtn}
          style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
          disabled={!rows.length}
          onClick={() => {
            exportListCsv(
              'hr-attendance.csv',
              ['work_date', 'employee', 'status', 'hours', 'notes'],
              rows.map((r) => ({
                work_date: r.work_date,
                employee: r.hr_employees?.full_name || r.employee_id,
                status: r.status,
                hours: r.hours,
                notes: r.notes,
              })),
            )
            showToast('Attendance CSV downloaded', 'success')
          }}
        >
          Export CSV
        </button>
      </header>

      {loading ? (
        <p>Loading…</p>
      ) : people.length === 0 ? (
        <EmptyState title="No active people" subtitle="Add employees on People first." />
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <form style={cardStyle} onSubmit={(e) => void onSubmit(e)}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Log day</h2>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
              <label style={labelStyle}>
                Person
                <select style={selectStyle} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                Date
                <input style={inputStyle} type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} required />
              </label>
              <label style={labelStyle}>
                Status
                <select
                  style={selectStyle}
                  value={status}
                  onChange={(e) => {
                    const next = e.target.value as AttendanceStatus
                    setStatus(next)
                    setHours(String(defaultHoursForStatus(next)))
                  }}
                >
                  {ATTENDANCE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                Hours
                <input
                  style={inputStyle}
                  type="number"
                  min={0}
                  max={24}
                  step="0.5"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                />
              </label>
            </div>
            <label style={{ ...labelStyle, marginTop: 8 }}>
              Notes
              <input style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <button type="submit" style={{ ...buttonPrimaryStyle, marginTop: 10 }}>
              Save day
            </button>
          </form>

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Recent</h2>
            {rows.length === 0 ? (
              <EmptyState title="No attendance yet" subtitle="Log the first day above." />
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                {rows.map((r) => (
                  <li key={r.id} style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 8, fontSize: 13 }}>
                    <strong>{r.hr_employees?.full_name || r.employee_id}</strong> · {r.work_date} ·{' '}
                    {attendanceLabel(r.status, r.hours)}
                    {r.notes ? <div style={{ color: colors.muted }}>{r.notes}</div> : null}
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
