/**
 * Document viewer backdrop (invoices, quotes, delivery notes).
 * Only the area around the A4 sheet changes; the sheet itself, the PDF and
 * print output always stay white. Remembered per browser.
 */
export type ViewerTheme = 'light' | 'dark'

export const VIEWER_THEME_KEY = 'rr.documentViewer.theme'

export const VIEWER_BACKDROP: Record<ViewerTheme, string> = {
  light: '#f0f0f0',
  dark: '#121417',
}

export function parseViewerTheme(value: string | null | undefined): ViewerTheme {
  return value === 'dark' ? 'dark' : 'light'
}

export function loadViewerTheme(): ViewerTheme {
  try {
    return parseViewerTheme(window.localStorage.getItem(VIEWER_THEME_KEY))
  } catch {
    return 'light'
  }
}

export function saveViewerTheme(theme: ViewerTheme): void {
  try {
    window.localStorage.setItem(VIEWER_THEME_KEY, theme)
  } catch {
    // Private mode or blocked storage: the toggle still works for this visit.
  }
}

export function toggleViewerTheme(theme: ViewerTheme): ViewerTheme {
  return theme === 'dark' ? 'light' : 'dark'
}
