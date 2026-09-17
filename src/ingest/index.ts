/** 导入层：把各种文件格式转成纯文本，之后统一进入分析管线 */

import { normalizeText } from '../core/text'
import type { IngestedDoc } from '../core/types'
import { decodeBytes } from './plain'

const TEXT_EXTENSIONS = /\.(txt|md|markdown|text|log|csv|json)$/i
const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|bmp|tiff?|heic)$/i

export const ACCEPT_ATTR = '.pdf,.docx,.txt,.md,.csv,.json,image/*'

export function isSupportedFile(file: File): boolean {
  if (file.type === 'application/pdf') return true
  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true
  if (file.type.startsWith('text/')) return true
  if (file.type.startsWith('image/')) return true
  return TEXT_EXTENSIONS.test(file.name) || /\.docx$/i.test(file.name)
}

export interface IngestOptions {
  /** 进度提示（OCR 逐页识别时用） */
  onProgress?: (message: string) => void
  /** 关闭 OCR（用于"我只想导入文字版"的场景），默认开启 */
  ocr?: boolean
}

export async function ingestFile(file: File, options: IngestOptions = {}): Promise<IngestedDoc> {
  const base: IngestedDoc = {
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    text: '',
    pageCount: null,
    warnings: [],
  }

  const useOcr = options.ocr !== false
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  const isDocx =
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/i.test(file.name)
  const isImage = file.type.startsWith('image/') || IMAGE_EXTENSIONS.test(file.name)

  if (isPdf) {
    const { extractPdf } = await import('./pdf')
    const buffer = await file.arrayBuffer()
    const result = await extractPdf(buffer)
    if (result.likelyScanned && useOcr) {
      const ocr = await tryOcrPdf(buffer, options)
      if (ocr) return { ...base, text: ocr.text, pageCount: result.pageCount, warnings: ocr.warnings }
    }
    return { ...base, text: result.text, pageCount: result.pageCount, warnings: result.warnings }
  }

  if (isDocx) {
    const { extractDocx } = await import('./docx')
    const result = await extractDocx(await file.arrayBuffer())
    return { ...base, text: result.text, warnings: result.warnings }
  }

  if (isImage) {
    if (!useOcr) {
      return { ...base, warnings: ['已按设置跳过 OCR。可在导入面板重新开启，或使用「粘贴文本」。'] }
    }
    options.onProgress?.('正在识别图片文字…')
    try {
      const { ocrImageFile } = await import('./ocr')
      const result = await ocrImageFile(file)
      return { ...base, text: result.text, pageCount: 1, warnings: result.warnings }
    } catch (error) {
      return {
        ...base,
        warnings: [
          `本地 OCR 不可用（${error instanceof Error ? error.message : String(error)}）。请在导入面板使用「粘贴文本」，或改用桌面版。`,
        ],
      }
    }
  }

  const decoded = decodeBytes(await file.arrayBuffer())
  return { ...base, text: normalizeText(decoded.text), warnings: decoded.warnings }
}

/** 扫描版 PDF 的 OCR 降级路径：失败时不阻断导入，只在 warnings 里说明 */
async function tryOcrPdf(
  buffer: ArrayBuffer,
  options: IngestOptions,
): Promise<{ text: string; warnings: string[] } | null> {
  try {
    const { ocrPdf, ocrAvailable } = await import('./ocr')
    if (!(await ocrAvailable())) return null
    const result = await ocrPdf(buffer, { onProgress: options.onProgress })
    return { text: result.text, warnings: result.warnings }
  } catch (error) {
    options.onProgress?.('')
    return {
      text: '',
      warnings: [
        `扫描件 OCR 失败（${error instanceof Error ? error.message : String(error)}），已按空文本导入，请使用「粘贴文本」补录。`,
      ],
    }
  }
}

export function ingestPastedText(title: string, text: string): IngestedDoc {
  return {
    fileName: `${title || '粘贴文本'}.txt`,
    mimeType: 'text/plain',
    sizeBytes: new TextEncoder().encode(text).length,
    text: normalizeText(text),
    pageCount: null,
    warnings: [],
  }
}
