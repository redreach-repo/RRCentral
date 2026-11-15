import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useI18n } from '../../contexts/I18nContext'
import { revealField, type RevealField } from '../../lib/fieldEncryption/fieldEncryption'
import { errorMessage } from '../../lib/errors'

/**
 * Shows a masked value. "Reveal" asks the database (rr_fle_reveal), which checks
 * the permission, rate limits and writes an audit entry. Uses theme tokens, so it
 * works in light and dark.
 */
export default function SensitiveValue({ field, rowId, masked }: { field: RevealField; rowId: string; masked: string }) {
  const { t } = useI18n()
  const [plain, setPlain] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function reveal() {
    setBusy(true)
    setNote('')
    try {
      const r = await revealField(field, rowId, t('fle.field.' + field))
      if (r.outcome === 'revealed') setPlain(r.value ?? '')
      else setNote(t(r.outcome === 'rate_limited' ? 'fle.rateLimited' : 'fle.denied'))
    } catch (err) {
      setNote(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const shown = plain ?? masked
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, color: 'var(--muted)', minWidth: 130 }}>{t('fle.field.' + field)}</span>
      <code dir="ltr" style={{ color: 'var(--primary-text)', background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}>
        {shown || t('fle.empty')}
      </code>
      {shown ? (
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => (plain === null ? void reveal() : setPlain(null))}
          aria-label={plain === null ? t('fle.reveal') : t('fle.hide')}
        >
          {plain === null ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}{' '}
          {busy ? t('fle.revealing') : plain === null ? t('fle.reveal') : t('fle.hide')}
        </button>
      ) : null}
      {note ? <span role="status" style={{ fontSize: 12, color: 'var(--danger)' }}>{note}</span> : null}
    </div>
  )
}
