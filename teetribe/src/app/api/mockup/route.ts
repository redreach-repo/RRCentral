import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const color = searchParams.get('color') || 'FAF7F0'
  const view = searchParams.get('view') || 'front'
  const label = searchParams.get('label') || 'Tee Tribe'

  const hex = color.startsWith('#') ? color : `#${color}`
  const isBack = view === 'back'

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="720" viewBox="0 0 600 720">
  <rect width="600" height="720" fill="#FAF7F0"/>
  <path d="M120 180 Q300 80 480 180 L520 680 Q300 640 80 680 Z" fill="${hex}" stroke="#0D0D0D" stroke-width="3"/>
  <path d="M200 180 Q300 220 400 180" fill="none" stroke="#0D0D0D" stroke-width="2"/>
  ${isBack ? `<text x="300" y="420" text-anchor="middle" font-family="system-ui,sans-serif" font-size="28" font-weight="700" fill="#0D0D0D">${escapeXml(label)}</text>` : `<text x="300" y="380" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" font-weight="600" fill="#0D0D0D" opacity="0.7">${escapeXml(label)}</text>`}
  <text x="300" y="690" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" fill="#0A8A7A">${view.toUpperCase()}</text>
</svg>`

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
