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
 * Compact CRM chrome: phones, fold-closed, many fold-open portrait widths,
 * and coarse-pointer tablets in split-screen / narrow panes.
 */
export function useCompactCrm(): boolean {
  return useMediaQuery('(max-width: 720px), (max-width: 900px) and (pointer: coarse)')
}
