import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Users } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { findCrmForAccount, linkCrmToAccount } from '../../lib/crmAccountLink'
import { db } from '../../lib/db'
import { errorMessage } from '../../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import type { Account, CrmEntry } from '../../lib/types'
import {
  buttonSecondaryStyle,
  cardStyle,
  colors,
  sectionTitleStyle,
} from '../../lib/uiStyles'

const EXPORT_COLUMNS = [
  'company_name',
  'pipeline_stage',
  'owner',
  'follow_up_date',
  'next_action',
  'notes',
] as const

function followUpLabel(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    return format(parseISO(String(raw).slice(0, 10)), 'd MMM yyyy')
  } catch {
    return raw
  }
}

/**
 * On an Account, show the matching CRM (My Day) company when names align.
 */
export default function AccountCrmCard({ account }: { account: Account }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [crm, setCrm] = useState<CrmEntry | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setCrm(undefined)
    setError('')
    try {
      setCrm(await findCrmForAccount(account))
    } catch (e) {
      setCrm(null)
      setError(errorMessage(e, 'Could not load CRM company'))
    }
  }, [account])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setCrm(undefined)
      setError('')
      try {
        const row = await findCrmForAccount(account)
        if (!cancelled) setCrm(row)
      } catch (e) {
        if (!cancelled) {
          setCrm(null)
          setError(errorMessage(e, 'Could not load CRM company'))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [account.id, account.name])

  async function importCrmCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, rows)
      if (!objects.length) {
        showToast('No CRM rows in CSV', 'error')
        return
      }
      const row = objects[0]
      const who = user?.email || ''
      const now = new Date().toISOString()
      const companyName = String(row.company_name || '').trim() || account.name
      const pipelineStage = String(row.pipeline_stage || '').trim() || 'Lead'
      const owner = String(row.owner || '').trim()
      const followRaw = String(row.follow_up_date || '').trim()
      const followUpDate = followRaw ? followRaw.slice(0, 10) : null
      const nextAction = String(row.next_action || '').trim()
      const notes = String(row.notes || '').trim()

      const existing = crm ?? (await findCrmForAccount(account))
      if (existing) {
        const { error: updErr } = await db
          .from('crm')
          .update({
            company_name: companyName,
            pipeline_stage: pipelineStage,
            owner,
            follow_up_date: followUpDate,
            next_action: nextAction,
            notes,
            updated_by: who,
            updated_at: now,
          })
          .eq('id', existing.id)
        if (updErr) throw updErr
        if (!existing.account_id) {
          try {
            await linkCrmToAccount(existing.id, account.id)
          } catch {
            // Linking is best-effort; the CRM update already succeeded.
          }
        }
        showToast('CRM deal imported', 'success')
      } else {
        const newId = crypto.randomUUID()
        const { error: insErr } = await db.from('crm').insert({
          id: newId,
          account_id: account.id,
          company_name: companyName,
          pipeline_stage: pipelineStage,
          owner,
          follow_up_date: followUpDate,
          next_action: nextAction,
          notes,
          primary_contact: '',
          email_phone: '',
          mobile_number: '',
          office_number: '',
          company_owner: '',
          address: '',
          website: '',
          trn: '',
          quote_ref: '',
          outcome_reason: '',
          calendar_event_id: '',
          created_by: who,
          updated_by: who,
          created_at: now,
          updated_at: now,
        })
        if (insErr) throw insErr
        showToast('CRM deal created from CSV', 'success')
      }
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'CRM CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const importControl = (
    <>
      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void importCrmCsv(file)
        }}
      />
      <button
        type="button"
        style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }}
        disabled={importing}
        onClick={() => importInputRef.current?.click()}
      >
        {importing ? 'Importing…' : 'Import CSV'}
      </button>
    </>
  )

  if (crm === undefined) {
    return (
      <section style={{ ...cardStyle, marginTop: 16 }} aria-label="CRM deal">
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>CRM deal</h2>
        <p style={{ color: colors.muted, fontSize: 13, margin: '10px 0 0' }}>Looking for a CRM company…</p>
      </section>
    )
  }

  if (!crm) {
    return (
      <section style={{ ...cardStyle, marginTop: 16 }} aria-label="CRM deal">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ ...sectionTitleStyle, margin: 0 }}>CRM deal</h2>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {importControl}
            <Link to={`/crm`} style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12, textDecoration: 'none' }}>
              <Users size={14} /> Open CRM
            </Link>
          </div>
        </div>
        <p style={{ color: colors.muted, fontSize: 13, margin: '10px 0 0' }}>
          {error || 'No CRM company matches this account yet. Add one in CRM (My Day) with the same company name.'}
        </p>
      </section>
    )
  }

  const follow = followUpLabel(crm.follow_up_date)

  return (
    <section style={{ ...cardStyle, marginTop: 16 }} aria-label="CRM deal">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>CRM deal</h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {importControl}
          <button
            type="button"
            style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }}
            onClick={() => {
              exportListCsv(
                `account-crm-${account.id.slice(0, 8)}.csv`,
                [...EXPORT_COLUMNS],
                [
                  {
                    company_name: crm.company_name || account.name,
                    pipeline_stage: crm.pipeline_stage || '',
                    owner: crm.owner || '',
                    follow_up_date: crm.follow_up_date || '',
                    next_action: crm.next_action || '',
                    notes: crm.notes || '',
                  },
                ],
              )
              showToast('CRM deal CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
          <Link
            to={`/crm?edit=${encodeURIComponent(crm.id)}`}
            style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12, textDecoration: 'none' }}
          >
            <Users size={14} /> Open in CRM
          </Link>
        </div>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 13, color: colors.text }}>
        {[crm.pipeline_stage || 'Lead', crm.owner?.trim() || 'Unassigned', follow ? `Follow-up ${follow}` : null, crm.next_action?.trim() || null]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {crm.notes?.trim() ? (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: colors.muted, whiteSpace: 'pre-wrap' }}>{crm.notes.trim()}</p>
      ) : null}
    </section>
  )
}
