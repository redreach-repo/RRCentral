import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ClipboardList, Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import { BUILD_STAGES } from '../lib/delivery'
import { codeFromName, copyName, sortItems, templateHours } from '../lib/buildTemplates'
import {
  copyBuildTemplate,
  deleteBuildTemplate,
  deleteTemplateItem,
  listBuildTemplates,
  listTemplateItems,
  saveBuildTemplate,
  saveTemplateItem,
  type TemplateItemInput,
} from '../lib/buildTemplatesStore'
import { listPackages } from '../lib/deliveryStore'
import { can } from '../lib/permissions'
import { errorMessage } from '../lib/errors'
import { hoursLabel } from '../lib/timeTracking'
import type { BuildStageKey, BuildTemplate, BuildTemplateItem, BuildTemplateItemKind, DeliveryPackage, GoLiveOwner } from '../lib/types'
import { GO_LIVE_OWNERS, dueDaysProblem, ownerLabel } from '../lib/goLive'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  fieldStyle,
  formGridStyle,
  inputStyle,
  labelStyle,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
  sectionTitleStyle,
  selectStyle,
} from '../lib/uiStyles'

const smallBtn: CSSProperties = { ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }
const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  padding: '8px 0',
  borderTop: '1px solid rgba(255,255,255,0.06)',
  fontSize: 13,
}

type TemplateForm = { id?: string; copyOf?: BuildTemplate; name: string; description: string; package_id: string; active: boolean }
type ItemForm = {
  id?: string
  kind: BuildTemplateItemKind
  stage: BuildStageKey
  title: string
  detail: string
  hours: string
  owner: GoLiveOwner
  dueDays: string
}

