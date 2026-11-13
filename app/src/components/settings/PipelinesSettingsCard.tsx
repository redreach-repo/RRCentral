import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Plus } from 'lucide-react'
import Modal from '../Modal'
import SimpleRowActions from '../SimpleRowActions'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import { can } from '../../lib/permissions'
import { parsePipelineStageForm } from '../../lib/schemas/pipelineStage'
import {
  DEFAULT_STAGE_COLORS,
  listPipelineStages,
  listPipelines,
  PIPELINE_OUTCOMES,
  savePipelineStage,
  setPipelineStageActive,
  slugifyStageKey,
  stageKeyStyleForPipeline,
  type Pipeline,
  type PipelineOutcome,
  type PipelineStage,
} from '../../lib/pipelines'
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

/** Settings → Pipelines: view/edit tenant pipeline stages. */
export default function PipelinesSettingsCard() {
  const { userRole } = useAuth()
  const { showToast } = useToast()
  const manage = can(userRole, 'settings.manage')
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [stagesByPipe, setStagesByPipe] = useState<Record<string, PipelineStage[]>>({})
  const [loading, setLoading] = useState(false)
  const [selectedKey, setSelectedKey] = useState('crm')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<PipelineStage | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionsId, setActionsId] = useState<string | null>(null)
  const [form, setForm] = useState<{
    label: string
    color: string
    outcome: PipelineOutcome
    sort_order: number
    active: boolean
  }>({
    label: '',
    color: DEFAULT_STAGE_COLORS[0],
    outcome: 'open',
    sort_order: 0,
    active: true,
  })

  const selected = pipelines.find((p) => p.pipeline_key === selectedKey) || pipelines[0] || null
  const stages = selected ? stagesByPipe[selected.id] || [] : []

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const pipes = await listPipelines({ includeInactive: true })
      setPipelines(pipes)
      const map: Record<string, PipelineStage[]> = {}
      for (const p of pipes) {
        map[p.id] = await listPipelineStages(p.id, { includeInactive: true })
      }
      setStagesByPipe(map)
      if (!pipes.some((p) => p.pipeline_key === selectedKey) && pipes[0]) {
        setSelectedKey(pipes[0].pipeline_key)
      }
    } catch {
      setPipelines([])
      setStagesByPipe({})
    } finally {
      setLoading(false)
    }
  }, [selectedKey])

  useEffect(() => {
    void load()
  }, [load])

  function openCreate() {
    if (!selected) return
    setEditing(null)
    setForm({
      label: '',
      color: DEFAULT_STAGE_COLORS[stages.length % DEFAULT_STAGE_COLORS.length],
      outcome: 'open',
      sort_order: (stages[stages.length - 1]?.sort_order || 0) + 10,
      active: true,
    })
    setOpen(true)
  }

  function openEdit(row: PipelineStage) {
    setEditing(row)
    setForm({
      label: row.label,
      color: row.color || DEFAULT_STAGE_COLORS[0],
      outcome: row.outcome,
      sort_order: row.sort_order,
      active: row.active,
    })
    setOpen(true)
  }

  async function save() {
    if (!selected) return
    const parsed = parsePipelineStageForm(form)
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    setBusy(true)
    try {
      const style = stageKeyStyleForPipeline(selected.pipeline_key)
      await savePipelineStage(
        {
          pipeline_id: selected.id,
          stage_key: editing?.stage_key || slugifyStageKey(parsed.data.label, style),
          label: parsed.data.label,
          color: parsed.data.color,
          outcome: parsed.data.outcome,
          sort_order: parsed.data.sort_order,
          active: parsed.data.active,
        },
        editing?.id,
      )
      showToast(editing ? 'Stage updated' : 'Stage added', 'success')
      setOpen(false)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save stage'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(row: PipelineStage) {
    setBusy(true)
    try {
      await setPipelineStageActive(row.id, !row.active)
      showToast(row.active ? 'Stage deactivated' : 'Stage activated', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not update stage'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div id="pipelines" style={{ ...cardStyle, marginBottom: 20, scrollMarginTop: 72 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Pipelines</h2>
        {manage && selected ? (
          <button type="button" style={buttonPrimaryStyle} onClick={openCreate}>
            <Plus size={16} style={{ marginRight: 6 }} />
            Add stage
          </button>
        ) : null}
      </div>
      <p style={{ margin: '8px 0 14px', fontSize: 13, color: colors.muted, lineHeight: 1.45 }}>
        Tenant-defined stages with colour and outcome. CRM company stages are free text, so new CRM
        stages show on the board immediately. Sales and CTRM still enforce their existing stage keys
        in the database until those CHECK constraints loosen.
      </p>
      {loading ? (
        <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>Loading…</p>
      ) : pipelines.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>
          No pipelines yet. Apply the M2 pipelines migration.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {pipelines.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedKey(p.pipeline_key)}
                style={{
                  ...buttonSecondaryStyle,
                  ...(selected?.id === p.id
                    ? { borderColor: colors.accent, color: colors.accent, fontWeight: 600 }
                    : {}),
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
          {selected ? (
            <p style={{ margin: '0 0 12px', fontSize: 12, color: colors.muted }}>{selected.description}</p>
          ) : null}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Order</th>
                  <th style={thStyle}>Label</th>
                  <th style={thStyle}>Key</th>
                  <th style={thStyle}>Colour</th>
                  <th style={thStyle}>Outcome</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {stages.map((row) => (
                  <tr key={row.id}>
                    <td style={tdStyle}>{row.sort_order}</td>
                    <td style={tdStyle}>{row.label}</td>
                    <td style={{ ...tdStyle, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                      {row.stage_key}
                    </td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: 3,
                            background: row.color,
                            border: `1px solid ${colors.border}`,
                          }}
                        />
                        {row.color}
                      </span>
                    </td>
                    <td style={tdStyle}>{row.outcome}</td>
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
        </>
      )}

      <Modal
        open={open}
        title={editing ? 'Edit stage' : 'Add stage'}
        onClose={() => setOpen(false)}
        width={440}
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Label</label>
            <input
              style={inputStyle}
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="Follow up"
            />
            {!editing && selected ? (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.muted }}>
                Key will be{' '}
                <code>
                  {slugifyStageKey(form.label, stageKeyStyleForPipeline(selected.pipeline_key)) ||
                    'Stage'}
                </code>
              </p>
            ) : editing ? (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.muted }}>
                Key <code>{editing.stage_key}</code> stays fixed
              </p>
            ) : null}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Colour</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="color"
                value={/^#[0-9A-Fa-f]{6}$/.test(form.color) ? form.color : '#64748B'}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                style={{ width: 40, height: 36, padding: 0, border: 'none', background: 'transparent' }}
              />
              <input
                style={inputStyle}
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              />
            </div>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Outcome</label>
            <select
              style={selectStyle}
              value={form.outcome}
              onChange={(e) =>
                setForm((f) => ({ ...f, outcome: e.target.value as PipelineOutcome }))
              }
            >
              {PIPELINE_OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Sort order</label>
            <input
              style={inputStyle}
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
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
            {busy ? 'Saving…' : 'Save stage'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
