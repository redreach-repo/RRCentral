import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { stripeCheckoutPlugin } from './vite-plugin-stripe-checkout.ts'

/** GitHub Pages serves 404.html for missing paths — copy SPA shell so /login, /reports, etc. work on refresh. */
function spaFallback404(): Plugin {
  return {
    name: 'spa-fallback-404',
    closeBundle() {
      const outDir = join(process.cwd(), 'dist')
      const index = join(outDir, 'index.html')
      const fallback = join(outDir, '404.html')
      if (existsSync(index)) {
        copyFileSync(index, fallback)
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
})
