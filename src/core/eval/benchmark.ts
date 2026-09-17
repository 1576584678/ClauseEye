/**
 * 规则库评测基准
 *
 * 用法：
 *   npx vitest run src/core/tests/benchmark.test.ts   （CI 中随单测一起跑）
 *
 * 指标定义：
 * - recall（召回）：所有 expectHit 中被命中的比例 —— 衡量"有没有漏掉坑"
 * - precision（准确）：命中里有多少是标注要求命中的，以及是否命中了 expectMiss —— 衡量"是否误报"
 * - quote 可定位率：规则引用必须能在原文中精确切片，这是防幻觉的硬约束
 */

import { analyzeDocument } from '../analyze'
import { normalizeText } from '../text'
import { BENCHMARK_CASES, type BenchmarkCase } from './benchmarkCases'

export interface CaseResult {
  caseId: string
  title: string
  hits: string[]
  expectedHits: string[]
  missing: string[]
  falsePositives: string[]
  quoteOk: boolean
}

export interface BenchmarkReport {
  results: CaseResult[]
  totalExpected: number
  totalHit: number
  recall: number
  precision: number
  falsePositiveCount: number
  quoteAccuracy: number
  /** 报告中所有出现问题的用例，便于直接定位 */
  failures: CaseResult[]
}

export function evaluateCase(testCase: BenchmarkCase): CaseResult {
  const text = normalizeText(testCase.text.replace(/\r\n/g, '\n'))
  const analysis = analyzeDocument(text)
  const hits = [...new Set(analysis.risks.map((risk) => risk.ruleId))]

  const missing = testCase.expectHit.filter((id) => !hits.includes(id))
  const falsePositives = (testCase.expectMiss ?? []).filter((id) => hits.includes(id))

  const quoteOk = analysis.risks.every((risk) => {
    if (risk.quoteStart === null) return false
    return text.slice(risk.quoteStart, risk.quoteStart + risk.quote.length) === risk.quote
  })

  return {
    caseId: testCase.id,
    title: testCase.title,
    hits,
    expectedHits: testCase.expectHit,
    missing,
    falsePositives,
    quoteOk,
  }
}

export function runBenchmark(cases: BenchmarkCase[] = BENCHMARK_CASES): BenchmarkReport {
  const results = cases.map(evaluateCase)

  const totalExpected = results.reduce((sum, r) => sum + r.expectedHits.length, 0)
  const totalHit = results.reduce((sum, r) => sum + (r.expectedHits.length - r.missing.length), 0)
  const falsePositiveCount = results.reduce((sum, r) => sum + r.falsePositives.length, 0)
  const totalHitsFound = results.reduce((sum, r) => sum + r.hits.length, 0)

  return {
    results,
    totalExpected,
    totalHit,
    recall: totalExpected === 0 ? 1 : totalHit / totalExpected,
    precision: totalHitsFound === 0 ? 1 : (totalHit + (totalHitsFound - totalHit - falsePositiveCount)) / totalHitsFound,
    falsePositiveCount,
    quoteAccuracy: results.length === 0 ? 1 : results.filter((r) => r.quoteOk).length / results.length,
    failures: results.filter((r) => r.missing.length > 0 || r.falsePositives.length > 0 || !r.quoteOk),
  }
}

export function formatReport(report: BenchmarkReport): string {
  const lines = [
    `用例 ${report.results.length} 条 | 命中 ${report.totalHit}/${report.totalExpected}`,
    `召回率 ${(report.recall * 100).toFixed(1)}% | 准确率 ${(report.precision * 100).toFixed(1)}% | 误报 ${report.falsePositiveCount} 条 | 引用可定位 ${(report.quoteAccuracy * 100).toFixed(1)}%`,
  ]
  for (const failure of report.failures) {
    lines.push(`✗ ${failure.caseId}（${failure.title}）`)
    if (failure.missing.length) lines.push(`   漏报：${failure.missing.join(', ')}`)
    if (failure.falsePositives.length) lines.push(`   误报：${failure.falsePositives.join(', ')}`)
    if (!failure.quoteOk) lines.push('   引用无法在原文中定位')
  }
  return lines.join('\n')
}
