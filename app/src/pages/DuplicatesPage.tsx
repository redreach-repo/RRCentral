import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { accountFills, findAccountDuplicates, findContactDuplicates, mergeSummary, suggestKeep, type DuplicateKind, type DuplicatePair } from '../lib/duplicates'
import { accountWeights, dismissPair, loadDuplicateData, mergePair, type DuplicateData } from '../lib/duplicatesStore'
import { errorMessage } from '../lib/errors'
import { roleAtLeast } from '../lib/permissions'
import type { Account, AccountContact } from '../lib/types'
import { buttonDangerStyle, buttonSecondaryStyle, cardStyle, colors, pageStyle, pageSubtitleStyle, pageTitleStyle } from '../lib/uiStyles'

const smallBtn = { ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 13 }
const muted = { color: colors.muted, fontSize: 13 }
const tab = (on: boolean) => ({ ...smallBtn, borderColor: on ? colors.accent : colors.border, color: on ? colors.text : colors.muted })
const nice = (t: string) => t.replace(/_/g, ' ')

/**
 * Duplicates: accounts and contacts that look like the same one. Pick the one
 * to keep and merge; everything on the other one (timeline included) moves
 * over. Or mark the pair "Not a duplicate" so it stops showing.
 */
export default function DuplicatesPage() {
  const { userRole, user } = useAuth()
  const { showToast } = useToast()
  const [data, setData] = useState<DuplicateData | null>(null)
  const [kind, setKind] = useState<DuplicateKind>('account')
  const [open, setOpen] = useState<DuplicatePair | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await loadDuplicateData())
    } catch (e) {
      showToast(errorMessage(e, 'Could not load accounts'), 'error')
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const pairs = useMemo(() => {
    if (!data) return { account: [], contact: [] }
    return {
      account: findAccountDuplicates(data.accounts, data.contacts, data.dismissed, data.countryCode),
      contact: findContactDuplicates(data.contacts, data.dismissed, data.countryCode),
    }
  }, [data])

  if (!roleAtLeast(userRole, 'manager')) {
    return (
      <div style={pageStyle}>
        <h1 style={pageTitleStyle}>Duplicates</h1>
        <p style={muted}>Only managers and admins can merge duplicates.</p>
      </div>
    )
  }

  const accounts = new Map((data?.accounts || []).map((a) => [a.id, a]))
  const contacts = new Map((data?.contacts || []).map((c) => [c.id, c]))
  const list = pairs[kind]

  async function notDuplicate(p: DuplicatePair) {
    try {
      await dismissPair(p.kind, p.a, p.b, user?.email || '')
      showToast('Marked as not a duplicate', 'success')
      setOpen(null)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save that'), 'error')
    }
  }

  const label = (p: DuplicatePair, id: string) => {
    if (p.kind === 'account') return accounts.get(id)?.name || 'Account'
    const c = contacts.get(id)
    return c ? `${c.name || 'Contact'} (${accounts.get(c.account_id)?.name || 'account'})` : 'Contact'
  }

  return (
    <div style={pageStyle}>
      <h1 style={pageTitleStyle}>Duplicates</h1>
      <p style={pageSubtitleStyle}>
        Accounts and contacts that share a phone, an email, a website or a very similar name. Merging moves everything on the
        duplicate (timeline, contacts, tickets, quotes, invoices, deals) to the one you keep, then removes the duplicate.
      </p>
      <div style={{ display: 'flex', gap: 8, margin: '12px 0 16px' }}>
        <button type="button" style={tab(kind === 'account')} onClick={() => (setKind('account'), setOpen(null))}>
          Accounts ({pairs.account.length})
        </button>
        <button type="button" style={tab(kind === 'contact')} onClick={() => (setKind('contact'), setOpen(null))}>
          Contacts ({pairs.contact.length})
        </button>
      </div>

      {!data ? <p style={muted}>Looking for duplicates…</p> : null}
      {data && !list.length ? <p style={muted}>No possible duplicates found.</p> : null}

      <div style={{ display: 'grid', gap: 10 }}>
        {list.map((p) => {
          const isOpen = open && open.a === p.a && open.b === p.b
          return (
            <section key={`${p.a}-${p.b}`} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <strong>{label(p, p.a)}</strong> and <strong>{label(p, p.b)}</strong>
                  <div style={muted}>{p.reasons.join(', ')}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" style={smallBtn} onClick={() => setOpen(isOpen ? null : p)}>
                    {isOpen ? 'Close' : 'Review'}
                  </button>
                  <button type="button" style={smallBtn} onClick={() => void notDuplicate(p)}>
                    Not a duplicate
                  </button>
                </div>
              </div>
              {isOpen && data ? (
                p.kind === 'account' ? (
                  <AccountMerge pair={p} a={accounts.get(p.a)} b={accounts.get(p.b)} data={data} onDone={load} />
                ) : (
                  <ContactMerge pair={p} a={contacts.get(p.a)} b={contacts.get(p.b)} accounts={accounts} onDone={load} />
                )
              ) : null}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function useMerge(kind: DuplicateKind, onDone: () => Promise<void>) {
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  async function merge(keep: string, dup: string, dupName: string) {
    if (!window.confirm(`Merge "${dupName}" into the one you keep? This cannot be undone.`)) return
    setBusy(true)
    try {
      const r = await mergePair(kind, keep, dup)
      showToast(mergeSummary(r), 'success')
      await onDone()
    } catch (e) {
      showToast(errorMessage(e, 'Could not merge'), 'error')
    } finally {
      setBusy(false)
    }
  }
  return { busy, merge }
}

function AccountMerge({ pair, a, b, data, onDone }: { pair: DuplicatePair; a?: Account; b?: Account; data: DuplicateData; onDone: () => Promise<void> }) {
  const [weights, setWeights] = useState<Record<string, Record<string, number>> | null>(null)
  const [keepId, setKeepId] = useState<string | null>(null)
  const { busy, merge } = useMerge('account', onDone)

  useEffect(() => {
    accountWeights([pair.a, pair.b])
      .then(setWeights)
      .catch(() => setWeights({}))
  }, [pair.a, pair.b])

  if (!a || !b) return <p style={muted}>One of these accounts is gone. Refresh the page.</p>
  const total = (id: string) => Object.values(weights?.[id] ?? {}).reduce((s, n) => s + n, 0)
  const keep = keepId ? (keepId === a.id ? a : b) : weights ? suggestKeep(a, b, (x) => total(x.id)) : a
  const dup = keep.id === a.id ? b : a
  const fills = accountFills(keep, dup)
  const contactsOf = (id: string) => data.contacts.filter((c) => c.account_id === id).length

  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {[a, b].map((x) => (
          <label key={x.id} style={{ ...cardStyle, cursor: 'pointer', borderColor: keep.id === x.id ? colors.accent : colors.border }}>
            <input type="radio" name={`keep-${pair.a}`} checked={keep.id === x.id} onChange={() => setKeepId(x.id)} /> Keep this one
            <div style={{ marginTop: 6 }}>
              <Link to={`/accounts/${x.id}`}>{x.name}</Link> <span style={muted}>{x.reference}</span>
            </div>
            <div style={muted}>
              {x.type}
              {x.city ? `, ${x.city}` : ''}
              {x.website ? `, ${x.website}` : ''}
            </div>
            <div style={muted}>Added {x.created_at.slice(0, 10)}</div>
            <div style={{ ...muted, marginTop: 6 }}>
              {weights
                ? Object.entries(weights[x.id] ?? {})
                    .map(([t, n]) => `${n} ${nice(t)}`)
                    .join(', ') || `${contactsOf(x.id)} contacts, nothing else yet`
                : 'Counting…'}
            </div>
          </label>
        ))}
      </div>
      <p style={{ fontSize: 14, marginBottom: 6 }}>
        Everything on <strong>{dup.name}</strong> moves to <strong>{keep.name}</strong>, and a line goes on its timeline.
      </p>
      {fills.length ? <p style={muted}>Blank details filled from the duplicate: {fills.map((f) => `${f.field} (${f.value})`).join(', ')}.</p> : null}
      <button type="button" style={{ ...buttonDangerStyle, marginTop: 6 }} disabled={busy} onClick={() => void merge(keep.id, dup.id, dup.name)}>
        {busy ? 'Merging…' : `Merge into ${keep.name}`}
      </button>
    </div>
  )
}

function ContactMerge({
  pair,
  a,
  b,
  accounts,
  onDone,
}: {
  pair: DuplicatePair
  a?: AccountContact
  b?: AccountContact
  accounts: Map<string, Account>
  onDone: () => Promise<void>
}) {
  const [keepId, setKeepId] = useState<string | null>(null)
  const { busy, merge } = useMerge('contact', onDone)
  if (!a || !b) return <p style={muted}>One of these contacts is gone. Refresh the page.</p>
  const filled = (c: AccountContact) => [c.email, c.phone, c.whatsapp, c.role].filter((v) => String(v || '').trim()).length + (c.is_primary ? 1 : 0)
  const keep = keepId ? (keepId === a.id ? a : b) : suggestKeep(a, b, filled)
  const dup = keep.id === a.id ? b : a

  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {[a, b].map((x) => (
          <label key={x.id} style={{ ...cardStyle, cursor: 'pointer', borderColor: keep.id === x.id ? colors.accent : colors.border }}>
            <input type="radio" name={`keep-${pair.a}`} checked={keep.id === x.id} onChange={() => setKeepId(x.id)} /> Keep this one
            <div style={{ marginTop: 6 }}>
              <strong>{x.name || 'No name'}</strong>
              {x.is_primary ? <span style={muted}> (primary)</span> : null}
            </div>
            <div style={muted}>
              <Link to={`/accounts/${x.account_id}`}>{accounts.get(x.account_id)?.name || 'Account'}</Link>
            </div>
            <div style={muted}>{[x.role, x.email, x.phone, x.whatsapp].filter(Boolean).join(', ') || 'No details'}</div>
          </label>
        ))}
      </div>
      <p style={{ fontSize: 14, marginBottom: 6 }}>Blank details on the kept contact are filled from the other one.</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={buttonDangerStyle} disabled={busy} onClick={() => void merge(keep.id, dup.id, dup.name || 'the duplicate')}>
          {busy ? 'Merging…' : 'Merge contacts'}
        </button>
      </div>
    </div>
  )
}
