/** 关键日期抽取：用于"到期 / 续约 / 试用期结束 / 救济期限"本地提醒 */

import { addMonths, cnToNumber, extractTermMonths, parseDate, parseDurationMonths } from './text'
import type { CategoryCode, KeyDate, KeyDateKind } from './types'

interface LabelRule {
  label: string
  pattern: RegExp
}

/** 顺序很重要：越具体的标签越靠前，最后才是泛化的"期限" */
const CONTEXT_LABELS: LabelRule[] = [
  { label: '试用期', pattern: /试用期/ },
  { label: '竞业限制期', pattern: /竞业/ },
  { label: '再次鉴定申请期限', pattern: /再次鉴定|复查鉴定|复核/ },
  { label: '租金支付日', pattern: /租金|房租/ },
  { label: '租赁期限', pattern: /租赁期限|租期/ },
  { label: '离职/解除日期', pattern: /离职|解除|终止/ },
  { label: '入职/报到日期', pattern: /入职|报到|生效/ },
  { label: '答复/确认期限', pattern: /答复|回复|确认/ },
  { label: '付款期限', pattern: /付款|结算|支付|回款/ },
  { label: '工伤认定/申请期限', pattern: /工伤认定|申请/ },
  { label: '合同期限', pattern: /劳动合同期限|合同期限|劳动期限/ },
  { label: '关键日期', pattern: /期限/ },
]

const DATE_TOKEN = '(\\d{4}\\s*[年\\-/.]\\s*\\d{1,2}\\s*[月\\-/.]\\s*\\d{1,2}\\s*日?)'

/** 取包含该偏移量的句子（以。；换行为界），避免跨句误判 */
function sentenceAround(text: string, index: number): string {
  const isDelim = (ch: string) => ch === '。' || ch === '；' || ch === '\n'
  let start = index
  while (start > 0 && !isDelim(text[start - 1]) && index - start < 200) start--
  let end = index
  while (end < text.length && !isDelim(text[end]) && end - index < 200) end++
  return text.slice(start, end)
}

function labelFor(text: string, index: number): string {
  const sentence = sentenceAround(text, index)
  for (const rule of CONTEXT_LABELS) {
    if (rule.pattern.test(sentence)) return rule.label
  }
  const near = text.slice(Math.max(0, index - 16), index + 12)
  for (const rule of CONTEXT_LABELS) {
    if (rule.pattern.test(near)) return rule.label
  }
  return '关键日期'
}

function kindOf(text: string, start: number, end: number): KeyDateKind {
  const tail = text.slice(end, end + 8)
  // 单字「内」需排除「内容/内部/内网」这类词，否则普通日期会被误判成截止日
  if (/^\s*(?:前|之前|截止|以内|之内|内(?![容部网外存勤涵]))/.test(tail)) return 'deadline'
  if (/^\s*(?:止|为止|结束|届满|到期|后终止)/.test(tail)) return 'end'
  if (/^\s*(?:起|开始|生效)/.test(tail)) return 'start'
  const head = text.slice(Math.max(0, start - 6), start)
  if (/自\s*$/.test(head)) return 'start'
  // 「至/到」后面跟的是区间结束日期，语义与「自」相反
  if (/(?:至|到)\s*$/.test(head)) return 'end'
  return 'obligation'
}

function labelWithKind(label: string, kind: KeyDateKind): string {
  if (label === '试用期') {
    if (kind === 'end') return '试用期结束'
    if (kind === 'start') return '试用期开始'
    return '试用期相关时间'
  }
  return label
}

/**
 * 抽取策略（离线、可解释）：
 * 1. "自 X 起至 Y 止"区间 → 起止日期；
 * 2. 单点日期 → 按上下文（前 26 字 + 后 18 字）命名，并按"起/止/前"推断性质；
 * 3. 期限 + 起始日 → 推算到期日（不覆盖原文已有的明确日期）；
 * 4. 相对期限（自收到之日起 15 日内）→ 记录相对表述，提示人工确认。
 */
