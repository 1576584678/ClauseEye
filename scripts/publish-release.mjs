/**
 * 把 release/ 下的产物发布到 GitHub Release（REST API 实现，不依赖 gh CLI）
 *
 * 为什么不用 gh：
 *  - CI 上 gh 是否在 bash/pwsh 里可用、版本是否支持 --latest 都不可控，
 *    失败时只能看到「exit code 1」，排查成本很高；
 *  - 大文件上传需要自己控制重试与覆盖（--clobber 语义）；
 *  - 这里用 fetch 直接调 API，失败信息可以原样打印出来。
 *
 * 用法：
 *   node scripts/publish-release.mjs --tag v0.5.0 [--dir release] [--dry-run]
 * 环境变量：GITHUB_TOKEN（或 GH_TOKEN）、GITHUB_REPOSITORY（owner/repo）、GITHUB_REF_NAME
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const API = 'https://api.github.com'
const UPLOAD_API = 'https://uploads.github.com'
const ASSET_EXTENSIONS = ['.exe', '.zip', '.dmg', '.AppImage', '.deb', '.yml', '.blockmap']

export const RELEASE_NOTES = [
  '## ClauseEye · 契眼（Windows / macOS / Linux）',
  '',
  '下载后**双击即可运行**，不需要安装 Node.js 或任何其它依赖。',
  '',
  '| 文件 | 平台 | 说明 |',
  '|---|---|---|',
  '| `ClauseEye-*-win-x64-setup.exe` | Windows | 安装版（**推荐**）。安装后可在应用内一键自动更新，后续版本无需手动下载 |',
  '| `ClauseEye-*-win-x64-portable.exe` | Windows | 单文件便携版，双击直接运行；免安装版无法自我更新，新版本会提示你到本页面下载 |',
  '| `ClauseEye-green-win-x64.zip` | Windows | 绿色版目录，解压后双击 `ClauseEye.exe`。如果单文件版提示「应用程序控制策略已阻止此文件」（Windows 11 智能应用控制），请改用这个 |',
  '| `ClauseEye-*-mac-arm64.dmg` | macOS | Apple 芯片（M 系列）安装包 |',
  '| `ClauseEye-*-mac-x64.dmg` | macOS | Intel 芯片安装包 |',
  '| `ClauseEye-*-linux-x86_64.AppImage` | Linux | 免安装单文件：`chmod +x` 后双击运行；支持应用内自动更新 |',
  '| `ClauseEye-*-linux-amd64.deb` | Linux | Debian / Ubuntu 安装包（`sudo dpkg -i` 或双击安装） |',
  '| `latest.yml` / `latest-mac.yml` / `latest-linux.yml` / `*.blockmap` | | 自动更新所需的元数据，**不要删除**（应用靠它判断是否有新版本） |',
  '',
  '**macOS 首次打开**：当前构建未做 Apple 开发者签名与公证，macOS 会提示「无法验证开发者」。',
  '请在「访达」里**右键点图标 → 打开**，或执行 `xattr -dr com.apple.quarantine /Applications/ClauseEye.app` 后即可运行。',
  '',
  '**更新机制**：Windows 安装版与 Linux AppImage 启动 20 秒后（或打开设置页点「检查更新」）会读取本页的更新元数据判断版本，',
  '发现新版本会弹系统通知并在应用顶部提示，可一键下载并重启安装；便携版 / 绿色版 / macOS 版只做提示，不自动替换文件。',
  '',
  '**下载慢？** 资源托管在 GitHub，国内直连可能较慢。应用内已内置**加速下载**：打开「设置 → 软件更新 → 国内下载加速」，点一下就会挑出当前平台的文件，并给出 GitHub 直连与三个公共加速渠道（第三方服务，可用性会变动）：`ghproxy.net`、`gh-proxy.com`、`ghfast.top`。',
  '也可以手动在下载链接前拼接前缀，例如 `https://ghproxy.net/https://github.com/1576584678/ClauseEye/releases/download/v{版号}/ClauseEye-{版号}-win-x64-setup.exe`。',
  '',
  '**V1 内容**：186 条中国法规则库（劳动 / 租房 / 二手房买卖 / 装修 / 驾培 / Offer / 离职 / 工伤 / NDA / 服务协议）、系统级到期提醒、系统钥匙串保护主密钥、单文件加密库（`vault.sqlite`）、离线 OCR（扫描件与图片识别，语言包随包分发）、应用内下载加速（一键选平台文件 + 国内镜像渠道）、OCR 运行时按需裁剪（省约 26MB 体积）。',
  '',
  '数据默认存放在本机用户目录（Windows 为 `%APPDATA%\\ClauseEye\\`），全部本地加密，应用不连接任何自建服务。',
].join('\n')

const MIN_INSTALLER_BYTES = 30 * 1024 * 1024

/**
 * 挑出要发布的产物：
 *  - 只认各平台产物（exe / zip / dmg / AppImage / deb / yml / blockmap），
 *    忽略 builder-debug.yml 之类的中间文件
 *  - 安装版小于 30MB 一律视为「NSIS 中途失败留下的半成品」并剔除，
 *    避免把一个跑不起来的 setup.exe 发到 Releases 上
 */
