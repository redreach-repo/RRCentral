import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { colors } from '../lib/uiStyles'
import { useCompactCrm } from '../hooks/useMediaQuery'
import { focusFirst, trapTabKey } from '../lib/focusTrap'

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
  alignItems: 'flex-start',
  justifyContent: 'center',
  zIndex: 10000,
  padding:
    'max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))',
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  animation: 'rrModalFadeIn 160ms ease-out',
}

const cardStyle: CSSProperties = {
  background: 'var(--surface, #141518)',
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  width: '100%',
  maxHeight: '90dvh',
  overflow: 'auto',
  boxShadow: 'var(--shadow, 0 12px 40px rgba(0,0,0,0.35))',
  animation: 'rrModalSlideIn 180ms ease-out',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '14px 16px',
  borderBottom: `1px solid ${colors.border}`,
  position: 'sticky',
  top: 0,
  background: 'var(--surface, #141518)',
  zIndex: 1,
}

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 650,
  color: colors.text,
  lineHeight: 1.25,
  minWidth: 0,
  wordBreak: 'break-word',
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
  flexShrink: 0,
}

export default function Modal({ open, title, onClose, children, width = 520 }: ModalProps) {
  const compact = useCompactCrm()
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (panel) trapTabKey(e, panel)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = window.setTimeout(() => {
      if (panel) focusFirst(panel)
    }, 20)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      previouslyFocused.current?.focus?.()
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  const maxWidth =
    compact
      ? '100%'
      : typeof width === 'number'
        ? `min(${width}px, 100%)`
        : width

  return createPortal(
    <div
      style={{
        ...overlayStyle,
        padding: compact
          ? 'max(0px, env(safe-area-inset-top)) 0 max(0px, env(safe-area-inset-bottom)) 0'
          : overlayStyle.padding,
        alignItems: compact ? 'stretch' : 'flex-start',
      }}
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
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; }
        }
      `}</style>
      <div
        ref={panelRef}
        style={{
          ...cardStyle,
          maxWidth,
          borderRadius: compact ? 0 : 12,
          maxHeight: compact ? '100dvh' : '90dvh',
          minHeight: compact ? '100dvh' : undefined,
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div style={headerStyle}>
          <h2 id={titleId} style={titleStyle}>
            {title}
          </h2>
          <button type="button" style={closeBtnStyle} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: compact ? 14 : 20 }}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}
