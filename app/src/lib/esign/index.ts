import {
  ESIGN_LEVEL_LABELS,
  QTSP_PROVIDER_OPTIONS,
  QTSP_PROVIDER_SETTING,
  REQUIRED_ESIGN_LEVEL,
  type EsignDocType,
  type EsignLevel,
  type QtspProvider,
  type QtspSignRequest,
  type QtspSignSession,
} from './types'
import { stubQtspProvider } from './stubProvider'

export {
  ESIGN_LEVEL_LABELS,
  QTSP_PROVIDER_OPTIONS,
  QTSP_PROVIDER_SETTING,
  REQUIRED_ESIGN_LEVEL,
  type EsignDocType,
  type EsignLevel,
  type QtspProvider,
  type QtspProviderId,
  type QtspSignRequest,
  type QtspSignSession,
} from './types'

const PROVIDERS: QtspProvider[] = [stubQtspProvider]

/** Today's `/sign` canvas path — never AdES/QES. */
export function currentCanvasEsignLevel(): EsignLevel {
  return 'assent_capture'
}

/** Level counsel would require for a doc type once QTSP exists. */
export function requiredEsignLevelForDocType(docType: EsignDocType): EsignLevel {
  return REQUIRED_ESIGN_LEVEL[docType] ?? 'assent_capture'
}

/**
 * What the product may honestly offer right now for a doc type.
 * Without a configured QTSP, always canvas assent — even if the matrix asks for AdES/QES.
 */
export function availableEsignLevelForDocType(
  docType: EsignDocType,
  settings: Record<string, string>,
): EsignLevel {
  const required = requiredEsignLevelForDocType(docType)
  if (required === 'assent_capture') return 'assent_capture'
  if (!qtspReady(settings)) return 'assent_capture'
  return required
}

export function esignLevelLabel(level: EsignLevel): string {
  return ESIGN_LEVEL_LABELS[level]
}

/** Resolve the configured QTSP adapter (stub until a licensed vendor is wired). */
export function getQtspProvider(settings: Record<string, string>): QtspProvider {
  const raw = String(settings[QTSP_PROVIDER_SETTING] || '').trim()
  return PROVIDERS.find((p) => p.id === raw) || stubQtspProvider
}

export function qtspReady(settings: Record<string, string>): boolean {
  const p = getQtspProvider(settings)
  return p.id !== 'stub' && p.isConfigured(settings)
}

/**
 * Start a Phase B QTSP session. Throws a clear product error when no licensed
 * vendor is connected — callers must not fall back to claiming QES on canvas.
 */
export async function createQtspSigningSession(
  settings: Record<string, string>,
  req: QtspSignRequest,
): Promise<QtspSignSession> {
  const provider = getQtspProvider(settings)
  if (!provider.isConfigured(settings)) {
    throw new Error(
      'No TDRA-licensed QTSP is connected. Canvas assent remains Phase A only — ask Alfred before a paid trust-service vendor.',
    )
  }
  return provider.createSigningSession(settings, req)
}

export function qtspProviderSelectOptions(): { value: string; label: string }[] {
  return QTSP_PROVIDER_OPTIONS.map((o) => ({ value: o.value, label: o.label }))
}
