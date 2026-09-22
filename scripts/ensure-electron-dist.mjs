/**
 * 确保 node_modules/electron/dist 存在（绿色版外壳需要）。
 *
 * 背景：CI 上 `npm ci` 之后 node_modules/electron/dist 有时并不存在
 * （Electron 的 postinstall 下载会被跳过/失败，而 electron-builder 自己
 * 下载运行时构建产物，不依赖这个目录），导致绿色版构建失败。
 *
 * 用法：node scripts/ensure-electron-dist.mjs
 */
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ELECTRON_DIR = join(ROOT, 'node_modules', 'electron')
const DIST_DIR = join(ELECTRON_DIR, 'dist')
/** Electron 各平台真实可执行文件路径（macOS 在 .app 包内） */
const electronBinary =
  process.platform === 'win32'
    ? join(DIST_DIR, 'electron.exe')
    : process.platform === 'darwin'
      ? join(DIST_DIR, 'Electron.app', 'Contents', 'MacOS', 'Electron')
      : join(DIST_DIR, 'electron')

if (existsSync(electronBinary)) {
  console.log('✓ Electron 运行时已就绪')
  process.exit(0)
}

const installer = join(ELECTRON_DIR, 'install.js')
if (!existsSync(installer)) {
  console.error('✗ 找不到 node_modules/electron/install.js，请先执行 npm ci')
  process.exit(1)
}

console.log('→ node_modules/electron/dist 缺失，重新执行 Electron 安装脚本')
try {
  execFileSync(process.execPath, [installer], { cwd: ELECTRON_DIR, stdio: 'inherit' })
} catch (error) {
  console.error(`✗ 执行 Electron 安装脚本失败：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

if (!existsSync(electronBinary)) {
  console.error(`✗ 仍然缺少 ${electronBinary}`)
  process.exit(1)
}
console.log('✓ Electron 运行时已补齐')
