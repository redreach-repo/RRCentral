import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { CalendarDays } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import { listHrEmployees, type HrEmployee } from '../lib/featureSliceStores'
import { LEAVE_TYPES, leaveDaysInclusive, type LeaveType } from '../lib/hrLeave'
import {
  createHrLeaveRequest,
  decideHrLeave,
  listHrLeaveRequests,
  type HrLeaveRequest,
} from '../lib/hrLeaveStore'
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
