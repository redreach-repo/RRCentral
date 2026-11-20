/**
 * Mail page (company Zoho mailbox, read only). Shapes the mail-inbox Edge
 * Function returns, plus the pure helpers the page uses.
 */
import type { CrmEntry } from '../types'
import { buildCrmEmailIndex, extractEmails, type CrmEmailMatch } from '../zohoInboxMatch'

export type MailFolderKind = 'inbox' | 'sent' | 'drafts' | 'spam' | 'trash' | 'other'

export type MailFolder = {
  folderId: string
  name: string
  kind: MailFolderKind
  unread: number
}

export type MailListItem = {
  messageId: string
  folderId: string
  threadId: string
  subject: string
  fromAddress: string
  sender: string
  toAddress: string
  summary: string
  receivedTime: number
  unread: boolean
  hasAttachment: boolean
}

export type MailMessageFull = MailListItem & {
  ccAddress: string
  html: string
}

export type MailRow = MailListItem & { crm: CrmEmailMatch | null }

/** Roles that may open the company mailbox (same as the function's rr_is_staff check). */
export const MAIL_ROLES = ['admin', 'manager', 'sales'] as const

/**
 * Who the other side is: for Sent mail the first recipient, otherwise the sender.
 * Shows the display name when there is one, else the address.
 */
export function counterpart(m: Pick<MailListItem, 'sender' | 'fromAddress' | 'toAddress'>, sent: boolean): string {
  const raw = sent ? m.toAddress : m.sender || m.fromAddress
  const first = raw.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)[0]?.trim() || ''
  const named = first.match(/^"?([^"<]+?)"?\s*<[^>]+>$/)
  if (named) return named[1].trim()
  return extractEmails(first)[0] || first || (sent ? '(no recipient)' : '(unknown sender)')
}

/** Match each email to a CRM company by any address on it (sender first, then recipients). */
export function matchMailToCrm(messages: MailListItem[], entries: CrmEntry[]): MailRow[] {
  const index = buildCrmEmailIndex(entries)
  return messages.map((m) => {
    const addresses = [...extractEmails(m.fromAddress), ...extractEmails(m.sender), ...extractEmails(m.toAddress)]
    let crm: CrmEmailMatch | null = null
    for (const a of addresses) {
      const hit = index.get(a)
      if (hit) {
        crm = hit
        break
      }
    }
    return { ...m, crm }
  })
}

/** "14:05" today, "Mon 14:05" this week, "12 Nov" this year, else "12 Nov 2025". */
export function mailWhen(ms: number, now = new Date()): string {
  if (!ms) return ''
  const d = new Date(ms)
  const sameDay = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return time
  const days = (now.getTime() - d.getTime()) / 86_400_000
  if (days >= 0 && days < 6) return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${time}`
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** True when the email loads pictures from the internet (often tracking pixels). */
export function hasRemoteImages(html: string): boolean {
  return /<img\b[^>]*\bsrc\s*=\s*["']?\s*(https?:)?\/\//i.test(html) || /url\(\s*["']?\s*(https?:)?\/\//i.test(html)
}

/**
 * The document shown in the sandboxed frame. The policy blocks scripts,
 * forms and frames outright; remote pictures load only after "Show images",
 * so senders cannot see when an email was opened. Links open in a new tab.
 * Always a white page with dark text, as most emails are designed for that.
 */
export function emailFrameDoc(html: string, opts: { showImages: boolean }): string {
  const img = opts.showImages ? "img-src data: cid: https: http:" : 'img-src data: cid:'
  const csp = `default-src 'none'; style-src 'unsafe-inline'; ${img}; font-src data:; form-action 'none'; frame-src 'none'`
  const body = html.trim() || '<p style="color:#888"><em>(no text)</em></p>'
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    '<base target="_blank">' +
    `<style>html,body{margin:0;padding:12px;font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#1b1b1f;` +
    `background:#fff;word-wrap:break-word}img{max-width:100%;height:auto}table{max-width:100%}` +
    `a{color:#1a56db}blockquote{margin:0 0 0 8px;padding-left:8px;border-left:2px solid #999}</style>` +
    `</head><body>${body}</body></html>`
  )
}
