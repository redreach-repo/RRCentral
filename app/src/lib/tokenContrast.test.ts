import { describe, expect, it } from 'vitest'

/** Relative luminance (sRGB) — WCAG 2.1. */
function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const rgb = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
  const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

function contrast(a: string, b: string): number {
  const L1 = luminance(a)
  const L2 = luminance(b)
  const lighter = Math.max(L1, L2)
  const darker = Math.min(L1, L2)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Spec §5 design token pairs that must stay AA. */
const TEXT_PAIRS: Array<{ name: string; fg: string; bg: string; min: number }> = [
  // Light
  { name: 'light text on bg', fg: '#1A1A1A', bg: '#FFFFFF', min: 4.5 },
  { name: 'light text on surface', fg: '#1A1A1A', bg: '#F7F4F1', min: 4.5 },
  { name: 'light muted on bg', fg: '#6E6E6E', bg: '#FFFFFF', min: 4.5 },
  { name: 'light primary-text on bg', fg: '#C8321A', bg: '#FFFFFF', min: 4.5 },
  { name: 'light accent-text on bg', fg: '#A9540A', bg: '#FFFFFF', min: 4.5 },
  { name: 'light on-primary on primary', fg: '#FFFFFF', bg: '#C8321A', min: 4.5 },
  { name: 'light on-accent on accent', fg: '#1A1A1A', bg: '#E8872A', min: 4.5 },
  // Dark
  { name: 'dark text on bg', fg: '#F7F4F1', bg: '#141414', min: 4.5 },
  { name: 'dark text on surface', fg: '#F7F4F1', bg: '#1A1A1A', min: 4.5 },
  { name: 'dark muted on bg', fg: '#B8B2AC', bg: '#141414', min: 4.5 },
  { name: 'dark primary-text on bg', fg: '#F0654A', bg: '#141414', min: 4.5 },
  { name: 'dark accent-text on bg', fg: '#E8872A', bg: '#141414', min: 4.5 },
  { name: 'dark on-primary on primary', fg: '#FFFFFF', bg: '#C8321A', min: 4.5 },
]

const UI_PAIRS: Array<{ name: string; fg: string; bg: string; min: number }> = [
  { name: 'light focus-ring on bg', fg: '#C8321A', bg: '#FFFFFF', min: 3 },
  { name: 'dark focus-ring on bg', fg: '#E8872A', bg: '#141414', min: 3 },
]

describe('HighMast token contrast (WCAG 2.1 AA)', () => {
  for (const pair of TEXT_PAIRS) {
    it(`${pair.name} ≥ ${pair.min}:1`, () => {
      expect(contrast(pair.fg, pair.bg)).toBeGreaterThanOrEqual(pair.min)
    })
  }
  for (const pair of UI_PAIRS) {
    it(`${pair.name} ≥ ${pair.min}:1`, () => {
      expect(contrast(pair.fg, pair.bg)).toBeGreaterThanOrEqual(pair.min)
    })
  }

  it('never uses brand red as small text on dark (use primary-text instead)', () => {
    // Documented anti-pattern: #C8321A on #141414 fails AA for body text.
    expect(contrast('#C8321A', '#141414')).toBeLessThan(4.5)
  })
})
