import { useRef, useState, type CSSProperties } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { compressLineItemImage, hasLineItemImage } from '../lib/lineItemImage'
import { buttonDangerStyle, buttonSecondaryStyle, colors } from '../lib/uiStyles'

type Props = {
  value?: string
  disabled?: boolean
  onChange: (imageData: string) => void
}

const thumbStyle: CSSProperties = {
  width: 48,
  height: 48,
  objectFit: 'cover',
  borderRadius: 4,
  border: `1px solid ${colors.border}`,
  background: '#fff',
  display: 'block',
}

/**
 * Optional line-item photo picker. Clearing leaves an empty string so the
 * printable quotation omits any image placeholder for that row.
 */
export default function LineItemImageField({ value, disabled, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const hasImage = hasLineItemImage(value)

  async function onPick(file: File | null) {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const dataUrl = await compressLineItemImage(file)
      onChange(dataUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add image.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {hasImage ? <img src={value} alt="" style={thumbStyle} /> : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          disabled={disabled || busy}
          onChange={(e) => void onPick(e.target.files?.[0] || null)}
        />
        <button
          type="button"
          style={{ ...buttonSecondaryStyle, padding: '2px 8px', fontSize: 11 }}
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus size={12} /> {hasImage ? 'Replace image' : 'Add image (optional)'}
        </button>
        {hasImage ? (
          <button
            type="button"
            style={{ ...buttonDangerStyle, padding: '2px 8px', fontSize: 11 }}
            disabled={disabled || busy}
            title="Remove image"
            onClick={() => {
              setError('')
              onChange('')
            }}
          >
            <Trash2 size={12} /> Remove
          </button>
        ) : null}
      </div>
      {busy ? <span style={{ fontSize: 11, color: colors.muted2 }}>Compressing…</span> : null}
      {error ? <span style={{ fontSize: 11, color: colors.danger }}>{error}</span> : null}
      {!hasImage && !busy && !error ? (
        <span style={{ fontSize: 11, color: colors.muted2 }}>
          Optional — if empty, no image appears on the quotation.
        </span>
      ) : null}
    </div>
  )
}
