/**
 * 本地 OCR（渲染进程侧）：把图片 / 扫描版 PDF 光栅化后交给主进程的 tesseract.js 识别
 *
 * 分工：
 * - 渲染进程负责"渲染"（PDF 页 → canvas → PNG dataURL，图片则先按需缩放）；
 * - 主进程负责"识别"（离线 WASM 引擎 + 随包分发的语言包）。
 *
 * 全程不联网；若运行在没有桌面壳的浏览器里，会返回明确的能力不可用提示。
 */

import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PAGE_BREAK, normalizeText } from '../core/text'
import { ocrBridge } from '../desktop/bridge'

/** 中文（简体）+ 英文：足够覆盖国内合同与证明文书 */
export const OCR_LANGS = ['chi_sim', 'eng']

/** 单次导入最多识别多少页，避免一份 200 页 PDF 卡住界面 */
export const MAX_OCR_PAGES = 20

/** 光栅化时图片的最长边（像素）。太小影响识别率，太大拖慢速度 */
const MAX_RENDER_SIDE = 2200

export interface OcrOutcome {
  text: string
  pageImages: number
  /** 平均置信度（0~100），无结果时为 0 */
  confidence: number
  warnings: string[]
}

export function ocrAvailable(): Promise<boolean> {
  return ocrBridge.available()
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function drawScaled(source: CanvasImageSource, sourceWidth: number, sourceHeight: number): HTMLCanvasElement {
  const scale = Math.min(1, MAX_RENDER_SIDE / Math.max(sourceWidth, sourceHeight))
  const canvas = createCanvas(Math.max(1, Math.round(sourceWidth * scale)), Math.max(1, Math.round(sourceHeight * scale)))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建绘图上下文')
  // 白底：扫描件常带透明区域，纯黑底会让识别率骤降
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

async function recognizeCanvas(canvas: HTMLCanvasElement): Promise<{ text: string; confidence: number }> {
  const dataUrl = canvas.toDataURL('image/png')
  const result = await ocrBridge.recognize(dataUrl, OCR_LANGS)
  if (!result.ok) throw new Error(result.error || 'OCR 识别失败')
  return { text: result.text ?? '', confidence: result.confidence ?? 0 }
}

/** 识别一张图片文件 */
export async function ocrImageFile(file: Blob): Promise<OcrOutcome> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = drawScaled(bitmap, bitmap.width, bitmap.height)
    const { text, confidence } = await recognizeCanvas(canvas)
    const normalized = normalizeText(text)
    return {
      text: normalized,
      pageImages: 1,
      confidence,
      warnings: normalized.trim()
        ? [`已用本地 OCR 识别（置信度 ${Math.round(confidence)}%），识别结果可能有误差，关键数字请人工核对。`]
        : ['OCR 未识别出任何文字，请确认图片清晰度或改用「粘贴文本」。'],
    }
  } finally {
    bitmap.close()
  }
}

/** 识别扫描版 PDF：逐页光栅化后识别 */
export async function ocrPdf(
  data: ArrayBuffer,
  options: { onProgress?: (message: string) => void } = {},
): Promise<OcrOutcome> {
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const task = pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: true })
  const doc = await task.promise
  const pageCount = doc.numPages
  const limit = Math.min(pageCount, MAX_OCR_PAGES)
  const pages: string[] = []
  const confidences: number[] = []

  try {
    for (let pageNo = 1; pageNo <= limit; pageNo++) {
      options.onProgress?.(`OCR 识别中… 第 ${pageNo}/${limit} 页`)
      const page = await doc.getPage(pageNo)
      const viewport = page.getViewport({ scale: 1 })
      const scale = Math.min(3, MAX_RENDER_SIDE / Math.max(viewport.width, viewport.height))
      const scaledViewport = page.getViewport({ scale: Math.max(1.2, scale) })
      const canvas = createCanvas(Math.round(scaledViewport.width), Math.round(scaledViewport.height))
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('无法创建绘图上下文')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: ctx, viewport: scaledViewport }).promise
      const { text, confidence } = await recognizeCanvas(canvas)
      pages.push(text)
      confidences.push(confidence)
    }
  } finally {
    await task.destroy()
  }

  const average = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0
  const warnings: string[] = [
    `已用本地 OCR 识别扫描件（平均置信度 ${Math.round(average)}%），关键数字与期限请人工复核。`,
  ]
  if (pageCount > limit) warnings.push(`为避免长时间占用，本次只识别了前 ${limit} 页（共 ${pageCount} 页）。`)

  return {
    text: normalizeText(pages.join(`\n${PAGE_BREAK}\n`)),
    pageImages: limit,
    confidence: average,
    warnings,
  }
}
