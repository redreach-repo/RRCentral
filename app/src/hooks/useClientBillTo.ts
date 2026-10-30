import { useCallback, useRef, useState } from 'react'
import { EMPTY_BILL_TO, billToDraftFor, matchClient, saveClientBillTo, type BillToDraft } from '../lib/clientBillTo'
import type { Client } from '../lib/types'

/**
 * Address + TRN fields on the invoice and quotation forms. Prefills from the
 * client record when the Client field matches one, and saves edits back to it.
 */
export function useClientBillTo(clients: Client[]) {
  const [draft, setDraft] = useState<BillToDraft>(EMPTY_BILL_TO)
  // True while the fields still hold untouched values prefilled from a client.
  const prefilled = useRef(false)

  const prefillFor = useCallback(
    (name: string) => {
      const found = billToDraftFor(clients, name)
      if (found) {
        setDraft(found)
        prefilled.current = true
      } else if (prefilled.current) {
        // Switched to a name we don't know: drop the previous client's details.
        setDraft(EMPTY_BILL_TO)
        prefilled.current = false
      }
    },
    [clients],
  )

  const edit = useCallback((patch: Partial<BillToDraft>) => {
    prefilled.current = false
    setDraft((d) => ({ ...d, ...patch }))
  }, [])

  const reset = useCallback(() => {
    prefilled.current = false
    setDraft(EMPTY_BILL_TO)
  }, [])

  const save = useCallback((name: string) => saveClientBillTo(name, draft), [draft])

  return { draft, edit, prefillFor, reset, save, isSavedClient: (name: string) => Boolean(matchClient(clients, name)) }
}
