import { useState, type CSSProperties } from 'react'
import { PhoneCall, Sparkles } from 'lucide-react'
import Modal from '../Modal'
import { useToast } from '../../contexts/ToastContext'
import { addActivity } from '../../lib/accountsStore'
import { runAi } from '../../lib/aiAssistStore'
import { briefFacts, briefNote, type Brief } from '../../lib/callBrief'
import { loadBrief } from '../../lib/callBriefStore'
import { errorMessage } from '../../lib/errors'
import { formatAED } from '../../lib/money'
import type { Account } from '../../lib/types'
import { buttonPrimaryStyle, buttonSecondaryStyle, colors } from '../../lib/uiStyles'

const h3: CSSProperties = { fontSize: 13, margin: '14px 0 4px', color: colors.muted, fontWeight: 600 }
const line: CSSProperties = { fontSize: 13, margin: '2px 0', lineHeight: 1.5 }
const muted: CSSProperties = { ...line, color: colors.muted }

/**
 * Before the call: the last contact, open tickets and invoices, deal status
 * and what is overdue on one screen, with three questions from AI help.
 * Reading it changes nothing; Save as a note puts it on the timeline only
 * when the person chooses to.
 */
export default function CallBriefButton({
  account,
  accountKind,
  editable,
  author,
  onSaved,
}: {
  account: Account
  accountKind: string
  editable: boolean
  author: { appUserId: string | null; email: string }
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [brief, setBrief] = useState<Brief | null>(null)
  const [questions, setQuestions] = useState<string[]>([])
  const [aiBusy, setAiBusy] = useState(false)
  const [aiNote, setAiNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function ask(b: Brief) {
    setAiBusy(true)
    setAiNote('')
    try {
      const r = await runAi(account.id, { feature: 'call_brief', accountName: account.name, accountKind, facts: briefFacts(b) })
      setQuestions(r.questions)
      if (r.costUsd) setAiNote(`AI cost $${r.costUsd.toFixed(4)}, logged on this account.`)
    } catch (e) {
      setAiNote(errorMessage(e, 'AI help is not available right now.'))
    } finally {
      setAiBusy(false)
    }
  }

  async function show() {
    setOpen(true)
    setBrief(null)
    setQuestions([])
    setAiNote('')
    try {
      const b = await loadBrief(account.id)
      setBrief(b)
      if (editable) void ask(b)
    } catch (e) {
      showToast(errorMessage(e, 'Could not build the brief'), 'error')
      setOpen(false)
    }
  }

  async function save() {
    if (!brief) return
    setSaving(true)
    try {
      await addActivity(account.id, 'note', briefNote(brief, questions), author)
      showToast('Brief saved on the timeline', 'success')
      onSaved()
      setOpen(false)
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the brief'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button type="button" style={buttonSecondaryStyle} onClick={() => void show()}>
        <PhoneCall size={14} /> Before the call
      </button>
      <Modal open={open} title={`Before the call: ${account.name}`} onClose={() => setOpen(false)}>
        {!brief ? (
          <p style={muted}>Gathering the brief…</p>
        ) : (
          <div>
            <h3 style={{ ...h3, marginTop: 0 }}>Last contact</h3>
            {brief.lastContact ? (
              <>
                <p style={line}>
                  {brief.lastContact.kind}, {brief.lastContact.when} ({brief.lastContact.daysAgo === 0 ? 'today' : `${brief.lastContact.daysAgo} days ago`}) by{' '}
                  {brief.lastContact.by || 'someone'}
                </p>
                <p style={muted}>{brief.lastContact.summary}</p>
              </>
            ) : (
              <p style={muted}>Nothing logged yet.</p>
            )}

            <h3 style={h3}>Open tickets ({brief.openTickets.length})</h3>
            {brief.openTickets.length ? (
              brief.openTickets.map((t, i) => (
                <p key={`${t.subject}-${i}`} style={{ ...line, color: t.late ? colors.warn : colors.text }}>
                  {t.subject}: {t.status}, opened {t.opened}
                  {t.late ? ', reply overdue' : ''}
                </p>
              ))
            ) : (
              <p style={muted}>None.</p>
            )}

            <h3 style={h3}>Open invoices{brief.openInvoices.length ? `, ${formatAED(brief.owed)} owed` : ''}</h3>
            {brief.openInvoices.length ? (
              brief.openInvoices.map((i) => (
                <p key={i.reference} style={{ ...line, color: i.daysLate ? colors.warn : colors.text }}>
                  {i.reference}: {formatAED(i.balance)}
                  {i.due ? `, due ${i.due}` : ''}
                  {i.daysLate ? `, ${i.daysLate} days late` : ''}
                </p>
              ))
            ) : (
              <p style={muted}>None you can see.</p>
            )}

            <h3 style={h3}>Deal status</h3>
            {brief.deals.length ? (
              brief.deals.map((d, i) => (
                <p key={`${d.pipeline}-${i}`} style={{ ...line, color: d.late ? colors.warn : colors.text }}>
                  {d.pipeline}: {d.stage}
                  {d.nextAction ? `. Next: ${d.nextAction}` : ''}
                  {d.nextDate ? ` (${d.nextDate})` : ''}
                </p>
              ))
            ) : (
              <p style={muted}>No open deal.</p>
            )}

            <h3 style={h3}>Overdue</h3>
            {brief.overdue.length ? (
              brief.overdue.map((o) => (
                <p key={o} style={{ ...line, color: colors.warn }}>
                  {o}
                </p>
              ))
            ) : (
              <p style={muted}>Nothing overdue.</p>
            )}

            <h3 style={h3}>Three questions to ask</h3>
            {!editable ? (
              <p style={muted}>Suggested questions need edit rights on this account.</p>
            ) : aiBusy ? (
              <p style={muted}>Thinking of questions…</p>
            ) : questions.length ? (
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                {questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ol>
            ) : null}
            {aiNote ? <p style={{ ...muted, fontSize: 12 }}>{aiNote}</p> : null}
            <p style={{ ...muted, fontSize: 12, marginTop: 8 }}>Suggested by AI from the facts above. Check them before you use them.</p>

            {editable ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                <button type="button" style={buttonSecondaryStyle} disabled={aiBusy} onClick={() => void ask(brief)}>
                  <Sparkles size={14} /> Other questions
                </button>
                <button type="button" style={buttonPrimaryStyle} disabled={saving || aiBusy} onClick={() => void save()}>
                  {saving ? 'Saving…' : 'Save as a note'}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </Modal>
    </>
  )
}
