/** 文本归一化、分句、条款切分、中文数字与金额/期限解析。全部为纯函数，便于单测。 */

import type { ClauseBlock } from './types'

/** PDF 解析时用换页符标记分页，切分条款时据此推断页码 */
export const PAGE_BREAK = '\f'

export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00a0\u2007\u202f\u3000]/g, ' ')
    .replace(/[\u200b-\u200f\ufeff]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 去掉分页符，用于展示 */
export function stripPageBreaks(text: string): string {
  return text.replace(new RegExp(PAGE_BREAK, 'g'), '\n')
}

function pageAt(text: string, offset: number): number | null {
  const head = text.slice(0, offset)
  const count = head.split(PAGE_BREAK).length
  return count > 1 ? count : null
}

const CLAUSE_HEADING = /第\s*[一二三四五六七八九十百千零〇0-9]+\s*条/g

function headingTitle(text: string, start: number): string {
  const lineEnd = text.indexOf('\n', start)
  const end = lineEnd === -1 ? Math.min(text.length, start + 40) : Math.min(lineEnd, start + 40)
  const fragment = text.slice(start, end)
  const stop = fragment.search(/[。；;：:]/)
  return (stop > 0 ? fragment.slice(0, stop) : fragment).trim()
}

/**
 * 条款切分：
 * 1. 优先按「第 X 条」切分（中文合同最常见）；
 * 2. 若不足 2 条，退化为按空行分段；
 * 3. 若仍只有一大段，按句子长度聚合切块。
 * 返回的 start/end 为原文偏移量，UI 直接用其做高亮。
 */
export function splitClauses(text: string): ClauseBlock[] {
  const blocks: ClauseBlock[] = []
  const starts: number[] = []
  CLAUSE_HEADING.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = CLAUSE_HEADING.exec(text)) !== null) starts.push(m.index)

  if (starts.length >= 2) {
    for (let i = 0; i < starts.length; i++) {
      const start = starts[i]
      const end = i + 1 < starts.length ? starts[i + 1] : text.length
      blocks.push(makeBlock(blocks.length, text, start, end, headingTitle(text, start)))
    }
    return blocks
  }

  const paragraphs = text.split(/\n{2,}/)
  if (paragraphs.length >= 2) {
    let cursor = 0
    for (const para of paragraphs) {
      const start = text.indexOf(para, cursor)
      const safeStart = start === -1 ? cursor : start
      cursor = safeStart + para.length
      if (para.trim()) {
        blocks.push(makeBlock(blocks.length, text, safeStart, cursor, firstLine(para)))
      }
    }
    return blocks
  }

  // 长文兜底：按句子聚合到 ~320 字/块
  const TARGET = 320
  let cursor = 0
  let blockStart = 0
  const sentenceRe = /[^。！？；\n]*[。！？；\n]/g
  let s: RegExpExecArray | null
  while ((s = sentenceRe.exec(text)) !== null) {
    cursor = s.index + s[0].length
    if (cursor - blockStart >= TARGET) {
      blocks.push(makeBlock(blocks.length, text, blockStart, cursor, ''))
      blockStart = cursor
    }
  }
  if (blockStart < text.length) {
    blocks.push(makeBlock(blocks.length, text, blockStart, text.length, ''))
  }
  return blocks.filter((b) => b.text.trim().length > 0)
}

function firstLine(para: string): string {
  const line = para.split('\n')[0].trim()
  return line.length > 30 ? line.slice(0, 30) + '…' : line
}

function makeBlock(index: number, text: string, start: number, end: number, title: string): ClauseBlock {
  return {
    index,
    page: pageAt(text, start),
    title: title || `片段 ${index + 1}`,
    text: text.slice(start, end),
    start,
    end,
  }
}

/**
 * 以命中位置为中心截取原文引用。结果一定是原文的精确子串（可被高亮定位）。
 */
export function quoteAround(text: string, start: number, end: number, radius = 46): string {
  const bounds = expandToSentence(text, start, end, radius)
  return text.slice(bounds.start, bounds.end).trim()
}

function isDelimiter(ch: string): boolean {
  return /[。！？；;\n]/.test(ch)
}

/** 把 [start,end) 扩展到不超过 radius 的句子边界窗口内 */
export function expandToSentence(
  text: string,
  start: number,
  end: number,
  radius = 46,
): { start: number; end: number } {
  let left = Math.max(0, start - radius)
  for (let i = start; i > left; i--) {
    if (isDelimiter(text[i - 1])) {
      left = i
      break
    }
  }
  let right = Math.min(text.length, end + radius)
  for (let i = end; i < right; i++) {
    if (isDelimiter(text[i])) {
      right = i + 1
      break
    }
  }
  return { start: left, end: right }
}

/** 找到包含给定偏移量的条款块 */
export function clauseAt(clauses: ClauseBlock[], offset: number): number | null {
  for (const c of clauses) {
    if (offset >= c.start && offset < c.end) return c.index
  }
  return null
}

const CN_DIGITS: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}

/** 中文数字 → 阿拉伯数字（支持 三十六 / 十五 / 一百二十 这类写法） */
export function cnToNumber(input: string): number | null {
  const s = input.trim().replace(/,/g, '')
  if (!s) return null
  if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s)
  if (s === '半') return 0.5
  let total = 0
  let current = 0
  let touched = false
  for (const ch of s) {
    if (ch === '十') {
      total += (current === 0 ? 1 : current) * 10
      current = 0
      touched = true
    } else if (ch === '百') {
      total += (current === 0 ? 1 : current) * 100
      current = 0
      touched = true
    } else if (CN_DIGITS[ch] !== undefined) {
      current = CN_DIGITS[ch]
      touched = true
    } else {
      return null
    }
  }
  if (!touched) return null
  return total + current
}