export function selectAssets(dir, options = {}) {
  const minInstallerBytes = options.minInstallerBytes == null ? MIN_INSTALLER_BYTES : options.minInstallerBytes
  if (!existsSync(dir)) return []
  const picked = []
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('builder-debug')) continue
    const isArtifact = ASSET_EXTENSIONS.some((ext) => name.endsWith(ext))
    if (!isArtifact) continue
    const path = join(dir, name)
    const size = statSync(path).size
    if (name.endsWith('setup.exe') && size < minInstallerBytes) {
      console.log(`::warning::忽略疑似半成品的安装包 ${name}（${(size / 1024 / 1024).toFixed(1)} MB，明显偏小）`)
      continue
    }
    picked.push({ name, path, size })
  }
  return picked
}

/** 生成「本次更新」小节；没有提交就返回空串 */
export function buildChangelog({ previousTag, tag, subjects }) {
  const lines = (subjects || []).map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) return ''
  const range = previousTag ? `${previousTag} → ${tag}` : tag
  return ['### 本次更新', '', `_${range}_`, '', ...lines].join('\n')
}

function runGit(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

/** 发布说明 = 固定模板 + 自动生成的提交列表 */
export function composeReleaseBody({ tag, previousTag, subjects, notesFile }) {
  if (notesFile && existsSync(notesFile)) return readFileSync(notesFile, 'utf8')
  const changelog = buildChangelog({ previousTag, tag, subjects })
  return changelog ? `${RELEASE_NOTES}\n\n${changelog}\n` : `${RELEASE_NOTES}\n`
}

function headers(token) {
  return {
    'User-Agent': 'ClauseEye-release-publisher',
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
  }
}

async function apiCall(token, method, url, body) {
  const response = await fetch(url, {
    method,
    headers: { ...headers(token), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* 非 JSON 响应 */
  }
  return { ok: response.ok, status: response.status, json, text }
}

async function findRelease(token, repo, tag) {
  const result = await apiCall(token, 'GET', `${API}/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`)
  if (result.ok) return result.json
  if (result.status === 404) return null
  throw new Error(`查询 Release 失败：HTTP ${result.status} ${result.text.slice(0, 200)}`)
}

async function ensureRelease(token, repo, tag, name, body) {
  const existing = await findRelease(token, repo, tag)
  if (existing) {
    const patched = await apiCall(token, 'PATCH', `${API}/repos/${repo}/releases/${existing.id}`, {
      name,
      body,
      make_latest: 'true',
    })
    if (!patched.ok) throw new Error(`更新 Release 失败：HTTP ${patched.status} ${patched.text.slice(0, 200)}`)
    console.log(`✓ 已更新 Release ${tag}（id=${existing.id}）`)
    return patched.json
  }
  const created = await apiCall(token, 'POST', `${API}/repos/${repo}/releases`, {
    tag_name: tag,
    name,
    body,
    make_latest: 'true',
  })
  if (!created.ok) throw new Error(`创建 Release 失败：HTTP ${created.status} ${created.text.slice(0, 200)}`)
  console.log(`✓ 已创建 Release ${tag}（id=${created.json.id}）`)
  return created.json
}

async function deleteAsset(token, repo, assetId) {
  await apiCall(token, 'DELETE', `${API}/repos/${repo}/releases/assets/${assetId}`)
}

async function uploadAsset(token, repo, release, asset) {
  const url = `${UPLOAD_API}/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(asset.name)}`
  const body = readFileSync(asset.path)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...headers(token),
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(body.length),
    },
    body,
  })
  const text = await response.text()
  return { ok: response.ok, status: response.status, text }
}

