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
