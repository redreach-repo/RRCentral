/** M13 DSR helpers. */

export type DsrRequestType = 'access' | 'erasure' | 'export'
export type DsrStatus = 'received' | 'in_progress' | 'completed' | 'rejected'

export function dsrTypeLabel(t: DsrRequestType): string {
  if (t === 'access') return 'Access'
  if (t === 'erasure') return 'Erasure'
  return 'Export'
}

export function nextDsrStatus(current: DsrStatus, action: 'start' | 'complete' | 'reject'): DsrStatus | null {
  if (action === 'start' && (current === 'received' || current === 'in_progress')) return 'in_progress'
  if (action === 'complete' && current !== 'rejected' && current !== 'completed') return 'completed'
  if (action === 'reject' && current !== 'completed') return 'rejected'
  return null
}

export function anonymizeContactPreview(_contact: {
  name: string
  email: string
  phone: string
}): { name: string; email: string; phone: string } {
  return { name: 'Redacted', email: '', phone: '' }
}
