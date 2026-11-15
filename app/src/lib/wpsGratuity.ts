/**
 * UAE WPS / end-of-service gratuity helpers — planning drafts only.
 * Not legal advice. Figures must be checked against current UAE labour law
 * before any live payroll run.
 */

export type GratuityInput = {
  /** Continuous service in full years (floor). */
  yearsOfService: number
  /** Daily wage used for accrual (basic/30 is a common starting point). */
  dailyWageAed: number
}

/** Unlimited draft accrual used only for planning screens. */
export function draftGratuityAccrualAed(input: GratuityInput): number {
  const years = Math.max(0, Math.floor(input.yearsOfService))
  const daily = Math.max(0, Number(input.dailyWageAed) || 0)
  if (years <= 0 || daily <= 0) return 0
  // Placeholder band: 21 days/year for first 5 years, 30 thereafter (common UAE pattern).
  let days = 0
  const first = Math.min(years, 5)
  days += first * 21
  if (years > 5) days += (years - 5) * 30
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
}

/** Build a simple WPS-style CSV body (not a bank-certified file format). */
export function buildWpsCsvDraft(lines: WpsLine[], valueDateIso: string): string {
  const header = 'EmployeeCode,EmployeeName,IBAN,AmountAED,ValueDate'
  const rows = lines.map((l) =>
    [
      csv(l.employeeCode),
      csv(l.employeeName),
      csv(l.iban),
      (Math.round((Number(l.amountAed) || 0) * 100) / 100).toFixed(2),
      csv(valueDateIso.slice(0, 10)),
    ].join(','),
  )
  return [header, ...rows].join('\n')
}

/** Net pay: basic + allowances − deductions (never negative). */
export function payrollNetAed(basic: number, allowances: number, deductions: number): number {
  const net = (Number(basic) || 0) + (Number(allowances) || 0) - (Number(deductions) || 0)
  return Math.round(Math.max(0, net) * 100) / 100
}

function csv(value: string): string {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
