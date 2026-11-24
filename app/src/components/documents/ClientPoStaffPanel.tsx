import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, Users } from 'lucide-react'
import {
  issuedPerPerson,
  itemForLine,
  lookalikeClientsWithStaff,
  poIssuedByLine,
  sizeCounts,
  staffForLine,
} from '../../lib/clientPoBalance'
import type { PoLineItem } from '../../lib/clientPoReader'
import {
  UNIFORM_ITEMS,
  UNIFORM_SIZE_FIELDS,
  sizeForItem,
  type UniformIssue,
  type UniformStaff,
} from '../../lib/clientUniforms/clientUniforms'
import { addPoUniformIssues } from '../../lib/clientUniforms/clientUniformsStore'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import { buttonPrimaryStyle, buttonSecondaryStyle, colors, inputStyle } from '../../lib/uiStyles'

const box: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  padding: 12,
  display: 'grid',
  gap: 10,
  fontSize: 13,
}
const th: CSSProperties = { textAlign: 'left', padding: '4px 6px', color: colors.muted, fontWeight: 500, fontSize: 12 }
const td: CSSProperties = { padding: '3px 6px', fontSize: 13, verticalAlign: 'middle' }
const num: CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap' }
const small: CSSProperties = { ...inputStyle, padding: '5px 8px', fontSize: 13 }

type Line = PoLineItem & { id?: string }

/**
 * On a client PO: for each line tagged with a staff group (e.g. "Driver", or
 * "All staff"), the client's people in that group from Clients > Uniform
 * sizes, their sizes, and how many items each person has been issued against
 * this PO line. Issuing here logs the items in the uniform issue log, tied to
 * the PO line, so the invoice can bill them and the PO balance goes down.
 */
