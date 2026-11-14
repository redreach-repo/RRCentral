/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  formFixture,
  homeFixture,
  listFixture,
  pdfFixture,
  signInFixture,
} from './fixtures'
import { formatViolations, mountFixture, runAxe } from './runAxe'
import type { ThemeMode } from './tokenStyles'

afterEach(() => {
  document.body.innerHTML = ''
  document.head.querySelectorAll('style').forEach((s) => s.remove())
  document.documentElement.removeAttribute('data-theme')
})

async function expectClean(html: string, theme: ThemeMode, label: string) {
  mountFixture(html, theme)
  const results = await runAxe(document.getElementById('a11y-root') || document.body)
  const msg = formatViolations(results)
  expect(results.violations, `${label} (${theme})\n${msg}`).toEqual([])
}

describe('HighMast axe surfaces (WCAG 2.1 AA)', () => {
  it('sign-in page (dark)', async () => {
    await expectClean(signInFixture(), 'dark', 'sign-in')
  })

  for (const theme of ['light', 'dark'] as const) {
    it(`Home shell (${theme})`, async () => {
      await expectClean(homeFixture(theme), theme, 'home')
    })

    it(`list page (${theme})`, async () => {
      await expectClean(listFixture(theme), theme, 'list')
    })

    it(`form page (${theme})`, async () => {
      await expectClean(formFixture(theme), theme, 'form')
    })

    it(`PDF / document viewer (${theme})`, async () => {
      await expectClean(pdfFixture(theme), theme, 'pdf')
    })
  }
})
