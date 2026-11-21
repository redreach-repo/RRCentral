import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { FileUp, Loader2, Plus, Trash2 } from 'lucide-react'
import Modal from '../Modal'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import { CLIENT_PO_DEPARTMENTS } from '../../lib/clientPurchaseOrders'
import {
  PO_FILE_ACCEPT,
  clientPoSetupNotes,
  matchPoClient,
  poContentType,
  poFileProblem,
  poNumber,
  poTotal,
  poTotalsWarnings,
  type ExtractedPo,
  type PoLineItem,
} from '../../lib/clientPoReader'
import {
  bytesToBase64,
  fileClientPoInDrive,
  readClientPoFile,
  type ClientPoSetup,
  type PoUpload,
} from '../../lib/clientPoFile'
import {
  createClientPurchaseOrder,
  updateClientPurchaseOrder,
  type ClientPoDetails,
  type ClientPurchaseOrder,
} from '../../lib/opsSliceStores'
import {
  ALL_STAFF_GROUP,
  isCancelledStatus,
  lineAmount,
  poIssuedByLine,
  poLineBalances,
  staffGroups,
  withLineIds,
  type PoDrawdown,
} from '../../lib/clientPoBalance'
import { loadPoDrawdowns } from '../../lib/clientPoDrawdownStore'
import { loadClientUniforms, type UniformLoad } from '../../lib/clientUniforms/clientUniformsStore'
import ClientPoStaffPanel from './ClientPoStaffPanel'
import { buttonPrimaryStyle, buttonSecondaryStyle, colors, inputStyle, labelStyle, selectStyle } from '../../lib/uiStyles'

export type ClientPoClientOpt = { id: string; company_name: string; account_id?: string | null; trn?: string | null }

type LineDraft = {
  id: string
  staff_group: string
  description: string
  quantity: string
  unit: string
  unit_price: string
  amount: string
}

const CURRENCIES = ['AED', 'USD', 'EUR', 'GBP', 'SAR', 'OMR', 'QAR', 'KWD', 'BHD', 'INR']

const gridStyle: CSSProperties = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
}
const noteStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.45,
  padding: '10px 12px',
  borderRadius: 8,
  border: `1px solid ${colors.border}`,
  background: 'var(--surface-2, transparent)',
}
const sectionLabel: CSSProperties = { fontSize: 12, fontWeight: 600, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 }
const cellInput: CSSProperties = { ...inputStyle, padding: '6px 8px', fontSize: 13, minWidth: 0 }

function toStr(n: number | null | undefined): string {
  return n == null || !Number.isFinite(Number(n)) ? '' : String(n)
}

function lineToDraft(l: PoLineItem): LineDraft {
  return {
    id: l.id || withLineIds([l])[0].id,
    staff_group: l.staff_group || '',
    description: l.description || '',
    quantity: toStr(l.quantity),
    unit: l.unit || '',
    unit_price: toStr(l.unit_price),
    amount: toStr(l.amount),
  }
}

function draftToLine(d: LineDraft): PoLineItem {
  return {
    id: d.id,
    ...(d.staff_group.trim() ? { staff_group: d.staff_group.trim() } : {}),
    description: d.description.trim(),
    quantity: poNumber(d.quantity),
    unit: d.unit.trim(),
    unit_price: poNumber(d.unit_price),
    amount: poNumber(d.amount),
  }
}

function emptyLine(): LineDraft {
  return lineToDraft({ description: '', quantity: null, unit: '', unit_price: null, amount: null })
}

/**
 * New or existing client PO. Upload the PO file and it is read to fill in the
 * form; the user checks every field, then Save files the PO in the client's
 * Google Drive folder and writes the row.
 */
