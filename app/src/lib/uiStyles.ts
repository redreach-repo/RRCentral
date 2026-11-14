import type { CSSProperties } from 'react'

/** Shared CRM chrome — reads HighMast design tokens (see styles/tokens.css). */
export const colors = {
  bg: 'var(--bg)',
  card: 'var(--card)',
  border: 'var(--border)',
  accent: 'var(--primary)',
  text: 'var(--text)',
  muted: 'var(--muted)',
  muted2: 'var(--muted-2)',
  danger: 'var(--danger)',
  success: 'var(--success)',
  warn: 'var(--warn)',
}

export const pageStyle: CSSProperties = {
  padding: 0,
  color: colors.text,
  minHeight: '100%',
  width: '100%',
  maxWidth: '100%',
  overflowX: 'hidden',
}

export const formGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
  gap: 12,
}

export const dualPanelGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
  gap: 16,
}

export const kpiGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
  gap: 12,
  marginBottom: 24,
}

export const cardStyle: CSSProperties = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  padding: 18,
}

export const pageTitleStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 650,
  letterSpacing: '-0.02em',
  margin: '0 0 4px',
}

export const pageSubtitleStyle: CSSProperties = {
  fontSize: 14,
  color: colors.muted,
  margin: '0 0 24px',
}

export const sectionTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: '-0.01em',
  margin: '0 0 14px',
}

export const buttonPrimaryStyle: CSSProperties = {
  background: 'var(--primary)',
  color: 'var(--on-primary)',
  border: 'none',
  borderRadius: 8,
  padding: '9px 14px',
  minHeight: 44,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
}

export const buttonSecondaryStyle: CSSProperties = {
  background: 'transparent',
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: '9px 14px',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
}

export const buttonDangerStyle: CSSProperties = {
  ...buttonSecondaryStyle,
  color: colors.danger,
  borderColor: 'rgba(240,113,120,0.35)',
}

export const inputStyle: CSSProperties = {
  width: '100%',
  background: 'rgba(0,0,0,0.28)',
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: '9px 12px',
  color: colors.text,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
}

export const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: colors.muted,
  marginBottom: 6,
  fontWeight: 500,
}

export const fieldStyle: CSSProperties = {
  marginBottom: 14,
}

export const tableWrapStyle: CSSProperties = {
  overflowX: 'auto',
  width: '100%',
  WebkitOverflowScrolling: 'touch',
  maxWidth: '100%',
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  background: 'rgba(255,255,255,0.02)',
}

export const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
}

export const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '10px 14px',
  color: colors.muted2,
  fontWeight: 600,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  borderBottom: `1px solid ${colors.border}`,
  whiteSpace: 'nowrap',
  position: 'sticky',
  top: 0,
  background: 'rgba(11, 12, 14, 0.94)',
  backdropFilter: 'blur(8px)',
  zIndex: 1,
}

export const tdStyle: CSSProperties = {
  padding: '12px 14px',
  borderBottom: `1px solid rgba(255,255,255,0.05)`,
  color: colors.text,
  verticalAlign: 'middle',
}

export const toolbarStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 18,
}

export const selectStyle: CSSProperties = {
  ...inputStyle,
  width: '100%',
  minWidth: 0,
  cursor: 'pointer',
}

export function formatMoney(amount: number, currency = 'AED'): string {
  const n = Number(amount) || 0
  return `${currency} ${n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function escapeCsv(value: unknown): string {
  const s = String(value ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
