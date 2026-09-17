/** 工伤鉴定 / 劳动能力鉴定 · 种子规则包 v0.1 */

import { findMatches, wholeDocMatch, type Rule } from './engine'

export const INJURY_RULES: Rule[] = [
  {
    id: 'injury.grade-missing',
    title: '未载明伤残等级',
    pack: 'injury',
    severity: 'high',
    legalBasis: '《工伤保险条例》第 21—25 条：劳动能力鉴定结论应载明伤残等级与生活自理障碍程度。',
    reason: '没有明确伤残等级的鉴定文书，无法核算一次性伤残补助金、伤残津贴等待遇，后续理赔会被卡住。',
    suggestion: '向出具机构核对完整鉴定结论正文；如为复印件，要求提供含"鉴定结论"页的完整版本。',
    maxMatches: 1,
    detect(ctx) {
      const hasGrade = /(?:伤残等级|伤残情况|劳动功能障碍|生活自理障碍|致残程度|评定为|等级为)[^。；\n]{0,20}/.test(ctx.text)
      if (hasGrade) return []
      return [wholeDocMatch(ctx, { reason: '文档中未找到"伤残等级/劳动功能障碍程度"等结论性表述，可能只是鉴定受理或认定材料。' })]
    },
  },
  {
    id: 'injury.waive-future-claims',
    title: '"一次性了结/放弃后续主张"',
    pack: 'injury',
    severity: 'high',
    legalBasis: '《民法典》第 151 条（显失公平）、第 1179 条（人身损害赔偿范围）。',
    reason: '工伤待遇法律有明确标准，签署"一次性了结、放弃后续治疗费与赔偿请求"往往远低于法定标准。',
    suggestion: '对照法定标准逐项核算（医疗费、停工留薪期工资、一次性伤残补助金、就业补助金等）后再决定，必要时先做伤残等级鉴定。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:(?:一次性)[^。；\n]{0,16}(?:了结|结清|解决|赔付|补偿))|(?:(?:放弃|不再)[^。；\n]{0,16}(?:后续|一切|其他|其他任何)?[^。；\n]{0,10}(?:权利|请求|主张|赔偿|补偿|治疗费))/g,
      )
    },
  },
  {
    id: 'injury.ambiguous-conclusion',
    title: '结论表述含糊',
    pack: 'injury',
    severity: 'low',
    reason: '"建议评定为""初步考虑"等表述不是正式鉴定结论，不能作为理赔依据。',
    suggestion: '要求出具机构以"鉴定结论：xxx"的正式格式确认等级与护理依赖程度。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:(?:建议|倾向|考虑)[^。；\n]{0,16}(?:认定|评定|鉴定|按))|(?:(?:初步|暂)[^。；\n]{0,6}(?:结论|意见|认定))/g)
    },
  },
  {
    id: 'injury.missing-issuer-or-date',
    title: '缺少鉴定机构/日期',
    pack: 'injury',
    severity: 'medium',
    legalBasis: '《工伤保险条例》第 25 条：劳动能力鉴定由设区的市级劳动能力鉴定委员会作出。',
    reason: '缺少出具机构、文号或日期的鉴定材料，难以在工伤待遇争议中作为证据使用。',
    suggestion: '补齐鉴定机构名称、文书编号、出具日期与公章；电子版应保留原件扫描件。',
    maxMatches: 1,
    detect(ctx) {
      const hasIssuer = /(?:劳动能力鉴定委员会|人力资源和社会保障局|人社局)/.test(ctx.text)
      const hasDate = /\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日|\d{4}-\d{2}-\d{2}/.test(ctx.text)
      if (hasIssuer && hasDate) return []
      return [
        wholeDocMatch(ctx, {
          reason: `鉴定材料缺少${hasIssuer ? '' : '出具机构名称'}${!hasIssuer && !hasDate ? '与' : ''}${hasDate ? '' : '出具日期'}，证据链不完整。`,
        }),
      ]
    },
  },
]


