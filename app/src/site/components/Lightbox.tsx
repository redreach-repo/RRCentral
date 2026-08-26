import { useEffect } from 'react'
import { siteAsset } from '../assets'
import { wrapIndex } from '../lib/wrapIndex'

export default function Lightbox({
  files,
  index,
  captions,
  onClose,
  onIndex,
}: {
  files: readonly string[]
  index: number
  captions?: readonly string[]
  onClose: () => void
  onIndex: (next: number) => void
}) {
  const current = wrapIndex(index, files.length)
  const file = files[current]
  const caption = captions?.[current]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onIndex(wrapIndex(current + 1, files.length))
      if (e.key === 'ArrowLeft') onIndex(wrapIndex(current - 1, files.length))
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [current, files.length, onClose, onIndex])

  if (!file) return null

  return (
    <div className="site-lightbox" role="dialog" aria-modal="true" aria-label="Photograph" onClick={onClose}>
      <button type="button" className="site-lightbox-close" aria-label="Close" onClick={onClose}>
        ×
      </button>
      {files.length > 1 && (
        <>
          <button
            type="button"
            className="site-lightbox-nav prev"
            aria-label="Previous photograph"
            onClick={(e) => {
              e.stopPropagation()
              onIndex(wrapIndex(current - 1, files.length))
            }}
          >
            ‹
          </button>
          <button
            type="button"
            className="site-lightbox-nav next"
            aria-label="Next photograph"
            onClick={(e) => {
              e.stopPropagation()
              onIndex(wrapIndex(current + 1, files.length))
            }}
          >
            ›
          </button>
        </>
      )}
      <figure onClick={(e) => e.stopPropagation()}>
        <img src={siteAsset(file)} alt={caption ?? ''} />
        {caption && <figcaption>{caption}</figcaption>}
      </figure>
    </div>
  )
}
