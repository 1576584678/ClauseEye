/** 通用 · v1 扩充包（所有场景都会执行） */

import { findMatches, type Rule } from './engine'

export const COMMON_V1_RULES: Rule[] = [
  {
    id: 'common.mandatory-arbitration',
    title: '强制指定仲裁机构',
    pack: 'common',
    severity: 'medium',
    legalBasis: '《仲裁法》第 4、16 条：仲裁应当双方自愿并达成仲裁协议，仲裁协议应当明确约定仲裁机构。',
    reason: '单方指定远离你所在地的仲裁机构，仲裁费与差旅成本会显著抬高维权门槛。',
    suggestion: '要求改为"由被告住所地或合同履行地的人民法院管辖"，或选择本地仲裁委。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:提交|由)[^。；\n]{0,16}(?:仲裁委员会|仲裁机构|仲裁院)[^。；\n]{0,16}仲裁/g,
      )
    },
  },
  {
    id: 'common.waive-defenses',
    title: '预先放弃抗辩与救济权利',
    pack: 'common',
    severity: 'high',
    legalBasis: '《民法典》第 497 条：格式条款排除对方主要权利、免除自身责任的，该条款无效。',
    reason: '约定"放弃抗辩权、不得提起诉讼、不得申请保全"，属于排除法定救济权利的无效条款，但会制造谈判压力。',
    suggestion: '这类条款本身无效，可要求删除；必要时保留证据并向监管/司法途径主张。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:放弃|不得|无权)[^。；\n]{0,10}(?:抗辩权|诉讼权利|起诉|提起诉讼|申请仲裁|申请保全|上诉)/g,
      )
    },
  },
  {
    id: 'common.attachment-precedence',
    title: '附件 / 补充协议效力优先',
    pack: 'common',
    severity: 'medium',
    legalBasis: '《民法典》第 470 条：合同内容由当事人约定；条款冲突时的解释顺序应当明确。',
    reason: '约定"附件与补充协议与本合同不一致时以附件为准"，意味着正文写好的保护条款可能被附件推翻。',
    suggestion: '要求改为"补充协议须经双方签字并明确标注变更的条款，未明确变更的部分仍以本合同为准"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:附件|补充协议|附件条款)[^。；\n]{0,20}(?:优先|为准|效力高于|优先适用)/g,
      )
    },
  },
  {
    id: 'common.notice-deemed-received',
    title: '单方送达视为条款',
    pack: 'common',
    severity: 'medium',
    legalBasis: '《民法典》第 137 条：以非对话方式作出的意思表示，到达相对人时生效。',
    reason: '约定"发送至约定邮箱即视为送达，无论是否实际收到"，可能让你错过重要通知（如解约、涨价）。',
    suggestion: '要求补充"以双方书面确认收悉为准"，或至少要求同步短信/站内信并约定 3 日异议期。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:视为|即视为)[^。；\n]{0,10}(?:送达|收到|已通知|已告知)|(?:无论|不论)[^。；\n]{0,16}(?:是否|实际)[^。；\n]{0,10}(?:收到|知悉)/g,
      )
    },
  },
  {
    id: 'common.force-majeure-narrow',
    title: '不可抗力范围被缩小',
    pack: 'common',
    severity: 'medium',
    legalBasis: '《民法典》第 180、590 条：不可抗力是不能预见、不能避免且不能克服的客观情况。',
    reason: '把不可抗力限定为极少数情形，且要求"必须提供政府证明"，实际上难以满足。',
    suggestion: '要求按法定定义约定不可抗力，并列明疫情、管制、自然灾害等常见情形与通知流程。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /不可抗力[^。；\n]{0,40}/g, (m) => {
        const window = m[0]
        if (/(?:不包括|不含|仅限|限于)/.test(window)) return { severity: 'medium', reason: `不可抗力范围被限缩（"${window.trim().slice(0, 30)}…"）。` }
        if (/(?:必须|须)[^。；\n]{0,10}(?:政府|官方)[^。；\n]{0,10}(?:证明|文件)/.test(window)) {
          return { severity: 'medium', reason: '要求不可抗力必须提供政府证明，实际情形下往往无法取得。' }
        }
        return null
      })
    },
  },
  {
    id: 'common.confidentiality-of-dispute',
    title: '争议与投诉被限制公开',
    pack: 'common',
    severity: 'high',
    legalBasis: '《民法典》第 497 条：格式条款排除对方主要权利的可能无效。',
    reason: '约定"不得向任何第三方披露争议、不得向监管部门投诉"，实质上是限制你维权与举报的法定权利。',
    suggestion: '此类条款不具约束力；保留证据，必要时向劳动监察、市场监管或 12315 投诉。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:不得|禁止)[^。；\n]{0,14}(?:向|对外)[^。；\n]{0,14}(?:投诉|举报|披露|公开)[^。；\n]{0,14}(?:争议|纠纷|本协议|本合同)?/g,
      )
    },
  },
  {
    id: 'common.publicity-ban',
    title: '禁止公开评价',
    pack: 'common',
    severity: 'medium',
    legalBasis: '《民法典》第 990、1024 条：民事主体的人格权受法律保护，但正当评价不受限制。',
    reason: '约定"不得在任何平台发表对本公司的评价"，超出合理保密范围。',
    suggestion: '要求限定为"不得披露商业秘密与未经公开的保密信息"，而非禁止一切评价。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:不得|禁止)[^。；\n]{0,16}(?:发表|发布|公开)[^。；\n]{0,12}(?:评价|评论|言论|信息)/g,
      )
    },
  },
  {
    id: 'common.data-consent-broad',
    title: '个人信息授权过宽',
    pack: 'common',
    severity: 'high',
    legalBasis: '《个人信息保护法》第 6、14 条：处理个人信息应当具有明确、合理的目的，并取得个人同意。',
    reason: '一揽子授权"收集、使用、共享、对外提供个人信息"，缺少目的限定与撤回方式。',
    suggestion: '要求写明收集目的、范围与保存期限，并加入"可随时撤回同意"的条款。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:个人信息|身份信息|资料|数据)[^。；\n]{0,24}(?:收集|使用|共享|提供给|对外提供|授权)/g,
        (m) => {
          const window = ctx.text.slice(Math.max(0, m.index - 60), m.index + 100)
          if (/(?:撤回|明确目的|保存期限|最小必要)/.test(window)) return null
          return {}
        },
      )
    },
  },
  {
    id: 'common.penalty-uncapped-generic',
    title: '违约金不设上限',
    pack: 'common',
    severity: 'high',
    legalBasis: '《民法典》第 585 条：约定的违约金过分高于造成的损失的，可以请求适当减少。',
    reason: '只规定违约金计算方式，不设封顶，金额可能远超实际损失。',
    suggestion: '要求写入封顶条款（如不超过合同总金额的 20% 或一定金额），并明确损失的计算口径。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:违约金|赔偿金)[^。；\n]{0,50}/g, (m) => {
        const window = m[0]
        if (!/(?:按|每|日|天|\d+\s*%|百分之)/.test(window)) return null
        if (/(?:不超过|上限|封顶|最高不超过)/.test(window)) return null
        return {}
      })
    },
  },
  {
    id: 'common.education-notice-waiver',
    title: '排除电子记录的证据效力',
    pack: 'common',
    severity: 'medium',
    legalBasis: '《民事诉讼法》第 66 条：电子数据属于法定证据种类。',
    reason: '约定"微信、邮件等沟通记录不得作为证据使用"，与法律规定冲突，但可能影响举证节奏。',
    suggestion: '该约定不影响电子数据的证据效力；重要沟通仍应保留完整截图、原始载体与时间戳。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:微信|邮件|聊天记录|短信|电子记录|电子数据)[^。；\n]{0,20}(?:不得|不能|不作为)[^。；\n]{0,10}(?:证据|依据)/g,
      )
    },
  },
  {
    id: 'common.unilateral-termination-fee',
    title: '单方终止须支付高额费用',
    pack: 'common',
    severity: 'medium',
    legalBasis: '《民法典》第 585 条：违约金应与损失相当。',
    reason: '约定"任何一方单方终止须支付合同总金额 X% 作为违约金"，可能远超对方实际损失。',
    suggestion: '要求按实际损失或已完成进度结算，并设置合理上限。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:单方|提前)[^。；\n]{0,12}(?:终止|解除|退出)[^。；\n]{0,24}(?:支付|承担|赔偿)[^。；\n]{0,16}(?:合同总额|合同金额|总金额|全部费用)[^。；\n]{0,8}(\d{1,3})\s*%\u0025?/g,
      )
    },
  },
  {
    id: 'common.final-interpretation-right',
    title: '最终解释权归一方',
    pack: 'common',
    severity: 'medium',
    legalBasis: '《民法典》第 498 条：对格式条款的理解发生争议的，应当按照通常理解予以解释；有两种以上解释的，应当作出不利于提供格式条款一方的解释。',
    reason: '约定"本合同最终解释权归甲方/本公司所有"，本质是排除法律规定的解释规则，发生争议时会被用来单方解释条款。',
    suggestion: '删除该表述；如确有必要，改为"双方对条款理解不一致时，按《民法典》第 498 条处理"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:最终解释权|解释权)[^。；\n]{0,12}(?:归|属于)[^。；\n]{0,10}(?:甲方|乙方|本公司|本店|出租方|出租人|用人单位)/g,
      )
    },
  },
]
