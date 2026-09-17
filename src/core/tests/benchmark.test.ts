import { describe, expect, it } from 'vitest'
import { formatReport, runBenchmark } from '../eval/benchmark'

describe('规则库评测基准', () => {
  const report = runBenchmark()

  it('没有漏报（recall = 100%）', () => {
    const missing = report.results.flatMap((r) => r.missing)
    expect(missing, formatReport(report)).toEqual([])
  })

  it('没有误报（expectMiss 全部未命中）', () => {
    expect(report.falsePositiveCount, formatReport(report)).toBe(0)
  })

  it('每条风险引用都能在原文中精确切片', () => {
    expect(report.quoteAccuracy).toBe(1)
  })

  it('评测基准本身有足够覆盖面', () => {
    expect(report.results.length).toBeGreaterThanOrEqual(12)
    expect(report.totalExpected).toBeGreaterThanOrEqual(12)
  })
})
