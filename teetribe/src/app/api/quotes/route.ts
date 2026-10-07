import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  if (!body.email || !body.name) {
    return NextResponse.json({ ok: false, error: 'Name and email required' }, { status: 400 })
  }
  return NextResponse.json({ ok: true, quoteId: `Q-${Date.now()}` })
}
