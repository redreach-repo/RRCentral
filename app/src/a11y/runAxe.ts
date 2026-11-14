import axe from 'axe-core'
import { TOKEN_STYLE, type ThemeMode } from './tokenStyles'

const RULES = {
  // Keep noise low: colour-contrast + structure rules that map to the brand a11y bar.
  runOnly: {
    type: 'tag' as const,
    values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
  },
}

export function mountFixture(html: string, theme: ThemeMode = 'dark'): HTMLElement {
  document.documentElement.lang = 'en'
  document.body.innerHTML = ''
  const style = document.createElement('style')
  style.textContent = TOKEN_STYLE
  document.head.appendChild(style)
  const root = document.createElement('div')
  root.id = 'a11y-root'
  root.setAttribute('data-theme', theme)
  root.innerHTML = html
  document.body.appendChild(root)
  // Ensure theme tokens apply when fixture root is nested
  const themed = root.querySelector('[data-theme]') as HTMLElement | null
  if (themed) {
    document.documentElement.setAttribute('data-theme', themed.getAttribute('data-theme') || theme)
  } else {
    document.documentElement.setAttribute('data-theme', theme)
  }
  return root
}

export async function runAxe(container: HTMLElement = document.body) {
  const results = await axe.run(container, RULES)
  return results
}

export function formatViolations(results: axe.AxeResults): string {
  if (!results.violations.length) return ''
  return results.violations
    .map((v) => {
      const nodes = v.nodes
        .slice(0, 5)
        .map((n) => `  - ${n.target.join(' ')}: ${n.failureSummary || n.html.slice(0, 120)}`)
        .join('\n')
      return `${v.id} (${v.impact}): ${v.help}\n${nodes}`
    })
    .join('\n\n')
}
