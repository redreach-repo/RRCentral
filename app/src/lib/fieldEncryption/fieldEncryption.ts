/**
 * Field-level encryption, app side (gap plan module 5, docs/modules/field-level-encryption.md).
 * Encryption and decryption happen in the database with a Vault key; the app
 * only ever asks rr_hr_sensitive() and shows what it gets back.
 */
import { db } from '../db'

export type HrSensitive = {
  employee_id: string
  basic_salary_aed: number | null
  iban: string
  masked: boolean
}

export const ENCRYPTED_PREFIX_RE = /^fle:v(\d+):/

/** True for a stored ciphertext (never show these to people). */
export function isCiphertext(value: unknown): boolean {
  return typeof value === 'string' && ENCRYPTED_PREFIX_RE.test(value)
}

/** Key version of a stored ciphertext, or null. */
export function cipherVersion(value: string): number | null {
  const m = ENCRYPTED_PREFIX_RE.exec(value)
  return m ? Number(m[1]) : null
}

/** Same mask as rr_fle_mask(…, 'iban') in SQL. */
export function maskIban(iban: string): string {
  const s = iban.replace(/\s/g, '')
  if (!s) return s
  return `${s.slice(0, 2)}•• •••• ${s.slice(-4)}`
}

/** Salary and IBAN for one employee: plain for manager/admin, masked for others. Every call is logged. */
export async function getHrSensitive(employeeId: string): Promise<HrSensitive> {
  const { data, error } = await db.rpc('rr_hr_sensitive', { p_employee_id: employeeId })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as HrSensitive | undefined
  if (!row) throw new Error('Employee not found')
  return { ...row, basic_salary_aed: row.basic_salary_aed == null ? null : Number(row.basic_salary_aed) }
}

export async function fieldEncryptionReady(): Promise<boolean> {
  const { data, error } = await db.rpc('rr_fle_ready')
  if (error) return false
  return data === true
}

export type RevealField = 'hr.basic_salary' | 'hr.iban' | 'hr.emirates_id' | 'hr.passport_no' | 'hr.national_id' | 'wanders.passport_number' | 'payroll.line'
export type RevealResult = { value: string | null; masked: boolean; outcome: 'revealed' | 'denied' | 'rate_limited' }

/** Ask the database for one plain value. Permission, rate limit and audit entry happen there. */
export async function revealField(field: RevealField, rowId: string, reason = ''): Promise<RevealResult> {
  const { data, error } = await db.rpc('rr_fle_reveal', { p_field: field, p_row_id: rowId, p_reason: reason })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as RevealResult | undefined
  if (!row) throw new Error('Record not found')
  return row
}

export type HrMasked = {
  employee_id: string
  basic_salary: string
  iban: string
  emirates_id: string
  passport_no: string
  national_id: string
  national_id_type: string
  encrypted: boolean
}

/** Masked values only (safe to show anyone in the tenant). null when the A1 migration is not applied yet. */
export async function getHrMasked(employeeId: string): Promise<HrMasked | null> {
  const { data, error } = await db.rpc('rr_hr_masked', { p_employee: employeeId })
  if (error) {
    const code = String((error as { code?: string }).code || '')
    if (code === 'PGRST202' || code === '42883') return null
    throw error
  }
  return ((Array.isArray(data) ? data[0] : data) as HrMasked | undefined) ?? null
}

/** Save an ID number. It is encrypted in the database and never stored in plain text. */
export async function setHrIdentity(
  employeeId: string,
  kind: 'emirates_id' | 'passport_no' | 'national_id',
  value: string,
  nationalIdType?: 'aadhaar' | 'pan' | 'sin' | 'other' | '',
): Promise<void> {
  const { error } = await db.rpc('rr_hr_set_identity', {
    p_employee: employeeId,
    p_kind: kind,
    p_value: value,
    p_national_id_type: nationalIdType ?? null,
  })
  if (error) throw error
}

/** Same as rr_fle_mask(…, 'id'): last four characters only. */
export function maskId(value: string): string {
  const s = value.replace(/[\s-]/g, '')
  return s ? `•••• ${s.slice(-4)}` : s
}
