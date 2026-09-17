/** Offer 结构化抽取与多 Offer 对比（本地启发式，离线可用） */

import { parseAmount, parseDate, parseDurationMonths } from './text'

export type BetterWhen = 'higher' | 'lower' | 'text' | 'present' | 'absent'

export interface OfferFieldDef {
  key: string
  label: string
  betterWhen: BetterWhen
  /** 打分权重，用于本地启发式综合评分 */
  weight?: number
  /** 单位/说明 */
  hint?: string
}

export const OFFER_FIELDS: OfferFieldDef[] = [
  { key: 'company', label: '公司', betterWhen: 'text' },
  { key: 'position', label: '岗位', betterWhen: 'text' },
  { key: 'monthlySalary', label: '税前月薪', betterWhen: 'higher', weight: 30, hint: '元/月' },
  { key: 'salaryMonths', label: '年薪月数', betterWhen: 'higher', weight: 12, hint: '个月' },
  { key: 'bonus', label: '年终奖规则', betterWhen: 'present', weight: 4 },
  { key: 'equity', label: '期权/股权', betterWhen: 'present', weight: 12 },
  { key: 'probationMonths', label: '试用期', betterWhen: 'lower', weight: 10, hint: '个月' },
  { key: 'probationRatio', label: '试用期工资比例', betterWhen: 'higher', weight: 6, hint: '%' },
  { key: 'location', label: '工作地', betterWhen: 'text' },
  { key: 'socialInsurance', label: '五险一金', betterWhen: 'present', weight: 8 },
  { key: 'annualLeave', label: '年假', betterWhen: 'higher', weight: 4, hint: '天/年' },
  { key: 'penalty', label: '违约金/服务期', betterWhen: 'absent', weight: 15 },
  { key: 'noncompete', label: '竞业限制', betterWhen: 'absent', weight: 6 },
  { key: 'startDate', label: '报到日期', betterWhen: 'text' },
  { key: 'replyDeadline', label: '答复期限', betterWhen: 'text' },
]

export interface OfferFieldValue {
  /** 展示用文本 */
  text: string | null
  /** 结构化数值（用于对比与评分） */
  number: number | null
  /** 是否在原文中找到 */
  found: boolean
  /** 命中原文引用 */
  quote: string | null
}

export interface OfferExtraction {
  docId: string
  title: string
  values: Record<string, OfferFieldValue>
  /** 未能识别的字段 */
  missing: string[]
}

function emptyValue(): OfferFieldValue {
  return { text: null, number: null, found: false, quote: null }
}

