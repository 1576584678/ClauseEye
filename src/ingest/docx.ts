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
  return value
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
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
  const zip = await JSZip.loadAsync(data)
  const entries = ['word/document.xml', 'word/header1.xml', 'word/header2.xml', 'word/footer1.xml']
  const paragraphs: string[] = []

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

  if (paragraphs.length === 0) warnings.push('DOCX 中未解析到正文段落，可能需要人工核对。')
  return { text: normalizeText(paragraphs.join('\n\n')), warnings }
}
