import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
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
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
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
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

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

  async function importApprovalsCsv(file: File) {
    if (!manage) return
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const pendingById = new Map(pending.map((r) => [r.id, r]))
      let done = 0
      let skipped = 0
      for (const row of objects) {
        const id = String(row.id || row.run_id || '').trim()
        const decision = String(row.decision || row.action || row.status || '').trim().toLowerCase()
        const approve =
          decision === 'approve' || decision === 'approved' || decision === 'yes' || decision === '1'
        const reject =
          decision === 'reject' || decision === 'rejected' || decision === 'no' || decision === '0'
        const run = pendingById.get(id)
        if (!run || (!approve && !reject)) {
          skipped += 1
          continue
        }
        await resolveWorkflowApproval({
          runId: run.id,
          approve,
          userRole,
          actorEmail: user?.email || '',
        })
        done += 1
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Processed ${done} workflow approval(s)${skipNote}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Workflow runs CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <div id="workflow-runs" style={{ ...cardStyle, marginBottom: 20, scrollMarginTop: 72 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>{t('page.settings.section.workflowRuns')}</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importApprovalsCsv(file)
            }}
          />
          {manage ? (
            <button
              type="button"
              style={buttonSecondaryStyle}
              disabled={importing || !pending.length}
              onClick={() => importInputRef.current?.click()}
            >
              {importing ? 'Importing…' : 'Import CSV'}
            </button>
          ) : null}
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={!pending.length && !recent.length}
            onClick={() => {
              const rows = [...pending, ...recent]
              exportListCsv(
                'workflow-runs.csv',
                ['id', 'decision', 'status', 'definition', 'pipeline', 'stage', 'record_label', 'created_at', 'summary'],
                rows.map((run) => ({
                  id: run.id,
                  decision: '',
                  status: run.status,
                  definition: run.definition?.name || run.definition_id,
                  pipeline: String(run.context.pipeline_key || ''),
                  stage: String(run.context.stage_key || ''),
                  record_label: String(run.context.record_label || ''),
                  created_at: run.created_at || '',
                  summary: summarizeRun(run),
                })),
              )
              showToast('Workflow runs CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
          <button type="button" style={buttonSecondaryStyle} onClick={() => void load()} disabled={loading}>
            {loading ? t('page.settings.loading') : t('page.settings.refresh')}
          </button>
        </div>
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
