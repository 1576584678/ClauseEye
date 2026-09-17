/** 分析管线：分类 → 条款切分 → 本地规则初筛 → 关键日期抽取（→ 可选 BYOK 增强） */

import { classify } from './classify'
import { extractKeyDates } from './dates'
import { buildRuleContext, RULES_VERSION, runRuleEngine } from './rules'
import { splitClauses } from './text'
import type { AnalysisResult, RiskFlag, Severity } from './types'

export function analyzeDocument(text: string): AnalysisResult {
  const clauses = splitClauses(text)
  const classified = classify(text)
  const ctx = buildRuleContext(text, clauses)
  const risks = runRuleEngine(ctx, classified.category)
  const keyDates = extractKeyDates(text, classified.category)

  const notes: string[] = []
  if (classified.category === 'other') {
    notes.push('未能识别具体场景，仅执行通用风险扫描；可在文档详情中手动确认分类。')
  }
  if (clauses.length <= 1) {
    notes.push('文档未包含明显的条款编号，已按段落切分，引用定位可能较粗。')
  }

  return {
    category: classified.category,
    categoryConfidence: classified.confidence,
    categoryScores: classified.scores,
    clauses,
    risks,
    keyDates,
    engine: 'rules',
    rulesVersion: RULES_VERSION,
    analyzedAt: new Date().toISOString(),
    notes,
  }
}

export function classifyRationale(result: AnalysisResult): string {
  const top = result.categoryScores[0]
  if (!top || top.score === 0) return '未命中已知场景关键词。'
  return `命中特征：${top.hits.slice(0, 6).join('、')}。`
}

export interface ModelRiskInput {
  severity: Severity
  quote: string
  reason: string
  suggestion?: string
  legalBasis?: string
}

export interface MergeOutcome {
  result: AnalysisResult
  accepted: number
  rejected: { quote: string; reason: string }[]
}

/**
 * 合并 BYOK 模型返回的风险项。
 * 防幻觉红线：原文引用必须在文档中真实存在，且不得覆盖已有规则命中的同一条款。
 */
export function mergeModelRisks(analysis: AnalysisResult, text: string, incoming: ModelRiskInput[]): MergeOutcome {
  const rejected: { quote: string; reason: string }[] = []
  const acceptedFlags: RiskFlag[] = []
  const coveredClauses = new Set(analysis.risks.filter((r) => r.status !== 'false_positive').map((r) => r.clauseIndex))

  incoming.forEach((item, index) => {
    const quote = (item.quote ?? '').trim()
    if (quote.length < 4) {
      rejected.push({ quote, reason: '引用过短，无法定位原文' })
      return
    }
    const start = text.indexOf(quote)
    if (start === -1) {
      rejected.push({ quote, reason: '引用内容在原文中不存在（疑似模型幻觉）' })
      return
    }
    if (!item.reason || !item.reason.trim()) {
      rejected.push({ quote, reason: '缺少解释，按三要素规则降级丢弃' })
      return
    }
    const clauseIndex = analysis.clauses.find((c) => start >= c.start && start < c.end)?.index ?? null
    if (clauseIndex !== null && coveredClauses.has(clauseIndex)) {
      rejected.push({ quote, reason: '该条款已由本地规则命中，保留规则结论' })
      return
    }
    if (clauseIndex !== null) coveredClauses.add(clauseIndex)

    acceptedFlags.push({
      id: `byok#${index}`,
      ruleId: 'byok.model',
      ruleTitle: '模型深度分析',
      severity: item.severity,
      quote,
      quoteStart: start,
      clauseIndex,
      reason: item.reason.trim(),
      suggestion: item.suggestion?.trim() || '建议就该条款与对方明确书面确认。',
      legalBasis: item.legalBasis?.trim() || undefined,
      byModel: true,
      status: 'open',
      createdAt: new Date().toISOString(),
    })
  })

  const merged: AnalysisResult = {
    ...analysis,
    risks: [...analysis.risks, ...acceptedFlags].sort(
      (a, b) => severityWeight(a.severity) - severityWeight(b.severity) || (a.quoteStart ?? 0) - (b.quoteStart ?? 0),
    ),
    engine: acceptedFlags.length > 0 ? 'rules+byok' : analysis.engine,
    analyzedAt: new Date().toISOString(),
    notes: [
      ...analysis.notes,
      acceptedFlags.length > 0
        ? `BYOK 模型补充了 ${acceptedFlags.length} 条风险（引用均已在原文中校验）。`
        : 'BYOK 模型未补充新的风险条目。',
    ],
  }

  return { result: merged, accepted: acceptedFlags.length, rejected }
}

function severityWeight(severity: Severity): number {
  return severity === 'high' ? 0 : severity === 'medium' ? 1 : 2
}
