import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../contexts/ToastContext'
import { documentPath, groupSummary, matchCount, reviewGroups, suggestClients, type ClientLinkGroup, type ClientOption } from '../lib/clientLinks'
import { linkAllMatches, loadClientLinkReview, setDocumentClient, undoLinkBatch, type ClientLinkReview as ReviewData } from '../lib/clientLinksStore'
import { errorMessage } from '../lib/errors'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, inputStyle } from '../lib/uiStyles'

const smallBtn = { ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 13 }
const muted = { color: colors.muted, fontSize: 13 }

/**
 * Duplicates > Documents to link: quotes, invoices, delivery notes, payments,
 * deals, tickets and enquiries whose typed client name matched two clients or
 * none. Pick the client once per name and every document in the group links
 * to it. The typed name, numbers, totals and PDFs are never changed.
 */
export default function ClientLinkReview({ isAdmin, onCount }: { isAdmin: boolean; onCount?: (n: number) => void }) {
  const { showToast } = useToast()
  const [data, setData] = useState<ReviewData | null>(null)
  const [busy, setBusy] = useState(false)
  const [lastBatch, setLastBatch] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await loadClientLinkReview())
    } catch (e) {
      showToast(errorMessage(e, 'Could not load documents to link'), 'error')
      setData({ rows: [], clients: [], setupMissing: false })
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const groups = useMemo(() => reviewGroups(data?.rows ?? []), [data])
  const matches = matchCount(data?.rows ?? [])
  const docs = groups.reduce((n, g) => n + g.rows.length, 0)

  useEffect(() => {
    onCount?.(docs)
  }, [docs, onCount])

  async function linkMatches() {
    if (!window.confirm(`Link ${matches} document(s) to the one client each matches? You can undo this right after.`)) return
    setBusy(true)
    try {
      const r = await linkAllMatches()
      setLastBatch(r.batchId)
      showToast(`${r.linked} document(s) linked`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not link'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function undo() {
    if (!lastBatch) return
    setBusy(true)
    try {
      const n = await undoLinkBatch(lastBatch)
      setLastBatch(null)
      showToast(`${n} link(s) undone`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not undo'), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <p style={muted}>Looking for documents without a client…</p>
  if (data.setupMissing) {
    return (
      <p style={muted}>
        Linking documents to clients needs the database update client-links.sql. Run it in Supabase, then refresh this page.
      </p>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <p style={{ ...muted, margin: 0 }}>
        These documents name a client that matches two client records, or none. Pick the right client once and every document typed with that
        name links to it. Nothing on the documents changes: the typed name, numbers, totals and PDFs stay as they are.
      </p>
      {matches > 0 || lastBatch ? (
        <section style={{ ...cardStyle, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <span>
            {matches > 0 ? `${matches} more document(s) match exactly one client and can be linked now.` : 'Links added.'}
          </span>
          <span style={{ display: 'flex', gap: 8 }}>
            {isAdmin && matches > 0 ? (
              <button type="button" style={smallBtn} disabled={busy} onClick={() => void linkMatches()}>
                Link {matches}
              </button>
            ) : null}
            {isAdmin && lastBatch ? (
              <button type="button" style={smallBtn} disabled={busy} onClick={() => void undo()}>
                Undo
              </button>
            ) : null}
          </span>
        </section>
      ) : null}
      {!groups.length ? <p style={muted}>Every document is linked to a client.</p> : null}
      {groups.map((g) => (
        <LinkGroup key={g.key} group={g} clients={data.clients} onDone={load} />
      ))}
    </div>
  )
}

function LinkGroup({ group, clients, onDone }: { group: ClientLinkGroup; clients: ClientOption[]; onDone: () => Promise<void> }) {
  const { showToast } = useToast()
  const suggestions = useMemo(() => suggestClients(group.clientText, clients), [group.clientText, clients])
  const [clientId, setClientId] = useState(suggestions[0]?.id ?? '')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function link() {
    if (!clientId) return
    const name = clients.find((c) => c.id === clientId)?.company_name || 'that client'
    if (!window.confirm(`Link ${groupSummary(group.rows)} to ${name}?`)) return
    setBusy(true)
    let done = 0
    try {
      for (const r of group.rows) {
        await setDocumentClient(r.table_name, r.row_id, clientId)
        done += 1
      }
      showToast(`${done} document(s) linked to ${name}`, 'success')
    } catch (e) {
      showToast(`${done} linked, then: ${errorMessage(e, 'could not link')}`, 'error')
    } finally {
      setBusy(false)
      await onDone()
    }
  }

  return (
    <section style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <strong>{group.clientText || 'No client name'}</strong>
          <div style={muted}>
            {groupSummary(group.rows)} ·{' '}
            {group.kind === 'ambiguous' ? `matches ${group.rows[0]?.candidates || 2} client records` : 'no client record matches'}
          </div>
        </div>
        <button type="button" style={smallBtn} onClick={() => setOpen(!open)}>
          {open ? 'Hide documents' : 'Show documents'}
        </button>
      </div>
      {open ? (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
          {group.rows.map((r) => (
            <li key={r.row_id}>
              <Link to={documentPath(r)}>{r.row_label}</Link>
              {r.doc_date ? <span style={muted}> · {r.doc_date}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ ...muted, display: 'flex', gap: 6, alignItems: 'center', flex: '1 1 260px' }}>
          Client
          <select
            aria-label={`Client for ${group.clientText}`}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 0 }}
          >
            <option value="">Pick a client…</option>
            {suggestions.length ? (
              <optgroup label="Looks like">
                {suggestions.map((c) => (
                  <option key={`s-${c.id}`} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label="All clients">
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <button type="button" style={{ ...buttonPrimaryStyle, padding: '6px 12px', fontSize: 13 }} disabled={!clientId || busy} onClick={() => void link()}>
          {busy ? 'Linking…' : `Link ${group.rows.length}`}
        </button>
      </div>
    </section>
  )
}
