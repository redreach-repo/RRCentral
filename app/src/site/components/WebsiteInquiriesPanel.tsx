import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../../lib/db'
import {
  buildCrmLeadFromInquiry,
  buildWebsiteInquiry,
  validateWebsiteInquiry,
  verticalBrandForInquiry,
} from '../../lib/websiteLeads'
import type { WebsiteInquiry } from '../../lib/types'
import { VERTICALS } from '../data/verticals'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { btnGhost, btnPrimary, colors } from '../../lib/pageStyles'
import { resolveSalesOwnerName } from '../../lib/crmWorkQueue'
import { errorMessage } from '../../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'

function resolveVertical(raw: string): string {
  const token = raw.trim()
  if (!token) return 'general'
  const lower = token.toLowerCase()
  if (lower === 'general' || lower === 'general enquiry') return 'general'
  const match = VERTICALS.find(
    (v) =>
      v.slug === lower ||
      v.brand.toLowerCase() === lower ||
      v.brand.toLowerCase() === token.toLowerCase(),
  )
  return match?.slug || token
}

export default function WebsiteInquiriesPanel({
  onConverted,
}: {
  onConverted?: (crmId?: string) => void
}) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [rows, setRows] = useState<WebsiteInquiry[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [ownerName, setOwnerName] = useState('')
  const [loaded, setLoaded] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const [{ data, error }, usersRes] = await Promise.all([
        db.from('website_inquiries').select('*').order('created_at', { ascending: false }),
        db.from('app_users').select('email,name').eq('active', true),
      ])
      if (error) {
        setRows([])
        return
      }
      setRows(((data as WebsiteInquiry[]) || []).filter((r) => r.status === 'new'))
      const users = (usersRes.data || []) as { email: string; name: string }[]
      setOwnerName(resolveSalesOwnerName(user?.email, users))
    } catch {
      setRows([])
    } finally {
      setLoaded(true)
    }
  }, [user?.email])

  useEffect(() => {
    void load()
  }, [load])

  async function convert(row: WebsiteInquiry) {
    setBusy(row.id)
    try {
      const lead = buildCrmLeadFromInquiry(row)
      lead.created_by = user?.email || 'website'
      lead.updated_by = user?.email || 'website'
      lead.owner = ownerName || user?.email || ''
      const { error } = await db.from('crm').insert(lead)
      if (error) throw error
      await db.from('website_inquiries').update({ status: 'converted', crm_id: lead.id }).eq('id', row.id)
      showToast('Website enquiry added to CRM', 'success')
      onConverted?.(lead.id)
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not convert enquiry'), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function dismiss(row: WebsiteInquiry) {
    setBusy(row.id)
    try {
      const { error } = await db
        .from('website_inquiries')
        .update({ status: 'closed' })
        .eq('id', row.id)
      if (error) throw error
      showToast('Enquiry dismissed', 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not dismiss enquiry'), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function importInquiriesCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      if (!objects.length) {
        showToast('No website enquiry rows in CSV', 'error')
        return
      }

      const existingEmails = new Set(rows.map((r) => r.email.trim().toLowerCase()).filter(Boolean))
      let saved = 0
      let skipped = 0

      for (const row of objects) {
        const name = String(row.name || '').trim()
        const email = String(row.email || '').trim()
        const phone = String(row.phone || '').trim()
        const vertical = resolveVertical(String(row.vertical || ''))
        const message = String(row.message || '').trim()
        const statusRaw = String(row.status || 'new').trim().toLowerCase() || 'new'

        const check = validateWebsiteInquiry({ name, email, phone, vertical, message })
        if (!check.ok) {
          skipped += 1
          continue
        }

        const emailKey = email.toLowerCase()
        if (existingEmails.has(emailKey) && statusRaw === 'new') {
          skipped += 1
          continue
        }

        if (statusRaw === 'closed' || statusRaw === 'converted') {
          const { data: existing } = await db
            .from('website_inquiries')
            .select('*')
            .eq('email', email)
            .eq('status', 'new')
            .limit(1)
          const hit = ((existing as WebsiteInquiry[]) || [])[0]
          if (hit) {
            const { error } = await db
              .from('website_inquiries')
              .update({ status: statusRaw === 'converted' ? 'converted' : 'closed' })
              .eq('id', hit.id)
            if (error) {
              skipped += 1
              continue
            }
            saved += 1
            continue
          }
        }

        const inquiry = buildWebsiteInquiry({ name, email, phone, vertical, message })
        if (statusRaw === 'closed' || statusRaw === 'converted') {
          inquiry.status = statusRaw === 'converted' ? 'converted' : 'closed'
        }
        const createdAt = String(row.created_at || '').trim()
        if (createdAt) inquiry.created_at = createdAt

        const { error } = await db.from('website_inquiries').insert(inquiry)
        if (error) {
          skipped += 1
          continue
        }
        if (inquiry.status === 'new') existingEmails.add(emailKey)
        saved += 1
      }

      if (!saved) {
        showToast('No website enquiry rows imported from CSV', 'error')
        return
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} website enquiry(ies)${skipNote}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Website enquiries CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  if (!loaded) return null

  return (
    <section
      style={{
        border: `1px solid ${colors.border}`,
        background: colors.card,
        borderRadius: 14,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 10, alignItems: 'center' }}>
        <strong>Website enquiries</strong>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: colors.muted2, fontSize: 12 }}>{rows.length} new</span>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importInquiriesCsv(file)
            }}
          />
          <button
            type="button"
            style={btnGhost}
            disabled={importing}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            style={btnGhost}
            disabled={importing || !rows.length}
            onClick={() => {
              exportListCsv(
                'website-enquiries.csv',
                ['name', 'email', 'phone', 'vertical', 'message', 'status', 'created_at'],
                rows.map((r) => ({
                  name: r.name,
                  email: r.email,
                  phone: r.phone,
                  vertical: verticalBrandForInquiry(r.vertical),
                  message: r.message,
                  status: r.status,
                  created_at: r.created_at,
                })),
              )
              showToast('Website enquiries CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
        </span>
      </div>
      {rows.length === 0 ? (
        <div style={{ color: colors.muted2, fontSize: 13 }}>No new website enquiries.</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map((row) => (
            <div
              key={row.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                alignItems: 'flex-start',
                borderTop: `1px solid ${colors.border}`,
                paddingTop: 10,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div>
                  {row.name} · {verticalBrandForInquiry(row.vertical)}
                </div>
                <div style={{ color: colors.muted, fontSize: 13 }}>
                  {row.email} {row.phone ? `· ${row.phone}` : ''}
                </div>
                <div style={{ color: colors.muted2, fontSize: 13, marginTop: 4 }}>{row.message}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  style={btnGhost}
                  disabled={busy === row.id || importing}
                  onClick={() => void dismiss(row)}
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  style={btnPrimary}
                  disabled={busy === row.id || importing}
                  onClick={() => void convert(row)}
                >
                  {busy === row.id ? 'Adding…' : 'Add to CRM'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
