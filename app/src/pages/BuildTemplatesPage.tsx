import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ClipboardList, Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
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
import { GO_LIVE_OWNERS, ownerLabel } from '../lib/goLive'
import { parseBuildTemplateForm, parseBuildTemplateItemForm } from '../lib/schemas/buildTemplate'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  fieldStyle,
  formGridStyle,
  inputStyle,
  labelStyle,
  sectionTitleStyle,
  selectStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

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
  const { t } = useI18n()
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
      const [tpls, pkgs] = await Promise.all([listBuildTemplates(), listPackages()])
      const itemRows = await listTemplateItems()
      setTemplates(tpls)
      setPackages(pkgs)
      setItems(itemRows)
      setSelectedId((current) => (tpls.some((x) => x.id === current) ? current : tpls[0]?.id ?? ''))
    } catch (e) {
      showToast(errorMessage(e, 'Could not load build templates'), 'error')
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const selected = templates.find((row) => row.id === selectedId) ?? null
  const selectedItems = useMemo(() => sortItems(items.filter((i) => i.template_id === selectedId)), [items, selectedId])
  const tasks = selectedItems.filter((i) => i.kind === 'task')
  const configLines = selectedItems.filter((i) => i.kind === 'config')
  const goLiveLines = [...selectedItems.filter((i) => i.kind === 'golive')].sort(
    (a, b) => (a.due_days ?? 0) - (b.due_days ?? 0) || a.sort - b.sort,
  )
  const pkgOf = (row: BuildTemplate) => packages.find((p) => p.id === row.package_id) ?? null
  const hoursFor = (row: BuildTemplate) => templateHours(items.filter((i) => i.template_id === row.id))

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
    const parsed = parseBuildTemplateForm(templateForm)
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    const existing = templates.find((row) => row.id === templateForm.id)
    const input = {
      code: existing?.code ?? codeFromName(parsed.data.name, templates),
      name: parsed.data.name,
      description: parsed.data.description,
      package_id: parsed.data.package_id,
      active: parsed.data.active,
    }
    await run(async () => {
      const id = templateForm.copyOf
        ? await copyBuildTemplate(templateForm.copyOf, input)
        : await saveBuildTemplate(input, templateForm.id)
      setSelectedId(id)
      setTemplateForm(null)
      showToast(`${parsed.data.name} saved`, 'success')
    }, 'Could not save the template')
  }

  async function saveItem() {
    if (!itemForm || !selected) return
    const parsed = parseBuildTemplateItemForm(itemForm)
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    const existing = selectedItems.find((i) => i.id === itemForm.id)
    const input: TemplateItemInput = {
      kind: parsed.data.kind,
      stage: parsed.data.stage,
      title: parsed.data.title,
      detail: parsed.data.detail,
      est_hours: parsed.data.est_hours,
      owner: parsed.data.owner,
      due_days: parsed.data.due_days,
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
            {t('page.buildTemplates.ownerDay')
              .replace('{owner}', ownerLabel(i.owner))
              .replace('{day}', String(i.due_days ?? 0))}
          </span>
        ) : null}
        {canEdit ? (
          <span style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              style={smallBtn}
              aria-label={t('page.buildTemplates.editItem').replace('{title}', i.title)}
              onClick={() => openItem(i.kind, i)}
            >
              <Pencil size={12} /> {t('page.buildTemplates.edit')}
            </button>
            <button
              type="button"
              style={{ ...smallBtn, color: colors.danger }}
              aria-label={t('page.buildTemplates.deleteItem').replace('{title}', i.title)}
              disabled={busy}
              onClick={() =>
                window.confirm(t('page.buildTemplates.deleteItemConfirm').replace('{title}', i.title)) &&
                void run(() => deleteTemplateItem(i.id), 'Could not delete the line')
              }
            >
              <Trash2 size={12} /> {t('page.buildTemplates.remove')}
            </button>
          </span>
        ) : null}
      </li>
    )
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>{t('page.delivery.kicker')}</p>
          <h1 className={docsStyles.title}>{t('page.buildTemplates.title')}</h1>
          <p className={docsStyles.subtitle}>{t('page.buildTemplates.subtitle')}</p>
        </div>
        {canEdit ? (
          <button
            type="button"
            className={docsStyles.newBtn}
            onClick={() => setTemplateForm({ name: '', description: '', package_id: '', active: true })}
          >
            <Plus size={14} /> {t('page.buildTemplates.new')}
          </button>
        ) : null}
      </header>

      {templates.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={22} />}
          title={t('page.buildTemplates.emptyTitle')}
          subtitle={t('page.buildTemplates.emptySubtitle')}
        />
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
          <section style={{ ...cardStyle, flex: '1 1 260px', minWidth: 0 }}>
            <h2 style={sectionTitleStyle}>{t('page.buildTemplates.list')}</h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {templates.map((row) => {
                const pkg = pkgOf(row)
                const hours = hoursFor(row)
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: row.id === selectedId ? 'rgba(232,93,4,0.15)' : 'transparent',
                        border: `1px solid ${row.id === selectedId ? colors.accent : 'transparent'}`,
                        borderRadius: 8,
                        padding: '8px 10px',
                        color: colors.text,
                        cursor: 'pointer',
                        marginBottom: 4,
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>
                        {row.name}
                        {!row.active ? (
                          <span style={{ color: colors.muted2, fontWeight: 400 }}>{t('page.buildTemplates.notInUse')}</span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 12, color: hoursOver(hours, pkg) ? colors.warn : colors.muted }}>
                        {pkg ? pkg.name : t('page.buildTemplates.anyPackage')}, {hoursLabel(hours)}
                        {pkg?.build_hours_target
                          ? t('page.buildTemplates.ofTarget').replace('{hours}', hoursLabel(pkg.build_hours_target))
                          : ''}
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
                      <Pencil size={12} /> {t('page.buildTemplates.edit')}
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
                      <Copy size={12} /> {t('page.buildTemplates.copy')}
                    </button>
                    <button
                      type="button"
                      style={{ ...smallBtn, color: colors.danger }}
                      disabled={busy}
                      onClick={() =>
                        window.confirm(
                          t('page.buildTemplates.deleteConfirm').replace('{name}', selected.name),
                        ) &&
                        void run(() => deleteBuildTemplate(selected.id), 'Could not delete the template')
                      }
                    >
                      <Trash2 size={12} /> {t('page.buildTemplates.delete')}
                    </button>
                  </span>
                ) : null}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                <h3 style={{ fontSize: 14, margin: 0 }}>
                  {t('page.buildTemplates.checklistHeading')
                    .replace('{n}', String(tasks.length))
                    .replace('{hours}', hoursLabel(templateHours(tasks)))}
                </h3>
                {canEdit ? (
                  <button type="button" style={smallBtn} onClick={() => openItem('task')}>
                    <Plus size={12} /> {t('page.buildTemplates.addStep')}
                  </button>
                ) : null}
              </div>
              {tasks.length === 0 ? (
                <p style={{ color: colors.muted, fontSize: 13 }}>{t('page.buildTemplates.noSteps')}</p>
              ) : (
                BUILD_STAGES.map((s) => {
                  const inStage = tasks.filter((task) => task.stage === s.value)
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
                <h3 style={{ fontSize: 14, margin: 0 }}>{t('page.buildTemplates.starterConfig')}</h3>
                {canEdit ? (
                  <button type="button" style={smallBtn} onClick={() => openItem('config')}>
                    <Plus size={12} /> {t('page.buildTemplates.addLine')}
                  </button>
                ) : null}
              </div>
              <p style={{ color: colors.muted2, fontSize: 12, margin: '4px 0 0' }}>
                {t('page.buildTemplates.starterConfigHint')}
              </p>
              {configLines.length === 0 ? (
                <p style={{ color: colors.muted, fontSize: 13 }}>{t('page.buildTemplates.noStarterConfig')}</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>{configLines.map(itemRow)}</ul>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
                <h3 style={{ fontSize: 14, margin: 0 }}>
                  {t('page.buildTemplates.goLiveHeading').replace('{n}', String(goLiveLines.length))}
                </h3>
                {canEdit ? (
                  <button type="button" style={smallBtn} onClick={() => openItem('golive')}>
                    <Plus size={12} /> {t('page.buildTemplates.addGoLive')}
                  </button>
                ) : null}
              </div>
              <p style={{ color: colors.muted2, fontSize: 12, margin: '4px 0 0' }}>
                {t('page.buildTemplates.goLiveHint')}
              </p>
              {goLiveLines.length === 0 ? (
                <p style={{ color: colors.muted, fontSize: 13 }}>{t('page.buildTemplates.noGoLive')}</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>{goLiveLines.map(itemRow)}</ul>
              )}
            </section>
          ) : null}
        </div>
      )}

      <Modal
        open={Boolean(templateForm)}
        title={
          templateForm?.copyOf
            ? t('page.buildTemplates.copyModal')
            : templateForm?.id
              ? t('page.buildTemplates.editModal')
              : t('page.buildTemplates.newModal')
        }
        onClose={() => setTemplateForm(null)}
      >
        {templateForm ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={formGridStyle}>
              <div style={fieldStyle}>
                <label style={labelStyle}>{t('page.buildTemplates.name')}</label>
                <input
                  style={inputStyle}
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>{t('page.buildTemplates.package')}</label>
                <select
                  style={selectStyle}
                  value={templateForm.package_id}
                  onChange={(e) => setTemplateForm({ ...templateForm, package_id: e.target.value })}
                >
                  <option value="">{t('page.buildTemplates.anyPackage')}</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>{t('page.buildTemplates.description')}</label>
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
              {t('page.buildTemplates.inUse')}
            </label>
            {templateForm.copyOf ? (
              <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>
                {t('page.buildTemplates.copiesFrom').replace('{name}', templateForm.copyOf.name)}
              </p>
            ) : null}
            <button type="button" style={buttonPrimaryStyle} disabled={busy} onClick={() => void saveTemplate()}>
              {t('page.buildTemplates.save')}
            </button>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(itemForm)}
        title={
          itemForm?.kind === 'config'
            ? t('page.buildTemplates.modalConfig')
            : itemForm?.kind === 'golive'
              ? t('page.buildTemplates.modalGoLive')
              : t('page.buildTemplates.modalBuild')
        }
        onClose={() => setItemForm(null)}
      >
        {itemForm ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {itemForm.kind === 'task' ? (
              <div style={formGridStyle}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>{t('page.buildTemplates.stage')}</label>
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
                  <label style={labelStyle}>{t('page.buildTemplates.estimatedHours')}</label>
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
                  <label style={labelStyle}>{t('page.buildTemplates.stage')}</label>
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
                  <label style={labelStyle}>{t('page.buildTemplates.owner')}</label>
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
                  <label style={labelStyle}>{t('page.buildTemplates.dueDays')}</label>
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
              <label style={labelStyle}>
                {itemForm.kind === 'config'
                  ? t('page.buildTemplates.whatIsSetUp')
                  : t('page.buildTemplates.stepField')}
              </label>
              <input
                style={inputStyle}
                value={itemForm.title}
                onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>{t('page.buildTemplates.detailOptional')}</label>
              <textarea
                style={{ ...inputStyle, minHeight: 70 }}
                value={itemForm.detail}
                onChange={(e) => setItemForm({ ...itemForm, detail: e.target.value })}
              />
            </div>
            <button type="button" style={buttonPrimaryStyle} disabled={busy} onClick={() => void saveItem()}>
              {t('page.buildTemplates.save')}
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
