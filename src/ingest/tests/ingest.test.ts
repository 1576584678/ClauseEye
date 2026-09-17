import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { isSupportedFile, ingestPastedText } from '../index'
import { decodeBytes } from '../plain'
import { extractDocx } from '../docx'

/** 构造一个最小的 .docx：包含两段正文 + 一张表格 */
async function buildDocx(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
  <w:p><w:r><w:t>劳动合同</w:t></w:r></w:p>
  <w:p><w:r><w:t>试用期为 3 个月&amp;工资 12000 元</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>转正后 15000 元</w:t></w:r></w:p>
  <w:tbl>
    <w:tr><w:tc><w:p><w:r><w:t>岗位</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>后端工程师</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>工作地</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>北京</w:t></w:r></w:p></w:tc></w:tr>
  </w:tbl>
</w:body></w:document>`,
  )
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types/>')
  const bytes = await zip.generateAsync({ type: 'arraybuffer' })
  return bytes as ArrayBuffer
}

describe('DOCX 解析', () => {
  it('提取段落与表格内容，并还原实体与制表符', async () => {
    const result = await extractDocx(await buildDocx())
    expect(result.text).toContain('劳动合同')
    expect(result.text).toContain('试用期为 3 个月&工资 12000 元')
    expect(result.text).toContain('岗位 | 后端工程师')
    expect(result.text).toContain('工作地 | 北京')
    expect(result.warnings).toHaveLength(0)
  })

  it('空文档给出降级提示而不是抛错', async () => {
    const zip = new JSZip()
    zip.file('word/document.xml', '<w:document><w:body></w:body></w:document>')
    const result = await extractDocx((await zip.generateAsync({ type: 'arraybuffer' })) as ArrayBuffer)
    expect(result.text).toBe('')
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})

describe('纯文本解码', () => {
  it('优先按 UTF-8 解码中文', () => {
    const bytes = new TextEncoder().encode('试用期 3 个月，工资 12000 元')
    const decoded = decodeBytes(bytes.buffer as ArrayBuffer)
    expect(decoded.encoding).toBe('utf-8')
    expect(decoded.text).toContain('试用期 3 个月')
    expect(decoded.warnings).toHaveLength(0)
  })

  it('UTF-8 乱码时回退 GBK', () => {
    // “合同” 的 GBK 编码为 BA CF CD AC
    const gbk = new Uint8Array([0xba, 0xcf, 0xcd, 0xac])
    const decoded = decodeBytes(gbk.buffer as ArrayBuffer)
    expect(decoded.text).toContain('合同')
  })
})

describe('导入入口', () => {
  it('识别常见可导入文件', () => {
    expect(isSupportedFile(new File(['x'], 'a.pdf', { type: 'application/pdf' }))).toBe(true)
    expect(isSupportedFile(new File(['x'], 'b.txt', { type: 'text/plain' }))).toBe(true)
    expect(
      isSupportedFile(
        new File(['x'], 'c.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      ),
    ).toBe(true)
    expect(isSupportedFile(new File(['x'], 'd.png', { type: 'image/png' }))).toBe(true)
    expect(isSupportedFile(new File(['x'], 'e.exe', { type: 'application/octet-stream' }))).toBe(false)
  })

  it('粘贴文本会做归一化并带上文件元信息', () => {
    const doc = ingestPastedText('我的合同', '第一行\r\n\r\n\r\n第二行\u3000带全角空格')
    expect(doc.fileName).toBe('我的合同.txt')
    expect(doc.mimeType).toBe('text/plain')
    expect(doc.text).toBe('第一行\n\n第二行 带全角空格')
    expect(doc.sizeBytes).toBeGreaterThan(0)
  })
})
