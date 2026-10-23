import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Plus, Trash2 } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { BUILD_STAGES } from '../../lib/delivery'
import { checklistProgress, tasksByStage, templateForPackage } from '../../lib/buildTemplates'
import {
  addBuildTask,
  applyBuildTemplate,
  deleteBuildTask,
  listBuildTasks,
  listBuildTemplates,
  setBuildTaskDone,
} from '../../lib/buildTemplatesStore'
import { errorMessage } from '../../lib/errors'
import { hoursLabel } from '../../lib/timeTracking'
import type { BuildStageKey, BuildTask, BuildTemplate, DeliveryPackage, Requirement } from '../../lib/types'
import {
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  sectionTitleStyle,
  selectStyle,
} from '../../lib/uiStyles'

type Props = {
  accountId: string
  /** Can tick tasks, add tasks and apply a template. */
  canEdit: boolean
  /** Package on the current contract, to suggest its template and show the build hours target. */
  pkg: DeliveryPackage | null
  /** Hours logged as Build on this client so far. */
  buildHours: number
  requirements: Requirement[]
  authorEmail: string
  /** Called after a template adds requirements, so the requirements list reloads. */
  onRequirementsAdded: () => void
}

const smallBtn: CSSProperties = { ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }
const mutedNote: CSSProperties = { color: colors.muted, fontSize: 13, margin: 0, lineHeight: 1.5 }

