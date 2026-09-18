import type { CSSProperties, ReactNode } from 'react'
import { PIPELINE_STAGES } from '../lib/config'
import type { CrmEntry } from '../lib/types'
import { followUpBucket } from '../lib/crmWorkQueue'
import { contactDisplay, hydrateContacts, primaryContact } from '../lib/contacts'
import { colors } from '../lib/pageStyles'
import resp from '../styles/crmResponsive.module.css'

type Props = {
  entries: CrmEntry[]
  busyId: string | null
  onOpen: (entry: CrmEntry) => void
  onMoveStage: (entry: CrmEntry, stage: string) => void
  onLogTouch: (entry: CrmEntry) => void
  renderActions: (entry: CrmEntry) => ReactNode
}

const openStages = PIPELINE_STAGES.filter((s) => s !== 'Won' && s !== 'Lost')
const closedStages = PIPELINE_STAGES.filter((s) => s === 'Won' || s === 'Lost')

function toneFor(entry: CrmEntry): string {
  const bucket = followUpBucket(entry.follow_up_date)
  if (bucket === 'Overdue') return colors.danger
  if (bucket === 'Today') return colors.warn
  if (bucket === 'Upcoming') return colors.success
  return colors.border
}

export default function CrmPipelineBoard({
  entries,
  busyId,
  onOpen,
  onMoveStage,
  onLogTouch,
  renderActions,
}: Props) {
  const byStage = (stage: string) => entries.filter((e) => (e.pipeline_stage || 'Lead') === stage)

  function column(stage: string, muted?: boolean) {
    const rows = byStage(stage)
    return (
      <div key={stage} className={resp.boardCol} style={muted ? { opacity: 0.85 } : undefined}>
        <div className={resp.boardColHead}>
          <span>{stage}</span>
          <span className={resp.boardCount}>{rows.length}</span>
        </div>
        <div className={resp.boardColBody}>
          {rows.length === 0 ? (
            <div className={resp.boardEmpty}>Drop deals here</div>
          ) : (
            rows.map((row) => {
              const contacts = hydrateContacts(row)
              const display = contactDisplay(contacts)
              const p = primaryContact(contacts)
              const busy = busyId === row.id
              const accent = toneFor(row)
              return (
                <article
                  key={row.id}
                  className={resp.boardCard}
                  style={{ borderLeftColor: accent } as CSSProperties}
                >
                  <button type="button" className={resp.cardTitle} onClick={() => onOpen(row)}>
                    {row.company_name}
                  </button>
                  <div className={resp.cardMeta}>
                    {display.label}
                    {p?.phone ? ` · ${p.phone}` : ''}
                  </div>
                  <div className={resp.cardMeta} style={{ color: accent, fontWeight: 600 }}>
                    {row.follow_up_date
                      ? `Follow-up ${row.follow_up_date.slice(0, 10)}`
                      : 'No follow-up'}
                    {row.next_action ? ` · ${row.next_action}` : ''}
                  </div>
                  <div className={resp.cardMeta}>Sales: {row.owner || 'Unassigned'}</div>
                  <select
                    className={resp.boardStageSelect}
                    disabled={busy}
                    value={row.pipeline_stage || 'Lead'}
                    onChange={(e) => onMoveStage(row, e.target.value)}
                    aria-label={`Move ${row.company_name}`}
                  >
                    {PIPELINE_STAGES.map((s) => (
                      <option key={s} value={s}>
                        Move to {s}
                      </option>
                    ))}
                  </select>
                  <div className={resp.cardActions}>
                    <button type="button" className={resp.boardLogBtn} onClick={() => onLogTouch(row)}>
                      Log touch
                    </button>
                    {renderActions(row)}
                  </div>
                </article>
              )
            })
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={resp.board}>
      <div className={resp.boardTrack}>
        {openStages.map((s) => column(s))}
        {closedStages.map((s) => column(s, true))}
      </div>
    </div>
  )
}
