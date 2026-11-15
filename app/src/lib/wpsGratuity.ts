/**
 * UAE WPS / end-of-service gratuity helpers — planning drafts only.
 * Not legal advice. Not a bank-certified SIF. Counsel must review before
 * any live WPS upload or EOS settlement.
 */

export type GratuityInput = {
  /** Continuous service in full years (floor). */
  yearsOfService: number
  /** Daily wage used for accrual (basic/30 is a common starting point). */
  dailyWageAed: number
  /** Draft: resignation vs termination can change entitlements under UAE law — verify. */
  reason?: 'planning' | 'resignation' | 'termination'
}

/** Unlimited draft accrual used only for planning screens. */
export function draftGratuityAccrualAed(input: GratuityInput): number {
  const years = Math.max(0, Math.floor(input.yearsOfService))
  const daily = Math.max(0, Number(input.dailyWageAed) || 0)
  if (years <= 0 || daily <= 0) return 0
  // Placeholder band: 21 days/year for first 5 years, 30 thereafter (common UAE pattern).
  // Resignation under 1 year → 0 in many readings; we keep planning accrual unless reason=resignation with <1y.
  if (input.reason === 'resignation' && years < 1) return 0
  let days = 0
  const first = Math.min(years, 5)
  days += first * 21
  if (years > 5) days += (years - 5) * 30
  // Draft resignation taper (not legal advice): some readings reduce early years.
  if (input.reason === 'resignation' && years < 5) {
    days = Math.round(days * 0.5)
  }
  return Math.round(days * daily * 100) / 100
}

/** Floor years between hire date and as-of (defaults to today). */
export function yearsOfServiceFromStart(startDateIso: string | null | undefined, asOfIso?: string): number {
  if (!startDateIso) return 0
  const start = new Date(startDateIso.slice(0, 10) + 'T00:00:00Z')
  const asOf = new Date((asOfIso || new Date().toISOString()).slice(0, 10) + 'T00:00:00Z')
  if (Number.isNaN(start.getTime()) || Number.isNaN(asOf.getTime()) || asOf < start) return 0
  const ms = asOf.getTime() - start.getTime()
  return Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000))
}

/** Common planning shortcut: basic monthly salary / 30. */
export function dailyWageFromBasicMonthly(basicSalaryAed: number | null | undefined): number {
  const basic = Math.max(0, Number(basicSalaryAed) || 0)
  return Math.round((basic / 30) * 100) / 100
}

export type WpsLine = {
  employeeCode: string
  employeeName: string
  iban: string
  amountAed: number
  /** MoL / WPS personal number when known (often 14 digits). */
  labourCardNo?: string
  /** Bank routing / agent code when known. */
  routingCode?: string
  fixedIncomeAed?: number
  variableIncomeAed?: number
  daysInPeriod?: number
}

/** Build a simple WPS-style CSV body (not a bank-certified file format). */
export function buildWpsCsvDraft(lines: WpsLine[], valueDateIso: string): string {
  const header = 'EmployeeCode,EmployeeName,LabourCard,RoutingCode,IBAN,AmountAED,ValueDate'
  const rows = lines.map((l) =>
    [
      csv(l.employeeCode),
      csv(l.employeeName),
      csv(l.labourCardNo || ''),
      csv(l.routingCode || ''),
      csv(l.iban),
      (Math.round((Number(l.amountAed) || 0) * 100) / 100).toFixed(2),
      csv(valueDateIso.slice(0, 10)),
    ].join(','),
  )
  return [header, ...rows].join('\n')
}

export type SifDraftEmployer = {
  /** Employer establishment ID used in WPS (digits). */
  employerUniqueId: string
  /** Bank that will receive the file (optional label in comment header). */
  bankLabel?: string
}

export type SifDraftPeriod = {
  payStartIso: string
  payEndIso: string
  daysInPeriod?: number
}

/**
 * Draft SIF-like variable file (SCR + EDR rows).
 * Column layout follows common public WPS examples — NOT certified for bank upload.
 */
