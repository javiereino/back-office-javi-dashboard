import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const nm = (p: string) => path.join(root, 'node_modules', p)

// OCR engine + language data are served from our own origin (never from a CDN).
// They are copied at build time instead of living in public/ so they are not duplicated in git.
const OCR_FILES: Record<string, string> = {
  'worker.min.js': nm('tesseract.js/dist/worker.min.js'),
  'core/tesseract-core-lstm.wasm.js': nm('tesseract.js-core/tesseract-core-lstm.wasm.js'),
  'core/tesseract-core-simd-lstm.wasm.js': nm('tesseract.js-core/tesseract-core-simd-lstm.wasm.js'),
  'lang/eng.traineddata.gz': nm('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'),
  'lang/spa.traineddata.gz': nm('@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz'),
  'lang/fra.traineddata.gz': nm('@tesseract.js-data/fra/4.0.0_best_int/fra.traineddata.gz'),
}

// pdf.js image decoders (WebAssembly, needed for many scanned PDFs) and standard fonts (also used by the PDF export).
for (const dir of ['wasm', 'standard_fonts']) {
  const abs = nm(`pdfjs-dist/${dir}`)
  if (!fs.existsSync(abs)) continue
  for (const f of fs.readdirSync(abs)) if (!f.startsWith('quickjs')) OCR_FILES[`../pdfjs/${dir}/${f}`] = path.join(abs, f)
}

function localOcrAssets(): Plugin {
  return {
    name: 'local-ocr-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/\/(ocr|pdfjs)\/(.+?)(\?|$)/)
        const src = m && OCR_FILES[m[1] === 'ocr' ? m[2] : `../pdfjs/${m[2]}`]
        if (!src || !fs.existsSync(src)) return next()
        res.setHeader('Content-Type', src.endsWith('.js') ? 'text/javascript' : 'application/octet-stream')
        fs.createReadStream(src).pipe(res)
      })
    },
    generateBundle() {
      for (const [name, src] of Object.entries(OCR_FILES)) {
        if (!fs.existsSync(src)) continue
        this.emitFile({ type: 'asset', fileName: path.posix.normalize(`ocr/${name}`), source: fs.readFileSync(src) })
      }
    },
  }
}

// Strict Content-Security-Policy for the production build: the app may only talk to its own origin.
// This is what technically guarantees that participant data never leaves the browser.
function contentSecurityPolicy(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "worker-src 'self' blob:",
    "connect-src 'self' blob: data:",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-src 'none'",
  ].join('; ')
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`)
    },
  }
}

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version) },
  resolve: { alias: { '@': path.join(root, 'src') } },
  plugins: [
    react(),
    tailwindcss(),
    localOcrAssets(),
    contentSecurityPolicy(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Participant Manager AI',
        short_name: 'Participants',
        description: 'Local-first participant directory for international meetings.',
        theme_color: '#081426',
        background_color: '#081426',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2,ttf}'],
        globIgnores: ['ocr/**', 'pdfjs/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // OCR files are large; cache them the first time the user runs OCR.
            urlPattern: ({ url }) => url.pathname.includes('/ocr/') || url.pathname.includes('/pdfjs/'),
            handler: 'CacheFirst',
            options: { cacheName: 'ocr-assets', expiration: { maxEntries: 60 } },
          },
        ],
      },
    }),
  ],
  build: {
    // Built app is committed and served by GitHub Pages at …/participant-manager/app/
    outDir: 'app',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      // GitHub Pages (Jekyll) ignores files starting with "_"
      output: { chunkFileNames: (c) => `assets/${c.name.replace(/^_+/, '') || 'chunk'}-[hash].js` },
    },
  },
  test: { environment: 'node' },
} as any)
