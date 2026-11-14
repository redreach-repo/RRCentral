import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Plus } from 'lucide-react'
import Modal from '../Modal'
import SimpleRowActions from '../SimpleRowActions'
import { useAuth } from '../../contexts/AuthContext'
import { useI18n } from '../../contexts/I18nContext'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import { can } from '../../lib/permissions'
import { parseWorkflowDefinitionForm } from '../../lib/schemas/workflowDefinition'
import {
  buildApprovalStep,
  buildNotifyStep,
  describeWorkflowTrigger,
  listWorkflowDefinitions,
  saveWorkflowDefinition,
  setWorkflowDefinitionActive,
  slugifyWorkflowKey,
  WORKFLOW_TRIGGERS,
  type WorkflowDefinition,
  type WorkflowTriggerType,
} from '../../lib/workflows'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  fieldStyle,
  inputStyle,
  labelStyle,
  sectionTitleStyle,
  selectStyle,
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
}

/** Settings → Workflows: approval chains and other automation definitions. */
export default function WorkflowsSettingsCard() {
  const { userRole } = useAuth()
  const { t } = useI18n()
  const { showToast } = useToast()
  const manage = can(userRole, 'settings.manage')
  const [rows, setRows] = useState<WorkflowDefinition[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<WorkflowDefinition | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionsId, setActionsId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    trigger_type: 'stage_enter' as WorkflowTriggerType,
    pipeline_key: 'crm',
    stage_key: 'Won',
    approver_role: 'admin',
    notify_message: 'Approved',
    active: true,
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listWorkflowDefinitions({ includeInactive: true }))
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function openCreate() {
    setEditing(null)
    setForm({
      name: '',
      description: '',
      trigger_type: 'stage_enter',
      pipeline_key: 'crm',
      stage_key: 'Won',
      approver_role: 'admin',
      notify_message: 'Approved',
      active: true,
    })
    setOpen(true)
  }

  function openEdit(row: WorkflowDefinition) {
    setEditing(row)
    setForm({
      name: row.name,
      description: row.description || '',
      trigger_type: row.trigger_type,
      pipeline_key: String(row.trigger_config?.pipeline_key || 'crm'),
      stage_key: String(row.trigger_config?.stage_key || 'Won'),
      approver_role: String(
        row.steps.find((s) => s.type === 'approval')?.config?.approver_role || 'admin',
      ),
      notify_message: String(
        row.steps.find((s) => s.type === 'notify')?.config?.message || 'Approved',
      ),
      active: row.active,
    })
    setOpen(true)
  }

  async function save() {
    const parsed = parseWorkflowDefinitionForm(form)
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    setBusy(true)
    try {
      const trigger_config =
        parsed.data.trigger_type === 'stage_enter'
          ? { pipeline_key: parsed.data.pipeline_key, stage_key: parsed.data.stage_key }
          : {}
      const steps = [
        buildApprovalStep({ name: 'Approval', approverRole: parsed.data.approver_role }),
        buildNotifyStep({ name: 'Notify', message: parsed.data.notify_message }),
      ]
      await saveWorkflowDefinition(
        {
          workflow_key: editing?.workflow_key || slugifyWorkflowKey(parsed.data.name),
          name: parsed.data.name,
          description: parsed.data.description,
          trigger_type: parsed.data.trigger_type,
          trigger_config,
          steps,
          active: parsed.data.active,
        },
        editing?.id,
      )
      showToast(editing ? 'Workflow updated' : 'Approval chain added', 'success')
      setOpen(false)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save workflow'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(row: WorkflowDefinition) {
    setBusy(true)
    try {
      await setWorkflowDefinitionActive(row.id, !row.active)
      showToast(row.active ? 'Workflow deactivated' : 'Workflow activated', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not update workflow'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div id="workflows" style={{ ...cardStyle, marginBottom: 20, scrollMarginTop: 72 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>{t('page.settings.section.workflows')}</h2>
        {manage ? (
          <button type="button" style={buttonPrimaryStyle} onClick={openCreate}>
            <Plus size={16} style={{ marginRight: 6 }} />
            Add approval chain
          </button>
        ) : null}
      </div>
      <p style={{ margin: '8px 0 14px', fontSize: 13, color: colors.muted, lineHeight: 1.45 }}>
        Define triggers and steps (approval → notify). Runs are recorded later; this slice stores the
        chains as tenant data so admins can add them without a code change.
      </p>
      {loading ? (
        <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>
          No workflows yet. Add an approval chain for a pipeline stage.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Trigger</th>
                <th style={thStyle}>Steps</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td style={tdStyle}>
                    <div>{row.name}</div>
                    {row.description ? (
                      <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                        {row.description}
                      </div>
                    ) : null}
                  </td>
                  <td style={tdStyle}>{describeWorkflowTrigger(row)}</td>
                  <td style={tdStyle}>
                    {row.steps.map((s) => s.name || s.type).join(' → ') || '—'}
                  </td>
                  <td style={tdStyle}>{row.active ? 'Active' : 'Off'}</td>
                  <td style={tdStyle}>
                    {manage ? (
                      <SimpleRowActions
                        expanded={actionsId === row.id}
                        onToggle={() => setActionsId((id) => (id === row.id ? null : row.id))}
                        onEdit={() => openEdit(row)}
                        onDelete={() => void toggleActive(row)}
                        deleteLabel={row.active ? 'Deactivate' : 'Activate'}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={open}
        title={editing ? 'Edit workflow' : 'Add approval chain'}
        onClose={() => setOpen(false)}
        width={480}
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Name</label>
            <input
              style={inputStyle}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="CRM won approval"
            />
            {!editing ? (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.muted }}>
                Key will be <code>{slugifyWorkflowKey(form.name) || 'workflow'}</code>
              </p>
            ) : (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.muted }}>
                Key <code>{editing.workflow_key}</code> stays fixed
              </p>
            )}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Description</label>
            <textarea
              style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Trigger</label>
            <select
              style={selectStyle}
              value={form.trigger_type}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  trigger_type: e.target.value as WorkflowTriggerType,
                }))
              }
            >
              {WORKFLOW_TRIGGERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {form.trigger_type === 'stage_enter' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Pipeline key</label>
                <input
                  style={inputStyle}
                  value={form.pipeline_key}
                  onChange={(e) => setForm((f) => ({ ...f, pipeline_key: e.target.value }))}
                  placeholder="crm"
                />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Stage key</label>
                <input
                  style={inputStyle}
                  value={form.stage_key}
                  onChange={(e) => setForm((f) => ({ ...f, stage_key: e.target.value }))}
                  placeholder="Won"
                />
              </div>
            </div>
          ) : null}
          <div style={fieldStyle}>
            <label style={labelStyle}>Approver role</label>
            <input
              style={inputStyle}
              value={form.approver_role}
              onChange={(e) => setForm((f) => ({ ...f, approver_role: e.target.value }))}
              placeholder="admin"
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Notify message</label>
            <input
              style={inputStyle}
              value={form.notify_message}
              onChange={(e) => setForm((f) => ({ ...f, notify_message: e.target.value }))}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            />
            Active
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button" style={buttonPrimaryStyle} disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save workflow'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
