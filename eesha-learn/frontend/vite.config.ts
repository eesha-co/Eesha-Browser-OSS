import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
// avr8js / rp2040js / @wokwi/elements are resolved from npm via package.json.
// (The third-party/ clones are reference-only — keep them updated for credits.)
//
// The `@pro` alias resolves to a no-op stub by default. Private overlays
// (e.g. velxio-prod) set VITE_PRO_BUILD=true and PRO_OVERLAY_PATH at build
// time to point at their actual pro source tree. See README's "Pro overlay"
// section.
const proOverlayPath =
  process.env.VITE_PRO_BUILD && process.env.PRO_OVERLAY_PATH
    ? path.resolve(process.env.PRO_OVERLAY_PATH)
    : path.resolve(__dirname, 'src/__pro_stub__')

export default defineConfig(({ command }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@pro': proOverlayPath,
    },
    // Local dev only: when the pro overlay is wired in via a junction
    // (Windows pattern: `frontend/src/pro` → `velxio-prod/pro/frontend/src/pro`),
    // Vite's default resolver walks symlinks to the real path, which breaks
    // relative imports like `../../store/...` from inside the overlay back
    // into the OSS sibling dirs. Keeping the symlink-as-path fixes that.
    //
    // We do NOT enable this during `vite build` (Docker / CI): production
    // builds COPY the overlay tree into the OSS frontend so there are no
    // symlinks involved, and turning preserveSymlinks on there breaks
    // Rollup's resolution of relative imports across the overlay/upstream
    // boundary (real bug observed in Dockerfile.prod stage 1).
    preserveSymlinks: command === 'serve' && !!process.env.VITE_PRO_BUILD,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
      },
    },
  },
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    include: ['avr8js', 'rp2040js', '@wokwi/elements', 'littlefs'],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/simulation/**/*.ts'],
      reporter: ['text', 'html'],
    },
  },
}))
