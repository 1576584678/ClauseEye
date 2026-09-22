/** 本地规则引擎：离线、可解释、可单测的坑点初筛。 */

import { CATEGORY_MAP } from '../classify'
import { clauseAt, expandToSentence } from '../text'
import type { CategoryCode, ClauseBlock, RiskFlag, RulePackId, Severity } from '../types'

export const RULES_VERSION = '0.6.0-v1'

/** 命中项可覆盖的部分（位置与引用由引擎计算，不允许覆盖） */
export type RuleMatchOverride = Partial<Pick<RuleMatch, 'severity' | 'reason' | 'suggestion' | 'clauseIndex'>>

export interface RuleMatch {
  /** 命中位置在原文中的偏移量（quote 为原文精确子串） */
  start: number
  end: number
  quote: string
  clauseIndex: number | null
  /** 命中项可覆盖规则默认的风险等级与解释（用于按数值分级） */
  severity?: Severity
  reason?: string
  suggestion?: string
}

export interface RuleContext {
  text: string
  clauses: ClauseBlock[]
}

export interface Rule {
  id: string
  title: string
  /** 归属场景包；'common' 表示所有文档都会跑 */
  pack: RulePackId
  severity: Severity
  reason: string
  suggestion: string
  legalBasis?: string
  /** 单条规则最多报几条，避免刷屏 */
  maxMatches?: number
  detect: (ctx: RuleContext) => RuleMatch[]
}

export function makeMatch(
  ctx: RuleContext,
  start: number,
  end: number,
  extra: RuleMatchOverride = {},
): RuleMatch {
  const bounds = expandToSentence(ctx.text, start, end, 46)
  const raw = ctx.text.slice(bounds.start, bounds.end)
  const lead = raw.length - raw.trimStart().length
  const trimmed = raw.trim()
  const qStart = bounds.start + lead
  return {
    start: qStart,
    end: qStart + trimmed.length,
    quote: trimmed,
    clauseIndex: clauseAt(ctx.clauses, start),
    ...extra,
  }
}

/**
 * 正则扫描 + 逐条 refine。
 * refine 返回 null 表示"命中但不算风险"（例如试用期 3 个月是合法的）。
 */
export function findMatches(
  ctx: RuleContext,
  pattern: RegExp,
  refine?: (m: RegExpExecArray) => RuleMatchOverride | null,
): RuleMatch[] {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  const rx = new RegExp(pattern.source, flags)
  const out: RuleMatch[] = []
  let m: RegExpExecArray | null
  while ((m = rx.exec(ctx.text)) !== null) {
    if (m[0].length === 0) {
      rx.lastIndex += 1
      continue
    }
    const extra = refine ? refine(m) : {}
    if (extra === null) continue
    out.push(makeMatch(ctx, m.index, m.index + m[0].length, extra ?? {}))
  }
  return out
}

/** 整篇文档级别的判定（用于"缺少某某要素"这类规则） */
export function wholeDocMatch(ctx: RuleContext, extra: RuleMatchOverride = {}): RuleMatch {
  return makeMatch(ctx, 0, Math.min(ctx.text.length, 60), extra)
}

export function severityRank(severity: Severity): number {
  return severity === 'high' ? 0 : severity === 'medium' ? 1 : 2
}

/** 执行指定分类对应的规则包 + 通用包 */
export function runRules(ctx: RuleContext, category: CategoryCode, rules: Rule[]): RiskFlag[] {
  const pack = CATEGORY_MAP[category]?.rulePack ?? 'common'
  const packs = new Set<RulePackId>([pack, 'common'])
  const now = new Date().toISOString()
  const flags: RiskFlag[] = []

  for (const rule of rules) {
    if (!packs.has(rule.pack)) continue
    let matches: RuleMatch[] = []
    try {
      matches = rule.detect(ctx)
    } catch (error) {
      // 规则执行失败不能静默丢失命中，留下可诊断信息
      console.warn(`[rules] 规则 ${rule.id} 执行失败`, error)
      matches = []
    }
    const limit = rule.maxMatches ?? 3
    matches.slice(0, limit).forEach((match, i) => {
      flags.push({
        id: `${rule.id}#${i}`,
        ruleId: rule.id,
        ruleTitle: rule.title,
        severity: match.severity ?? rule.severity,
        quote: match.quote,
        quoteStart: match.start,
        clauseIndex: match.clauseIndex,
        reason: match.reason ?? rule.reason,
        suggestion: match.suggestion ?? rule.suggestion,
        legalBasis: rule.legalBasis,
        byModel: false,
        status: 'open',
        createdAt: now,
      })
    })
  }

  const seen = new Set<string>()
  const deduped = flags.filter((f) => {
    const key = `${f.ruleId}|${f.clauseIndex}|${f.quote.slice(0, 24)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // 通用规则与场景规则命中同一条款时，保留更具体的场景规则，避免重复刷屏
  const specificKeys = new Set(
    deduped.filter((f) => !f.ruleId.startsWith('common.')).map((f) => `${f.clauseIndex}|${f.quote.slice(0, 20)}`),
  )
  const merged = deduped.filter(
    (f) => !f.ruleId.startsWith('common.') || !specificKeys.has(`${f.clauseIndex}|${f.quote.slice(0, 20)}`),
  )

  merged.sort((a, b) => {
    const bySeverity = severityRank(a.severity) - severityRank(b.severity)
    if (bySeverity !== 0) return bySeverity
    return (a.quoteStart ?? 0) - (b.quoteStart ?? 0)
  })
  return merged
}

export function summarizeRisks(flags: RiskFlag[]): { high: number; medium: number; low: number; total: number } {
  return {
    high: flags.filter((f) => f.severity === 'high' && f.status !== 'false_positive').length,
    medium: flags.filter((f) => f.severity === 'medium' && f.status !== 'false_positive').length,
    low: flags.filter((f) => f.severity === 'low' && f.status !== 'false_positive').length,
    total: flags.filter((f) => f.status !== 'false_positive').length,
  }
}


