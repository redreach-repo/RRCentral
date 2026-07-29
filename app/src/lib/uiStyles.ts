import type { CSSProperties } from 'react'

export const colors = {
  bg: '#121417',
  card: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.12)',
  accent: '#e85d04',
  text: '#fff',
  muted: 'rgba(255,255,255,0.7)',
  muted2: 'rgba(255,255,255,0.45)',
  danger: '#ef4444',
  success: '#22c55e',
}

export const pageStyle: CSSProperties = {
  padding: '24px',
  color: colors.text,
  minHeight: '100%',
}

export const cardStyle: CSSProperties = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: 12,
  padding: 20,
}

export const pageTitleStyle: CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  margin: '0 0 4px',
}

export const pageSubtitleStyle: CSSProperties = {
  fontSize: 14,
  color: colors.muted,
  margin: '0 0 24px',
}

export const sectionTitleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  margin: '0 0 16px',
}

export const buttonPrimaryStyle: CSSProperties = {
  background: colors.accent,
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '10px 16px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
}

export const buttonSecondaryStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: '10px 16px',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
}

export const buttonDangerStyle: CSSProperties = {
  ...buttonSecondaryStyle,
  color: colors.danger,
  borderColor: 'rgba(239,68,68,0.35)',
}

export const inputStyle: CSSProperties = {
  width: '100%',
  background: 'rgba(0,0,0,0.35)',
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: '10px 12px',
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
}

export const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
}

export const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  color: colors.muted2,
  fontWeight: 600,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: `1px solid ${colors.border}`,
  whiteSpace: 'nowrap',
}

export const tdStyle: CSSProperties = {
  padding: '12px',
  borderBottom: `1px solid rgba(255,255,255,0.06)`,
  color: colors.text,
  verticalAlign: 'middle',
}

export const toolbarStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 20,
}

export const selectStyle: CSSProperties = {
  ...inputStyle,
  width: 'auto',
  minWidth: 160,
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

export function escapeCsv(value: unknown): string {
  const s = String(value ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
