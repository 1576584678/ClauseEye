import { describe, expect, it } from 'vitest'
import {
  cnToNumber,
  extractTermMonths,
  legalProbationCapMonths,
  monthsBetween,
  parseAmount,
  parseDate,
  parseDurationMonths,
  quoteAround,
  splitClauses,
  normalizeText,
} from '../text'
import labor from '../../../samples/labor-contract.txt?raw'

describe('中文数字与金额解析', () => {
  it('解析中文数字', () => {
    expect(cnToNumber('十')).toBe(10)
    expect(cnToNumber('十五')).toBe(15)
    expect(cnToNumber('三十六')).toBe(36)
    expect(cnToNumber('一百二十')).toBe(120)
    expect(cnToNumber('半')).toBe(0.5)
    expect(cnToNumber('2026')).toBe(2026)
    expect(cnToNumber('幺')).toBeNull()
  })

  it('解析金额', () => {
    expect(parseAmount('8000元')).toBe(8000)
    expect(parseAmount('8,000 元')).toBe(8000)
    expect(parseAmount('1.2万元')).toBe(12000)
    expect(parseAmount('25k')).toBe(25000)
    expect(parseAmount('3w')).toBe(30000)
  })
})

describe('期限解析（不得把日期误读为期限）', () => {
  it('识别常见期限写法', () => {
    expect(parseDurationMonths('试用期为 6 个月')).toBe(6)
    expect(parseDurationMonths('3 年以上固定期限')).toBe(36)
    expect(parseDurationMonths('半年')).toBe(6)
    expect(parseDurationMonths('一年半')).toBe(18)
  })

  it('不会把合同起止日期读成期限', () => {
    expect(parseDurationMonths('自 2026年3月1日 起至 2026年8月31日 止')).toBeNull()
    expect(parseDurationMonths('自 2026年3月1日 起至 2028年2月29日 止')).toBeNull()
  })

  it('推算合同期限与试用期上限', () => {
    expect(monthsBetween('2026-03-01', '2028-02-29')).toBe(24)
    const text = normalizeText(labor.replace(/\r\n/g, '\n'))
    expect(extractTermMonths(text)).toBe(24)
    expect(legalProbationCapMonths(24)).toBe(2)
    expect(legalProbationCapMonths(48)).toBe(6)
    expect(legalProbationCapMonths(6)).toBe(1)
    expect(legalProbationCapMonths(2)).toBe(0)
  })
})

describe('日期解析', () => {
  it('支持阿拉伯数字与中文数字写法', () => {
    expect(parseDate('2026年3月1日')).toBe('2026-03-01')
    expect(parseDate('2026-03-01')).toBe('2026-03-01')
    expect(parseDate('二零二六年三月一日')).toBe('2026-03-01')
    expect(parseDate('2026年13月1日')).toBeNull()
  })
})

describe('条款切分与引用定位', () => {
  const text = normalizeText(`第一条 合同期限
本合同自 2026年3月1日 起生效。

第二条 试用期
试用期 6 个月。`)

  it('按“第 X 条”切分且偏移量可以还原原文', () => {
    const clauses = splitClauses(text)
    expect(clauses.length).toBe(2)
    for (const clause of clauses) {
      expect(text.slice(clause.start, clause.end)).toBe(clause.text)
    }
    expect(clauses[0].title).toContain('合同期限')
  })

  it('quoteAround 返回的引用一定是原文的精确子串', () => {
    const index = text.indexOf('试用期 6 个月')
    const quote = quoteAround(text, index, index + 5)
    expect(text.includes(quote)).toBe(true)
    expect(quote).toContain('试用期')
  })
})

