import { collectExtensions } from './collect'
import type { ExtensionModule } from './types'

const found = import.meta.glob<{ default: ExtensionModule }>('./*/module.tsx', { eager: true })

/** Every gap plan module that has landed, in folder order. */
export const EXTENSION_MODULES: ExtensionModule[] = collectExtensions(found)
