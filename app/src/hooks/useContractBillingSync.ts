import { useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { runContractBilling } from '../lib/contractBillingStore'
import { BILLING_LAST_RUN_KEY, scheduleIsRunning } from '../lib/contractBillingRun'
import { ratesFromSettings } from '../lib/delivery'

/**
 * Fallback for the daily contract-invoices schedule (06:00 Dubai). Once per
 * sign in, raise any contract invoice that has come due as a draft on
 * Invoices, but only while the schedule has not run in the last 36 hours
 * (not set up yet, or stopped). Both use the same rules and unique key, so
 * nothing is raised twice.
 */
export function useContractBillingSync(enabled: boolean) {
  const { user, appUserId } = useAuth()
  const { settings, loading } = useSettings()
  const { showToast } = useToast()
  const started = useRef(false)

  useEffect(() => {
    if (!enabled || loading || !user?.email || started.current) return
    started.current = true
    if (scheduleIsRunning(settings[BILLING_LAST_RUN_KEY])) return
    void (async () => {
      try {
        const { raised, refreshed } = await runContractBilling({
          rates: ratesFromSettings(settings),
          settings,
          author: { appUserId, email: user.email || '' },
        })
        if (raised > 0) {
          showToast(
            `${raised} draft invoice${raised === 1 ? '' : 's'} raised from contracts. Open Invoices to check and send ${raised === 1 ? 'it' : 'them'}.`,
            'success',
          )
        } else if (refreshed > 0) {
          showToast(`Usage added to ${refreshed} draft contract invoice${refreshed === 1 ? '' : 's'}.`, 'success')
        }
      } catch (e) {
        console.error('Contract billing run failed:', e)
      }
    })()
  }, [enabled, loading, user?.email, appUserId, settings, showToast])
}