const NUM = '(\\d[\\d,]*(?:\\.\\d+)?|[一二三四五六七八九十百两]+|半)'

/** 解析金额：8000 元 / 1.2 万元 / 25k / 3w */
export function parseAmount(input: string): number | null {
  const m = new RegExp(`${NUM}\\s*(万元|万|w|W|千元|千|k|K|元|块)?`).exec(input)
  if (!m) return null
  const value = cnToNumber(m[1])
  if (value === null) return null
  const unit = m[2] ?? ''
  const multiplier = /万|w|W/.test(unit) ? 10000 : /千|k|K/.test(unit) ? 1000 : 1
  return value * multiplier
}

/**
 * 解析期限为「月」：3 个月 / 三个月 / 半年 / 2 年 / 一年半。
 * 注意：会排除日期中的"2026年""3月1日"这类写法，避免把日期误读成期限。
 */
export function parseDurationMonths(input: string): number | null {
  if (/(?:一|1)\s*年半/.test(input)) return 18
  if (/(?:一|1)?\s*半\s*年/.test(input)) return 6

  const years = /(?<![\d])(\d{1,2}|[一二三四五六七八九十百两]+)\s*年(?![\d月日])/.exec(input)
  if (years) {
    const v = cnToNumber(years[1])
    if (v !== null) return v * 12
  }
  const months = /(?<![\d年])(\d{1,3}|[一二三四五六七八九十两]+|半)\s*个?\s*月(?![\d日])/.exec(input)
  if (months) {
    const v = cnToNumber(months[1])
    if (v !== null) return v
  }
  return null
}

/** 两个日期之间的月数（向上取整到月） */
export function monthsBetween(startIso: string, endIso: string): number | null {
  const start = new Date(`${startIso}T00:00:00`)
  const end = new Date(`${endIso}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  return end.getDate() > start.getDate() ? months + 1 : months
}

/** 从文本中推断合同/租赁期限（月）：优先"自X起至Y止"，其次"期限 X 个月" */
export function extractTermMonths(text: string): number | null {
  const range =
    /自\s*(\d{4}\s*[年\-/.]\s*\d{1,2}\s*[月\-/.]\s*\d{1,2}\s*日?)\s*(?:起)?\s*(?:至|到|—|-)\s*(\d{4}\s*[年\-/.]\s*\d{1,2}\s*[月\-/.]\s*\d{1,2}\s*日?)/.exec(
      text,
    )
  if (range) {
    const start = parseDate(range[1])
    const end = parseDate(range[2])
    if (start && end) {
      const months = monthsBetween(start, end)
      if (months !== null && months > 0) return months
    }
  }
  const term = /(?:合同期限|劳动合同期限|租赁期限|租期|有效期限?)[^。；\n]{0,24}/.exec(text)
  if (term && !/竞业/.test(term[0])) return parseDurationMonths(term[0])
  return null
}

/** 劳动合同法第 19 条：试用期上限随合同期限变化 */
export function legalProbationCapMonths(termMonths: number | null): number {
  if (termMonths === null) return 6
  if (termMonths < 3) return 0
  if (termMonths < 12) return 1
  if (termMonths < 36) return 2
  return 6
}

const DATE_PATTERNS: RegExp[] = [
  /(\d{4})\s*[年\-/.]\s*(\d{1,2})\s*[月\-/.]\s*(\d{1,2})\s*日?/,
  /[二两]零[一二三四五六七八九十〇\d]{2}\s*年\s*[一二三四五六七八九十]{1,3}\s*月\s*[一二三四五六七八九十]{1,3}\s*日?/,
]

/** 从文本片段中抽取绝对日期（返回 YYYY-MM-DD） */
export function parseDate(input: string): string | null {
  const plain = DATE_PATTERNS[0].exec(input)
  if (plain) return toIso(Number(plain[1]), Number(plain[2]), Number(plain[3]))

  const cn = DATE_PATTERNS[1].exec(input)
  if (cn) {
    const raw = cn[0].replace(/\s/g, '')
    const [y, rest] = raw.split('年')
    const [mo, d] = rest.split('月')
    const year = cnDigitsToInt(y)
    const month = cnToNumber(mo)
    const day = cnToNumber((d ?? '').replace('日', ''))
    if (year !== null && month !== null) return toIso(year, month, day ?? 1)
  }
  return null
}

function cnDigitsToInt(s: string): number | null {
  // 二零二六 → 2026
  let out = ''
  for (const ch of s) {
    if (/\d/.test(ch)) out += ch
    else if (CN_DIGITS[ch] !== undefined) out += String(CN_DIGITS[ch])
    else if (ch === '〇') out += '0'
    else return null
  }
  return out ? Number(out) : null
}

function toIso(y: number, m: number, d: number): string | null {
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null
  const mm = String(m).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00`)
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  if (d.getDate() < day) d.setDate(0)
  return toIsoLocal(d)
}

export function toIsoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayIso(): string {
  return toIsoLocal(new Date())
}

export function formatAmountCny(value: number): string {
  if (value >= 10000) {
    const w = value / 10000
    return `${trimZero(w)} 万元`
  }
  return `${value.toLocaleString('zh-CN')} 元`
}

function trimZero(n: number): string {
  return String(Math.round(n * 100) / 100)
}



