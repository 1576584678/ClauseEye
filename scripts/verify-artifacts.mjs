/**
 * 校验某个平台的产物是否齐全（CI 用，跨平台纯 Node 实现）。
 *
 * 用法：
 *   node scripts/verify-artifacts.mjs --platform windows|macos|linux|all [--dir release]
 *
 * 规则：
 *  - 分平台：该平台一个产物都没有 → 直接失败（让这次 job 变红，避免「绿着但没产物」）
 *  - all：没有 exe 直接失败；缺少 macOS / Linux 产物只警告
 *    （某个平台构建失败不应该阻断已经成功的平台，但要在日志里说清楚）
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const platform = (() => {
  const i = args.indexOf('--platform')
  return i !== -1 && args[i + 1] ? args[i + 1] : 'all'
})()
const dirIndex = args.indexOf('--dir')
const dir = resolve(dirIndex !== -1 && args[dirIndex + 1] ? args[dirIndex + 1] : 'release')

const MIN_INSTALLER_BYTES = 30 * 1024 * 1024

const VALID_PLATFORMS = ['windows', 'macos', 'linux', 'all']
if (!VALID_PLATFORMS.includes(platform)) {
  console.log(`::error::非法的 --platform 值：${platform}（可选 ${VALID_PLATFORMS.join('|')}）`)
  process.exit(1)
}

const files = existsSync(dir) ? readdirSync(dir).filter((name) => statSync(join(dir, name)).isFile()) : []
const match = (re) => files.filter((name) => re.test(name))

const winExe = match(/\.exe$/i)
const winInstaller = winExe.filter((name) => /setup\.exe$/i.test(name) && statSync(join(dir, name)).size > MIN_INSTALLER_BYTES)
const macArtifacts = match(/\.dmg$/i).concat(match(/-mac-.*\.zip$/i))
const linuxArtifacts = match(/\.AppImage$/i).concat(match(/\.deb$/i))

const warn = (message) => console.log(`::warning::${message}`)
const fail = (message) => {
  console.log(`::error::${message}`)
  process.exitCode = 1
}

console.log(`产物目录：${dir}`)
console.log(`共 ${files.length} 个文件`)
for (const name of files.sort()) {
  console.log(`  ${name}  ${(statSync(join(dir, name)).size / 1024 / 1024).toFixed(1)} MB`)
}

if (platform === 'windows' || platform === 'all') {
  console.log(`\n[windows] exe ${winExe.length} 个，可用安装版 ${winInstaller.length} 个`)
  if (winExe.length === 0) fail('没有找到任何 Windows exe 产物')
  else if (winInstaller.length === 0) warn('本次没有可用的安装版（自动更新不可用），只有免安装产物')
}

if (platform === 'macos' || platform === 'all') {
  console.log(`\n[macos] dmg / mac zip ${macArtifacts.length} 个`)
  if (macArtifacts.length === 0) {
    if (platform === 'macos') fail('没有找到任何 macOS 产物（dmg 或 mac zip）')
    else warn('本次没有 macOS 产物')
  }
}

if (platform === 'linux' || platform === 'all') {
  console.log(`\n[linux] AppImage / deb ${linuxArtifacts.length} 个`)
  if (linuxArtifacts.length === 0) {
    if (platform === 'linux') fail('没有找到任何 Linux 产物（AppImage 或 deb）')
    else warn('本次没有 Linux 产物')
  }
}

console.log(process.exitCode ? '\n✗ 产物校验未通过' : '\n✓ 产物校验通过')
