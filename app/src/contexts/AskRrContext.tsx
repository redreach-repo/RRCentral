import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type AskRrContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}

const AskRrContext = createContext<AskRrContextValue | null>(null)

export function AskRrProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const value = useMemo(() => ({ open, setOpen }), [open])
  return <AskRrContext.Provider value={value}>{children}</AskRrContext.Provider>
}

/** Opens Ask RR from a page header when the host is mounted on Sales CRM routes. */
export function useAskRr(): AskRrContextValue {
  const ctx = useContext(AskRrContext)
  if (!ctx) {
    return {
      open: false,
      setOpen: () => {
        // Host not mounted (outside Sales CRM)
      },
    }
  }
  return ctx
}
