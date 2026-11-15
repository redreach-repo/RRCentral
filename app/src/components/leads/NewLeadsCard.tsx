import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNowStrict, parseISO, subDays } from 'date-fns'
import { Inbox } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { listAccounts } from '../../lib/accountsStore'
import { errorMessage } from '../../lib/errors'
import { canSeeLeads, newLeads, type IntakeRow, type NewLead } from '../../lib/leadIntake'
import { createLeadFromImport, listRecentLeads, updateLeadInquiry } from '../../lib/leadIntakeStore'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import { saveQuickLead } from '../../lib/quickAddStore'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

/** Matches Export CSV on this card. Extra columns (email, phone, …) are accepted on import. */
const EXPORT_COLUMNS = ['name', 'detail', 'created_at', 'link'] as const

function leadMatchKey(name: string, link: string, createdAt: string): string {
  return `${name.trim().toLowerCase()}|${link.trim().toLowerCase()}|${createdAt.trim()}`
}

function intakeByKeys(rows: IntakeRow[], row: Record<string, string>): IntakeRow | undefined {
  const id = String(row.id || '').trim()
  if (id) {
    const byId = rows.find((r) => r.id === id)
    if (byId) return byId
  }
  const email = String(row.email || '').trim().toLowerCase()
  if (email) {
    const byEmail = rows.find((r) => (r.email || '').trim().toLowerCase() === email)
    if (byEmail) return byEmail
  }
  const phoneDigits = String(row.phone || '').replace(/\D/g, '')
  if (phoneDigits.length >= 7) {
    const byPhone = rows.find((r) => {
      const digits = (r.phone || '').replace(/\D/g, '')
      return digits.length >= 7 && (digits.endsWith(phoneDigits) || phoneDigits.endsWith(digits))
    })
    if (byPhone) return byPhone
  }
  const name = String(row.name || '').trim()
  const createdAt = String(row.created_at || '').trim()
  const link = String(row.link || '').trim()
  if (!name) return undefined
  return rows.find((r) => {
    const display = newLeads([r], new Date(0))[0]
    if (!display) return false
    return leadMatchKey(display.name, display.link, display.created_at) === leadMatchKey(name, link, createdAt)
  })
}

