import { describe, expect, it } from 'vitest'
import { classify, CATEGORY_MAP, categoryName } from '../classify'
import { SAMPLE_DOCS } from '../../samples'

const expectations: Record<string, string> = {
  labor: 'labor',
  rent: 'rent',
  'offer-a': 'offer',
  'offer-b': 'offer',
  resignation: 'resignation',
  injury: 'injury',
  house: 'house',
  decoration: 'decoration',
  driving: 'driving',
}

describe('自动分类器', () => {
  it('内置示例都能落到正确场景', () => {
    for (const sample of SAMPLE_DOCS) {
      const result = classify(sample.text.replace(/\r\n/g, '\n'))
      expect(result.category, sample.key).toBe(expectations[sample.key])
      expect(result.confidence).toBeGreaterThan(0.4)
      expect(result.rationale.length).toBeGreaterThan(0)
    }
  })

  it('无法识别的内容归入 other，并给出较低置信度', () => {
    const result = classify('今天天气不错，我们去公园散步吧。')
    expect(result.category).toBe('other')
    expect(result.confidence).toBeLessThanOrEqual(0.3)
  })

  it('每个分类都有可读的元信息与规则包', () => {
    for (const meta of Object.values(CATEGORY_MAP)) {
      expect(meta.name.length).toBeGreaterThan(0)
      expect(meta.rulePack.length).toBeGreaterThan(0)
    }
    expect(categoryName('labor')).toBe('劳动合同')
  })
})
