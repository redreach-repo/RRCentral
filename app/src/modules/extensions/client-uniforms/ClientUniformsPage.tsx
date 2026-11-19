import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Plus, Shirt, Upload } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import EmptyState from '../../../components/EmptyState'
import Modal from '../../../components/Modal'
import { db } from '../../../lib/db'
import { errorMessage } from '../../../lib/errors'
import { exportListCsv } from '../../../lib/listIo'
import {
  UNIFORM_CSV_HEADERS,
  UNIFORM_ITEMS,
  UNIFORM_SIZE_FIELDS,
  canDeleteUniformIssue,
  canEditUniforms,
  filterUniformStaff,
  issuesForStaff,
  latestIssueByStaff,
  sizeForItem,
  uniformClientName,
  uniformCsvRows,
  uniformIssueProblem,
  uniformSizeSummary,
  uniformStaffProblem,
  type UniformIssue,
  type UniformStaff,
} from '../../../lib/clientUniforms/clientUniforms'
import {
  addUniformIssue,
  deleteUniformIssue,
  loadClientUniforms,
  saveUniformStaff,
  type UniformStaffInput,
} from '../../../lib/clientUniforms/clientUniformsStore'
import { buttonPrimaryStyle, buttonSecondaryStyle, inputStyle, labelStyle, selectStyle } from '../../../lib/uiStyles'
import docsStyles from '../../../styles/docsList.module.css'
import UniformImportModal from './UniformImportModal'

type ClientOpt = { id: string; company_name: string }

const smallBtn = { ...buttonSecondaryStyle, padding: '4px 10px', fontSize: 12 }
const grid = { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }

const EMPTY_PERSON: UniformStaffInput = {
  client_id: '',
  full_name: '',
  employee_code: '',
  department: '',
  job_title: '',
  shirt_size: '',
  trouser_size: '',
  jacket_size: '',
  shoe_size: '',
  cap_size: '',
  other_sizes: '',
  active: true,
  notes: '',
}