export default function ClientPoEditor(props: {
  open: boolean
  /** The PO being corrected, or null for a new one. */
  editing: ClientPurchaseOrder | null
  defaultDivision: string
  clients: ClientPoClientOpt[]
  setup: ClientPoSetup
  detailsReady: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const { open, editing, clients, setup, detailsReady } = props
  const { showToast } = useToast()
  const fileInput = useRef<HTMLInputElement>(null)

  const [clientId, setClientId] = useState('')
  const [divisionCode, setDivisionCode] = useState('')
  const [poNo, setPoNo] = useState('')
  const [issuedOn, setIssuedOn] = useState('')
  const [currency, setCurrency] = useState('AED')
  const [amount, setAmount] = useState('')
  const [subtotal, setSubtotal] = useState('')
  const [vatRate, setVatRate] = useState('')
  const [vatAmount, setVatAmount] = useState('')
  const [contactName, setContactName] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [deliveryTerms, setDeliveryTerms] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([])

  const [upload, setUpload] = useState<PoUpload | null>(null)
  const [reading, setReading] = useState(false)
  const [readAt, setReadAt] = useState<string | null>(null)
  const [readNote, setReadNote] = useState('')
  const [fileProblem, setFileProblem] = useState('')
  const [driveError, setDriveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [drawdowns, setDrawdowns] = useState<PoDrawdown[]>([])
  const [drawdownsReady, setDrawdownsReady] = useState(false)
  const [uniforms, setUniforms] = useState<UniformLoad>({ staff: [], issues: [], missingTable: false })
  const [uniformsTick, setUniformsTick] = useState(0)

  // What invoices have taken from this PO, and the client's uniform staff (both best effort).
  useEffect(() => {
    if (!open) return
    let alive = true
    setDrawdowns([])
    setDrawdownsReady(false)
    if (editing?.id) {
      loadPoDrawdowns([editing.id])
        .then((res) => {
          if (!alive) return
          setDrawdowns(res.rows)
          setDrawdownsReady(res.ready)
        })
        .catch(() => {})
    }
    return () => {
      alive = false
    }
  }, [open, editing?.id])

  useEffect(() => {
    if (!open) return
    let alive = true
    loadClientUniforms()
      .then((res) => alive && setUniforms(res))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [open, uniformsTick])

  useEffect(() => {
    if (!open) return
    const r = editing
    setClientId(r?.client_id || '')
    setDivisionCode(r ? r.division_code || '' : props.defaultDivision)
    setPoNo(r?.po_number || '')
    setIssuedOn(r ? r.issued_on || '' : new Date().toISOString().slice(0, 10))
    setCurrency(r?.currency || 'AED')
    setAmount(r ? toStr(r.amount) : '')
    setSubtotal(toStr(r?.subtotal))
    setVatRate(toStr(r?.vat_rate))
    setVatAmount(toStr(r?.vat_amount))
    setContactName(r?.contact_name || '')
    setDeliveryDate(r?.delivery_date || '')
    setDeliveryAddress(r?.delivery_address || '')
    setDeliveryTerms(r?.delivery_terms || '')
    setPaymentTerms(r?.payment_terms || '')
    setNotes(r?.notes || '')
    setLines((r?.line_items || []).map(lineToDraft))
    setUpload(null)
    setReading(false)
    setReadAt(r?.details_read_at || null)
    setReadNote('')
    setFileProblem('')
    setDriveError('')
    setSaving(false)
    // Reset only when the editor opens or switches PO.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id])

  const currentLines = lines.map(draftToLine)
  const balanceById = useMemo(() => {
    if (!editing || !drawdownsReady) return null
    return new Map(poLineBalances(currentLines, drawdowns).map((b) => [b.line.id, b]))
    // currentLines is rebuilt each render; lines is its source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, drawdownsReady, drawdowns, lines])
  const clientStaff = useMemo(() => uniforms.staff.filter((st) => st.client_id === clientId), [uniforms.staff, clientId])
  const groupOptions = useMemo(() => [ALL_STAFF_GROUP, ...staffGroups(clientStaff)], [clientStaff])
  const clientName = clients.find((c) => c.id === clientId)?.company_name || ''
  const savedLineIds = useMemo(
    () => new Set((editing?.line_items || []).map((l) => l.id).filter((id): id is string => Boolean(id))),
    [editing],
  )
  const poLinked = uniforms.poLinked !== false && !uniforms.missingTable
  const issuedByLine = useMemo(
    () => (editing?.id && poLinked ? poIssuedByLine(uniforms.issues, editing.id) : null),
    [editing?.id, poLinked, uniforms.issues],
  )
  const invoicedByLine = useMemo(
    () => (balanceById ? new Map([...balanceById.entries()].map(([id, b]) => [id, b.invoiced])) : null),
    [balanceById],
  )
  const warnings = poTotalsWarnings({
    total: poNumber(amount),
    subtotal: poNumber(subtotal),
    vat_rate: poNumber(vatRate),
    vat_amount: poNumber(vatAmount),
    line_items: currentLines.filter((l) => l.description || l.amount != null),
  })
  const setupNotes = clientPoSetupNotes(setup, detailsReady)
  const hasFile = Boolean(editing?.file_url)
  const canUpload = detailsReady && setup.reachable && (setup.reader || setup.drive)

  function applyRead(po: ExtractedPo) {
    if (po.po_number) setPoNo(po.po_number)
    if (po.issued_on) setIssuedOn(po.issued_on)
    if (po.currency) setCurrency(po.currency)
    const total = poTotal(po)
    if (total != null) setAmount(String(total))
    setSubtotal(toStr(po.subtotal))
    setVatRate(toStr(po.vat_rate))
    setVatAmount(toStr(po.vat_amount))
    if (po.contact_name) setContactName(po.contact_name)
    if (po.delivery_date) setDeliveryDate(po.delivery_date)
    if (po.delivery_address) setDeliveryAddress(po.delivery_address)
    if (po.delivery_terms) setDeliveryTerms(po.delivery_terms)
    if (po.payment_terms) setPaymentTerms(po.payment_terms)
    if (po.notes) setNotes((n) => (n.trim() ? n : po.notes))
    setLines(po.line_items.map(lineToDraft))
    const match = matchPoClient(po, clients)
    if (match) setClientId(match.id)
    setReadAt(new Date().toISOString())
    setReadNote(
      match
        ? `Filled in from the PO, client ${match.company_name}. Check every field before saving.`
        : po.client_name
          ? `Filled in from the PO. It is from "${po.client_name}", which is not in the client list: pick the client, or add them under Clients first.`
          : 'Filled in from the PO. Pick the client and check every field before saving.',
    )
  }

  async function pickFile(file: File | null | undefined) {
    if (!file) return
    setFileProblem('')
    setDriveError('')
    setReadNote('')
    const contentType = poContentType(file.name, file.type)
    const problem = poFileProblem(contentType, file.size)
    if (problem) {
      setFileProblem(problem)
      setUpload(null)
      return
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const next: PoUpload = { filename: file.name, contentType, base64: bytesToBase64(bytes), bytes: file.size }
    setUpload(next)
    if (!setup.reader) return
    setReading(true)
    try {
      const { po } = await readClientPoFile(next)
      applyRead(po)
    } catch (e) {
      setReadNote(`${errorMessage(e, 'Could not read the PO')}. Type the details in by hand; the file will still be saved.`)
    } finally {
      setReading(false)
    }
  }

  function setLine(i: number, patch: Partial<LineDraft>) {
    setLines((ls) =>
      ls.map((l, j) => {
        if (j !== i) return l
        const next = { ...l, ...patch }
        // Keep Amount = Qty x Unit price while it is blank or still the worked out figure.
        if ('quantity' in patch || 'unit_price' in patch) {
          const before = lineAmount(poNumber(l.quantity), poNumber(l.unit_price))
          const after = lineAmount(poNumber(next.quantity), poNumber(next.unit_price))
          if (after != null && (!l.amount.trim() || (before != null && poNumber(l.amount) === before))) next.amount = String(after)
        }
        return next
      }),
    )
  }

  async function save(withoutFile = false) {
    const client = clients.find((c) => c.id === clientId)
    if (!client) {
      showToast('Pick a client', 'error')
      return
    }
    if (!poNo.trim()) {
      showToast('Enter the PO number', 'error')
      return
    }
    setSaving(true)
    setDriveError('')
    try {
      let details: Partial<ClientPoDetails> | undefined
      if (detailsReady) {
        details = {
          line_items: currentLines.filter((l) => l.description || l.amount != null),
          subtotal: poNumber(subtotal),
          vat_rate: poNumber(vatRate),
          vat_amount: poNumber(vatAmount),
          contact_name: contactName.trim(),
          delivery_date: deliveryDate || null,
          delivery_address: deliveryAddress.trim(),
          delivery_terms: deliveryTerms.trim(),
          payment_terms: paymentTerms.trim(),
          details_read_at: readAt,
        }
        if (upload && setup.drive && !withoutFile) {
          try {
            const saved = await fileClientPoInDrive(upload, client.id, poNo.trim())
            details = { ...details, file_name: upload.filename, file_url: saved.url, drive_file_id: saved.id }
          } catch (e) {
            setDriveError(errorMessage(e, 'Google Drive did not take the file'))
            return
          }
        }
      }
      const input = {
        clientId: client.id,
        accountId: client.account_id ?? null,
        divisionCode: divisionCode || null,
        poNumber: poNo,
        amount: poNumber(amount) ?? 0,
        currency: currency || 'AED',
        issuedOn,
        notes,
        details,
      }
      if (editing) await updateClientPurchaseOrder(editing.id, input)
      else await createClientPurchaseOrder(input)
      showToast(details?.file_url ? 'Client PO saved, file in Google Drive' : 'Client PO saved', 'success')
      props.onSaved()
    } catch (err) {
      showToast(errorMessage(err, 'Save failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title={editing ? `Client PO ${editing.po_number}` : 'New client PO'} onClose={props.onClose} width={860}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
        style={{ display: 'grid', gap: 14 }}
      >
        {setupNotes.length ? (
          <div style={{ ...noteStyle, borderColor: colors.warn }} role="note">
            {setupNotes.map((n) => (
              <div key={n}>{n}</div>
            ))}
          </div>
        ) : null}

        {canUpload ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={sectionLabel}>PO file</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                ref={fileInput}
                type="file"
                accept={PO_FILE_ACCEPT}
                style={{ display: 'none' }}
                onChange={(e) => {
                  void pickFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <button type="button" style={buttonSecondaryStyle} disabled={reading || saving} onClick={() => fileInput.current?.click()}>
                <FileUp size={15} style={{ verticalAlign: '-3px', marginRight: 6 }} />
                {upload ? 'Choose another file' : hasFile ? 'Replace the PO file' : 'Upload the PO (PDF or photo)'}
              </button>
              {upload ? <span style={{ fontSize: 13 }}>{upload.filename}</span> : null}
              {!upload && hasFile ? (
                <a href={editing?.file_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: colors.accentText }}>
                  Open {editing?.file_name || 'the PO file'} in Google Drive
                </a>
              ) : null}
              {reading ? (
                <span style={{ fontSize: 13, color: colors.muted }}>
                  <Loader2 size={14} className="spin" style={{ verticalAlign: '-2px', marginRight: 4 }} />
                  Reading the PO… this takes up to a minute
                </span>
              ) : null}
            </div>
            {fileProblem ? <div style={{ ...noteStyle, borderColor: colors.danger }}>{fileProblem}</div> : null}
            {readNote ? <div style={noteStyle}>{readNote}</div> : null}
          </div>
        ) : null}

        <div style={gridStyle}>
          <label style={labelStyle}>
            Client *
            <select style={selectStyle} value={clientId} onChange={(e) => setClientId(e.target.value)} required>
              <option value="">Pick a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Vertical
            <select style={selectStyle} value={divisionCode} onChange={(e) => setDivisionCode(e.target.value)}>
              <option value="">Not set</option>
              {CLIENT_PO_DEPARTMENTS.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            PO number *
            <input style={inputStyle} value={poNo} onChange={(e) => setPoNo(e.target.value)} required />
          </label>
          <label style={labelStyle}>
            PO date
            <input style={inputStyle} type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
          </label>
          <label style={labelStyle}>
            Currency
            <select style={selectStyle} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {(CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES]).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Total incl. VAT
            <input style={inputStyle} type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
        </div>

        {detailsReady ? (
          <>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={sectionLabel}>Lines</div>
              {lines.length ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: colors.muted }}>
                        <th style={{ padding: '4px 6px', minWidth: 200 }}>Description</th>
                        <th style={{ padding: '4px 6px', width: 80 }}>Qty</th>
                        <th style={{ padding: '4px 6px', width: 70 }}>Unit</th>
                        <th style={{ padding: '4px 6px', width: 100 }}>Unit price</th>
                        <th style={{ padding: '4px 6px', width: 110 }}>Amount</th>
                        <th style={{ padding: '4px 6px', width: 130 }}>For staff</th>
                        {issuedByLine ? <th style={{ padding: '4px 6px', width: 60, textAlign: 'right' }}>Issued</th> : null}
                        {balanceById ? (
                          <>
                            <th style={{ padding: '4px 6px', width: 70, textAlign: 'right' }}>Invoiced</th>
                            <th style={{ padding: '4px 6px', width: 60, textAlign: 'right' }}>Left</th>
                          </>
                        ) : null}
                        <th style={{ width: 32 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, i) => {
                        const bal = balanceById?.get(l.id)
                        return (
                        <tr key={l.id}>
                          <td style={{ padding: 3 }}>
                            <input aria-label={`Line ${i + 1} description`} style={{ ...cellInput, width: '100%' }} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                          </td>
                          <td style={{ padding: 3 }}>
                            <input aria-label={`Line ${i + 1} quantity`} style={{ ...cellInput, width: '100%' }} inputMode="decimal" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                          </td>
                          <td style={{ padding: 3 }}>
                            <input aria-label={`Line ${i + 1} unit`} style={{ ...cellInput, width: '100%' }} value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} />
                          </td>
                          <td style={{ padding: 3 }}>
                            <input aria-label={`Line ${i + 1} unit price`} style={{ ...cellInput, width: '100%' }} inputMode="decimal" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} />
                          </td>
                          <td style={{ padding: 3 }}>
                            <input aria-label={`Line ${i + 1} amount`} style={{ ...cellInput, width: '100%' }} inputMode="decimal" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} />
                          </td>
                          <td style={{ padding: 3 }}>
                            <input
                              aria-label={`Line ${i + 1} for which staff`}
                              list="client-po-staff-groups"
                              placeholder="All staff / Driver"
                              style={{ ...cellInput, width: '100%' }}
                              value={l.staff_group}
                              onChange={(e) => setLine(i, { staff_group: e.target.value })}
                            />
                          </td>
                          {issuedByLine ? (
                            <td style={{ padding: '3px 6px', textAlign: 'right' }}>{issuedByLine.get(l.id)?.items || 0}</td>
                          ) : null}
                          {balanceById ? (
                            <>
                              <td style={{ padding: '3px 6px', textAlign: 'right' }} title={bal?.takenBy.map((t) => `${t.reference}: ${t.quantity}`).join('\n') || ''}>
                                {bal ? bal.invoiced : 0}
                              </td>
                              <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 600, color: bal && bal.balance < 0 ? colors.danger : undefined }}>
                                {bal ? bal.balance : poNumber(l.quantity) ?? '—'}
                              </td>
                            </>
                          ) : null}
                          <td style={{ padding: 3 }}>
                            <button
                              type="button"
                              aria-label={`Remove line ${i + 1}`}
                              style={{ ...buttonSecondaryStyle, padding: '4px 6px' }}
                              onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <datalist id="client-po-staff-groups">
                    {groupOptions.map((g) => (
                      <option key={g} value={g} />
                    ))}
                  </datalist>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: colors.muted }}>
                  No lines yet. Add one line per item on the PO with the quantity the client asked for, e.g. "Coverall, navy",
                  90 pcs at 45.00, for All staff (or a job title such as Driver). Uploading the PO file fills them in too.
                </div>
              )}
              {balanceById && drawdowns.length ? (
                <div style={{ fontSize: 12, color: colors.muted }}>
                  Invoiced against this PO:{' '}
                  {[...new Map(drawdowns.filter((d) => !isCancelledStatus(d.invoices?.status)).map((d) => [d.invoice_id, d.invoices?.reference_number || 'invoice'])).values()].join(', ')}
                </div>
              ) : null}
              <div>
                <button type="button" style={{ ...buttonSecondaryStyle, padding: '4px 10px', fontSize: 12 }} onClick={() => setLines((ls) => [...ls, emptyLine()])}>
                  <Plus size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                  Add line
                </button>
              </div>
            </div>

            <ClientPoStaffPanel
              lines={currentLines}
              staff={clientStaff}
              allStaff={uniforms.staff}
              issues={uniforms.issues}
              missingTable={uniforms.missingTable}
              poLinked={uniforms.poLinked !== false}
              clientId={clientId}
              clientName={clientName}
              poId={editing && editing.client_id === clientId ? editing.id : null}
              savedLineIds={savedLineIds}
              invoicedByLine={invoicedByLine}
              onIssued={() => setUniformsTick((t) => t + 1)}
            />

            <div style={gridStyle}>
              <label style={labelStyle}>
                Subtotal
                <input style={inputStyle} type="number" min={0} step="0.01" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} />
              </label>
              <label style={labelStyle}>
                VAT %
                <input style={inputStyle} type="number" min={0} max={100} step="0.01" value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
              </label>
              <label style={labelStyle}>
                VAT amount
                <input style={inputStyle} type="number" min={0} step="0.01" value={vatAmount} onChange={(e) => setVatAmount(e.target.value)} />
              </label>
              <label style={labelStyle}>
                Client contact
                <input style={inputStyle} value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </label>
              <label style={labelStyle}>
                Delivery by
                <input style={inputStyle} type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
              </label>
              <label style={labelStyle}>
                Payment terms
                <input style={inputStyle} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
              </label>
            </div>
            <div style={gridStyle}>
              <label style={labelStyle}>
                Delivery address
                <input style={inputStyle} value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
              </label>
              <label style={labelStyle}>
                Delivery terms
                <input style={inputStyle} value={deliveryTerms} onChange={(e) => setDeliveryTerms(e.target.value)} />
              </label>
            </div>
          </>
        ) : null}

        <label style={labelStyle}>
          Notes
          <input style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {warnings.length ? (
          <div style={{ ...noteStyle, borderColor: colors.warn }} role="note">
            <strong>Check these sums:</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {driveError ? (
          <div style={{ ...noteStyle, borderColor: colors.danger }} role="alert">
            The PO was not saved: Google Drive did not take the file ({driveError}). Try again, or save the details now and
            upload the file later.
            <div style={{ marginTop: 8 }}>
              <button type="button" style={buttonSecondaryStyle} disabled={saving} onClick={() => void save(true)}>
                Save without the file
              </button>
            </div>
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={buttonSecondaryStyle} onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" style={buttonPrimaryStyle} disabled={saving || reading}>
            {saving ? (upload && setup.drive ? 'Saving to Google Drive…' : 'Saving…') : 'Save PO'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
