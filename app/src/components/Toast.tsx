import type { CSSProperties } from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info'

interface ToastProps {
  message: string
  type: ToastType
  onClose: () => void
}

const typeStyles: Record<ToastType, { bg: string; border: string; color: string; Icon: typeof Info }> =
  {
    success: {
      bg: 'rgba(34,197,94,0.15)',
      border: 'rgba(34,197,94,0.35)',
      color: '#4ade80',
      Icon: CheckCircle2,
    },
    error: {
      bg: 'rgba(239,68,68,0.15)',
      border: 'rgba(239,68,68,0.35)',
      color: '#f87171',
      Icon: XCircle,
    },
    info: {
      bg: 'rgba(59,130,246,0.15)',
      border: 'rgba(59,130,246,0.35)',
      color: '#60a5fa',
      Icon: Info,
    },
  }

export default function Toast({ message, type, onClose }: ToastProps) {
  const t = typeStyles[type]
  const Icon = t.Icon

  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '12px 14px',
    borderRadius: 10,
    background: '#1a1d22',
    border: `1px solid ${t.border}`,
    boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
    color: '#fff',
    pointerEvents: 'auto',
    animation: 'rrToastIn 180ms ease-out',
  }

  return (
    <div style={style} role="status">
      <style>{`
        @keyframes rrToastIn {
          from { opacity: 0; transform: translateX(12px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <Icon size={18} style={{ color: t.color, flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>{message}</div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'rgba(255,255,255,0.5)',
          cursor: 'pointer',
          padding: 2,
          display: 'inline-flex',
        }}
      >
        <X size={14} />
      </button>
    </div>
  )
}
