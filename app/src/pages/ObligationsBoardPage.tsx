import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import SavedViewsBar from '../components/SavedViewsBar'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import { errorMessage } from '../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv, parseListIoRows } from '../lib/listIo'
import {
  OBLIGATION_OWNERS,
  OBLIGATION_STATUSES,
  obligationIsOverdue,
  obligationOwnerLabel,
  obligationStatusLabel,
} from '../lib/obligationBoard'
import {
  listContractObligations,
  saveContractObligation,
  setObligationStatus,
} from '../lib/obligationBoardStore'
import { OBLIGATIONS_CSV_COLUMNS } from '../lib/obligationsCsv'
import { can } from '../lib/permissions'
import { parseObligationForm } from '../lib/schemas/obligation'
import type {
  ContractObligation,
  ContractObligationOwner,
  ContractObligationStatus,
} from '../lib/types'
import { btn, btnGhost, btnPrimary, colors, input } from '../lib/pageStyles'
import { pageStyle, pageSubtitleStyle, pageTitleStyle } from '../lib/uiStyles'

const card: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  padding: 16,
  background: colors.card,
  display: 'grid',
  gap: 10,
}

const emptyForm = {
  company_name: '',
  crm_id: '',
  legal_document_id: null as string | null,
  title: '',
  description: '',
  owner_party: 'red_reach' as ContractObligationOwner,
  due_date: '' as string | null,
  status: 'open' as ContractObligationStatus,
}

type Filter = 'open' | 'done' | 'cancelled' | 'all'