export default function BuildChecklistCard({
  accountId,
  canEdit,
  pkg,
  buildHours,
  requirements,
  authorEmail,
  onRequirementsAdded,
}: Props) {
  const { showToast } = useToast()
  const [tasks, setTasks] = useState<BuildTask[]>([])
  const [templates, setTemplates] = useState<BuildTemplate[]>([])
  const [templateId, setTemplateId] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ stage: 'build' as BuildStageKey, title: '', hours: '' })

  const load = useCallback(async () => {
    try {
      const [t, tpl] = await Promise.all([listBuildTasks(accountId), listBuildTemplates()])
      setTasks(t)
      setTemplates(tpl.filter((x) => x.active))
    } catch (e) {
      showToast(errorMessage(e, 'Could not load the build checklist'), 'error')
    }
  }, [accountId, showToast])

  useEffect(() => {
    void load()
  }, [load])

  const suggested = templateForPackage(templates, pkg?.id)
  useEffect(() => {
    setTemplateId((current) => current || suggested?.id || templates[0]?.id || '')
  }, [suggested, templates])

  const progress = checklistProgress(tasks)
  const groups = useMemo(() => tasksByStage(tasks), [tasks])
  const target = pkg?.build_hours_target ?? 0
  const overTarget = target > 0 && buildHours > target

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

  async function apply() {
    const template = templates.find((t) => t.id === templateId)
    if (!template) return
    await run(async () => {
      const added = await applyBuildTemplate(accountId, template, tasks, requirements, authorEmail)
      if (added.requirements) onRequirementsAdded()
      const parts = [`${added.tasks} tasks`, `${added.requirements} starter config lines`]
      showToast(
        added.tasks || added.requirements
          ? `${template.name} added ${parts.join(' and ')}${added.skipped ? `, ${added.skipped} already there` : ''}`
          : 'Everything in that template is already on this client',
        'success',
      )
    }, 'Could not apply the template')
  }

  async function addTask(e: FormEvent) {
    e.preventDefault()
    const title = form.title.trim()
    if (!title) return
    const hours = form.hours.trim() === '' ? 0 : Number(form.hours)
    if (!Number.isFinite(hours) || hours < 0) {
      showToast('Hours must be a number', 'error')
      return
    }
    await run(async () => {
      await addBuildTask(accountId, { stage: form.stage, title, detail: '', est_hours: hours }, tasks)
      setForm((f) => ({ ...f, title: '', hours: '' }))
    }, 'Could not add the task')
  }

  return (
    <section style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Build checklist</h2>
        {tasks.length ? (
          <span style={{ fontSize: 12, color: colors.muted }}>
            {progress.done} of {progress.total} done, about {hoursLabel(progress.estHoursLeft)} left
          </span>
        ) : null}
      </div>

      <p style={{ ...mutedNote, marginTop: 8, color: overTarget ? colors.warn : colors.muted }}>
        Build hours logged: {hoursLabel(buildHours)}
        {target > 0 ? ` of ${hoursLabel(target)} target for ${pkg?.name}` : ''}
        {tasks.length ? `. Checklist estimate ${hoursLabel(progress.estHours)}.` : '.'}
        {overTarget ? ' Over the target, note what took longer so the template can improve.' : ''}
      </p>

      {canEdit && templates.length ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <select
            style={{ ...selectStyle, flex: '1 1 200px', padding: '6px 8px', fontSize: 13 }}
            value={templateId}
            aria-label="Build template"
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.id === suggested?.id ? ' (for this package)' : ''}
              </option>
            ))}
          </select>
          <button type="button" style={smallBtn} disabled={busy || !templateId} onClick={() => void apply()}>
            <ClipboardList size={12} /> {tasks.length ? 'Add from template' : 'Start from template'}
          </button>
        </div>
      ) : null}

      {tasks.length === 0 ? (
        <p style={{ ...mutedNote, marginTop: 12 }}>
          No checklist yet. Start from the template for this package to copy in the build steps and the starter
          configuration.{' '}
          {templates.length === 0 ? (
            <>
              Set templates up on <Link to="/build-templates" style={{ color: colors.text }}>Build templates</Link>.
            </>
          ) : null}
        </p>
      ) : (
        groups.map((g) => (
          <div key={g.stage} style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: colors.muted, marginBottom: 4 }}>
              {g.label} ({g.tasks.filter((t) => t.done).length}/{g.tasks.length})
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {g.tasks.map((t) => (
                <li
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '6px 0',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    fontSize: 13,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={t.done}
                    disabled={!canEdit || busy}
                    aria-label={t.title}
                    style={{ marginTop: 3 }}
                    onChange={(e) =>
                      void run(() => setBuildTaskDone(t.id, e.target.checked, authorEmail), 'Could not update the task')
                    }
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ textDecoration: t.done ? 'line-through' : 'none', color: t.done ? colors.muted2 : colors.text }}>
                      {t.title}
                    </div>
                    {t.detail ? <div style={{ fontSize: 12, color: colors.muted }}>{t.detail}</div> : null}
                  </div>
                  {t.est_hours > 0 ? (
                    <span style={{ fontSize: 12, color: colors.muted2, whiteSpace: 'nowrap' }}>{hoursLabel(t.est_hours)}</span>
                  ) : null}
                  {canEdit ? (
                    <button
                      type="button"
                      style={{ ...smallBtn, padding: '4px 8px', color: colors.danger }}
                      aria-label={`Delete ${t.title}`}
                      disabled={busy}
                      onClick={() =>
                        window.confirm(`Delete "${t.title}"?`) &&
                        void run(() => deleteBuildTask(t.id), 'Could not delete the task')
                      }
                    >
                      <Trash2 size={12} />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {canEdit ? (
        <form
          onSubmit={(e) => void addTask(e)}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}
        >
          <select
            style={{ ...selectStyle, flex: '0 1 160px', padding: '6px 8px', fontSize: 12 }}
            value={form.stage}
            aria-label="Stage"
            onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value as BuildStageKey }))}
          >
            {BUILD_STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <input
            style={{ ...inputStyle, flex: '1 1 200px' }}
            placeholder="Extra task for this client"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <input
            style={{ ...inputStyle, flex: '0 0 80px' }}
            inputMode="decimal"
            placeholder="Hours"
            aria-label="Estimated hours"
            value={form.hours}
            onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
          />
          <button type="submit" style={buttonSecondaryStyle} disabled={busy || !form.title.trim()}>
            <Plus size={14} /> Add
          </button>
        </form>
      ) : null}
    </section>
  )
}
