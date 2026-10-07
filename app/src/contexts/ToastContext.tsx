import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import Toast, { type ToastType } from '../components/Toast'
import { usePhoneShell } from '../hooks/useMediaQuery'
import styles from '../components/ToastStack.module.css'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

let toastId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const phoneShell = usePhoneShell()
  const [bannerH, setBannerH] = useState(0)

  useEffect(() => {
    const measure = () => {
      const el = document.querySelector<HTMLElement>('[class*="localBanner"]')
      setBannerH(el ? Math.ceil(el.getBoundingClientRect().height) : 0)
    }
    measure()
    window.addEventListener('resize', measure)
    const t = window.setInterval(measure, 1500)
    return () => {
      window.removeEventListener('resize', measure)
      window.clearInterval(t)
    }
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, message, type }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  const value = useMemo(() => ({ showToast }), [showToast])

  const topbar = phoneShell ? 56 : 60
  const stackStyle = {
    top: `calc(${12 + bannerH}px + env(safe-area-inset-top, 0px) + ${topbar}px)`,
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className={`${styles.stack} ${phoneShell ? styles.stackPhone : ''}`}
        style={stackStyle}
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((t) => (
          <Toast
            key={t.id}
            message={t.message}
            type={t.type}
            onClose={() => removeToast(t.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
