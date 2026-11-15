import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { PIPELINE_STAGES } from '../lib/config'
import {
  CRM_PIPELINE_BOARD_CSV_COLUMNS,
  CRM_PIPELINE_BOARD_CSV_HEADERS,
  buildCrmBoardCsvPatch,
  isTerminalCrmBoardStage,
  resolveCrmBoardStage,
  takeMatchingCrmEntry,
} from '../lib/crmPipelineBoardCsv'
import { db } from '../lib/db'
import { errorMessage } from '../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv, parseListIoRows } from '../lib/listIo'
import type { DealRow } from '../lib/myDeals'
import { moveMyDeal, patchMyDeal } from '../lib/myDealsStore'
import type { CrmEntry } from '../lib/types'
import { followUpBucket } from '../lib/crmWorkQueue'
import { contactDisplay, hydrateContacts, primaryContact } from '../lib/contacts'
import { logActivity } from '../lib/activity'
import { colors } from '../lib/pageStyles'
import { buttonSecondaryStyle } from '../lib/uiStyles'
import resp from '../styles/crmResponsive.module.css'

function exportBoardCsv(entries: CrmEntry[]) {
  exportListCsv(
    'crm-pipeline-board.csv',
    [...CRM_PIPELINE_BOARD_CSV_HEADERS],
    entries.map((row) => {
      const contacts = hydrateContacts(row)
      const display = contactDisplay(contacts)
      const p = primaryContact(contacts)
      return {
        company_name: row.company_name,
        pipeline_stage: row.pipeline_stage || 'Lead',
        owner: row.owner || '',
        follow_up_date: row.follow_up_date || '',
        next_action: row.next_action || '',
        contact: display.label,
        phone: p?.phone || '',
        email: p?.email || '',
        quote_ref: row.quote_ref || '',
        follow_up_bucket: followUpBucket(row.follow_up_date),
      }
    }),
  )
}

/** Minimal DealRow so we can reuse moveMyDeal / patchMyDeal for CRM board rows. */
function crmEntryAsDealRow(entry: CrmEntry): DealRow {
  const stage = entry.pipeline_stage || 'Lead'
  return {
    key: `crm:${entry.id}`,
    pipeline: 'crm',
    id: entry.id,
    account: entry.company_name,
    account_id: entry.account_id ?? null,
    deal: entry.quote_ref || entry.company_name,
    stage,
    stageLabel: stage,
    column: 'new',
    open: stage !== 'Won' && stage !== 'Lost',
    value: null,
    weighted: null,
    next_action: entry.next_action || '',
    next_action_date: entry.follow_up_date ? String(entry.follow_up_date).slice(0, 10) : null,
    overdue: false,
    days_in_stage: 0,
    owner_user_id: null,
    owner_label: entry.owner || '',
    source: '',
    notes: '',
    quote_ref: entry.quote_ref || '',
    division: '',
    link: '/crm',
  }
}

type Props = {
  entries: CrmEntry[]
  busyId: string | null
  /** Phone / compact: stage picker + vertical list instead of horizontal board */
  compact?: boolean
  /** Tenant pipeline stages (falls back to hardcoded CRM list). */
  stages?: readonly string[]
  onOpen: (entry: CrmEntry) => void
  onMoveStage: (entry: CrmEntry, stage: string) => void
  /** Reload board data after a CSV import. */
  onImported?: () => void
  renderActions: (entry: CrmEntry) => ReactNode
}

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
  stages,
  onOpen,
  onMoveStage,
  renderActions,
}: {
  row: CrmEntry
  busy: boolean
  stages: readonly string[]
  onOpen: (entry: CrmEntry) => void
  onMoveStage: (entry: CrmEntry, stage: string) => void
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
        {stages.map((s) => (
          <option key={s} value={s}>
            Move to {s}
          </option>
        ))}
      </select>
      <div className={resp.cardActions}>{renderActions(row)}</div>
    </article>
  )
}

