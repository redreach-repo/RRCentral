import AxeBuilder from '@axe-core/playwright'
import { appendFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { KNOWN_VIOLATIONS } from './a11y-baseline'

/**
 * Brief step 4: automated accessibility checks for the sign in page, Home,
 * a list, a form and a PDF (document view), in light and dark mode.
 *
 * WCAG 2.1 A and AA rules. A page fails on any violation beyond the known
 * baseline in e2e/a11y-baseline.ts (a new rule, or more failing elements),
 * and the baseline only shrinks: a listed rule that no longer fires also
 * fails, so it gets removed.
 */

const THEME_KEY = 'highmast.themeMode'
const MODES = ['light', 'dark'] as const
type Mode = (typeof MODES)[number]
export type PageId = 'sign-in' | 'home' | 'list' | 'form' | 'pdf'

async function axe(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  return result.violations
}

function check(id: PageId, mode: Mode, violations: Awaited<ReturnType<typeof axe>>) {
  // Full detail for the report and, with A11Y_JSON=<file>, as JSON lines for review.
  void test.info().attach(`axe ${id} ${mode}`, { body: JSON.stringify(violations, null, 2), contentType: 'application/json' })
  if (process.env.A11Y_JSON) {
    for (const v of violations) {
      appendFileSync(
        process.env.A11Y_JSON,
        JSON.stringify({ page: id, mode, rule: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 160), summary: n.failureSummary?.slice(0, 220) })) }) + '\n',
      )
    }
  }
  const known = KNOWN_VIOLATIONS[id][mode]
  const fresh = violations
    .filter((v) => v.nodes.length > (known[v.id] ?? 0))
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} on ${v.nodes.length} element(s), baseline ${known[v.id] ?? 0}, e.g. ${v.nodes[0]?.target.join(' ')}`,
    )
  const found = new Set(violations.map((v) => v.id))
  const fixed = Object.keys(known).filter((rule) => !found.has(rule))
  expect.soft(fresh, `${id} in ${mode}: new accessibility violations`).toEqual([])
  expect.soft(fixed, `${id} in ${mode}: fixed, remove from e2e/a11y-baseline.ts`).toEqual([])
}

async function signIn(page: Page) {
  await page.goto('login')
  await page.locator('#login-email').fill('a11y@redreach.ae')
  await page.locator('#login-password').fill('local-mode')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/app$/)
}

/** Makes one draft quotation in this test browser's local data and returns its document URL. */
async function createDraftQuote(page: Page): Promise<string> {
  await page.goto('quotations')
  await page.getByRole('button', { name: 'New quotation' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('input').first().fill('Accessibility Test Client')
  await dialog.getByRole('button', { name: 'Save Draft' }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: 'Actions' }).first().click()
  const href = await page.locator('a[href*="/document/quote/"]').first().getAttribute('href')
  expect(href).toBeTruthy()
  return href!.replace(/^\/RRCentral\//, '')
}

for (const mode of MODES) {
  test(`accessibility in ${mode} mode`, async ({ page }) => {
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [THEME_KEY, mode])
    await page.emulateMedia({ colorScheme: mode, reducedMotion: 'reduce' })

    await test.step('sign in page', async () => {
      await page.goto('login')
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
      check('sign-in', mode, await axe(page))
    })

    await signIn(page)
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode)

    await test.step('Home', async () => {
      await page.waitForLoadState('networkidle')
      check('home', mode, await axe(page))
    })

    const docPath = await createDraftQuote(page)

    await test.step('a list (Expenses)', async () => {
      await page.goto('expenses')
      await expect(page.getByRole('table').first()).toBeVisible()
      check('list', mode, await axe(page))
    })

    await test.step('a form (New quotation)', async () => {
      await page.goto('quotations')
      await page.getByRole('button', { name: 'New quotation' }).first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      check('form', mode, await axe(page))
    })

    await test.step('a PDF (quotation document view)', async () => {
      await page.goto(docPath)
      await page.waitForLoadState('networkidle')
      check('pdf', mode, await axe(page))
    })
  })
}
