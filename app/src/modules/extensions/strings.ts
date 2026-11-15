import { mergeExtensionStrings } from './collect'
import type { ExtensionStrings } from './types'

const found = import.meta.glob<{ default: ExtensionStrings }>('./*/strings.ts', { eager: true })

/** EN + AR strings contributed by extension modules (lib/i18n.ts falls back to these). */
export const EXTENSION_STRINGS: ExtensionStrings = mergeExtensionStrings(found)
