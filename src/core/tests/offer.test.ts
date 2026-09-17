import { describe, expect, it } from 'vitest'
import { buildComparison, extractOffer, OFFER_FIELDS } from '../offer'
import { normalizeText } from '../text'
import { SAMPLE_DOCS } from '../../samples'

function offerText(key: string): string {
  const sample = SAMPLE_DOCS.find((s) => s.key === key)
  if (!sample) throw new Error(`缺少示例 ${key}`)
  return normalizeText(sample.text.replace(/\r\n/g, '\n'))
}

const offerA = extractOffer(offerText('offer-a'), 'a', 'Offer A')
const offerB = extractOffer(offerText('offer-b'), 'b', 'Offer B')

describe('Offer 结构化抽取', () => {
  it('抽取公司、岗位、月薪与试用期', () => {
    expect(offerA.values.company?.text).toBe('星辰互联科技（北京）有限公司')
    expect(offerA.values.position?.text).toBe('后端开发工程师（P6）')
    expect(offerA.values.monthlySalary?.number).toBe(32000)
    expect(offerA.values.probationMonths?.number).toBe(3)
    expect(offerA.values.probationRatio?.number).toBe(90)
    expect(offerA.values.salaryMonths?.number).toBe(15)
  })

  it('抽取 Offer B 的 RSU 与更长试用期', () => {
    expect(offerB.values.company?.text).toBe('云端智能集团有限公司')
    expect(offerB.values.position?.text).toBe('资深算法工程师')
    expect(offerB.values.monthlySalary?.number).toBe(38000)
    expect(offerB.values.probationMonths?.number).toBe(6)
    expect(offerB.values.equity?.text).toContain('RSU')
    expect(offerB.values.annualLeave?.number).toBe(15)
  })

  it('未出现的字段会进入 missing 列表而不是被编造', () => {
    expect(offerB.values.penalty?.found ?? false).toBe(false)
    expect(offerB.missing).toContain('违约金/服务期')
  })

  it('字段定义包含对比方向与权重', () => {
    const salary = OFFER_FIELDS.find((f) => f.key === 'monthlySalary')
    expect(salary?.betterWhen).toBe('higher')
    const probation = OFFER_FIELDS.find((f) => f.key === 'probationMonths')
    expect(probation?.betterWhen).toBe('lower')
    const penalty = OFFER_FIELDS.find((f) => f.key === 'penalty')
    expect(penalty?.betterWhen).toBe('absent')
  })
})

describe('多 Offer 对比矩阵', () => {
  const comparison = buildComparison([offerA, offerB])

  it('高亮更优与更差的列', () => {
    const salary = comparison.rows.find((r) => r.key === 'monthlySalary')
    expect(salary?.bestIndex).toBe(1)
    expect(salary?.worstIndex).toBe(0)

    const probation = comparison.rows.find((r) => r.key === 'probationMonths')
    expect(probation?.bestIndex).toBe(0)

    const penalty = comparison.rows.find((r) => r.key === 'penalty')
    expect(penalty?.bestIndex).toBe(1)
  })

  it('给出综合评分与排名', () => {
    expect(comparison.scores).toHaveLength(2)
    expect(comparison.ranks[1]).toBe(1)
    expect(comparison.scores[1]).toBeGreaterThan(comparison.scores[0])
  })

  it('本地简评包含关键结论', () => {
    const advice = comparison.advice.join('\n')
    expect(advice).toContain('月薪最高：Offer B')
    expect(advice).toContain('违约金')
  })

  it('列与行信息完整', () => {
    expect(comparison.columns.map((c) => c.title)).toEqual(['Offer A', 'Offer B'])
    expect(comparison.rows.length).toBeGreaterThan(5)
    for (const row of comparison.rows) {
      expect(row.cells).toHaveLength(2)
    }
  })
})
