import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ClipboardList, Plus } from 'lucide-react'
import { clientPoPartyName } from '../../lib/clientPurchaseOrders'
import {
  invoiceLineFromPo,
  overDrawWarnings,
  poLineBalances,
  withLineIds,
  type PoDrawdown,
} from '../../lib/clientPoBalance'
import { loadPoDrawdowns } from '../../lib/clientPoDrawdownStore'
import type { PoLineItem } from '../../lib/clientPoReader'
import { listClientPurchaseOrdersWithDetails, type ClientPurchaseOrder } from '../../lib/opsSliceStores'
import { errorMessage } from '../../lib/errors'
import { buttonSecondaryStyle, colors, inputStyle, selectStyle } from '../../lib/uiStyles'

/** What this invoice takes from one client PO, per PO line id. */
export type InvoicePoTake = {
  poId: string
  poNumber: string
  lines: (PoLineItem & { id: string })[]
  take: Record<string, number>
}

const box: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  padding: 12,
  margin: '12px 0',
  display: 'grid',
  gap: 10,
}
const th: CSSProperties = { textAlign: 'left', padding: '4px 6px', color: colors.muted, fontWeight: 500, fontSize: 12 }
const td: CSSProperties = { padding: '4px 6px', fontSize: 13, verticalAlign: 'middle' }
const num: CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap' }

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase() && a.trim() !== ''
}

/**
 * On an invoice: pick the client's PO and say how much of each PO line this
 * invoice covers (e.g. 10 driver uniforms, 20 helper uniforms). Shows what
 * each line had, what earlier invoices took and what is left.
 */
export default function InvoicePoPanel(props: {
  client: string
  /** The invoice being edited (its own earlier quantities are not counted as "taken before"). */
  invoiceId: string | null
  value: InvoicePoTake | null
  onChange: (v: InvoicePoTake | null) => void
  onAddLines: (lines: { description: string; qty: number; unit_price: number; remarks: string }[]) => void
}) {
  const { client, invoiceId, value, onChange } = props
  const [pos, setPos] = useState<ClientPurchaseOrder[]>([])
  const [drawdowns, setDrawdowns] = useState<PoDrawdown[]>([])
  const [ready, setReady] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let alive = true
    listClientPurchaseOrdersWithDetails()
      .then((res) => {
        if (!alive) return
        setPos(res.rows.filter((r) => (r.line_items || []).some((l) => Number(l.quantity) > 0)))
      })
      .catch((e) => alive && setLoadError(errorMessage(e, 'Could not load client POs')))
    return () => {
      alive = false
    }
  }, [])

  const forClient = useMemo(
    () => pos.filter((r) => r.status !== 'canceled' && sameName(clientPoPartyName(r), client)),
    [pos, client],
  )

  useEffect(() => {
    if (!value?.poId) {
      setDrawdowns([])
      return
    }
    let alive = true
    loadPoDrawdowns([value.poId])
      .then((res) => {
        if (!alive) return
        setReady(res.ready)
        setDrawdowns(res.rows)
      })
      .catch((e) => alive && setLoadError(errorMessage(e, 'Could not load what was invoiced')))
    return () => {
      alive = false
    }
  }, [value?.poId])

  const balances = useMemo(
    () => (value ? poLineBalances(value.lines, drawdowns, invoiceId || undefined) : []),
    [value, drawdowns, invoiceId],
  )
  const warnings = value ? overDrawWarnings(balances, value.take) : []

  if (!client.trim()) return null
  if (!value && !forClient.length) {
    return loadError ? (
      <div style={{ ...box, color: colors.muted, fontSize: 13 }}>{loadError}</div>
    ) : null
  }

  function pickPo(id: string) {
    const po = forClient.find((p) => p.id === id)
    if (!po) {
      onChange(null)
      return
    }
    onChange({ poId: po.id, poNumber: po.po_number, lines: withLineIds(po.line_items || []), take: {} })
  }

  return (
    <div style={box}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <ClipboardList size={16} />
        <strong style={{ fontSize: 14 }}>Bill against a client PO</strong>
        <select
          aria-label="Client PO"
          style={{ ...selectStyle, width: 'auto', minWidth: 200 }}
          value={value?.poId || ''}
          onChange={(e) => pickPo(e.target.value)}
        >
          <option value="">No PO</option>
          {value && !forClient.some((p) => p.id === value.poId) ? <option value={value.poId}>PO {value.poNumber}</option> : null}
          {forClient.map((p) => (
            <option key={p.id} value={p.id}>
              PO {p.po_number}
              {p.issued_on ? ` · ${p.issued_on}` : ''}
            </option>
          ))}
        </select>
      </div>

      {!ready ? (
        <div style={{ fontSize: 13, color: colors.warn }}>
          Taking quantities off a PO needs the database update client-po-drawdowns.sql run in Supabase first.
        </div>
      ) : null}

      {value && ready ? (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>PO line</th>
                  <th style={{ ...th, textAlign: 'right' }}>Ordered</th>
                  <th style={{ ...th, textAlign: 'right' }}>Invoiced before</th>
                  <th style={{ ...th, textAlign: 'right' }}>Left</th>
                  <th style={{ ...th, textAlign: 'right', width: 110 }}>This invoice</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => {
                  const take = value.take[b.line.id] || 0
                  return (
                    <tr key={b.line.id} style={{ borderTop: `1px solid ${colors.border}` }}>
                      <td style={td}>
                        {b.line.description || '—'}
                        {b.line.staff_group ? <div style={{ fontSize: 12, color: colors.muted }}>For {b.line.staff_group}</div> : null}
                      </td>
                      <td style={num}>
                        {b.requested} {b.line.unit}
                      </td>
                      <td style={num}>{b.invoiced}</td>
                      <td style={{ ...num, fontWeight: 600, color: b.balance - take < 0 ? colors.danger : undefined }}>
                        {b.balance - take}
                      </td>
                      <td style={{ ...num, padding: 3 }}>
                        <input
                          aria-label={`Quantity of ${b.line.description} on this invoice`}
                          style={{ ...inputStyle, padding: '6px 8px', textAlign: 'right' }}
                          type="number"
                          min={0}
                          step="any"
                          value={take || ''}
                          placeholder="0"
                          onChange={(e) =>
                            onChange({ ...value, take: { ...value.take, [b.line.id]: Math.max(0, Number(e.target.value) || 0) } })
                          }
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {warnings.length ? (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: colors.danger }}>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              style={buttonSecondaryStyle}
              disabled={!balances.some((b) => (value.take[b.line.id] || 0) > 0)}
              onClick={() =>
                props.onAddLines(
                  balances
                    .filter((b) => (value.take[b.line.id] || 0) > 0)
                    .map((b) => invoiceLineFromPo(b.line, value.take[b.line.id], value.poNumber)),
                )
              }
            >
              <Plus size={14} /> Add these as invoice lines
            </button>
            <span style={{ fontSize: 12, color: colors.muted }}>
              The quantities in "This invoice" come off the PO when you save.
            </span>
          </div>
        </>
      ) : null}
    </div>
  )
}
