import type { CSSProperties } from 'react'
import { resolveLogoUrl } from '../lib/brand'

type BrandLogoProps = {
  /** Settings logoUrl override (optional) */
  src?: string | null
  alt?: string
  height?: number
  className?: string
  style?: CSSProperties
}

/** Official RED REACH logo (public/logo.png) with optional settings override. */
export default function BrandLogo({
  src,
  alt = 'RED REACH',
  height = 36,
  className,
  style,
}: BrandLogoProps) {
  return (
    <img
      src={resolveLogoUrl(src)}
      alt={alt}
      className={className}
      style={{
        height,
        width: 'auto',
        maxWidth: '100%',
        objectFit: 'contain',
        display: 'block',
        ...style,
      }}
    />
  )
}
