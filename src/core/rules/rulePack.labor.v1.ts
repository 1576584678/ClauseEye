/**
 * 劳动合同 · v1 扩充包
 *
 * 与 `rulePack.labor.ts`（v0.1 种子包）保持同样的可解释风格：
 * 纯关键词 / 数值判定，命中即给出原文引用、通俗解释与法条依据。
 * 拆成独立文件是为了让已被回归测试锁住的种子规则保持稳定。
 */

import { findMatches, type Rule } from './engine'
import { cnToNumber } from '../text'

export const LABOR_V1_RULES: Rule[] = [
  {
    id: 'labor.unilateral-transfer',
    title: '单方变更岗位 / 工作地点',
    pack: 'labor',
    severity: 'high',
    legalBasis: '《劳动合同法》第 35 条：变更劳动合同约定内容应当协商一致并采用书面形式。',
    reason: '约定公司"有权根据经营需要调整岗位、地点、薪酬"，等于把变更权单方面交出去，可能被调到偏远地区或降薪岗位。',
    suggestion: '要求写明"变更岗位/地点需双方书面协商一致"；至少要约定调整后的薪资下限与通勤补偿。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:有权|可以|可)(?:根据[^。；\n]{0,16})?(?:单方)?(?:调整|变更|调动)[^。；\n]{0,12}(?:岗位|职位|工作地点|工作内容|薪资|薪酬|部门)/g,
      )
    },
  },
  {
    id: 'labor.salary-includes-overtime',
    title: '工资已包含加班费',
    pack: 'labor',
    severity: 'high',
    legalBasis: '《劳动法》第 44 条：延长工作时间应支付不低于 150%/200%/300% 的工资报酬。',
    reason: '"月薪已包含加班费""不再另行计算加班费"是变相压加班成本，实际加班时长往往远超打包价。',
    suggestion: '要求删除该表述；加班费应按实际加班时长依法计算，或明确折算基数与小时单价。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:工资|薪资|报酬|月薪|薪酬)[^。；\n]{0,20}(?:已包含|包含|已含|含)[^。；\n]{0,10}(?:加班费|加班工资|延时工作报酬)|(?:不再|不另|无需)(?:另行)?(?:支付|计算|发放)[^。；\n]{0,8}(?:加班费|加班工资)/g,
      )
    },
  },
  {
    id: 'labor.termination-without-severance',
    title: '解除/终止不支付经济补偿',
    pack: 'labor',
    severity: 'high',
    legalBasis: '《劳动合同法》第 46—47 条：法定情形下用人单位应当支付经济补偿（每满一年付一个月工资）。',
    reason: '"双方解除均不支付任何补偿""放弃经济补偿"的约定无效，但会让你在离职时难以主张权利。',
    suggestion: '要求删除；离职时按工作年限主张 N/N+1 经济补偿，并保留工资流水与解除通知作为证据。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:不予|无需|不支付|不承担|放弃)[^。；\n]{0,12}(?:经济补偿|经济赔偿|补偿金)|(?:经济补偿|补偿金)[^。；\n]{0,10}(?:不予支付|不再支付|无需支付)/g,
      )
    },
  },
  {
    id: 'labor.annual-leave-waiver',
    title: '年休假权利被排除',
    pack: 'labor',
    severity: 'medium',
    legalBasis: '《职工带薪年休假条例》第 3、5 条：累计工作满 1 年即享有带薪年休假，未休应支付 300% 工资报酬。',
    reason: '"不享受年休假""年假包含在法定节假日中""未休年假不折现"都会让你损失法定的带薪假期或折现补偿。',
    suggestion: '要求删去排除年休假的表述；未休年假应在离职时按日工资 300% 折算。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:不享受|不适用|无|放弃|不予安排)[^。；\n]{0,8}(?:年休假|年假|带薪年休假)|(?:未休|应休未休)[^。；\n]{0,10}(?:年休假|年假)[^。；\n]{0,10}(?:不|无需|不予)[^。；\n]{0,6}(?:折现|补偿|支付)/g,
      )
    },
  },
  {
    id: 'labor.sick-leave-unpaid',
    title: '病假无薪 / 医疗期被压缩',
    pack: 'labor',
    severity: 'medium',
    legalBasis: '《企业职工患病或非因工负伤医疗期规定》：医疗期不少于 3 个月，病假工资不得低于当地最低工资标准的 80%。',
    reason: '约定"病假期间不支付工资""医疗期仅为 X 天"，低于法定最低标准，生病期间会直接失去收入。',
    suggestion: '要求按法定医疗期与病假工资标准执行；写明病假工资不低于当地最低工资的 80%。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:病假|医疗期)[^。；\n]{0,24}(?:不支付|不予支付|无薪|不发工资|无工资|没有工资|不享受工资)/g, (m) => {
        if (/医疗期[^。；\n]{0,10}(?:为|不超过|仅)\s*(?:\d{1,2}|[一二三四五六七八九十]+)\s*(?:天|日)/.test(m[0])) {
          return { severity: 'high', reason: `约定的医疗期明显短于法定标准（"${m[0].trim().slice(0, 28)}…"）。` }
        }
        return {}
      })
    },
  },
  {
    id: 'labor.marriage-pregnancy-restrict',
    title: '限制婚育 / 产假权利',
    pack: 'labor',
    severity: 'high',
    legalBasis: '《妇女权益保障法》第 43、48 条：不得在合同中限制女职工结婚、生育，不得因怀孕降低待遇。',
    reason: '约定"入职 X 年内不得生育""违反则解除合同"，属于就业性别歧视，同时也是违法解除的高发诱因。',
    suggestion: '此类条款本身无效，可拒绝签署；若已签，保留证据，遭遇解除可主张违法解除赔偿金（2N）。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:(?:\d{1,2}|[一二三四五六七八九十两]+)\s*年内?)?[^。；\n]{0,10}(?:不得|禁止|不能|承诺不)[^。；\n]{0,8}(?:结婚|生育|怀孕|妊娠)|(?:怀孕|妊娠|生育)[^。；\n]{0,14}(?:解除|终止)[^。；\n]{0,8}(?:劳动合同|劳动关系)/g,
      )
    },
  },
  {
    id: 'labor.competition-no-compensation',
    title: '竞业限制未约定经济补偿',
    pack: 'labor',
    severity: 'high',
    legalBasis: '《劳动合同法》第 23、24 条：竞业限制期间应按月支付经济补偿；未约定的，劳动者履行义务后可要求按前 12 个月平均工资的 30% 支付。',
    reason: '只限制你不得从事同类工作，却不提补偿金额与发放方式。离职后你会发现"被限制"却拿不到钱。',
    suggestion: '要求写明补偿金额（不低于离职前 12 个月平均工资的 30%，且不低于当地最低工资）与按月发放方式。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /竞业[^。；\n]{0,60}/g, (m) => {
        const window = m[0]
        if (!/(?:不得|禁止|限制)/.test(window)) return null
        if (/(?:经济补偿|补偿金|按月支付|补偿标准|每月支付|给予补偿)/.test(window)) return null
        return {
          severity: 'high',
          reason: `竞业限制条款只约定限制义务，未见经济补偿约定（"${window.trim().slice(0, 30)}…"）。`,
        }
      })
    },
  },
  {
    id: 'labor.competition-over-two-years',
    title: '竞业限制期限超过 2 年',
    pack: 'labor',
    severity: 'high',
    legalBasis: '《劳动合同法》第 24 条：竞业限制期限不得超过 2 年。',
    reason: '超过 2 年的部分无效，但会让你在谈判中被误导为"必须遵守 3 年"。',
    suggestion: '要求将期限改为不超过 2 年，并明确起算时点（通常自离职之日起算）。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /竞业[^。；\n]{0,40}/g, (m) => {
        const months = /(?:(\d{1,2}|[一二三四五六七八九十两]+)\s*(?:个)?\s*月)|(?:(\d{1,2}|[一二三四五六七八九十两]+)\s*年)/.exec(m[0])
        if (!months) return null
        const fromMonth = months[1] ? cnToNumber(months[1]) : null
        const fromYear = months[2] ? cnToNumber(months[2]) : null
        const monthValue = fromMonth ?? (fromYear === null ? null : fromYear * 12)
        if (monthValue === null || monthValue <= 24) return null
        return {
          severity: 'high',
          reason: `约定的竞业限制期限约 ${monthValue} 个月，超过法定上限 24 个月，超出部分无效。`,
        }
      })
    },
  },
  {
    id: 'labor.service-period-bond-vague',
    title: '服务期违约金依据不明',
    pack: 'labor',
    severity: 'medium',
    legalBasis: '《劳动合同法》第 22 条：服务期违约金不得超过用人单位提供的培训费用，且不超过服务期尚未履行部分应分摊的培训费用。',
    reason: '只写"违反服务期需支付违约金 X 万元"，却不写培训项目与费用金额，容易被随意主张。',
    suggestion: '要求写明专项培训的名称、实际费用与计算方式，并把违约金上限写进合同。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /服务期[^。；\n]{0,60}/g, (m) => {
        const window = m[0]
        if (!/(?:违约金|赔偿)/.test(window)) return null
        if (/(?:培训费|培训费用|专项培训|费用明细|按比例|分摊)/.test(window)) return null
        return {
          severity: 'medium',
          reason: `服务期条款约定了违约金，但未写明对应的专项培训及费用金额（"${window.trim().slice(0, 30)}…"）。`,
        }
      })
    },
  },
  {
    id: 'labor.probation-repeat-or-extend',
    title: '试用期可延长 / 多次约定',
    pack: 'labor',
    severity: 'high',
    legalBasis: '《劳动合同法》第 19 条：同一用人单位与同一劳动者只能约定一次试用期。',
    reason: '"可根据表现延长试用期""不适用的可重新约定试用期"违反"只能约定一次"的强制性规定。',
    suggestion: '要求删除；若企业想考察更久，应通过正式的绩效改进计划解决，而不是反复延长试用期。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /试用期[^。；\n]{0,20}(?:可|可以|有权|将|予以)(?:延长|顺延|重新约定|再次约定)|(?:延长|重新约定|再次约定)[^。；\n]{0,10}试用期/g,
      )
    },
  },
  {
    id: 'labor.nonstandard-work-hours',
    title: '不定时 / 综合计算工时制',
    pack: 'labor',
    severity: 'medium',
    legalBasis: '《关于企业实行不定时工作制和综合计算工时工作制的审批办法》：实行该制度须经劳动行政部门审批。',
    reason: '不定时工作制本身合法，但实践中常被用来规避加班费。若企业未取得审批，该约定无效。',
    suggestion: '要求企业出示劳动行政部门关于该岗位实行不定时工作制的批准文件；否则拒绝接受该安排。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:不定时工作制|综合计算工时(?:制)?|综合工时制)/g, (m) => {
        const near = ctx.text.slice(Math.max(0, m.index - 60), m.index + 80)
        if (/(?:经)?(?:劳动行政部门|人力资源和社会保障|人社局|审批|批准|备案)/.test(near)) {
          return { severity: 'low', reason: '该岗位实行特殊工时制，请核对企业是否有劳动行政部门的批准文件。' }
        }
        return {}
      })
    },
  },
  {
    id: 'labor.wage-deduction-fine',
    title: '罚款 / 克扣工资条款',
    pack: 'labor',
    severity: 'high',
    legalBasis: '《工资支付暂行规定》第 16 条：因劳动者本人原因造成损失的，可按约定要求赔偿，但每月扣除不得超过当月工资的 20%。',
    reason: '"迟到罚款 200 元""违反制度扣发当月工资"等条款，企业并无罚款权，且扣款比例常超法定上限。',
    suggestion: '要求删除罚款表述，改为"因故意或重大过失造成直接损失，按实际损失协商赔偿，每月扣除不超过工资的 20%"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:迟到|早退|旷工|违反|违纪)[^。；\n]{0,16}(?:罚款|扣发|扣除|扣减)[^。；\n]{0,14}(?:工资|薪资|报酬|元)|(?:罚款|扣发|克扣)[^。；\n]{0,10}(?:工资|薪资|报酬)/g,
      )
    },
  },
  {
    id: 'labor.contract-transfer-obligation',
    title: '概括转让劳动合同',
    pack: 'labor',
    severity: 'medium',
    legalBasis: '《劳动合同法》第 34 条：用人单位发生合并、分立等情形，原劳动合同继续有效，由承继单位履行。',
    reason: '约定"公司可将本合同权利义务转让给关联公司，员工不得异议"，可能让你在不知情中被换到另一家公司。',
    suggestion: '要求写明"变更用人单位主体需经劳动者书面同意，工作年限连续计算"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:本合同|劳动关系|权利义务)[^。；\n]{0,20}(?:转让|转移|承继)[^。；\n]{0,16}(?:关联公司|第三方|其它公司|其他公司|子公司)|(?:公司|甲方)[^。；\n]{0,16}(?:有权)?[^。；\n]{0,10}转让[^。；\n]{0,12}(?:劳动合同|劳动关系)/g,
      )
    },
  },
  {
    id: 'labor.blank-fields',
    title: '关键条款留白',
    pack: 'labor',
    severity: 'high',
    legalBasis: '《劳动合同法》第 17 条：劳动合同应当具备工作内容、工作地点、劳动报酬等必备条款。',
    reason: '空白处随意填写是劳动争议中最常见的风险来源，事后再争辩几乎无法举证。',
    suggestion: '签署前把所有空白处填满或划掉；无法确认的内容宁可不签，也不要留空。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:_{3,}|＿{3,}|[（(]\s*[)）]|｛\s*｝|\{\s*\})[^。；\n]{0,20}/g)
    },
  },
  {
    id: 'labor.resignation-notice-over-30-days',
    title: '离职通知期超过 30 日',
    pack: 'labor',
    severity: 'medium',
    legalBasis: '《劳动合同法》第 37 条：劳动者提前 30 日以书面形式通知用人单位，可以解除劳动合同。',
    reason: '要求提前 60/90 日通知，超出法定期限，相当于用合同延长你的辞职成本。',
    suggestion: '要求改为 30 日；试用期内依法只需提前 3 日通知。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:辞职|离职|解除劳动合同|提出解除)[^。；\n]{0,20}(?:提前|需提前)[^。；\n]{0,6}?(\d{1,3})\s*(?:日|天)/g, (m) => {
        const days = Number(m[1])
        if (!Number.isFinite(days) || days <= 30) return null
        return { severity: 'medium', reason: `约定离职需提前 ${days} 天通知，超过法定的 30 日。` }
      })
    },
  },
]
