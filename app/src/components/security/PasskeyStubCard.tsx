import { useCallback, useEffect, useRef, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import { passkeyStubStatus, passkeysSupported } from '../../lib/mfa/passkeyStub'
import { enrollPasskeyStub, listPasskeyStubs, type PasskeyStubRow } from '../../lib/passkeyStubStore'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

const EXPORT_COLUMNS = ['nickname', 'user_email', 'created_at'] as const

function nickKey(nickname: string): string {
  return nickname.trim().toLowerCase()
}

function emailKey(email: string): string {
  return email.trim().toLowerCase()
}

/** M13: passkey readiness stub — enroll nickname only; TOTP remains primary. */
export default function PasskeyStubCard() {
  const { user, isLocalMode } = useAuth()
  const { showToast } = useToast()
  const supported = passkeysSupported()
  const email = String(user?.email || '')
  const [enrolledCount, setEnrolledCount] = useState(0)
  const [stubs, setStubs] = useState<PasskeyStubRow[]>([])
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    if (isLocalMode || !email) {
      setEnrolledCount(0)
      setStubs([])
      return
    }
    try {
      const rows = await listPasskeyStubs(email)
      setStubs(rows)
      setEnrolledCount(rows.length)
    } catch {
      setEnrolledCount(0)
      setStubs([])
    }
  }, [email, isLocalMode])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const status = passkeyStubStatus({ supported, enrolledCount })

  async function enroll() {
    if (!email || isLocalMode) return
    setBusy(true)
    try {
      await enrollPasskeyStub({ userEmail: email, nickname: `Passkey ${enrolledCount + 1}` })
      showToast('Passkey stub nickname saved (no live WebAuthn yet)', 'success')
      await refresh()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save passkey stub'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function importStubsCsv(file: File) {
    if (isLocalMode || !email) return
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const existing = new Set(stubs.map((s) => nickKey(s.nickname)))
      let saved = 0
      let skipped = 0
      for (const row of objects) {
        const nickname = String(row.nickname || '').trim()
        const rowEmail = String(row.user_email || '').trim()
        if (!nickname) {
          skipped += 1
          continue
        }
        if (rowEmail && emailKey(rowEmail) !== emailKey(email)) {
          skipped += 1
          continue
        }
        if (existing.has(nickKey(nickname))) {
          skipped += 1
          continue
        }
        await enrollPasskeyStub({ userEmail: email, nickname })
        existing.add(nickKey(nickname))
        saved += 1
      }
      if (!saved && skipped) {
        showToast('No matching passkey stub rows in CSV', 'error')
        return
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} passkey stub(s)${skipNote}`, 'success')
      await refresh()
    } catch (e) {
      showToast(errorMessage(e, 'Passkey stubs CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'start' }}>
        <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <KeyRound size={18} /> Passkeys (stub)
        </h2>
        {!isLocalMode ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void importStubsCsv(file)
              }}
            />
            <button
              type="button"
              style={buttonSecondaryStyle}
              disabled={importing || !email}
              onClick={() => importInputRef.current?.click()}
            >
              {importing ? 'Importing…' : 'Import CSV'}
            </button>
            {stubs.length > 0 ? (
              <button
                type="button"
                style={buttonSecondaryStyle}
                onClick={() => {
                  exportListCsv(
                    'passkey-stubs.csv',
                    [...EXPORT_COLUMNS],
                    stubs.map((s) => ({
                      nickname: s.nickname,
                      user_email: s.user_email,
                      created_at: s.created_at,
                    })),
                  )
                  showToast('Passkey stubs CSV downloaded', 'success')
                }}
              >
                Export CSV
              </button>
            ) : null}
          </div>
        ) : stubs.length > 0 ? (
          <button
            type="button"
            style={buttonSecondaryStyle}
            onClick={() => {
              exportListCsv(
                'passkey-stubs.csv',
                [...EXPORT_COLUMNS],
                stubs.map((s) => ({
                  nickname: s.nickname,
                  user_email: s.user_email,
                  created_at: s.created_at,
                })),
              )
              showToast('Passkey stubs CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
        ) : null}
      </div>
      <p style={{ color: colors.muted, fontSize: 13, marginTop: 12, lineHeight: 1.5 }}>
        {status.label}. Authenticator app (TOTP) remains the supported second factor for admin/manager.
      </p>
      {!isLocalMode && supported ? (
        <button type="button" style={buttonSecondaryStyle} disabled={busy || !email} onClick={() => void enroll()}>
          {busy ? 'Saving…' : 'Enroll stub nickname'}
        </button>
      ) : null}
      {stubs.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', fontSize: 13 }}>
          {stubs.map((s) => (
            <li
              key={s.id}
              style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--border)' }}
            >
              <span>{s.nickname}</span>
              <span style={{ color: colors.muted2 }}>{s.created_at ? new Date(s.created_at).toLocaleString() : ''}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
