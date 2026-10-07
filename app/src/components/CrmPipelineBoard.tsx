import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { PIPELINE_STAGES } from '../lib/config'
import type { CrmEntry } from '../lib/types'
import { followUpBucket } from '../lib/crmWorkQueue'
import { contactDisplay, hydrateContacts, primaryContact } from '../lib/contacts'
import { colors } from '../lib/pageStyles'
import resp from '../styles/crmResponsive.module.css'

type Props = {
  entries: CrmEntry[]
  busyId: string | null
  /** Phone / compact: stage picker + vertical list instead of horizontal board */
  compact?: boolean
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

function DealCard({
  row,
  busy,
  onOpen,
  onMoveStage,
  onLogTouch,
  renderActions,
}: {
  row: CrmEntry
  busy: boolean
  onOpen: (entry: CrmEntry) => void
  onMoveStage: (entry: CrmEntry, stage: string) => void
  onLogTouch: (entry: CrmEntry) => void
  renderActions: (entry: CrmEntry) => ReactNode
}) {
  const contacts = hydrateContacts(row)
  const display = contactDisplay(contacts)
  const p = primaryContact(contacts)
  const accent = toneFor(row)
  return (
    <article className={resp.boardCard} style={{ borderLeftColor: accent } as CSSProperties}>
      <button type="button" className={resp.cardTitle} onClick={() => onOpen(row)}>
        {row.company_name}
      </button>
      <div className={resp.cardMeta}>
        {display.label}
        {p?.phone ? ` · ${p.phone}` : ''}
      </div>
      <div className={resp.cardMeta} style={{ color: accent, fontWeight: 600 }}>
        {row.follow_up_date ? `Follow-up ${row.follow_up_date.slice(0, 10)}` : 'No follow-up'}
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
}

export default function CrmPipelineBoard({
  entries,
  busyId,
  compact,
  onOpen,
  onMoveStage,
  onLogTouch,
  renderActions,
}: Props) {
  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of PIPELINE_STAGES) map[s] = 0
    for (const e of entries) {
      const s = e.pipeline_stage || 'Lead'
      map[s] = (map[s] || 0) + 1
    }
    return map
  }, [entries])

  const firstWithDeals =
    PIPELINE_STAGES.find((s) => (counts[s] || 0) > 0) || openStages[0] || 'Lead'
  const [stageFocus, setStageFocus] = useState(firstWithDeals)

  const byStage = (stage: string) => entries.filter((e) => (e.pipeline_stage || 'Lead') === stage)

  if (compact) {
    const rows = byStage(stageFocus)
    return (
      <div className={resp.boardCompact}>
        <div className={resp.chipScroll} role="tablist" aria-label="Pipeline stage">
          {PIPELINE_STAGES.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={stageFocus === s}
              className={`${resp.boardStageChip} ${stageFocus === s ? resp.boardStageChipActive : ''}`}
              onClick={() => setStageFocus(s)}
            >
              {s} ({counts[s] || 0})
            </button>
          ))}
        </div>
        <div className={resp.listStack}>
          {rows.length === 0 ? (
            <div className={resp.boardEmpty}>No deals in {stageFocus}</div>
          ) : (
            rows.map((row) => (
              <DealCard
                key={row.id}
                row={row}
                busy={busyId === row.id}
                onOpen={onOpen}
                onMoveStage={onMoveStage}
                onLogTouch={onLogTouch}
                renderActions={renderActions}
              />
            ))
          )}
        </div>
      </div>
    )
  }

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
            rows.map((row) => (
              <DealCard
                key={row.id}
                row={row}
                busy={busyId === row.id}
                onOpen={onOpen}
                onMoveStage={onMoveStage}
                onLogTouch={onLogTouch}
                renderActions={renderActions}
              />
            ))
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
