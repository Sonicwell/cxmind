/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import { execSync } from 'child_process'

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'))
const gitCommit = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'unknown' } })()
const buildTime = new Date().toISOString()

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(gitCommit),
    __APP_BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [react()],
  resolve: {
    dedupe: ['d3-selection', 'd3-transition', 'd3-zoom', 'd3-drag'],
  },
  optimizeDeps: {
    include: ['d3-selection', 'd3-transition', 'd3-zoom', 'd3-drag'],
    exclude: ['@finos/perspective'],
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      // output: {
      //   manualChunks: { ... }
      // }
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'ws://127.0.0.1:3000',
        ws: true,
        changeOrigin: true,
      },
      '/demo/analyze/sip': {
        target: 'http://127.0.0.1:8000/api/v1/analyze/sip',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/demo\/analyze\/sip/, '')
      },
      '/demo/analyze/emotion/stream': {
        target: 'ws://127.0.0.1:8000/api/v1/analyze/emotion/stream',
        ws: true,
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/demo\/analyze\/emotion\/stream/, '')
      },
      '/demo/analyze/emotion/config': {
        target: 'http://127.0.0.1:8000/api/v1/analyze/emotion/config',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/demo\/analyze\/emotion\/config/, '')
      },
      '/demo/ser-health': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/demo\/ser-health/, '/health')
      }
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/setupTests.ts', 'dist/', 'e2e/']
    }
  },
} satisfies ReturnType<typeof defineConfig>)

