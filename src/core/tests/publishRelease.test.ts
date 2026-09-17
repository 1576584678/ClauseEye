import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-ignore 流水线脚本是 .mjs，没有类型声明；这里只验证其中的纯函数
import { buildChangelog, composeReleaseBody, selectAssets } from '../../../scripts/publish-release.mjs'

function withTempDir(run: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'clauseeye-publish-'))
  try {
    run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const names = (dir: string, options?: { minInstallerBytes?: number }): string[] =>
  selectAssets(dir, options).map((item: { name: string }) => item.name)

describe('发布产物筛选', () => {
  it('只带上各平台产物（exe / dmg / AppImage / deb / zip / yml / blockmap），忽略中间文件与无关文件', () => {
    withTempDir((dir) => {
      writeFileSync(join(dir, 'ClauseEye-0.3.0-win-x64-setup.exe'), 'x'.repeat(64))
      writeFileSync(join(dir, 'ClauseEye-0.3.0-win-x64-portable.exe'), 'x'.repeat(64))
      writeFileSync(join(dir, 'ClauseEye-green-win-x64.zip'), 'x'.repeat(8))
      writeFileSync(join(dir, 'latest.yml'), 'version: 0.3.0\n')
      writeFileSync(join(dir, 'ClauseEye-0.3.0-win-x64-setup.exe.blockmap'), 'x'.repeat(4))
      writeFileSync(join(dir, 'ClauseEye-0.3.0-mac-arm64.dmg'), 'x'.repeat(64))
      writeFileSync(join(dir, 'ClauseEye-0.3.0-mac-arm64.dmg.blockmap'), 'x'.repeat(4))
      writeFileSync(join(dir, 'ClauseEye-0.3.0-mac-arm64.zip'), 'x'.repeat(64))
      writeFileSync(join(dir, 'ClauseEye-0.3.0-linux-x64.AppImage'), 'x'.repeat(64))
      writeFileSync(join(dir, 'ClauseEye-0.3.0-linux-x64.deb'), 'x'.repeat(64))
      writeFileSync(join(dir, 'latest-mac.yml'), 'version: 0.3.0\n')
      writeFileSync(join(dir, 'builder-debug.yml'), 'debug: true\n')
      writeFileSync(join(dir, '使用说明.txt'), 'hi\n')
      expect(names(dir, { minInstallerBytes: 1 })).toEqual([
        'ClauseEye-0.3.0-linux-x64.AppImage',
        'ClauseEye-0.3.0-linux-x64.deb',
        'ClauseEye-0.3.0-mac-arm64.dmg',
        'ClauseEye-0.3.0-mac-arm64.dmg.blockmap',
        'ClauseEye-0.3.0-mac-arm64.zip',
        'ClauseEye-0.3.0-win-x64-portable.exe',
        'ClauseEye-0.3.0-win-x64-setup.exe',
        'ClauseEye-0.3.0-win-x64-setup.exe.blockmap',
        'ClauseEye-green-win-x64.zip',
        'latest-mac.yml',
        'latest.yml',
      ])
    })
  })

  it('安装版明显偏小时按半成品剔除（NSIS 中断会留下 0.2MB 的假安装包）', () => {
    withTempDir((dir) => {
      writeFileSync(join(dir, 'ClauseEye-0.3.0-win-x64-setup.exe'), 'x'.repeat(200 * 1024))
      writeFileSync(join(dir, 'ClauseEye-0.3.0-win-x64-portable.exe'), 'x'.repeat(64))
      expect(names(dir, { minInstallerBytes: 1024 * 1024 })).toEqual(['ClauseEye-0.3.0-win-x64-portable.exe'])
    })
  })

  it('目录不存在时返回空数组', () => {
    expect(names(join(tmpdir(), 'clauseeye-missing-' + Date.now()))).toEqual([])
  })
})

describe('发布说明生成', () => {
  it('有提交时带上版本区间与列表', () => {
    const text = buildChangelog({ previousTag: 'v0.2.0', tag: 'v0.2.1', subjects: ['- 修了一个 bug'] })
    expect(text).toContain('### 本次更新')
    expect(text).toContain('v0.2.0 → v0.2.1')
    expect(text).toContain('- 修了一个 bug')
  })

  it('没有提交时不生成小节', () => {
    expect(buildChangelog({ previousTag: '', tag: 'v0.2.1', subjects: [] })).toBe('')
  })

  it('正文始终包含下载说明；指定说明文件时以文件为准', () => {
    const base = composeReleaseBody({ tag: 'v0.2.1', previousTag: '', subjects: [] })
    expect(base).toContain('双击即可运行')
    expect(base).toContain('latest.yml')
    withTempDir((dir) => {
      const notesFile = join(dir, 'notes.md')
      writeFileSync(notesFile, '自定义说明\n')
      expect(composeReleaseBody({ tag: 'v0.2.1', previousTag: '', subjects: [], notesFile })).toBe('自定义说明\n')
    })
  })
})
