/** PDF 文本层解析（pdfjs-dist，纯本地运行，不上传任何内容） */

import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PAGE_BREAK, normalizeText } from '../core/text'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export interface PdfExtractResult {
  text: string
  pageCount: number
  warnings: string[]
  /** 疑似扫描件：页面几乎没有文字层 */
  likelyScanned: boolean
}

const LATIN = /[A-Za-z0-9]$/
const CJK = /[\u3400-\u9fff]/

export async function extractPdf(data: ArrayBuffer): Promise<PdfExtractResult> {
  const warnings: string[] = []
  const task = pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: true })
  const pages: string[] = []
  let emptyPages = 0
  let pageCount = 0

  try {
    const doc = await task.promise
    pageCount = doc.numPages
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
      const page = await doc.getPage(pageNo)
      const content = await page.getTextContent()
      let pageText = ''
      let previous = ''
      for (const item of content.items) {
        if (!('str' in item)) continue
        const str = item.str
        if (str) {
          const needsSpace = previous && LATIN.test(previous) && /^[A-Za-z0-9]/.test(str) && !CJK.test(str)
          pageText += needsSpace ? ` ${str}` : str
          previous = str.slice(-1)
        }
        if (item.hasEOL) pageText += '\n'
      }
      if (pageText.trim().length === 0) emptyPages += 1
      pages.push(pageText)
    }
  } catch (error) {
    // 解析失败不能把异常直接抛给调用方：给出可读提示，同时仍释放 worker
    warnings.push(
      `PDF 解析失败（${error instanceof Error ? error.message : String(error)}），文件可能已损坏或加密。可改用「粘贴文本」补录。`,
    )
  } finally {
    await task.destroy()
  }

  const likelyScanned = pageCount > 0 && (emptyPages === pageCount || emptyPages / pageCount > 0.5)
  if (likelyScanned) {
    warnings.push(
      'PDF 几乎没有可提取的文字层（疑似扫描件/图片版），将尝试用本地 OCR 识别；若识别结果为空，请在详情页使用「粘贴文本」补录。',
    )
  } else if (emptyPages > 0) {
    warnings.push(`有 ${emptyPages} 页未提取到文字（可能是图片页），关键页建议人工核对。`)
  }

  return {
    text: normalizeText(pages.join(`\n${PAGE_BREAK}\n`)),
    pageCount,
    warnings,
    likelyScanned,
  }
}


