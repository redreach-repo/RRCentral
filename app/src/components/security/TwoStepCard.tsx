import { useEffect, useRef, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useI18n } from '../../contexts/I18nContext'
import { useToast } from '../../contexts/ToastContext'
import { can } from '../../lib/permissions'
import { errorMessage } from '../../lib/errors'
import { TWO_STEP_ROLES, removeAuthenticator, teamTwoStep, type TeamTwoStep } from '../../lib/twoStep'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'
import type { UserRole } from '../../lib/types'

const EXPORT_COLUMNS = ['email', 'role', 'has_two_step'] as const

function parseYesNo(raw: string): boolean {
  const v = raw.trim().toLowerCase()
  return v === 'yes' || v === 'true' || v === '1' || v === 'y'
}

function emailKey(email: string): string {
  return email.trim().toLowerCase()
}

/** Settings card: your own two step sign in, and for admins who on the team has it. */
export default function TwoStepCard() {
  const { userRole, isLocalMode } = useAuth()
  const { t } = useI18n()
  const { showToast } = useToast()
  const [team, setTeam] = useState<TeamTwoStep[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [csvFiltered, setCsvFiltered] = useState(false)
  const [importedRows, setImportedRows] = useState<TeamTwoStep[] | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const required = TWO_STEP_ROLES.includes(userRole)
  const isAdmin = can(userRole, 'users.manage')

  useEffect(() => {
    if (!isAdmin || isLocalMode) return
    teamTwoStep()
      .then((rows) => {
        setTeam(rows)
        setCsvFiltered(false)
        setImportedRows(null)
      })
      .catch(() => setTeam(null))
  }, [isAdmin, isLocalMode])

  if (isLocalMode) return null

  const liveEligible = (team || []).filter((row) => row.active && TWO_STEP_ROLES.includes(row.role as UserRole))
  const shown = csvFiltered && importedRows ? importedRows : liveEligible

  async function reset() {
    if (!window.confirm('Remove your authenticator? You will set up a new one the next time you sign in.')) return
    setBusy(true)
    try {
      await removeAuthenticator()
      showToast('Authenticator removed. Sign out and in again to set up the new one.', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Could not remove the authenticator'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function importTeamCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const byEmail = new Map(liveEligible.map((row) => [emailKey(row.email), row] as const))
      const next: TeamTwoStep[] = []
      const seen = new Set<string>()
      let matched = 0
      let softLoaded = 0
      let skipped = 0

      for (const row of objects) {
        const email = String(row.email || '').trim()
        if (!email) {
          skipped += 1
          continue
        }
        const key = emailKey(email)
        if (seen.has(key)) {
          skipped += 1
          continue
        }
        seen.add(key)
        const existing = byEmail.get(key)
        if (existing) {
          next.push(existing)
          matched += 1
          continue
        }
        next.push({
          email,
          role: String(row.role || '').trim() || '—',
          active: true,
          has_two_step: parseYesNo(String(row.has_two_step ?? '')),
        })
        softLoaded += 1
      }

      if (!next.length) {
        showToast('No matching two-step rows in CSV', 'error')
        return
      }
      setImportedRows(next)
      setCsvFiltered(true)
      const parts = [matched ? `${matched} matched` : '', softLoaded ? `${softLoaded} soft-loaded` : '']
        .filter(Boolean)
        .join(', ')
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${next.length} two-step row(s) (${parts})${skipNote}`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Two-step CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'start' }}>
        <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <ShieldCheck size={18} /> {t('page.settings.section.twoStep')}
        </h2>
        {team ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void importTeamCsv(file)
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
                const rows = shown
                exportListCsv(
                  'team-two-step.csv',
                  [...EXPORT_COLUMNS],
                  rows.map((row) => ({
                    email: row.email,
                    role: row.role,
                    has_two_step: row.has_two_step ? 'yes' : 'no',
                  })),
                )
                showToast('Two-step CSV downloaded', 'success')
              }}
            >
              Export CSV
            </button>
            {csvFiltered ? (
              <button
                type="button"
                style={buttonSecondaryStyle}
                onClick={() => {
                  setCsvFiltered(false)
                  setImportedRows(null)
                }}
              >
                Clear CSV filter
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <p style={{ color: colors.muted, fontSize: 13, marginTop: 12, lineHeight: 1.5 }}>
        {required
          ? 'Your role needs a code from an authenticator app at each sign in. New phone? Remove the old authenticator here, then sign in again to set up the new one.'
          : 'Required for admins and managers. Your role signs in with a password only.'}
      </p>
      {csvFiltered ? (
        <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 8px', lineHeight: 1.45 }}>
          Showing {shown.length} team row{shown.length === 1 ? '' : 's'} from CSV (session only — Clear CSV filter
          resets).
        </p>
      ) : null}
      {required ? (
        <button type="button" style={buttonSecondaryStyle} disabled={busy} onClick={() => void reset()}>
          Remove my authenticator
        </button>
      ) : null}
      {team ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', fontSize: 13 }}>
          {shown.map((row) => (
            <li
              key={row.email}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '6px 0',
                borderTop: '1px solid var(--border)',
              }}
            >
              <span>
                {row.email} <span style={{ color: colors.muted2 }}>({row.role})</span>
              </span>
              <span style={{ color: row.has_two_step ? colors.success : colors.warn }}>
                {row.has_two_step ? 'Set up' : 'Not yet'}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
