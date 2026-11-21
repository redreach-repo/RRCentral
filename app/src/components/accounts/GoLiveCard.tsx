import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { format, parseISO } from 'date-fns'
import { CalendarClock, Plus, Trash2 } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { BUILD_STAGES } from '../../lib/delivery'
import {
  addGoLiveStep,
  deleteBuildTask,
  listBuildTasks,
  refreshGoLiveDates,
  restoreBuildTask,
  setBuildTaskDone,
  signedDateForAccount,
  updateGoLiveStep,
} from '../../lib/buildTemplatesStore'
import { errorMessage } from '../../lib/errors'
import { GO_LIVE_OWNERS, goLiveProgress, goLiveSteps, isOverdue, ownerLabel } from '../../lib/goLive'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import { parseGoLiveStepForm } from '../../lib/schemas/goLiveStep'
import type { AppUser, BuildStageKey, BuildTask, GoLiveOwner } from '../../lib/types'
import { buttonSecondaryStyle, cardStyle, colors, inputStyle, sectionTitleStyle, selectStyle } from '../../lib/uiStyles'

const GO_LIVE_CSV_COLUMNS = [
  'stage',
  'title',
  'owner',
  'due_date',
  'due_days',
  'done',
  'done_at',
  'done_by',
  'archived',
] as const

const STAGE_VALUES = new Set(BUILD_STAGES.map((s) => s.value))
const STAGE_BY_LABEL = new Map(BUILD_STAGES.map((s) => [s.label.toLowerCase(), s.value]))

function stepMatchKey(stage: string, title: string): string {
  return `${stage}|${title.trim().toLowerCase()}`
}

function parseDoneFlag(raw: string): boolean {
  const v = raw.trim().toLowerCase()
  if (!v) return false
  return !(v === 'no' || v === 'false' || v === '0' || v === 'off' || v === 'n')
}

function resolveStage(raw: string): BuildStageKey | '' {
  const value = raw.trim()
  if (!value) return ''
  if (STAGE_VALUES.has(value as BuildStageKey)) return value as BuildStageKey
  return (STAGE_BY_LABEL.get(value.toLowerCase()) as BuildStageKey | undefined) || ''
}

function resolveOwner(raw: string): GoLiveOwner {
  const v = raw.trim().toLowerCase()
  if (!v) return 'red_reach'
  if (v === 'client' || v === 'you') return 'client'
  const byLabel = GO_LIVE_OWNERS.find((o) => o.label.toLowerCase() === v || o.portalLabel.toLowerCase() === v)
  if (byLabel) return byLabel.value
  if (v === 'red_reach' || v === 'red reach') return 'red_reach'
  return 'red_reach'
}

const smallBtn: CSSProperties = { ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }
const muted: CSSProperties = { color: colors.muted, fontSize: 13, margin: 0, lineHeight: 1.5 }
const day = (iso: string) => format(parseISO(iso.slice(0, 10)), 'd MMM')

/**
 * The go live checklist on a client: what has to happen before they go live,
 * who owns each step (Red Reach or the client) and when it is due, counted
 * from the date they signed. Comes from the build template; the client sees
 * the same list in their portal.
 */
