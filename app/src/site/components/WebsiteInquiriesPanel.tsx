import { useCallback, useEffect, useState } from 'react'
import { db } from '../../lib/db'
import { buildCrmLeadFromInquiry } from '../../lib/websiteLeads'
import type { WebsiteInquiry } from '../../lib/types'
import { verticalBrandForInquiry } from '../../lib/websiteLeads'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { btnGhost, btnPrimary, colors } from '../../lib/pageStyles'
import { resolveSalesOwnerName } from '../../lib/crmWorkQueue'

export default function WebsiteInquiriesPanel({
  onConverted,
}: {
  onConverted?: (crmId?: string) => void
}) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [rows, setRows] = useState<WebsiteInquiry[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [ownerName, setOwnerName] = useState('')

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
      showToast(err instanceof Error ? err.message : 'Could not convert enquiry', 'error')
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
      showToast(err instanceof Error ? err.message : 'Could not dismiss enquiry', 'error')
    } finally {
      setBusy(null)
    }
  }

  if (!rows.length) return null

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
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <strong>Website enquiries</strong>
        <span style={{ color: colors.muted2, fontSize: 12 }}>{rows.length} new</span>
      </div>
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
                disabled={busy === row.id}
                onClick={() => void dismiss(row)}
              >
                Dismiss
              </button>
              <button
                type="button"
                style={btnPrimary}
                disabled={busy === row.id}
                onClick={() => void convert(row)}
              >
                {busy === row.id ? 'Adding…' : 'Add to CRM'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
