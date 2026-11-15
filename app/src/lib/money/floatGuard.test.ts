/**
 * Lint guard (A1 accept): no float arithmetic in the money path.
 * Files listed in MONEY_PATH must not round or format money with floats.
 * Everything else is held to a shrink-only baseline so new float money code
 * cannot be added anywhere. Lower FLOAT_MONEY_BASELINE when you convert a file.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..', '..')

export const MONEY_PATH = [
  'lib/money/index.ts',
  'lib/money.ts',
  'lib/lineItems.ts',
  'lib/currency.ts',
  'lib/ledger/ledger.ts',
  'lib/ledger/autoPost.ts',
  'lib/wpsGratuity.ts',
]

/** Float rounding / parsing patterns that must not touch money. */
const FORBIDDEN = [/Math\.round\(/, /Math\.(floor|ceil|trunc)\([^)]*\*\s*100\b/, /\.toFixed\(/, /parseFloat\(/, /\*\s*100\)\s*\/\s*100/]

// Float rounding patterns outside MONEY_PATH on 2026-11-15 (some are percentages, not money). Shrink only.
const FLOAT_MONEY_BASELINE = 183

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

function hits(text: string): string[] {
  return text.split('\n').filter((line) => FORBIDDEN.some((re) => re.test(line)) && !line.includes('money-guard: not money'))
}

describe('money float guard', () => {
  it.each(MONEY_PATH)('%s has no float money arithmetic', (rel) => {
    expect(hits(readFileSync(join(SRC, rel), 'utf8'))).toEqual([])
  })

  it('float money patterns elsewhere do not grow', () => {
    let count = 0
    for (const file of walk(SRC)) {
      if (MONEY_PATH.includes(relative(SRC, file).replace(/\\/g, '/'))) continue
      count += hits(readFileSync(file, 'utf8')).length
    }
    expect(count).toBeLessThanOrEqual(FLOAT_MONEY_BASELINE)
  })
})
