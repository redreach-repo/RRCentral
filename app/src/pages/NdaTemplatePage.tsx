import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { formatClauseForTemplate, insertTextAtCursor } from '../lib/clauseCompose'
import { listContractClauses } from '../lib/clauseLibraryStore'
import { errorMessage } from '../lib/errors'
import { parseNdaApproveForm, parseNdaDraftForm } from '../lib/schemas/ndaTemplate'
import { can } from '../lib/permissions'
import {
  DEFAULT_NDA_BODY,
  DEFAULT_NDA_TITLE,
  NDA_PLACEHOLDERS,
  buildNda,
  ndaFooter,
  templateInUse,
  unknownPlaceholders,
} from '../lib/nda'
import { ndaPdf } from '../lib/ndaPdf'
import {
  approveNdaTemplate,
  deleteNdaDraft,
  listNdaTemplates,
  saveNdaDraft,
} from '../lib/ndaTemplateStore'
import { btn, btnGhost, btnPrimary, colors, input } from '../lib/pageStyles'
import { pageStyle, pageSubtitleStyle, pageTitleStyle } from '../lib/uiStyles'
import type { ContractClause, NdaTemplate } from '../lib/types'

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const card: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  padding: 16,
  background: colors.card,
  display: 'grid',
  gap: 10,
}