async function uploadWithRetry(token, repo, release, asset, attempts = 3) {
  // 同名资产已存在时（历史上传残留）先删掉再传，等价于 gh 的 --clobber
  const existing = (release.assets || []).find((item) => item.name === asset.name)
  if (existing) await deleteAsset(token, repo, existing.id)

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await uploadAsset(token, repo, release, asset)
      if (result.ok) {
        console.log(`✓ 已上传 ${asset.name}（${(asset.size / 1024 / 1024).toFixed(1)} MB）`)
        return true
      }
      if (result.status === 422) {
        // 并发/缓存导致的「已存在」，删掉重来一次
        const again = await findRelease(token, repo, release.tag_name)
        const dup = ((again && again.assets) || []).find((item) => item.name === asset.name)
        if (dup) await deleteAsset(token, repo, dup.id)
      }
      console.log(`::warning::第 ${attempt} 次上传 ${asset.name} 失败：HTTP ${result.status} ${result.text.slice(0, 160)}`)
    } catch (error) {
      console.log(`::warning::第 ${attempt} 次上传 ${asset.name} 出错：${error instanceof Error ? error.message : String(error)}`)
    }
    await new Promise((done) => setTimeout(done, 3000 * attempt))
  }
  return false
}

function parseArgs(argv) {
  const options = { dir: 'release', dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const current = argv[i]
    if (current === '--dir') options.dir = argv[++i]
    else if (current === '--tag') options.tag = argv[++i]
    else if (current === '--notes-file') options.notesFile = argv[++i]
    else if (current === '--dry-run') options.dryRun = true
  }
  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const tag = options.tag || process.env.GITHUB_REF_NAME || ''
  const repo = process.env.GITHUB_REPOSITORY || '1576584678/ClauseEye'
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''
  const dir = resolve(options.dir)
  const assets = selectAssets(dir)

  if (!tag) throw new Error('缺少 tag（--tag 或 GITHUB_REF_NAME）')
  if (assets.length === 0) throw new Error(`${dir} 下没有可发布的产物`)

  const previousTag = runGit(['describe', '--tags', '--abbrev=0', `${tag}^`])
  const subjects = runGit(['log', '--no-merges', '--pretty=- %s', previousTag ? `${previousTag}..${tag}` : '-20', tag])
    .split('\n')
    .filter(Boolean)
  const body = composeReleaseBody({ tag, previousTag, subjects, notesFile: options.notesFile })

  console.log(`→ 发布目标：${repo} ${tag}`)
  console.log(`→ 产物：${assets.map((item) => `${item.name}(${(item.size / 1024 / 1024).toFixed(1)}MB)`).join('、')}`)
  console.log(`→ 发布说明：${body.split('\n').length} 行${previousTag ? `（自 ${previousTag} 起 ${subjects.length} 条提交）` : ''}`)

  if (options.dryRun || !token) {
    console.log(options.dryRun ? '· dry-run：不实际发布' : '· 缺少 GITHUB_TOKEN：只打印计划，不实际发布')
    return
  }

  const release = await ensureRelease(token, repo, tag, `ClauseEye ${tag}`, body)

  const failed = []
  for (const asset of assets) {
    const ok = await uploadWithRetry(token, repo, release, asset)
    if (!ok) failed.push(asset.name)
  }

  if (failed.length > 0) {
    console.log(`::error::以下产物上传失败：${failed.join('、')}`)
    process.exit(1)
  }
  console.log(`✓ 发布完成：https://github.com/${repo}/releases/tag/${tag}`)
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  main().catch((error) => {
    console.log(`::error::发布失败：${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}
