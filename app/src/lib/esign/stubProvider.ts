import type { QtspProvider } from './types'

/** Placeholder until a TDRA-licensed QTSP is approved and wired. */
export const stubQtspProvider: QtspProvider = {
  id: 'stub',
  displayName: 'Not connected',
  isConfigured: () => false,
  createSigningSession: async () => {
    throw new Error('QTSP provider is not configured')
  },
}
