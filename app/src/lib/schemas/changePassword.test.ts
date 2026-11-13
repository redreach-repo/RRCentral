import { describe, expect, it } from 'vitest'
import { parseChangePassword } from './changePassword'

describe('parseChangePassword', () => {
  it('accepts matching passwords of min length', () => {
    expect(parseChangePassword({ newPassword: 'secret123', confirmPassword: 'secret123' })).toEqual({
      ok: true,
      data: { newPassword: 'secret123' },
    })
  })

  it('rejects short passwords', () => {
    const result = parseChangePassword({ newPassword: 'short', confirmPassword: 'short' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/at least 8/)
  })

  it('rejects mismatched confirmation', () => {
    const result = parseChangePassword({ newPassword: 'secret123', confirmPassword: 'secret124' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/do not match/)
  })
})