function find(pattern: RegExp, text: string): RegExpExecArray | null {
  return new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`).exec(text)
}

export function extractOffer(text: string, docId: string, title: string): OfferExtraction {
  const values: Record<string, OfferFieldValue> = {}
  const set = (key: string, value: Partial<OfferFieldValue>) => {
    values[key] = { ...emptyValue(), ...value, found: true }
  }

  const company =
    find(/(?:加入|参加|单位名称|公司名称|甲方)\s*[:：]?\s*([\u4e00-\u9fa5A-Za-z0-9（）()·]{2,24}(?:有限公司|有限责任公司|股份有限公司|集团|公司))/, text) ??
    find(/([\u4e00-\u9fa5A-Za-z0-9（）()·]{2,24}(?:有限公司|有限责任公司|股份有限公司|集团))/, text) ??
    find(/([\u4e00-\u9fa5A-Za-z0-9（）()·]{2,20}(?:公司))/, text)
  if (company) {
    const name = company[1].replace(/^(?:加入|参加)/, '').trim()
    if (name.length >= 4) set('company', { text: name, quote: company[0].trim().slice(0, 60) })
  }

  const position =
    find(/(?:岗位|职位|职务|title|Title)\s*(?:名称|类别)?\s*[:：]\s*([^\n，,。；;：:]{2,20})/, text) ??
    find(/(?:担任|任)\s*([^\n，,。；;：:]{2,20}?)\s*(?:一职|职位|岗位)/, text)
  if (position) {
    const value = position[1].trim()
    if (!/^(?:信息|描述|要求|职责|说明|名称|类别)$/.test(value)) {
      set('position', { text: value, quote: position[0].trim() })
    }
  }

  const salary = find(
    /(?:税前)?(?:月薪|月度工资|月工资|基本工资|月度薪酬)[^0-9一二三四五六七八九十百两]{0,6}([0-9][0-9,\.]*|[一二三四五六七八九十百两]+)\s*(万元|万|w|W|千|k|K|元)?/,
    text,
  )
  if (salary) {
    const amount = parseAmount(`${salary[1]} ${salary[2] ?? ''}`.trim())
    if (amount !== null) set('monthlySalary', { text: `${amount.toLocaleString('zh-CN')} 元/月`, number: amount, quote: salary[0] })
  } else {
    const annual = find(/(?:年包|年薪|年度总包|总包)[^0-9一二三四五六七八九十百两]{0,6}([0-9][0-9,\.]*)\s*(万元|万|w|W|k|K|元)?/, text)
    if (annual) {
      const amount = parseAmount(`${annual[1]} ${annual[2] ?? ''}`.trim())
      if (amount !== null) set('monthlySalary', { text: `${amount.toLocaleString('zh-CN')} 元/年（年包）`, number: Math.round(amount / 12), quote: annual[0] })
    }
  }

  const months = find(
    /(?:(\d{1,2}|[一二三四五六七八九十]+)\s*(?:个)?月(?:薪|工资|薪资))|(?:(\d{1,2})\s*薪)|(?:年(?:度)?终(?:奖)?|奖金)[^。；\n]{0,16}(?:相当于)?\s*(\d{1,2}|[一二三四五六七八九十]+)\s*(?:个)?月/,
    text,
  )
  if (months) {
    const raw = months[1] ?? months[2] ?? months[3]
    const n = /^\d+$/.test(raw ?? '') ? Number(raw) : parseDurationMonths(`${raw} 个月`)
    if (n !== null) set('salaryMonths', { text: `${n} 个月`, number: n, quote: months[0].slice(0, 40) })
  } else if (/年终奖|13\s*薪|十三薪|十四薪|年终双薪/.test(text)) {
    set('salaryMonths', { text: '有年终奖（规则未明确）', number: null, quote: '年终奖' })
  }

  const bonus = find(/(?:年终奖|13\s*薪|十三薪|年终双薪|季度奖|绩效奖金)[^。；\n]{0,40}/, text)
  if (bonus) set('bonus', { text: bonus[0].trim().slice(0, 40), quote: bonus[0].trim().slice(0, 40) })

  const equity = find(/(?:期权|股权|股票|RSU|ESOP)[^。；\n]{0,60}/, text)
  if (equity) set('equity', { text: equity[0].trim().slice(0, 60), quote: equity[0].trim().slice(0, 60) })

  const probation = find(/试用期[^。；]{0,40}/, text)
  if (probation) {
    const m = parseDurationMonths(probation[0])
    if (m !== null) set('probationMonths', { text: `${m} 个月`, number: m, quote: probation[0].trim() })
    else set('probationMonths', { text: probation[0].trim().slice(0, 40), number: null, quote: probation[0].trim() })
  }

  const ratio = find(/试用期[^。；]{0,40}?(\d{1,3})\s*%/, text)
  if (ratio) set('probationRatio', { text: `${ratio[1]}%`, number: Number(ratio[1]), quote: ratio[0].trim() })

  const location = find(/(?:工作地点|办公地点|工作地|base|Base|Base地)[:：]?\s*([^\n，,。；;：:]{2,20})/, text)
  if (location) set('location', { text: location[1].trim(), quote: location[0].trim() })

  const insurance = find(/(?:五险一金|社会保险|社保|公积金)[^。；\n]{0,30}/, text)
  if (insurance) set('socialInsurance', { text: insurance[0].trim().slice(0, 40), quote: insurance[0].trim().slice(0, 40) })

  const leave = find(/(?:年假|年休假|带薪年假)[^。；\n]{0,24}/, text)
  if (leave) {
    const n = /(\d{1,3})\s*(?:天|日)/.exec(leave[0])
    set('annualLeave', { text: n ? `${n[1]} 天/年` : leave[0].trim().slice(0, 40), number: n ? Number(n[1]) : null, quote: leave[0].trim().slice(0, 40) })
  }

  const penalty = find(/(?:违约金|服务期|赔偿培训费用|未满服务期)[^。；\n]{0,50}/, text)
  if (penalty) set('penalty', { text: penalty[0].trim().slice(0, 50), quote: penalty[0].trim().slice(0, 50) })

  const noncompete = find(/竞业(?:限制|禁止)[^。；\n]{0,50}/, text)
  if (noncompete) set('noncompete', { text: noncompete[0].trim().slice(0, 50), quote: noncompete[0].trim().slice(0, 50) })

  const start = find(/(?:入职日期|报到日期|报到时间|入职时间|到岗时间)[:：]?\s*([^\n，,。；;：:]{4,24})/, text)
  if (start) {
    const iso = parseDate(start[1])
    set('startDate', { text: iso ?? start[1].trim(), number: null, quote: start[0].trim() })
  }

  const deadline = find(/(?:请于|于)\s*([^\n，,。；;]{4,20}?)\s*(?:前|之前)[^。；\n]{0,16}(?:回复|答复|确认|签署)/, text)
  if (deadline) set('replyDeadline', { text: deadline[1].trim(), number: null, quote: deadline[0].trim() })

  const missing = OFFER_FIELDS.filter((f) => !values[f.key]?.found).map((f) => f.label)
  return { docId, title, values, missing }
}

export interface ComparisonRow {
  key: string
  label: string
  hint?: string
  betterWhen: BetterWhen
  /** 每一列的展示文本 */
  cells: string[]
  /** 每一列的数值（用于比较） */
  numbers: (number | null)[]
  /** 最优 / 最差列，-1 表示不适用 */
  bestIndex: number
  worstIndex: number
}

export interface OfferComparison {
  columns: { docId: string; title: string }[]
  rows: ComparisonRow[]
  scores: number[]
  ranks: number[]
  advice: string[]
}

export function buildComparison(offers: OfferExtraction[]): OfferComparison {
  const columns = offers.map((o) => ({ docId: o.docId, title: o.title }))
  const rows: ComparisonRow[] = []

  for (const field of OFFER_FIELDS) {
    const cells = offers.map((o) => o.values[field.key]?.text ?? '未识别')
    const numbers = offers.map((o) => o.values[field.key]?.number ?? null)
    const found = offers.map((o) => o.values[field.key]?.found ?? false)
    if (found.every((f) => !f)) continue

    let bestIndex = -1
    let worstIndex = -1
    if (field.betterWhen === 'higher' || field.betterWhen === 'lower') {
      const comparable = numbers.filter((n): n is number => n !== null)
      if (comparable.length >= 2) {
        const best = field.betterWhen === 'higher' ? Math.max(...comparable) : Math.min(...comparable)
        const worst = field.betterWhen === 'higher' ? Math.min(...comparable) : Math.max(...comparable)
        if (best !== worst) {
          bestIndex = numbers.findIndex((n) => n === best)
          worstIndex = numbers.findIndex((n) => n === worst)
        }
      }
    } else if (field.betterWhen === 'present' || field.betterWhen === 'absent') {
      if (found.some(Boolean) && !found.every(Boolean)) {
        const wanted = field.betterWhen === 'present'
        bestIndex = found.findIndex((f) => f === wanted)
        worstIndex = found.findIndex((f) => f !== wanted)
      }
    }

    rows.push({ key: field.key, label: field.label, hint: field.hint, betterWhen: field.betterWhen, cells, numbers, bestIndex, worstIndex })
  }

  const scores = normalizeScores(
    offers.map((offer) => {
      let score = 0
      for (const field of OFFER_FIELDS) {
        const value = offer.values[field.key]
        if (!value?.found) continue
        const weight = field.weight ?? 0
        if (weight === 0) continue
        if (field.betterWhen === 'present') score += weight
        else if (field.betterWhen === 'absent') score -= weight
        else if (value.number !== null) score += (value.number / referenceFor(field.key)) * weight
      }
      return score
    }),
  )

  const ranks = rankScores(scores)
  return { columns, rows, scores, ranks, advice: localAdvice(offers, rows) }
}

function referenceFor(key: string): number {
  switch (key) {
    case 'monthlySalary':
      return 30000
    case 'salaryMonths':
      return 16
    case 'probationMonths':
      return -6
    case 'probationRatio':
      return 100
    case 'annualLeave':
      return 15
    default:
      return 1
  }
}

function normalizeScores(raw: number[]): number[] {
  if (raw.length === 0) return []
  const max = Math.max(...raw, 1)
  return raw.map((v) => Math.round((Math.max(0, v) / max) * 100))
}

function rankScores(scores: number[]): number[] {
  const order = scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s)
  const ranks = new Array(scores.length).fill(0)
  order.forEach((item, idx) => {
    ranks[item.i] = idx + 1
  })
  return ranks
}

/** 本地简评：不依赖任何模型，纯结构化对比得出的结论 */
export function localAdvice(offers: OfferExtraction[], rows: ComparisonRow[]): string[] {
  const advice: string[] = []
  const names = offers.map((o) => o.title)

  const salaryRow = rows.find((r) => r.key === 'monthlySalary')
  if (salaryRow && salaryRow.numbers.some((n) => n !== null)) {
    const max = Math.max(...salaryRow.numbers.filter((n): n is number => n !== null))
    const winners = salaryRow.numbers.map((n, i) => (n === max ? i : -1)).filter((i) => i >= 0)
    advice.push(`月薪最高：${winners.map((i) => names[i]).join('、')}（${max.toLocaleString('zh-CN')} 元/月）`)
  }

  const probationRow = rows.find((r) => r.key === 'probationMonths')
  if (probationRow && probationRow.numbers.some((n) => n !== null)) {
    const valid = probationRow.numbers.filter((n): n is number => n !== null)
    const min = Math.min(...valid)
    const winners = probationRow.numbers.map((n, i) => (n === min ? i : -1)).filter((i) => i >= 0)
    advice.push(`试用期最短：${winners.map((i) => names[i]).join('、')}（${min} 个月）`)
  }

  const penaltyRow = rows.find((r) => r.key === 'penalty')
  if (penaltyRow) {
    const hit = penaltyRow.cells.map((c, i) => (c !== '未识别' ? i : -1)).filter((i) => i >= 0)
    if (hit.length > 0) advice.push(`注意：${hit.map((i) => names[i]).join('、')} 含违约金/服务期绑定条款，需重点核对`)
  }

  for (const offer of offers) {
    const missingCore = ['monthlySalary', 'probationMonths', 'socialInsurance', 'startDate'].filter((k) => !offer.values[k]?.found)
    if (missingCore.length > 0) {
      advice.push(`${offer.title}：未识别到 ${missingCore.map((k) => OFFER_FIELDS.find((f) => f.key === k)?.label ?? k).join('、')}，建议人工核对原件`)
    }
  }

  advice.push('本对比仅基于文本结构化结果，不含主观评价；重大决策请结合个人职业规划判断。')
  return advice
}


