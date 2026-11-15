/**
 * Plug-in slots for the gap plan modules (docs/MODULE_BUILD_PLAN.md).
 *
 * Each new module lives in its own folder `modules/extensions/<module>/` with:
 *   - `module.tsx`  default export `ExtensionModule` (sidebar group + routes)
 *   - `strings.ts`  default export `ExtensionStrings` (EN + AR labels)
 * They are picked up by `import.meta.glob`, so a module PR never has to edit
 * App.tsx, modules/nav.ts or lib/i18n.ts, and two agents never clash there.
 */
import type { ReactNode } from 'react'
import type { ModuleManifest } from '../registry'

export type ExtensionRoute = {
  /** Path inside the signed in Layout, without a leading slash (e.g. "hr/employees"). */
  path: string
  /** Usually a React.lazy page; the slot wraps it in Suspense. */
  element: ReactNode
}

export type ExtensionModule = {
  manifest: ModuleManifest
  routes: ExtensionRoute[]
}

export type ExtensionStrings = {
  en: Record<string, string>
  ar: Record<string, string>
}
