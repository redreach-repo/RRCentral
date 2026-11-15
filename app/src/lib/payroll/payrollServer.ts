/**
 * Payroll maths runs in the database (A1, migration 20261320120000):
 * rr_payroll_generate_lines, rr_payroll_update_line, rr_payroll_run_totals.
 * The browser only shows results. Until that migration is applied to a
 * project, these return null and callers keep the old browser path, so live
 * keeps working (docs/DECISIONS.md D10).
 */
import { db } from '../db'
import { errorCode } from '../errors'

/** PostgREST / Postgres codes for "this function does not exist yet". */
export function isMissingFunctionError(err: unknown): boolean {
  const code = errorCode(err)
  if (code === 'PGRST202' || code === '42883') return true
  const msg = String((err as { message?: string } | null)?.message || '')
  return /could not find the function/i.test(msg)
}

export type PayrollRunTotals = {
  currency: string
  lineCount: number
  totalBasic: string
  totalAllowances: string
  totalDeductions: string
  totalNet: string
  totalGratuity: string
}

/** Generate lines server side. null = function not deployed yet (use the legacy path). */
export async function generatePayrollLinesServer(runId: string): Promise<number | null> {
  const { data, error } = await db.rpc('rr_payroll_generate_lines', { p_run: runId })
  if (error) {
    if (isMissingFunctionError(error)) return null
    throw error
  }
  return Number(data) || 0
}

/** Update one line server side (net is computed by the database). false = not deployed yet. */
export async function updatePayrollLineServer(
  lineId: string,
  patch: Partial<{ basic_aed: number; allowances_aed: number; deductions_aed: number }>,
): Promise<boolean> {
  const { error } = await db.rpc('rr_payroll_update_line', {
    p_line: lineId,
    p_basic: patch.basic_aed ?? null,
    p_allowances: patch.allowances_aed ?? null,
    p_deductions: patch.deductions_aed ?? null,
  })
  if (error) {
    if (isMissingFunctionError(error)) return false
    throw error
  }
  return true
}

/** Exact run totals as decimal strings. null = not deployed yet. */
export async function payrollRunTotalsServer(runId: string): Promise<PayrollRunTotals | null> {
  const { data, error } = await db.rpc('rr_payroll_run_totals', { p_run: runId })
  if (error) {
    if (isMissingFunctionError(error)) return null
    throw error
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined
  if (!row) return null
  return {
    currency: String(row.currency || 'AED'),
    lineCount: Number(row.line_count) || 0,
    totalBasic: String(row.total_basic ?? '0'),
    totalAllowances: String(row.total_allowances ?? '0'),
    totalDeductions: String(row.total_deductions ?? '0'),
    totalNet: String(row.total_net ?? '0'),
    totalGratuity: String(row.total_gratuity ?? '0'),
  }
}
