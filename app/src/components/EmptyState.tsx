import type { CSSProperties, ReactNode } from 'react'
import { colors, buttonPrimaryStyle } from '../lib/uiStyles'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  subtitle?: string
  actionLabel?: string
  onAction?: () => void
}

const wrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: '48px 24px',
  color: colors.muted,
}

const iconWrapStyle: CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 14,
  background: 'rgba(255,255,255,0.06)',
  border: `1px solid ${colors.border}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 16,
  color: colors.muted,
}

const titleStyle: CSSProperties = {
  margin: '0 0 6px',
  fontSize: 16,
  fontWeight: 600,
  color: colors.text,
}

const subtitleStyle: CSSProperties = {
  margin: '0 0 20px',
  fontSize: 13,
  color: colors.muted,
  maxWidth: 360,
  lineHeight: 1.5,
}

export default function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div style={wrapStyle}>
      {icon ? <div style={iconWrapStyle}>{icon}</div> : null}
      <h3 style={titleStyle}>{title}</h3>
      {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
      {actionLabel && onAction ? (
        <button type="button" style={buttonPrimaryStyle} onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
