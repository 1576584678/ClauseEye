import { describe, expect, it } from 'vitest'
import { analyzeDocument, classifyRationale, mergeModelRisks } from '../analyze'
import { normalizeText } from '../text'

describe('分析管线', () => {
  it('输出分类、条款、风险与关键日期', () => {
    const text = normalizeText(`劳动合同
第一条 合同期限
本合同自 2026年1月1日 起至 2027年1月1日 止。

第二条 试用期
试用期为 6 个月。

第三条 争议解决
因本合同发生争议，双方应协商解决。`)
    const analysis = analyzeDocument(text)
    expect(analysis.category).toBe('labor')
    expect(analysis.engine).toBe('rules')
    expect(analysis.clauses.length).toBeGreaterThanOrEqual(3)
    expect(analysis.risks.map((r) => r.ruleId)).toContain('labor.probation-over-limit')
    expect(analysis.keyDates.some((d) => d.date === '2026-01-01')).toBe(true)
    expect(classifyRationale(analysis)).toContain('命中特征')
  })

  it('条款过少时给出降级提示', () => {
    const analysis = analyzeDocument(normalizeText('本合同自 2026年1月1日 起生效，试用期为 6 个月。'))
    expect(analysis.notes.some((n) => n.includes('按段落切分'))).toBe(true)
  })
})

describe('BYOK 结果合并（防幻觉）', () => {
  const text = normalizeText(`服务协议
第一条 生效
本协议自双方签字之日起生效。
第二条 其他
双方应友好协商解决分歧。`)

  it('引用不存在于原文时直接丢弃', () => {
    const analysis = analyzeDocument(text)
    const outcome = mergeModelRisks(analysis, text, [
      { severity: 'high', quote: '乙方应赔偿甲方一百万元', reason: '编造的条款' },
    ])
    expect(outcome.accepted).toBe(0)
    expect(outcome.rejected[0].reason).toContain('幻觉')
  })

  it('缺少解释的条目按三要素规则降级丢弃', () => {
    const analysis = analyzeDocument(text)
    const outcome = mergeModelRisks(analysis, text, [{ severity: 'medium', quote: '双方应友好协商解决分歧', reason: '   ' }])
    expect(outcome.accepted).toBe(0)
  })

  it('真实引用会被采纳并带上 byModel 标记', () => {
    const analysis = analyzeDocument(text)
    const outcome = mergeModelRisks(analysis, text, [
      {
        severity: 'low',
        quote: '双方应友好协商解决分歧',
        reason: '未约定具体的争议解决机构，发生纠纷时可能拖延。',
        suggestion: '补充约定管辖法院或仲裁机构。',
      },
    ])
    expect(outcome.accepted).toBe(1)
    const flag = outcome.result.risks.find((r) => r.byModel)
    expect(flag?.byModel).toBe(true)
    expect(flag?.severity).toBe('low')
    expect(outcome.result.engine).toBe('rules+byok')
    expect(text.slice(flag?.quoteStart ?? 0, (flag?.quoteStart ?? 0) + (flag?.quote.length ?? 0))).toBe(flag?.quote)
  })

  it('同一场景中已被本地规则命中的条款不再重复采纳', () => {
    const labor = normalizeText(`劳动合同
第一条 试用期
试用期为 9 个月，工资面议。`)
    const analysis = analyzeDocument(labor)
    expect(analysis.risks.length).toBeGreaterThan(0)
    const covered = analysis.risks[0].quote
    const outcome = mergeModelRisks(analysis, labor, [{ severity: 'high', quote: covered, reason: '模型也认为有问题' }])
    expect(outcome.accepted).toBe(0)
    expect(outcome.rejected[0].reason).toContain('规则')
  })
})
