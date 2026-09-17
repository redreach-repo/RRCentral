import type { CSSProperties, ReactNode } from 'react'
import styles from './PageHeader.module.css'

type Props = {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  style?: CSSProperties
}

export default function PageHeader({ title, subtitle, actions, style }: Props) {
  return (
    <header className={styles.header} style={style}>
      <div className={styles.copy}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  )
}
