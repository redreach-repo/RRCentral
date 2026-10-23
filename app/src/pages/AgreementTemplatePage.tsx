import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { format, parseISO } from 'date-fns'
import { CheckCircle2, Copy, Download, FileSignature, Save, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import AgreementPreview from '../components/AgreementPreview'
import { ratesFromSettings } from '../lib/delivery'
import { downloadBlob } from '../lib/documents'
import {
  AGREEMENT_PLACEHOLDERS,
  DEFAULT_AGREEMENT_BODY,
  DEFAULT_AGREEMENT_TITLE,
  buildAgreement,
  checkTemplate,
  sampleAgreementInput,
  templateInUse,
} from '../lib/serviceAgreement'
import { agreementPdf } from '../lib/serviceAgreementPdf'
import {
  approveAgreementTemplate,
  deleteAgreementDraft,
  listAgreementTemplates,
  saveAgreementDraft,
} from '../lib/agreementStore'
import { can } from '../lib/permissions'
import { errorMessage } from '../lib/errors'
import type { AgreementTemplate } from '../lib/types'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  fieldStyle,
  inputStyle,
  labelStyle,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
  sectionTitleStyle,
} from '../lib/uiStyles'

const smallBtn: CSSProperties = { ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }
const STATUS_LABEL = { draft: 'Draft', approved: 'Approved, in use', retired: 'Replaced' } as const
const day = (iso: string | null) => (iso ? format(parseISO(iso), 'd MMM yyyy') : '')

