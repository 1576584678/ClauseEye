/**
 * 清理「同一个 tag 上重复的 Release」
 *
 * 背景：electron-builder 的 github publisher 会自己创建 Release；如果流水线再用
 * `gh release create` 建一次，Releases 页面就会出现两个同名条目，而且两边的资产
 * 还各缺一半（自动更新必需的 latest.yml 可能正好落在被忽略的那条上）。
 *
 * 策略：同一个 tag 下只保留「非 blockmap 资产最多、其次 id 最大」的那条，其余删除。
 *
 * 用法：
 *   node scripts/dedupe-releases.mjs                    # 只打印计划（dry-run）
 *   node scripts/dedupe-releases.mjs --apply             # 真正删除（需要 GH_TOKEN）
 *   node scripts/dedupe-releases.mjs --repo owner/repo   # 默认取 GITHUB_REPOSITORY
 */
import { fileURLToPath } from 'node:url'

const DEFAULT_REPO = '1576584678/ClauseEye'
const API = 'https://api.github.com'

/** 非 blockmap 的资产数：自动更新依赖的 exe / latest.yml 都算，"资产更全"用它衡量 */
function assetWeight(release) {
  return (release?.assets || []).filter((asset) => !String(asset?.name || '').endsWith('.blockmap')).length
}

/** 纯函数：从 Release 列表里挑出应当删除的重复条目，便于单测 */
export function selectRedundantReleases(releases) {
  const groups = new Map()
  for (const release of releases || []) {
    const tag = String(release?.tag_name || '')
    if (!tag) continue
    const list = groups.get(tag)
    if (list) list.push(release)
    else groups.set(tag, [release])
  }

  const redundant = []
  for (const [tag, list] of groups) {
    if (list.length < 2) continue
    const ranked = list
      .slice()
      .sort((a, b) => assetWeight(a) - assetWeight(b) || (a.id || 0) - (b.id || 0))
      .reverse()
    for (const release of ranked.slice(1)) {
      redundant.push({ id: release.id, tag, assets: assetWeight(release) })
    }
  }
  return redundant.sort((a, b) => a.id - b.id)
}

function headers(token) {
  return {
    'User-Agent': 'ClauseEye-release-dedupe',
    Accept: 'application/vnd.github+json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function fetchAllReleases(repo, token) {
  const all = []
  for (let page = 1; page <= 10; page++) {
    const response = await fetch(`${API}/repos/${repo}/releases?per_page=100&page=${page}`, { headers: headers(token) })
    if (!response.ok) throw new Error(`读取 Release 列表失败：HTTP ${response.status}`)
    const chunk = await response.json()
    if (!Array.isArray(chunk) || chunk.length === 0) break
    all.push(...chunk)
    if (chunk.length < 100) break
  }
  return all
}

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const repoFlag = args.indexOf('--repo')
  const repo = repoFlag !== -1 ? args[repoFlag + 1] : process.env.GITHUB_REPOSITORY || DEFAULT_REPO
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ''

  const releases = await fetchAllReleases(repo, token)
  const redundant = selectRedundantReleases(releases)

  if (redundant.length === 0) {
    console.log(`✓ ${repo}：没有重复的 Release（共 ${releases.length} 条）`)
    return
  }

  for (const item of redundant) {
    if (!apply) {
      console.log(`· 待删除 id=${item.id} tag=${item.tag}（保留的资产更全）`)
      continue
    }
    if (!token) {
      console.error('✗ 缺少 GH_TOKEN，无法删除重复 Release')
      process.exit(1)
    }
    const response = await fetch(`${API}/repos/${repo}/releases/${item.id}`, { method: 'DELETE', headers: headers(token) })
    if (!response.ok) throw new Error(`删除 Release ${item.id} 失败：HTTP ${response.status}`)
    console.log(`✓ 已删除重复 Release id=${item.id} tag=${item.tag}`)
    console.log(`::warning::删除重复的 Release id=${item.id}（tag ${item.tag}）`)
  }
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (invokedDirectly) {
  main().catch((error) => {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}
