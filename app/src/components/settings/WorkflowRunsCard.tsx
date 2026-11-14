import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useI18n } from '../../contexts/I18nContext'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import { can } from '../../lib/permissions'
import {
  listPendingApprovals,
  listWorkflowRuns,
  resolveWorkflowApproval,
  summarizeRun,
  type WorkflowRun,
} from '../../lib/workflowRunner'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  sectionTitleStyle,
} from '../../lib/uiStyles'

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: `1px solid ${colors.border}`,
  fontWeight: 600,
  fontSize: 12,
  color: colors.muted,
}
const tdStyle: CSSProperties = {
  padding: '8px 10px',
  borderBottom: `1px solid ${colors.border}`,
  verticalAlign: 'middle',
  fontSize: 13,
}

/** Settings → pending workflow approvals and recent runs. */
export default function WorkflowRunsCard() {
  const { user, userRole } = useAuth()
  const { t } = useI18n()
  const { showToast } = useToast()
  const manage = can(userRole, 'settings.manage') || userRole === 'admin' || userRole === 'manager'
  const [pending, setPending] = useState<WorkflowRun[]>([])
  const [recent, setRecent] = useState<WorkflowRun[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, r] = await Promise.all([
        listPendingApprovals(),
        listWorkflowRuns({ limit: 20 }),
      ])
      setPending(p)
      setRecent(r.filter((x) => x.status !== 'awaiting_approval'))
    } catch {
      setPending([])
      setRecent([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function resolve(run: WorkflowRun, approve: boolean) {
    setBusyId(run.id)
    try {
      await resolveWorkflowApproval({
        runId: run.id,
        approve,
        userRole,
        actorEmail: user?.email || '',
      })
      showToast(approve ? 'Approved' : 'Rejected', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not resolve approval'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div id="workflow-runs" style={{ ...cardStyle, marginBottom: 20, scrollMarginTop: 72 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>{t('page.settings.section.workflowRuns')}</h2>
        <button type="button" style={buttonSecondaryStyle} onClick={() => void load()} disabled={loading}>
          {loading ? t('page.settings.loading') : t('page.settings.refresh')}
        </button>
      </div>
      <p style={{ margin: '8px 0 14px', fontSize: 13, color: colors.muted, lineHeight: 1.45 }}>
        Approvals pause a chain until an admin (or configured role) confirms. Notify steps write to
        activity log.
      </p>

      <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Pending approvals</h3>
      {pending.length === 0 ? (
        <p style={{ margin: '0 0 16px', fontSize: 13, color: colors.muted }}>None waiting.</p>
      ) : (
        <div style={{ overflowX: 'auto', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Run</th>
                <th style={thStyle}>Stage</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((run) => (
                <tr key={run.id}>
                  <td style={tdStyle}>{summarizeRun(run)}</td>
                  <td style={tdStyle}>
                    {String(run.context.pipeline_key || '—')} / {String(run.context.stage_key || '—')}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    {manage ? (
                      <>
                        <button
                          type="button"
                          style={{ ...buttonPrimaryStyle, marginRight: 8 }}
                          disabled={busyId === run.id}
                          onClick={() => void resolve(run, true)}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          style={buttonSecondaryStyle}
                          disabled={busyId === run.id}
                          onClick={() => void resolve(run, false)}
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <span style={{ color: colors.muted }}>Needs approver</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Recent</h3>
      {recent.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>No runs yet.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
          {recent.map((run) => (
            <li key={run.id}>
              {summarizeRun(run)}
              <span style={{ color: colors.muted }}>
                {' '}
                · {run.created_at ? new Date(run.created_at).toLocaleString() : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
