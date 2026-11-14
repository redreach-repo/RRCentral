import { describe, expect, it } from 'vitest'
import { isThemeMode, resolveThemeMode } from './themeMode'

describe('themeMode', () => {
  it('accepts light, dark, and system', () => {
    expect(isThemeMode('light')).toBe(true)
    expect(isThemeMode('dark')).toBe(true)
    expect(isThemeMode('system')).toBe(true)
    expect(isThemeMode('auto')).toBe(false)
  })

  it('resolves explicit modes without reading the system', () => {
    expect(resolveThemeMode('light')).toBe('light')
    expect(resolveThemeMode('dark')).toBe('dark')
  })
})
