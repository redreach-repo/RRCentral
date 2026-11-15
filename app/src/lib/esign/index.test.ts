import { describe, expect, it } from 'vitest'
import {
  availableEsignLevelForDocType,
  createQtspSigningSession,
  currentCanvasEsignLevel,
  esignLevelLabel,
  getQtspProvider,
  qtspReady,
  requiredEsignLevelForDocType,
} from './index'

describe('esign QTSP scaffold', () => {
  it('labels the canvas path as assent capture, never QES', () => {
    expect(currentCanvasEsignLevel()).toBe('assent_capture')
    expect(esignLevelLabel('assent_capture')).toMatch(/assent/i)
    expect(esignLevelLabel('qes')).toMatch(/Qualified/i)
  })

  it('is not ready without a licensed vendor', () => {
    expect(qtspReady({})).toBe(false)
    expect(getQtspProvider({}).id).toBe('stub')
  })

  it('refuses to start a QTSP session when unconfigured', async () => {
    await expect(
      createQtspSigningSession({}, { documentId: 'd1', documentTitle: 'NDA', signerName: 'A', signerEmail: 'a@b.co' }),
    ).rejects.toThrow(/QTSP/i)
  })

  it('keeps employment at assent until QTSP is connected even though matrix asks QES', () => {
    expect(requiredEsignLevelForDocType('employment')).toBe('qes')
    expect(availableEsignLevelForDocType('employment', {})).toBe('assent_capture')
    expect(availableEsignLevelForDocType('nda', {})).toBe('assent_capture')
  })
})
