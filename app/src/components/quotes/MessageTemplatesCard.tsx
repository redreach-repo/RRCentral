import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import {
  BUILT_IN_FOLLOWUP,
  canEditTemplates,
  DIVISION_OPTIONS,
  MERGE_FIELDS,
  renderTemplate,
  TEMPLATE_CHANNELS,
  TEMPLATE_PURPOSES,
  templateProblem,
  type MessageTemplate,
} from '../../lib/quoteNudges'
import { deleteTemplate, listTemplates, saveTemplate, type TemplateInput } from '../../lib/quoteNudgesStore'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  fieldStyle,
  formGridStyle,
  inputStyle,
  labelStyle,
  sectionTitleStyle,
} from '../../lib/uiStyles'

const EMPTY: TemplateInput = {
  name: '',
  division_code: '',
  channel: 'whatsapp',
  purpose: 'quote_followup',
  subject: '',
  body: BUILT_IN_FOLLOWUP.whatsapp.body,
  active: true,
}

const SAMPLE = {
  name: 'Sara',
  account: 'Clinic LLC',
  quote_number: 'RR-03-26014',
  amount: 'AED 4,500.00',
  link: 'https://…/accept#…',
  company: 'Red Reach',
}

/** WhatsApp and email follow up wording, per division, with merge fields. */
export default function MessageTemplatesCard() {
  const { user, userRole } = useAuth()
  const { settings } = useSettings()
  const { showToast } = useToast()
  const allowed = canEditTemplates(userRole)
  const [rows, setRows] = useState<MessageTemplate[]>([])
  const [missing, setMissing] = useState(false)
  const [form, setForm] = useState<TemplateInput>(EMPTY)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const r = await listTemplates()
    setRows(r.rows)
    setMissing(r.missingTable)
  }, [])

  useEffect(() => {
    if (allowed) void load().catch(() => setRows([]))
  }, [allowed, load])

  if (!allowed) return null

  async function save() {
    const problem = templateProblem(form)
    if (problem) {
      showToast(problem, 'error')
      return
    }
    setSaving(true)
    try {
      await saveTemplate(form, user?.email || '', editId ?? undefined)
      setForm(EMPTY)
      setEditId(null)
      await load()
      showToast('Template saved', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the template'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    try {
      await deleteTemplate(id)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not delete the template'), 'error')
    }
  }

  const preview = renderTemplate(form, { ...SAMPLE, company: settings.companyName || SAMPLE.company })

  return (
    <section style={{ ...cardStyle, marginBottom: 16 }}>
      <h2 style={sectionTitleStyle}>Follow up templates</h2>
      <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 12px' }}>
        Used by "Quotes waiting for a reply" in My Day. A division's own template wins, then one for every division,
        then the built in wording. Merge fields: {MERGE_FIELDS.map((f) => `{{${f.key}}}`).join(', ')}.
      </p>
      {missing ? (
        <p style={{ fontSize: 14 }}>Run the "Follow up templates" SQL first (SQL copy page).</p>
      ) : (
        <>
          {rows.length ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', display: 'grid', gap: 6 }}>
              {rows.map((t) => (
                <li key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, alignItems: 'center' }}>
                  <span>
                    <strong>{t.name}</strong>, {TEMPLATE_CHANNELS.find((c) => c.value === t.channel)?.label},{' '}
                    {DIVISION_OPTIONS.find((d) => d.value === t.division_code)?.label ?? t.division_code}
                    {t.active ? '' : ' (off)'}
                  </span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      style={buttonSecondaryStyle}
                      onClick={() => {
                        setEditId(t.id)
                        const { id: _id, ...rest } = t
                        setForm(rest)
                      }}
                    >
                      Edit
                    </button>
                    <button type="button" style={buttonSecondaryStyle} onClick={() => void remove(t.id)}>
                      Delete
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <div style={formGridStyle}>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="tpl-name">
                Name
              </label>
              <input id="tpl-name" style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="tpl-division">
                Division
              </label>
              <select
                id="tpl-division"
                style={inputStyle}
                value={form.division_code}
                onChange={(e) => setForm({ ...form, division_code: e.target.value })}
              >
                {DIVISION_OPTIONS.map((d) => (
                  <option key={d.value || 'all'} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="tpl-channel">
                Channel
              </label>
              <select
                id="tpl-channel"
                style={inputStyle}
                value={form.channel}
                onChange={(e) => {
                  const channel = e.target.value as TemplateInput['channel']
                  const untouched = form.body === BUILT_IN_FOLLOWUP[form.channel].body
                  setForm({
                    ...form,
                    channel,
                    body: untouched ? BUILT_IN_FOLLOWUP[channel].body : form.body,
                    subject: untouched ? BUILT_IN_FOLLOWUP[channel].subject : form.subject,
                  })
                }}
              >
                {TEMPLATE_CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="tpl-purpose">
                Used for
              </label>
              <select
                id="tpl-purpose"
                style={inputStyle}
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value as TemplateInput['purpose'] })}
              >
                {TEMPLATE_PURPOSES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {form.channel === 'email' ? (
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="tpl-subject">
                Subject
              </label>
              <input id="tpl-subject" style={inputStyle} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </div>
          ) : null}
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="tpl-body">
              Message
            </label>
            <textarea
              id="tpl-body"
              style={{ ...inputStyle, minHeight: 140, resize: 'vertical' }}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14, marginBottom: 10 }}>
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> In use
          </label>
          <div style={{ fontSize: 13, color: colors.muted, whiteSpace: 'pre-wrap', borderLeft: `3px solid ${colors.border}`, paddingLeft: 10, marginBottom: 10 }}>
            {preview.subject ? `Subject: ${preview.subject}\n\n` : ''}
            {preview.body}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void save()}>
              {editId ? 'Save changes' : 'Add template'}
            </button>
            {editId ? (
              <button
                type="button"
                style={buttonSecondaryStyle}
                onClick={() => {
                  setEditId(null)
                  setForm(EMPTY)
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  )
}
