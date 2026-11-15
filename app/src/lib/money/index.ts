/**
 * Shared money module (HighMast A1, docs/DECISIONS.md D9).
 *
 * Every amount is held as an integer count of the currency's minor unit in a
 * `bigint`, so adding, subtracting and summing can never drift. Inputs are read
 * as exact decimals (a JS number is read through its shortest decimal form, so
 * `0.1` is exactly one tenth, never 0.1000000000000000055…).
 *
 * Rounding follows the currency: 0 decimals (JPY), 2 (AED, USD) or 3 (KWD,
 * BHD, OMR). The default mode is half away from zero, the same as Postgres
 * `round(numeric, n)`, so the browser and the database agree to the fil.
 *
 * Numbers leave this module only at the edges (display, legacy callers) via
 * `toNumber` / `roundAmount`. Do not do arithmetic on those numbers.
 */

export type RoundingMode = 'half-up' | 'half-even' | 'down'

/** An exact decimal: value = coef / 10^scale. */
export type Decimal = { readonly coef: bigint; readonly scale: number }

export type Money = { readonly minor: bigint; readonly currency: string }

export type DecimalInput = string | number | bigint | Decimal

/** ISO 4217 minor units that differ from the usual 2. */
const ZERO_DECIMAL = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
])
const THREE_DECIMAL = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'])

/** Decimal places for a currency (2 when unknown). */
export function currencyDecimals(currency: string): number {
  const c = String(currency || '').trim().toUpperCase()
  if (ZERO_DECIMAL.has(c)) return 0
  if (THREE_DECIMAL.has(c)) return 3
  return 2
}

const POW10: bigint[] = []
export function pow10(n: number): bigint {
  if (n < 0 || !Number.isInteger(n)) throw new RangeError(`bad power ${n}`)
  if (POW10[n] === undefined) POW10[n] = 10n ** BigInt(n)
  return POW10[n]
}

function isDecimal(v: unknown): v is Decimal {
  return typeof v === 'object' && v !== null && 'coef' in v && 'scale' in v
}

const DECIMAL_RE = /^([+-])?(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/

/** Read an exact decimal. Throws on anything that is not a finite number. */
export function parseDecimal(input: DecimalInput): Decimal {
  if (isDecimal(input)) return input
  if (typeof input === 'bigint') return { coef: input, scale: 0 }
  if (typeof input === 'number' && !Number.isFinite(input)) throw new RangeError(`Not a finite amount: ${input}`)
  const s = String(input).trim().replace(/_/g, '')
  const m = DECIMAL_RE.exec(s)
  if (!m || (!m[2] && !m[3])) throw new RangeError(`Not a decimal amount: "${String(input)}"`)
  const sign = m[1] === '-' ? -1n : 1n
  const frac = m[3] || ''
  const exp = m[4] ? Number(m[4]) : 0
  let coef = BigInt((m[2] || '0') + frac) * sign
  let scale = frac.length - exp
  if (scale < 0) {
    coef *= pow10(-scale)
    scale = 0
  }
  return { coef, scale }
}

/** Lenient read for legacy inputs: null, '', NaN and junk become 0 (same as `Number(x) || 0`). */
export function toDecimalOrZero(input: unknown): Decimal {
  if (input === null || input === undefined || input === '') return { coef: 0n, scale: 0 }
  try {
    if (typeof input === 'number' || typeof input === 'string' || typeof input === 'bigint' || isDecimal(input)) {
      return parseDecimal(input)
    }
  } catch {
    /* fall through */
  }
  return { coef: 0n, scale: 0 }
}

/** Round num/den (den > 0 or < 0) to an integer. */
function roundRational(num: bigint, den: bigint, mode: RoundingMode): bigint {
  if (den === 0n) throw new RangeError('Division by zero')
  if (den < 0n) {
    num = -num
    den = -den
  }
  const q = num / den // truncates toward zero
  const r = num % den
  if (r === 0n || mode === 'down') return q
  const sign = num < 0n ? -1n : 1n
  const twice = (r < 0n ? -r : r) * 2n
  if (twice > den) return q + sign
  if (twice < den) return q
  if (mode === 'half-even') return q % 2n === 0n ? q : q + sign
  return q + sign
}

/** Round a decimal to `scale` places; returns the integer coefficient at that scale. */
export function roundToScale(d: DecimalInput, scale: number, mode: RoundingMode = 'half-up'): bigint {
  const v = parseDecimal(d)
  if (v.scale <= scale) return v.coef * pow10(scale - v.scale)
  return roundRational(v.coef, pow10(v.scale - scale), mode)
}

export function decMul(a: DecimalInput, b: DecimalInput): Decimal {
  const x = parseDecimal(a)
  const y = parseDecimal(b)
  return { coef: x.coef * y.coef, scale: x.scale + y.scale }
}

export function decAdd(a: DecimalInput, b: DecimalInput): Decimal {
  const x = parseDecimal(a)
  const y = parseDecimal(b)
  const s = Math.max(x.scale, y.scale)
  return { coef: x.coef * pow10(s - x.scale) + y.coef * pow10(s - y.scale), scale: s }
}

export function decimalToString(d: Decimal): string {
  const neg = d.coef < 0n
  let digits = (neg ? -d.coef : d.coef).toString()
  if (d.scale === 0) return (neg ? '-' : '') + digits
  digits = digits.padStart(d.scale + 1, '0')
  const int = digits.slice(0, digits.length - d.scale)
  const frac = digits.slice(digits.length - d.scale)
  return `${neg ? '-' : ''}${int}.${frac}`
}

function normCurrency(currency: string): string {
  const c = String(currency || '').trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(c)) throw new RangeError(`Not a currency code: "${currency}"`)
  return c
}