/** Leads from the website, WhatsApp and the landing page in the last 7 days. */
export default function NewLeadsCard() {
  const { user, userRole, appUserId } = useAuth()
  const { showToast } = useToast()
  const show = canSeeLeads(userRole)
  const [intake, setIntake] = useState<IntakeRow[] | null>(null)
  const [rows, setRows] = useState<NewLead[] | null>(null)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    const since = subDays(new Date(), 7)
    const list = await listRecentLeads(since)
    setIntake(list)
    setRows(newLeads(list, since))
  }, [])

  useEffect(() => {
    if (!show) return
    let alive = true
    reload().catch(() => {
      if (!alive) return
      setIntake([])
      setRows([])
    })
    return () => {
      alive = false
    }
  }, [show, reload])

  if (!show || !rows || rows.length === 0) return null

  async function importLeadsCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const loaded = [...(intake ?? [])]
      const nextDisplay: NewLead[] = []
      const seen = new Set<string>()
      let created = 0
      let updated = 0
      let matched = 0
      let softLoaded = 0
      let skipped = 0
      let knownRefs: string[] | null = null

      for (const [idx, row] of objects.entries()) {
        const name = String(row.name || '').trim()
        const detail = String(row.detail || '').trim()
        const createdAt = String(row.created_at || '').trim() || new Date().toISOString()
        const link = String(row.link || '').trim() || '/crm'
        const email = String(row.email || '').trim()
        const phone = String(row.phone || '').trim()
        const source = String(row.source || '').trim()
        const channel = String(row.channel || '').trim()
        const status = String(row.status || '').trim()
        if (!name) {
          skipped += 1
          continue
        }
        const key = leadMatchKey(name, link, createdAt)
        if (seen.has(key)) {
          skipped += 1
          continue
        }
        seen.add(key)

        const existing = intakeByKeys(loaded, row)
        if (existing) {
          const patch: Parameters<typeof updateLeadInquiry>[1] = {}
          if (name && name !== existing.name) patch.name = name
          if (email && email !== existing.email) patch.email = email
          if (phone && phone !== existing.phone) patch.phone = phone
          if (source && source !== existing.source) patch.source = source
          if (channel && channel !== existing.channel) patch.channel = channel
          if (status && status !== existing.status) patch.status = status
          if (Object.keys(patch).length) {
            const ok = await updateLeadInquiry(existing.id, patch)
            if (ok) {
              Object.assign(existing, patch)
              updated += 1
            } else {
              matched += 1
            }
          } else {
            matched += 1
          }
          const display = newLeads([existing], new Date(0))[0]
          if (display) nextDisplay.push(display)
          continue
        }

        if (email) {
          const result = await createLeadFromImport({
            name,
            email,
            phone,
            vertical: '',
            message: detail || source || 'Imported lead',
          })
          if (result.stored) {
            created += 1
            const inquiry = result.inquiry
            const intakeRow: IntakeRow = {
              id: inquiry.id,
              name: inquiry.name,
              email: inquiry.email,
              phone: inquiry.phone,
              source: source || 'CSV import',
              channel: channel || 'website_form',
              status: inquiry.status,
              pipeline: 'crm',
              account_id: null,
              crm_id: inquiry.crm_id || result.crmId || '',
              deal_id: '',
              matched: false,
              created_at: inquiry.created_at || createdAt,
            }
            loaded.push(intakeRow)
            if (source || channel || status) {
              await updateLeadInquiry(inquiry.id, {
                ...(source ? { source } : {}),
                ...(channel ? { channel } : {}),
                ...(status ? { status } : {}),
              }).catch(() => false)
            }
            const display = newLeads([intakeRow], new Date(0))[0]
            if (display) nextDisplay.push(display)
            continue
          }
        } else if (phone.replace(/\D/g, '').length >= 8) {
          if (!knownRefs) {
            const accounts = await listAccounts().catch(() => ({ rows: [] as { reference: string }[] }))
            knownRefs = accounts.rows.map((a) => a.reference).filter(Boolean)
          }
          const saved = await saveQuickLead(
            {
              pipeline: 'crm',
              phone,
              name,
              company: name,
              email: '',
              source: source || 'CSV import',
              note: detail || 'Imported lead',
            },
            knownRefs,
            { appUserId, email: user?.email || '', name: user?.email || '' },
          )
          created += 1
          nextDisplay.push({
            id: String(row.id || '').trim() || `import-${idx}`,
            name,
            detail: detail || source || 'Imported lead',
            link: saved.path,
            created_at: createdAt,
          })
          continue
        }

        nextDisplay.push({
          id: String(row.id || '').trim() || `import-${idx}`,
          name,
          detail: detail || 'Imported lead',
          link,
          created_at: createdAt,
        })
        softLoaded += 1
      }

      if (!nextDisplay.length && !created && !updated && !matched) {
        showToast(skipped ? 'No matching new lead rows in CSV' : 'CSV has no data rows', 'error')
        return
      }

      if (created || updated) {
        try {
          await reload()
        } catch {
          setIntake(loaded)
          setRows(nextDisplay.length ? nextDisplay : newLeads(loaded, subDays(new Date(), 7)))
        }
      } else if (nextDisplay.length) {
        setRows(nextDisplay)
      }

      const parts = [
        created ? `${created} created` : '',
        updated ? `${updated} updated` : '',
        matched ? `${matched} matched` : '',
        softLoaded ? `${softLoaded} soft-loaded` : '',
      ].filter(Boolean)
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${parts.join(', ') || '0 lead(s)'}${skipNote}`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'New leads CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <section style={{ ...cardStyle, marginBottom: 16 }} aria-label="New leads">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <Inbox size={18} /> New leads ({rows.length})
        </h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importLeadsCsv(file)
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
            onClick={() => {
              exportListCsv(
                'new-leads.csv',
                [...EXPORT_COLUMNS],
                rows.map((r) => ({
                  name: r.name,
                  detail: r.detail,
                  created_at: r.created_at,
                  link: r.link,
                })),
              )
              showToast('New leads CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
        </div>
      </div>
      <p style={{ color: colors.muted, fontSize: 12, margin: '6px 0 10px' }}>
        From the website, WhatsApp and the AI CRM landing page in the last 7 days.
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {rows.slice(0, 10).map((r) => (
          <li key={r.id} style={{ borderLeft: `3px solid ${colors.accent}`, paddingLeft: 10 }}>
            <Link to={r.link} style={{ color: colors.text, fontWeight: 600, fontSize: 14 }}>
              {r.name}
            </Link>
            <div style={{ color: colors.muted, fontSize: 13 }}>
              {r.detail} · {formatDistanceToNowStrict(parseISO(r.created_at))} ago
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
