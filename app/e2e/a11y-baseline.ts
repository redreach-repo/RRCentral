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
  home: { light: { 'select-name': 1 }, dark: { 'select-name': 1 } },
  // Date filter inputs have no label.
  list: { light: { 'label': 2 }, dark: { 'label': 2 } },
  // Inline field labels not tied to inputs (label, select-name).
  form: { light: { 'label': 3, 'select-name': 3 }, dark: { 'label': 3, 'select-name': 3 } },
  // Grey Drive note on white.
  pdf: { light: { 'color-contrast': 1 }, dark: { 'color-contrast': 1 } },
}
