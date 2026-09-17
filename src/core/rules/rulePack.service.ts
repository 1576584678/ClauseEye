/** 服务 / 外包 / 委托协议 · 种子规则包 v0.1 */

import { findMatches, type Rule } from './engine'

export const SERVICE_RULES: Rule[] = [
  {
    id: 'service.payment-delay',
    title: '付款周期过长 / 挂钩验收',
    pack: 'service',
    severity: 'medium',
    reason: '"验收合格后 60/90 日付款"或付款完全挂钩对方验收，会拉长你的现金流周期。',
    suggestion: '争取分期付款（如 3:4:3），约定"逾期付款按日万分之三计息"，并明确验收期限（如 7 个工作日不反馈视为通过）。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:验收|结算|付款|支付|回款)[^。；\n]{0,40}/g, (m) => {
        const days = /(\d+)\s*(?:个?工作日|日|天)/.exec(m[0])
        if (!days) return null
        const value = Number(days[1])
        if (value >= 60) return { severity: 'high', reason: `付款周期约 ${value} 天，显著长于常见结算周期，回款风险高。` }
        if (value >= 30) return { reason: `付款周期约 ${value} 天，需关注现金流。` }
        return null
      })
    },
  },
  {
    id: 'service.ip-transfer-all',
    title: '成果知识产权全部归对方',
    pack: 'service',
    severity: 'medium',
    legalBasis: '《著作权法》第 19 条、《民法典》第 843—845 条（技术合同成果归属可约定）。',
    reason: '"所有成果及知识产权无偿归甲方所有"可能把非本项目成果、通用组件、方法论一并让渡。',
    suggestion: '限定为"本项目交付物"，并保留通用组件/既有技术/方法论的所有权与复用权。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:知识产权|著作权|成果|专利)[^。；\n]{0,30}(?:归|属于)[^。；\n]{0,12}(?:甲方|委托方|需求方|客户)[^。；\n]{0,16}/g,
      )
    },
  },
  {
    id: 'service.unlimited-revision',
    title: '无限次修改 / 直至满意',
    pack: 'service',
    severity: 'high',
    reason: '"修改直至甲方满意""不限次数返工"会把项目拖成无底洞。',
    suggestion: '约定明确的交付标准与免费修改轮次（如 2 轮），超出部分按小时/次另行计费。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:(?:无限次|不限次|不限制次数)[^。；\n]{0,16}(?:修改|返工|调整|优化))|(?:(?:修改|调整|返工)[^。；\n]{0,20}(?:直至|直到|至)[^。；\n]{0,10}(?:甲方)?[^。；\n]{0,6}(?:满意|验收通过))/g,
      )
    },
  },
  {
    id: 'service.one-sided-penalty',
    title: '违约责任单向',
    pack: 'service',
    severity: 'medium',
    legalBasis: '《民法典》第 585 条。',
    reason: '只约定服务方（你）的违约金与赔偿责任，对方逾期付款/不配合却无责任。',
    suggestion: '补充对等条款：甲方逾期付款、逾期确认需求、逾期提供素材同样承担违约责任。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:乙方|服务方|受托方|承包方)[^。；\n]{0,40}/g, (m) => {
        if (!/(?:违约金|赔偿|承担全部损失)/.test(m[0])) return null
        if (/(?:甲方|委托方|需求方)[^。；\n]{0,40}(?:违约金|赔偿)/.test(ctx.text)) return null
        return { reason: '违约责任条款只约束服务方一方，未约定对方逾期付款/不配合的责任。' }
      })
    },
  },
  {
    id: 'service.payment-retention',
    title: '质保金/尾款比例偏高',
    pack: 'service',
    severity: 'low',
    reason: '尾款或质保金比例过高、且缺少释放条件，容易出现"活干完、钱拿不全"。',
    suggestion: '要求写明尾款释放的客观条件与时限（如验收后 30 日内支付，质保金不超过 5% 且约定退还时间）。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:质保金|保证金|尾款|验收款)[^。；\n]{0,24}(?:\d{1,2}\s*%|百分之[一二三四五六七八九十]+)/g,
      )
    },
  },
  {
    id: 'service.freelance-employee-risk',
    title: '"合作"但管理方式像用工',
    pack: 'service',
    severity: 'low',
    legalBasis: '《关于确立劳动关系有关事项的通知》（劳社部发〔2005〕12 号）确立劳动关系三要素。',
    reason: '若协议名为"合作/外包"，但实际是固定打卡、按公司制度管理、只服务一家，可能被认定为事实劳动关系或反之被否认权益。',
    suggestion: '明确合作关系与独立自主的工作方式；如需保障，应直接签订劳动合同或明确社保、工伤责任归属。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:(?:考勤|打卡|坐班|遵守)[^。；\n]{0,20}(?:公司|甲方)[^。；\n]{0,16}(?:制度|管理|规定))|(?:(?:不构成|不属于)[^。；\n]{0,12}(?:劳动关系|雇佣关系))/g,
      )
    },
  },
]

