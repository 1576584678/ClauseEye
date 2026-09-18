/**
 * 扫描件 OCR 的页数规划（纯函数，便于单测）。
 *
 * 背景：早期实现直接按「最多 20 页」截断，超过就要用户自己分批导入。
 * 现在改成「单次最多 120 页 + 每 20 页为一批」，一批结束后让出主线程，
 * 界面能持续刷新进度，长扫描件不必手工拆分。
 */

/** 单次导入的识别上限（再长请拆分文档，避免一次识别几十分钟） */
export const MAX_OCR_PAGES = 120

/** 每批页数：一批结束后让出主线程，UI 才能刷新进度 */
export const OCR_CHUNK_PAGES = 20

export interface OcrPagePlan {
  /** 本次计划识别的页数 */
  pages: number
  /** 是否因超过上限而截断 */
  truncated: boolean
  /** 被遗漏的页数 */
  omitted: number
}

/** 规划要识别的页数：pageCount 非法时按 0 处理 */
export function planOcrPages(pageCount: number, maxPages = MAX_OCR_PAGES): OcrPagePlan {
  const count = Number.isFinite(pageCount) ? Math.max(0, Math.floor(pageCount)) : 0
  const cap = Number.isFinite(maxPages) ? Math.max(0, Math.floor(maxPages)) : 0
  const pages = Math.min(count, cap)
  return { pages, truncated: count > pages, omitted: Math.max(0, count - pages) }
}

/** 是否是这一批的最后一页（用于插入一次「让出主线程」） */
export function isChunkBoundary(pageNo: number, chunk = OCR_CHUNK_PAGES): boolean {
  if (!Number.isFinite(pageNo) || chunk <= 0) return false
  if (pageNo <= 0) return false
  return pageNo % chunk === 0
}
