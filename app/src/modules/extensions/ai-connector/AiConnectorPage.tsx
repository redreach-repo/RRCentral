import { useCallback, useEffect, useState } from 'react'
import { Bot, Copy, KeyRound } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import EmptyState from '../../../components/EmptyState'
import { errorMessage } from '../../../lib/errors'
import {
  assistantLabel,
  departmentsLabel,
  MCP_ASSISTANTS,
  MCP_DEFAULT_ROLE,
  MCP_DEPARTMENTS,
  MCP_RATE_LIMIT_PER_MINUTE,
  toolsForDepartments,
  type McpAssistant,
  type McpDepartment,
  type McpKeyScope,
} from '../../../lib/highmastMcp'
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
  const [assistant, setAssistant] = useState<McpAssistant>('grok')
  const [departments, setDepartments] = useState<McpDepartment[]>([])
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
      if (scope === 'admin' && departments.length === 0) {
        showToast('Tick at least one department for this key.', 'error')
        return
      }
      const created = await createMcpKey(name, member, user?.email || '', scope, { assistant, departments })
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
        Keys for AI assistants such as Grok Bot, Claude or ChatGPT to use HighMast as a connector (MCP). Give each assistant its own
        key and pick the departments it works for: a key only sees the tools and records of its departments (Sales, Finance, HR,
        Payroll, Operations, Support, Marketing, Documents, or Admin for everything), and the database checks every table. A
        standard key instead acts as one sales, staff or viewer member with the 14 basic tools. No key can hard delete, change sent
        invoices or recorded payments, approve leave, or approve or pay payroll. {MCP_RATE_LIMIT_PER_MINUTE} calls a minute per key;
        every call and change is in the Audit log.
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
              Assistant
              <select style={inputStyle} value={assistant} onChange={(e) => setAssistant(e.target.value as McpAssistant)}>
                {MCP_ASSISTANTS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
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
                  {adminReady ? 'Departments: pick the departments this key works for' : 'Departments (run the AI connector departments SQL first)'}
                </option>
              </select>
            </label>
            {scope === 'admin' && (
              <fieldset style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 12, margin: 0 }}>
                <legend style={labelStyle}>Departments</legend>
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                  {MCP_DEPARTMENTS.map((d) => (
                    <label key={d.value} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14 }}>
                      <input
                        type="checkbox"
                        checked={departments.includes(d.value)}
                        onChange={(e) =>
                          setDepartments((cur) => (e.target.checked ? [...cur, d.value] : cur.filter((x) => x !== d.value)))
                        }
                      />
                      <span>
                        <strong>{d.label}</strong>
                        <br />
                        <span style={{ color: colors.muted, fontSize: 12 }}>{d.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <p style={{ color: colors.muted, fontSize: 13, marginBottom: 0 }}>
                  {departments.length
                    ? `${assistantLabel(assistant)} will get ${toolsForDepartments(departments).length} tools for ${departmentsLabel(departments)}.`
                    : 'Tick one or more departments.'}
                </p>
              </fieldset>
            )}
            {scope === 'admin' && departments.some((d) => d === 'hr' || d === 'payroll' || d === 'admin') && (
              <p style={{ color: colors.warn, fontSize: 13, margin: 0 }}>
                This key can read salaries, IBANs and ID numbers. Whatever the AI reads is sent to that AI's company. It still cannot
                approve leave or approve and pay payroll, and every change is in the Audit log with before and after.
              </p>
            )}
            <label style={labelStyle}>
              Acts as
              <select style={inputStyle} value={memberId} onChange={(e) => setMemberId(e.target.value)} required>
                {members.length === 0 && (
                  <option value="">
                    {scope === 'admin' ? 'No other active admin member: add an AI member such as "AI Assistant" first' : 'No active sales, staff or viewer members'}
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
                ? "A key with departments acts as an AI admin member, but only reaches the departments ticked above. Add one under Settings, Users (e.g. AI Assistant, ai-assistant@redreach.ae, role admin); several keys can share it, and the Audit log shows each key and assistant. Never pick yourself."
                : "Tip: add a team member such as grokbot@redreach.ae with the role sales under Settings, Users, and pick it here, so the AI's changes show under its own name. Admin and manager members cannot be picked."}
            </p>
            <div>
              <button
                type="submit"
                style={buttonPrimaryStyle}
                disabled={busy || loading || !memberId || (scope === 'admin' && departments.length === 0)}
              >
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
                      <th>Assistant</th>
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
                        <td>{assistantLabel(k.assistant) || '—'}</td>
                        <td>
                          {k.scope === 'admin'
                            ? departmentsLabel(k.departments?.length ? k.departments : ['admin'])
                            : `Standard (${k.role})`}
                        </td>
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
