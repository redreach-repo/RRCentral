// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CSV_EXPORT_BLOCKED_EVENT,
  checkCsvExport,
  csvRowCount,
  isCsvExportAllowed,
  requestCsvExport,
  setCsvExportAllowed,
  setExportLogger,
} from './exportPolicy'

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

describe('server export log', () => {
  afterEach(() => setExportLogger(null))

  it('counts rows without the header', () => {
    expect(csvRowCount('a,b\n1,2\n3,4\n')).toBe(2)
    expect(csvRowCount('a,b')).toBe(0)
  })

  it('stops a download the server refuses and explains the daily cap', async () => {
    const seen = vi.fn()
    window.addEventListener(CSV_EXPORT_BLOCKED_EVENT, seen)
    setExportLogger(async () => ({ allowed: false, reason: 'daily_cap', cap: 10 }))
    expect(await requestCsvExport('a.csv', 'h\n1')).toBe(false)
    expect((seen.mock.calls[0][0] as CustomEvent).detail.message).toContain('limit of 10')
    window.removeEventListener(CSV_EXPORT_BLOCKED_EVENT, seen)
  })

  it('lets the download go when the server log is missing', async () => {
    setExportLogger(async () => {
      throw new Error('function rr_log_export does not exist')
    })
    expect(await requestCsvExport('a.csv', 'h\n1')).toBe(true)
  })

  it('passes the row count to the server', async () => {
    const logger = vi.fn(async () => ({ allowed: true }))
    setExportLogger(logger)
    expect(await requestCsvExport('a.csv', 'h\n1\n2')).toBe(true)
    expect(logger).toHaveBeenCalledWith('a.csv', 2)
  })

  it('never asks the server when the local switch is off', async () => {
    const logger = vi.fn(async () => ({ allowed: true }))
    setExportLogger(logger)
    setCsvExportAllowed(false)
    expect(await requestCsvExport('a.csv', 'h\n1')).toBe(false)
    expect(logger).not.toHaveBeenCalled()
  })
})
