import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../contexts/ToastContext'
import { nameKey } from '../lib/duplicates'
import {
  CONFIRM_WORD,
  FIELD_LABELS,
  confirmOk,
  defaultPicks,
  fieldText,
  moveLines,
  suggestMergeGroups,
  unlinkedCount,
  type MergeCandidate,
  type MergePreview,
} from '../lib/clientMerge'
import {
  isClientMergeMissing,
  loadMergeCandidates,
  loadRecentMerges,
  previewClientMerge,
  runClientMerge,
  undoClientMerge,
  type ClientMergeLog,
} from '../lib/clientMergeStore'
import { errorMessage } from '../lib/errors'
import { buttonDangerStyle, buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, inputStyle } from '../lib/uiStyles'

const smallBtn = { ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 13 }
const muted = { color: colors.muted, fontSize: 13 }

/**
 * Duplicates > Merge clients (admins only): pick the client record to keep
 * and the duplicates, see everything that will move and where the records
 * differ, pick the value to keep per field, type MERGE. One transaction; the
 * duplicates are kept as merged (their old links open the client kept) and
 * Undo puts everything back. Numbers, typed names, totals and PDFs never change.
 */
export default function ClientMergePanel() {
  const { showToast } = useToast()
  const [clients, setClients] = useState<MergeCandidate[] | null>(null)
  const [merges, setMerges] = useState<ClientMergeLog[]>([])
  const [setupMissing, setSetupMissing] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [keepId, setKeepId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState<MergePreview | null>(null)
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [linkUnlinked, setLinkUnlinked] = useState(true)
  const [typed, setTyped] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [c, m] = await Promise.all([loadMergeCandidates(), loadRecentMerges()])
      setClients(c)
      setMerges(m)
    } catch (e) {
      if (isClientMergeMissing(e)) setSetupMissing(true)
      else showToast(errorMessage(e, 'Could not load clients'), 'error')
      setClients([])
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const groups = useMemo(() => suggestMergeGroups(clients ?? []), [clients])
  const byId = useMemo(() => new Map((clients ?? []).map((c) => [c.id, c])), [clients])
  const found = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q || !clients) return []
    const k = nameKey(q)
    return clients
      .filter((c) => !selected.includes(c.id))
      .filter((c) => c.company_name.toLowerCase().includes(q) || (k && nameKey(c.company_name).includes(k)) || c.trn.includes(q))
      .slice(0, 12)
  }, [clients, search, selected])

  function reset(ids: string[] = []) {
    setSelected(ids)
    setKeepId(ids[0] ?? null)
    setPreview(null)
    setTyped('')
    setReason('')
    setPicks({})
  }

  async function showPreview() {
    if (!keepId || selected.length < 2) return
    setBusy(true)
    try {
      const p = await previewClientMerge(keepId, selected.filter((id) => id !== keepId))
      setPreview(p)
      setPicks(defaultPicks(p))
      setLinkUnlinked(true)
      setTyped('')
    } catch (e) {
      showToast(errorMessage(e, 'Could not preview this merge'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function merge() {
    if (!preview || !confirmOk(typed)) return
    setBusy(true)
    try {
      const r = await runClientMerge({
        survivorId: preview.survivor_id,
        duplicateIds: preview.duplicate_ids,
        fields: picks,
        linkUnlinked,
        confirm: typed,
        reason,
      })
      const moved = Object.values(r.counts || {}).reduce((s, n) => s + n, 0)
      showToast(`Merged. ${moved} record(s) now on the client kept. You can undo this below.`, 'success')
      reset()
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not merge'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function undo(m: ClientMergeLog) {
    if (!window.confirm(`Undo the merge into ${m.survivor_name || 'this client'}? The duplicates come back and their records move back.`)) return
    setBusy(true)
    try {
      const r = await undoClientMerge(m.id)
      showToast(`Merge undone. ${r.rows_moved_back} record(s) moved back.`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not undo'), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (setupMissing) {
    return (
      <section style={cardStyle}>
        <strong>Merge clients needs its database setup.</strong>
        <p style={muted}>Run supabase-sql/client-merge.sql in the Supabase SQL editor, then reload.</p>
      </section>
    )
  }
  if (!clients) return <p style={muted}>Loading clients…</p>

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={muted}>
        Pick the client record to keep and its duplicates. Every quote, invoice, PO, delivery note, payment, deal, ticket and enquiry
        moves to the one kept. Quote and invoice numbers, typed names, totals and PDFs never change. Every merge can be undone.
      </p>

      {!selected.length ? (
        <section style={cardStyle}>
          <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Suggested ({groups.length})</h3>
          {!groups.length ? <p style={muted}>No client records look alike.</p> : null}
          <div style={{ display: 'grid', gap: 8 }}>
            {groups.map((g) => (
              <div key={g.ids.join('|')} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <div>{g.names.join(' · ')}</div>
                  <div style={muted}>{g.reasons.join(', ')}</div>
                </div>
                <button type="button" style={smallBtn} onClick={() => reset(g.ids)}>
                  Review merge
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section style={cardStyle}>
        <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Clients to merge</h3>
        {selected.map((id) => {
          const c = byId.get(id)
          return (
            <label key={id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
              <input type="radio" name="keep-client" checked={keepId === id} onChange={() => (setKeepId(id), setPreview(null))} />
              <span>
                <Link to={`/clients/${id}`}>{c?.company_name || 'Client'}</Link>
                {c?.trn ? <span style={muted}> · TRN {c.trn}</span> : null}
                {keepId === id ? <strong style={{ color: colors.accent }}> · keep</strong> : null}
              </span>
              <button
                type="button"
                style={{ ...smallBtn, marginLeft: 'auto' }}
                onClick={() => {
                  const next = selected.filter((x) => x !== id)
                  setSelected(next)
                  if (keepId === id) setKeepId(next[0] ?? null)
                  setPreview(null)
                }}
              >
                Remove
              </button>
            </label>
          )
        })}
        <input
          type="search"
          aria-label="Add a client to merge"
          placeholder="Add a client by name or TRN…"
          style={{ ...inputStyle, maxWidth: 420, marginTop: 8 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {found.length ? (
          <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
            {found.map((c) => (
              <button
                key={c.id}
                type="button"
                style={{ ...smallBtn, textAlign: 'left' }}
                onClick={() => {
                  const next = [...selected, c.id]
                  setSelected(next)
                  if (!keepId) setKeepId(c.id)
                  setSearch('')
                  setPreview(null)
                }}
              >
                {c.company_name}
                {c.trn ? ` · TRN ${c.trn}` : ''}
              </button>
            ))}
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button type="button" style={buttonPrimaryStyle} disabled={busy || selected.length < 2 || !keepId} onClick={() => void showPreview()}>
            Preview merge
          </button>
          {selected.length ? (
            <button type="button" style={buttonSecondaryStyle} onClick={() => reset()}>
              Cancel
            </button>
          ) : null}
        </div>
      </section>

      {preview ? (
        <section style={{ ...cardStyle, borderColor: colors.accent }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Preview</h3>
          <p style={{ margin: '0 0 6px' }}>
            Keep <strong>{preview.records.find((r) => r.keep)?.company_name}</strong>
            {preview.records.find((r) => r.keep)?.account_reference ? ` (${preview.records.find((r) => r.keep)?.account_reference})` : ''}. Merge in:{' '}
            {preview.records.filter((r) => !r.keep).map((r) => r.company_name).join(', ')}.
          </p>
          <div style={{ margin: '8px 0' }}>
            <strong style={{ fontSize: 14 }}>Moves to the client kept</strong>
            {moveLines(preview.moves).length ? (
              <ul style={{ margin: '4px 0 0 18px' }}>
                {moveLines(preview.moves).map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            ) : (
              <p style={muted}>Nothing is linked to the duplicates.</p>
            )}
          </div>
          {unlinkedCount(preview.unlinked) ? (
            <div style={{ margin: '8px 0' }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={linkUnlinked} onChange={(e) => setLinkUnlinked(e.target.checked)} />
                <span>Also link {unlinkedCount(preview.unlinked)} unlinked document(s) typed with one of these names</span>
              </label>
              <ul style={{ margin: '4px 0 0 18px', ...muted }}>
                {Object.values(preview.unlinked)
                  .flat()
                  .map((d) => (
                    <li key={d.id}>
                      {d.label} (typed “{d.typed}”)
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
          {preview.fields.length ? (
            <div style={{ margin: '8px 0' }}>
              <strong style={{ fontSize: 14 }}>Pick the value to keep</strong>
              {preview.fields.map((f) => (
                <fieldset key={f.field} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, margin: '6px 0', padding: '6px 10px' }}>
                  <legend style={muted}>{FIELD_LABELS[f.field] ?? f.field}</legend>
                  {f.values.map((v) => (
                    <label key={v.client_id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '2px 0' }}>
                      <input
                        type="radio"
                        name={`pick-${f.field}`}
                        checked={picks[f.field] === v.client_id}
                        onChange={() => setPicks((p) => ({ ...p, [f.field]: v.client_id }))}
                      />
                      <span style={{ whiteSpace: 'pre-wrap' }}>{fieldText(preview, f.field, v.value, v.client_id)}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
              <p style={muted}>Fields not listed are the same, or blank on the client kept and filled from a duplicate.</p>
            </div>
          ) : null}
          <div style={{ margin: '8px 0' }}>
            <strong style={{ fontSize: 14 }}>Contacts after the merge ({preview.contacts.length})</strong>
            <div style={muted}>
              {preview.contacts.map((c) => [c.name, c.email, c.phone].filter(Boolean).join(', ')).join(' · ') || 'None'}
            </div>
          </div>
          <div style={{ display: 'grid', gap: 8, maxWidth: 420, marginTop: 10 }}>
            <input style={inputStyle} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" />
            <input
              style={inputStyle}
              placeholder={`Type ${CONFIRM_WORD} to confirm`}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-label="Type MERGE to confirm"
            />
            <button type="button" style={buttonDangerStyle} disabled={busy || !confirmOk(typed)} onClick={() => void merge()}>
              Merge {preview.duplicate_ids.length + 1} clients into one
            </button>
          </div>
        </section>
      ) : null}

      <section style={cardStyle}>
        <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Recent merges</h3>
        {!merges.length ? <p style={muted}>No merges yet.</p> : null}
        {merges.map((m) => (
          <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '6px 0', borderTop: `1px solid ${colors.border}` }}>
            <div>
              <div>
                {m.duplicate_names.join(', ')} → <Link to={`/clients/${m.survivor_id}`}>{m.survivor_name}</Link>
              </div>
              <div style={muted}>
                {new Date(m.merged_at).toLocaleString()} by {m.merged_by_email || 'unknown'}
                {m.reason ? ` · ${m.reason}` : ''}
                {m.undone_at ? ` · undone ${new Date(m.undone_at).toLocaleString()}` : ''}
              </div>
            </div>
            {!m.undone_at ? (
              <button type="button" style={smallBtn} disabled={busy} onClick={() => void undo(m)}>
                Undo
              </button>
            ) : null}
          </div>
        ))}
      </section>
    </div>
  )
}
