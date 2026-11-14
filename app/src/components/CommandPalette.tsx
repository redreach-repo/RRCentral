import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { commandPaletteItems, filterCommandPaletteItems } from '../lib/commandPalette'
import styles from './CommandPalette.module.css'

type Props = {
  open: boolean
  onClose: () => void
}

export default function CommandPalette({ open, onClose }: Props) {
  const { userRole } = useAuth()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const all = useMemo(() => commandPaletteItems(userRole, settings), [userRole, settings])
  const items = useMemo(() => filterCommandPaletteItems(all, query), [all, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    const t = window.setTimeout(() => inputRef.current?.focus(), 20)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [query])

  if (!open) return null

  function go(to: string) {
    onClose()
    navigate(to)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, Math.max(items.length - 1, 0)))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const hit = items[active]
      if (hit) go(hit.to)
    }
  }

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={onClose}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Jump to"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className={styles.searchRow}>
          <Search size={16} strokeWidth={2} aria-hidden />
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a page…"
            aria-autocomplete="list"
            aria-controls="rr-command-list"
          />
          <kbd className={styles.kbd}>esc</kbd>
        </div>
        <ul id="rr-command-list" className={styles.list} role="listbox">
          {items.length === 0 ? (
            <li className={styles.empty}>No matching pages</li>
          ) : (
            items.map((item, i) => (
              <li key={`${item.group}-${item.to}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? styles.optionActive : styles.option}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(item.to)}
                >
                  <span className={styles.optionLabel}>{item.label}</span>
                  <span className={styles.optionGroup}>{item.group}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
