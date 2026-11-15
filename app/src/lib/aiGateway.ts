/**
 * M10 light AI gateway client: retrieve tenant knowledge docs via Edge,
 * then (optionally) ask for a stub answer. No tools-as-user yet.
 */
import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import { PRODUCT } from './product'

export type AiKnowledgeHit = {
  id: string
  title: string
  body: string
  source: string
  rank: number
}

export type AiGatewayRetrieveResult = {
  hits: AiKnowledgeHit[]
  answer?: string
  mode: 'retrieve' | 'retrieve_and_answer'
}

export function rankHits(hits: AiKnowledgeHit[]): AiKnowledgeHit[] {
  return [...hits].sort((a, b) => b.rank - a.rank)
}

export function stubAnswerFromHits(query: string, hits: AiKnowledgeHit[]): string {
  if (!hits.length) {
    return `No knowledge docs matched “${query.trim() || 'your query'}”. Add snippets under AI knowledge.`
  }
  const top = hits.slice(0, 3)
  const lines = top.map((h, i) => `${i + 1}. ${h.title || 'Untitled'}: ${h.body.slice(0, 160)}`)
  return `Retrieved ${hits.length} snippet(s) for “${query.trim()}” (draft — not model output):\n${lines.join('\n')}`
}

export async function invokeAiGateway(input: {
  query: string
  limit?: number
  answer?: boolean
}): Promise<AiGatewayRetrieveResult> {
  if (!isSupabaseConfigured()) {
    throw new Error(`${PRODUCT.name} AI gateway needs a cloud connection.`)
  }
  const { data, error } = await getSupabaseClient().functions.invoke('hm-ai-gateway', {
    body: {
      query: input.query,
      limit: input.limit ?? 5,
      answer: Boolean(input.answer),
    },
  })
  if (error) {
    let message = 'AI gateway could not be reached.'
    try {
      const b = await (error as { context?: Response }).context?.json()
      if (b?.error) message = String(b.error)
    } catch {
      // keep plain message
    }
    throw new Error(message)
  }
  const hits = rankHits(((data as { hits?: AiKnowledgeHit[] })?.hits || []) as AiKnowledgeHit[])
  const mode = input.answer ? 'retrieve_and_answer' : 'retrieve'
  return {
    hits,
    mode,
    answer: input.answer
      ? String((data as { answer?: string })?.answer || stubAnswerFromHits(input.query, hits))
      : undefined,
  }
}
