import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useAuth } from '../../../contexts/AuthContext'
import { useI18n } from '../../../contexts/I18nContext'
import { useToast } from '../../../contexts/ToastContext'
import { currentAuthMode } from '../../../lib/db'
import { errorMessage } from '../../../lib/errors'
import { btn, btnGhost, btnPrimary, input } from '../../../lib/pageStyles'
import {
  API_SCOPES,
  keyState,
  parseEventList,
  publicApiBase,
  webhookUrlProblem,
} from '../../../lib/publicApi/publicApi'
import {
  createApiKey,
  createWebhook,
  loadDeveloperData,
  revokeApiKey,
  setWebhookActive,
  type DeveloperData,
} from '../../../lib/publicApi/store'
import { getSupabaseRuntimeConfig } from '../../../lib/supabaseConfig'
import { colors, pageStyle } from '../../../lib/uiStyles'
import SetupNotice from '../_shared/SetupNotice'

const card: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  padding: 14,
  background: colors.card,
  display: 'grid',
  gap: 10,
}
const row: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }
const small: CSSProperties = { color: colors.muted, fontSize: 13 }
const secretBox: CSSProperties = {
  ...card,
  borderColor: colors.warn,
  fontFamily: 'ui-monospace, monospace',
  wordBreak: 'break-all',
}

const EMPTY: DeveloperData = { keys: [], endpoints: [], deliveries: [], missingTable: false }

export default function DevelopersPage() {
  const { t } = useI18n()
  const { userRole } = useAuth()
  const { showToast } = useToast()
  const localMode = currentAuthMode() === 'local'
  const [data, setData] = useState<DeveloperData>(EMPTY)
  const [shown, setShown] = useState('')
  const [keyName, setKeyName] = useState('')
  const [scopes, setScopes] = useState<string[]>(['accounts:read'])
  const [expires, setExpires] = useState('')
  const [hookUrl, setHookUrl] = useState('')
  const [hookEvents, setHookEvents] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (localMode || userRole !== 'admin') return
    try {
      setData(await loadDeveloperData())
    } catch (err) {
      showToast(errorMessage(err), 'error')
    }
  }, [localMode, userRole, showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
      await load()
    } catch (err) {
      showToast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (userRole !== 'admin') {
    return (
      <div style={pageStyle}>
        <p>{t('page.developers.adminOnly')}</p>
      </div>
    )
  }

  const base = publicApiBase(getSupabaseRuntimeConfig().url || 'https://<project>.supabase.co')

  return (
    <div style={{ ...pageStyle, display: 'grid', gap: 16 }}>
      <header>
        <h1 style={{ margin: 0 }}>{t('page.developers.title')}</h1>
        <p style={{ ...small, margin: '4px 0 0' }}>{t('page.developers.subtitle')}</p>
        <p style={small}>
          {t('page.developers.base')}: <code>{base}</code>
        </p>
      </header>
      <SetupNotice localMode={localMode} missingTable={data.missingTable} doc="docs/modules/public-api.md" />
      {shown && (
        <div style={secretBox} role="alert">
          <strong style={{ fontFamily: 'inherit' }}>{t('page.developers.copyOnce')}</strong>
          <span>{shown}</span>
          <button type="button" style={btnGhost} onClick={() => setShown('')}>
            OK
          </button>
        </div>
      )}

      <section style={card} aria-label={t('page.developers.keys')}>
        <strong>{t('page.developers.keys')}</strong>
        <div style={row}>
          <input style={{ ...input, flex: '1 1 180px' }} placeholder={t('page.developers.keyName')} aria-label={t('page.developers.keyName')} value={keyName} onChange={(e) => setKeyName(e.target.value)} />
          {API_SCOPES.map((s) => (
            <label key={s.scope} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={scopes.includes(s.scope)}
                onChange={(e) => setScopes((cur) => (e.target.checked ? [...cur, s.scope] : cur.filter((x) => x !== s.scope)))}
              />
              {s.label}
            </label>
          ))}
          <input type="date" style={input} aria-label={t('page.developers.expires')} title={t('page.developers.expires')} value={expires} onChange={(e) => setExpires(e.target.value)} />
          <button
            type="button"
            style={btnPrimary}
            disabled={busy || !keyName.trim() || scopes.length === 0}
            onClick={() =>
              void run(async () => {
                setShown(await createApiKey(keyName.trim(), scopes, expires ? new Date(`${expires}T23:59:59Z`).toISOString() : null))
                setKeyName('')
              })
            }
          >
            {t('page.developers.create')}
          </button>
        </div>
        {data.keys.map((k) => {
          const state = keyState(k)
          return (
            <div key={k.id} style={{ ...row, justifyContent: 'space-between' }}>
              <span>
                <strong>{k.name}</strong> <code>{k.key_prefix}…</code> · {k.scopes.join(', ')} · {state}
                <span style={small}> · {k.last_used_at ? `used ${new Date(k.last_used_at).toLocaleString()}` : 'never used'}</span>
              </span>
              {state === 'active' && (
                <button type="button" style={btn} disabled={busy} onClick={() => void run(() => revokeApiKey(k.id))}>
                  {t('page.developers.revoke')}
                </button>
              )}
            </div>
          )
        })}
      </section>

      <section style={card} aria-label={t('page.developers.webhooks')}>
        <strong>{t('page.developers.webhooks')}</strong>
        <div style={row}>
          <input style={{ ...input, flex: '2 1 240px' }} placeholder="https://…" aria-label="Webhook URL" value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} />
          <input style={{ ...input, flex: '2 1 240px' }} placeholder={t('page.developers.events')} aria-label={t('page.developers.events')} value={hookEvents} onChange={(e) => setHookEvents(e.target.value)} />
          <button
            type="button"
            style={btnPrimary}
            disabled={busy || !hookUrl.trim()}
            onClick={() => {
              const problem = webhookUrlProblem(hookUrl)
              if (problem) return showToast(problem, 'error')
              void run(async () => {
                setShown(await createWebhook(hookUrl.trim(), parseEventList(hookEvents), ''))
                setHookUrl('')
                setHookEvents('')
              })
            }}
          >
            {t('page.developers.newWebhook')}
          </button>
        </div>
        {data.endpoints.map((e) => (
          <div key={e.id} style={{ ...row, justifyContent: 'space-between', opacity: e.active ? 1 : 0.6 }}>
            <span>
              <code>{e.url}</code> · {e.events.join(', ')}
            </span>
            <button type="button" style={btnGhost} disabled={busy} onClick={() => void run(() => setWebhookActive(e.id, !e.active))}>
              {e.active ? t('page.developers.pause') : t('page.developers.resume')}
            </button>
          </div>
        ))}
        {data.deliveries.length > 0 && (
          <>
            <strong>{t('page.developers.deliveries')}</strong>
            {data.deliveries.map((d) => (
              <div key={d.id} style={small}>
                {new Date(d.created_at).toLocaleString()} · {d.event_type} · {d.status} · tries {d.attempts}
                {d.last_status_code ? ` · HTTP ${d.last_status_code}` : ''}
                {d.last_error ? ` · ${d.last_error}` : ''}
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  )
}
