/** 离职证明 · v1 扩充包 */

import { findMatches, type Rule } from './engine'

export const RESIGNATION_V1_RULES: Rule[] = [
  {
    id: 'resignation.missing-work-period',
    title: '未载明工作起止日期',
    pack: 'resignation',
    severity: 'medium',
    legalBasis: '《劳动合同法实施条例》第 24 条：离职证明应当写明劳动合同期限、解除或终止的日期、工作岗位、在本单位的工作年限。',
    reason: '缺少起止日期会直接影响新单位的入职审核、工龄认定与失业金申领。',
    suggestion: '要求补写"自 X 年 X 月 X 日至 Y 年 Y 月 Y 日在本公司工作"，并加盖公章。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:工作|在职|任职)[^。；\n]{0,24}/g, (m) => {
        const window = ctx.text.slice(Math.max(0, m.index - 40), m.index + 80)
        if (/\d{4}\s*[年\-/.]\s*\d{1,2}/.test(window)) return null
        if (!/(?:期间|自|起止|年限|时间)/.test(window)) return null
        return {}
      })
    },
  },
  {
    id: 'resignation.missing-position',
    title: '未载明岗位 / 部门',
    pack: 'resignation',
    severity: 'low',
    legalBasis: '《劳动合同法实施条例》第 24 条。',
    reason: '岗位信息缺失会让新单位难以核验你的履历，也不利于主张相关待遇。',
    suggestion: '要求写明担任的具体岗位与所属部门。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:岗位|职务|部门|职位)/g, (m) => {
        const window = ctx.text.slice(Math.max(0, m.index - 30), m.index + 40)
        if (/(?:岗位|职务|职位)[：:是]?\s*[\u4e00-\u9fa5A-Za-z]{2,}/.test(window)) return null
        return {}
      })
    },
  },
  {
    id: 'resignation.reason-personal',
    title: '解除原因被写成"个人原因"',
    pack: 'resignation',
    severity: 'high',
    legalBasis: '《社会保险法》第 45 条：领取失业保险金需满足"非因本人意愿中断就业"。',
    reason: '被写成"个人原因辞职"后，即使实际是公司裁员或劝退，也会丧失失业金资格，并影响经济补偿主张。',
    suggestion: '如实写明解除原因（如"因公司业务调整，双方协商一致解除"）；如系公司提出，须保留书面通知或聊天记录。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:个人原因|因本人原因|本人主动|自愿辞职|个人提出)/g)
    },
  },
  {
    id: 'resignation.no-noncompete-notice',
    title: '未提示竞业限制是否启动',
    pack: 'resignation',
    severity: 'medium',
    legalBasis: '《劳动合同法》第 23、24 条：竞业限制须按月支付补偿；用人单位可在离职时明确是否启动。',
    reason: '离职证明里不提竞业限制，双方对"是否受限、有无补偿"各执一词，容易产生纠纷。',
    suggestion: '要求书面明确"是否启动竞业限制、期限、范围与补偿金额"；若不启动，要求出具书面豁免。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:竞业限制|竞业禁止|竞业)/g, (m) => {
        const window = ctx.text.slice(m.index, m.index + 80)
        if (/(?:补偿|不启动|无需遵守|另行约定|已免除|豁免)/.test(window)) return null
        return {}
      })
    },
  },
  {
    id: 'resignation.blanket-settlement',
    title: '"工资已结清"等概括表述',
    pack: 'resignation',
    severity: 'high',
    legalBasis: '《劳动争议调解仲裁法》第 6 条：当事人对自己提出的主张有责任提供证据。',
    reason: '"薪资已结清、无任何争议"这类一揽子表述，会被用来对抗你后续主张的加班费、未休年假与补偿金。',
    suggestion: '要求写明具体项目与金额（工资、加班费、年假折算、经济补偿分别多少）；未结清的部分不要签"无争议"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:工资|薪资|报酬|款项)[^。；\n]{0,12}(?:已结清|已结|已付清|无拖欠)|(?:双方|再无|不存在)[^。；\n]{0,10}(?:任何)?[^。；\n]{0,8}(?:争议|纠纷|债权债务)/g,
      )
    },
  },
  {
    id: 'resignation.withhold-for-handover',
    title: '以交接为条件扣押证明',
    pack: 'resignation',
    severity: 'high',
    legalBasis: '《劳动合同法》第 50 条：用人单位应当在解除或者终止劳动合同时出具解除或者终止的证明，并在 15 日内办理档案和社保转移。',
    reason: '用"未完成交接就不给离职证明"来施压，属于违法；会直接影响你入职新单位。',
    suggestion: '要求按法定期限出具证明；交接争议应另行处理，不得作为出具证明的前置条件。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:交接|移交|办理完毕|完成交接)[^。；\n]{0,16}(?:后|之后|方可|才能)[^。；\n]{0,12}(?:出具|发放|办理|开具)[^。；\n]{0,6}(?:离职证明|解除证明|证明)/g,
      )
    },
  },
  {
    id: 'resignation.no-compensation-statement',
    title: '未载明经济补偿情况',
    pack: 'resignation',
    severity: 'medium',
    legalBasis: '《劳动合同法》第 46—47 条：法定情形下应支付经济补偿。',
    reason: '证明中不提补偿，事后主张时需要额外举证工作年限与月工资标准。',
    suggestion: '要求写明是否支付经济补偿及金额；若未支付，注明"保留依法主张的权利"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:经济补偿|补偿金|N\+1|赔偿)/g, (m) => {
        const window = ctx.text.slice(m.index, m.index + 60)
        if (/(?:元|已支付|未支付|标准|个月|个月工资)/.test(window)) return null
        return {}
      })
    },
  },
  {
    id: 'resignation.adverse-evaluation',
    title: '记载不利评价',
    pack: 'resignation',
    severity: 'high',
    legalBasis: '《民法典》第 1024 条：民事主体享有名誉权，任何组织或个人不得以侮辱、诽谤等方式侵害。',
    reason: '在离职证明中写"因严重违纪被辞退""工作能力不足"，属于超出法定记载范围，可能侵害名誉并阻碍再就业。',
    suggestion: '要求删除评价性表述，仅保留法定记载事项；协商不成可向劳动监察部门投诉或主张侵权责任。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:严重违纪|违纪(?:被)?辞退|不能胜任|能力不足|表现不佳|不予推荐|擅离职守|被开除)/g,
      )
    },
  },
  {
    id: 'resignation.no-stamp-or-date',
    title: '未盖章 / 无出具日期',
    pack: 'resignation',
    severity: 'medium',
    legalBasis: '《劳动合同法》第 50 条：出具证明是用人单位的法定义务，加盖公章是证明有效性的基本要求。',
    reason: '没有公章或日期的离职证明，新单位通常不予认可，等于没有证明。',
    suggestion: '要求加盖公司公章（或人事专用章）并写明出具日期；电子版需可验证真伪。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:公章|盖章|盖章生效|人事章|出具日期)/g, (m) => {
        const window = ctx.text.slice(Math.max(0, m.index - 30), m.index + 50)
        if (/(?:已盖章|加盖|公司公章|人事专用章)/.test(window)) return null
        if (/\d{4}\s*年\s*\d{1,2}\s*月/.test(ctx.text)) return null
        return {}
      })
    },
  },
]
