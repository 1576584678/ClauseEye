/**
 * 内置示例文档：用于零配置体验"导入 → 分类 → 坑点清单 / 多 Offer 对比"完整链路。
 * 内容为虚构的示例合同，仅用于演示，不代表真实法律意见。
 */

import injuryReport from '../../samples/injury-report.txt?raw'
import laborContract from '../../samples/labor-contract.txt?raw'
import offerA from '../../samples/offer-a.txt?raw'
import offerB from '../../samples/offer-b.txt?raw'
import rentContract from '../../samples/rent-contract.txt?raw'
import resignation from '../../samples/resignation.txt?raw'

export interface SampleDoc {
  key: string
  title: string
  fileName: string
  text: string
  hint: string
}

export const SAMPLE_DOCS: SampleDoc[] = [
  {
    key: 'labor',
    title: '示例 · 劳动合同（含多个坑点）',
    fileName: '示例-劳动合同.txt',
    text: laborContract,
    hint: '试用期 6 个月、试用期不缴社保、离职违约金、竞业无补偿、自动续签',
  },
  {
    key: 'rent',
    title: '示例 · 租房合同（霸王条款集中）',
    fileName: '示例-租房合同.txt',
    text: rentContract,
    hint: '押金不退、自动续租、单方涨租、房东随时进入、维修全归租客',
  },
  {
    key: 'offer-a',
    title: '示例 · Offer A（星辰互联）',
    fileName: '示例-OfferA.txt',
    text: offerA,
    hint: '月薪 32k · 15 薪 · 3 个月试用期 · 含违约金',
  },
  {
    key: 'offer-b',
    title: '示例 · Offer B（云端智能）',
    fileName: '示例-OfferB.txt',
    text: offerB,
    hint: '月薪 38k · 14 薪 · 6 个月试用期 · 含 RSU',
  },
  {
    key: 'resignation',
    title: '示例 · 离职证明（要素缺失）',
    fileName: '示例-离职证明.txt',
    text: resignation,
    hint: '个人原因离职、含辞退表述、"双方再无争议"、缺在职年限',
  },
  {
    key: 'injury',
    title: '示例 · 工伤鉴定结论',
    fileName: '示例-工伤鉴定.txt',
    text: injuryReport,
    hint: '结论含糊（"建议评定"）、未提再次鉴定期限',
  },
]

export function findSample(key: string): SampleDoc | undefined {
  return SAMPLE_DOCS.find((s) => s.key === key)
}
