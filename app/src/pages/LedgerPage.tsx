import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import { journalBalance, type JournalLineInput } from '../lib/ledger/ledger'
import {
  createDraftJournal,
  listGlAccounts,
  listGlJournals,
  listJournalLines,
  postJournal,
  type GlAccount,
  type GlJournal,
  type GlJournalLine,
} from '../lib/ledger/ledgerStore'
import { exportListCsv } from '../lib/listIo'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  labelStyle,
  selectStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M7: chart of accounts + draft/post journals. */
export default function LedgerPage() {
  const { showToast } = useToast()
  const [accounts, setAccounts] = useState<GlAccount[]>([])
  const [journals, setJournals] = useState<GlJournal[]>([])
  const [selected, setSelected] = useState<GlJournal | null>(null)
  const [lines, setLines] = useState<GlJournalLine[]>([])
  const [memo, setMemo] = useState('')
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [draftLines, setDraftLines] = useState<JournalLineInput[]>([
    { accountId: '', debit: 0, credit: 0 },
    { accountId: '', debit: 0, credit: 0 },
  ])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [a, j] = await Promise.all([listGlAccounts(), listGlJournals()])
      setAccounts(a)
      setJournals(j)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load ledger'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function openJournal(j: GlJournal) {
    setSelected(j)
    try {
      setLines(await listJournalLines(j.id))
    } catch (e) {
      showToast(errorMessage(e, 'Could not load lines'), 'error')
    }
  }

  const bal = useMemo(() => journalBalance(draftLines), [draftLines])

  async function saveDraft() {
    try {
      const created = await createDraftJournal({ entryDate, memo, lines: draftLines })
      showToast(`Saved ${created.journal_number}`, 'success')
      setMemo('')
      setDraftLines([
        { accountId: '', debit: 0, credit: 0 },
        { accountId: '', debit: 0, credit: 0 },
      ])
      await load()
      await openJournal(created)
    } catch (e) {
      showToast(errorMessage(e, 'Could not save journal'), 'error')
    }
  }

  async function onPost(j: GlJournal) {
    try {
      const jl = await listJournalLines(j.id)
      await postJournal(
        j.id,
        jl.map((l) => ({ accountId: l.account_id, debit: Number(l.debit), credit: Number(l.credit) })),
      )
      showToast('Journal posted', 'success')
      await load()
      const refreshed = (await listGlJournals()).find((x) => x.id === j.id)
      if (refreshed) await openJournal(refreshed)
    } catch (e) {
      showToast(errorMessage(e, 'Could not post'), 'error')
    }
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Finance · M7</p>
          <h1 className={docsStyles.title}>
            <BookOpen size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Ledger
          </h1>
          <p className={docsStyles.subtitle}>
            Double-entry journals. Starter chart of accounts is Unverified for tax mapping — confirm with your
            accountant before filing.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!journals.length}
            onClick={() => {
              exportListCsv(
                'gl-journals.csv',
                ['journal_number', 'entry_date', 'memo', 'status', 'posted_at'],
                journals.map((j) => ({
                  journal_number: j.journal_number,
                  entry_date: j.entry_date,
                  memo: j.memo,
                  status: j.status,
                  posted_at: j.posted_at || '',
                })),
              )
              showToast('Journals CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!accounts.length}
            onClick={() => {
              exportListCsv(
                'gl-chart-of-accounts.csv',
                ['code', 'name', 'account_type', 'is_postable', 'is_active', 'notes'],
                accounts.map((a) => ({
                  code: a.code,
                  name: a.name,
                  account_type: a.account_type,
                  is_postable: a.is_postable,
                  is_active: a.is_active,
                  notes: a.notes || '',
                })),
              )
              showToast('Chart of accounts CSV downloaded', 'success')
            }}
          >
            Export CoA CSV
          </button>
        </div>
      </header>

      {loading ? (
        <p>Loading…</p>
      ) : accounts.length === 0 ? (
        <EmptyState
          title="Ledger tables not applied"
          subtitle="Apply the accounting ledger migration in the demo or staging project, then reload."
        />
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <section style={cardStyle}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>New journal</h2>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
              <label style={labelStyle}>
                Date
                <input style={inputStyle} type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
              </label>
              <label style={labelStyle}>
                Memo
                <input style={inputStyle} value={memo} onChange={(e) => setMemo(e.target.value)} />
              </label>
            </div>
            {draftLines.map((line, idx) => (
              <div key={idx} style={{ display: 'grid', gap: 8, gridTemplateColumns: '2fr 1fr 1fr', marginTop: 8 }}>
                <select
                  style={selectStyle}
                  value={line.accountId}
                  onChange={(e) => {
                    const next = [...draftLines]
                    next[idx] = { ...next[idx], accountId: e.target.value }
                    setDraftLines(next)
                  }}
                  aria-label={`Account line ${idx + 1}`}
                >
                  <option value="">Account…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
                <input
                  style={inputStyle}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Debit"
                  value={line.debit || ''}
                  onChange={(e) => {
                    const next = [...draftLines]
                    next[idx] = { ...next[idx], debit: Number(e.target.value), credit: 0 }
                    setDraftLines(next)
                  }}
                />
                <input
                  style={inputStyle}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Credit"
                  value={line.credit || ''}
                  onChange={(e) => {
                    const next = [...draftLines]
                    next[idx] = { ...next[idx], credit: Number(e.target.value), debit: 0 }
                    setDraftLines(next)
                  }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                style={buttonSecondaryStyle}
                onClick={() => setDraftLines([...draftLines, { accountId: '', debit: 0, credit: 0 }])}
              >
                Add line
              </button>
              <span style={{ color: bal.balanced ? colors.success : colors.muted, fontSize: 13 }}>
                Debits {bal.debitTotal.toFixed(2)} · Credits {bal.creditTotal.toFixed(2)}
                {bal.balanced ? ' · balanced' : ' · not balanced'}
              </span>
              <button type="button" style={buttonPrimaryStyle} disabled={!bal.balanced} onClick={() => void saveDraft()}>
                Save draft
              </button>
            </div>
          </section>

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Journals</h2>
            {journals.length === 0 ? (
              <p style={{ color: colors.muted }}>No journals yet.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                {journals.map((j) => (
                  <li key={j.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button type="button" style={buttonSecondaryStyle} onClick={() => void openJournal(j)}>
                      {j.journal_number || j.id.slice(0, 8)} · {j.entry_date} · {j.status}
                    </button>
                    {j.status === 'draft' ? (
                      <button type="button" style={buttonPrimaryStyle} onClick={() => void onPost(j)}>
                        Post
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {selected ? (
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                  }}
                >
                  <h3 style={{ fontSize: 14, margin: 0 }}>
                    {selected.journal_number} — {selected.memo || 'No memo'}
                  </h3>
                  <button
                    type="button"
                    style={buttonSecondaryStyle}
                    disabled={!lines.length}
                    onClick={() => {
                      exportListCsv(
                        `gl-journal-lines-${selected.journal_number || selected.id.slice(0, 8)}.csv`,
                        [
                          'journal_number',
                          'line_no',
                          'account_code',
                          'account_name',
                          'memo',
                          'debit',
                          'credit',
                        ],
                        lines.map((l) => ({
                          journal_number: selected.journal_number,
                          line_no: l.line_no,
                          account_code: l.gl_accounts?.code || '',
                          account_name: l.gl_accounts?.name || '',
                          memo: l.memo || '',
                          debit: Number(l.debit),
                          credit: Number(l.credit),
                        })),
                      )
                      showToast('Journal lines CSV downloaded', 'success')
                    }}
                  >
                    Export lines CSV
                  </button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th align="left">Account</th>
                      <th align="right">Debit</th>
                      <th align="right">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id}>
                        <td>
                          {l.gl_accounts?.code} {l.gl_accounts?.name}
                        </td>
                        <td align="right">{Number(l.debit).toFixed(2)}</td>
                        <td align="right">{Number(l.credit).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Chart of accounts</h2>
            <ul style={{ margin: 0, paddingLeft: 18, columns: 13, color: colors.muted }}>
              {accounts.map((a) => (
                <li key={a.id}>
                  {a.code} · {a.name} ({a.account_type})
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  )
}
