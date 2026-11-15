import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { DraftingCompass } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import { engClaimLabel, engDocLabel } from '../lib/engFoundation'
import {
  createEngClaim,
  createEngDocument,
  listEngClaims,
  listEngDocuments,
  type EngClaim,
  type EngDocument,
} from '../lib/engFoundationStore'
import { exportListCsv } from '../lib/listIo'
import {
  buttonPrimaryStyle,
  cardStyle,
  colors,
  inputStyle,
  labelStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M12a engineering pack: document register + claims stubs. */
export default function EngFoundationPage() {
  const { showToast } = useToast()
  const [docs, setDocs] = useState<EngDocument[]>([])
  const [claims, setClaims] = useState<EngClaim[]>([])
  const [docNo, setDocNo] = useState('')
  const [docTitle, setDocTitle] = useState('')
  const [discipline, setDiscipline] = useState('')
  const [claimNo, setClaimNo] = useState('')
  const [claimTitle, setClaimTitle] = useState('')
  const [claimAmount, setClaimAmount] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [d, c] = await Promise.all([listEngDocuments(), listEngClaims()])
      setDocs(d)
      setClaims(c)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load engineering register'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function onDoc(e: FormEvent) {
    e.preventDefault()
    try {
      await createEngDocument({ docNo, title: docTitle, discipline })
      showToast('Document logged', 'success')
      setDocNo('')
      setDocTitle('')
      setDiscipline('')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not save document'), 'error')
    }
  }

  async function onClaim(e: FormEvent) {
    e.preventDefault()
    try {
      await createEngClaim({
        claimNo,
        title: claimTitle,
        amountAed: Number(claimAmount) || 0,
      })
      showToast('Claim logged', 'success')
      setClaimNo('')
      setClaimTitle('')
      setClaimAmount('')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not save claim'), 'error')
    }
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Engineering · M12a</p>
          <h1 className={docsStyles.title}>
            <DraftingCompass size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Document register
          </h1>
          <p className={docsStyles.subtitle}>
            Starter document register and claims log for the engineering pack. Not contractual advice.
          </p>
        </div>
        <button
          type="button"
          className={docsStyles.newBtn}
          style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
          disabled={!docs.length && !claims.length}
          onClick={() => {
            exportListCsv(
              'eng-register.csv',
              ['kind', 'number', 'title', 'status', 'amount_aed'],
              [
                ...docs.map((d) => ({
                  kind: 'document',
                  number: d.doc_no,
                  title: d.title,
                  status: d.status,
                  amount_aed: '',
                })),
                ...claims.map((c) => ({
                  kind: 'claim',
                  number: c.claim_no,
                  title: c.title,
                  status: c.status,
                  amount_aed: c.amount_aed,
                })),
              ],
            )
            showToast('Engineering CSV downloaded', 'success')
          }}
        >
          Export CSV
        </button>
      </header>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <form style={cardStyle} onSubmit={(e) => void onDoc(e)}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>New document</h2>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 2fr 1fr' }}>
              <label style={labelStyle}>
                Doc no
                <input style={inputStyle} value={docNo} onChange={(e) => setDocNo(e.target.value)} />
              </label>
              <label style={labelStyle}>
                Title
                <input style={inputStyle} value={docTitle} onChange={(e) => setDocTitle(e.target.value)} required />
              </label>
              <label style={labelStyle}>
                Discipline
                <input style={inputStyle} value={discipline} onChange={(e) => setDiscipline(e.target.value)} />
              </label>
            </div>
            <button type="submit" style={{ ...buttonPrimaryStyle, marginTop: 10 }}>
              Add document
            </button>
          </form>

          <form style={cardStyle} onSubmit={(e) => void onClaim(e)}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>New claim</h2>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 2fr 1fr' }}>
              <label style={labelStyle}>
                Claim no
                <input style={inputStyle} value={claimNo} onChange={(e) => setClaimNo(e.target.value)} />
              </label>
              <label style={labelStyle}>
                Title
                <input style={inputStyle} value={claimTitle} onChange={(e) => setClaimTitle(e.target.value)} required />
              </label>
              <label style={labelStyle}>
                Amount (AED)
                <input
                  style={inputStyle}
                  type="number"
                  min={0}
                  step="0.01"
                  value={claimAmount}
                  onChange={(e) => setClaimAmount(e.target.value)}
                />
              </label>
            </div>
            <button type="submit" style={{ ...buttonPrimaryStyle, marginTop: 10 }}>
              Add claim
            </button>
          </form>

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Documents</h2>
            {docs.length === 0 ? (
              <EmptyState title="No documents" subtitle="Add a register entry above." />
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                {docs.map((d) => (
                  <li key={d.id} style={{ fontSize: 13, borderTop: `1px solid ${colors.border}`, paddingTop: 6 }}>
                    {engDocLabel(d.doc_no, d.title)} · {d.status}
                    {d.discipline ? ` · ${d.discipline}` : ''} · rev {d.revision}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Claims</h2>
            {claims.length === 0 ? (
              <EmptyState title="No claims" subtitle="Log a claim above." />
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                {claims.map((c) => (
                  <li key={c.id} style={{ fontSize: 13, borderTop: `1px solid ${colors.border}`, paddingTop: 6 }}>
                    {engClaimLabel(c.claim_no, c.title, c.amount_aed)} · {c.status}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
