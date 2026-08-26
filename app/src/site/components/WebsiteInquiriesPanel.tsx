import { useCallback, useEffect, useState } from 'react'
import { db } from '../../lib/db'
import { buildCrmLeadFromInquiry } from '../../lib/websiteLeads'
import type { WebsiteInquiry } from '../../lib/types'
import { verticalBrandForInquiry } from '../../lib/websiteLeads'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { btn, btnPrimary, colors } from '../../lib/pageStyles'

export default function WebsiteInquiriesPanel({ onConverted }: { onConverted?: () => void }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [rows, setRows] = useState<WebsiteInquiry[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { data, error } = await db.from('website_inquiries').select('*').order('created_at', { ascending: false })
      if (error) {
        setRows([])
        return
      }
      setRows(((data as WebsiteInquiry[]) || []).filter((r) => r.status === 'new'))
    } catch {
      setRows([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function convert(row: WebsiteInquiry) {
    setBusy(row.id)
    try {
      const lead = buildCrmLeadFromInquiry(row)
      lead.created_by = user?.email || 'website'
      lead.updated_by = user?.email || 'website'
      const { error } = await db.from('crm').insert(lead)
      if (error) throw error
      await db.from('website_inquiries').update({ status: 'converted', crm_id: lead.id }).eq('id', row.id)
      showToast('Website enquiry added to CRM', 'success')
      onConverted?.()
      await load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not convert enquiry', 'error')
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
            }}
          >
            <div>
              <div>
                {row.name} · {verticalBrandForInquiry(row.vertical)}
              </div>
              <div style={{ color: colors.muted, fontSize: 13 }}>
                {row.email} {row.phone ? `· ${row.phone}` : ''}
              </div>
              <div style={{ color: colors.muted2, fontSize: 13, marginTop: 4 }}>{row.message}</div>
            </div>
            <button
              type="button"
              style={btnPrimary}
              disabled={busy === row.id}
              onClick={() => void convert(row)}
            >
              {busy === row.id ? 'Adding…' : 'Add to CRM'}
            </button>
          </div>
        ))}
      </div>
      <button type="button" style={{ ...btn, marginTop: 12 }} onClick={() => void load()}>
        Refresh
      </button>
    </section>
  )
}
