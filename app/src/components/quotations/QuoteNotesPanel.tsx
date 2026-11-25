import { useCallback, useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import type { Quotation } from '../../lib/types'
import {
  addDaysIso,
  isoDay,
  QUOTE_NOTE_MAX,
  quoteNoteKindLabel,
  quoteNoteProblem,
  type QuoteNote,
} from '../../lib/quoteRevisions'
import {
  addQuoteNote,
  createDealForQuote,
  linkAccountToQuotes,
  linkDealToQuote,
  listNotesForQuoteRef,
  listQuoteNotes,
  loadQuoteChain,
  loadQuoteLinks,
  setupMissingMessage,
  type QuoteLinks,
} from '../../lib/quoteRevisionsStore'
import { errorMessage } from '../../lib/errors'
import { roleAtLeast } from '../../lib/permissions'
import StatusPill from '../StatusPill'
import { buttonPrimaryStyle, buttonSecondaryStyle, colors, inputStyle, labelStyle } from '../../lib/uiStyles'

function when(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM yyyy, HH:mm')
  } catch {
    return iso
  }
}

function day(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return format(parseISO(iso.slice(0, 10)), 'd MMM yyyy')
  } catch {
    return iso
  }
}

type PanelQuote = Quotation & { revised_from?: string | null; contact_email?: string; account_id?: string | null }
type ChainRow = Awaited<ReturnType<typeof loadQuoteChain>>[number]

