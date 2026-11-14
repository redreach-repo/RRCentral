import { useCallback, useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import {
  createApiKey,
  createWebhookEndpoint,
  listApiKeys,
  listWebhookEndpoints,
  type ApiKeyRow,
  type WebhookEndpoint,
} from '../lib/featureSliceStores'
import { buttonPrimaryStyle, cardStyle, colors, inputStyle, labelStyle } from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M11 first slice: API keys + webhook endpoints. */
export default function PublicApiPage() {
  const { appUserId } = useAuth()
  const { showToast } = useToast()
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [hooks, setHooks] = useState<WebhookEndpoint[]>([])
  const [keyName, setKeyName] = useState('Partner read')
  const [hookUrl, setHookUrl] = useState('')
  const [plaintext, setPlaintext] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [k, h] = await Promise.all([listApiKeys(), listWebhookEndpoints()])
      setKeys(k)
      setHooks(h)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load API settings'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function onCreateKey(e: React.FormEvent) {
    e.preventDefault()
    try {
      const created = await createApiKey(keyName, appUserId)
      setPlaintext(created.plaintext)
      showToast('API key created — copy it now', 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not create key'), 'error')
    }
  }

  async function onCreateHook(e: React.FormEvent) {
    e.preventDefault()
    try {
      await createWebhookEndpoint(hookUrl)
      setHookUrl('')
      showToast('Webhook saved', 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not save webhook'), 'error')
    }
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Public API · first slice</p>
          <h1 className={docsStyles.title}>API and webhooks</h1>
          <p className={docsStyles.subtitle}>
            Issue hashed API keys and register partner webhook URLs. Edge health: <code>public-api</code>.
          </p>
        </div>
      </header>

      <form onSubmit={(e) => void onCreateKey(e)} style={{ ...cardStyle, marginBottom: 16, display: 'grid', gap: 10, maxWidth: 520 }}>
        <label style={labelStyle}>
          Key name
          <input style={inputStyle} value={keyName} onChange={(e) => setKeyName(e.target.value)} required />
        </label>
        <button type="submit" style={buttonPrimaryStyle}>
          Create API key
        </button>
        {plaintext ? (
          <p style={{ margin: 0, fontSize: 13, color: colors.warn }}>
            Copy now (shown once): <code style={{ overflowWrap: 'anywhere' }}>{plaintext}</code>
          </p>
        ) : null}
      </form>

      <form onSubmit={(e) => void onCreateHook(e)} style={{ ...cardStyle, marginBottom: 16, display: 'grid', gap: 10, maxWidth: 520 }}>
        <label style={labelStyle}>
          Webhook URL
          <input style={inputStyle} type="url" value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} required placeholder="https://partner.example/hooks" />
        </label>
        <button type="submit" style={buttonPrimaryStyle}>
          Add webhook
        </button>
      </form>

      {loading ? <p style={{ color: colors.muted }}>Loading…</p> : null}

      <h2 style={{ fontSize: 16 }}>Keys</h2>
      {!loading && keys.length === 0 ? (
        <EmptyState icon={<KeyRound size={22} />} title="No API keys" subtitle="Create a key for partner read access." />
      ) : (
        <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
          {keys.map((k) => (
            <article key={k.id} style={cardStyle}>
              <strong>{k.name}</strong>
              <div style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
                {k.key_prefix}… {k.revoked_at ? '· revoked' : '· active'}
              </div>
            </article>
          ))}
        </div>
      )}

      <h2 style={{ fontSize: 16 }}>Webhooks</h2>
      {hooks.length === 0 ? (
        <p style={{ color: colors.muted }}>None yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {hooks.map((h) => (
            <article key={h.id} style={cardStyle}>
              <code style={{ overflowWrap: 'anywhere' }}>{h.url}</code>
              <div style={{ color: colors.muted, fontSize: 13 }}>{h.active ? 'active' : 'off'}</div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
