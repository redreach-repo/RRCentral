import { useCallback, useEffect, useRef, useState } from 'react'
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
  publicApiConfigured,
  revokeApiKey,
  setWebhookActive,
  testWebhookDelivery,
  type ApiKeyRow,
  type WebhookEndpoint,
} from '../lib/featureSliceStores'
import { DEFAULT_API_KEY_SCOPES } from '../lib/publicApi'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../lib/listIo'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, inputStyle, labelStyle } from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

const PUBLIC_API_CSV_HEADERS = [
  'kind',
  'name',
  'key_prefix',
  'scopes',
  'url',
  'active',
  'revoked_at',
  'last_used_at',
  'last_delivery_status',
  'last_delivery_at',
  'created_at',
] as const

function parseYesNo(raw: string): boolean | null {
  const v = raw.trim().toLowerCase()
  if (!v) return null
  if (v === 'yes' || v === 'true' || v === '1' || v === 'y' || v === 'active' || v === 'on') return true
  if (v === 'no' || v === 'false' || v === '0' || v === 'n' || v === 'off' || v === 'inactive') return false
  return null
}

function parseScopes(raw: string): string[] {
  return String(raw || '')
    .split(/[|;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** M11: API keys + webhook endpoints with revoke / test delivery. */
export default function PublicApiPage() {
  const { appUserId } = useAuth()
  const { showToast } = useToast()
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [hooks, setHooks] = useState<WebhookEndpoint[]>([])
  const [keyName, setKeyName] = useState('Partner read')
  const [allowWriteAccounts, setAllowWriteAccounts] = useState(false)
  const [allowWriteInvoices, setAllowWriteInvoices] = useState(false)
  const [allowWriteQuotations, setAllowWriteQuotations] = useState(false)
  const [hookUrl, setHookUrl] = useState('')
  const [plaintext, setPlaintext] = useState('')
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

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
      const scopes = [
        ...DEFAULT_API_KEY_SCOPES,
        ...(allowWriteAccounts ? ['write:accounts'] : []),
        ...(allowWriteInvoices ? ['write:invoices'] : []),
        ...(allowWriteQuotations ? ['write:quotations'] : []),
      ]
      const created = await createApiKey(keyName, appUserId, scopes)
      setPlaintext(created.plaintext)
      showToast('API key created — copy it now', 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not create key'), 'error')
    }
  }

  async function onRevoke(id: string) {
    try {
      await revokeApiKey(id)
      showToast('Key revoked', 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not revoke'), 'error')
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

  async function onToggleHook(id: string, active: boolean) {
    try {
      await setWebhookActive(id, active)
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not update webhook'), 'error')
    }
  }

  async function onTestHook(id: string) {
    try {
      const result = await testWebhookDelivery(id)
      showToast(
        result.ok
          ? `Delivery OK (${result.status}, ${result.attempts} attempt${result.attempts === 1 ? '' : 's'})`
          : `Delivery failed (${result.status}, ${result.attempts} attempt${result.attempts === 1 ? '' : 's'})`,
        result.ok ? 'success' : 'error',
      )
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not test webhook'), 'error')
    }
  }

  async function importPublicApiCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const hooksByUrl = new Map(hooks.map((h) => [h.url.trim().toLowerCase(), h] as const))
      const keysByName = new Map(keys.map((k) => [k.name.trim().toLowerCase(), k] as const))
      let createdHooks = 0
      let updatedHooks = 0
      let createdKeys = 0
      let skipped = 0
      let lastPlaintext = ''

      for (const row of objects) {
        const kind = String(row.kind || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
        if (kind === 'webhook' || (!kind && String(row.url || '').trim())) {
          const url = String(row.url || '').trim()
          if (!url) {
            skipped += 1
            continue
          }
          const eventTypes = parseScopes(String(row.scopes || ''))
          const active = parseYesNo(String(row.active ?? ''))
          const existing = hooksByUrl.get(url.toLowerCase())
          try {
            if (!existing) {
              await createWebhookEndpoint(url, eventTypes.length ? eventTypes : ['*'])
              createdHooks += 1
              if (active === false) {
                const refreshed = await listWebhookEndpoints()
                const created = refreshed.find((h) => h.url.trim().toLowerCase() === url.toLowerCase())
                if (created) {
                  await setWebhookActive(created.id, false)
                  hooksByUrl.set(url.toLowerCase(), { ...created, active: false })
                }
              } else {
                hooksByUrl.set(url.toLowerCase(), {
                  id: `pending-${url}`,
                  url,
                  active: true,
                  event_types: eventTypes.length ? eventTypes : ['*'],
                  last_delivery_at: null,
                  last_delivery_status: '',
                  delivery_failures: 0,
                  next_retry_at: null,
                })
              }
            } else if (active !== null && active !== existing.active) {
              await setWebhookActive(existing.id, active)
              hooksByUrl.set(url.toLowerCase(), { ...existing, active })
              updatedHooks += 1
            } else {
              skipped += 1
            }
          } catch {
            skipped += 1
          }
          continue
        }

        if (kind === 'api_key' || kind === 'key') {
          const name = String(row.name || '').trim()
          if (!name) {
            skipped += 1
            continue
          }
          if (keysByName.has(name.toLowerCase())) {
            skipped += 1
            continue
          }
          const scopes = parseScopes(String(row.scopes || ''))
          const active = parseYesNo(String(row.active ?? 'yes'))
          if (active === false) {
            skipped += 1
            continue
          }
          try {
            const created = await createApiKey(name, appUserId, scopes.length ? scopes : DEFAULT_API_KEY_SCOPES)
            lastPlaintext = created.plaintext
            keysByName.set(name.toLowerCase(), {
              id: `pending-${name}`,
              name,
              key_prefix: created.prefix,
              scopes: scopes.length ? scopes : DEFAULT_API_KEY_SCOPES,
              revoked_at: null,
              last_used_at: null,
              created_at: new Date().toISOString(),
            } as ApiKeyRow)
            createdKeys += 1
          } catch {
            skipped += 1
          }
          continue
        }

        skipped += 1
      }

      const applied = createdHooks + updatedHooks + createdKeys
      if (!applied) {
        showToast(skipped ? 'No public API rows to import' : 'CSV has no data rows', 'error')
        return
      }
      if (lastPlaintext) setPlaintext(lastPlaintext)
      const parts = [
        createdHooks ? `${createdHooks} webhook(s) added` : '',
        updatedHooks ? `${updatedHooks} webhook(s) updated` : '',
        createdKeys ? `${createdKeys} API key(s) created` : '',
      ].filter(Boolean)
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`${parts.join(' · ')}${skipNote}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Public API CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Public API</p>
          <h1 className={docsStyles.title}>API and webhooks</h1>
          <p className={docsStyles.subtitle}>
            Hashed API keys (`x-api-key`) and partner webhooks. Reads:
            `/v1/accounts|contacts|invoices|quotations|tickets`. Writes (opt-in scopes): accounts, invoices,
            quotations. Failed deliveries are retried by Edge `webhook-retry`.
            {publicApiConfigured() ? '' : ' Supabase is not configured in this environment.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importPublicApiCsv(file)
            }}
          />
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={importing || loading}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={loading || (keys.length === 0 && hooks.length === 0)}
            onClick={() => {
              const keyRows = keys.map((k) => ({
                kind: 'api_key',
                name: k.name,
                key_prefix: k.key_prefix,
                scopes: Array.isArray(k.scopes) ? (k.scopes as string[]).join('|') : String(k.scopes ?? ''),
                url: '',
                active: k.revoked_at ? 'no' : 'yes',
                revoked_at: k.revoked_at || '',
                last_used_at: k.last_used_at || '',
                last_delivery_status: '',
                last_delivery_at: '',
                created_at: k.created_at,
              }))
              const hookRows = hooks.map((h) => ({
                kind: 'webhook',
                name: '',
                key_prefix: '',
                scopes: Array.isArray(h.event_types) ? (h.event_types as string[]).join('|') : String(h.event_types ?? ''),
                url: h.url,
                active: h.active ? 'yes' : 'no',
                revoked_at: '',
                last_used_at: '',
                last_delivery_status: h.last_delivery_status || '',
                last_delivery_at: h.last_delivery_at || '',
                created_at: '',
              }))
              exportListCsv('public-api.csv', [...PUBLIC_API_CSV_HEADERS], [...keyRows, ...hookRows])
              showToast('Public API CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
        </div>
      </header>

      <form onSubmit={(e) => void onCreateKey(e)} style={{ ...cardStyle, marginBottom: 16, display: 'grid', gap: 10, maxWidth: 520 }}>
        <label style={labelStyle}>
          Key name
          <input style={inputStyle} value={keyName} onChange={(e) => setKeyName(e.target.value)} required />
        </label>
        <label style={{ ...labelStyle, display: 'flex', gap: 8, alignItems: 'center', flexDirection: 'row' }}>
          <input
            type="checkbox"
            checked={allowWriteAccounts}
            onChange={(e) => setAllowWriteAccounts(e.target.checked)}
          />
          Allow account writes (`write:accounts`)
        </label>
        <label style={{ ...labelStyle, display: 'flex', gap: 8, alignItems: 'center', flexDirection: 'row' }}>
          <input
            type="checkbox"
            checked={allowWriteInvoices}
            onChange={(e) => setAllowWriteInvoices(e.target.checked)}
          />
          Allow invoice writes (`write:invoices`)
        </label>
        <label style={{ ...labelStyle, display: 'flex', gap: 8, alignItems: 'center', flexDirection: 'row' }}>
          <input
            type="checkbox"
            checked={allowWriteQuotations}
            onChange={(e) => setAllowWriteQuotations(e.target.checked)}
          />
          Allow quotation writes (`write:quotations`)
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
          <input
            style={inputStyle}
            type="url"
            value={hookUrl}
            onChange={(e) => setHookUrl(e.target.value)}
            required
            placeholder="https://partner.example/hooks"
          />
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
            <article key={k.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <strong>{k.name}</strong>
                <div style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
                  {k.key_prefix}… {k.revoked_at ? '· revoked' : '· active'}
                  {Array.isArray(k.scopes) ? ` · ${(k.scopes as string[]).join(', ')}` : ''}
                  {k.last_used_at ? ` · last used ${new Date(k.last_used_at).toLocaleString()}` : ''}
                </div>
              </div>
              {!k.revoked_at ? (
                <button type="button" style={buttonSecondaryStyle} onClick={() => void onRevoke(k.id)}>
                  Revoke
                </button>
              ) : null}
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
            <article key={h.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <code style={{ overflowWrap: 'anywhere' }}>{h.url}</code>
                <div style={{ color: colors.muted, fontSize: 13 }}>
                  {h.active ? 'active' : 'off'}
                  {h.last_delivery_status
                    ? ` · last ${h.last_delivery_status}${h.last_delivery_at ? ` @ ${new Date(h.last_delivery_at).toLocaleString()}` : ''}`
                    : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" style={buttonSecondaryStyle} onClick={() => void onTestHook(h.id)}>
                  Send test
                </button>
                <button type="button" style={buttonSecondaryStyle} onClick={() => void onToggleHook(h.id, !h.active)}>
                  {h.active ? 'Disable' : 'Enable'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
