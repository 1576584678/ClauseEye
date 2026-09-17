/** Offer / 录用通知 · 种子规则包 v0.1 */

import { parseDurationMonths, parseAmount } from '../text'
import { findMatches, wholeDocMatch, type Rule } from './engine'

export const OFFER_RULES: Rule[] = [
  {
    id: 'offer.revocable',
    title: 'Offer 可被单方撤销',
    pack: 'offer',
    severity: 'high',
    legalBasis: '《民法典》第 472、476 条：要约经承诺后合同成立，撤销要约受严格限制。',
    reason: 'Offer 写明"公司有权随时撤销/撤回"，意味着你离职跳槽后仍可能被撤回，损失由你承担。',
    suggestion: '要求删除撤销条款，或改为"双方确认后生效；公司违约撤销需赔偿由此造成的直接损失（含已离职的工资损失）"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:公司|本公司|甲方|我司|用人单位)[^。；\n]{0,20}(?:有权|可以|可|保留)[^。；\n]{0,16}(?:随时|单方|无需理由)?[^。；\n]{0,10}(?:撤销|撤回|取消|废止)[^。；\n]{0,16}(?:录用通知|本通知|offer|录用|该通知)/g,
      )
    },
  },
  {
    id: 'offer.conditional',
    title: '附条件 Offer / 可失效条件',
    pack: 'offer',
    severity: 'medium',
    legalBasis: '《民法典》第 158 条：附条件的民事法律行为，条件成就时生效或失效。',
    reason: '以"背调/体检/学历认证通过"为生效条件，或"未按期报到即失效"，都是公司保留反悔权的常见写法。',
    suggestion: '确认条件是否可控（如体检标准、背调范围），并要求"未通过时应书面说明理由"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:(?:背景调查|背调|体检|学历认证|资格审查)[^。；\n]{0,20}(?:不通过|不合格|未通过|不符)[^。；\n]{0,20}(?:取消|失效|不予录用|终止))|(?:本(?:录用通知|通知|要约)[^。；\n]{0,24}(?:以|需|须)[^。；\n]{0,30}(?:为准|为前提|为前提条件|完成后))/g,
      )
    },
  },
  {
    id: 'offer.salary-all-inclusive',
    title: '薪资"已包含"加班费/绩效',
    pack: 'offer',
    severity: 'medium',
    legalBasis: '《劳动法》第 44 条：加班应另行支付加班费，不得以固定薪资打包替代。',
    reason: '"综合月薪已包含加班费"会导致加班再多也没有额外收入，且难以主张加班费差额。',
    suggestion: '要求拆分"基本工资 + 绩效 + 加班费"，并写明加班费按法定倍数额外计算。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:综合)?(?:月薪|薪资|薪酬|工资|年薪|年包)[^。；\n]{0,24}(?:已包含|包含|含|已含)[^。；\n]{0,20}(?:加班费|加班工资|绩效|补贴|社保|公积金)/g,
      )
    },
  },
  {
    id: 'offer.salary-missing',
    title: '薪资未给出明确数字',
    pack: 'offer',
    severity: 'medium',
    reason: 'Offer 中没有可核对的薪资数字，只有"面议/按公司薪酬制度执行"，后续容易与承诺不一致。',
    suggestion: '要求 Offer 写明税前月薪、年终奖规则、试用期比例与调薪时间点。',
    maxMatches: 1,
    detect(ctx) {
      const hasNumber = /\d[\d,.]*\s*(?:元|万元|万|k|K|千)/.test(ctx.text)
      const hasSalaryKeyword = /(?:月薪|年薪|薪资|薪酬|工资|年包|package)/.test(ctx.text)
      if (hasSalaryKeyword && !hasNumber) {
        return [wholeDocMatch(ctx)]
      }
      if (!hasSalaryKeyword) {
        return [wholeDocMatch(ctx, { reason: '全文未出现薪资相关表述，无法评估薪酬条件。' })]
      }
      return []
    },
  },
  {
    id: 'offer.probation-long',
    title: '试用期偏长',
    pack: 'offer',
    severity: 'medium',
    legalBasis: '《劳动合同法》第 19 条：试用期上限与合同期限挂钩（3 年以上才可约定 6 个月）。',
    reason: 'Offer 中约定 4—6 个月试用期，若最终合同期限不足 3 年，则该试用期约定违法。',
    suggestion: '确认劳动合同期限；若合同为 1—3 年，试用期不得超过 2 个月。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /试用期[^。；\n]{0,40}/g, (m) => {
        const months = parseDurationMonths(m[0])
        if (months === null) return null
        if (months > 6) return { severity: 'high', reason: `试用期约 ${months} 个月，超过法定上限 6 个月。` }
        if (months >= 4) return { severity: 'medium', reason: `试用期约 ${months} 个月，只有 3 年以上合同才合法，需核对合同期限。` }
        return null
      })
    },
  },
  {
    id: 'offer.equity-vague',
    title: '期权/股权描述模糊',
    pack: 'offer',
    severity: 'low',
    reason: '期权只写"有机会获得/届时另行约定"，缺少股数、行权价、归属周期，等于没有承诺。',
    suggestion: '要求在 Offer 或单独的期权授予协议中写明：授予数量、行权价格、归属节奏（如 4 年 1 年 cliff）、离职回购规则。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:期权|股权|股票|RSU|ESOP)[^。；\n]{0,70}/g, (m) => {
        if (/(?:有机会|可能(?:获得|授予)|届时(?:再|另行)|视公司|另行约定)/.test(m[0])) {
          return { severity: 'medium', reason: '期权表述为"有机会/届时另行约定"，属于不确定承诺，难以主张。' }
        }
        const complete = /(行权价|行权价格|授予(?:数量|股数)|股数|归属(?:周期|计划|安排)|vesting|回购)/.test(m[0])
        if (!complete) return {}
        return null
      })
    },
  },
  {
    id: 'offer.penalty-or-service-period',
    title: '违约金 / 服务期绑定',
    pack: 'offer',
    severity: 'high',
    legalBasis: '《劳动合同法》第 22、25 条：仅专项培训服务期与竞业限制可约定违约金。',
    reason: '在 Offer 阶段就约定"未满服务期离职需赔偿"，会把你锁死在岗位上。',
    suggestion: '要求删除；如涉及专项培训，需写明培训费用凭证与实际分摊方式。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:(?:违约金|赔偿金)[^。；\n]{0,40})|(?:(?:服务期)[^。；\n]{0,30}(?:未满|不满|提前离职)[^。；\n]{0,20}(?:赔偿|违约金))/g,
        (m) => (parseAmount(m[0]) !== null || /(?:赔偿|违约金)/.test(m[0]) ? {} : null),
      )
    },
  },
  {
    id: 'offer.noncompete-no-compensation',
    title: '竞业限制未约定补偿',
    pack: 'offer',
    severity: 'medium',
    legalBasis: '《劳动合同法》第 23 条：对负有保密义务的劳动者，用人单位应约定竞业限制并按月给予经济补偿。',
    reason: 'Offer 中要求你承担竞业义务却未提补偿标准，离职后可能被要求"白受限"。',
    suggestion: '要求写明竞业限制的补偿标准（通常不低于离职前 12 个月平均工资的 30%）与期限（≤ 2 年）。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /竞业(?:限制|禁止)[^。；\n]{0,70}/g, (m) =>
        /补偿|补偿金|经济补偿/.test(m[0]) ? null : {},
      )
    },
  },
  {
    id: 'offer.bonus-discretionary',
    title: '年终奖为酌情发放',
    pack: 'offer',
    severity: 'low',
    reason: '年终奖"视公司经营情况决定"，属于浮动收入，不应计入你的年度总收入预期。',
    suggestion: '要求写明年终奖的发放条件与计算方式（如"保底 13 薪"），并将关键承诺写进劳动合同。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:年终奖|13\s*薪|十三薪|年终双薪|年终奖金|季度奖)[^。；\n]{0,50}/g, (m) =>
        /(?:视|根据|按照|依据)[^。；\n]{0,20}(?:经营|公司|业务|绩效|考核)[^。；\n]{0,16}(?:情况|结果|表现)?[^。；\n]{0,10}(?:决定|发放|确定)/.test(m[0])
          ? {}
          : null,
      )
    },
  },
]

