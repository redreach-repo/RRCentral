import { useState } from 'react'
import { resolveLogoUrl } from '../lib/brand'
import { companyInitials } from '../lib/companyInitials'
import styles from './CompanyMark.module.css'

type CompanyMarkProps = {
  /** Company name: used for the alt text and the initials tile. */
  name: string
  /** Logo to show. Empty means no logo: the initials tile is shown instead. */
  logoUrl?: string | null
  className?: string
}

/**
 * Sidebar company mark. A logo sits on a white chip in dark mode so dark
 * artwork stays visible; a company with no logo (or a broken one) gets an
 * initials tile in the brand colour.
 */
export default function CompanyMark({ name, logoUrl, className }: CompanyMarkProps) {
  const src = String(logoUrl || '').trim()
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showLogo = src !== '' && failedSrc !== src

  if (!showLogo) {
    return (
      <span className={`${styles.mark} ${className ?? ''}`} title={name}>
        <span className={styles.initials} aria-hidden="true">
          {companyInitials(name)}
        </span>
        <span className={styles.name}>{name}</span>
      </span>
    )
  }

  return (
    <span className={`${styles.mark} ${className ?? ''}`}>
      <span className={styles.chip}>
        <img
          src={resolveLogoUrl(src)}
          alt={name}
          className={styles.logo}
          onError={() => setFailedSrc(src)}
        />
      </span>
    </span>
  )
}
