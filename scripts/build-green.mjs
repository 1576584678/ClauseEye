/**
 * 构建「绿色版」目录（免安装、免管理员、双击即可运行）
 *
 * 与 electron-builder 的便携版 exe 的区别：
 *   便携版 = 单文件自解压 exe，外壳由 electron-builder 重新改名 + 改图标生成。
 *   绿色版 = 直接以官方 Electron 二进制为外壳，只替换 resources/app.asar。
 *
 * 为什么需要两条路：Windows 11 的「智能应用控制（Smart App Control）」会拦截
 * 由 ISG 判定为“无信誉”的可执行文件。electron-builder 生成的外壳（改名 + rcedit
 * 改资源）是新二进制且未签名，会被拦；而官方 electron.exe 已被大量分发、
 * 有信誉记录，即使重命名也不会改变文件哈希，因此可以正常启动。
 *
 * 用法：
 *   node scripts/build-green.mjs [--out <目录>]
 * 需先执行 npm run build 生成 dist/。
 */
import { createRequire } from 'node:module'
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar')

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const outFlagIndex = process.argv.indexOf('--out')
const OUT_DIR = resolve(
  outFlagIndex !== -1 && process.argv[outFlagIndex + 1]
    ? process.argv[outFlagIndex + 1]
    : process.env.CLAUSEEYE_OUT_DIR || join(ROOT, 'release'),
)
const APP_DIR = join(OUT_DIR, 'ClauseEye-green')

const ELECTRON_DIST = join(ROOT, 'node_modules', 'electron', 'dist')
const DIST_DIR = join(ROOT, 'dist')
const STAGE_DIR = join(OUT_DIR, '.app-src')

/** 重命名；被杀软/索引器短暂占用时退化为"复制 + 删除"，最多重试 5 次 */
function renameWithFallback(from, to) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      renameSync(from, to)
      return
    } catch (error) {
      if (!existsSync(from)) return
      try {
        cpSync(from, to)
        rmSync(from, { force: true })
        return
      } catch {
        if (attempt === 4) throw error
        sleepSync(400)
      }
    }
  }
}

function sleepSync(ms) {
  const shared = new SharedArrayBuffer(4)
  Atomics.wait(new Int32Array(shared), 0, 0, ms)
}

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

if (!existsSync(join(DIST_DIR, 'index.html'))) fail('缺少 dist/，请先执行 npm run build')
if (!existsSync(join(ELECTRON_DIST, 'electron.exe'))) fail('缺少 node_modules/electron/dist，请先执行 npm install')

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

console.log(`→ 准备绿色版目录：${APP_DIR}`)
mkdirSync(OUT_DIR, { recursive: true })
if (existsSync(APP_DIR)) rmSync(APP_DIR, { recursive: true, force: true })
if (existsSync(STAGE_DIR)) rmSync(STAGE_DIR, { recursive: true, force: true })

// 1) 拷贝官方 Electron 运行时（含 electron.exe 及其依赖的 dll / pak / locales）
cpSync(ELECTRON_DIST, APP_DIR, { recursive: true })
renameWithFallback(join(APP_DIR, 'electron.exe'), join(APP_DIR, 'ClauseEye.exe'))

// 2) 组装 app.asar：只需要主进程 + 前端产物 + 图标，前端依赖已被 Vite 打进 dist
mkdirSync(join(STAGE_DIR, 'electron'), { recursive: true })
mkdirSync(join(STAGE_DIR, 'build'), { recursive: true })
cpSync(join(ROOT, 'electron'), join(STAGE_DIR, 'electron'), { recursive: true })
cpSync(DIST_DIR, join(STAGE_DIR, 'dist'), { recursive: true })
cpSync(join(ROOT, 'build', 'icon.png'), join(STAGE_DIR, 'build', 'icon.png'))

writeFileSync(
  join(STAGE_DIR, 'package.json'),
  JSON.stringify(
    {
      name: 'clauseeye',
      productName: 'ClauseEye',
      version: pkg.version,
      description: pkg.description,
      main: 'electron/main.cjs',
    },
    null,
    2,
  ) + '\n',
  'utf8',
)

mkdirSync(join(APP_DIR, 'resources'), { recursive: true })
await asar.createPackage(STAGE_DIR, join(APP_DIR, 'resources', 'app.asar'))
rmSync(STAGE_DIR, { recursive: true, force: true })

writeFileSync(
  join(APP_DIR, '使用说明.txt'),
  [
    'ClauseEye · 契眼（绿色版）',
    '',
    '双击 ClauseEye.exe 即可运行，无需安装 Node.js、无需安装任何依赖、无需管理员权限。',
    '',
    '· 数据存放位置：%APPDATA%\\ClauseEye\\（可在应用内「帮助 → 数据存放位置」打开）',
    '· 应用不连接任何自建服务；深度分析需要你自己在「设置」里填模型接口（BYOK）',
    '· 卸载：直接删除整个文件夹即可，用户数据需在「设置 → 清空数据」中清理',
    '',
    `版本 ${pkg.version}`,
  ].join('\r\n'),
  'utf8',
)

const sizeMb = (target) => {
  let total = 0
  const walk = (dir) => {
    for (const entry of require('node:fs').readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else total += statSync(full).size
    }
  }
  walk(target)
  return (total / 1024 / 1024).toFixed(1)
}

console.log('✓ 绿色版构建完成')
console.log(`  目录：${APP_DIR}`)
console.log(`  大小：${sizeMb(APP_DIR)} MB（未压缩）`)
console.log('  双击 ClauseEye.exe 运行')
