import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { stripeCheckoutPlugin } from './vite-plugin-stripe-checkout.ts'

/**
 * GitHub Pages SPA helpers:
 * - 404.html so deep links refresh into the app
 * - directory index.html copies so /app and /login return HTTP 200
 *   (required for reliable PWA install / start_url on Chrome)
 * - apple-touch / favicon copies under those dirs so iOS probes that resolve
 *   relative to /app/ or /login/ still get the R-mark (not a monogram fallback)
 */
function spaFallback404(): Plugin {
  const spaDirs = ['app', 'login', 'crm', 'follow-ups', 'quotations', 'invoices']
  const iosAssets = [
    'apple-touch-icon.png',
    'apple-touch-icon-precomposed.png',
    'apple-touch-icon-120x120.png',
    'apple-touch-icon-152x152.png',
    'apple-touch-icon-167x167.png',
    'apple-touch-icon-180x180.png',
    'favicon-32.png',
    'favicon-48.png',
  ]

  return {
    name: 'spa-fallback-404',
    closeBundle() {
      const outDir = join(process.cwd(), 'dist')
      const index = join(outDir, 'index.html')
      if (!existsSync(index)) return
      copyFileSync(index, join(outDir, '404.html'))
      for (const dir of spaDirs) {
        const destDir = join(outDir, dir)
        mkdirSync(destDir, { recursive: true })
        copyFileSync(index, join(destDir, 'index.html'))
        for (const asset of iosAssets) {
          const src = join(outDir, asset)
          if (existsSync(src)) copyFileSync(src, join(destDir, asset))
        }
      }
    },
  }
}

/**
 * Content Security Policy for the production build. GitHub Pages cannot send
 * HTTP headers, so it goes in a <meta> tag (frame-ancestors is not supported
 * there). Scripts may only come from our own origin — this blocks injected
 * <script> tags and inline event handlers. Dev mode is skipped because Vite's
 * HMR relies on inline scripts.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  // Supabase (REST + realtime), Zoho, Stripe — runtime-configurable hosts, so https/wss only.
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "frame-src 'self' blob: data: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ')

function securityMetaTags(): Plugin {
  return {
    name: 'security-meta-tags',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
          injectTo: 'head-prepend',
        },
        {
          tag: 'meta',
          attrs: { name: 'referrer', content: 'strict-origin-when-cross-origin' },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), securityMetaTags(), spaFallback404(), stripeCheckoutPlugin()],
  base: '/RRCentral/',
  // Broader phone/Chrome support than Vite's default (keeps modern syntax out of very old engines).
  // React 19 still needs a relatively recent browser; this is not IE / Chrome 60 support.
  build: {
    target: ['es2020', 'chrome87', 'safari14', 'firefox78', 'edge88'],
  },
})
