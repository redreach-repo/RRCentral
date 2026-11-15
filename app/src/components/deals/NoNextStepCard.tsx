import { useEffect, useMemo, useRef, useState } from 'react'
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
import { can } from '../../lib/permissions'
import { listSalesDeals } from '../../lib/salesPipelineStore'
import type { CrmEntry } from '../../lib/types'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

const EXPORT_COLUMNS = ['name', 'pipeline', 'stage', 'missing', 'owner', 'link'] as const

const PIPELINE: Record<NoNextStepRow['pipeline'], string> = { crm: 'CRM', sales: 'AI CRM sales', ctrm: 'CTRM Next' }

const PIPELINE_BY_LABEL = new Map(
  (Object.entries(PIPELINE) as [NoNextStepRow['pipeline'], string][]).map(([k, label]) => [label.toLowerCase(), k]),
)

function matchPipeline(raw: string): NoNextStepRow['pipeline'] | null {
  const v = raw.trim().toLowerCase()
  if (!v) return null
  if (v === 'crm' || v === 'sales' || v === 'ctrm') return v
  return PIPELINE_BY_LABEL.get(v) ?? null
}

function rowMatchKey(name: string, pipeline: string, link: string): string {
  return `${name.trim().toLowerCase()}|${pipeline.trim().toLowerCase()}|${link.trim().toLowerCase()}`
}

/**
 * Open deals with no next action or no date for it, across the CRM, AI CRM
 * sales and CTRM Next. Moves now need a next step, so this lists older deals
 * and new leads until someone gives them one. Starts on the person's own deals
 * plus the ones nobody owns.
 */
export default function NoNextStepCard() {
  const { userRole, appUserId } = useAuth()
  const { showToast } = useToast()
  const [rows, setRows] = useState<NoNextStepRow[] | null>(null)
  const [mineOnly, setMineOnly] = useState(true)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    const withCrm = can(userRole, 'legacy.access')
    Promise.all([
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
      .then(([users, accounts, salesDeals, ctrmDeals, crm]) => {
        if (!alive) return
        setRows(
          noNextStep({
            users,
            accountNames: new Map(accounts.map((a) => [a.id, a.name])),
            crm,
            salesDeals,
            ctrmDeals,
          }),
        )
      })
      .catch(() => alive && setRows([]))
    return () => {
      alive = false
    }
  }, [userRole])

  const shown = useMemo(
    () => (rows || []).filter((r) => !mineOnly || !r.owner_user_id || r.owner_user_id === appUserId),
    [rows, mineOnly, appUserId],
  )
  if (!rows || rows.length === 0) return null

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
      const existing = rows ?? []
      const byKey = new Map(
        existing.map((r) => [rowMatchKey(r.name, PIPELINE[r.pipeline], r.link || ''), r] as const),
      )
      const next: NoNextStepRow[] = []
      const seen = new Set<string>()
      let matched = 0
      let softLoaded = 0
      let skipped = 0

      objects.forEach((row, idx) => {
        const name = String(row.name || '').trim()
        const pipelineRaw = String(row.pipeline || '').trim()
        const link = String(row.link || '').trim()
        const pipeline = matchPipeline(pipelineRaw)
        if (!name || !pipeline) {
          skipped += 1
          return
        }
        const key = rowMatchKey(name, PIPELINE[pipeline], link)
        if (seen.has(key)) {
          skipped += 1
          return
        }
        seen.add(key)
        const existingRow = byKey.get(key) || byKey.get(rowMatchKey(name, pipeline, link))
        if (existingRow) {
          next.push(existingRow)
          matched += 1
          return
        }
        next.push({
          key: `import-${idx}`,
          pipeline,
          name,
          stage: String(row.stage || '').trim(),
          missing: String(row.missing || '').trim() || 'No next action or date',
          link: link || '/app',
          owner_user_id: null,
          owner_label: String(row.owner || '').trim(),
          next_action: '',
          next_action_date: null,
        })
        softLoaded += 1
      })

      if (!next.length) {
        showToast('No matching no-next-step rows in CSV', 'error')
        return
      }
      setRows(next)
      const parts = [
        matched ? `${matched} matched` : '',
        softLoaded ? `${softLoaded} soft-loaded` : '',
      ].filter(Boolean)
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${next.length} no-next-step item(s) (${parts.join(', ')})${skipNote}`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'No-next-step CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

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
            disabled={importing}
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
                [...EXPORT_COLUMNS],
                shown.map((r) => ({
                  name: r.name,
                  pipeline: PIPELINE[r.pipeline],
                  stage: r.stage,
                  missing: r.missing,
                  owner: r.owner_label || '',
                  link: r.link,
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
        Open deals with no next action or no date for it. Open one and add what happens next.
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
                {PIPELINE[r.pipeline]}, {r.missing.toLowerCase()}
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
