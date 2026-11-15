/** Pure helpers for Fireflies webhook ingest (M10). */

export type FirefliesWebhookPayload = {
  meetingId?: string
  title?: string
  organizerEmail?: string
  summary?: string
  transcriptUrl?: string
  date?: string
}

export function normalizeFirefliesWebhook(raw: unknown): FirefliesWebhookPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const meetingId = String(o.meetingId || o.meeting_id || o.id || '').trim()
  if (!meetingId) return null
  return {
    meetingId,
    title: String(o.title || o.meeting_title || '').trim(),
    organizerEmail: String(o.organizerEmail || o.organizer_email || o.email || '')
      .trim()
      .toLowerCase(),
    summary: String(o.summary || o.overview || '').trim(),
    transcriptUrl: String(o.transcriptUrl || o.transcript_url || '').trim(),
    date: String(o.date || o.meeting_date || '').trim(),
  }
}

export function matchKeyCandidates(p: FirefliesWebhookPayload): string[] {
  const out: string[] = []
  if (p.organizerEmail) out.push(p.organizerEmail)
  if (p.title) out.push(p.title.toLowerCase())
  return out
}

export function mapMatchesKey(matchKey: string, candidates: string[]): boolean {
  const key = matchKey.trim().toLowerCase()
  if (!key) return false
  return candidates.some((c) => c.includes(key) || key.includes(c))
}

export function activityBodyFromWebhook(p: FirefliesWebhookPayload): string {
  const bits = [
    p.title ? `Fireflies: ${p.title}` : 'Fireflies meeting',
    p.date ? `When: ${p.date}` : '',
    p.summary ? `Summary: ${p.summary}` : '',
    p.transcriptUrl ? `Transcript: ${p.transcriptUrl}` : '',
  ].filter(Boolean)
  return bits.join('\n')
}