export default function GoLiveCard({
  accountId,
  canEdit,
  team,
  authorEmail,
  reloadKey,
}: {
  accountId: string
  canEdit: boolean
  team: AppUser[]
  authorEmail: string
  /** Changes when the build template was applied, so the list reloads. */
  reloadKey?: number
}) {
  const { showToast } = useToast()
  const [tasks, setTasks] = useState<BuildTask[]>([])
  const [signed, setSigned] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [form, setForm] = useState({ stage: 'live' as BuildStageKey, title: '', owner: 'red_reach' as GoLiveOwner, due: '' })
  const today = format(new Date(), 'yyyy-MM-dd')

  const load = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([
        listBuildTasks(accountId, { includeDeleted: showArchived }),
        signedDateForAccount(accountId),
      ])
      setTasks(t)
      setSigned(s)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load the go live checklist'), 'error')
    }
  }, [accountId, showToast, showArchived])

  useEffect(() => {
    void load()
  }, [load, reloadKey])

  const activeTasks = useMemo(() => tasks.filter((t) => !t.deleted_at), [tasks])
  const steps = useMemo(() => goLiveSteps(tasks), [tasks])
  const progress = goLiveProgress(activeTasks, today)
  const undated = activeTasks.filter((t) => !t.done && !t.due_date && t.due_days != null).length

  async function run(job: () => Promise<unknown>, failure: string) {
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

  async function add(e: FormEvent) {
    e.preventDefault()
    const parsed = parseGoLiveStepForm(form)
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    await run(async () => {
      await addGoLiveStep(accountId, parsed.data, tasks)
      setForm((f) => ({ ...f, title: '', due: '' }))
    }, 'Could not add the step')
  }

  async function importGoLiveCsv(file: File) {
    if (!canEdit) return
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const byKey = new Map(steps.map((t) => [stepMatchKey(t.stage, t.title), t] as const))
      const seen = new Set(byKey.keys())
      let working: Pick<BuildTask, 'sort'>[] = [...tasks]
      let added = 0
      let updated = 0
      let skipped = 0
      const pendingDone: Array<{ key: string; done: boolean; by: string }> = []

      for (const row of objects) {
        const title = String(row.title || '').trim()
        const stage = resolveStage(String(row.stage || '')) || 'live'
        if (!title) {
          skipped += 1
          continue
        }
        const owner = resolveOwner(String(row.owner || ''))
        const dueRaw = String(row.due_date || '').trim()
        const due_date = /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) ? dueRaw : null
        const done = parseDoneFlag(String(row.done ?? ''))
        const doneBy = String(row.done_by || '').trim() || authorEmail
        const key = stepMatchKey(stage, title)
        const existing = byKey.get(key)
        if (existing) {
          const nextOwner = owner
          const ownerChanged = (existing.owner || 'red_reach') !== nextOwner
          const dueChanged = (existing.due_date || null) !== due_date
          if (ownerChanged || dueChanged) {
            await updateGoLiveStep(existing.id, {
              owner: nextOwner,
              owner_user_id: nextOwner === 'client' ? null : existing.owner_user_id,
              due_date,
            })
            updated += 1
          }
          if (Boolean(existing.done) !== done) {
            await setBuildTaskDone(existing.id, done, done ? doneBy : '')
            updated += 1
          }
          continue
        }
        if (seen.has(key)) {
          skipped += 1
          continue
        }
        await addGoLiveStep(accountId, { stage, title, owner, due_date }, working)
        const nextSort = working.reduce((max, t) => Math.max(max, t.sort), 0) + 1
        working = [...working, { sort: nextSort }]
        seen.add(key)
        added += 1
        if (done) pendingDone.push({ key, done: true, by: doneBy })
      }

      if (pendingDone.length) {
        const fresh = goLiveSteps(await listBuildTasks(accountId, { includeDeleted: showArchived }))
        const freshByKey = new Map(fresh.map((t) => [stepMatchKey(t.stage, t.title), t] as const))
        for (const item of pendingDone) {
          const task = freshByKey.get(item.key)
          if (task && Boolean(task.done) !== item.done) {
            await setBuildTaskDone(task.id, item.done, item.done ? item.by : '')
            updated += 1
          }
        }
      }

      if (!added && !updated && skipped) {
        showToast('No matching go-live rows in CSV', 'error')
        return
      }
      const parts = [added ? `${added} added` : '', updated ? `${updated} updated` : ''].filter(Boolean)
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(
        parts.length ? `Imported go-live checklist (${parts.join(', ')})${skipNote}` : `No go-live changes${skipNote}`,
        'success',
      )
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Go-live CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  if (!steps.length && !canEdit) return null

  return (
    <section style={cardStyle} aria-label="Go live checklist">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Go live checklist</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {canEdit ? (
            <button type="button" style={smallBtn} onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? 'Hide archived' : 'Show archived'}
            </button>
          ) : null}
          {steps.length ? (
            <span style={{ fontSize: 12, color: progress.overdue ? colors.warn : colors.muted }}>
              {progress.live ? 'Live' : `${progress.done} of ${progress.total} done`}
              {progress.overdue ? `, ${progress.overdue} overdue` : ''}
              {progress.goLiveDate && !progress.live ? `. Go live ${day(progress.goLiveDate)}` : ''}
            </span>
          ) : null}
          {canEdit ? (
            <>
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void importGoLiveCsv(file)
                }}
              />
              <button
                type="button"
                style={smallBtn}
                disabled={importing || busy}
                onClick={() => importInputRef.current?.click()}
              >
                {importing ? 'Importing…' : 'Import CSV'}
              </button>
            </>
          ) : null}
          {steps.length ? (
            <button
              type="button"
              style={smallBtn}
              onClick={() => {
                exportListCsv(
                  `go-live-${accountId.slice(0, 8)}.csv`,
                  [...GO_LIVE_CSV_COLUMNS],
                  steps.map((t) => ({
                    stage: t.stage,
                    title: t.title,
                    owner: ownerLabel(t.owner || 'red_reach'),
                    due_date: t.due_date || '',
                    due_days: t.due_days ?? '',
                    done: t.done ? 'yes' : 'no',
                    done_at: t.done_at || '',
                    done_by: t.done_by || '',
                    archived: t.deleted_at ? 'yes' : 'no',
                  })),
                )
                showToast('Go-live checklist CSV downloaded', 'success')
              }}
            >
              Export CSV
            </button>
          ) : null}
        </div>
      </div>

      {steps.length ? (
        <div style={{ height: 6, borderRadius: 999, background: 'color-mix(in srgb, var(--text) 10%, transparent)', overflow: 'hidden', margin: '10px 0 4px' }}>
          <div style={{ width: `${progress.percent}%`, height: '100%', background: progress.overdue ? colors.warn : colors.accent }} />
        </div>
      ) : null}

      <p style={{ ...muted, marginTop: 8 }}>
        {signed ? `Signed ${format(parseISO(signed), 'd MMM yyyy')}. Due dates count from then.` : 'Not signed yet, so the steps have no due dates.'}
        {' '}The client sees this list in their portal.
      </p>

      {canEdit && signed && undated ? (
        <button
          type="button"
          style={{ ...smallBtn, marginTop: 8 }}
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const n = await refreshGoLiveDates(tasks, signed)
              showToast(n ? `${n} due dates set` : 'The dates are already set', 'success')
            }, 'Could not set the dates')
          }
        >
          <CalendarClock size={12} /> Set due dates from the signed date
        </button>
      ) : null}

      {steps.length === 0 ? (
        <p style={{ ...muted, marginTop: 12 }}>
          No go live steps yet. Start the build checklist from the template for this package to copy them in, or add steps below.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0' }}>
          {steps.map((t) => {
            const late = isOverdue(t, today)
            return (
              <li
                key={t.id}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}
              >
                <input
                  type="checkbox"
                  checked={t.done}
                  disabled={!canEdit || busy}
                  aria-label={t.title}
                  style={{ marginTop: 3 }}
                  onChange={(e) => void run(() => setBuildTaskDone(t.id, e.target.checked, authorEmail), 'Could not update the step')}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ textDecoration: t.done ? 'line-through' : 'none', color: t.done ? colors.muted2 : colors.text }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: late ? colors.warn : colors.muted }}>
                    {ownerLabel(t.owner)}
                    {t.owner !== 'client' && t.owner_user_id ? `, ${team.find((u) => u.id === t.owner_user_id)?.name || 'team'}` : ''}
                    {t.due_date ? `, due ${day(t.due_date)}` : ''}
                    {late ? ', overdue' : ''}
                    {t.done && t.done_at ? `, done ${day(t.done_at)}` : ''}
                  </div>
                </div>
                {canEdit && !t.done ? (
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <select
                      aria-label={`Who owns ${t.title}`}
                      style={{ ...selectStyle, padding: '4px 6px', fontSize: 12, width: 'auto' }}
                      value={t.owner === 'client' ? 'client' : t.owner_user_id || 'red_reach'}
                      disabled={busy}
                      onChange={(e) => {
                        const v = e.target.value
                        void run(
                          () => updateGoLiveStep(t.id, v === 'client' ? { owner: 'client', owner_user_id: null } : { owner: 'red_reach', owner_user_id: v === 'red_reach' ? null : v }),
                          'Could not change the owner',
                        )
                      }}
                    >
                      <option value="red_reach">Red Reach</option>
                      {team
                        .filter((u) => u.active)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name || u.email}
                          </option>
                        ))}
                      <option value="client">Client</option>
                    </select>
                    <input
                      type="date"
                      aria-label={`Due date for ${t.title}`}
                      style={{ ...inputStyle, padding: '4px 6px', fontSize: 12, width: 140 }}
                      value={t.due_date || ''}
                      disabled={busy}
                      onChange={(e) => void run(() => updateGoLiveStep(t.id, { due_date: e.target.value || null }), 'Could not change the date')}
                    />
                    {t.deleted_at ? (
                      <button
                        type="button"
                        style={{ ...smallBtn, padding: '4px 8px' }}
                        aria-label={`Restore ${t.title}`}
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await restoreBuildTask(t.id)
                            showToast('Step restored', 'success')
                          }, 'Could not restore the step')
                        }
                      >
                        Restore
                      </button>
                    ) : (
                      <button
                        type="button"
                        style={{ ...smallBtn, padding: '4px 8px', color: colors.danger }}
                        aria-label={`Archive ${t.title}`}
                        disabled={busy}
                        onClick={() =>
                          window.confirm(`Archive "${t.title}"? Use Show archived to restore later.`) &&
                          void run(async () => {
                            await deleteBuildTask(t.id)
                            showToast('Step archived', 'success')
                          }, 'Could not archive the step')
                        }
                      >
                        <Trash2 size={12} /> Archive
                      </button>
                    )}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {canEdit ? (
        <form onSubmit={(e) => void add(e)} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <select
            style={{ ...selectStyle, flex: '0 1 150px', padding: '6px 8px', fontSize: 12 }}
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
            placeholder="Extra go live step"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <select
            style={{ ...selectStyle, flex: '0 0 120px', padding: '6px 8px', fontSize: 12 }}
            value={form.owner}
            aria-label="Owner"
            onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value as GoLiveOwner }))}
          >
            {GO_LIVE_OWNERS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            aria-label="Due date"
            style={{ ...inputStyle, flex: '0 0 150px' }}
            value={form.due}
            onChange={(e) => setForm((f) => ({ ...f, due: e.target.value }))}
          />
          <button type="submit" style={buttonSecondaryStyle} disabled={busy || !form.title.trim()}>
            <Plus size={14} /> Add
          </button>
        </form>
      ) : null}
    </section>
  )
}