export function extractKeyDates(text: string, category?: CategoryCode): KeyDate[] {
  const out: KeyDate[] = []
  const consumed: [number, number][] = []
  let termStart: string | null = null
  let termEnd: string | null = null

  const rangeRe = new RegExp(`自\\s*${DATE_TOKEN}\\s*(?:起)?\\s*(?:至|到|—|-)\\s*${DATE_TOKEN}\\s*(?:止|为止)?`)
  const range = rangeRe.exec(text)
  if (range) {
    const start = parseDate(range[1])
    const end = parseDate(range[2])
    const quote = range[0].slice(0, 80)
    const label = labelFor(text, range.index)
    if (start) {
      termStart = start
      out.push({ label: `${label}（开始）`, kind: 'start', date: start, source: quote })
    }
    if (end) {
      termEnd = end
      out.push({ label: `${label}（结束）`, kind: 'end', date: end, source: quote })
    }
    consumed.push([range.index, range.index + range[0].length])
  }

  const dateRe = new RegExp(DATE_TOKEN, 'g')
  let m: RegExpExecArray | null
  while ((m = dateRe.exec(text)) !== null) {
    const start = m.index
    const end = m.index + m[0].length
    if (consumed.some(([s, e]) => start >= s && start < e)) continue
    const iso = parseDate(m[1])
    if (!iso) continue
    const kind = kindOf(text, start, end)
    const label = labelWithKind(labelFor(text, start), kind)
    out.push({ label, kind, date: iso, source: m[0].trim() })
    // 只有明确的起始日才能当作期限起点，否则拿签订日/离职日/届满日去推算会整体偏移
    if (!termStart && kind === 'start') termStart = iso
    if (kind === 'end' && !termEnd) termEnd = iso
  }

  // 推算到期日：仅在原文没有明确结束日期、且文档属于「期限型」合同时
  const termDerivable =
    category === undefined || category === 'labor' || category === 'rent' || category === 'service' || category === 'nda'
  if (termStart && !termEnd && termDerivable) {
    const months = extractTermMonths(text)
    if (months !== null && months > 0) {
      termEnd = addMonths(termStart, months)
      out.push({
        label: '到期日（推算）',
        kind: 'end',
        date: termEnd,
        relativeText: `起始日 + ${months} 个月`,
        source: '按合同期限与起始日推算',
      })
    }
  }

  // 试用期结束日推算：若原文已给出试用期日期则不重复推算
  const probation = /试用期[^。；]{0,40}/.exec(text)
  if (probation) {
    const months = parseDurationMonths(probation[0])
    const hasProbationDate = out.some((item) => item.label.includes('试用期') && item.date)
    if (months !== null && !hasProbationDate) {
      if (termStart) {
        out.push({
          label: '试用期结束（推算）',
          kind: 'end',
          date: addMonths(termStart, months),
          relativeText: `起始日 + ${months} 个月`,
          source: probation[0].slice(0, 60),
        })
      } else {
        out.push({
          label: '试用期时长',
          kind: 'end',
          date: null,
          relativeText: `${months} 个月（需结合入职日推算）`,
          source: probation[0].slice(0, 60),
        })
      }
    }
  }

  // 相对期限：自 X 之日起 N 日内
  const relativeRe = /自[^。；\n]{0,18}之日起\s*(\d{1,3}|[一二三四五六七八九十]+)\s*(个工作日|工作日|日|天)\s*内/g
  while ((m = relativeRe.exec(text)) !== null) {
    const amount = cnToNumber(m[1])
    if (amount === null) continue
    out.push({
      label: labelFor(text, m.index),
      kind: 'deadline',
      date: null,
      relativeText: `自事件发生之日起 ${amount} ${m[2]}内`,
      source: m[0].slice(0, 60),
    })
  }

  // 通知期：提前 N 日通知
  const noticeRe = /提前\s*(\d{1,3}|[一二三四五六七八九十]+)\s*(?:日|天|个工作日)/g
  while ((m = noticeRe.exec(text)) !== null) {
    const amount = cnToNumber(m[1])
    if (amount === null) continue
    out.push({
      label: '通知期',
      kind: 'obligation',
      date: null,
      relativeText: `需提前 ${amount} 天通知`,
      source: m[0].slice(0, 40),
    })
  }

  return dedupe(out).slice(0, 16)
}

function dedupe(items: KeyDate[]): KeyDate[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.label}|${item.date ?? ''}|${item.relativeText ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** 关键词出现但完全没有找到任何日期时，给 UI 的提示 */
export function hasDateSignal(text: string): boolean {
  return /(?:到期|续约|续租|期限|试用期|截止|之前|届满)/.test(text)
}