export default function ClientPoStaffPanel(props: {
  lines: Line[]
  staff: UniformStaff[]
  /** Every client's uniform staff (to spot staff saved under a duplicate client). */
  allStaff: UniformStaff[]
  issues: UniformIssue[]
  missingTable: boolean
  /** False until client-po-uniform-issues.sql has run. */
  poLinked: boolean
  clientId: string
  clientName: string
  /** The saved PO, or null while it is new. */
  poId: string | null
  /** Line ids as saved on the PO (a line must be saved before issuing against it). */
  savedLineIds: Set<string>
  /** Invoiced so far per line id. */
  invoicedByLine: Map<string, number> | null
  onIssued: () => void
}) {
  const { lines, staff, issues, poId } = props
  const { showToast } = useToast()
  const [open, setOpen] = useState<string | null>(null)
  const [take, setTake] = useState<Record<string, string>>({})
  const [perPerson, setPerPerson] = useState('1')
  const [issuedOn, setIssuedOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)

  if (!props.clientId) return null
  const tagged = lines.filter((l) => (l.staff_group || '').trim())
  const issuedByLine = poId ? poIssuedByLine(issues, poId) : new Map<string, { items: number; people: number }>()
  const lookalikes = !staff.length ? lookalikeClientsWithStaff(props.clientId, props.clientName, props.allStaff) : []

  function toggle(lineId: string) {
    setOpen((o) => (o === lineId ? null : lineId))
    setTake({})
  }

  async function record(line: Line & { id: string }, people: UniformStaff[]) {
    if (!poId) return
    const item = itemForLine(line.description, UNIFORM_ITEMS)
    const rows = people
      .map((p) => ({ p, n: Math.round(Number(take[p.id]) || 0) })) // money-guard: not money (pairs)
      .filter(({ n }) => n > 0)
      .map(({ p, n }) => ({
        staff_id: p.id,
        item,
        size: sizeForItem(p, item),
        quantity: n,
        issued_on: issuedOn,
        po_id: poId,
        po_line_id: line.id,
        notes: line.description ? `PO line: ${line.description}`.slice(0, 200) : '',
      }))
    if (!rows.length) {
      showToast('Put a number next to at least one person', 'error')
      return
    }
    setSaving(true)
    try {
      await addPoUniformIssues(rows)
      const total = rows.reduce((s, r) => s + r.quantity, 0)
      showToast(`${total} ${item.toLowerCase()} issued to ${rows.length} ${rows.length === 1 ? 'person' : 'people'}`, 'success')
      setTake({})
      props.onIssued()
    } catch (e) {
      showToast(errorMessage(e, 'Could not record the issue'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={box}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Users size={15} />
        <strong>Uniforms for this PO</strong>
        <Link to="/uniform-sizes" style={{ marginLeft: 'auto', color: colors.accentText, fontSize: 12 }}>
          Open Uniform sizes
        </Link>
      </div>
      {props.missingTable ? (
        <div style={{ color: colors.muted }}>
          Uniform sizes are not switched on yet: run client-uniform-sizes.sql in Supabase.
        </div>
      ) : !staff.length ? (
        <div style={{ color: colors.muted, display: 'grid', gap: 4 }}>
          <div>No staff saved for {props.clientName || 'this client'} yet. Add them under Clients → Uniform sizes (one by one or Upload Excel).</div>
          {lookalikes.length ? (
            <div style={{ color: colors.warn }}>
              Staff are saved under a different client record:{' '}
              {lookalikes.map((c) => `${c.name} (${c.people} ${c.people === 1 ? 'person' : 'people'})`).join(', ')}. Pick that
              client on this PO, or move the staff to {props.clientName} on Uniform sizes.
            </div>
          ) : null}
        </div>
      ) : !tagged.length ? (
        <div style={{ color: colors.muted }}>
          {props.clientName} has {staff.filter((s) => s.active !== false).length} people with sizes saved. In the "For staff"
          column of a line, pick "All staff" or a job title (e.g. Driver) to see who gets it and issue their uniforms.
        </div>
      ) : (
        tagged.map((l, i) => {
          const people = staffForLine(staff, l.staff_group)
          const ordered = Number(l.quantity) || 0
          const lineId = l.id || ''
          const issued = issuedByLine.get(lineId) || { items: 0, people: 0 }
          const invoiced = props.invoicedByLine?.get(lineId) || 0
          const perHead = issuedPerPerson(issues, poId || '', lineId)
          const item = itemForLine(l.description, UNIFORM_ITEMS)
          const isOpen = open === lineId
          const canIssue = Boolean(poId && lineId && props.savedLineIds.has(lineId) && props.poLinked)
          const takeTotal = people.reduce((s, p) => s + (Math.round(Number(take[p.id]) || 0)), 0) // money-guard: not money (pairs)
          return (
            <div key={lineId || i} style={{ borderTop: i ? `1px solid ${colors.border}` : undefined, paddingTop: i ? 8 : 0, display: 'grid', gap: 6 }}>
              <button
                type="button"
                onClick={() => toggle(lineId)}
                aria-expanded={isOpen}
                style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'flex-start' }}
              >
                {isOpen ? <ChevronDown size={15} style={{ marginTop: 2 }} /> : <ChevronRight size={15} style={{ marginTop: 2 }} />}
                <span>
                  <span style={{ fontWeight: 600 }}>
                    {l.description || 'Line'} · for {l.staff_group}
                  </span>
                  <span style={{ display: 'block', color: colors.muted }}>
                    {people.length} {people.length === 1 ? 'person' : 'people'} on file
                    {ordered ? ` · ordered ${ordered}` : ''}
                    {props.poLinked && poId ? ` · issued ${issued.items}${issued.people ? ` to ${issued.people}` : ''}` : ''}
                    {props.invoicedByLine ? ` · invoiced ${invoiced}` : ''}
                    {props.poLinked && poId && issued.items > invoiced ? ` · ${issued.items - invoiced} to invoice` : ''}
                    {ordered && props.poLinked && poId ? ` · ${Math.max(0, ordered - issued.items)} still to issue` : ''}
                  </span>
                </span>
              </button>
              {isOpen ? (
                people.length ? (
                  <div style={{ display: 'grid', gap: 8, paddingLeft: 21 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 16px' }}>
                      {UNIFORM_SIZE_FIELDS.map((f) => {
                        const counts = sizeCounts(people, f.field)
                        return counts && !/^\(no size\) ×\d+$/.test(counts) ? (
                          <span key={f.field}>
                            <span style={{ color: colors.muted }}>{f.label}:</span> {counts}
                          </span>
                        ) : null
                      })}
                    </div>
                    {!props.poLinked ? (
                      <div style={{ color: colors.warn }}>
                        To issue against this PO, run client-po-uniform-issues.sql in Supabase first.
                      </div>
                    ) : !canIssue ? (
                      <div style={{ color: colors.warn }}>Save the PO first, then open it again to issue against this line.</div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span>{item} per person</span>
                        <input
                          aria-label="Items per person"
                          style={{ ...small, width: 64 }}
                          type="number"
                          min={0}
                          step={1}
                          value={perPerson}
                          onChange={(e) => setPerPerson(e.target.value)}
                        />
                        <button
                          type="button"
                          style={{ ...buttonSecondaryStyle, padding: '4px 10px', fontSize: 12 }}
                          onClick={() => setTake(Object.fromEntries(people.map((p) => [p.id, perPerson])))}
                        >
                          Fill everyone
                        </button>
                        <span style={{ marginLeft: 8 }}>Issued on</span>
                        <input aria-label="Issue date" style={{ ...small, width: 150 }} type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
                      </div>
                    )}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={th}>Name</th>
                            <th style={th}>Emp. no</th>
                            <th style={th}>{item} size</th>
                            <th style={{ ...th, textAlign: 'right' }}>Issued on this PO</th>
                            {canIssue ? <th style={{ ...th, textAlign: 'right', width: 90 }}>Issue now</th> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {people.map((p) => (
                            <tr key={p.id} style={{ borderTop: `1px solid ${colors.border}` }}>
                              <td style={td}>{p.full_name}</td>
                              <td style={td}>{p.employee_code || '—'}</td>
                              <td style={td}>{sizeForItem(p, item) || <span style={{ color: colors.muted }}>not saved</span>}</td>
                              <td style={num}>{perHead.get(p.id) || 0}</td>
                              {canIssue ? (
                                <td style={{ ...num, padding: 3 }}>
                                  <input
                                    aria-label={`${item} to issue to ${p.full_name}`}
                                    style={{ ...small, width: 70, textAlign: 'right' }}
                                    type="number"
                                    min={0}
                                    step={1}
                                    placeholder="0"
                                    value={take[p.id] || ''}
                                    onChange={(e) => setTake((t) => ({ ...t, [p.id]: e.target.value }))}
                                  />
                                </td>
                              ) : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {canIssue ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          style={buttonPrimaryStyle}
                          disabled={saving || takeTotal <= 0}
                          onClick={() => void record(l as Line & { id: string }, people)}
                        >
                          {saving ? 'Saving…' : `Record issue${takeTotal ? ` (${takeTotal})` : ''}`}
                        </button>
                        {ordered && takeTotal + issued.items > ordered ? (
                          <span style={{ color: colors.danger }}>
                            That makes {takeTotal + issued.items} issued, more than the {ordered} on the PO.
                          </span>
                        ) : (
                          <span style={{ color: colors.muted, fontSize: 12 }}>
                            Saved to the uniform issue log. To bill it, open the invoice, pick this PO and press "Fill with issued".
                          </span>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div style={{ color: colors.muted, paddingLeft: 21 }}>
                    No one saved as "{l.staff_group}" for this client yet. Use a job title from Uniform sizes, or "All staff".
                  </div>
                )
              ) : null}
            </div>
          )
        })
      )}
    </div>
  )
}