export default function BuildTemplatesPage() {
  const { userRole } = useAuth()
  const { showToast } = useToast()
  const canEdit = can(userRole, 'delivery.packages')
  const [templates, setTemplates] = useState<BuildTemplate[]>([])
  const [packages, setPackages] = useState<DeliveryPackage[]>([])
  const [items, setItems] = useState<BuildTemplateItem[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [busy, setBusy] = useState(false)
  const [templateForm, setTemplateForm] = useState<TemplateForm | null>(null)
  const [itemForm, setItemForm] = useState<ItemForm | null>(null)

  const load = useCallback(async () => {
    try {
      // Templates first: in local mode reading them seeds the lines too.
      const [t, p] = await Promise.all([listBuildTemplates(), listPackages()])
      const i = await listTemplateItems()
      setTemplates(t)
      setPackages(p)
      setItems(i)
      setSelectedId((current) => (t.some((x) => x.id === current) ? current : t[0]?.id ?? ''))
    } catch (e) {
      showToast(errorMessage(e, 'Could not load build templates'), 'error')
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const selected = templates.find((t) => t.id === selectedId) ?? null
  const selectedItems = useMemo(() => sortItems(items.filter((i) => i.template_id === selectedId)), [items, selectedId])
  const tasks = selectedItems.filter((i) => i.kind === 'task')
  const configLines = selectedItems.filter((i) => i.kind === 'config')
  const goLiveLines = [...selectedItems.filter((i) => i.kind === 'golive')].sort(
    (a, b) => (a.due_days ?? 0) - (b.due_days ?? 0) || a.sort - b.sort,
  )
  const pkgOf = (t: BuildTemplate) => packages.find((p) => p.id === t.package_id) ?? null
  const hoursFor = (t: BuildTemplate) => templateHours(items.filter((i) => i.template_id === t.id))

  async function run(job: () => Promise<void>, failure: string) {
    setBusy(true)
    try {
      await job()
      await load()
    } catch (e) {
      showToast(errorMessage(e, failure), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function saveTemplate() {
    if (!templateForm) return
    const name = templateForm.name.trim()
    if (!name) {
      showToast('Give the template a name', 'error')
      return
    }
    const existing = templates.find((t) => t.id === templateForm.id)
    const input = {
      code: existing?.code ?? codeFromName(name, templates),
      name,
      description: templateForm.description.trim(),
      package_id: templateForm.package_id || null,
      active: templateForm.active,
    }
    await run(async () => {
      const id = templateForm.copyOf
        ? await copyBuildTemplate(templateForm.copyOf, input)
        : await saveBuildTemplate(input, templateForm.id)
      setSelectedId(id)
      setTemplateForm(null)
      showToast(`${name} saved`, 'success')
    }, 'Could not save the template')
  }

  async function saveItem() {
    if (!itemForm || !selected) return
    const title = itemForm.title.trim()
    const hours = itemForm.hours.trim() === '' ? 0 : Number(itemForm.hours)
    if (!title) {
      showToast('Add a title', 'error')
      return
    }
    if (!Number.isFinite(hours) || hours < 0) {
      showToast('Hours must be a number', 'error')
      return
    }
    const daysProblem = itemForm.kind === 'golive' ? dueDaysProblem(itemForm.dueDays) : null
    if (daysProblem) {
      showToast(daysProblem, 'error')
      return
    }
    const existing = selectedItems.find((i) => i.id === itemForm.id)
    const input: TemplateItemInput = {
      kind: itemForm.kind,
      stage: itemForm.kind === 'config' ? null : itemForm.stage,
      title,
      detail: itemForm.detail.trim(),
      est_hours: itemForm.kind === 'task' ? hours : 0,
      owner: itemForm.owner,
      due_days: itemForm.kind === 'golive' ? Number(itemForm.dueDays) : null,
      sort: existing?.sort ?? selectedItems.reduce((max, i) => Math.max(max, i.sort), 0) + 1,
    }
    await run(async () => {
      await saveTemplateItem(selected.id, input, itemForm.id)
      setItemForm(null)
    }, 'Could not save the line')
  }

  function openItem(kind: BuildTemplateItemKind, item?: BuildTemplateItem) {
    setItemForm({
      id: item?.id,
      kind,
      stage: item?.stage ?? 'build',
      title: item?.title ?? '',
      detail: item?.detail ?? '',
      hours: item && item.est_hours ? String(item.est_hours) : '',
      owner: item?.owner ?? 'red_reach',
      dueDays: item?.due_days != null ? String(item.due_days) : '',
    })
  }

  function itemRow(i: BuildTemplateItem) {
    return (
      <li key={i.id} style={rowStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{i.title}</div>
          {i.detail ? <div style={{ color: colors.muted, whiteSpace: 'pre-wrap' }}>{i.detail}</div> : null}
        </div>
        {i.kind === 'task' && i.est_hours > 0 ? (
          <span style={{ color: colors.muted2, fontSize: 12, whiteSpace: 'nowrap' }}>{hoursLabel(i.est_hours)}</span>
        ) : null}
        {i.kind === 'golive' ? (
          <span style={{ color: colors.muted2, fontSize: 12, whiteSpace: 'nowrap' }}>
            {ownerLabel(i.owner)}, day {i.due_days ?? 0}
          </span>
        ) : null}
        {canEdit ? (
          <span style={{ display: 'flex', gap: 6 }}>
            <button type="button" style={smallBtn} aria-label={`Edit ${i.title}`} onClick={() => openItem(i.kind, i)}>
              <Pencil size={12} />
            </button>
            <button
              type="button"
              style={{ ...smallBtn, color: colors.danger }}
              aria-label={`Delete ${i.title}`}
              disabled={busy}
              onClick={() =>
                window.confirm(`Delete "${i.title}" from the template?`) &&
                void run(() => deleteTemplateItem(i.id), 'Could not delete the line')
              }
            >
              <Trash2 size={12} />
            </button>
          </span>
        ) : null}
      </li>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <h1 style={pageTitleStyle}>Build templates</h1>
          <p style={pageSubtitleStyle}>
            A ready build checklist and starter configuration for each package. On a client, Start from template copies
            the checklist into their build and the starter configuration into their requirements. Changes here apply to
            the next client, not to builds already started.
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            style={buttonPrimaryStyle}
            onClick={() => setTemplateForm({ name: '', description: '', package_id: '', active: true })}
          >
            <Plus size={14} /> New template
          </button>
        ) : null}
      </div>

      {templates.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={22} />}
          title="No build templates yet"
          subtitle="Run supabase/migrations/20261106090000_build_templates.sql in Supabase to add the Starter, Growth and Done for you templates."
        />
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
          <section style={{ ...cardStyle, flex: '1 1 260px', minWidth: 0 }}>
            <h2 style={sectionTitleStyle}>Templates</h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {templates.map((t) => {
                const pkg = pkgOf(t)
                const hours = hoursFor(t)
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: t.id === selectedId ? 'rgba(232,93,4,0.15)' : 'transparent',
                        border: `1px solid ${t.id === selectedId ? colors.accent : 'transparent'}`,
                        borderRadius: 8,
                        padding: '8px 10px',
                        color: colors.text,
                        cursor: 'pointer',
                        marginBottom: 4,
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>
                        {t.name}
                        {!t.active ? <span style={{ color: colors.muted2, fontWeight: 400 }}> (not in use)</span> : null}
                      </div>
                      <div style={{ fontSize: 12, color: hoursOver(hours, pkg) ? colors.warn : colors.muted }}>
                        {pkg ? pkg.name : 'Any package'}, {hoursLabel(hours)}
                        {pkg?.build_hours_target ? ` of ${hoursLabel(pkg.build_hours_target)} target` : ''}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          {selected ? (
            <section style={{ ...cardStyle, flex: '3 1 420px', minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ ...sectionTitleStyle, margin: 0 }}>{selected.name}</h2>
                  {selected.description ? <p style={{ color: colors.muted, fontSize: 13, margin: '4px 0 0' }}>{selected.description}</p> : null}
                </div>
                {canEdit ? (
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      style={smallBtn}
                      onClick={() =>
                        setTemplateForm({
                          id: selected.id,
                          name: selected.name,
                          description: selected.description,
                          package_id: selected.package_id ?? '',
                          active: selected.active,
                        })
                      }
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    <button
                      type="button"
                      style={smallBtn}
                      onClick={() =>
                        setTemplateForm({
                          copyOf: selected,
                          name: copyName(selected.name, templates),
                          description: selected.description,
                          package_id: selected.package_id ?? '',
                          active: true,
                        })
                      }
                    >
                      <Copy size={12} /> Copy
                    </button>
                    <button
                      type="button"
                      style={{ ...smallBtn, color: colors.danger }}
                      disabled={busy}
                      onClick={() =>
                        window.confirm(`Delete ${selected.name}? Clients that used it keep their checklist.`) &&
                        void run(() => deleteBuildTemplate(selected.id), 'Could not delete the template')
                      }
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </span>
                ) : null}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                <h3 style={{ fontSize: 14, margin: 0 }}>
                  Build checklist, {tasks.length} steps, {hoursLabel(templateHours(tasks))}
                </h3>
                {canEdit ? (
                  <button type="button" style={smallBtn} onClick={() => openItem('task')}>
                    <Plus size={12} /> Step
                  </button>
                ) : null}
              </div>
              {tasks.length === 0 ? (
                <p style={{ color: colors.muted, fontSize: 13 }}>No steps yet.</p>
              ) : (
                BUILD_STAGES.map((s) => {
                  const inStage = tasks.filter((t) => t.stage === s.value)
                  if (!inStage.length) return null
                  return (
                    <div key={s.value} style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: colors.muted }}>{s.label}</div>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>{inStage.map(itemRow)}</ul>
                    </div>
                  )
                })
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
                <h3 style={{ fontSize: 14, margin: 0 }}>Starter configuration</h3>
                {canEdit ? (
                  <button type="button" style={smallBtn} onClick={() => openItem('config')}>
                    <Plus size={12} /> Line
                  </button>
                ) : null}
              </div>
              <p style={{ color: colors.muted2, fontSize: 12, margin: '4px 0 0' }}>
                Copied into the client's requirements, ready to agree at discovery.
              </p>
              {configLines.length === 0 ? (
                <p style={{ color: colors.muted, fontSize: 13 }}>No starter configuration yet.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>{configLines.map(itemRow)}</ul>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
                <h3 style={{ fontSize: 14, margin: 0 }}>Go live checklist, {goLiveLines.length} steps</h3>
                {canEdit ? (
                  <button type="button" style={smallBtn} onClick={() => openItem('golive')}>
                    <Plus size={12} /> Go live step
                  </button>
                ) : null}
              </div>
              <p style={{ color: colors.muted2, fontSize: 12, margin: '4px 0 0' }}>
                Who does what before go live, due a number of days after the client signs. The client sees it in their portal.
              </p>
              {goLiveLines.length === 0 ? (
                <p style={{ color: colors.muted, fontSize: 13 }}>No go live steps yet.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>{goLiveLines.map(itemRow)}</ul>
              )}
            </section>
          ) : null}
        </div>
      )}

      <Modal
        open={Boolean(templateForm)}
        title={templateForm?.copyOf ? 'Copy template' : templateForm?.id ? 'Edit template' : 'New template'}
        onClose={() => setTemplateForm(null)}
      >
        {templateForm ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={formGridStyle}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Name</label>
                <input
                  style={inputStyle}
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Package</label>
                <select
                  style={selectStyle}
                  value={templateForm.package_id}
                  onChange={(e) => setTemplateForm({ ...templateForm, package_id: e.target.value })}
                >
                  <option value="">Any package</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Description</label>
              <textarea
                style={{ ...inputStyle, minHeight: 70 }}
                value={templateForm.description}
                onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
              />
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={templateForm.active}
                onChange={(e) => setTemplateForm({ ...templateForm, active: e.target.checked })}
              />
              In use (offered on client pages)
            </label>
            {templateForm.copyOf ? (
              <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>
                Copies every step and starter configuration line from {templateForm.copyOf.name}.
              </p>
            ) : null}
            <button type="button" style={buttonPrimaryStyle} disabled={busy} onClick={() => void saveTemplate()}>
              Save
            </button>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(itemForm)}
        title={itemForm?.kind === 'config' ? 'Starter configuration line' : itemForm?.kind === 'golive' ? 'Go live step' : 'Build step'}
        onClose={() => setItemForm(null)}
      >
        {itemForm ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {itemForm.kind === 'task' ? (
              <div style={formGridStyle}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Stage</label>
                  <select
                    style={selectStyle}
                    value={itemForm.stage}
                    onChange={(e) => setItemForm({ ...itemForm, stage: e.target.value as BuildStageKey })}
                  >
                    {BUILD_STAGES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Estimated hours</label>
                  <input
                    style={inputStyle}
                    inputMode="decimal"
                    value={itemForm.hours}
                    onChange={(e) => setItemForm({ ...itemForm, hours: e.target.value })}
                  />
                </div>
              </div>
            ) : null}
            {itemForm.kind === 'golive' ? (
              <div style={formGridStyle}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Stage</label>
                  <select
                    style={selectStyle}
                    value={itemForm.stage}
                    onChange={(e) => setItemForm({ ...itemForm, stage: e.target.value as BuildStageKey })}
                  >
                    {BUILD_STAGES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Owner</label>
                  <select
                    style={selectStyle}
                    value={itemForm.owner}
                    onChange={(e) => setItemForm({ ...itemForm, owner: e.target.value as GoLiveOwner })}
                  >
                    {GO_LIVE_OWNERS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Due, days after signing</label>
                  <input
                    style={inputStyle}
                    inputMode="numeric"
                    value={itemForm.dueDays}
                    onChange={(e) => setItemForm({ ...itemForm, dueDays: e.target.value })}
                  />
                </div>
              </div>
            ) : null}
            <div style={fieldStyle}>
              <label style={labelStyle}>{itemForm.kind === 'config' ? 'What is set up' : 'Step'}</label>
              <input
                style={inputStyle}
                value={itemForm.title}
                onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Detail (optional)</label>
              <textarea
                style={{ ...inputStyle, minHeight: 70 }}
                value={itemForm.detail}
                onChange={(e) => setItemForm({ ...itemForm, detail: e.target.value })}
              />
            </div>
            <button type="button" style={buttonPrimaryStyle} disabled={busy} onClick={() => void saveItem()}>
              Save
            </button>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

function hoursOver(hours: number, pkg: DeliveryPackage | null): boolean {
  return Boolean(pkg?.build_hours_target) && hours > (pkg?.build_hours_target ?? 0)
}
