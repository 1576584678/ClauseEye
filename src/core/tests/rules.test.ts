import { describe, expect, it } from 'vitest'
import { analyzeDocument } from '../analyze'
import { RULES, RULES_VERSION, severityRank, summarizeRisks } from '../rules'
import { normalizeText } from '../text'
import { SAMPLE_DOCS } from '../../samples'

function textOf(key: string): string {
  const sample = SAMPLE_DOCS.find((s) => s.key === key)
  if (!sample) throw new Error(`缺少示例 ${key}`)
  return normalizeText(sample.text.replace(/\r\n/g, '\n'))
}

describe('规则引擎', () => {
  it('规则 id 唯一', () => {
    const ids = RULES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(RULES_VERSION).toMatch(/^0\./)
  })

  it('所有命中的原文引用都能在文档中精确定位（防幻觉硬约束）', () => {
    for (const sample of SAMPLE_DOCS) {
      const text = normalizeText(sample.text.replace(/\r\n/g, '\n'))
      const analysis = analyzeDocument(text)
      for (const risk of analysis.risks) {
        expect(risk.quote.length).toBeGreaterThan(0)
        expect(risk.quoteStart).not.toBeNull()
        const start = risk.quoteStart as number
        expect(text.slice(start, start + risk.quote.length), `${risk.ruleId} 引用不一致`).toBe(risk.quote)
        expect(risk.reason.length).toBeGreaterThan(0)
        expect(risk.suggestion.length).toBeGreaterThan(0)
      }
    }
  })

  it('风险条目按 高 → 中 → 低 排序', () => {
    const analysis = analyzeDocument(textOf('labor'))
    const ranks = analysis.risks.map((r) => severityRank(r.severity))
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
  })

  it('劳动合同示例命中关键坑点', () => {
    const ids = new Set(analyzeDocument(textOf('labor')).risks.map((r) => r.ruleId))
    for (const id of [
      'labor.probation-over-limit',
      'labor.probation-no-social-insurance',
      'labor.waive-social-insurance',
      'labor.unpaid-overtime',
      'labor.unilateral-termination',
      'labor.noncompete',
      'labor.deposit-or-id-retention',
      'labor.penalty-excessive',
      'labor.auto-renew',
    ]) {
      expect(ids.has(id), id).toBe(true)
    }
  })

  it('试用期上限随合同期限判定：2 年合同 + 6 个月试用期 = 高风险', () => {
    const analysis = analyzeDocument(textOf('labor'))
    const flag = analysis.risks.find((r) => r.ruleId === 'labor.probation-over-limit')
    expect(flag?.severity).toBe('high')
    expect(flag?.reason).toContain('法定试用期上限为 2 个月')
  })

  it('合法试用期不会误报（3 年合同 + 3 个月）', () => {
    const text = normalizeText(`劳动合同
第一条 合同期限
本合同自 2026年1月1日 起至 2029年1月1日 止。

第二条 试用期
试用期为 3 个月，试用期工资为 12000 元，转正后工资为 15000 元。`)
    const ids = analyzeDocument(text).risks.map((r) => r.ruleId)
    expect(ids).not.toContain('labor.probation-over-limit')
    expect(ids).not.toContain('labor.probation-pay-low')
  })

  it('租房示例命中霸王条款集合', () => {
    const ids = new Set(analyzeDocument(textOf('rent')).risks.map((r) => r.ruleId))
    for (const id of [
      'rent.deposit-not-refundable',
      'rent.auto-renew',
      'rent.unilateral-rent-increase',
      'rent.landlord-entry',
      'rent.unilateral-takeback',
      'rent.late-fee',
    ]) {
      expect(ids.has(id), id).toBe(true)
    }
  })

  it('离职证明与工伤鉴定示例各自命中对应规则', () => {
    const resignation = new Set(analyzeDocument(textOf('resignation')).risks.map((r) => r.ruleId))
    expect(resignation.has('resignation.waive-claims')).toBe(true)
    expect(resignation.has('resignation.negative-wording')).toBe(true)
    expect(resignation.has('resignation.missing-required-fields')).toBe(true)
    expect(resignation.has('resignation.reason-personal')).toBe(true)

    const injury = new Set(analyzeDocument(textOf('injury')).risks.map((r) => r.ruleId))
    expect(injury.has('injury.ambiguous-conclusion')).toBe(true)
    expect(injury.has('injury.no-recheck-deadline')).toBe(true)
  })

  it('二手房 / 装修 / 驾培示例命中各自关键坑点', () => {
    const house = new Set(analyzeDocument(textOf('house')).risks.map((r) => r.ruleId))
    for (const id of [
      'house.deposit-forfeit-only-buyer',
      'house.price-not-fixed',
      'house.mortgage-or-seizure-unresolved',
      'house.household-not-moved',
      'house.all-taxes-on-buyer',
      'house.as-is-waiver',
      'house.seller-unilateral-termination',
      'house.loan-failure-buyer-default',
    ]) {
      expect(house.has(id), id).toBe(true)
    }

    const decoration = new Set(analyzeDocument(textOf('decoration')).risks.map((r) => r.ruleId))
    for (const id of [
      'decoration.advance-payment-too-high',
      'decoration.deadline-not-fixed',
      'decoration.extra-items-unlimited',
      'decoration.warranty-too-short',
      'decoration.final-payment-before-acceptance',
      'decoration.hidden-works-skipped',
      'decoration.environment-waiver',
    ]) {
      expect(decoration.has(id), id).toBe(true)
    }

    const driving = new Set(analyzeDocument(textOf('driving')).risks.map((r) => r.ruleId))
    for (const id of [
      'driving.no-refund-on-withdraw',
      'driving.extra-fees-unlimited',
      'driving.no-training-deadline',
      'driving.coach-not-changeable',
      'driving.injury-waiver',
      'driving.vehicle-damage-liability',
      'driving.personal-info-marketing',
    ]) {
      expect(driving.has(id), id).toBe(true)
    }
  })

  it('通用规则不与场景规则重复报告同一条款', () => {
    const analysis = analyzeDocument(textOf('labor'))
    const specific = new Set(
      analysis.risks
        .filter((r) => !r.ruleId.startsWith('common.'))
        .map((r) => `${r.clauseIndex}|${r.quote.slice(0, 20)}`),
    )
    for (const risk of analysis.risks.filter((r) => r.ruleId.startsWith('common.'))) {
      expect(specific.has(`${risk.clauseIndex}|${risk.quote.slice(0, 20)}`), risk.ruleId).toBe(false)
    }
  })

  it('空白占位符会被通用规则捕获', () => {
    const analysis = analyzeDocument(normalizeText('甲方（签字）：____  乙方（签字）：____  日期：______'))
    expect(analysis.risks.map((r) => r.ruleId)).toContain('common.blank-placeholder')
  })

  it('风险统计只计入未标记误报的条目', () => {
    const analysis = analyzeDocument(textOf('rent'))
    const before = summarizeRisks(analysis.risks)
    const withOneDismissed = analysis.risks.map((r, i) => (i === 0 ? { ...r, status: 'false_positive' as const } : r))
    const after = summarizeRisks(withOneDismissed)
    expect(after.total).toBe(before.total - 1)
  })
})
