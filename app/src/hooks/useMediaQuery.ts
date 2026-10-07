import { useEffect, useState } from 'react'

/** SSR-safe media query hook for responsive CRM layouts (phones, tablets, foldables). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/**
 * Compact CRM chrome: phones (incl. large / Pro Max), fold-closed,
 * fold-open portrait, and coarse-pointer tablets in narrow panes.
 * Large phones are often 390–430 CSS px; landscape can approach 900+.
 */
export function useCompactCrm(): boolean {
  return useMediaQuery(
    [
      '(max-width: 820px)',
      '(max-width: 980px) and (pointer: coarse)',
      '(max-width: 980px) and (hover: none)',
    ].join(', '),
  )
}

/**
 * Phone / foldable shell: show bottom primary nav + denser mobile chrome.
 * Covers big phones and most foldables in phone posture; tablets in portrait.
 */
export function usePhoneShell(): boolean {
  return useMediaQuery(
    [
      '(max-width: 920px)',
      '(max-width: 1100px) and (pointer: coarse)',
      '(max-width: 1100px) and (hover: none)',
    ].join(', '),
  )
}
