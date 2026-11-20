import { useCallback, useEffect, useState } from 'react'
import { Bot, Copy, KeyRound } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import EmptyState from '../../../components/EmptyState'
import { errorMessage } from '../../../lib/errors'
import { MCP_DEFAULT_ROLE, MCP_RATE_LIMIT_PER_MINUTE, type McpKeyScope } from '../../../lib/highmastMcp'
import {
  createMcpKey,
  listMcpKeys,
  listMcpMembers,
  mcpAdminKeysReady,
  mcpServerUrl,
  revokeMcpKey,
  type McpKeyRow,
  type McpMember,
} from '../../../lib/mcpKeys'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  labelStyle,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
} from '../../../lib/uiStyles'

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—')

/**
 * Admin > AI connector: keys for the HighMast MCP server (Grok Bot and other
 * AI assistants). A key is shown once; only its hash is kept.
 */
export default function AiConnectorPage() {
  const { userRole, user } = useAuth()
  const { showToast } = useToast()
  const [keys, setKeys] = useState<McpKeyRow[] | null>([])
  const [members, setMembers] = useState<McpMember[]>([])
  const [name, setName] = useState('Grok Bot')
  const [memberId, setMemberId] = useState('')
  const [scope, setScope] = useState<McpKeyScope>('standard')
  const [adminReady, setAdminReady] = useState(false)
  const [allMembers, setAllMembers] = useState<McpMember[]>([])
  const [shownKey, setShownKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const serverUrl = mcpServerUrl()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [k, m, admins, ready] = await Promise.all([
        listMcpKeys(),
        listMcpMembers(scope, user?.email || ''),
        listMcpMembers('admin', ''),
        mcpAdminKeysReady(),
      ])
      setKeys(k)
      setMembers(m)
      setAdminReady(ready)
      // Names for the key list: every member a key may act as.
      setAllMembers([...(await listMcpMembers('standard')), ...admins])
      setMemberId((cur) =>
        m.some((x) => x.id === cur) ? cur : m.find((x) => x.role === MCP_DEFAULT_ROLE)?.id || m[0]?.id || '',
      )
    } catch (e) {
      showToast(errorMessage(e, 'Could not load AI connector keys'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, scope, user?.email])

  useEffect(() => {
    if (userRole === 'admin') void load()
  }, [load, userRole])

  if (userRole !== 'admin') {
    return (
      <div style={pageStyle}>
        <EmptyState icon={<KeyRound size={22} />} title="Admins only" subtitle="Only admins can manage AI connector keys." />
      </div>
    )
  }

  const nameOf = (id: string) => {
    const m = allMembers.find((x) => x.id === id)
    return m ? `${m.name || m.email}` : 'a member whose role or status changed'
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      showToast(`${what} copied`, 'success')
    } catch {
      showToast('Copy did not work. Select the text and copy it by hand.', 'error')
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    const member = members.find((m) => m.id === memberId)
    if (!member) {
      showToast('Pick the team member the key acts as.', 'error')
      return
    }
    setBusy(true)
    try {
      const created = await createMcpKey(name, member, user?.email || '', scope)
      setShownKey(created.key)
      showToast('Key created. Copy it now: it is shown only once.', 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not create the key'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function onRevoke(row: McpKeyRow) {
    setBusy(true)
    try {
      await revokeMcpKey(row.id)
      showToast(`"${row.name}" revoked. It stops working at once.`, 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not revoke the key'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={pageStyle}>
      <h1 style={pageTitleStyle}>AI connector</h1>
      <p style={pageSubtitleStyle}>
        Keys for AI assistants such as Grok Bot to use HighMast as a connector (MCP). A standard key acts as one team member with the
        role sales, staff or viewer, so it sees only what that person sees: it cannot delete anything, cannot touch HR, payroll,
        settings or users, and quotes, invoices and payments stay read only. An admin key acts as a dedicated AI Assistant admin
        member and can work in every area (see the warning when you pick it). {MCP_RATE_LIMIT_PER_MINUTE} calls a minute per key;
        every call is in the Audit log.
      </p>

      <section style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={labelStyle}>Server URL</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <code style={{ wordBreak: 'break-all' }}>{serverUrl}</code>
          <button type="button" style={buttonSecondaryStyle} onClick={() => void copy(serverUrl, 'Server URL')}>
            <Copy size={14} /> Copy
          </button>
        </div>
        <p style={{ color: colors.muted, fontSize: 13, marginBottom: 0 }}>
          In the AI assistant, add a remote MCP server with this URL and the header <code>Authorization: Bearer &lt;key&gt;</code>.
        </p>
      </section>

      {keys === null ? (
        <EmptyState
          icon={<Bot size={22} />}
          title="Not set up yet"
          subtitle="Run the HighMast MCP SQL (supabase-sql/highmast-mcp.sql) in Supabase, then reload this page."
        />
      ) : (
        <>
          {shownKey && (
            <section style={{ ...cardStyle, marginBottom: 16, borderColor: colors.warn }}>
              <strong>Copy this key now. It will not be shown again.</strong>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                <code style={{ wordBreak: 'break-all' }}>{shownKey}</code>
                <button type="button" style={buttonSecondaryStyle} onClick={() => void copy(shownKey, 'Key')}>
                  <Copy size={14} /> Copy
                </button>
                <button type="button" style={buttonSecondaryStyle} onClick={() => setShownKey('')}>
                  I have copied it
                </button>
              </div>
            </section>
          )}

          <form onSubmit={onCreate} style={{ ...cardStyle, marginBottom: 16, display: 'grid', gap: 12 }}>
            <strong>New key</strong>
            <label style={labelStyle}>
              Name (shown in the Audit log)
              <input style={inputStyle} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label style={labelStyle}>
              Access
              <select
                style={inputStyle}
                value={scope}
                onChange={(e) => {
                  setScope(e.target.value as McpKeyScope)
                  setMemberId('')
                }}
              >
                <option value="standard">Standard: sales, staff or viewer tools (no deletes, no HR, money read only)</option>
                <option value="admin" disabled={!adminReady}>
                  {adminReady ? 'Admin: every area, HR and payroll included' : 'Admin (run the HighMast MCP admin SQL first)'}
                </option>
              </select>
            </label>
            {scope === 'admin' && (
              <p style={{ color: colors.warn, fontSize: 13, margin: 0 }}>
                An admin key can read and change every area, including salaries, IBANs and payroll drafts. Whatever the AI reads is
                sent to that AI's company. It cannot hard delete, change sent invoices or recorded payments, approve leave or approve
                and pay payroll, and every change is in the Audit log with before and after. Pick a dedicated admin member such as
                "AI Assistant" (ai-assistant@redreach.ae), never yourself.
              </p>
            )}
            <label style={labelStyle}>
              Acts as
              <select style={inputStyle} value={memberId} onChange={(e) => setMemberId(e.target.value)} required>
                {members.length === 0 && (
                  <option value="">
                    {scope === 'admin' ? 'No other active admin member: add "AI Assistant" first' : 'No active sales, staff or viewer members'}
                  </option>
                )}
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {(m.name || m.email) + ` (${m.role}, ${m.email})`}
                  </option>
                ))}
              </select>
            </label>
            <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>
              {scope === 'admin'
                ? "Tip: add a team member named AI Assistant (e.g. ai-assistant@redreach.ae) with the role admin under Settings, Users, and pick it here, so every change shows under that name."
                : "Tip: add a team member such as grokbot@redreach.ae with the role sales under Settings, Users, and pick it here, so the AI's changes show under its own name. Admin and manager members cannot be picked."}
            </p>
            <div>
              <button type="submit" style={buttonPrimaryStyle} disabled={busy || loading || !memberId}>
                Create key
              </button>
            </div>
          </form>

          <section style={cardStyle}>
            <strong>Keys</strong>
            {loading ? (
              <p style={{ color: colors.muted }}>Loading…</p>
            ) : keys.length === 0 ? (
              <p style={{ color: colors.muted }}>No keys yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: colors.muted }}>
                      <th>Name</th>
                      <th>Key starts</th>
                      <th>Acts as</th>
                      <th>Role</th>
                      <th>Access</th>
                      <th>Created</th>
                      <th>Last used</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((k) => (
                      <tr key={k.id} style={{ borderTop: `1px solid ${colors.border}` }}>
                        <td>{k.name}</td>
                        <td>
                          <code>{k.key_prefix}…</code>
                        </td>
                        <td>{nameOf(k.acts_as_user_id)}</td>
                        <td>{k.role}</td>
                        <td>{k.scope === 'admin' ? 'Admin' : 'Standard'}</td>
                        <td>{when(k.created_at)}</td>
                        <td>{when(k.last_used_at)}</td>
                        <td style={{ color: k.revoked_at ? colors.danger : colors.success }}>
                          {k.revoked_at ? `Revoked ${when(k.revoked_at)}` : 'Active'}
                        </td>
                        <td>
                          {!k.revoked_at && (
                            <button type="button" style={buttonSecondaryStyle} disabled={busy} onClick={() => void onRevoke(k)}>
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
