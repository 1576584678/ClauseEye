/** 纯文本解析：UTF-8 优先，出现乱码时回退 GBK（中文老文档常见） */

export interface PlainExtractResult {
  text: string
  warnings: string[]
}

export function decodeBytes(data: ArrayBuffer): { text: string; encoding: string; warnings: string[] } {
  const warnings: string[] = []
  const utf8 = new TextDecoder('utf-8').decode(data)
  const badRatio = (utf8.match(/\uFFFD/g)?.length ?? 0) / Math.max(1, utf8.length)
  if (badRatio < 0.002) return { text: utf8, encoding: 'utf-8', warnings }

  try {
    const gbk = new TextDecoder('gbk').decode(data)
    const gbkBad = (gbk.match(/\uFFFD/g)?.length ?? 0) / Math.max(1, gbk.length)
    if (gbkBad < badRatio) {
      warnings.push('文件疑似 GBK/GB18030 编码，已按兼容编码解析，请核对文字是否正常。')
      return { text: gbk, encoding: 'gbk', warnings }
    }
  } catch {
    // 浏览器不支持该编码时忽略
  }
  warnings.push('文本解码存在异常字符，建议核对内容完整性。')
  return { text: utf8, encoding: 'utf-8', warnings }
}
