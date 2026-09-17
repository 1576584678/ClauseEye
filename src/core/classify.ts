/** 自动分类器：关键词加权打分（离线、可解释、零模型依赖）。 */

import type { CategoryCode, CategoryMeta } from './types'

export const CATEGORIES: CategoryMeta[] = [
  {
    code: 'labor',
    name: '劳动合同',
    short: '劳动合同',
    description: '正式劳动合同、实习协议、竞业/服务期约定',
    rulePack: 'labor',
  },
  {
    code: 'rent',
    name: '租房合同',
    short: '租房',
    description: '房屋租赁合同、押金条、转租协议',
    rulePack: 'rent',
  },
  {
    code: 'offer',
    name: '录用通知（Offer）',
    short: 'Offer',
    description: 'Offer Letter、入职邀请、薪资方案',
    rulePack: 'offer',
  },
  {
    code: 'resignation',
    name: '离职证明',
    short: '离职证明',
    description: '解除/终止劳动合同证明、离职材料',
    rulePack: 'resignation',
  },
  {
    code: 'injury',
    name: '工伤鉴定',
    short: '工伤鉴定',
    description: '工伤认定书、劳动能力鉴定结论',
    rulePack: 'injury',
  },
  {
    code: 'nda',
    name: '保密协议',
    short: '保密协议',
    description: 'NDA、保密与竞业禁止协议',
    rulePack: 'nda',
  },
  {
    code: 'service',
    name: '服务协议',
    short: '服务协议',
    description: '外包/委托/承揽/自由职业服务合同',
    rulePack: 'service',
  },
  {
    code: 'other',
    name: '其他文档',
    short: '其他',
    description: '未命中已知场景，仅做通用风险扫描',
    rulePack: 'common',
  },
]

export const CATEGORY_MAP: Record<CategoryCode, CategoryMeta> = CATEGORIES.reduce(
  (acc, c) => {
    acc[c.code] = c
    return acc
  },
  {} as Record<CategoryCode, CategoryMeta>,
)

export function categoryName(code: CategoryCode): string {
  return CATEGORY_MAP[code]?.name ?? '其他文档'
}

interface KeywordRule {
  pattern: RegExp
  weight: number
  label: string
}

