import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { CheckCircle2, Copy, Download, FileSignature, Save, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import AgreementPreview from '../components/AgreementPreview'
import { formatClauseForTemplate, insertTextAtCursor } from '../lib/clauseCompose'
import { listContractClauses } from '../lib/clauseLibraryStore'
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
import { parseAgreementApproveForm, parseAgreementDraftForm } from '../lib/schemas/agreementTemplate'
import type { AgreementTemplate, ContractClause } from '../lib/types'
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
const day = (iso: string | null) => (iso ? format(parseISO(iso), 'd MMM yyyy') : '')

export default function AgreementTemplatePage() {
  const { t } = useI18n()
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
  const [clauses, setClauses] = useState<ContractClause[]>([])
  const textRef = useRef<HTMLTextAreaElement>(null)

  const statusLabel = (status: AgreementTemplate['status']) => {
    if (status === 'draft') return t('page.agreementTemplate.statusDraft')
    if (status === 'approved') return t('page.agreementTemplate.statusApproved')
    return t('page.agreementTemplate.statusRetired')
  }

  const load = useCallback(async (select?: string) => {
    try {
      const r = await listAgreementTemplates()
      setTemplates(r.rows)
      setMissingTable(r.missingTable)
      const pick = r.rows.find((row) => row.id === select) ?? templateInUse(r.rows)
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

  useEffect(() => {
    void listContractClauses()
      .then((r) => setClauses(r.rows.filter((c) => c.status === 'active')))
      .catch(() => setClauses([]))
  }, [])

  const selected = templates.find((row) => row.id === selectedId) ?? null
  const inUse = templateInUse(templates)
  const editing = canEdit && !missingTable && (!selected || selected.status === 'draft')
  const dirty = selected ? selected.body !== body || selected.title !== title : true
  const problems = checkTemplate(body)
  const sample = useMemo(() => sampleAgreementInput(settings, rates), [settings, rates])
  const preview = useMemo(
    () => buildAgreement(selected, sample, body),
    [selected, body, sample],
  )

  function choose(row: AgreementTemplate) {
    if (dirty && editing && !window.confirm(t('page.agreementTemplate.leaveUnsaved'))) return
    setSelectedId(row.id)
    setTitle(row.title)
    setBody(row.body)
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

  function insertAtCursor(piece: string) {
    const el = textRef.current
    const start = el?.selectionStart ?? body.length
    const end = el?.selectionEnd ?? start
    const next = insertTextAtCursor(body, piece, start, end)
    setBody(next.text)
    requestAnimationFrame(() => {
      if (!textRef.current) return
      textRef.current.focus()
      textRef.current.setSelectionRange(next.cursor, next.cursor)
    })
  }

  function insert(key: string) {
    insertAtCursor(`{{${key}}}`)
  }

  function insertClause(clause: ContractClause) {
    insertAtCursor(formatClauseForTemplate(clause))
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
        <h1 style={pageTitleStyle}>{t('page.agreementTemplate.title')}</h1>
        <p style={pageSubtitleStyle}>{t('page.agreementTemplate.subtitle')}</p>
      </div>

      {missingTable ? (
        <p style={{ color: colors.warn, fontSize: 13, margin: 0 }}>{t('page.agreementTemplate.missingTable')}</p>
      ) : null}

      <section style={cardStyle} aria-label={t('page.agreementTemplate.inUseNow')}>
        <h2 style={sectionTitleStyle}>{t('page.agreementTemplate.inUseNow')}</h2>
        {inUse?.status === 'approved' ? (
          <p style={{ margin: 0, fontSize: 13 }}>
            <CheckCircle2 size={14} style={{ color: colors.success, verticalAlign: -2, marginRight: 6 }} />
            {t('page.agreementTemplate.approvedLine')
              .replace('{version}', String(inUse.version))
              .replace('{by}', inUse.approved_by || '')
              .replace('{date}', day(inUse.approved_at))}
            {inUse.approval_note ? <span style={{ color: colors.muted }}> {inUse.approval_note}</span> : null}
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: colors.warn }}>{t('page.agreementTemplate.noApproved')}</p>
        )}
        {templates.length ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {templates.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => choose(row)}
                  aria-pressed={row.id === selectedId}
                  style={{ ...smallBtn, borderColor: row.id === selectedId ? colors.accent : undefined }}
                >
                  {t('page.agreementTemplate.versionStatus')
                    .replace('{version}', String(row.version))
                    .replace('{status}', statusLabel(row.status))}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16, alignItems: 'start' }}>
        <section style={cardStyle} aria-label={t('page.agreementTemplate.wording')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <h2 style={{ ...sectionTitleStyle, margin: 0 }}>
              {selected
                ? t('page.agreementTemplate.versionHeading').replace('{version}', String(selected.version))
                : t('page.agreementTemplate.starterWording')}
              {selected && selected.status !== 'draft' ? t('page.agreementTemplate.locked') : ''}
            </h2>
            {canEdit && !missingTable ? (
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {editing ? (
                  <button
                    type="button"
                    style={smallBtn}
                    disabled={busy || !body.trim() || (Boolean(selected) && !dirty)}
                    onClick={() => {
                      const parsed = parseAgreementDraftForm({ title, body })
                      if (!parsed.ok) {
                        showToast(parsed.error, 'error')
                        return
                      }
                      void run(
                        () =>
                          saveAgreementDraft(
                            { title: parsed.data.title, body: parsed.data.body },
                            author,
                            templates,
                            selected?.id,
                          ),
                        'Could not save the template',
                        selected ? 'Draft saved' : 'Saved as version 1',
                      )
                    }}
                  >
                    <Save size={12} />{' '}
                    {selected ? t('page.agreementTemplate.saveDraft') : t('page.agreementTemplate.saveAsDraft')}
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
                    <Copy size={12} /> {t('page.agreementTemplate.startNewDraft')}
                  </button>
                )}
                {selected?.status === 'draft' ? (
                  <>
                    <button
                      type="button"
                      style={smallBtn}
                      disabled={busy || dirty || problems.unknown.length > 0}
                      title={dirty ? t('page.agreementTemplate.saveDraftFirst') : undefined}
                      onClick={() => setApproving({ by: '', on: format(new Date(), 'yyyy-MM-dd'), note: '' })}
                    >
                      <FileSignature size={12} /> {t('page.agreementTemplate.markApproved')}
                    </button>
                    <button
                      type="button"
                      style={{ ...smallBtn, color: colors.danger }}
                      disabled={busy}
                      aria-label={t('page.agreementTemplate.deleteDraft')}
                      onClick={() =>
                        window.confirm(
                          t('page.agreementTemplate.deleteConfirm').replace('{version}', String(selected.version)),
                        ) &&
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
              {t('page.agreementTemplate.name')}
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
              {t('page.agreementTemplate.wording')}
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
              {t('page.agreementTemplate.wordingHint')}
            </p>
          </div>

          {problems.unknown.length ? (
            <p style={{ color: colors.danger, fontSize: 13, margin: '8px 0 0' }}>
              {t('page.agreementTemplate.unknownPlaceholders').replace(
                '{list}',
                problems.unknown.map((k) => `{{${k}}}`).join(', '),
              )}
            </p>
          ) : null}
          {problems.missing.length ? (
            <p style={{ color: colors.warn, fontSize: 13, margin: '8px 0 0' }}>
              {t('page.agreementTemplate.missingPlaceholders').replace(
                '{list}',
                problems.missing.map((k) => `{{${k}}}`).join(', '),
              )}
            </p>
          ) : null}

          {editing ? (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13 }}>{t('page.agreementTemplate.fillable')}</summary>
              <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 4 }}>
                {AGREEMENT_PLACEHOLDERS.map((p) => (
                  <li key={p.key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                    <button type="button" style={{ ...smallBtn, padding: '3px 8px' }} onClick={() => insert(p.key)}>
                      {t('page.agreementTemplate.add')}
                    </button>
                    <code>{`{{${p.key}}}`}</code>
                    <span style={{ color: colors.muted }}>{p.label}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {editing ? (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13 }}>
                {t('page.agreementTemplate.insertClause')}{' '}
                <Link to="/clause-library" style={{ color: colors.accent, marginLeft: 6 }} onClick={(e) => e.stopPropagation()}>
                  {t('page.agreementTemplate.manageLibrary')}
                </Link>
              </summary>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {clauses.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    style={{ ...smallBtn, padding: '3px 8px' }}
                    title={c.clause_key}
                    onClick={() => insertClause(c)}
                  >
                    {c.title}
                  </button>
                ))}
                {!clauses.length ? (
                  <span style={{ fontSize: 12, color: colors.muted }}>{t('page.agreementTemplate.noActiveClauses')}</span>
                ) : null}
              </div>
            </details>
          ) : null}
        </section>

        <section style={cardStyle} aria-label={t('page.agreementTemplate.preview')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <h2 style={{ ...sectionTitleStyle, margin: 0 }}>{t('page.agreementTemplate.preview')}</h2>
            <button type="button" style={smallBtn} onClick={samplePdf}>
              <Download size={12} /> {t('page.agreementTemplate.samplePdf')}
            </button>
          </div>
          <p style={{ color: colors.muted, fontSize: 12, margin: '6px 0 10px' }}>
            {t('page.agreementTemplate.previewHint')}
          </p>
          <AgreementPreview blocks={preview.blocks} />
        </section>
      </div>

      <Modal
        open={Boolean(approving)}
        title={t('page.agreementTemplate.approveModalTitle')}
        onClose={() => setApproving(null)}
        width={480}
      >
        {approving && selected ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const parsed = parseAgreementApproveForm({
                approvedBy: approving.by,
                approvedOn: approving.on,
                note: approving.note,
              })
              if (!parsed.ok) {
                showToast(parsed.error, 'error')
                return
              }
              void run(
                () =>
                  approveAgreementTemplate(
                    selected.id,
                    {
                      approvedBy: parsed.data.approvedBy,
                      approvedOn: parsed.data.approvedOn,
                      note: parsed.data.note,
                    },
                    templates,
                  ),
                'Could not approve the template',
                `Version ${selected.version} is approved and in use`,
              ).then(() => setApproving(null))
            }}
          >
            <p style={{ margin: '0 0 12px', fontSize: 13, color: colors.muted }}>
              {t('page.agreementTemplate.approveBlurb').replace('{version}', String(selected.version))}
              {inUse?.status === 'approved'
                ? t('page.agreementTemplate.approveKept').replace('{version}', String(inUse.version))
                : ''}
            </p>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="approved-by">
                {t('page.agreementTemplate.lawyerName')}
              </label>
              <input
                id="approved-by"
                style={inputStyle}
                required
                value={approving.by}
                onChange={(e) => setApproving({ ...approving, by: e.target.value })}
                placeholder={t('page.agreementTemplate.lawyerPlaceholder')}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="approved-on">
                {t('page.agreementTemplate.approvedOn')}
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
                {t('page.agreementTemplate.note')}
              </label>
              <input
                id="approval-note"
                style={inputStyle}
                value={approving.note}
                onChange={(e) => setApproving({ ...approving, note: e.target.value })}
                placeholder={t('page.agreementTemplate.notePlaceholder')}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button type="button" style={buttonSecondaryStyle} onClick={() => setApproving(null)}>
                {t('page.agreementTemplate.cancel')}
              </button>
              <button type="submit" style={buttonPrimaryStyle} disabled={busy || !approving.by.trim()}>
                {t('page.agreementTemplate.approveVersion').replace('{version}', String(selected.version))}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  )
}
