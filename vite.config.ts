import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  plugins: [react()],
  // 相对路径：产物既能被 Vite dev server 提供，也能被 Electron 的 app:// 自定义协议加载
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // strictPort：端口被占用时直接失败，避免 Vite 静默换端口导致 Electron 加载空白页
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
