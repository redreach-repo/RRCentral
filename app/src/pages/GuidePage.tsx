import { Link } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import { GUIDE_CRM_SECTIONS } from '../lib/guideCrm'
import styles from './GuidePage.module.css'

/** In-app guide — CRM day-to-day pack (RRCRM M1 content). */
export default function GuidePage() {
  const { t } = useI18n()
  return (
    <div className={styles.wrap}>
      <p className={styles.eyebrow}>RR Central</p>
      <h1 className={styles.title}>{t('guide.title')}</h1>
      <p className={styles.body}>{t('guide.body')}</p>

      <ol className={styles.sections}>
        {GUIDE_CRM_SECTIONS.map((section) => (
          <li key={section.id} className={styles.section}>
            <h2 className={styles.sectionTitle}>{t(section.titleKey)}</h2>
            <p className={styles.sectionBody}>{t(section.bodyKey)}</p>
            <Link to={section.to} className={styles.sectionLink}>
              {t(section.linkKey)}
            </Link>
          </li>
        ))}
      </ol>

      <Link to="/app" className={styles.back}>
        {t('guide.back')}
      </Link>
    </div>
  )
}
