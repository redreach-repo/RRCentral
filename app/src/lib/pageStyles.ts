import type { CSSProperties } from 'react'

export const colors = {
  bg: '#121417',
  card: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.12)',
  accent: '#e85d04',
  text: '#ffffff',
  muted: 'rgba(255,255,255,0.7)',
  muted2: 'rgba(255,255,255,0.45)',
  danger: '#ef4444',
  success: '#22c55e',
  warn: '#f59e0b',
  info: '#3b82f6',
} as const

export const page: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  minHeight: 0,
}

export const pageHeader: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

export const pageTitle: CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 700,
  color: colors.text,
  letterSpacing: '-0.02em',
}

export const pageSub: CSSProperties = {
  margin: '4px 0 0',
  fontSize: 13,
  color: colors.muted,
}

export const card: CSSProperties = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: 12,
  padding: 16,
}

export const btn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '8px 14px',
  borderRadius: 8,
  border: `1px solid ${colors.border}`,
  background: 'rgba(255,255,255,0.04)',
  color: colors.text,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

export const btnPrimary: CSSProperties = {
  ...btn,
  background: colors.accent,
  borderColor: colors.accent,
  color: '#fff',
}

export const btnDanger: CSSProperties = {
  ...btn,
  background: 'rgba(239,68,68,0.15)',
  borderColor: 'rgba(239,68,68,0.4)',
  color: '#fca5a5',
}

export const btnGhost: CSSProperties = {
  ...btn,
  background: 'transparent',
}

export const input: CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  border: `1px solid ${colors.border}`,
  background: 'rgba(0,0,0,0.25)',
  color: colors.text,
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
}

export const label: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: colors.muted,
  marginBottom: 6,
}

export const tableWrap: CSSProperties = {
  overflowX: 'auto',
  borderRadius: 12,
  border: `1px solid ${colors.border}`,
  background: colors.card,
}

export const table: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
  minWidth: 560,
}

export const th: CSSProperties = {
  textAlign: 'left',
  padding: '12px 14px',
  borderBottom: `1px solid ${colors.border}`,
  color: colors.muted2,
  fontWeight: 600,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
}

export const td: CSSProperties = {
  padding: '12px 14px',
  borderBottom: `1px solid rgba(255,255,255,0.06)`,
  color: colors.text,
  verticalAlign: 'middle',
}

export const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.65)',
  backdropFilter: 'blur(3px)',
  zIndex: 100,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
}

export const modal: CSSProperties = {
  background: '#1a1d22',
  border: `1px solid ${colors.border}`,
  borderRadius: 14,
  width: '100%',
  maxWidth: 560,
  maxHeight: '90vh',
  overflow: 'auto',
  boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
}

export const modalLarge: CSSProperties = {
  ...modal,
  maxWidth: 920,
}

export const modalHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 20px',
  borderBottom: `1px solid ${colors.border}`,
  position: 'sticky',
  top: 0,
  background: '#1a1d22',
  zIndex: 1,
}

export const modalBody: CSSProperties = {
  padding: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
}

export const modalFooter: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  justifyContent: 'flex-end',
  padding: '14px 20px',
  borderTop: `1px solid ${colors.border}`,
  position: 'sticky',
  bottom: 0,
  background: '#1a1d22',
}

export const formGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: 12,
}

export const emptyState: CSSProperties = {
  textAlign: 'center',
  padding: '48px 24px',
  color: colors.muted,
  fontSize: 14,
}

export const errorBanner: CSSProperties = {
  padding: '10px 14px',
  borderRadius: 8,
  background: 'rgba(239,68,68,0.12)',
  border: '1px solid rgba(239,68,68,0.35)',
  color: '#fca5a5',
  fontSize: 13,
}

export const pill = (bg: string, fg: string): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 10px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  background: bg,
  color: fg,
  whiteSpace: 'nowrap',
})

export function quoteStatusStyle(status: string): CSSProperties {
  const s = status.toLowerCase()
  if (s === 'draft') return pill('rgba(148,163,184,0.2)', '#cbd5e1')
  if (s === 'finalized') return pill('rgba(59,130,246,0.2)', '#93c5fd')
  if (s === 'sent') return pill('rgba(6,182,212,0.2)', '#67e8f9')
  if (s === 'awarded') return pill('rgba(34,197,94,0.2)', '#86efac')
  if (s === 'not awarded') return pill('rgba(239,68,68,0.2)', '#fca5a5')
  if (s === 'expired') return pill('rgba(245,158,11,0.2)', '#fcd34d')
  if (s === 'superseded') return pill('rgba(100,116,139,0.25)', '#94a3b8')
  return pill('rgba(148,163,184,0.2)', '#cbd5e1')
}

export function paymentStatusStyle(status: string): CSSProperties {
  const s = status.toLowerCase()
  if (s === 'paid') return pill('rgba(34,197,94,0.2)', '#86efac')
  if (s === 'partial') return pill('rgba(245,158,11,0.2)', '#fcd34d')
  if (s === 'overdue') return pill('rgba(239,68,68,0.2)', '#fca5a5')
  return pill('rgba(148,163,184,0.2)', '#cbd5e1')
}
