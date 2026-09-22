/** DOCX 解析：直接读取 word/document.xml（无外部服务，纯本地） */

import JSZip from 'jszip'
import { normalizeText } from '../core/text'

export interface DocxExtractResult {
  text: string
  warnings: string[]
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': ' ',
}

function decodeXml(value: string): string {
  // 非法码点（如 &#x110000;、&#xD800;）会让 String.fromCodePoint 抛 RangeError，这里降级为原样保留
  const safeCodePoint = (cp: number, raw: string): string =>
    Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff)
      ? String.fromCodePoint(cp)
      : raw
  return value
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#x([0-9a-fA-F]+);/g, (m, hex: string) => safeCodePoint(Number.parseInt(hex, 16), m))
    .replace(/&#(\d+);/g, (m, dec: string) => safeCodePoint(Number(dec), m))
}

function paragraphText(xml: string): string {
  let out = ''
  const tokenRe = /<w:(t|tab|br|cr|noBreakHyphen)\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:\1>)/g
  let m: RegExpExecArray | null
  while ((m = tokenRe.exec(xml)) !== null) {
    switch (m[1]) {
      case 't':
        out += decodeXml(m[2] ?? '')
        break
      case 'tab':
        out += '\t'
        break
      case 'br':
      case 'cr':
        out += '\n'
        break
      case 'noBreakHyphen':
        out += '-'
        break
      default:
        break
    }
  }
  return out
}

export async function extractDocx(data: ArrayBuffer): Promise<DocxExtractResult> {
  const warnings: string[] = []
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(data)
  } catch (error) {
    return {
      text: '',
      warnings: [
        `DOCX 解析失败（${error instanceof Error ? error.message : String(error)}），请确认文件未损坏或加密。可改用「粘贴文本」补录。`,
      ],
    }
  }
  const entries = ['word/document.xml', 'word/header1.xml', 'word/header2.xml', 'word/footer1.xml']
  const paragraphs: string[] = []

  try {
    for (const entry of entries) {
      const file = zip.file(entry)
      if (!file) continue
      const xml = await file.async('string')
      const blockRe = /<w:(p|tbl)\b[^>]*>([\s\S]*?)<\/w:\1>/g
      let m: RegExpExecArray | null
      while ((m = blockRe.exec(xml)) !== null) {
        if (m[1] === 'p') {
          const text = paragraphText(m[2]).trim()
          if (text) paragraphs.push(text)
        } else {
          const rows = m[2].match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g) ?? []
          for (const row of rows) {
            const cells = (row.match(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g) ?? []).map((cell) =>
              paragraphText(cell).replace(/\s+/g, ' ').trim(),
            )
            if (cells.some(Boolean)) paragraphs.push(cells.join(' | '))
          }
        }
      }
      if (paragraphs.length > 0) break
    }
  } catch (error) {
    warnings.push(`DOCX 内容读取中断（${error instanceof Error ? error.message : String(error)}），结果可能不完整。`)
  }

  if (paragraphs.length === 0) warnings.push('DOCX 中未解析到正文段落，可能需要人工核对。')
  return { text: normalizeText(paragraphs.join('\n\n')), warnings }
}
