import { describe, expect, it } from 'vitest'
import { isMissingFunctionError } from './payrollServer'

describe('payroll server fallback', () => {
  it('treats a missing function as "use the old path"', () => {
    expect(isMissingFunctionError({ code: 'PGRST202', message: 'x' })).toBe(true)
    expect(isMissingFunctionError({ code: '42883' })).toBe(true)
    expect(isMissingFunctionError({ message: 'Could not find the function public.rr_payroll_generate_lines' })).toBe(true)
  })
  it('does not hide real errors such as permission denied', () => {
    expect(isMissingFunctionError({ code: '42501', message: 'Only managers or admins can calculate payroll' })).toBe(false)
    expect(isMissingFunctionError(null)).toBe(false)
  })
})
