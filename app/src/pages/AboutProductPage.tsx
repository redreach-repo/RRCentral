import { Link } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import { useTenant } from '../contexts/TenantContext'
import { useSettings } from '../contexts/SettingsContext'
import { useTheme } from '../contexts/ThemeContext'
import { PRODUCT, productAssetUrls } from '../lib/product'
import { cardStyle, colors, pageStyle } from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

const assets = productAssetUrls(import.meta.env.BASE_URL)

/**
 * In-app About: HighMast product identity only.
 * Tenant brand kits own the rest of the shell after sign-in.
 */
export default function AboutProductPage() {
  const { t } = useI18n()
  const { settings } = useSettings()
  const { activeCompany } = useTenant()
  const { resolved } = useTheme()
  const company =
    activeCompany?.name || settings.companyName || settings.brand || t('page.about.yourCompany')
  const mark = resolved === 'dark' ? assets.stackedReverse : assets.stackedBlack

  return (
    <div className={docsStyles.page} style={pageStyle}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>{t('page.about.kicker')}</p>
          <h1 className={docsStyles.title}>{t('page.about.title')}</h1>
          <p className={docsStyles.subtitle}>{t('page.about.subtitle')}</p>
        </div>
      </header>

      <section style={{ ...cardStyle, maxWidth: 520, textAlign: 'center' }} aria-label={PRODUCT.name}>
        <img
          src={mark}
          alt={PRODUCT.name}
          height={96}
          style={{ margin: '0 auto 12px', display: 'block', maxWidth: '100%' }}
        />
        <p style={{ margin: '0 0 8px', color: colors.muted, fontSize: 14 }}>{PRODUCT.endorsement}</p>
        <p style={{ margin: '0 0 16px', color: colors.text, fontSize: 15, lineHeight: 1.5 }}>
          {PRODUCT.tagline}
        </p>
        <p style={{ margin: 0, color: colors.muted, fontSize: 13, lineHeight: 1.5 }}>
          {t('page.about.tenantLine').replace('{company}', company)}
        </p>
        <p style={{ margin: '16px 0 0', fontSize: 13 }}>
          <Link to="/guide" style={{ color: 'var(--primary-text)' }}>
            {t('page.about.openGuide')}
          </Link>
        </p>
      </section>
    </div>
  )
}
