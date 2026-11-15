import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import { errorMessage } from '../lib/errors'
import {
  CLAUSE_CATEGORIES,
  CLAUSE_STATUSES,
  clauseCategoryLabel,
  clauseStatusLabel,
} from '../lib/clauseLibrary'
import { CLAUSE_LIBRARY_CSV_COLUMNS } from '../lib/clauseLibraryCsv'
import { deleteContractClause, listContractClauses, saveContractClause } from '../lib/clauseLibraryStore'
import { csvRowsToObjects, exportListCsv, parseCsv, parseListIoRows } from '../lib/listIo'
import { can } from '../lib/permissions'
import { parseClauseForm } from '../lib/schemas/clause'
import type { ContractClause, ContractClauseCategory, ContractClauseStatus } from '../lib/types'
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
  clause_key: '',
  title: '',
  body: '',
  category: 'general' as ContractClauseCategory,
  status: 'draft' as ContractClauseStatus,
  sort_order: 100,
  notes: '',
}

export default function ClauseLibraryPage() {
  const { t } = useI18n()
  const { userRole, user } = useAuth()
  const { showToast } = useToast()
  const canEdit = can(userRole, 'delivery.packages')
  const [rows, setRows] = useState<ContractClause[]>([])
  const [missingTable, setMissingTable] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(
    async (select?: string) => {
      const r = await listContractClauses()
      setRows(r.rows)
      setMissingTable(r.missingTable)
      const pick = r.rows.find((c) => c.id === select) ?? r.rows[0]
      setSelectedId(pick?.id ?? '')
      if (pick) {
        setForm({
          clause_key: pick.clause_key,
          title: pick.title,
          body: pick.body,
          category: pick.category,
          status: pick.status,
          sort_order: pick.sort_order,
          notes: pick.notes,
        })
      } else {
        setForm(emptyForm)
      }
    },
    [],
  )

  useEffect(() => {
    void load().catch((e) => showToast(errorMessage(e, 'Could not load clauses'), 'error'))
  }, [load, showToast])

  const selected = rows.find((c) => c.id === selectedId) ?? null
  const editing = canEdit && !missingTable

  function newClause() {
    setSelectedId('')
    setForm(emptyForm)
  }

  async function save() {
    const parsed = parseClauseForm({
      ...form,
      sort_order: Number(form.sort_order) || 0,
    })
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    setBusy(true)
    try {
      const id = await saveContractClause(parsed.data, user?.email || '', selectedId || undefined)
      showToast(selectedId ? 'Clause saved' : 'Clause created', 'success')
      await load(id)
    } catch (e) {
      showToast(errorMessage(e, 'Could not save clause'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function removeDraft() {
    if (!selected || selected.status !== 'draft') return
    if (!window.confirm('Delete this draft clause?')) return
    setBusy(true)
    try {
      await deleteContractClause(selected.id)
      showToast('Draft deleted', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not delete draft'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function importClausesCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      const objects = csvRowsToObjects(headers, csvRows).map((row) => {
        const normalized: Record<string, string> = {}
        for (const c of CLAUSE_LIBRARY_CSV_COLUMNS) {
          normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
        }
        return normalized
      })
      const { ok, errors } = parseListIoRows(objects, CLAUSE_LIBRARY_CSV_COLUMNS)
      if (!ok.length && errors.length) {
        showToast(errors[0] || 'No valid clause rows', 'error')
        return
      }
      const categorySet = new Set(CLAUSE_CATEGORIES.map((c) => c.value))
      const statusSet = new Set(CLAUSE_STATUSES.map((s) => s.value))
      const byKey = new Map(rows.map((r) => [r.clause_key.toLowerCase(), r.id] as const))
      let saved = 0
      let skipped = errors.length
      for (const row of ok) {
        const category = categorySet.has(row.category as ContractClauseCategory)
          ? (row.category as ContractClauseCategory)
          : 'general'
        const status = statusSet.has(row.status as ContractClauseStatus)
          ? (row.status as ContractClauseStatus)
          : 'draft'
        const sortOrder = row.sort_order ? Number(row.sort_order) : 100
        const parsed = parseClauseForm({
          clause_key: row.clause_key,
          title: row.title,
          body: row.body,
          category,
          status,
          sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
          notes: row.notes || '',
        })
        if (!parsed.ok) {
          skipped += 1
          continue
        }
        const existingId = byKey.get(parsed.data.clause_key.toLowerCase())
        const id = await saveContractClause(parsed.data, user?.email || '', existingId)
        byKey.set(parsed.data.clause_key.toLowerCase(), id)
        saved += 1
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} clause(s)${skipNote}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Clause CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <div style={pageStyle}>
      <h1 style={pageTitleStyle}>{t('page.clauseLibrary.title')}</h1>
      <p style={pageSubtitleStyle}>{t('page.clauseLibrary.subtitle')}</p>

      {missingTable ? (
        <p style={{ color: colors.muted, fontSize: 13 }}>{t('page.clauseLibrary.missingTable')}</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 16 }}>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14 }}>{t('page.clauseLibrary.list')}</strong>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void importClausesCsv(file)
                  }}
                />
                {editing ? (
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
                  disabled={!rows.length}
                  onClick={() => {
                    exportListCsv(
                      'clause-library.csv',
                      CLAUSE_LIBRARY_CSV_COLUMNS.map((c) => c.key),
                      rows.map((c) => ({
                        clause_key: c.clause_key,
                        title: c.title,
                        body: c.body,
                        category: c.category,
                        status: c.status,
                        sort_order: c.sort_order,
                        notes: c.notes,
                      })),
                    )
                    showToast('Clause library CSV downloaded', 'success')
                  }}
                >
                  Export CSV
                </button>
                {editing ? (
                  <button type="button" style={btnGhost} onClick={newClause}>
                    {t('page.clauseLibrary.new')}
                  </button>
                ) : null}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 6, maxHeight: 480, overflow: 'auto' }}>
              {rows.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  style={{
                    ...btnGhost,
                    textAlign: 'left',
                    borderColor: c.id === selectedId ? colors.accent : colors.border,
                    background: c.id === selectedId ? 'rgba(200,50,26,0.06)' : colors.card,
                  }}
                  onClick={() => {
                    setSelectedId(c.id)
                    setForm({
                      clause_key: c.clause_key,
                      title: c.title,
                      body: c.body,
                      category: c.category,
                      status: c.status,
                      sort_order: c.sort_order,
                      notes: c.notes,
                    })
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{c.title}</div>
                  <div style={{ fontSize: 11, color: colors.muted }}>
                    {c.clause_key} · {clauseCategoryLabel(c.category)} · {clauseStatusLabel(c.status)}
                  </div>
                </button>
              ))}
              {!rows.length ? (
                <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>{t('page.clauseLibrary.empty')}</p>
              ) : null}
            </div>
          </div>

          <div style={card}>
            <label style={{ display: 'grid', gap: 4, fontSize: 12, color: colors.muted }}>
              {t('page.clauseLibrary.key')}
              <input
                style={input}
                value={form.clause_key}
                disabled={!editing}
                onChange={(e) => setForm((f) => ({ ...f, clause_key: e.target.value }))}
                placeholder="recipient_care"
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12, color: colors.muted }}>
              {t('page.clauseLibrary.titleField')}
              <input
                style={input}
                value={form.title}
                disabled={!editing}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 8 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: colors.muted }}>
                {t('page.clauseLibrary.category')}
                <select
                  style={input}
                  value={form.category}
                  disabled={!editing}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value as ContractClauseCategory }))
                  }
                >
                  {CLAUSE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: colors.muted }}>
                {t('page.clauseLibrary.status')}
                <select
                  style={input}
                  value={form.status}
                  disabled={!editing}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ContractClauseStatus }))}
                >
                  {CLAUSE_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: colors.muted }}>
                {t('page.clauseLibrary.sort')}
                <input
                  style={input}
                  type="number"
                  value={form.sort_order}
                  disabled={!editing}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
                />
              </label>
            </div>
            <label style={{ display: 'grid', gap: 4, fontSize: 12, color: colors.muted }}>
              {t('page.clauseLibrary.wording')}
              <textarea
                style={{ ...input, minHeight: 180, resize: 'vertical' }}
                value={form.body}
                disabled={!editing}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12, color: colors.muted }}>
              {t('page.clauseLibrary.notes')}
              <input
                style={input}
                value={form.notes}
                disabled={!editing}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>
            {editing ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" style={btnPrimary} disabled={busy} onClick={() => void save()}>
                  {busy
                    ? t('page.clauseLibrary.saving')
                    : selectedId
                      ? t('page.clauseLibrary.save')
                      : t('page.clauseLibrary.create')}
                </button>
                {selected?.status === 'draft' ? (
                  <button type="button" style={btn} disabled={busy} onClick={() => void removeDraft()}>
                    {t('page.clauseLibrary.deleteDraft')}
                  </button>
                ) : null}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>{t('page.clauseLibrary.readOnly')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
