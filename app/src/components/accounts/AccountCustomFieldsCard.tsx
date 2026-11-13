import CustomFieldsCard from '../CustomFieldsCard'

type Props = {
  accountId: string
  editable: boolean
  onToast: (message: string, kind: 'success' | 'error') => void
}

/** Account detail wrapper around the shared custom fields card. */
export default function AccountCustomFieldsCard({ accountId, editable, onToast }: Props) {
  return (
    <CustomFieldsCard
      objectType="account"
      recordId={accountId}
      editable={editable}
      onToast={onToast}
    />
  )
}
