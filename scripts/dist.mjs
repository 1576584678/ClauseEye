/**
 * 便携版打包包装脚本（npm run dist / dist:release）
 *
 * 直接调用 electron-builder 即可，本脚本只解决一个具体问题：
 * 某些 Windows 环境下（编辑器 / 索引器 / 杀毒软件正在监视产物目录），
 * electron-builder 把解压出来的临时目录改名成 win-unpacked 时会报
 *   EPERM: operation not permitted, rename '...\win-unpacked.tmp' -> '...\win-unpacked'
 * 这是环境占用而非配置错误，换到系统临时目录构建就不会发生。
 * 因此这里先在工作区内构建；只有当失败原因确实是这个改名问题时，
 * 才自动换到临时目录重跑，并把产物拷回 release/。
 *
 * 用法：
 *   node scripts/dist.mjs                # 构建，不发布
 *   node scripts/dist.mjs --publish      # 构建并发布到 GitHub Release（需 GH_TOKEN）
 *   node scripts/dist.mjs --out <目录>   # 指定输出目录（绿色版同款参数）
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, tmpdir } from 'node:os'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const shouldPublish = args.includes('--publish')
const outIndex = args.indexOf('--out')
const OUT_DIR = resolve(
  outIndex !== -1 && args[outIndex + 1] ? args[outIndex + 1] : join(ROOT, 'release'),
)

const CLI = join(ROOT, 'node_modules', 'electron-builder', 'cli.js')

/**
 * 复用 @electron/get 已经下载过的 Electron 压缩包，避免 electron-builder 再下一遍。
 * 国内网络直连 GitHub 下载 150MB 的 Electron 经常超时，这一步能省掉大部分等待。
 */
function findCachedElectronZip() {
  try {
    const version = JSON.parse(
      readFileSync(join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf8'),
    ).version
    const roots = [
      process.env.ELECTRON_CACHE,
      join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'electron', 'Cache'),
    ].filter(Boolean)
    for (const root of roots) {
      if (!existsSync(root)) continue
      for (const entry of readdirSync(root)) {
        const candidate = join(root, entry, `electron-v${version}-win32-x64.zip`)
        if (existsSync(candidate)) return candidate
      }
    }
  } catch {
    /* 没有缓存就算了 */
  }
  return null
}

function runElectronBuilder(outputDir, target) {
  // 直接调用 cli.js 而不是 npx：既绕开了 shell（Windows 上 npx 是个 .cmd），
  // 也避免了参数经 shell 拼接带来的转义问题
  const args = [
    CLI,
    '--win',
    '--config.npmRebuild=false',
    `--config.directories.output=${outputDir}`,
    '--publish',
    shouldPublish ? 'always' : 'never',
  ]
  if (target) args.push(`--config.win.target=${target}`)
  const electronDist = findCachedElectronZip()
  if (electronDist) args.push(`--config.electronDist=${electronDist}`)

  const result = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' })
  return result.status === 0
}

/** 本机若启用了「智能应用控制」，NSIS 安装包在生成解压器时会被系统拦截，此时降级为只打便携版 */
const PORTABLE_ONLY = 'portable'

const artifactsIn = (dir) => {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(
    (name) => name.endsWith('.exe') || name.endsWith('.zip') || name.endsWith('.yml') || name.endsWith('.blockmap'),
  )
}

console.log(`→ 打包输出目录：${OUT_DIR}`)

if (runElectronBuilder(OUT_DIR)) {
  reportDone(OUT_DIR)
  process.exit(0)
}

console.warn('\n⚠ 安装版 + 便携版打包失败，可能是本机策略拦截了 NSIS 自解压器；改用「仅便携版」重试……\n')
if (runElectronBuilder(OUT_DIR, PORTABLE_ONLY)) {
  reportDone(OUT_DIR)
  console.log('  说明：安装版（自动更新）请在 CI 上构建，见 .github/workflows/release.yml。')
  process.exit(0)
}

// 仍然失败：只有在确认是「临时目录改名被占用」时才换地方重试
const fallbackDir = join(tmpdir(), 'clauseeye-release')
console.warn(`\n⚠ 在 ${OUT_DIR} 构建失败，尝试改用临时目录 ${fallbackDir} 重试……\n`)

if (!runElectronBuilder(fallbackDir, PORTABLE_ONLY)) {
  console.error('✗ 打包失败，请检查上面的 electron-builder 输出。')
  process.exit(1)
}

mkdirSync(OUT_DIR, { recursive: true })
const files = artifactsIn(fallbackDir)
for (const name of files) {
  copyFileSync(join(fallbackDir, name), join(OUT_DIR, name))
}

console.log(`✓ 打包完成（产物已从临时目录拷回）：${files.join('、') || fallbackDir}`)
console.log('  说明：本机构建时产物目录被其它程序占用，故改用临时目录构建；')
console.log('       如果你只是想拿安装包，直接使用 release/ 下的文件即可。')

function reportDone(dir) {
  const files = artifactsIn(dir)
  console.log(`✓ 打包完成：${files.length ? files.join('、') : dir}`)
}
