import { Link } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import { GUIDE_PACKS } from '../lib/guidePacks'
import styles from './GuidePage.module.css'

/** In-app guide — CRM + billing + delivery + ops + finance + admin content packs (RRCRM M1+). */
export default function GuidePage() {
  const { t } = useI18n()
  return (
    <div className={styles.wrap}>
      <p className={styles.eyebrow}>RR Central</p>
      <h1 className={styles.title}>{t('guide.title')}</h1>
      <p className={styles.body}>{t('guide.body')}</p>

      {GUIDE_PACKS.map((pack) => (
        <section key={pack.id} className={styles.pack} aria-labelledby={`guide-pack-${pack.id}`}>
          <h2 id={`guide-pack-${pack.id}`} className={styles.packTitle}>
            {t(pack.titleKey)}
          </h2>
          <ol className={styles.sections}>
            {pack.sections.map((section) => (
              <li key={section.id} className={styles.section}>
                <h3 className={styles.sectionTitle}>{t(section.titleKey)}</h3>
                <p className={styles.sectionBody}>{t(section.bodyKey)}</p>
                <Link to={section.to} className={styles.sectionLink}>
                  {t(section.linkKey)}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}

      <Link to="/app" className={styles.back}>
        {t('guide.back')}
      </Link>
    </div>
  )
}
