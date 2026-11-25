import { useId, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useToast } from '../../contexts/ToastContext'
import type { Quotation } from '../../lib/types'
import {
  defaultRevisionValidUntil,
  isoDay,
  nextRevisionNumber,
  quoteBaseReference,
  revisionInputProblem,
  revisionReference,
  REVISION_REASON_MAX,
} from '../../lib/quoteRevisions'
import { extendQuoteValidity, reviseQuote, type RevisionResult } from '../../lib/quoteRevisionsStore'
import { errorMessage } from '../../lib/errors'
import { buttonPrimaryStyle, buttonSecondaryStyle, colors, inputStyle, labelStyle } from '../../lib/uiStyles'

function day(iso: string | null | undefined): string {
  if (!iso) return 'not set'
  try {
    return format(parseISO(iso.slice(0, 10)), 'd MMM yyyy')
  } catch {
    return iso
  }
}

/**
 * Revise (new Draft RR-…-R1 to edit) or Extend validity (same quote, later
 * date, done in one step). The quote being replaced keeps its totals and PDF.
 */
export default function ReviseQuoteForm(props: {
  quote: Quotation & { revised_from?: string | null }
  mode: 'revise' | 'extend'
  /** Quotes on the page, to show the next revision number. */
  allQuotes?: (Quotation & { revised_from?: string | null })[]
  onDone: (result: RevisionResult) => void
  onCancel: () => void
}) {
  const { quote: q, mode } = props
  const ids = useId()
  const { showToast } = useToast()
  const today = isoDay(new Date())
  const [validUntil, setValidUntil] = useState(defaultRevisionValidUntil(q.valid_until, today))
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const extend = mode === 'extend'
  const base = quoteBaseReference(q)
  const nextRef = revisionReference(base, nextRevisionNumber(q, props.allQuotes || []))
  const problem = revisionInputProblem({ validUntil, reason, extend }, q, today)

  async function submit() {
    if (problem) {
      showToast(problem, 'error')
      return
    }
    setSaving(true)
    try {
      const res = extend
        ? await extendQuoteValidity(q.id, validUntil, reason.trim())
        : await reviseQuote(q.id, validUntil, reason.trim())
      props.onDone(res)
    } catch (e) {
      showToast(errorMessage(e, extend ? 'Extend failed' : 'Revise failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      style={{ display: 'grid', gap: 14 }}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <p style={{ margin: 0, fontSize: 13, color: colors.muted, lineHeight: 1.5 }}>
        {extend ? (
          <>
            {q.reference_number} ({q.status}) is valid until <strong>{day(q.valid_until)}</strong>. Extending makes{' '}
            <strong>{nextRef}</strong> with the same client, lines and prices and the new date, and marks{' '}
            {q.reference_number} as Superseded. {q.reference_number}&apos;s total and PDF stay exactly as they are.
          </>
        ) : (
          <>
            Makes a new Draft, <strong>{nextRef}</strong>, copying client, contact, lines, terms, MOQ, notes and currency
            from {q.reference_number}. Change what you need, then Finalize it: only then does {q.reference_number} become
            Superseded. Until then {q.reference_number} stays {q.status}.
          </>
        )}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
        <div>
          <label htmlFor={`${ids}-until`} style={labelStyle}>
            New valid until
          </label>
          <input
            id={`${ids}-until`}
            type="date"
            style={inputStyle}
            value={validUntil}
            min={extend && q.valid_until && q.valid_until.slice(0, 10) >= today ? q.valid_until.slice(0, 10) : today}
            onChange={(e) => setValidUntil(e.target.value)}
            required
          />
          <span style={{ fontSize: 12, color: colors.muted2 }}>Default: old date + 14 days.</span>
        </div>
      </div>
      <div>
        <label htmlFor={`${ids}-reason`} style={labelStyle}>
          {extend ? 'Why (required)' : 'Why (optional)'}
        </label>
        <textarea
          id={`${ids}-reason`}
          style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }}
          value={reason}
          maxLength={REVISION_REASON_MAX}
          placeholder={extend ? 'e.g. Agreed in the meeting with the buyer on 25 Nov' : 'e.g. New prices from the supplier'}
          onChange={(e) => setReason(e.target.value)}
          required={extend}
        />
      </div>
      {problem && (validUntil || reason) ? (
        <p role="status" style={{ margin: 0, fontSize: 13, color: colors.warn }}>
          {problem}
        </p>
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" style={buttonPrimaryStyle} disabled={saving || Boolean(problem)}>
          {saving ? 'Working…' : extend ? `Extend to ${day(validUntil)}` : `Create ${nextRef}`}
        </button>
        <button type="button" style={buttonSecondaryStyle} onClick={props.onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  )
}
