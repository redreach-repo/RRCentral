import { useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { runContractBilling } from '../lib/contractBillingStore'
import { ratesFromSettings } from '../lib/delivery'

/**
 * Once per sign in, raise any contract invoice that has come due (setup fee
 * at signing, then one invoice a month) as a draft on Invoices. There is no
 * server job, so this runs in the browser of whoever opens the app.
 */
export function useContractBillingSync(enabled: boolean) {
  const { user, appUserId } = useAuth()
  const { settings, loading } = useSettings()
  const { showToast } = useToast()
  const started = useRef(false)

  useEffect(() => {
    if (!enabled || loading || !user?.email || started.current) return
    started.current = true
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
