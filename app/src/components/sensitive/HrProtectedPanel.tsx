import { useEffect, useState } from 'react'
import { useI18n } from '../../contexts/I18nContext'
import { getHrMasked, type HrMasked } from '../../lib/fieldEncryption/fieldEncryption'
import SensitiveValue from './SensitiveValue'

/** Masked salary, IBAN and ID numbers for one employee, each with a logged Reveal. */
export default function HrProtectedPanel({ employeeId }: { employeeId: string }) {
  const { t } = useI18n()
  const [row, setRow] = useState<HrMasked | null | undefined>(undefined)

  useEffect(() => {
    let live = true
    getHrMasked(employeeId)
      .then((r) => live && setRow(r))
      .catch(() => live && setRow(null))
    return () => {
      live = false
    }
  }, [employeeId])

  if (row === undefined) return null
  return (
    <fieldset style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12, background: 'var(--card)' }}>
      <legend style={{ color: 'var(--primary-text)', fontWeight: 600 }}>{t('fle.section')}</legend>
      {row === null ? (
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>{t('fle.notReady')}</p>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0 }}>{t('fle.hint')}</p>
          <SensitiveValue field="hr.basic_salary" rowId={employeeId} masked={row.basic_salary} />
          <SensitiveValue field="hr.iban" rowId={employeeId} masked={row.iban} />
          <SensitiveValue field="hr.emirates_id" rowId={employeeId} masked={row.emirates_id} />
          <SensitiveValue field="hr.passport_no" rowId={employeeId} masked={row.passport_no} />
          <SensitiveValue field="hr.national_id" rowId={employeeId} masked={row.national_id} />
        </div>
      )}
    </fieldset>
  )
}
