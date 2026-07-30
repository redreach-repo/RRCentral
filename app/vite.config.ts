import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), spaFallback404()],
  base: '/RRCentral/',
})
