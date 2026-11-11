import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAskRr } from '../contexts/AskRrContext'
import { useAuth } from '../contexts/AuthContext'
import { db } from '../lib/db'
import type { AppUser, CrmEntry } from '../lib/types'
import CrmAskPanel from './CrmAskPanel'

/** Sales CRM surfaces where Ask RR should be available. */
export const ASK_RR_PATH_PREFIXES = [
  '/crm',
  '/follow-ups',
  '/quotations',
  '/invoices',
  '/delivery-notes',
  '/customer-files',
  '/quick-add',
] as const

export function isAskRrPath(pathname: string): boolean {
  return ASK_RR_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** Loads CRM snapshot and shows Ask RR on Sales CRM routes. */
export default function CrmAskHost() {
  const { pathname } = useLocation()
  const { open, setOpen } = useAskRr()
  const { user } = useAuth()
  const [entries, setEntries] = useState<CrmEntry[]>([])
  const [owners, setOwners] = useState<AppUser[]>([])

  useEffect(() => {
    if (!user || !isAskRrPath(pathname)) return
    let cancelled = false
    void (async () => {
      try {
        const [crmRes, usersRes] = await Promise.all([
          db.from('crm').select('*').order('updated_at', { ascending: false }).limit(400),
          db.from('app_users').select('*').eq('active', true).order('name'),
        ])
        if (cancelled) return
        if (!crmRes.error) {
          setEntries(
            ((crmRes.data || []) as CrmEntry[]).map((row) => ({
              ...row,
              pipeline_stage: row.pipeline_stage || 'Lead',
            })),
          )
        }
        if (!usersRes.error) setOwners((usersRes.data || []) as AppUser[])
      } catch {
        // Panel still mounts; ask will explain missing facts
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, pathname])

  if (!isAskRrPath(pathname)) return null

  return (
    <CrmAskPanel
      entries={entries}
      owners={owners}
      open={open}
      onOpenChange={setOpen}
    />
  )
}
