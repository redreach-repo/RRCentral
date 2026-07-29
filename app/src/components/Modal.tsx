import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { colors } from '../lib/uiStyles'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  width?: number | string
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.65)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 16,
  animation: 'rrModalFadeIn 160ms ease-out',
}

const cardStyle: CSSProperties = {
  background: '#1a1d22',
  border: `1px solid ${colors.border}`,
  borderRadius: 12,
  width: '100%',
  maxHeight: '90vh',
  overflow: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
  animation: 'rrModalSlideIn 180ms ease-out',
}

const headerStyle: CSSProperties = {
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

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 650,
  color: colors.text,
}

const closeBtnStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: colors.muted,
  cursor: 'pointer',
  padding: 6,
  borderRadius: 6,
  display: 'inline-flex',
  alignItems: 'center',
}

const bodyStyle: CSSProperties = {
  padding: 20,
}

export default function Modal({ open, title, onClose, children, width = 520 }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      style={overlayStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="presentation"
    >
      <style>{`
        @keyframes rrModalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes rrModalSlideIn {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div
        style={{ ...cardStyle, maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div style={headerStyle}>
          <h2 style={titleStyle}>{title}</h2>
          <button type="button" style={closeBtnStyle} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div style={bodyStyle}>{children}</div>
      </div>
    </div>
  )
}
