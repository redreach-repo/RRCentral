import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Clock } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import SavedViewsBar from '../components/SavedViewsBar'
import { errorMessage } from '../lib/errors'
import { listHrEmployees, type HrEmployee } from '../lib/featureSliceStores'
import {
  ATTENDANCE_STATUSES,
  attendanceLabel,
  defaultHoursForStatus,
  type AttendanceStatus,
} from '../lib/hrAttendance'
import { HR_ATTENDANCE_CSV_COLUMNS } from '../lib/hrAttendanceCsv'
import { listHrAttendanceDays, upsertHrAttendanceDay, type HrAttendanceDay } from '../lib/hrAttendanceStore'
import { csvRowsToObjects, exportListCsv, parseCsv, parseListIoRows } from '../lib/listIo'
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
  const { appUserId } = useAuth()
  const { showToast } = useToast()
  const [people, setPeople] = useState<HrEmployee[]>([])
  const [rows, setRows] = useState<HrAttendanceDay[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [status, setStatus] = useState<AttendanceStatus>('present')
  const [hours, setHours] = useState('8')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [filterPerson, setFilterPerson] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const attendanceViewFilters = useMemo(
    () => ({ person: filterPerson, from: fromDate, to: toDate }),
    [filterPerson, fromDate, toDate],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, r] = await Promise.all([
        listHrEmployees('active'),
        listHrAttendanceDays(fromDate || undefined),
      ])
      setPeople(p)
      setRows(r)
      if (!employeeId && p[0]) setEmployeeId(p[0].id)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load attendance'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, employeeId, fromDate])

  useEffect(() => {
    void load()
  }, [load])


  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (filterPerson !== 'all' && r.employee_id !== filterPerson) return false
      if (toDate && r.work_date > toDate) return false
      return true
    })
  }, [rows, filterPerson, toDate])

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

  async function importAttendanceCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      const objects = csvRowsToObjects(headers, csvRows).map((row) => {
        const normalized: Record<string, string> = {}
        for (const c of HR_ATTENDANCE_CSV_COLUMNS) {
          normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
        }
        return normalized
      })
      const { ok, errors } = parseListIoRows(objects, HR_ATTENDANCE_CSV_COLUMNS)
      if (!ok.length && errors.length) {
        showToast(errors[0] || 'No valid attendance rows', 'error')
        return
      }
      const byCode = new Map(
        people
          .filter((p) => p.employee_code)
          .map((p) => [p.employee_code.toLowerCase(), p] as const),
      )
      const statusSet = new Set<string>(ATTENDANCE_STATUSES)
      let saved = 0
      let skipped = errors.length
      for (const row of ok) {
        const person = byCode.get(row.employee_code.toLowerCase())
        if (!person || !/^\d{4}-\d{2}-\d{2}$/.test(row.work_date.slice(0, 10))) {
          skipped += 1
          continue
        }
        const dayStatus = statusSet.has(row.status) ? row.status : 'present'
        const dayHours = row.hours ? Number(row.hours) : defaultHoursForStatus(dayStatus)
        await upsertHrAttendanceDay({
          employeeId: person.id,
          workDate: row.work_date.slice(0, 10),
          status: dayStatus,
          hours: Number.isFinite(dayHours) ? dayHours : defaultHoursForStatus(dayStatus),
          notes: row.notes || '',
        })
        saved += 1
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} attendance day(s)${skipNote}`, 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Attendance CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importAttendanceCsv(file)
            }}
          />
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={importing || !people.length}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!filteredRows.length}
            onClick={() => {
              exportListCsv(
                'hr-attendance.csv',
                ['employee_code', 'work_date', 'status', 'hours', 'notes'],
                filteredRows.map((r) => ({
                  employee_code: r.hr_employees?.employee_code || '',
                  work_date: r.work_date,
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
        </div>
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

          <SavedViewsBar
            moduleId="hr_attendance"
            filters={attendanceViewFilters}
            ownerUserId={appUserId}
            canWrite
            applyDefaultOnLoad={false}
            onApply={(f) => {
              setFilterPerson(String(f.person || 'all'))
              setFromDate(String(f.from || ''))
              setToDate(String(f.to || ''))
            }}
            onToast={showToast}
            filtersEqual={(a, b) =>
              String(a.person || 'all') === String(b.person || 'all') &&
              String(a.from || '') === String(b.from || '') &&
              String(a.to || '') === String(b.to || '')
            }
          />

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Recent</h2>
            <div
              style={{
                display: 'grid',
                gap: 8,
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                marginBottom: 12,
              }}
            >
              <label style={labelStyle}>
                Person filter
                <select
                  style={selectStyle}
                  value={filterPerson}
                  onChange={(e) => setFilterPerson(e.target.value)}
                >
                  <option value="all">All people</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                From
                <input
                  style={inputStyle}
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </label>
              <label style={labelStyle}>
                To
                <input
                  style={inputStyle}
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </label>
            </div>
            {filteredRows.length === 0 ? (
              <EmptyState title="No attendance yet" subtitle="Log the first day above, or widen the filters." />
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                {filteredRows.map((r) => (
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