export default function ObligationsBoardPage() {
  const { t } = useI18n()
  const { userRole, user, appUserId } = useAuth()
  const { showToast } = useToast()
  const canEdit = can(userRole, 'delivery.contracts')
  const [rows, setRows] = useState<ContractObligation[]>([])
  const [missingTable, setMissingTable] = useState(false)
  const [filter, setFilter] = useState<Filter>('open')
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState('')
  const [busy, setBusy] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const obligationsViewFilters = useMemo(() => ({ status: filter }), [filter])

  const load = useCallback(async () => {
    const r = await listContractObligations()
    setRows(r.rows)
    setMissingTable(r.missingTable)
  }, [])

  useEffect(() => {
    void load().catch((e) => showToast(errorMessage(e, 'Could not load obligations'), 'error'))
  }, [load, showToast])

  const visible = useMemo(() => {
    if (filter === 'all') return rows
    return rows.filter((r) => r.status === filter)
  }, [rows, filter])

  function startNew() {
    setEditingId('')
    setForm(emptyForm)
    setShowForm(true)
  }

  function startEdit(row: ContractObligation) {
    setEditingId(row.id)
    setForm({
      company_name: row.company_name,
      crm_id: row.crm_id,
      legal_document_id: row.legal_document_id,
      title: row.title,
      description: row.description,
      owner_party: row.owner_party,
      due_date: row.due_date || '',
      status: row.status,
    })
    setShowForm(true)
  }

  async function save() {
    const parsed = parseObligationForm({
      ...form,
      due_date: form.due_date || null,
    })
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    setBusy(true)
    try {
      await saveContractObligation(parsed.data, user?.email || '', editingId || undefined)
      showToast(editingId ? 'Obligation saved' : 'Obligation added', 'success')
      setShowForm(false)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save obligation'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function mark(id: string, status: 'open' | 'done' | 'cancelled') {
    setBusy(true)
    try {
      await setObligationStatus(id, status)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not update status'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function importObligationsCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      const objects = csvRowsToObjects(headers, csvRows).map((row) => {
        const normalized: Record<string, string> = {}
        for (const c of OBLIGATIONS_CSV_COLUMNS) {
          normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
        }
        return normalized
      })
      const { ok, errors } = parseListIoRows(objects, OBLIGATIONS_CSV_COLUMNS)
      if (!ok.length && errors.length) {
        showToast(errors[0] || 'No valid obligation rows', 'error')
        return
      }
      const ownerSet = new Set(OBLIGATION_OWNERS.map((o) => o.value))
      const statusSet = new Set(OBLIGATION_STATUSES.map((s) => s.value))
      let saved = 0
      let skipped = errors.length
      for (const row of ok) {
        const owner = ownerSet.has(row.owner_party as ContractObligationOwner)
          ? (row.owner_party as ContractObligationOwner)
          : 'red_reach'
        const status = statusSet.has(row.status as ContractObligationStatus)
          ? (row.status as ContractObligationStatus)
          : 'open'
        const due = row.due_date && /^\d{4}-\d{2}-\d{2}$/.test(row.due_date.slice(0, 10))
          ? row.due_date.slice(0, 10)
          : null
        const parsed = parseObligationForm({
          company_name: row.company_name,
          crm_id: row.crm_id || '',
          legal_document_id: null,
          title: row.title,
          description: row.description || '',
          owner_party: owner,
          due_date: due,
          status,
        })
        if (!parsed.ok) {
          skipped += 1
          continue
        }
        await saveContractObligation(parsed.data, user?.email || '')
        saved += 1
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} obligation(s)${skipNote}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Obligations CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <div style={pageStyle}>
      <h1 style={pageTitleStyle}>{t('page.obligations.title')}</h1>
      <p style={pageSubtitleStyle}>
        {t('page.obligations.subtitleLead')}{' '}
        <Link to="/clause-library" style={{ color: colors.accentText }}>
          {t('page.obligations.clauseLibrary')}
        </Link>
        {t('page.obligations.subtitleTrail')}
      </p>

      {missingTable ? (
        <p style={{ color: colors.muted, fontSize: 13 }}>{t('page.obligations.missingTable')}</p>
      ) : (
        <>
          <SavedViewsBar
            moduleId="obligations"
            filters={obligationsViewFilters}
            ownerUserId={appUserId}
            canWrite={canEdit}
            applyDefaultOnLoad={false}
            onApply={(f) => {
              const next = String(f.status || 'open')
              if (next === 'open' || next === 'done' || next === 'cancelled' || next === 'all') {
                setFilter(next)
              }
            }}
            onToast={showToast}
            filtersEqual={(a, b) => String(a.status || 'open') === String(b.status || 'open')}
          />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            {(['open', 'done', 'cancelled', 'all'] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                style={{
                  ...btnGhost,
                  fontWeight: filter === f ? 700 : 400,
                  borderColor: filter === f ? colors.accent : colors.border,
                }}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? t('page.obligations.filterAll') : obligationStatusLabel(f)}
              </button>
            ))}
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void importObligationsCsv(file)
              }}
            />
            {canEdit ? (
              <button
                type="button"
                style={btnGhost}
                disabled={importing}
                onClick={() => importInputRef.current?.click()}
              >
                {importing ? 'Importing…' : 'Import CSV'}
              </button>
            ) : null}
            <button
              type="button"
              style={btnGhost}
              disabled={!visible.length}
              onClick={() => {
                exportListCsv(
                  'obligations.csv',
                  OBLIGATIONS_CSV_COLUMNS.map((c) => c.key),
                  visible.map((r) => ({
                    company_name: r.company_name,
                    title: r.title,
                    owner_party: r.owner_party,
                    due_date: r.due_date || '',
                    status: r.status,
                    description: r.description,
                    crm_id: r.crm_id,
                  })),
                )
                showToast('Obligations CSV downloaded', 'success')
              }}
            >
              Export CSV
            </button>
            {canEdit ? (
              <button type="button" style={btnPrimary} onClick={startNew}>
                {t('page.obligations.new')}
              </button>
            ) : null}
          </div>

          {showForm && canEdit ? (
            <section style={{ ...card, marginBottom: 16 }}>
              <strong style={{ fontSize: 14 }}>
                {editingId ? t('page.obligations.edit') : t('page.obligations.new')}
              </strong>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label style={{ display: 'grid', gap: 4, fontSize: 12, color: colors.muted }}>
                  {t('page.obligations.company')}
                  <input
                    style={input}
                    value={form.company_name}
                    onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                  />
                </label>
                <label style={{ display: 'grid', gap: 4, fontSize: 12, color: colors.muted }}>
                  {t('page.obligations.titleField')}
                  <input
                    style={input}
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </label>
                <label style={{ display: 'grid', gap: 4, fontSize: 12, color: colors.muted }}>
                  {t('page.obligations.owner')}
                  <select
                    style={input}
                    value={form.owner_party}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, owner_party: e.target.value as ContractObligationOwner }))
                    }
                  >
                    {OBLIGATION_OWNERS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 4, fontSize: 12, color: colors.muted }}>
                  {t('page.obligations.dueDate')}
                  <input
                    style={input}
                    type="date"
                    value={form.due_date || ''}
                    onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                  />
                </label>
                <label style={{ display: 'grid', gap: 4, fontSize: 12, color: colors.muted }}>
                  {t('page.obligations.status')}
                  <select
                    style={input}
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, status: e.target.value as ContractObligationStatus }))
                    }
                  >
                    {OBLIGATION_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: colors.muted }}>
                {t('page.obligations.details')}
                <textarea
                  style={{ ...input, minHeight: 72, resize: 'vertical' }}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={btnPrimary} disabled={busy} onClick={() => void save()}>
                  {busy ? t('page.obligations.saving') : t('page.obligations.save')}
                </button>
                <button type="button" style={btn} onClick={() => setShowForm(false)}>
                  {t('page.obligations.cancel')}
                </button>
              </div>
            </section>
          ) : null}

          <div style={{ display: 'grid', gap: 8 }}>
            {visible.map((row) => {
              const overdue = obligationIsOverdue(row)
              return (
                <div
                  key={row.id}
                  style={{
                    ...card,
                    borderColor: overdue ? 'rgba(220, 38, 38, 0.45)' : colors.border,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <strong style={{ fontSize: 14 }}>{row.title}</strong>
                      <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                        {row.company_name} · {obligationOwnerLabel(row.owner_party)} ·{' '}
                        {obligationStatusLabel(row.status)}
                        {row.due_date ? ` · due ${row.due_date}` : ''}
                        {overdue ? t('page.obligations.overdue') : ''}
                      </div>
                      {row.description ? (
                        <p style={{ margin: '8px 0 0', fontSize: 13, color: colors.text }}>{row.description}</p>
                      ) : null}
                    </div>
                    {canEdit ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <button type="button" style={btnGhost} disabled={busy} onClick={() => startEdit(row)}>
                          {t('page.obligations.editRow')}
                        </button>
                        {row.status === 'open' ? (
                          <button type="button" style={btnPrimary} disabled={busy} onClick={() => void mark(row.id, 'done')}>
                            {t('page.obligations.markDone')}
                          </button>
                        ) : null}
                        {row.status === 'done' ? (
                          <button type="button" style={btnGhost} disabled={busy} onClick={() => void mark(row.id, 'open')}>
                            {t('page.obligations.reopen')}
                          </button>
                        ) : null}
                        {row.status !== 'cancelled' ? (
                          <button
                            type="button"
                            style={btnGhost}
                            disabled={busy}
                            onClick={() => void mark(row.id, 'cancelled')}
                          >
                            {t('page.obligations.cancelRow')}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}
            {!visible.length ? (
              <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>{t('page.obligations.empty')}</p>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
