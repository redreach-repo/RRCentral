/** Keep Tab / Shift+Tab cycling inside a container while a dialog is open. */

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
  )
}

export function trapTabKey(
  e: KeyboardEvent,
  container: HTMLElement,
  activeEl?: Element | null,
) {
  if (e.key !== 'Tab') return
  const nodes = getFocusable(container)
  if (nodes.length === 0) {
    e.preventDefault()
    return
  }
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  const active =
    (activeEl ??
      (typeof document !== 'undefined' ? document.activeElement : null)) as HTMLElement | null
  if (e.shiftKey) {
    if (active === first || !container.contains(active)) {
      e.preventDefault()
      last.focus()
    }
  } else if (active === last) {
    e.preventDefault()
    first.focus()
  }
}

export function focusFirst(container: HTMLElement, prefer?: HTMLElement | null) {
  if (prefer && container.contains(prefer)) {
    prefer.focus()
    return
  }
  const nodes = getFocusable(container)
  ;(nodes[0] || container).focus()
}
