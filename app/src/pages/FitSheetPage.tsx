import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, Download } from 'lucide-react'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { getAccount, listContacts } from '../lib/accountsStore'
import { resolveLogoUrl } from '../lib/brand'
import { downloadBlob, elementToPdfBlob } from '../lib/documents'
import { errorMessage } from '../lib/errors'
import { CTRM_NEXT_PUBLIC, fitSheetRows } from '../lib/fitSheet'
import { loadFitSheet } from '../lib/fitSheetStore'
import type { Account, AccountContact, CtrmFitSheet } from '../lib/types'
import styles from './DocumentPage.module.css'

const bar = { appearance: 'none' as const, border: 0, borderRadius: 8, padding: '8px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }

/**
 * The prospect fit sheet as one page on the letterhead, to download as a PDF.
 * Only the fit sheet: no commission, no deal value.
 */
export default function FitSheetPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { settings } = useSettings()
  const { showToast } = useToast()
  const sheetRef = useRef<HTMLDivElement>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [sheet, setSheet] = useState<CtrmFitSheet | null>(null)
  const [contacts, setContacts] = useState<AccountContact[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([getAccount(id), loadFitSheet(id), listContacts(id)])
      .then(([a, s, c]) => {
        if (!a) setError('Account not found')
        else if (!s) setError('This account has no fit sheet yet')
        setAccount(a)
        setSheet(s)
        setContacts(c)
      })
      .catch((e) => setError(errorMessage(e, 'Could not load the fit sheet')))
  }, [id])

  async function download() {
    if (!sheetRef.current || !account) return
    setBusy(true)
    try {
      const { blob, filename } = await elementToPdfBlob(sheetRef.current, { filenameHint: `Fit sheet ${account.name}` })
      downloadBlob(blob, filename)
    } catch (e) {
      showToast(errorMessage(e, 'Could not make the PDF'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const dm = contacts.find((c) => c.id === sheet?.decision_maker_id)
  return (
    <div style={{ minHeight: '100vh', background: '#f0f0f0', color: '#111' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px', background: '#111' }}>
        <Link to={`/accounts/${id}`} style={{ ...bar, background: '#333', color: '#fff', textDecoration: 'none' }}>
          <ArrowLeft size={16} /> Back
        </Link>
        {sheet ? (
          <button type="button" style={{ ...bar, background: '#e85d04', color: '#fff' }} disabled={busy} onClick={() => void download()}>
            <Download size={16} /> {busy ? 'Making PDF…' : 'Download PDF'}
          </button>
        ) : null}
      </div>
      {error ? <p style={{ color: '#b91c1c', padding: 24 }}>{error}</p> : null}
      {account && sheet ? (
        <div className={styles.preview}>
          <div ref={sheetRef} className={styles.frame} data-pdf-root>
            <div className={styles.sheet}>
              <div className={styles.top}>
                <div>
                  <img src={resolveLogoUrl(settings.logoUrl)} alt={settings.brand || 'RED REACH'} className={styles.logo} />
                  <div className={styles.company}>
                    <div style={{ fontWeight: 700, color: '#111' }}>{settings.companyName || 'Red Reach Middle East FZE'}</div>
                    {settings.address}
                    <br />
                    {settings.email}
                    {settings.phone ? ` · ${settings.phone}` : ''}
                  </div>
                </div>
                <div className={styles.docMeta}>
                  <div className={styles.docLabel}>CTRM Next fit sheet</div>
                  <h1>{account.name}</h1>
                  <div className={styles.metaGrid}>
                    <div>
                      <span>Updated: </span>
                      {format(new Date(sheet.updated_at), 'dd MMM yyyy')}
                    </div>
                  </div>
                </div>
              </div>
              <p style={{ fontSize: 13, color: '#555', margin: '16px 0' }}>{CTRM_NEXT_PUBLIC}</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <tbody>
                  {fitSheetRows(sheet, dm ? [dm.name, dm.role].filter(Boolean).join(', ') : '').map((r) => (
                    <tr key={r.label} style={{ borderBottom: '1px solid #eee' }}>
                      <th style={{ textAlign: 'left', verticalAlign: 'top', padding: '10px 12px 10px 0', width: '34%', color: '#555', fontWeight: 600 }}>{r.label}</th>
                      <td style={{ padding: '10px 0', whiteSpace: 'pre-wrap' }}>{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.footerBar} data-pdf-footer>
              {settings.tagline || 'Multi-division commerce · UAE'}
              {settings.website ? ` · ${settings.website}` : ''}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
