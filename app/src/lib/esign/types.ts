/**
 * Honest e-sign levels under UAE Decree-Law 46/2021.
 * See docs/COMPLIANCE_NOTES.md § E-sign and docs/M5_CONTRACTS_ESIGN.md.
 */

/** What the product may claim for a given signing path. */
export type EsignLevel = 'assent_capture' | 'ades' | 'qes'

export const ESIGN_LEVEL_LABELS: Record<EsignLevel, string> = {
  assent_capture: 'Electronic signing record (assent capture)',
  ades: 'Advanced electronic signature (AdES)',
  qes: 'Qualified electronic signature (QES)',
}

/** Settings key for the chosen QTSP vendor slug when Phase B is live. */
export const QTSP_PROVIDER_SETTING = 'esignQtspProvider'

/** Known vendor slots — none ship credentials until Alfred approves a paid QTSP. */
export const QTSP_PROVIDER_OPTIONS = [
  { value: '', label: 'None — canvas assent only (Phase A)' },
  { value: 'pending_vendor', label: 'Reserved — TDRA-licensed QTSP (not connected)' },
] as const

export type QtspProviderId = (typeof QTSP_PROVIDER_OPTIONS)[number]['value']

export type QtspSignRequest = {
  documentId: string
  documentTitle: string
  signerName: string
  signerEmail: string
  /** PDF as base64 (without data: prefix) when a QTSP API is wired. */
  pdfBase64?: string
}

export type QtspSignSession = {
  provider: string
  externalId: string
  signingUrl: string
  level: Extract<EsignLevel, 'ades' | 'qes'>
}

/**
 * Phase B QTSP adapter. Implementations must only return AdES/QES when talking
 * to a TDRA-licensed provider — never map the canvas PNG to those levels.
 */
export type QtspProvider = {
  id: string
  displayName: string
  /** True only when credentials + vendor contract are configured. */
  isConfigured: (settings: Record<string, string>) => boolean
  createSigningSession: (
    settings: Record<string, string>,
    req: QtspSignRequest,
  ) => Promise<QtspSignSession>
}
