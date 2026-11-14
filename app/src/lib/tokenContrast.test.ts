import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Contrast guard for the HighMast design tokens (WCAG 2.1 AA).
 *
 * Reads the real values from src/styles/tokens.css, so changing a token in
 * that file to something that drops below its required ratio fails CI.
 * Text needs 4.5:1. Icons, input borders, focus rings and button fills need 3:1.
 */

const TOKENS_CSS = readFileSync(fileURLToPath(new URL('../styles/tokens.css', import.meta.url)), 'utf8')

type Theme = 'light' | 'dark'

/** Returns the hex tokens declared in the block whose selector contains `selector`. */
function readBlock(selector: string): Record<string, string> {
  const blocks = TOKENS_CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)
  for (const [, sel, body] of blocks) {
    if (!sel.includes(selector) || sel.includes('@media')) continue
    const out: Record<string, string> = {}
    for (const [, name, value] of body.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-f]{3,6})\s*;/gi)) {
      out[name] = value.toLowerCase()
    }
    return out
  }
  throw new Error(`No token block for ${selector} in tokens.css`)
}

const TOKENS: Record<Theme, Record<string, string>> = {
  light: readBlock("[data-theme='light']"),
  dark: readBlock("[data-theme='dark']"),
}

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
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
}

const TEXT = 4.5
const NON_TEXT = 3

/** [foreground token, background token, minimum ratio, what it is for] */
type Pair = [string, string, number, string]

const BOTH: Pair[] = [
  ['text', 'bg', TEXT, 'body text'],
  ['text', 'surface', TEXT, 'text on panels'],
  ['text-muted', 'bg', TEXT, 'secondary text'],
  ['text-muted', 'surface', TEXT, 'secondary text on panels'],
  ['primary-text', 'bg', TEXT, 'links and small coloured text'],
  ['primary-text', 'surface', TEXT, 'links on panels'],
  ['accent-text', 'bg', TEXT, 'small orange text and icons'],
  ['accent-text', 'surface', TEXT, 'small orange text on panels'],
  ['on-primary', 'primary', TEXT, 'button label on a primary fill'],
  ['on-accent', 'accent', TEXT, 'text on an orange fill'],
  ['success', 'bg', TEXT, 'success message'],
  ['danger', 'bg', TEXT, 'error message'],
  ['warn', 'bg', TEXT, 'warning message'],
  ['info', 'bg', TEXT, 'info message'],
  ['success', 'surface', TEXT, 'success message on panels'],
  ['danger', 'surface', TEXT, 'error message on panels'],
  ['warn', 'surface', TEXT, 'warning message on panels'],
  ['info', 'surface', TEXT, 'info message on panels'],
  ['focus-ring', 'bg', NON_TEXT, 'keyboard focus ring'],
  ['focus-ring', 'surface', NON_TEXT, 'focus ring on panels'],
  ['primary', 'bg', NON_TEXT, 'primary button edge against the page'],
]

describe('HighMast tokens are read from tokens.css', () => {
  const needed = ['bg', 'surface', 'text', 'text-muted', 'primary', 'on-primary', 'primary-text', 'accent', 'accent-text', 'on-accent', 'focus-ring']
  for (const theme of ['light', 'dark'] as const) {
    it(`${theme} declares every brand token as a hex colour`, () => {
      for (const name of needed) expect(TOKENS[theme][name], `--${name} in ${theme}`).toMatch(/^#[0-9a-f]{3,6}$/)
    })
  }

  it('keeps the exact brand values from the brief', () => {
    expect(TOKENS.light).toMatchObject({
      bg: '#ffffff', surface: '#f7f4f1', text: '#1a1a1a', 'text-muted': '#6e6e6e', primary: '#c8321a',
      'on-primary': '#ffffff', 'primary-text': '#c8321a', accent: '#e8872a', 'accent-text': '#a9540a',
      'on-accent': '#1a1a1a', 'focus-ring': '#c8321a',
    })
    expect(TOKENS.dark).toMatchObject({
      bg: '#141414', surface: '#1a1a1a', text: '#f7f4f1', 'text-muted': '#b8b2ac', primary: '#c8321a',
      'on-primary': '#ffffff', 'primary-text': '#f0654a', accent: '#e8872a', 'accent-text': '#e8872a',
      'on-accent': '#1a1a1a', 'focus-ring': '#e8872a',
    })
  })
})

describe('HighMast token contrast (WCAG 2.1 AA)', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const [fg, bg, min, use] of BOTH) {
      it(`${theme}: --${fg} on --${bg} is at least ${min}:1 (${use})`, () => {
        const a = TOKENS[theme][fg]
        const b = TOKENS[theme][bg]
        expect(a, `--${fg} missing in ${theme}`).toBeTruthy()
        expect(b, `--${bg} missing in ${theme}`).toBeTruthy()
        expect(contrast(a, b)).toBeGreaterThanOrEqual(min)
      })
    }
  }

  it('brand red is never the small text token on dark', () => {
    // #C8321A on #141414 is about 3.4:1, so dark mode must lift --primary-text.
    expect(TOKENS.dark['primary-text']).not.toBe('#c8321a')
    expect(contrast(TOKENS.dark['primary-text'], TOKENS.dark.bg)).toBeGreaterThanOrEqual(TEXT)
  })

  it('brand orange is never the text, icon or focus token on light', () => {
    expect(TOKENS.light['accent-text']).not.toBe('#e8872a')
    expect(TOKENS.light['focus-ring']).not.toBe('#e8872a')
  })

  it('status colours are separate from the brand colours', () => {
    for (const theme of ['light', 'dark'] as const) {
      const brand = new Set([TOKENS[theme].primary, TOKENS[theme]['primary-text'], TOKENS[theme].accent, TOKENS[theme]['accent-text']])
      for (const s of ['success', 'danger', 'warn', 'info']) expect(brand.has(TOKENS[theme][s]), `${theme} --${s}`).toBe(false)
    }
  })
})