// ------------------------------------------------------------------ Money

/** Money from a decimal amount, rounded to the currency's minor unit. */
export function money(amount: DecimalInput, currency: string, mode: RoundingMode = 'half-up'): Money {
  const c = normCurrency(currency)
  return { minor: roundToScale(amount, currencyDecimals(c), mode), currency: c }
}

/** Lenient `money()` for legacy values (null/''/NaN → 0). */
export function moneyOrZero(amount: unknown, currency: string, mode: RoundingMode = 'half-up'): Money {
  return money(toDecimalOrZero(amount), currency, mode)
}

export function fromMinor(minor: bigint | number, currency: string): Money {
  if (typeof minor === 'number' && !Number.isSafeInteger(minor)) throw new RangeError(`Minor units must be a safe integer: ${minor}`)
  return { minor: BigInt(minor), currency: normCurrency(currency) }
}

export function zero(currency: string): Money {
  return fromMinor(0n, currency)
}

function same(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new RangeError(`Currency mismatch: ${a.currency} vs ${b.currency}`)
}

export function add(a: Money, b: Money): Money {
  same(a, b)
  return { minor: a.minor + b.minor, currency: a.currency }
}

export function sub(a: Money, b: Money): Money {
  same(a, b)
  return { minor: a.minor - b.minor, currency: a.currency }
}

export function neg(a: Money): Money {
  return { minor: -a.minor, currency: a.currency }
}

export function abs(a: Money): Money {
  return a.minor < 0n ? neg(a) : a
}

export function maxZero(a: Money): Money {
  return a.minor < 0n ? zero(a.currency) : a
}

export function min(a: Money, b: Money): Money {
  same(a, b)
  return a.minor <= b.minor ? a : b
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  same(a, b)
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0
}

export function isZero(a: Money): boolean {
  return a.minor === 0n
}

export function sum(items: Iterable<Money>, currency: string): Money {
  let total = zero(currency)
  for (const m of items) total = add(total, m)
  return total
}

/** The exact decimal value of an amount. */
export function toDecimal(m: Money): Decimal {
  return { coef: m.minor, scale: currencyDecimals(m.currency) }
}

/** Multiply by a quantity, rate or percentage factor and round to the currency. */
export function multiply(m: Money, factor: DecimalInput, mode: RoundingMode = 'half-up'): Money {
  const f = parseDecimal(factor)
  return { minor: roundRational(m.minor * f.coef, pow10(f.scale), mode), currency: m.currency }
}

/** Divide by a number (for example basic / 30) and round to the currency. */
export function divide(m: Money, divisor: DecimalInput, mode: RoundingMode = 'half-up'): Money {
  const d = parseDecimal(divisor)
  if (d.coef === 0n) throw new RangeError('Division by zero')
  return { minor: roundRational(m.minor * pow10(d.scale), d.coef, mode), currency: m.currency }
}

