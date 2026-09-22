/** 保密协议 / NDA · v1 扩充包 */

import { findMatches, type Rule } from './engine'

export const NDA_V1_RULES: Rule[] = [
  {
    id: 'nda.no-consideration',
    title: '保密义务无任何对价',
    pack: 'nda',
    severity: 'low',
    legalBasis: '《民法典》第 496 条：格式条款提供方应当遵循公平原则确定当事人之间的权利和义务。',
    reason: '只有义务没有对价（保密费/补偿），一旦发生争议，对方更容易主张"义务已成立但收益未体现"。',
    suggestion: '若保密范围超出正常工作内容（如覆盖离职后多年），可要求约定单独的保密补偿。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:保密费|保密补偿|对价|补偿金)/g, (m) => {
        const window = ctx.text.slice(Math.max(0, m.index - 60), m.index + 60)
        if (/(?:不支付|无|不予|不另)/.test(window)) return {}
        return null
      })
    },
  },
  {
    id: 'nda.ip-assignment-broad',
    title: '知识产权概括转让',
    pack: 'nda',
    severity: 'high',
    legalBasis: '《专利法》第 6 条、《著作权法》第 18 条：职务发明与职务作品有法定边界。',
    reason: '约定"在职期间及离职后一年内的一切成果均归公司"，把非职务发明、个人作品也一并划走。',
    suggestion: '要求把范围限定为"主要利用公司物质技术条件、与本职工作相关的成果"，并明确个人项目不属于职务成果。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:一切|所有|全部|任何)[^。；\n]{0,16}(?:成果|发明|创造|作品|知识产权)[^。；\n]{0,16}(?:归|属于)[^。；\n]{0,8}(?:公司|甲方|单位)/g,
      )
    },
  },
  {
    id: 'nda.non-solicit-broad',
    title: '禁止招揽范围过宽',
    pack: 'nda',
    severity: 'medium',
    legalBasis: '《民法典》第 497 条：格式条款不合理限制对方主要权利的可能无效。',
    reason: '"不得招揽公司任何客户与员工"若期限过长、范围过宽，实际接近于竞业限制，却没有补偿。',
    suggestion: '要求限定在"在职期间接触过的客户/同事"，并明确期限（通常不超过 1 年）与补偿安排。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:不得|禁止|承诺不)[^。；\n]{0,10}(?:招揽|挖|聘用|雇佣)[^。；\n]{0,12}(?:客户|员工|雇员|合作方)/g,
      )
    },
  },
  {
    id: 'nda.no-lawful-disclosure-exception',
    title: '缺少依法披露的例外',
    pack: 'nda',
    severity: 'medium',
    legalBasis: '《民事诉讼法》第 70 条：凡是知道案件情况的单位和个人，都有义务出庭作证。',
    reason: '没有"依法律/监管要求或司法程序必须披露"的例外条款，会让你在维权或配合调查时陷入两难。',
    suggestion: '要求增加例外："依法律法规、司法或行政程序要求披露的，不视为违约。"',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:例外|除外|不视为违约|依法披露|法律要求)/g, (m) => {
        const window = ctx.text.slice(Math.max(0, m.index - 60), m.index + 80)
        if (/(?:法律|司法|监管|法院|仲裁)/.test(window)) return null
        return {}
      })
    },
  },
  {
    id: 'nda.unlimited-penalty',
    title: '违约责任无上限',
    pack: 'nda',
    severity: 'high',
    legalBasis: '《民法典》第 585 条：约定违约金过分高于损失的，可请求适当减少。',
    reason: '"赔偿公司因此遭受的全部损失（包括间接损失、可得利益）且无上限"，实际金额不可预估。',
    suggestion: '要求设定违约金上限（如不超过本人近 12 个月工资总额），并排除间接损失与可得利益。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:全部损失|一切损失|间接损失|可得利益|预期利益)[^。；\n]{0,20}(?:赔偿|承担|不予限制|不受限制)?/g,
        (m) => {
          if (/(?:不超过|上限|限于)/.test(ctx.text.slice(Math.max(0, m.index - 60), m.index + 60))) return null
          return {}
        },
      )
    },
  },
  {
    id: 'nda.moral-rights-waiver',
    title: '放弃署名权 / 人格权',
    pack: 'nda',
    severity: 'medium',
    legalBasis: '《著作权法》第 10 条：署名权属于著作人身权，不可转让。',
    reason: '约定"放弃署名权、修改权""不得主张任何人身权利"，其中人身权部分本身无效，但会制造争议。',
    suggestion: '要求删除涉及著作人身权的内容；财产权可以约定归属，人身权不能放弃。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:放弃|不主张|不得主张)[^。；\n]{0,12}(?:署名权|修改权|保护作品完整权|人格权|人身权)/g)
    },
  },
  {
    id: 'nda.no-prior-invention-carveout',
    title: '未排除入职前的自有成果',
    pack: 'nda',
    severity: 'high',
    legalBasis: '《民法典》第 465 条：合同仅对当事人具有法律约束力，不得处分第三人权利。',
    reason: '不排除入职前的个人项目与发明，日后可能被主张属于公司资产。',
    suggestion: '要求增加附件《既有成果清单》，把入职前的个人作品、开源贡献、专利列清并注明归个人所有。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:入职前|此前|既有|原有)[^。；\n]{0,16}(?:成果|发明|作品|知识产权)/g, (m) => {
        const window = ctx.text.slice(Math.max(0, m.index - 40), m.index + 100)
        if (/(?:归|属于)[^。；\n]{0,8}(?:本人|乙方|个人)/.test(window)) return null
        return {}
      })
    },
  },
  {
    id: 'nda.foreign-jurisdiction',
    title: '境外管辖 / 境外仲裁',
    pack: 'nda',
    severity: 'medium',
    legalBasis: '《民事诉讼法》第 35 条：涉外合同当事人可以协议选择管辖法院。',
    reason: '约定境外法院或仲裁机构管辖，维权成本极高，实际上等于放弃了救济途径。',
    suggestion: '要求改为本人所在地或公司所在地的人民法院管辖；至少选择国内仲裁机构。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:香港|新加坡|开曼|美国|英国|SIAC|HKIAC|ICC|CIETAC)[^。；\n]{0,20}(?:仲裁|管辖|法院|法律)/g,
      )
    },
  },
  {
    id: 'nda.admission-of-breach',
    title: '预先承认已违约',
    pack: 'nda',
    severity: 'medium',
    legalBasis: '《民法典》第 148—151 条：在欺诈、胁迫或显失公平情形下订立的条款可撤销。',
    reason: '条款中直接写"乙方承认已存在违约行为"，等于提前固定了对你不利的事实。',
    suggestion: '拒绝签署含此类自认表述的文件；已经发生的争议应通过协商或法律程序单独处理。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:承认|确认|认可)[^。；\n]{0,12}(?:已|存在)[^。；\n]{0,10}(?:违约|违反|侵权)/g)
    },
  },
  {
    id: 'nda.no-backup-retention',
    title: '要求销毁且不留任何副本',
    pack: 'nda',
    severity: 'low',
    legalBasis: '《民法典》第 509 条：当事人应当遵循诚信原则履行合同义务。',
    reason: '"须销毁全部资料且不得保留任何形式的副本"，与实际操作（备份、邮件、日志）冲突，容易被指违约。',
    suggestion: '要求补充例外："因合规归档、自动备份或法律义务而留存的副本不受此限。"',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:销毁|删除|清除)[^。；\n]{0,20}(?:任何|一切|全部)?[^。；\n]{0,10}(?:副本|备份|拷贝|留存)/g, (m) => {
        const window = ctx.text.slice(Math.max(0, m.index - 40), m.index + 100)
        if (/(?:备份|归档|合规|法律义务)[^。；\n]{0,16}(?:除外|例外|不受此限)/.test(window)) return null
        return {}
      })
    },
  },
  {
    id: 'nda.off-duty-confidentiality',
    title: '离职后无限期保密义务',
    pack: 'nda',
    severity: 'medium',
    legalBasis: '《民法典》第 497 条：格式条款不合理限制对方权利的可能无效。',
    reason: '约定"离职后永久保密且无任何补偿"，涵盖范围往往超出真正的商业秘密。',
    suggestion: '要求区分商业秘密（可约定较长期限）与一般经营信息（建议 2—3 年），并明确无须支付对价的范围。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:离职后|解除后|终止后)[^。；\n]{0,20}(?:永久|无限期|长期|持续)[^。；\n]{0,12}保密/g)
    },
  },
]
