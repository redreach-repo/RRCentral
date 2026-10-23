import { useState, type CSSProperties } from 'react'
import { FileSignature } from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import { listContacts, logAccountEvent } from '../../lib/accountsStore'
import { listAgreementTemplates } from '../../lib/agreementStore'
import { ratesFromSettings } from '../../lib/delivery'
import { downloadBlob } from '../../lib/documents'
import { errorMessage } from '../../lib/errors'
import { agreementFileName, buildAgreement, templateInUse } from '../../lib/serviceAgreement'
import { agreementPdf } from '../../lib/serviceAgreementPdf'
import type { Account, Contract, DeliveryPackage } from '../../lib/types'

/** Makes the service agreement PDF for a contract from the approved template. */
export default function ServiceAgreementButton({
  account,
  contract,
  pkg,
  author,
  style,
}: {
  account: Account
  contract: Contract
  pkg: DeliveryPackage | null
  author: { appUserId: string | null; email: string }
  style: CSSProperties
}) {
  const { settings } = useSettings()
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)

  async function make() {
    setBusy(true)
    try {
      const [{ rows }, contacts] = await Promise.all([listAgreementTemplates(), listContacts(account.id)])
      const template = templateInUse(rows)
      const contact = contacts.find((c) => c.is_primary) ?? contacts[0] ?? null
      const doc = buildAgreement(template, {
        contract,
        pkg,
        account,
        contact,
        settings,
        rates: ratesFromSettings(settings),
      })
      const blob = agreementPdf(doc.blocks, {
        footer: doc.footer,
        draft: doc.draft,
        providerName: doc.values.company_name,
        clientName: doc.values.client_name,
        clientSignatory: doc.values.client_signatory,
      })
      downloadBlob(blob, agreementFileName(account))
      void logAccountEvent(
        account.id,
        `Service agreement ${doc.values.agreement_reference} made (${doc.footer.charAt(0).toLowerCase()}${doc.footer.slice(1)})`,
        author,
      )
      if (doc.draft) {
        showToast('Made as a DRAFT: the template is not approved by a lawyer yet. See Agreement template.', 'info')
      } else {
        showToast('Service agreement downloaded', 'success')
      }
    } catch (e) {
      showToast(errorMessage(e, 'Could not make the agreement'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" style={style} disabled={busy} onClick={() => void make()}>
      <FileSignature size={12} /> {busy ? 'Making…' : 'Service agreement'}
    </button>
  )
}
