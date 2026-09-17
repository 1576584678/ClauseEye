/** 规则包汇总入口 */

import type { CategoryCode, ClauseBlock, RiskFlag } from '../types'
import { COMMON_RULES } from './rulePack.common'
import { COMMON_V1_RULES } from './rulePack.common.v1'
import { INJURY_RULES } from './rulePack.injury'
import { INJURY_V1_RULES } from './rulePack.injury.v1'
import { LABOR_RULES } from './rulePack.labor'
import { LABOR_V1_RULES } from './rulePack.labor.v1'
import { NDA_RULES } from './rulePack.nda'
import { NDA_V1_RULES } from './rulePack.nda.v1'
import { OFFER_RULES } from './rulePack.offer'
import { OFFER_V1_RULES } from './rulePack.offer.v1'
import { RENT_RULES } from './rulePack.rent'
import { RENT_V1_RULES } from './rulePack.rent.v1'
import { RESIGNATION_RULES } from './rulePack.resignation'
import { RESIGNATION_V1_RULES } from './rulePack.resignation.v1'
import { SERVICE_RULES } from './rulePack.service'
import { SERVICE_V1_RULES } from './rulePack.service.v1'
import { RULES_VERSION, runRules, severityRank, summarizeRisks } from './engine'
import type { Rule, RuleContext, RuleMatch, RuleMatchOverride } from './engine'

export const RULES: Rule[] = [
  ...LABOR_RULES,
  ...LABOR_V1_RULES,
  ...RENT_RULES,
  ...RENT_V1_RULES,
  ...OFFER_RULES,
  ...OFFER_V1_RULES,
  ...RESIGNATION_RULES,
  ...RESIGNATION_V1_RULES,
  ...INJURY_RULES,
  ...INJURY_V1_RULES,
  ...NDA_RULES,
  ...NDA_V1_RULES,
  ...SERVICE_RULES,
  ...SERVICE_V1_RULES,
  ...COMMON_RULES,
  ...COMMON_V1_RULES,
]

export { RULES_VERSION, runRules, severityRank, summarizeRisks }
export type { Rule, RuleContext, RuleMatch, RuleMatchOverride }

export function buildRuleContext(text: string, clauses: ClauseBlock[]): RuleContext {
  return { text, clauses }
}

export function runRuleEngine(ctx: RuleContext, category: CategoryCode): RiskFlag[] {
  return runRules(ctx, category, RULES)
}
