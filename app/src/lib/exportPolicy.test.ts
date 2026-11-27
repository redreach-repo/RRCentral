// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CSV_EXPORT_BLOCKED_EVENT, checkCsvExport, isCsvExportAllowed, setCsvExportAllowed } from './exportPolicy'

afterEach(() => setCsvExportAllowed(true))

describe('CSV export gate', () => {
  it('allows downloads by default', () => {
    expect(isCsvExportAllowed()).toBe(true)
    expect(checkCsvExport('a.csv')).toBe(true)
  })

  it('blocks and tells the screen when switched off', () => {
    const seen = vi.fn()
    window.addEventListener(CSV_EXPORT_BLOCKED_EVENT, seen)
    setCsvExportAllowed(false)
    expect(checkCsvExport('clients.csv')).toBe(false)
    expect(seen).toHaveBeenCalledTimes(1)
    window.removeEventListener(CSV_EXPORT_BLOCKED_EVENT, seen)
  })
})
