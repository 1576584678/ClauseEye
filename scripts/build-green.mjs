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
 *
 * app.asar 里除了主进程与前端产物，还要带上 OCR 运行时（tesseract.js / tesseract.js-core 及其依赖）。
 * 注意：tesseract.js 在 Node 下用 worker_threads 跑识别，worker 的脚本与它 require 的每个依赖
 * 都必须是 app.asar.unpacked 里的真实文件——worker 的模块解析不会走进 asar，
 * 少一个包就会卡在「创建 worker」这一步（既不报错也不返回）。
 */
import { createRequire } from 'node:module'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
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

// 下面会 rmSync 递归删除 OUT_DIR 下的子目录，先挡住明显误传的路径（仓库根/用户目录/文件系统根）
if (OUT_DIR === resolve(ROOT) || OUT_DIR === resolve(homedir()) || OUT_DIR === resolve(OUT_DIR, '..')) {
  fail(`--out / CLAUSEEYE_OUT_DIR 指向了不安全的位置：${OUT_DIR}，已中止（会被清空的子目录：ClauseEye-green、app-src-tmp）`)
}

const ELECTRON_DIST = join(ROOT, 'node_modules', 'electron', 'dist')
const DIST_DIR = join(ROOT, 'dist')
const STAGE_DIR = join(OUT_DIR, 'app-src-tmp')

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

/** 主进程 require 的裸模块名（跳过相对路径、node: 内置与 electron 本身） */
function entryModules() {
  const BUILTIN = new Set(['fs', 'path', 'os', 'url', 'crypto', 'util', 'events', 'stream', 'child_process', 'worker_threads', 'http', 'https', 'zlib', 'assert', 'tty', 'net', 'electron'])
  const names = new Set()
  for (const file of readdirSync(join(ROOT, 'electron'))) {
    if (!file.endsWith('.cjs')) continue
    const source = readFileSync(join(ROOT, 'electron', file), 'utf8')
    for (const match of source.matchAll(/require\((['"])([^'"]+)\1\)/g)) {
      const request = match[2]
      if (request.startsWith('.') || request.startsWith('node:') || BUILTIN.has(request)) continue
      names.add(request.startsWith('@') ? request.split('/').slice(0, 2).join('/') : request.split('/')[0])
    }
  }
  return names
}

function collectRuntimeDeps() {
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')).packages || {}
  const locate = (fromKey, name) => {
    let base = fromKey
    for (;;) {
      const candidate = (base ? base + '/' : '') + 'node_modules/' + name
      if (lock[candidate]) return candidate
      if (!base) return null
      const cut = base.lastIndexOf('/node_modules/')
      base = cut === -1 ? '' : base.slice(0, cut)
    }
  }
  const seen = new Set()
  const queue = [...entryModules()].map((name) => locate('', name)).filter(Boolean)
  while (queue.length) {
    const key = queue.pop()
    if (seen.has(key)) continue
    seen.add(key)
    for (const dep of Object.keys(lock[key].dependencies || {})) {
      const depKey = locate(key, dep)
      if (depKey) queue.push(depKey)
    }
  }
  return [...seen].sort()
}

/** 目录累计字节数，用于打印裁剪收益 */
function dirBytes(dir) {
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) total += dirBytes(full)
    else total += statSync(full).size
  }
  return total
}

/**
 * 裁剪 OCR 运行时里 Node worker 走不到的文件：
 *   - tesseract.js-core/*.wasm.js：浏览器 importScripts 用的单文件版（6 个，共约 25MB），
 *     Node 侧 getCore 直接 require 变体模块，只会用到 <variant>.js + 同目录 <variant>.wasm；
 *   - tesseract.js/dist、docs：浏览器 UMD/ESM 产物与文档，Node 走 src/。
 * 返回省下的字节数。
 */
function pruneOcrRuntime(stageDir) {
  const coreDir = join(stageDir, 'node_modules', 'tesseract.js-core')
  let saved = 0
  if (existsSync(coreDir)) {
    const before = dirBytes(coreDir)
    for (const name of readdirSync(coreDir)) {
      if (name.endsWith('.wasm.js')) rmSync(join(coreDir, name), { force: true })
    }
    saved += before - dirBytes(coreDir)
  }
  for (const rel of [join('node_modules', 'tesseract.js', 'dist'), join('node_modules', 'tesseract.js', 'docs')]) {
    const target = join(stageDir, rel)
    if (!existsSync(target)) continue
    saved += dirBytes(target)
    rmSync(target, { recursive: true, force: true })
  }
  return saved
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

// 1.1) 只保留中英文语言包（与 electron-builder 的 electronLanguages 对齐），省掉约 45MB
const KEEP_LOCALES = new Set(['zh-CN.pak', 'en-US.pak'])
try {
  for (const name of readdirSync(join(APP_DIR, 'locales'))) {
    if (!KEEP_LOCALES.has(name)) rmSync(join(APP_DIR, 'locales', name), { force: true })
  }
} catch {
  // 某些 Electron 版本没有 locales 目录，忽略
}

// 2) 组装 app.asar：只需要主进程 + 前端产物 + 图标，前端依赖已被 Vite 打进 dist
mkdirSync(join(STAGE_DIR, 'electron'), { recursive: true })
mkdirSync(join(STAGE_DIR, 'build'), { recursive: true })
cpSync(join(ROOT, 'electron'), join(STAGE_DIR, 'electron'), { recursive: true })
cpSync(DIST_DIR, join(STAGE_DIR, 'dist'), { recursive: true })
cpSync(join(ROOT, 'build', 'icon.png'), join(STAGE_DIR, 'build', 'icon.png'))

// 2.1) 主进程运行时依赖：绿色版没有 electron-builder 的依赖裁剪，这里按 electron/*.cjs 的
//      require 反推闭包（tesseract.js → OCR；electron-updater → 更新检查），
//      不把 pdfjs-dist / react 这些已被 Vite 打进 dist 的大包塞进来
const runtimeDeps = collectRuntimeDeps()
for (const key of runtimeDeps) {
  const from = join(ROOT, key)
  if (!existsSync(from)) fail(`缺少 ${key}，请先执行 npm install`)
  cpSync(from, join(STAGE_DIR, key), { recursive: true })
}

// 2.2) 裁剪 OCR 运行时里 Node worker 根本走不到的文件（浏览器专用的 *.wasm.js 与文档）
const prunedBytes = pruneOcrRuntime(STAGE_DIR)

// 解包范围：worker 脚本所在的目录树整体落到 app.asar.unpacked（真实文件）。
// worker 里 require 的每个依赖（is-url / regenerator-runtime / wasm-feature-detect …）
// 都只能从真实目录解析，所以这里连同 node_modules 一起解包；绿色版只带主进程用得到的
// 29 个包，整体解包体积代价很小。dist/tessdata 是离线语言包，同样必须是真实文件。
const RUNTIME_UNPACK = '**/{node_modules,tessdata}/**'

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
await asar.createPackageWithOptions(STAGE_DIR, join(APP_DIR, 'resources', 'app.asar'), { unpack: RUNTIME_UNPACK })
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
console.log(`  运行时依赖：${runtimeDeps.length} 个`)
console.log(`  OCR 运行时裁剪：省下 ${(prunedBytes / 1024 / 1024).toFixed(1)} MB（浏览器专用 *.wasm.js 与文档）`)
console.log(`  目录：${APP_DIR}`)
console.log(`  大小：${sizeMb(APP_DIR)} MB（未压缩）`)
console.log('  双击 ClauseEye.exe 运行')
