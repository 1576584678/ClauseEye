import { describe, expect, it } from 'vitest'
import { MAX_OCR_PAGES, OCR_CHUNK_PAGES, isChunkBoundary, planOcrPages } from '../ocrPlan'

describe('扫描件 OCR 页数规划', () => {
  it('短文档按实际页数识别', () => {
    expect(planOcrPages(1)).toEqual({ pages: 1, truncated: false, omitted: 0 })
    expect(planOcrPages(20)).toEqual({ pages: 20, truncated: false, omitted: 0 })
  })

  it('超过上限时截断并给出遗漏页数', () => {
    const plan = planOcrPages(MAX_OCR_PAGES + 30)
    expect(plan.pages).toBe(MAX_OCR_PAGES)
    expect(plan.truncated).toBe(true)
    expect(plan.omitted).toBe(30)
  })

  it('上限远大于过去的 20 页，长扫描件不必手工拆分', () => {
    expect(MAX_OCR_PAGES).toBeGreaterThanOrEqual(100)
    expect(planOcrPages(80).truncated).toBe(false)
  })

  it('非法页数按 0 处理，不会算出负数或 NaN', () => {
    expect(planOcrPages(Number.NaN).pages).toBe(0)
    expect(planOcrPages(-5)).toEqual({ pages: 0, truncated: false, omitted: 0 })
    expect(planOcrPages(10, 0).pages).toBe(0)
    expect(planOcrPages(10, 0).truncated).toBe(true)
  })

  it('按批让出主线程：批边界每隔固定页数出现一次', () => {
    expect(OCR_CHUNK_PAGES).toBeGreaterThan(1)
    expect(isChunkBoundary(OCR_CHUNK_PAGES)).toBe(true)
    expect(isChunkBoundary(OCR_CHUNK_PAGES + 1)).toBe(false)
    expect(isChunkBoundary(0)).toBe(false)
    expect(isChunkBoundary(5, 0)).toBe(false)
  })
})
