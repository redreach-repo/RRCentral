import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { format, parseISO } from 'date-fns'
import { CalendarClock, Plus, Trash2 } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { BUILD_STAGES } from '../../lib/delivery'
import {
  addGoLiveStep,
  deleteBuildTask,
  listBuildTasks,
  refreshGoLiveDates,
  setBuildTaskDone,
  signedDateForAccount,
  updateGoLiveStep,
} from '../../lib/buildTemplatesStore'
import { errorMessage } from '../../lib/errors'
import { GO_LIVE_OWNERS, goLiveProgress, goLiveSteps, isOverdue, ownerLabel } from '../../lib/goLive'
import type { AppUser, BuildStageKey, BuildTask, GoLiveOwner } from '../../lib/types'
import { buttonSecondaryStyle, cardStyle, colors, inputStyle, sectionTitleStyle, selectStyle } from '../../lib/uiStyles'

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
  const [form, setForm] = useState({ stage: 'live' as BuildStageKey, title: '', owner: 'red_reach' as GoLiveOwner, due: '' })
  const today = format(new Date(), 'yyyy-MM-dd')

  const load = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([listBuildTasks(accountId), signedDateForAccount(accountId)])
      setTasks(t)
      setSigned(s)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load the go live checklist'), 'error')
    }
  }, [accountId, showToast])

  useEffect(() => {
    void load()
  }, [load, reloadKey])

  const steps = useMemo(() => goLiveSteps(tasks), [tasks])
  const progress = goLiveProgress(tasks, today)
  const undated = steps.filter((t) => !t.done && !t.due_date && t.due_days != null).length

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
    if (!form.title.trim()) return
    await run(async () => {
      await addGoLiveStep(accountId, { stage: form.stage, title: form.title.trim(), owner: form.owner, due_date: form.due || null }, tasks)
      setForm((f) => ({ ...f, title: '', due: '' }))
    }, 'Could not add the step')
  }

  if (!steps.length && !canEdit) return null

  return (
    <section style={cardStyle} aria-label="Go live checklist">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Go live checklist</h2>
        {steps.length ? (
          <span style={{ fontSize: 12, color: progress.overdue ? colors.warn : colors.muted }}>
            {progress.live ? 'Live' : `${progress.done} of ${progress.total} done`}
            {progress.overdue ? `, ${progress.overdue} overdue` : ''}
            {progress.goLiveDate && !progress.live ? `. Go live ${day(progress.goLiveDate)}` : ''}
          </span>
        ) : null}
      </div>

      {steps.length ? (
        <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.1)', overflow: 'hidden', margin: '10px 0 4px' }}>
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
                style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 13 }}
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
                    <button
                      type="button"
                      style={{ ...smallBtn, padding: '4px 8px', color: colors.danger }}
                      aria-label={`Delete ${t.title}`}
                      disabled={busy}
                      onClick={() => window.confirm(`Delete "${t.title}"?`) && void run(() => deleteBuildTask(t.id), 'Could not delete the step')}
                    >
                      <Trash2 size={12} />
                    </button>
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