const KEYWORDS: Record<Exclude<CategoryCode, 'other'>, KeywordRule[]> = {
  labor: [
    { pattern: /劳动合同/g, weight: 4, label: '劳动合同' },
    { pattern: /用人单位/g, weight: 3, label: '用人单位' },
    { pattern: /劳动者/g, weight: 3, label: '劳动者' },
    { pattern: /试用期/g, weight: 2, label: '试用期' },
    { pattern: /竞业限制/g, weight: 3, label: '竞业限制' },
    { pattern: /服务期/g, weight: 2, label: '服务期' },
    { pattern: /社会保险|社保|五险一金/g, weight: 2, label: '社保' },
    { pattern: /劳动合同法/g, weight: 3, label: '劳动合同法' },
    { pattern: /经济补偿/g, weight: 2, label: '经济补偿' },
    { pattern: /解除劳动合同|终止劳动合同/g, weight: 3, label: '解除/终止劳动合同' },
    { pattern: /甲方[\s\S]{0,40}乙方/g, weight: 1, label: '甲乙双方' },
  ],
  rent: [
    { pattern: /租赁合同|房屋租赁|租赁期限/g, weight: 4, label: '租赁合同' },
    { pattern: /出租方|出租人|房东/g, weight: 3, label: '出租方' },
    { pattern: /承租方|承租人|租客|乙方/g, weight: 2, label: '承租方' },
    { pattern: /押金|保证金/g, weight: 3, label: '押金' },
    { pattern: /租金|房租|月租/g, weight: 3, label: '租金' },
    { pattern: /房屋|住宅|公寓|房源/g, weight: 1, label: '房屋' },
    { pattern: /退租|续租|转租/g, weight: 2, label: '退租/续租' },
    { pattern: /物业费|水电费|燃气费/g, weight: 2, label: '费用' },
  ],
  offer: [
    { pattern: /录用通知(书)?|入职邀请|入职通知/g, weight: 5, label: '录用通知书' },
    { pattern: /\b(?:offer|Offer|OFFER)\b/g, weight: 4, label: 'Offer' },
    { pattern: /欢迎加入|很高兴邀请您|诚挚邀请您/g, weight: 3, label: '欢迎加入' },
    { pattern: /月薪|年薪|薪资|薪酬|年包/g, weight: 2, label: '薪资' },
    { pattern: /期权|股权|RSU|ESOP/g, weight: 2, label: '期权' },
    { pattern: /报到|入职日期|入职时间/g, weight: 2, label: '报到' },
    { pattern: /岗位|职位|职级/g, weight: 1, label: '岗位' },
  ],
  resignation: [
    { pattern: /离职证明/g, weight: 5, label: '离职证明' },
    { pattern: /解除劳动合同证明|终止劳动合同证明/g, weight: 5, label: '解除/终止劳动合同证明' },
    { pattern: /兹证明/g, weight: 3, label: '兹证明' },
    { pattern: /在本单位(?:工作|任职)/g, weight: 3, label: '在本单位工作' },
    { pattern: /离职日期|入职日期|离职时间/g, weight: 2, label: '离职日期' },
    { pattern: /工作交接|交接完毕/g, weight: 2, label: '工作交接' },
    { pattern: /特此证明/g, weight: 2, label: '特此证明' },
  ],
  injury: [
    { pattern: /劳动能力鉴定/g, weight: 5, label: '劳动能力鉴定' },
    { pattern: /工伤/g, weight: 4, label: '工伤' },
    { pattern: /伤残等级|伤残情况|护理依赖/g, weight: 4, label: '伤残等级' },
    { pattern: /职业病/g, weight: 3, label: '职业病' },
    { pattern: /鉴定结论|鉴定意见/g, weight: 3, label: '鉴定结论' },
    { pattern: /工伤保险/g, weight: 2, label: '工伤保险' },
    { pattern: /停工留薪/g, weight: 2, label: '停工留薪' },
  ],
  nda: [
    { pattern: /保密协议|保密合同/g, weight: 4, label: '保密协议' },
    { pattern: /商业秘密|技术秘密|经营信息/g, weight: 3, label: '商业秘密' },
    { pattern: /\bNDA\b/g, weight: 4, label: 'NDA' },
    { pattern: /竞业禁止|竞业限制/g, weight: 2, label: '竞业' },
    { pattern: /披露方|接收方|知悉方/g, weight: 3, label: '披露/接收方' },
    { pattern: /保密期限|保密义务/g, weight: 2, label: '保密义务' },
  ],
  service: [
    { pattern: /服务协议|服务合同|技术服务协议/g, weight: 4, label: '服务协议' },
    { pattern: /委托方|受托方|甲方[\s\S]{0,20}乙方/g, weight: 2, label: '委托方/受托方' },
    { pattern: /外包|承揽|咨询|顾问|兼职/g, weight: 3, label: '外包/承揽' },
    { pattern: /服务费|报酬|结算|付款方式/g, weight: 2, label: '服务费/结算' },
    { pattern: /验收|交付物|里程碑/g, weight: 3, label: '验收/交付' },
    { pattern: /知识产权归属|成果归属/g, weight: 2, label: '成果归属' },
  ],
}

export interface CategoryScore {
  code: CategoryCode
  score: number
  hits: string[]
}

export interface ClassifyResult {
  category: CategoryCode
  /** 0–1，越高越有把握 */
  confidence: number
  scores: CategoryScore[]
  /** 判定依据，用于 UI 解释"为什么这么分" */
  rationale: string
}

/** 低于该分数视为"无法识别场景"，归入 other（仅做通用扫描） */
const MIN_SCORE = 3

export function classify(text: string): ClassifyResult {
  const scores: CategoryScore[] = (Object.keys(KEYWORDS) as Exclude<CategoryCode, 'other'>[]).map((code) => {
    let score = 0
    const hits: string[] = []
    for (const rule of KEYWORDS[code]) {
      const found = text.match(rule.pattern)
      if (found && found.length > 0) {
        score += rule.weight + Math.min(found.length - 1, 2)
        hits.push(rule.label)
      }
    }
    return { code, score, hits }
  })

  scores.sort((a, b) => b.score - a.score)
  scores.push({ code: 'other', score: 0, hits: [] })

  const top = scores[0]
  const second = scores[1]?.score ?? 0
  const total = scores.reduce((sum, s) => sum + s.score, 0)

  if (top.score < MIN_SCORE) {
    return {
      category: 'other',
      confidence: 0.2,
      scores,
      rationale: '未命中已知场景关键词，按通用文档处理（仅做通用风险扫描）。',
    }
  }

  const margin = top.score > 0 ? (top.score - second) / top.score : 0
  const share = total > 0 ? top.score / total : 0
  const confidence = Math.min(0.96, 0.4 + margin * 0.35 + share * 0.2 + Math.min(0.1, (top.score - MIN_SCORE) * 0.02))

  const meta = CATEGORY_MAP[top.code]
  return {
    category: top.code,
    confidence: Math.round(confidence * 100) / 100,
    scores,
    rationale: `命中「${meta.name}」特征：${top.hits.slice(0, 5).join('、')}${
      second > 0 ? `；次高为「${CATEGORY_MAP[scores[1].code].name}」（${second} 分）` : ''
    }。`,
  }
}
