/** 通用规则包：所有分类的文档都会执行 */

import { findMatches, type Rule } from './engine'

export const COMMON_RULES: Rule[] = [
  {
    id: 'common.auto-renew',
    title: '自动续约 / 自动顺延',
    pack: 'common',
    severity: 'medium',
    reason: '自动续约会形成"不知情即续期"的效果，退出成本高。',
    suggestion: '改为"到期前 X 日双方书面确认是否续约；未确认则到期终止"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /自动(?:续约|续签|续订|续期|顺延|展期|延期)/g)
    },
  },
  {
    id: 'common.jurisdiction',
    title: '争议管辖不利于你',
    pack: 'common',
    severity: 'low',
    legalBasis: '《民事诉讼法》第 35 条：协议管辖不得违反级别管辖与专属管辖。',
    reason: '约定在对方所在地、或约定异地仲裁机构，会显著提高你的维权成本。',
    suggestion: '争取约定"由被告住所地或合同履行地人民法院管辖"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:争议|纠纷)[^。；\n]{0,36}(?:提交|由|向)[^。；\n]{0,20}(?:仲裁委员会|人民法院|法院)[^。；\n]{0,24}/g, (m) =>
        /(?:甲方所在地|对方所在地|公司所在地|出借方所在地)/.test(m[0]) ? { severity: 'medium' } : {},
      )
    },
  },
  {
    id: 'common.unlimited-liability',
    title: '责任无上限 / 连带责任',
    pack: 'common',
    severity: 'medium',
    legalBasis: '《民法典》第 585 条、第 584 条：赔偿以违约方订立合同时可预见的损失为限。',
    reason: '"承担全部损失、无限责任、连带责任"等表述会让潜在赔偿不可控。',
    suggestion: '争取将赔偿责任限定为"直接损失"，并设置上限（如不超过合同总金额或已收取的服务费）。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:(?:承担|赔偿)[^。；\n]{0,10}(?:全部|一切|无限)[^。；\n]{0,8}(?:损失|责任))|(?:无限(?:连带)?责任)|(?:(?:甲方|乙方)[^。；\n]{0,12}承担连带责任)/g,
      )
    },
  },
  {
    id: 'common.blank-placeholder',
    title: '存在空白项/占位符',
    pack: 'common',
    severity: 'low',
    reason: '合同中出现空白下划线、XX、待填等占位符，签署时极易被事后填写不利内容。',
    suggestion: '签署前补齐所有空白项；确需保留空白的，应划掉并双方签字确认。',
    maxMatches: 3,
    detect(ctx) {
      return findMatches(ctx, /(?:_{3,}|-{4,}|＿{2,}|××+|待填|待补充|XX+)/g)
    },
  },
  {
    id: 'common.unilateral-change',
    title: '对方可单方变更条款',
    pack: 'common',
    severity: 'medium',
    legalBasis: '《民法典》第 496、497 条：格式条款不得排除对方主要权利或不合理免除自身责任。',
    reason: '"有权随时单方调整本协议内容"会让合同在你不知情时被改写。',
    suggestion: '要求变更为"需经双方书面协商一致"，并约定变更通知方式与生效时间。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:甲方|乙方|公司|出租方|用人单位|委托方)[^。；\n]{0,20}(?:有权|可以|可)[^。；\n]{0,16}(?:单方|随时|自行)[^。；\n]{0,16}(?:变更|修改|调整|修订)[^。；\n]{0,16}(?:本(?:合同|协议|通知)|条款|内容|约定)/g,
      )
    },
  },
  {
    id: 'common.no-remedy-clause',
    title: '免责/概不负责表述',
    pack: 'common',
    severity: 'medium',
    legalBasis: '《民法典》第 497 条：不合理地免除或减轻其责任的格式条款无效。',
    reason: '"概不负责/不承担任何责任"属于典型的单方免责写法，出现纠纷时对你不利。',
    suggestion: '要求限定免责情形（不可抗力等），并保留对方过错情形下的赔偿责任。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:(?:概不负责|不予负责|不承担任何责任|免除(?:其|一切)责任))|(?:免责)[^。；\n]{0,20}/g)
    },
  },
]
