import type { PageId } from './a11y.spec'

/**
 * axe rules that already fail on main, per page and mode, with how many
 * elements fail. Taken from the first run on 14 Nov 2026 (after #407).
 * Each entry is a fix still owed. The check fails if a rule fails on more
 * elements than listed, or a new rule fails. Lower a number when you fix some,
 * and remove a rule once it is clean (the test tells you). Never raise a
 * number or add a rule to make a new failure pass.
 */
export const KNOWN_VIOLATIONS: Record<PageId, Record<'light' | 'dark', Record<string, number>>> = {
  'sign-in': { light: {}, dark: {} },
  // Light mode reads the tokens since the light mode pass (21 Nov). Left: company select has no name.
  // Dark: two links in plain brand red, too dark on dark.
  home: { light: { 'select-name': 1 }, dark: { 'color-contrast': 2, 'select-name': 1 } },
  // Date filter inputs have no label. Dark: the orange New button with white text.
  list: { light: { 'label': 2 }, dark: { 'color-contrast': 1, 'label': 2 } },
  // Inline field labels not tied to inputs (label, select-name). Dark: orange New button, a total in brand red.
  form: { light: { 'label': 3, 'select-name': 3 }, dark: { 'color-contrast': 2, 'label': 3, 'select-name': 3 } },
  // WhatsApp button white on green, grey Drive note on white.
  pdf: { light: { 'color-contrast': 2 }, dark: { 'color-contrast': 2 } },
}
