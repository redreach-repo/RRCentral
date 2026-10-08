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
 */
function spaFallback404(): Plugin {
  return {
    name: 'spa-fallback-404',
    closeBundle() {
      const outDir = join(process.cwd(), 'dist')
      const index = join(outDir, 'index.html')
      if (!existsSync(index)) return
      copyFileSync(index, join(outDir, '404.html'))
      for (const dir of ['app', 'login', 'crm', 'follow-ups', 'quotations', 'invoices']) {
        const destDir = join(outDir, dir)
        mkdirSync(destDir, { recursive: true })
        copyFileSync(index, join(destDir, 'index.html'))
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
