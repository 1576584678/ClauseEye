import { describe, expect, it } from 'vitest'
// @ts-ignore 流水线脚本是 .mjs，没有类型声明；这里只验证其中的纯函数
import { selectRedundantReleases } from '../../../scripts/dedupe-releases.mjs'

type Release = {
  id: number
  tag_name: string
  name?: string
  assets: { name: string }[]
}

const asset = (name: string) => ({ name })
const release = (id: number, tag: string, assets: string[]): Release => ({
  id,
  tag_name: tag,
  name: tag,
  assets: assets.map(asset),
})

const ids = (list: Release[]) => selectRedundantReleases(list).map((item: { id: number }) => item.id)

describe('发布去重（同一个 tag 只保留一条 Release）', () => {
  it('只有一条 Release 时不动它', () => {
    expect(ids([release(1, 'v1.0.0', ['a.exe', 'latest.yml'])])).toEqual([])
  })

  it('保留资产更全的那条，删除只有 blockmap 的那条', () => {
    const list = [
      release(390547752, 'v0.2.0', ['ClauseEye-0.2.0-win-x64-setup.exe.blockmap']),
      release(390547751, 'v0.2.0', ['ClauseEye-0.2.0-win-x64-setup.exe', 'ClauseEye-0.2.0-win-x64-portable.exe', 'latest.yml']),
    ]
    expect(ids(list)).toEqual([390547752])
  })

  it('资产数相同时保留 id 更大的（更晚创建的那条）', () => {
    const list = [release(10, 'v1.0.0', ['latest.yml']), release(11, 'v1.0.0', ['latest.yml'])]
    expect(ids(list)).toEqual([10])
  })

  it('优先保留含 latest.yml 的更新链路完整条目，即使它的资产更少', () => {
    const list = [
      release(20, 'v2.0.0', ['ClauseEye-2.0.0-win-x64-setup.exe', 'ClauseEye-2.0.0-win-x64-portable.exe']),
      release(21, 'v2.0.0', ['latest.yml']),
    ]
    expect(ids(list)).toEqual([20])
  })

  it('不同 tag 之间互不影响', () => {
    const list = [
      release(1, 'v1.0.0', ['latest.yml']),
      release(2, 'v1.1.0', ['latest.yml']),
      release(3, 'v1.1.0', ['latest.yml']),
      release(4, 'v1.1.0', ['latest.yml']),
    ]
    expect(ids(list)).toEqual([2, 3])
  })

  it('忽略没有 tag 的脏数据', () => {
    expect(ids([release(1, '', ['latest.yml']), release(2, '', ['latest.yml'])])).toEqual([])
  })
})
