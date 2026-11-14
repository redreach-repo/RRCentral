import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO, subDays } from 'date-fns'
import { Bug } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { can } from '../lib/permissions'
import { errorMessage, isMissingRelationError } from '../lib/errors'
import { clearAppErrors, errorKey, groupErrors, listAppErrors, type AppError } from '../lib/errorReporting'
import { isAuditAvailable } from '../lib/auditLog'
import {
  buttonSecondaryStyle,
  cardStyle,
  colors,
  selectStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

export default function AppErrorsPage() {
  const { t } = useI18n()
  const { userRole } = useAuth()
  const { showToast } = useToast()
  const [days, setDays] = useState(7)
  const [errors, setErrors] = useState<AppError[]>([])
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState('')
  const [open, setOpen] = useState('')

  const kindLabel = (kind: AppError['kind']) => {
    if (kind === 'browser') return t('page.appErrors.kindBrowser')
    if (kind === 'crash') return t('page.appErrors.kindCrash')
    return t('page.appErrors.kindFunction')
  }

  const load = useCallback(async () => {
    setLoading(true)
    setProblem('')
    try {
      setErrors(await listAppErrors(subDays(new Date(), days).toISOString()))
    } catch (e) {
      setProblem(
        isMissingRelationError(e)
          ? t('page.appErrors.missingTable')
          : errorMessage(e, 'Could not load errors'),
      )
    } finally {
      setLoading(false)
    }
  }, [days, t])

  useEffect(() => {
    if (isAuditAvailable()) void load()
  }, [load])

  const groups = useMemo(() => groupErrors(errors), [errors])

  async function clearGroup(key: string) {
    const ids = errors.filter((e) => errorKey(e.message) === key).map((e) => e.id)
    try {
      await clearAppErrors(ids)
      showToast('Marked as fixed', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not clear'), 'error')
    }
  }

  if (!can(userRole, 'audit.read')) {
    return (
      <div className={docsStyles.page}>
        <EmptyState title={t('page.appErrors.adminsOnly')} subtitle={t('page.appErrors.adminsOnlySub')} />
      </div>
    )
  }
  if (!isAuditAvailable()) {
    return (
      <div className={docsStyles.page}>
        <EmptyState
          icon={<Bug size={28} />}
          title={t('page.appErrors.cloudOnly')}
          subtitle={t('page.appErrors.cloudOnlySub')}
        />
      </div>
    )
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>{t('page.admin.kicker')}</p>
          <h1 className={docsStyles.title}>{t('page.appErrors.title')}</h1>
          <p className={docsStyles.subtitle}>{t('page.appErrors.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            style={selectStyle}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label={t('page.appErrors.period')}
          >
            <option value={1}>{t('page.appErrors.last24h')}</option>
            <option value={7}>{t('page.appErrors.last7d')}</option>
            <option value={30}>{t('page.appErrors.last30d')}</option>
            <option value={90}>{t('page.appErrors.last90d')}</option>
          </select>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'rgba(255,255,255,0.08)' }}
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? t('page.appErrors.loading') : t('page.appErrors.refresh')}
          </button>
        </div>
      </header>
      {problem ? (
        <div style={{ ...cardStyle, color: colors.danger }}>{problem}</div>
      ) : !loading && groups.length === 0 ? (
        <EmptyState icon={<Bug size={28} />} title={t('page.appErrors.empty')} />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {groups.map((g) => (
            <div key={g.key} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setOpen(open === g.key ? '' : g.key)}
                  style={{ background: 'none', border: 0, color: colors.text, textAlign: 'left', cursor: 'pointer', padding: 0, flex: '1 1 260px', minWidth: 0 }}
                >
                  <div style={{ fontWeight: 600, wordBreak: 'break-word' }}>{g.latest.message}</div>
                  <div style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
                    {t('page.appErrors.meta')
                      .replace('{kind}', kindLabel(g.latest.kind))
                      .replace('{count}', String(g.count))
                      .replace(
                        '{times}',
                        g.count === 1 ? t('page.appErrors.timeOne') : t('page.appErrors.timeMany'),
                      )
                      .replace('{when}', format(parseISO(g.latest.created_at), 'd MMM, HH:mm'))
                      .replace('{page}', g.latest.page || t('page.appErrors.unknownPage'))
                      .replace(
                        '{people}',
                        g.people.length
                          ? t('page.appErrors.peopleSuffix').replace('{list}', g.people.join(', '))
                          : '',
                      )}
                  </div>
                </button>
                <button type="button" style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }} onClick={() => void clearGroup(g.key)}>
                  {t('page.appErrors.markFixed')}
                </button>
              </div>
              {open === g.key && g.latest.detail ? (
                <pre style={{ fontSize: 11, color: colors.muted, whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 10, maxHeight: 300, overflow: 'auto' }}>
                  {g.latest.detail}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
