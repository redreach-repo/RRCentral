// Generates regression examples using the OLD float formulas from main (before A1).
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const oldLine = (q, p, v = 0.05) => { const a = r2(q * p); const vat = r2(a * v); return { amount: a, vat_amount: vat, line_total: r2(a + vat) } }
const oldTotals = (items, v = 0.05, d) => {
  let s = 0, c = 0
  for (const it of items) { s += oldLine(it.qty, it.unit_price, v).amount; c += r2(it.qty * (it.unit_cost || 0)) }
  s = r2(s); c = r2(c)
  const base = r2(Math.max(0, s)); const pct = Math.min(100, Math.max(0, d?.discountPercent || 0)); const fixed = Math.max(0, d?.discountAmount || 0)
  const disc = r2(Math.min(base, r2((base * pct) / 100) + fixed)); const taxable = r2(Math.max(0, base - disc))
  const vat = r2(taxable * v); const profit = r2(taxable - c)
  return { subtotal: s, discount: disc, taxable, vat, total: r2(taxable + vat), cost: c, profit, marginPct: taxable > 0 ? r2((profit / taxable) * 100) : 0 }
}
const oldNet = (b, a, d) => Math.round(Math.max(0, b + a - d) * 100) / 100
const oldDaily = (b) => Math.round((b / 30) * 100) / 100
const oldGrat = (years, daily) => { let days = Math.min(years, 5) * 21; if (years > 5) days += (years - 5) * 30; return years <= 0 ? 0 : Math.round(days * daily * 100) / 100 }
// Synthetic examples shaped like Red Reach documents (no production data).
const invoices = [
  { ref: 'retainer-monthly', items: [{ qty: 1, unit_price: 4535, unit_cost: 0 }] },
  { ref: 'software-setup-plus-hours', items: [{ qty: 1, unit_price: 12500, unit_cost: 3000 }, { qty: 37.5, unit_price: 285, unit_cost: 110 }] },
  { ref: 'merch-order', items: [{ qty: 120, unit_price: 18.75, unit_cost: 9.4 }, { qty: 45, unit_price: 32.99, unit_cost: 14.2 }, { qty: 3, unit_price: 0.33, unit_cost: 0 }] },
  { ref: 'discounted-quote', items: [{ qty: 2, unit_price: 9999.99, unit_cost: 4000 }], discount: { discountPercent: 7.5, discountAmount: 150 } },
  { ref: 'ctrm-licences', items: [{ qty: 14, unit_price: 1650, unit_cost: 1155 }, { qty: 1, unit_price: 2200.5, unit_cost: 0 }] },
  { ref: 'small-lines', items: Array.from({ length: 40 }, (_, i) => ({ qty: (i % 7) + 1, unit_price: 0.1 * (i + 1), unit_cost: 0.05 })) },
  { ref: 'church-review', items: [{ qty: 1, unit_price: 750, unit_cost: 0 }, { qty: 6, unit_price: 125.25, unit_cost: 40 }] },
]
const payroll = [
  { ref: 'run-2026-10', lines: [[18500.5, 2500, 0, 3], [9200, 1200, 350.75, 1], [4100, 600, 0, 7], [26750, 0, 1200, 12]] },
  { ref: 'run-2026-11', lines: [[18500.5, 2500, 125.5, 3], [9200, 1200, 0, 1], [3333.33, 333.33, 33.33, 0]] },
]
const out = {
  note: 'Synthetic examples shaped like Red Reach invoices and payroll runs. Expected values were produced by the pre-A1 float formulas on main; the exact money module must reproduce them. No production data.',
  invoices: invoices.map((i) => ({ ...i, vatRate: 0.05, expected: oldTotals(i.items, 0.05, i.discount) })),
  payroll: payroll.map((p) => {
    const lines = p.lines.map(([basic, allowances, deductions, years]) => ({ basic, allowances, deductions, years, net: oldNet(basic, allowances, deductions), gratuity: oldGrat(years, oldDaily(basic)) }))
    return { ref: p.ref, lines, totalNet: r2(lines.reduce((s, l) => s + l.net, 0)), totalGratuity: r2(lines.reduce((s, l) => s + l.gratuity, 0)) }
  }),
}
console.log(JSON.stringify(out, null, 2))
