import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { db } from '../lib/db'
import { PAYMENT_METHODS } from '../lib/config'
import type { Expense } from '../lib/types'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import { formatAED } from '../lib/money'
import {
  buttonDangerStyle,
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
  selectStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
  toolbarStyle,
} from '../lib/uiStyles'

const CATEGORIES = [
  'Office',
  'Travel',
  'Marketing',
  'Salary',
  'Rent',
  'Utilities',
  'Supplies',
  'Shipping',
  'Professional fees',
  'Other',
]

type ExpenseForm = {
  date: string
  vendor: string
  category: string
  amount: number
  payment_method: string
  references_text: string
  notes: string
}

const emptyForm = (): ExpenseForm => ({
  date: format(new Date(), 'yyyy-MM-dd'),
  vendor: '',
  category: CATEGORIES[0],
  amount: 0,
  payment_method: PAYMENT_METHODS[0],
  references_text: '',
  notes: '',
})

export default function ExpensesPage() {
  const { showToast } = useToast()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [form, setForm] = useState<ExpenseForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await db
        .from('expenses')
        .select('*')
        .order('date', { ascending: false })
      if (error) throw error
      setExpenses((data || []) as Expense[])
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load expenses', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (!e.date) return !from && !to
      const d = e.date.slice(0, 10)
      if (from && d < from) return false
      if (to && d > to) return false
      return true
    })
  }, [expenses, from, to])

  const total = useMemo(
    () => filtered.reduce((s, e) => s + Number(e.amount || 0), 0),
    [filtered],
  )

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setOpen(true)
  }

  function openEdit(e: Expense) {
    setEditing(e)
    setForm({
      date: e.date ? e.date.slice(0, 10) : format(new Date(), 'yyyy-MM-dd'),
      vendor: e.vendor || '',
      category: e.category || CATEGORIES[0],
      amount: Number(e.amount) || 0,
      payment_method: e.payment_method || PAYMENT_METHODS[0],
      references_text: e.references_text || '',
      notes: e.notes || '',
    })
    setOpen(true)
  }

  async function save() {
    if (!form.vendor.trim()) {
      showToast('Vendor is required', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        date: form.date || null,
        vendor: form.vendor.trim(),
        category: form.category,
        amount: Number(form.amount) || 0,
        payment_method: form.payment_method,
        references_text: form.references_text.trim(),
        notes: form.notes.trim(),
      }
      if (editing) {
        const { error } = await db.from('expenses').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await db.from('expenses').insert(payload)
        if (error) throw error
      }
      showToast('Expense saved', 'success')
      setOpen(false)
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setSaving(true)
    try {
      const { error } = await db.from('expenses').delete().eq('id', deleteTarget.id)
      if (error) throw error
      showToast('Expense deleted', 'success')
      setDeleteTarget(null)
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Delete failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={pageStyle}>
      <div style={toolbarStyle}>
        <div>
          <h1 style={pageTitleStyle}>Expenses</h1>
          <p style={pageSubtitleStyle}>Vendors, categories, and spend</p>
        </div>
        <button type="button" style={buttonPrimaryStyle} onClick={openCreate}>
          <Plus size={16} /> Add expense
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <div>
          <label style={labelStyle}>From</label>
          <input type="date" style={inputStyle} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>To</label>
          <input type="date" style={inputStyle} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div style={{ ...cardStyle, padding: '10px 16px', marginLeft: 'auto' }}>
          <div style={{ fontSize: 12, color: colors.muted }}>Filtered total</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{formatAED(total)}</div>
        </div>
      </div>

      {loading ? (
        <div style={{ ...cardStyle, color: colors.muted }}>Loading expenses…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Wallet size={22} />}
          title="No expenses"
          subtitle="Track spend by vendor and category."
          actionLabel="Add expense"
          onAction={openCreate}
        />
      ) : (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Vendor</th>
                  <th style={thStyle}>Category</th>
                  <th style={thStyle}>Amount</th>
                  <th style={thStyle}>Method</th>
                  <th style={thStyle}>Ref</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id}>
                    <td style={tdStyle}>
                      {e.date ? format(parseISO(e.date.slice(0, 10)), 'dd MMM yyyy') : '—'}
                    </td>
                    <td style={tdStyle}>{e.vendor}</td>
                    <td style={tdStyle}>{e.category || '—'}</td>
                    <td style={tdStyle}>{formatAED(e.amount)}</td>
                    <td style={tdStyle}>{e.payment_method || '—'}</td>
                    <td style={tdStyle}>{e.references_text || '—'}</td>
                    <td style={tdStyle}>
                      <button type="button" style={buttonSecondaryStyle} onClick={() => openEdit(e)}>
                        <Pencil size={14} />
                      </button>{' '}
                      <button type="button" style={buttonDangerStyle} onClick={() => setDeleteTarget(e)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={open} title={editing ? 'Edit expense' : 'Add expense'} onClose={() => setOpen(false)} width={520}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Date</label>
            <input type="date" style={inputStyle} value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Amount</label>
            <input type="number" style={inputStyle} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Vendor *</label>
            <input style={inputStyle} value={form.vendor} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Category</label>
            <select style={selectStyle} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Payment method</label>
            <select style={selectStyle} value={form.payment_method} onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Reference</label>
            <input style={inputStyle} value={form.references_text} onChange={(e) => setForm((f) => ({ ...f, references_text: e.target.value }))} />
          </div>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Notes</label>
          <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setOpen(false)}>Cancel</button>
          <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void save()}>Save</button>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} title="Delete expense?" onClose={() => setDeleteTarget(null)} width={400}>
        <p style={{ color: colors.muted, fontSize: 14 }}>
          Delete expense for <strong style={{ color: colors.text }}>{deleteTarget?.vendor}</strong>?
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setDeleteTarget(null)}>Cancel</button>
          <button type="button" style={buttonDangerStyle} disabled={saving} onClick={() => void confirmDelete()}>Delete</button>
        </div>
      </Modal>
    </div>
  )
}
