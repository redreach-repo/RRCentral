import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Signpost } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { listAccounts, listTeam } from '../../lib/accountsStore'
import { listDeals as listCtrmDeals } from '../../lib/ctrmStore'
import { db } from '../../lib/db'
import { noNextStep, type NoNextStepRow } from '../../lib/dealRules'
import { errorMessage } from '../../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import { patchMyDeal } from '../../lib/myDealsStore'
import {
  NO_NEXT_STEP_CSV_HEADERS,
  NO_NEXT_STEP_PIPELINE_LABELS,
  buildNoNextStepCsvPatch,
  noNextStepToDealStub,
  takeMatchingNoNextStep,
} from '../../lib/noNextStepCsv'
import { can } from '../../lib/permissions'
import { listSalesDeals } from '../../lib/salesPipelineStore'
import type { CrmEntry } from '../../lib/types'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

/**
 * Open deals with no next action or no date for it, across the CRM, AI CRM
 * sales and CTRM Next. Moves now need a next step, so this lists older deals
 * and new leads until someone gives them one. Starts on the person's own deals
 * plus the ones nobody owns. Import CSV updates next_action via patchMyDeal.
 */
export default function NoNextStepCard() {
  const { user, userRole, appUserId } = useAuth()
  const { showToast } = useToast()
  const [rows, setRows] = useState<NoNextStepRow[] | null>(null)
  const [mineOnly, setMineOnly] = useState(true)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const author = useMemo(
    () => ({ appUserId: appUserId || null, email: user?.email || '' }),
    [appUserId, user?.email],
  )

  const load = useCallback(async () => {
    const withCrm = can(userRole, 'legacy.access')
    const [users, accounts, salesDeals, ctrmDeals, crm] = await Promise.all([
      listTeam(),
      listAccounts().then((r) => r.rows),
      listSalesDeals().then((r) => r.rows),
      listCtrmDeals(),
      withCrm
        ? db
            .from('crm')
            .select('id, company_name, owner, pipeline_stage, next_action, follow_up_date')
            .then((res: { data: unknown }) => (res.data || []) as CrmEntry[])
        : Promise.resolve([] as CrmEntry[]),
    ])
    setRows(
      noNextStep({
        users,
        accountNames: new Map(accounts.map((a) => [a.id, a.name])),
        crm,
        salesDeals,
        ctrmDeals,
      }),
    )
  }, [userRole])

  useEffect(() => {
    let alive = true
    void load().catch(() => {
      if (alive) setRows([])
    })
    return () => {
      alive = false
    }
  }, [load])

  const shown = useMemo(
    () => (rows || []).filter((r) => !mineOnly || !r.owner_user_id || r.owner_user_id === appUserId),
    [rows, mineOnly, appUserId],
  )

  async function importNoNextStepCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const remaining = [...(rows ?? [])]
      let saved = 0
      let skipped = 0
      for (const row of objects) {
        const gap = takeMatchingNoNextStep(remaining, row)
        if (!gap) {
          skipped += 1
          continue
        }
        const patch = buildNoNextStepCsvPatch(row, gap)
        if (!patch) {
          skipped += 1
          continue
        }
        try {
          await patchMyDeal(noNextStepToDealStub(gap), patch, author)
          saved += 1
        } catch {
          skipped += 1
        }
      }
      if (!saved) {
        showToast(skipped ? 'No matching no-next-step rows in CSV' : 'CSV has no data rows', 'error')
        return
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Updated next step on ${saved} deal(s)${skipNote}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'No-next-step CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  if (!rows || rows.length === 0) return null

  return (
    <section style={{ ...cardStyle, marginBottom: 16 }} aria-label="No next step">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <Signpost size={18} /> No next step ({shown.length})
        </h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importNoNextStepCsv(file)
            }}
          />
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={importing || !rows.length}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={!shown.length}
            onClick={() => {
              exportListCsv(
                'no-next-step.csv',
                [...NO_NEXT_STEP_CSV_HEADERS],
                shown.map((r) => ({
                  name: r.name,
                  pipeline: NO_NEXT_STEP_PIPELINE_LABELS[r.pipeline],
                  stage: r.stage,
                  missing: r.missing,
                  owner: r.owner_label || '',
                  link: r.link,
                  next_action: r.next_action || '',
                  next_action_date: r.next_action_date || '',
                })),
              )
              showToast('No-next-step CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setMineOnly((m) => !m)}>
            {mineOnly ? 'Show everyone’s' : 'Show mine only'}
          </button>
        </div>
      </div>
      <p style={{ color: colors.muted, fontSize: 12, margin: '6px 0 10px' }}>
        Open deals with no next action or no date for it. Fill next_action (and date) in the CSV, or open one and add what
        happens next.
      </p>
      {shown.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>Every one of your open deals has a next step.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {shown.slice(0, 15).map((r) => (
            <li key={r.key} style={{ fontSize: 13 }}>
              <Link to={r.link} style={{ color: colors.text, fontWeight: 600 }}>
                {r.name}
              </Link>{' '}
              <span style={{ color: colors.muted2, fontSize: 12 }}>
                {NO_NEXT_STEP_PIPELINE_LABELS[r.pipeline]}, {r.missing.toLowerCase()}
                {r.owner_label ? `, ${r.owner_label}` : ', no owner'}
              </span>
            </li>
          ))}
          {shown.length > 15 ? <li style={{ color: colors.muted, fontSize: 12 }}>and {shown.length - 15} more</li> : null}
        </ul>
      )}
    </section>
  )
}