/** Append-only notes list with an add box. Used on a quote and on a deal. */
function NotesList(props: {
  notes: QuoteNote[] | null
  missing: boolean
  canAdd: boolean
  onAdd?: (body: string) => Promise<void>
  emptyText: string
}) {
  const ids = useId()
  const { showToast } = useToast()
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    const problem = quoteNoteProblem(body)
    if (problem) {
      showToast(problem, 'error')
      return
    }
    if (!props.onAdd) return
    setSaving(true)
    try {
      await props.onAdd(body)
      setBody('')
      showToast('Note added.', 'success')
    } catch (e) {
      showToast(errorMessage(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {props.missing ? (
        <p role="status" style={{ margin: 0, fontSize: 13, color: colors.warn }}>
          {setupMissingMessage()}
        </p>
      ) : null}
      {props.canAdd && props.onAdd && !props.missing ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <label htmlFor={`${ids}-note`} style={labelStyle}>
            Add a note (works on locked quotes too; notes cannot be edited later)
          </label>
          <textarea
            id={`${ids}-note`}
            style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }}
            value={body}
            maxLength={QUOTE_NOTE_MAX}
            placeholder="e.g. Met the buyer: they need two more weeks"
            onChange={(e) => setBody(e.target.value)}
          />
          <div>
            <button type="button" style={buttonPrimaryStyle} disabled={saving || !body.trim()} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Add note'}
            </button>
          </div>
        </div>
      ) : null}
      {props.notes === null ? (
        <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>Loading notes…</p>
      ) : props.notes.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>{props.emptyText}</p>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
          {props.notes.map((n) => (
            <li key={n.id} style={{ borderLeft: `2px solid ${n.kind === 'note' ? colors.border : colors.accent}`, paddingLeft: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: colors.muted }}>
                <strong style={{ color: colors.text }}>{when(n.created_at)}</strong>
                <span>{quoteNoteKindLabel(n.kind)}</span>
                <span>on {n.quote_ref}</span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 13, whiteSpace: 'pre-wrap' }}>{n.body}</p>
              <div style={{ fontSize: 12, color: colors.muted2, marginTop: 2 }}>
                {n.created_by_email || 'Unknown'}
                {n.source === 'ai' ? ' (via AI assistant)' : ''}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/**
 * Everything about one quote's history: its revisions, the append-only notes
 * of the whole chain, and the deal or account it belongs to (with an offer to
 * link or create one when there is none).
 */
export default function QuoteNotesPanel(props: { quote: PanelQuote; onChanged?: () => void }) {
  const { quote: q } = props
  const { userRole, user } = useAuth()
  const { showToast } = useToast()
  const who = user?.email || ''
  const canAdd = roleAtLeast(userRole, 'sales')
  const [chain, setChain] = useState<ChainRow[]>([q])
  const [notes, setNotes] = useState<QuoteNote[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [links, setLinks] = useState<QuoteLinks | null>(null)
  const [busy, setBusy] = useState(false)
  const liveRef = chain.find((c) => !['Superseded', 'Draft'].includes(c.status))?.reference_number || q.reference_number

  const load = useCallback(async () => {
    try {
      const c = await loadQuoteChain(q)
      setChain(c)
      const [n, l] = await Promise.all([
        listQuoteNotes(c.map((x) => x.id)),
        loadQuoteLinks(q, c.map((x) => x.reference_number).filter(Boolean)).catch(() => null),
      ])
      setNotes(n.notes)
      setMissing(n.missing)
      setLinks(l)
    } catch (e) {
      setNotes([])
      showToast(errorMessage(e), 'error')
    }
  }, [q, showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function act(fn: () => Promise<unknown>, done: string) {
    setBusy(true)
    try {
      await fn()
      showToast(done, 'success')
      await load()
      props.onChanged?.()
    } catch (e) {
      showToast(errorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const today = isoDay(new Date())
  const followUp = (() => {
    const until = q.valid_until ? q.valid_until.slice(0, 10) : ''
    const before = until ? addDaysIso(until, -3) : ''
    return before && before > today ? before : addDaysIso(today, 3)
  })()
  const quoteRef = liveRef || q.reference_number

  return (
    <section aria-label={`Notes and history for ${q.reference_number || 'this quote'}`} style={{ display: 'grid', gap: 16 }}>
      {chain.length > 1 ? (
        <div>
          <div style={labelStyle}>Revisions</div>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {chain.map((c) => (
              <li key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                <Link to={`/document/quote/${c.id}`} style={{ color: colors.accentText, fontWeight: c.id === q.id ? 700 : 500 }}>
                  {c.reference_number || 'Draft'}
                </Link>
                <StatusPill status={c.status} />
                {c.valid_until ? <span style={{ color: colors.muted }}>valid until {day(c.valid_until)}</span> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {links && q.reference_number ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={labelStyle}>Deal and account</div>
          {links.deal ? (
            <p style={{ margin: 0, fontSize: 13 }}>
              Deal:{' '}
              <Link to={`/crm?edit=${encodeURIComponent(links.deal.id)}`} style={{ color: colors.accentText }}>
                {links.deal.company_name}
              </Link>{' '}
              <span style={{ color: colors.muted }}>
                ({links.deal.pipeline_stage || 'Lead'}, quote {links.deal.quote_ref}). These notes show on the deal too.
              </span>
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              <p style={{ margin: 0, fontSize: 13, color: colors.warn }}>No deal carries this quote yet.</p>
              {canAdd ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {links.dealMatches.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      style={buttonSecondaryStyle}
                      disabled={busy}
                      onClick={() => void act(() => linkDealToQuote(d.id, quoteRef, who), `Linked to the deal ${d.company_name}.`)}
                    >
                      Link to deal: {d.company_name}
                      {d.quote_ref ? ` (now ${d.quote_ref})` : ''}
                    </button>
                  ))}
                  <button
                    type="button"
                    style={buttonSecondaryStyle}
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () => createDealForQuote({ ...q, account_id: q.account_id || links.account?.id || null }, quoteRef, who, followUp),
                        `Deal created for ${q.client}, follow up ${day(followUp)}.`,
                      )
                    }
                  >
                    Create a deal for {q.client}
                  </button>
                </div>
              ) : null}
            </div>
          )}
          {links.account ? (
            <p style={{ margin: 0, fontSize: 13 }}>
              Account:{' '}
              <Link to={`/accounts/${links.account.id}`} style={{ color: colors.accentText }}>
                {links.account.name}
              </Link>
            </p>
          ) : canAdd && links.accountMatches.length ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: colors.muted }}>No account linked. Matches:</span>
              {links.accountMatches.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  style={buttonSecondaryStyle}
                  disabled={busy}
                  onClick={() =>
                    void act(() => linkAccountToQuotes(chain.map((c) => c.id), a.id, who), `Linked to the account ${a.name}.`)
                  }
                >
                  Link to account: {a.name}
                  {a.reference ? ` (${a.reference})` : ''}
                </button>
              ))}
            </div>
          ) : !links.account ? (
            <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>No account linked, and none matches {q.client} by name or email.</p>
          ) : null}
        </div>
      ) : null}

      <div>
        <div style={labelStyle}>Notes and activity{chain.length > 1 ? ' (all revisions)' : ''}</div>
        <NotesList
          notes={notes}
          missing={missing}
          canAdd={canAdd}
          onAdd={async (body) => {
            await addQuoteNote(q.id, body)
            await load()
            props.onChanged?.()
          }}
          emptyText={`No notes on ${q.reference_number || 'this quote'} yet.`}
        />
      </div>
    </section>
  )
}

/** The quote notes for a deal (by its quote reference), shown in the deal editor. */
export function DealQuoteNotes(props: { quoteRef: string }) {
  const { showToast } = useToast()
  const [notes, setNotes] = useState<QuoteNote[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [refs, setRefs] = useState<string[]>([])

  useEffect(() => {
    let alive = true
    setNotes(null)
    listNotesForQuoteRef(props.quoteRef)
      .then((r) => {
        if (!alive) return
        setNotes(r.notes)
        setMissing(r.missing)
        setRefs(r.refs)
      })
      .catch((e) => {
        if (!alive) return
        setNotes([])
        showToast(errorMessage(e), 'error')
      })
    return () => {
      alive = false
    }
  }, [props.quoteRef, showToast])

  if (!props.quoteRef.trim()) return null
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={labelStyle}>
        Quote notes{refs.length > 1 ? ` (${refs.join(', ')})` : ` (${props.quoteRef})`}
      </div>
      <NotesList
        notes={notes}
        missing={missing}
        canAdd={false}
        emptyText="No notes on this quote yet. Add them from Quotations, Actions, Notes."
      />
    </div>
  )
}