function fmtDate(d: string): string {
  return d ? format(new Date(`${d}T00:00:00`), 'dd MMM yyyy') : '—'
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** RR Threads: uniform sizes of our clients' staff and when each item was issued. */
export default function ClientUniformsPage() {
  const { userRole } = useAuth()
  const { showToast } = useToast()
  const canEdit = canEditUniforms(userRole)
  const canDelete = canDeleteUniformIssue(userRole)

  const [staff, setStaff] = useState<UniformStaff[]>([])
  const [issues, setIssues] = useState<UniformIssue[]>([])
  const [clients, setClients] = useState<ClientOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [missingTable, setMissingTable] = useState(false)

  const [clientFilter, setClientFilter] = useState('')
  const [search, setSearch] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)

  const [personOpen, setPersonOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [person, setPerson] = useState<UniformStaffInput>(EMPTY_PERSON)

  const [issueFor, setIssueFor] = useState<UniformStaff | null>(null)
  const [item, setItem] = useState('')
  const [size, setSize] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [issuedOn, setIssuedOn] = useState(today())
  const [issueNotes, setIssueNotes] = useState('')

  const [historyFor, setHistoryFor] = useState<UniformStaff | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [res, cl] = await Promise.all([
        loadClientUniforms(),
        db.from('clients').select('id, company_name').order('company_name'),
      ])
      setStaff(res.staff)
      setIssues(res.issues)
      setMissingTable(res.missingTable)
      setClients((cl.data || []) as ClientOpt[])
    } catch (e) {
      showToast(errorMessage(e, 'Could not load uniform sizes'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const latest = useMemo(() => latestIssueByStaff(issues), [issues])
  const filtered = useMemo(
    () => filterUniformStaff(staff, { clientId: clientFilter, search, includeInactive }),
    [staff, clientFilter, search, includeInactive],
  )

  function openNewPerson() {
    setEditingId(null)
    setPerson({ ...EMPTY_PERSON, client_id: clientFilter })
    setPersonOpen(true)
  }

  function openEditPerson(r: UniformStaff) {
    const { id, clients: _c, ...rest } = r
    setEditingId(id)
    setPerson(rest)
    setPersonOpen(true)
  }

  async function savePerson() {
    const problem = uniformStaffProblem({ clientId: person.client_id, fullName: person.full_name })
    if (problem) {
      showToast(problem, 'error')
      return
    }
    setSaving(true)
    try {
      await saveUniformStaff(editingId, person)
      showToast(editingId ? 'Sizes updated' : 'Person added', 'success')
      setPersonOpen(false)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Save failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  function openIssue(r: UniformStaff) {
    setIssueFor(r)
    setItem('Shirt')
    setSize(sizeForItem(r, 'Shirt'))
    setQuantity('1')
    setIssuedOn(today())
    setIssueNotes('')
  }

  async function saveIssue() {
    if (!issueFor) return
    const qty = Number(quantity)
    const problem = uniformIssueProblem({ item, quantity: qty, issuedOn })
    if (problem) {
      showToast(problem, 'error')
      return
    }
    setSaving(true)
    try {
      await addUniformIssue({ staffId: issueFor.id, item, size, quantity: qty, issuedOn, notes: issueNotes })
      showToast(`Issued to ${issueFor.full_name}`, 'success')
      setIssueFor(null)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Save failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function removeIssue(i: UniformIssue) {
    if (!window.confirm(`Remove ${i.quantity} x ${i.item} issued ${fmtDate(i.issued_on)}?`)) return
    try {
      await deleteUniformIssue(i.id)
      showToast('Issue removed', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Remove failed'), 'error')
    }
  }

  const field = (key: keyof UniformStaffInput, label: string, required = false) => (
    <label style={labelStyle}>
      {label}
      {required ? ' *' : ''}
      <input
        style={inputStyle}
        value={String(person[key] ?? '')}
        onChange={(e) => setPerson((p) => ({ ...p, [key]: e.target.value }))}
        required={required}
      />
    </label>
  )

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>RR Threads · client staff</p>
          <h1 className={docsStyles.title}>Uniform sizes</h1>
          <p className={docsStyles.subtitle}>
            Sizes of the people who wear our uniforms at each client, and when each item was issued to them.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!filtered.length}
            onClick={() => {
              exportListCsv('uniform-sizes.csv', UNIFORM_CSV_HEADERS, uniformCsvRows(filtered, latest))
              showToast('Uniform sizes CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
          {canEdit ? (
            <button
              type="button"
              className={docsStyles.newBtn}
              style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
              onClick={() => setImportOpen(true)}
              disabled={missingTable}
            >
              <Upload size={16} /> Upload Excel
            </button>
          ) : null}
          {canEdit ? (
            <button type="button" className={docsStyles.newBtn} onClick={openNewPerson} disabled={missingTable}>
              <Plus size={16} /> Add person
            </button>
          ) : null}
        </div>
      </header>

      <div className={docsStyles.controls}>
        <select
          style={{ ...selectStyle, maxWidth: 280 }}
          aria-label="Client"
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
        >
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.company_name}
            </option>
          ))}
        </select>
        <input
          className={docsStyles.search}
          placeholder="Search name / employee no / department…"
          aria-label="Search client staff"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          Show people who have left
        </label>
      </div>

      {loading ? (
        <div className={docsStyles.loading}>Loading uniform sizes…</div>
      ) : missingTable ? (
        <div className={docsStyles.empty}>
          <EmptyState
            icon={<Shirt size={22} />}
            title="Not switched on yet"
            subtitle="The uniform sizes tables are not in the database yet. Run client-uniform-sizes.sql in Supabase, then reload."
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className={docsStyles.empty}>
          <EmptyState
            icon={<Shirt size={22} />}
            title="No one here yet"
            subtitle={
              staff.length
                ? 'Nothing matches these filters.'
                : 'Add the first client staff member and their sizes, or upload them from Excel.'
            }
            actionLabel={canEdit ? 'Add person' : undefined}
            onAction={canEdit ? openNewPerson : undefined}
          />
        </div>
      ) : (
        <div className={docsStyles.tableShell}>
          <div className={docsStyles.tableWrap}>
            <table className={docsStyles.table}>
              <thead>
                <tr>
                  <th className={docsStyles.colRef}>Name</th>
                  <th className={docsStyles.colClient}>Client</th>
                  <th>Sizes</th>
                  <th className={docsStyles.colDate}>Last issued</th>
                  <th className={docsStyles.colActions} style={{ textAlign: 'right' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const last = latest.get(r.id)
                  return (
                    <tr key={r.id}>
                      <td className={docsStyles.colRef}>
                        <div className={docsStyles.ref}>{r.full_name}</div>
                        <div className={docsStyles.meta}>
                          {[r.employee_code, r.job_title, r.active ? '' : 'Left'].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </td>
                      <td className={`${docsStyles.colClient} ${docsStyles.clientCell}`}>
                        {uniformClientName(r)}
                        {r.department ? <div className={docsStyles.meta}>{r.department}</div> : null}
                      </td>
                      <td>{uniformSizeSummary(r) || '—'}</td>
                      <td className={docsStyles.colDate}>
                        {last ? (
                          <>
                            {fmtDate(last.issued_on)}
                            <div className={docsStyles.meta}>
                              {last.quantity} x {last.item}
                              {last.size ? ` (${last.size})` : ''}
                            </div>
                          </>
                        ) : (
                          'Never'
                        )}
                      </td>
                      <td className={`${docsStyles.colActions} ${docsStyles.actionsCell}`}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {canEdit ? (
                            <button type="button" style={smallBtn} onClick={() => openIssue(r)}>
                              Issue uniform
                            </button>
                          ) : null}
                          <button type="button" style={smallBtn} onClick={() => setHistoryFor(r)}>
                            History
                          </button>
                          {canEdit ? (
                            <button type="button" style={smallBtn} onClick={() => openEditPerson(r)}>
                              Edit sizes
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={personOpen}
        title={editingId ? 'Edit person and sizes' : 'Add client staff member'}
        onClose={() => setPersonOpen(false)}
        width={680}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void savePerson()
          }}
          style={{ display: 'grid', gap: 12 }}
        >
          <div style={grid}>
            <label style={labelStyle}>
              Client *
              <select
                style={selectStyle}
                value={person.client_id}
                onChange={(e) => setPerson((p) => ({ ...p, client_id: e.target.value }))}
                required
              >
                <option value="">Pick a client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
            </label>
            {field('full_name', 'Name', true)}
            {field('employee_code', 'Employee no')}
            {field('department', 'Department / site')}
            {field('job_title', 'Job title')}
          </div>
          <div style={grid}>
            {UNIFORM_SIZE_FIELDS.map((f) => (
              <span key={f.field}>{field(f.field, `${f.label} size`)}</span>
            ))}
          </div>
          {field('other_sizes', 'Other sizes (e.g. gloves M, apron long)')}
          <label style={labelStyle}>
            Notes
            <textarea
              style={{ ...inputStyle, minHeight: 60 }}
              value={person.notes}
              onChange={(e) => setPerson((p) => ({ ...p, notes: e.target.value }))}
            />
          </label>
          {editingId ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={!person.active}
                onChange={(e) => setPerson((p) => ({ ...p, active: !e.target.checked }))}
              />
              This person has left the client (hide from the list, keep their history)
            </label>
          ) : null}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" style={buttonSecondaryStyle} onClick={() => setPersonOpen(false)}>
              Cancel
            </button>
            <button type="submit" style={buttonPrimaryStyle} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={issueFor != null}
        title={issueFor ? `Issue uniform to ${issueFor.full_name}` : 'Issue uniform'}
        onClose={() => setIssueFor(null)}
        width={560}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void saveIssue()
          }}
          style={{ display: 'grid', gap: 12 }}
        >
          <div style={grid}>
            <label style={labelStyle}>
              Item *
              <input
                style={inputStyle}
                list="uniform-items"
                value={item}
                onChange={(e) => {
                  setItem(e.target.value)
                  if (issueFor) setSize(sizeForItem(issueFor, e.target.value) || size)
                }}
                required
              />
              <datalist id="uniform-items">
                {UNIFORM_ITEMS.map((i) => (
                  <option key={i} value={i} />
                ))}
              </datalist>
            </label>
            <label style={labelStyle}>
              Size
              <input style={inputStyle} value={size} onChange={(e) => setSize(e.target.value)} />
            </label>
            <label style={labelStyle}>
              Quantity *
              <input
                style={inputStyle}
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </label>
            <label style={labelStyle}>
              Date issued *
              <input style={inputStyle} type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} required />
            </label>
          </div>
          <label style={labelStyle}>
            Notes
            <input
              style={inputStyle}
              placeholder="e.g. replacement, delivery note number"
              value={issueNotes}
              onChange={(e) => setIssueNotes(e.target.value)}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" style={buttonSecondaryStyle} onClick={() => setIssueFor(null)}>
              Cancel
            </button>
            <button type="submit" style={buttonPrimaryStyle} disabled={saving}>
              {saving ? 'Saving…' : 'Save issue'}
            </button>
          </div>
        </form>
      </Modal>

      {importOpen ? (
        <UniformImportModal
          open
          onClose={() => setImportOpen(false)}
          onDone={() => {
            setImportOpen(false)
            void load()
          }}
          clients={clients}
          existing={staff}
          initialClientId={clientFilter}
        />
      ) : null}

      <Modal
        open={historyFor != null}
        title={historyFor ? `Uniform history: ${historyFor.full_name}` : 'Uniform history'}
        onClose={() => setHistoryFor(null)}
        width={620}
      >
        {historyFor ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 13 }}>
              {uniformClientName(historyFor)} · {uniformSizeSummary(historyFor) || 'No sizes yet'}
            </div>
            {issuesForStaff(issues, historyFor.id).length === 0 ? (
              <div style={{ fontSize: 13 }}>Nothing issued yet.</div>
            ) : (
              <table className={docsStyles.table}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Item</th>
                    <th>Size</th>
                    <th>Qty</th>
                    <th>Notes</th>
                    {canDelete ? <th aria-label="Actions" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {issuesForStaff(issues, historyFor.id).map((i) => (
                    <tr key={i.id}>
                      <td>{fmtDate(i.issued_on)}</td>
                      <td>{i.item}</td>
                      <td>{i.size || '—'}</td>
                      <td>{i.quantity}</td>
                      <td>{i.notes || ''}</td>
                      {canDelete ? (
                        <td style={{ textAlign: 'right' }}>
                          <button type="button" style={smallBtn} onClick={() => void removeIssue(i)}>
                            Remove
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
