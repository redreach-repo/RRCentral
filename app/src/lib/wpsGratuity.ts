/**
 * UAE WPS / end-of-service gratuity helpers — first slice only.
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

function csv(value: string): string {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
