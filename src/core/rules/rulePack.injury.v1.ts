/** 工伤鉴定 / 劳动能力鉴定 · v1 扩充包 */

import { findMatches, type Rule } from './engine'

export const INJURY_V1_RULES: Rule[] = [
  {
    id: 'injury.no-disability-grade',
    title: '未载明劳动功能障碍等级',
    pack: 'injury',
    severity: 'high',
    legalBasis: '《工伤保险条例》第 22 条：劳动能力鉴定结论应当载明劳动功能障碍程度和生活自理障碍程度。',
    reason: '等级是计算一次性伤残补助金、伤残津贴、就业补助金的直接依据，缺了等级几乎无法主张待遇。',
    suggestion: '要求鉴定机构在结论中明确写出"劳动功能障碍程度 X 级"，并索取完整鉴定书。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:劳动功能障碍|劳动能力|伤残)[^。；\n]{0,30}/g, (m) => {
        const window = ctx.text.slice(Math.max(0, m.index - 30), m.index + 80)
        if (/(?:[一二三四五六七八九十]|\d)\s*级/.test(window)) return null
        // 只要窗口内没有出现「X 级」，就属于"未载明等级"，应命中
        return {}
      })
    },
  },
  {
    id: 'injury.no-self-care-grade',
    title: '未载明生活自理障碍程度',
    pack: 'injury',
    severity: 'medium',
    legalBasis: '《工伤保险条例》第 22、34 条：生活自理障碍分三级，对应不同的生活护理费标准。',
    reason: '生活护理费按月发放，缺少该项结论会直接损失这部分长期待遇。',
    suggestion: '要求写明"生活自理障碍程度：无/部分/完全不能自理"，未评定的要求补充评定。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:生活自理|生活护理|护理依赖)/g, (m) => {
        const window = ctx.text.slice(m.index, m.index + 60)
        if (/(?:无|部分|大部分|完全|三级|二级|一级|不需要)/.test(window)) return null
        return {}
      })
    },
  },
  {
    id: 'injury.no-recheck-deadline',
    title: '未提示再次鉴定申请期限',
    pack: 'injury',
    severity: 'high',
    legalBasis: '《工伤保险条例》第 26 条：对设区的市级劳动能力鉴定结论不服的，可以在收到之日起 15 日内向省级劳动能力鉴定委员会提出再次鉴定申请。',
    reason: '15 日是除斥期间，一旦错过就无法再申请省级再次鉴定，结论被永久固定。',
    suggestion: '如对结论不服，务必在收到之日起 15 日内提交再次鉴定申请，并保留送达凭证与邮寄记录。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:再次鉴定|复查|复核|不服)/g, (m) => {
        const window = ctx.text.slice(Math.max(0, m.index - 60), m.index + 100)
        if (/(?:15\s*日|\d{1,2}\s*日内|期限)/.test(window)) return null
        return {}
      })
    },
  },
  {
    id: 'injury.vague-conclusion',
    title: '结论表述含糊',
    pack: 'injury',
    severity: 'medium',
    legalBasis: '《工伤保险条例》第 25 条：鉴定结论应当事实清楚、依据充分。',
    reason: '"建议继续治疗""暂不评定""视恢复情况而定"这类表述无法作为申请待遇的依据。',
    suggestion: '要求出具明确结论；确需观察的，要求写明"本次评定结论"与"下次复查时间"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:建议|暂|视)[^。；\n]{0,16}(?:继续治疗|不予评定|暂不评定|恢复情况|观察|另行评定)/g)
    },
  },
  {
    id: 'injury.no-institution-or-date',
    title: '缺鉴定机构 / 鉴定日期',
    pack: 'injury',
    severity: 'medium',
    legalBasis: '《工伤保险条例》第 23 条：劳动能力鉴定由设区的市级劳动能力鉴定委员会组织实施。',
    reason: '缺少机构名称与日期，结论的真实性与生效时间都无从确认，申报待遇时会被退回。',
    suggestion: '要求补全机构全称（XX 市劳动能力鉴定委员会）、鉴定日期与鉴定书编号，并核对与原件一致。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:劳动能力鉴定委员会|鉴定机构|鉴定书编号|鉴定日期)/g, (m) => {
        const window = ctx.text.slice(Math.max(0, m.index - 20), m.index + 60)
        if (/(?:委员会|鉴定书编号|编号|第\s*\d+\s*号)/.test(window) && /\d{4}\s*年/.test(window)) return null
        return {}
      })
    },
  },
  {
    id: 'injury.waive-rights-one-off',
    title: '一次性了结 / 放弃权利',
    pack: 'injury',
    severity: 'high',
    legalBasis: '《工伤保险条例》第 54 条：工伤职工有权依法享受工伤保险待遇，民事协议不得排除法定权利。',
    reason: '"一次性了结、后续不再主张任何权利"通常以远低于法定标准的金额换取你的全部权利。',
    suggestion: '签订前先核算法定待遇总额（一次性伤残补助金 + 就业补助金 + 医疗补助金 + 停工留薪期工资），差额过大不要签。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:一次性了结|一次性解决|放弃)[^。；\n]{0,20}(?:权利|请求|主张|赔偿|待遇)|(?:此后|今后)[^。；\n]{0,10}(?:不再|不得)[^。；\n]{0,10}(?:主张|要求|追究)/g,
      )
    },
  },
  {
    id: 'injury.no-paid-recovery-period',
    title: '未载明停工留薪期',
    pack: 'injury',
    severity: 'high',
    legalBasis: '《工伤保险条例》第 33 条：停工留薪期内原工资福利待遇不变，由所在单位按月支付。',
    reason: '停工留薪期（通常 12 个月内，伤情严重可延长）是工伤期间最重要的收入保障，未载明容易被单位压低或提前终止。',
    suggestion: '要求写明停工留薪期的起止与延长期限；单位提前要求复工的，须书面异议并保留医疗证明。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:停工留薪|留薪期|停工留薪期)/g, (m) => {
        const window = ctx.text.slice(m.index, m.index + 80)
        if (/(?:\d{1,2}\s*个月|延长|至|起止)/.test(window)) return null
        return {}
      })
    },
  },
  {
    id: 'injury.payer-unclear',
    title: '赔偿责任主体不明',
    pack: 'injury',
    severity: 'medium',
    legalBasis: '《工伤保险条例》第 62 条：用人单位未参加工伤保险的，由该用人单位按条例规定的待遇项目和标准支付费用。',
    reason: '未写清是工伤保险基金支付还是单位自付，出问题时容易出现互相推诿。',
    suggestion: '要求写明各待遇项目的支付主体；单位未参保的，所有费用均应由单位承担并写入书面确认。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:费用|待遇|款项|赔偿|补助金)[^。；\n]{0,12}(?:由|按)[^。；\n]{0,8}(?:有关|相关|相应|责任方|各自|另行|协商|国家规定|政策|法律)[^。；\n]{0,8}(?:承担|支付|处理|确定|分担)/g,
        (m) => {
          const window = ctx.text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40)
          // 同一句里已写明具体支付主体（工伤保险基金 / 用人单位）时视为明确
          if (/(?:工伤保险基金|用人单位|单位)[^。；\n]{0,10}(?:支付|承担|垫付)/.test(window)) return null
          return {}
        },
      )
    },
  },
  {
    id: 'injury.no-attachment-mentioned',
    title: '未附鉴定依据材料',
    pack: 'injury',
    severity: 'low',
    legalBasis: '《工伤保险条例》第 25 条：鉴定委员会应当依据医疗诊断证明与检查结果作出结论。',
    reason: '没有诊断证明、检查报告等附件，后续申请复查或再次鉴定时缺少基础材料。',
    suggestion: '索取并保存完整鉴定材料（诊断证明、影像报告、病历、检查结果），并核对与结论的一致性。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:诊断证明|检查结果|病历|影像|附件)/g, (m) => {
        const window = ctx.text.slice(Math.max(0, m.index - 40), m.index + 50)
        if (/(?:附|随附|见附件|依据)/.test(window)) return null
        return {}
      })
    },
  },
]