/** Convert to another currency at `rate` (1 unit of m.currency = rate units of target). */
export function convert(m: Money, rate: DecimalInput, target: string, mode: RoundingMode = 'half-up'): Money {
  const r = parseDecimal(rate)
  const t = normCurrency(target)
  // value = minor / 10^ds * rate → in target minor: minor * r.coef * 10^dt / (10^ds * 10^r.scale)
  const ds = currencyDecimals(m.currency)
  const dt = currencyDecimals(t)
  return { minor: roundRational(m.minor * r.coef * pow10(dt), pow10(ds + r.scale), mode), currency: t }
}

/**
 * Split an amount by weights so the parts always add back to the total
 * (largest remainder; ties go to the earlier part).
 */
export function allocate(m: Money, weights: DecimalInput[]): Money[] {
  if (!weights.length) throw new RangeError('allocate needs at least one weight')
  const ws = weights.map((w) => parseDecimal(w))
  const scale = Math.max(...ws.map((w) => w.scale))
  const ints = ws.map((w) => {
    const v = w.coef * pow10(scale - w.scale)
    if (v < 0n) throw new RangeError('allocate weights must be ≥ 0')
    return v
  })
  const totalW = ints.reduce((a, b) => a + b, 0n)
  if (totalW === 0n) throw new RangeError('allocate weights must not all be 0')
  const sign = m.minor < 0n ? -1n : 1n
  const amt = m.minor * sign
  const parts = ints.map((w) => (amt * w) / totalW)
  const rems = ints.map((w, i) => ({ i, r: (amt * w) % totalW }))
  let left = amt - parts.reduce((a, b) => a + b, 0n)
  rems.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1))
  for (const { i } of rems) {
    if (left <= 0n) break
    parts[i] += 1n
    left -= 1n
  }
  return parts.map((p) => ({ minor: p * sign, currency: m.currency }))
}

/** Plain decimal string with the currency's places, e.g. "1234.50", "1000", "0.125". */
export function toDecimalString(m: Money): string {
  return decimalToString(toDecimal(m))
}

/** Display / legacy boundary only. Exact for any amount below 2^53 minor units. */
export function toNumber(m: Money): number {
  return Number(toDecimalString(m))
}

/** Localised amount without the code, e.g. "1,234.50". */
export function formatAmount(m: Money, locale = 'en-AE'): string {
  const d = currencyDecimals(m.currency)
  const nf = new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d })
  // Intl formats decimal strings exactly (no float in between).
  return nf.format(toDecimalString(m) as unknown as number)
}

/** "AED 1,234.50" */
export function formatMoney(m: Money, locale = 'en-AE'): string {
  return `${m.currency} ${formatAmount(m, locale)}`
}

// ------------------------------------------------------ number-in helpers

/**
 * Exact rounding for legacy `number` callers: reads the value as a decimal,
 * rounds it to the currency (half away from zero) and hands back a number.
 * Replaces the old float rounding (n × 100, round, ÷ 100), which gets 1.005 → 1.00 wrong.
 */
export function roundAmount(n: unknown, currency = 'AED'): number {
  return toNumber(moneyOrZero(n, currency))
}

/** Exact sum of legacy numbers, rounded per value to the currency first. */
export function sumAmounts(values: Iterable<unknown>, currency = 'AED'): number {
  let total = 0n
  for (const v of values) total += moneyOrZero(v, currency).minor
  return toNumber({ minor: total, currency: normCurrency(currency) })
}

// ---------------------------------------------------------- document lines

export type LineMoney = { amount: Money; vat: Money; total: Money }

/** One invoice / quote line: amount = qty × price, VAT on the rounded amount. */
export function lineMoney(qty: DecimalInput, unitPrice: DecimalInput, vatRate: DecimalInput, currency: string): LineMoney {
  const amount = money(decMul(qty, unitPrice), currency)
  const vat = multiply(amount, vatRate)
  return { amount, vat, total: add(amount, vat) }
}

/** part / whole × 100, rounded to 2 places (margins). 0 when whole is 0. */
export function percentOf(part: Money, whole: Money): number {
  same(part, whole)
  if (whole.minor === 0n) return 0
  return Number(decimalToString({ coef: roundRational(part.minor * 10000n, whole.minor, 'half-up'), scale: 2 }))
}
