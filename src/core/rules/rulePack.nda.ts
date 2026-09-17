/** 保密协议 / NDA · 种子规则包 v0.1 */

import { findMatches, type Rule } from './engine'

export const NDA_RULES: Rule[] = [
  {
    id: 'nda.perpetual',
    title: '保密期限无上限',
    pack: 'nda',
    severity: 'medium',
    legalBasis: '《反不正当竞争法》第 9 条：商业秘密需符合保密性、价值性、秘密性要件。',
    reason: '约定"永久保密、无期限保密"，会让离职多年后仍背负不确定的违约风险。',
    suggestion: '争取改为"保密期限为公开之日止；一般信息自披露之日起 3 年"，并明确例外情形（已公开、独立开发、合法取得）。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:(?:保密(?:期限|义务))[^。；\n]{0,20}(?:永久|无限期|无期限|长期有效|不设期限))|(?:(?:永久|无限期)[^。；\n]{0,10}保密)/g,
      )
    },
  },
  {
    id: 'nda.one-sided-penalty',
    title: '违约责任单向且过高',
    pack: 'nda',
    severity: 'medium',
    legalBasis: '《民法典》第 585 条：违约金应与实际损失相当。',
    reason: '只有接收方（你）承担违约金、且金额巨大，披露方不承担任何责任，属于不对等条款。',
    suggestion: '要求双向对等，或约定"违约金以实际损失为限，且不超过 X 万元"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:乙方|接收方|知悉方|员工)[^。；\n]{0,40}/g, (m) => {
        if (!/(?:违约金|赔偿|承担)/.test(m[0])) return null
        if (/(?:甲方|披露方)[^。；\n]{0,30}(?:违约金|赔偿)/.test(ctx.text)) return null
        return { reason: '违约与赔偿责任只写在接收方（你）一侧，披露方未承担对应义务。' }
      })
    },
  },
  {
    id: 'nda.broad-scope',
    title: '保密范围过宽',
    pack: 'nda',
    severity: 'low',
    reason: '"一切信息/任何资料均视为保密"会让所有信息都处于保密义务下，边界不可预期。',
    suggestion: '要求限定为「以书面标注保密或口头披露后 15 日内书面确认的信息」。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:(?:一切|所有|任何)[^。；\n]{0,16}(?:信息|资料|数据|内容)[^。；\n]{0,20}(?:均|都)?[^。；\n]{0,8}(?:视为|属于|构成)[^。；\n]{0,8}保密)/g,
      )
    },
  },
  {
    id: 'nda.no-return-or-destroy',
    title: '未约定资料返还/销毁',
    pack: 'nda',
    severity: 'low',
    reason: '缺少返还与销毁条款，离职后资料归属不清，容易被指"未归还保密资料"。',
    suggestion: '补充"合作/劳动关系结束时，接收方应返还或销毁全部保密资料并出具书面确认"。',
    maxMatches: 1,
    detect(ctx) {
      if (/(?:返还|归还|销毁|清除)/.test(ctx.text)) return []
      return findMatches(ctx, /保密(?:资料|信息|文件)[^。；\n]{0,40}/g)
    },
  },
  {
    id: 'nda.unilateral-term-change',
    title: '披露方可单方变更/终止',
    pack: 'nda',
    severity: 'low',
    reason: '披露方有权随时单方解除或变更保密安排，而接收方义务继续存在，权责不对等。',
    suggestion: '要求变更需双方书面同意，且终止后已产生的保密义务合理收束（明确期限）。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:甲方|披露方)[^。；\n]{0,20}(?:有权|可以|可)[^。；\n]{0,16}(?:随时|单方)[^。；\n]{0,16}(?:终止|解除|变更|修改)/g,
      )
    },
  },
]

