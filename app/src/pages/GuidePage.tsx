import { Link } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import styles from './GuidePage.module.css'

/** In-app guide shell (RRCRM M1). Content packs land in later milestones. */
export default function GuidePage() {
  const { t } = useI18n()
  return (
    <div className={styles.wrap}>
      <p className={styles.eyebrow}>RR Central</p>
      <h1 className={styles.title}>{t('guide.title')}</h1>
      <p className={styles.body}>{t('guide.body')}</p>
      <Link to="/app" className={styles.back}>
        {t('guide.back')}
      </Link>
    </div>
  )
}