export function buildWpsSifDraft(
  employer: SifDraftEmployer,
  period: SifDraftPeriod,
  lines: WpsLine[],
  createdAtIso: string = new Date().toISOString(),
): string {
  const payStart = period.payStartIso.slice(0, 10)
  const payEnd = period.payEndIso.slice(0, 10)
  const created = createdAtIso.slice(0, 10).replace(/-/g, '')
  const daysDefault = period.daysInPeriod ?? daysInclusive(payStart, payEnd)
  const edr = lines.map((l) => {
    const fixed = Math.round((Number(l.fixedIncomeAed ?? l.amountAed) || 0) * 100) / 100
    const variable = Math.round((Number(l.variableIncomeAed) || 0) * 100) / 100
    const days = l.daysInPeriod ?? daysDefault
    return [
      'EDR',
      digitsOnly(l.labourCardNo || l.employeeCode),
      digitsOnly(l.routingCode || ''),
      compactIban(l.iban),
      payStart.replace(/-/g, ''),
      payEnd.replace(/-/g, ''),
      String(days),
      fixed.toFixed(2),
      variable.toFixed(2),
      '0', // days on leave for unpaid leave — draft stub
      csv(l.employeeName),
    ].join(',')
  })
  const total = lines.reduce((s, l) => s + (Number(l.amountAed) || 0), 0)
  const scr = [
    'SCR',
    digitsOnly(employer.employerUniqueId),
    created,
    String(lines.length),
    (Math.round(total * 100) / 100).toFixed(2),
    'AED',
    csv(employer.bankLabel || 'DRAFT'),
  ].join(',')
  const banner = [
    '# HighMast WPS SIF DRAFT — not bank-certified — not legal advice',
    `# Generated ${createdAtIso}`,
    '# Have counsel and your bank validate before live upload',
  ].join('\n')
  return [banner, scr, ...edr].join('\n')
}

export type WpsReadiness = {
  ready: boolean
  issues: string[]
}

export function validateAeIban(iban: string): boolean {
  const compact = compactIban(iban)
  if (!/^AE\d{21}$/.test(compact)) return false
  // ISO 13616 mod-97 check
  const rearranged = compact.slice(4) + compact.slice(0, 4)
  let expanded = ''
  for (const ch of rearranged) {
    expanded += /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch
  }
  let remainder = 0
  for (const digit of expanded) {
    remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1
}

export function validateLabourCardNo(value: string): boolean {
  const d = digitsOnly(value)
  return d.length >= 9 && d.length <= 15
}

export function validateRoutingCode(value: string): boolean {
  const d = digitsOnly(value)
  return d.length === 9
}

export function wpsLineReadiness(line: WpsLine): WpsReadiness {
  const issues: string[] = []
  if (!line.employeeName?.trim()) issues.push('missing name')
  if (!validateAeIban(line.iban)) issues.push('IBAN must be a valid AE IBAN')
  if (line.labourCardNo && !validateLabourCardNo(line.labourCardNo)) issues.push('labour card number looks invalid')
  if (!line.labourCardNo) issues.push('labour card number missing')
  if (line.routingCode && !validateRoutingCode(line.routingCode)) issues.push('routing code should be 9 digits')
  if (!line.routingCode) issues.push('routing code missing')
  if (!(Number(line.amountAed) > 0)) issues.push('amount must be > 0')
  return { ready: issues.length === 0, issues }
}

export function wpsFileReadiness(employer: SifDraftEmployer, lines: WpsLine[]): WpsReadiness {
  const issues: string[] = []
  if (!digitsOnly(employer.employerUniqueId)) issues.push('employer unique ID missing')
  if (!lines.length) issues.push('no employees in file')
  lines.forEach((l, i) => {
    const r = wpsLineReadiness(l)
    if (!r.ready) issues.push(`line ${i + 1} (${l.employeeCode || l.employeeName}): ${r.issues.join('; ')}`)
  })
  return { ready: issues.length === 0, issues }
}

/** Net pay: basic + allowances − deductions (never negative). */
export function payrollNetAed(basic: number, allowances: number, deductions: number): number {
  const net = (Number(basic) || 0) + (Number(allowances) || 0) - (Number(deductions) || 0)
  return Math.round(Math.max(0, net) * 100) / 100
}

/** Inclusive calendar days between two YYYY-MM-DD dates. */
export function daysInclusive(startIso: string, endIso: string): number {
  const a = new Date(startIso.slice(0, 10) + 'T00:00:00Z')
  const b = new Date(endIso.slice(0, 10) + 'T00:00:00Z')
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return 0
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000) + 1
}

/** Period bounds for a YYYY-MM payroll month (UTC calendar). */
export function periodBoundsFromYyyyMm(periodYyyyMm: string): { payStartIso: string; payEndIso: string } {
  const [y, m] = periodYyyyMm.split('-').map(Number)
  if (!y || !m) {
    const today = new Date().toISOString().slice(0, 10)
    return { payStartIso: today, payEndIso: today }
  }
  const start = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const end = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  return { payStartIso: start, payEndIso: end }
}

function csv(value: string): string {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function digitsOnly(value: string): string {
  return String(value || '').replace(/\D/g, '')
}

function compactIban(iban: string): string {
  return String(iban || '').replace(/\s+/g, '').toUpperCase()
}
