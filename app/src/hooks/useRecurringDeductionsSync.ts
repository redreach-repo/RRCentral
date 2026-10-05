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
      const { inserted, error } = await ensureRecurringDeductions()
      if (sessionStorage.getItem(SESSION_TOAST_KEY)) return
      if (error) {
        sessionStorage.setItem(SESSION_TOAST_KEY, '1')
        showToast(`${error} Open Finance → Expenses and tap Sync monthly deductions.`, 'error')
        return
      }
      if (inserted > 0) {
        sessionStorage.setItem(SESSION_TOAST_KEY, '1')
        showToast(
          `Added ${inserted} monthly deductions (Bank, Cursor, Zoom). See Finance → Expenses.`,
          'success',
        )
      }
    })()
  }, [enabled, showToast])
}
