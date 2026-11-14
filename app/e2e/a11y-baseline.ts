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
  // Light: sidebar labels near white on paper; hero button white on orange; company select has no name.
  home: { light: { 'color-contrast': 30, 'select-name': 1 }, dark: { 'color-contrast': 5, 'select-name': 1 } },
  // Sidebar section labels and labels; date filter inputs have no label.
  list: { light: { 'color-contrast': 28, 'label': 2 }, dark: { 'color-contrast': 3, 'label': 2 } },
  // Sidebar, inline field labels not tied to inputs (label, select-name).
  form: { light: { 'color-contrast': 28, 'label': 3, 'select-name': 3 }, dark: { 'color-contrast': 4, 'label': 3, 'select-name': 3 } },
  // WhatsApp button white on green, old orange #e85d04 button, grey Drive note on white.
  pdf: { light: { 'color-contrast': 3 }, dark: { 'color-contrast': 3 } },
}