export default function AgreementTemplatePage() {
  const { userRole, user } = useAuth()
  const { settings } = useSettings()
  const { showToast } = useToast()
  const canEdit = can(userRole, 'delivery.packages')
  const rates = useMemo(() => ratesFromSettings(settings), [settings])
  const [templates, setTemplates] = useState<AgreementTemplate[]>([])
  const [missingTable, setMissingTable] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [title, setTitle] = useState(DEFAULT_AGREEMENT_TITLE)
  const [body, setBody] = useState(DEFAULT_AGREEMENT_BODY)
  const [busy, setBusy] = useState(false)
  const [approving, setApproving] = useState<{ by: string; on: string; note: string } | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async (select?: string) => {
    try {
      const r = await listAgreementTemplates()
      setTemplates(r.rows)
      setMissingTable(r.missingTable)
      const pick = r.rows.find((t) => t.id === select) ?? templateInUse(r.rows)
      setSelectedId(pick?.id ?? '')
      setTitle(pick?.title ?? DEFAULT_AGREEMENT_TITLE)
      setBody(pick?.body ?? DEFAULT_AGREEMENT_BODY)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load the agreement template'), 'error')
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const selected = templates.find((t) => t.id === selectedId) ?? null
  const inUse = templateInUse(templates)
  const editing = canEdit && !missingTable && (!selected || selected.status === 'draft')
  const dirty = selected ? selected.body !== body || selected.title !== title : true
  const problems = checkTemplate(body)
  const sample = useMemo(() => sampleAgreementInput(settings, rates), [settings, rates])
  const preview = useMemo(
    () => buildAgreement(selected, sample, body),
    [selected, body, sample],
  )

  function choose(t: AgreementTemplate) {
    if (dirty && editing && !window.confirm('Leave without saving your changes?')) return
    setSelectedId(t.id)
    setTitle(t.title)
    setBody(t.body)
  }

  async function run(fn: () => Promise<string | void>, failure: string, success?: string) {
    setBusy(true)
    try {
      const id = await fn()
      if (success) showToast(success, 'success')
      await load(typeof id === 'string' ? id : selectedId)
    } catch (e) {
      showToast(errorMessage(e, failure), 'error')
    } finally {
      setBusy(false)
    }
  }

  function insert(key: string) {
    const el = textRef.current
    const token = `{{${key}}}`
    if (!el) {
      setBody((b) => b + token)
      return
    }
    const start = el.selectionStart ?? body.length
    const end = el.selectionEnd ?? start
    setBody(body.slice(0, start) + token + body.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  function samplePdf() {
    const blob = agreementPdf(preview.blocks, {
      footer: `SAMPLE. ${preview.footer}`,
      draft: preview.draft,
      providerName: preview.values.company_name,
      clientName: preview.values.client_name,
      clientSignatory: preview.values.client_signatory,
    })
    downloadBlob(blob, 'Service-agreement-sample.pdf')
  }

  const author = user?.email ?? ''

  return (
    <div style={pageStyle}>
      <div>
        <h1 style={pageTitleStyle}>Service agreement template</h1>
        <p style={pageSubtitleStyle}>
          The wording for every client's service agreement. On a client's Contract card, Service agreement fills it in
          from the contract: fees, term, usage caps, the early exit fee and the data protection terms. Ask your lawyer to
          check it once, then mark it approved. Approved wording is locked; any change starts a new version for the
          lawyer to approve.
        </p>
      </div>

      {missingTable ? (
        <p style={{ color: colors.warn, fontSize: 13, margin: 0 }}>
          The agreement table is not set up yet. Run the Item 10 SQL in Supabase to save and approve the template. Until
          then, agreements use the starter wording below and are marked DRAFT.
        </p>
      ) : null}

      <section style={cardStyle} aria-label="Template in use">
        <h2 style={sectionTitleStyle}>In use now</h2>
        {inUse?.status === 'approved' ? (
          <p style={{ margin: 0, fontSize: 13 }}>
            <CheckCircle2 size={14} style={{ color: colors.success, verticalAlign: -2, marginRight: 6 }} />
            Version {inUse.version}, approved by {inUse.approved_by} on {day(inUse.approved_at)}.
            {inUse.approval_note ? <span style={{ color: colors.muted }}> {inUse.approval_note}</span> : null}
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: colors.warn }}>
            No version is approved yet, so agreements are marked DRAFT and should not be sent for signature. Send the
            sample PDF to your lawyer, make their changes here, then mark it approved.
          </p>
        )}
        {templates.length ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {templates.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => choose(t)}
                  aria-pressed={t.id === selectedId}
                  style={{ ...smallBtn, borderColor: t.id === selectedId ? colors.accent : undefined }}
                >
                  Version {t.version}: {STATUS_LABEL[t.status]}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16, alignItems: 'start' }}>
        <section style={cardStyle} aria-label="Wording">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <h2 style={{ ...sectionTitleStyle, margin: 0 }}>
              {selected ? `Version ${selected.version}` : 'Starter wording'}
              {selected && selected.status !== 'draft' ? ' (locked)' : ''}
            </h2>
            {canEdit && !missingTable ? (
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {editing ? (
                  <button
                    type="button"
                    style={smallBtn}
                    disabled={busy || !body.trim() || (Boolean(selected) && !dirty)}
                    onClick={() =>
                      void run(
                        () => saveAgreementDraft({ title, body }, author, templates, selected?.id),
                        'Could not save the template',
                        selected ? 'Draft saved' : 'Saved as version 1',
                      )
                    }
                  >
                    <Save size={12} /> {selected ? 'Save draft' : 'Save as a draft'}
                  </button>
                ) : (
                  <button
                    type="button"
                    style={smallBtn}
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => saveAgreementDraft({ title, body }, author, templates),
                        'Could not start a new draft',
                        'New draft started',
                      )
                    }
                  >
                    <Copy size={12} /> Start a new draft from this
                  </button>
                )}
                {selected?.status === 'draft' ? (
                  <>
                    <button
                      type="button"
                      style={smallBtn}
                      disabled={busy || dirty || problems.unknown.length > 0}
                      title={dirty ? 'Save the draft first' : undefined}
                      onClick={() => setApproving({ by: '', on: format(new Date(), 'yyyy-MM-dd'), note: '' })}
                    >
                      <FileSignature size={12} /> Mark approved by lawyer
                    </button>
                    <button
                      type="button"
                      style={{ ...smallBtn, color: colors.danger }}
                      disabled={busy}
                      aria-label="Delete this draft"
                      onClick={() =>
                        window.confirm(`Delete draft version ${selected.version}?`) &&
                        void run(() => deleteAgreementDraft(selected), 'Could not delete the draft', 'Draft deleted')
                      }
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                ) : null}
              </span>
            ) : null}
          </div>

          <div style={{ ...fieldStyle, marginTop: 12 }}>
            <label style={labelStyle} htmlFor="agreement-title">
              Name
            </label>
            <input
              id="agreement-title"
              style={inputStyle}
              value={title}
              readOnly={!editing}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="agreement-body">
              Wording
            </label>
            <textarea
              id="agreement-body"
              ref={textRef}
              style={{ ...inputStyle, minHeight: 420, resize: 'vertical', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}
              value={body}
              readOnly={!editing}
              onChange={(e) => setBody(e.target.value)}
            />
            <p style={{ color: colors.muted, fontSize: 12, margin: '6px 0 0' }}>
              A line starting with # is the title, ## a heading and - a bullet point. A line that says [signatures] adds
              the signature boxes. Words in double curly brackets are filled in from the contract.
            </p>
          </div>

          {problems.unknown.length ? (
            <p style={{ color: colors.danger, fontSize: 13, margin: '8px 0 0' }}>
              RR Central does not know {problems.unknown.map((k) => `{{${k}}}`).join(', ')}. Pick from the list below so
              it can be filled in.
            </p>
          ) : null}
          {problems.missing.length ? (
            <p style={{ color: colors.warn, fontSize: 13, margin: '8px 0 0' }}>
              The wording leaves out {problems.missing.map((k) => `{{${k}}}`).join(', ')}. Every agreement should show
              the usage caps and the early exit fee.
            </p>
          ) : null}

          {editing ? (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13 }}>Things that can be filled in</summary>
              <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 4 }}>
                {AGREEMENT_PLACEHOLDERS.map((p) => (
                  <li key={p.key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                    <button type="button" style={{ ...smallBtn, padding: '3px 8px' }} onClick={() => insert(p.key)}>
                      Add
                    </button>
                    <code>{`{{${p.key}}}`}</code>
                    <span style={{ color: colors.muted }}>{p.label}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        <section style={cardStyle} aria-label="Preview">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Preview with a sample client</h2>
            <button type="button" style={smallBtn} onClick={samplePdf}>
              <Download size={12} /> Sample PDF
            </button>
          </div>
          <p style={{ color: colors.muted, fontSize: 12, margin: '6px 0 10px' }}>
            Sample Dental Clinic on the Growth package, option B, with 10% off for 3 months. Send this PDF to your lawyer
            to review.
          </p>
          <AgreementPreview blocks={preview.blocks} />
        </section>
      </div>

      <Modal open={Boolean(approving)} title="Mark approved by lawyer" onClose={() => setApproving(null)} width={480}>
        {approving && selected ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void run(
                () => approveAgreementTemplate(selected.id, { approvedBy: approving.by, approvedOn: approving.on, note: approving.note }, templates),
                'Could not approve the template',
                `Version ${selected.version} is approved and in use`,
              ).then(() => setApproving(null))
            }}
          >
            <p style={{ margin: '0 0 12px', fontSize: 13, color: colors.muted }}>
              Once approved, version {selected.version} is used for every new agreement and its wording is locked.
              {inUse?.status === 'approved' ? ` Version ${inUse.version} is kept as a record.` : ''}
            </p>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="approved-by">
                Lawyer who approved it
              </label>
              <input
                id="approved-by"
                style={inputStyle}
                required
                value={approving.by}
                onChange={(e) => setApproving({ ...approving, by: e.target.value })}
                placeholder="Name and firm"
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="approved-on">
                Approved on
              </label>
              <input
                id="approved-on"
                type="date"
                style={inputStyle}
                required
                value={approving.on}
                onChange={(e) => setApproving({ ...approving, on: e.target.value })}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="approval-note">
                Note (optional)
              </label>
              <input
                id="approval-note"
                style={inputStyle}
                value={approving.note}
                onChange={(e) => setApproving({ ...approving, note: e.target.value })}
                placeholder="For example, approved by email on 3 November"
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button type="button" style={buttonSecondaryStyle} onClick={() => setApproving(null)}>
                Cancel
              </button>
              <button type="submit" style={buttonPrimaryStyle} disabled={busy || !approving.by.trim()}>
                Approve version {selected.version}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  )
}