export default function NdaTemplatePage() {
  const { t } = useI18n()
  const { userRole, user } = useAuth()
  const { settings } = useSettings()
  const { showToast } = useToast()
  const canEdit = can(userRole, 'delivery.packages')
  const [templates, setTemplates] = useState<NdaTemplate[]>([])
  const [missingTable, setMissingTable] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [title, setTitle] = useState(DEFAULT_NDA_TITLE)
  const [body, setBody] = useState(DEFAULT_NDA_BODY)
  const [busy, setBusy] = useState(false)
  const [approving, setApproving] = useState<{ by: string; on: string; note: string } | null>(null)
  const [clauses, setClauses] = useState<ContractClause[]>([])
  const textRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(
    async (select?: string) => {
      const r = await listNdaTemplates()
      setTemplates(r.rows)
      setMissingTable(r.missingTable)
      const pick = r.rows.find((t) => t.id === select) ?? templateInUse(r.rows) ?? r.rows[0]
      setSelectedId(pick?.id ?? '')
      setTitle(pick?.title ?? DEFAULT_NDA_TITLE)
      setBody(pick?.body ?? DEFAULT_NDA_BODY)
    },
    [],
  )

  useEffect(() => {
    void load().catch((e) => showToast(errorMessage(e, 'Could not load NDA templates'), 'error'))
  }, [load, showToast])

  useEffect(() => {
    void listContractClauses()
      .then((r) => setClauses(r.rows.filter((c) => c.status === 'active')))
      .catch(() => setClauses([]))
  }, [])

  const selected = templates.find((t) => t.id === selectedId) ?? null
  const inUse = templateInUse(templates)
  const editing = canEdit && !missingTable && (!selected || selected.status === 'draft')
  const dirty = selected ? selected.body !== body || selected.title !== title : true
  const unknown = unknownPlaceholders(body)
  const preview = useMemo(
    () =>
      buildNda(body, {
        effectiveDate: new Date().toISOString().slice(0, 10),
        providerName: settings.companyName || 'Red Reach Middle East FZE',
        providerAddress: settings.address || 'Umm Al Quwain, UAE',
        partyCompany: 'Sample Client LLC',
        partyName: 'Alex Client',
        partyEmail: 'alex@sample.ae',
      }),
    [body, settings.address, settings.companyName],
  )

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

  return (
    <div style={pageStyle}>
      <div>
        <h1 style={pageTitleStyle}>{t('page.ndaTemplate.title')}</h1>
        <p style={pageSubtitleStyle}>{t('page.ndaTemplate.subtitle')}</p>
      </div>

      {missingTable ? (
        <p style={{ color: colors.warn, fontSize: 13 }}>
          Run <code>supabase/migrations/20261206120000_legal_documents.sql</code> in Supabase to save and approve
          templates.
        </p>
      ) : null}

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 15 }}>In use now</h2>
        {inUse?.status === 'approved' ? (
          <p style={{ margin: 0, fontSize: 13 }}>
            <CheckCircle2 size={14} style={{ color: colors.success, verticalAlign: -2, marginRight: 6 }} />
            Version {inUse.version}, approved by {inUse.approved_by}
            {inUse.approved_at ? ` on ${String(inUse.approved_at).slice(0, 10)}` : ''}.
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>No approved NDA yet — sent PDFs will say DRAFT.</p>
        )}
      </section>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)' }}>
        <section style={card}>
          <h2 style={{ margin: 0, fontSize: 15 }}>Versions</h2>
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              style={{
                ...btnGhost,
                justifyContent: 'flex-start',
                fontWeight: t.id === selectedId ? 700 : 400,
              }}
              onClick={() => {
                if (dirty && editing && !window.confirm('Leave without saving?')) return
                setSelectedId(t.id)
                setTitle(t.title)
                setBody(t.body)
              }}
            >
              v{t.version} · {t.status}
            </button>
          ))}
          {canEdit ? (
            <button
              type="button"
              style={btn}
              disabled={busy}
              onClick={() =>
                void run(
                  () => saveNdaDraft({ title: DEFAULT_NDA_TITLE, body: selected?.body || DEFAULT_NDA_BODY }, user?.email || '', templates),
                  'Could not start a draft',
                  'New draft created',
                )
              }
            >
              New draft from {selected ? `v${selected.version}` : 'starter'}
            </button>
          ) : null}
        </section>

        <section style={card}>
          <label style={{ fontSize: 12, color: colors.muted }}>
            Title
            <input style={{ ...input, marginTop: 4 }} value={title} disabled={!editing} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label style={{ fontSize: 12, color: colors.muted }}>
            Wording
            <textarea
              ref={textRef}
              style={{ ...input, marginTop: 4, minHeight: 280, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
              value={body}
              disabled={!editing}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {NDA_PLACEHOLDERS.map((p) => (
              <button key={p.key} type="button" style={btnGhost} disabled={!editing} onClick={() => insert(p.key)} title={p.label}>
                {`{{${p.key}}}`}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: colors.muted }}>Insert clause</span>
              <Link to="/clause-library" style={{ fontSize: 12, color: colors.accent }}>
                Manage library
              </Link>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {clauses.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  style={btnGhost}
                  disabled={!editing}
                  title={c.clause_key}
                  onClick={() => insertClause(c)}
                >
                  {c.title}
                </button>
              ))}
              {!clauses.length ? (
                <span style={{ fontSize: 12, color: colors.muted }}>No active clauses — add some in the clause library.</span>
              ) : null}
            </div>
          </div>
          {unknown.length ? (
            <p style={{ margin: 0, fontSize: 12, color: colors.warn }}>Unknown placeholders: {unknown.join(', ')}</p>
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {editing ? (
              <button
                type="button"
                style={btnPrimary}
                disabled={busy || !dirty}
                onClick={() => {
                  const parsed = parseNdaDraftForm({ title, body })
                  if (!parsed.ok) {
                    showToast(parsed.error, 'error')
                    return
                  }
                  void run(
                    () =>
                      saveNdaDraft(
                        { title: parsed.data.title, body: parsed.data.body },
                        user?.email || '',
                        templates,
                        selected?.id,
                      ),
                    'Could not save',
                    'Draft saved',
                  )
                }}
              >
                Save draft
              </button>
            ) : null}
            <button
              type="button"
              style={btn}
              onClick={() => {
                const blob = ndaPdf(preview.blocks, {
                  footer: `SAMPLE. ${ndaFooter(selected)}`,
                  draft: !selected || selected.status !== 'approved',
                  providerName: settings.companyName || 'Red Reach Middle East FZE',
                  partyCompany: 'Sample Client LLC',
                  partyName: 'Alex Client',
                })
                downloadBlob(blob, 'NDA-sample.pdf')
              }}
            >
              Sample PDF
            </button>
            {canEdit && selected?.status === 'draft' ? (
              <>
                <button type="button" style={btnPrimary} disabled={busy} onClick={() => setApproving({ by: '', on: new Date().toISOString().slice(0, 10), note: '' })}>
                  Mark approved by lawyer
                </button>
                <button
                  type="button"
                  style={btnGhost}
                  disabled={busy}
                  onClick={() =>
                    void run(() => deleteNdaDraft(selected.id), 'Could not delete', 'Draft deleted').then(() => load())
                  }
                >
                  Delete draft
                </button>
              </>
            ) : null}
          </div>
        </section>
      </div>

      {approving && selected ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 50,
            padding: 16,
          }}
        >
          <div style={{ ...card, maxWidth: 420, width: '100%' }}>
            <h3 style={{ margin: 0 }}>Approve NDA v{selected.version}</h3>
            <label style={{ fontSize: 12 }}>
              Lawyer name
              <input style={{ ...input, marginTop: 4 }} value={approving.by} onChange={(e) => setApproving({ ...approving, by: e.target.value })} />
            </label>
            <label style={{ fontSize: 12 }}>
              Date
              <input style={{ ...input, marginTop: 4 }} type="date" value={approving.on} onChange={(e) => setApproving({ ...approving, on: e.target.value })} />
            </label>
            <label style={{ fontSize: 12 }}>
              Note
              <input style={{ ...input, marginTop: 4 }} value={approving.note} onChange={(e) => setApproving({ ...approving, note: e.target.value })} />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={btnGhost} onClick={() => setApproving(null)}>
                Cancel
              </button>
              <button
                type="button"
                style={btnPrimary}
                disabled={busy}
                onClick={() => {
                  const parsed = parseNdaApproveForm({
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
                      approveNdaTemplate(
                        selected.id,
                        {
                          approvedBy: parsed.data.approvedBy,
                          approvedOn: parsed.data.approvedOn,
                          note: parsed.data.note,
                        },
                        templates,
                      ),
                    'Could not approve',
                    'NDA template approved',
                  ).then(() => setApproving(null))
                }}
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
