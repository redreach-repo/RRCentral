import { useEffect, useRef } from 'react'
import { useToast } from '../contexts/ToastContext'
import { ensureRecurringDeductions } from '../lib/recurringDeductions'

const SESSION_TOAST_KEY = 'rrcentral_recurring_deductions_notice'

/** Sync Bank / Cursor / Zoom monthly rows once per browser session after login. */
export function useRecurringDeductionsSync(enabled: boolean) {
  const { showToast } = useToast()
  const started = useRef(false)

  useEffect(() => {
    if (!enabled || started.current) return
    started.current = true
    void (async () => {
      const { inserted, removed, error } = await ensureRecurringDeductions()
      if (sessionStorage.getItem(SESSION_TOAST_KEY)) return
      if (error) {
        sessionStorage.setItem(SESSION_TOAST_KEY, '1')
        showToast(`${error} Open Finance → Expenses and tap Sync monthly deductions.`, 'error')
        return
      }
      if (removed > 0 || inserted > 0) {
        sessionStorage.setItem(SESSION_TOAST_KEY, '1')
        const parts: string[] = []
        if (removed > 0) parts.push(`removed ${removed} duplicate`)
        if (inserted > 0) parts.push(`added ${inserted} missing`)
        showToast(
          `Monthly deductions updated (${parts.join(', ')}). See Finance → Expenses.`,
          'success',
        )
      }
    })()
  }, [enabled, showToast])
}