function CsvToolbar({
  entries,
  stages,
  onImported,
}: {
  entries: CrmEntry[]
  stages: readonly string[]
  onImported?: () => void
}) {
  const { user, appUserId } = useAuth()
  const { showToast } = useToast()
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  async function importBoardCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, rows).map((row) => {
        const normalized: Record<string, string> = {}
        for (const c of CRM_PIPELINE_BOARD_CSV_COLUMNS) {
          normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
        }
        return normalized
      })
      const { ok, errors } = parseListIoRows(objects, CRM_PIPELINE_BOARD_CSV_COLUMNS)
      if (!ok.length && errors.length) {
        showToast(errors[0] || 'No valid deal rows', 'error')
        return
      }
      const remaining = [...entries]
      const author = { appUserId, email: user?.email || '' }
      let saved = 0
      let skipped = errors.length
      for (const row of ok) {
        const entry = takeMatchingCrmEntry(remaining, row.company_name, row.quote_ref || '')
        if (!entry) {
          skipped += 1
          continue
        }
        const fieldPatch = buildCrmBoardCsvPatch(row, entry)
        if (!fieldPatch) {
          skipped += 1
          continue
        }
        let changed = false
        const deal = crmEntryAsDealRow(entry)
        const myPatch: {
          next_action?: string
          next_action_date?: string | null
          quote_ref?: string
        } = {}
        if (fieldPatch.next_action !== undefined) myPatch.next_action = fieldPatch.next_action
        if (fieldPatch.follow_up_date !== undefined) myPatch.next_action_date = fieldPatch.follow_up_date
        if (fieldPatch.quote_ref !== undefined) myPatch.quote_ref = fieldPatch.quote_ref
        if (Object.keys(myPatch).length) {
          try {
            await patchMyDeal(deal, myPatch, author)
            changed = true
          } catch {
            skipped += 1
            continue
          }
        }
        if (fieldPatch.owner !== undefined) {
          const now = new Date().toISOString()
          const { error: ownErr } = await db
            .from('crm')
            .update({
              owner: fieldPatch.owner,
              updated_by: author.email,
              updated_at: now,
            })
            .eq('id', entry.id)
          if (ownErr) {
            skipped += 1
            continue
          }
          await logActivity(
            'quick_update_crm',
            'crm',
            entry.company_name,
            `owner=${fieldPatch.owner || '—'}`,
            author.email,
            entry.id,
          )
          changed = true
        }
        const nextStage = resolveCrmBoardStage(row.pipeline_stage || '', stages)
        const currentStage = entry.pipeline_stage || 'Lead'
        if (nextStage && nextStage !== currentStage && !isTerminalCrmBoardStage(nextStage)) {
          try {
            await moveMyDeal(deal, { stage: nextStage }, author)
            changed = true
          } catch {
            // Keep field patches if the stage move was blocked (e.g. missing next step).
          }
        }
        if (changed) saved += 1
        else skipped += 1
      }
      if (!saved) {
        showToast(skipped ? 'No matching deal rows in CSV' : 'CSV has no data rows', 'error')
        return
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} deal(s)${skipNote}`, 'success')
      onImported?.()
    } catch (e) {
      showToast(errorMessage(e, 'CRM pipeline CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void importBoardCsv(file)
        }}
      />
      <button
        type="button"
        style={buttonSecondaryStyle}
        disabled={importing || entries.length === 0}
        onClick={() => importInputRef.current?.click()}
      >
        {importing ? 'Importing…' : 'Import CSV'}
      </button>
      <button
        type="button"
        style={buttonSecondaryStyle}
        disabled={entries.length === 0}
        onClick={() => exportBoardCsv(entries)}
      >
        Export CSV
      </button>
    </div>
  )
}

export default function CrmPipelineBoard({
  entries,
  busyId,
  compact,
  stages = PIPELINE_STAGES,
  onOpen,
  onMoveStage,
  onImported,
  renderActions,
}: Props) {
  const openStages = stages.filter((s) => s !== 'Won' && s !== 'Lost')
  const closedStages = stages.filter((s) => s === 'Won' || s === 'Lost')
  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of stages) map[s] = 0
    for (const e of entries) {
      const s = e.pipeline_stage || 'Lead'
      map[s] = (map[s] || 0) + 1
    }
    return map
  }, [entries, stages])

  const firstWithDeals =
    stages.find((s) => (counts[s] || 0) > 0) || openStages[0] || 'Lead'
  const [stageFocus, setStageFocus] = useState(firstWithDeals)

  const byStage = (stage: string) => entries.filter((e) => (e.pipeline_stage || 'Lead') === stage)

  if (compact) {
    const rows = byStage(stageFocus)
    return (
      <div className={resp.boardCompact}>
        <CsvToolbar entries={entries} stages={stages} onImported={onImported} />
        <div className={resp.chipScroll} role="tablist" aria-label="Pipeline stage">
          {stages.map((s) => (
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
                stages={stages}
                onOpen={onOpen}
                onMoveStage={onMoveStage}
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
                stages={stages}
                onOpen={onOpen}
                onMoveStage={onMoveStage}
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
      <CsvToolbar entries={entries} stages={stages} onImported={onImported} />
      <div className={resp.boardTrack}>
        {openStages.map((s) => column(s))}
        {closedStages.map((s) => column(s, true))}
      </div>
    </div>
  )
}
