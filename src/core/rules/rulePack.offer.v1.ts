/** Offer（录用通知）· v1 扩充包 */

import { findMatches, type Rule } from './engine'

export const OFFER_V1_RULES: Rule[] = [
  {
    id: 'offer.verbal-invalid',
    title: '口头承诺无效 / 以书面为准',
    pack: 'offer',
    severity: 'medium',
    legalBasis: '《民法典》第 469 条：当事人订立合同可以采用书面形式、口头形式或者其他形式。',
    reason: '约定"仅以书面文件为准，任何口头承诺无效"，会让 HR 面谈时承诺的薪资、职级、期权难以主张。',
    suggestion: '要求把关键承诺（薪资、职级、签字费、期权）全部写进 Offer 正文，再签署。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:口头|面谈|口头承诺|沟通)[^。；\n]{0,16}(?:无效|不构成|不作为|不予认可)[^。；\n]{0,10}(?:依据|承诺|约定)?|(?:以|仅以)[^。；\n]{0,10}书面[^。；\n]{0,10}(?:为)?准/g,
      )
    },
  },
  {
    id: 'offer.variable-pay-ratio-high',
    title: '浮动薪资占比过高',
    pack: 'offer',
    severity: 'high',
    legalBasis: '《劳动合同法》第 17 条：劳动报酬为劳动合同必备条款。',
    reason: '把大部分收入放进"绩效奖金""项目奖金"，发放条件由公司单方评定，实际到手可能大幅低于预期。',
    suggestion: '要求写明固定月薪与浮动部分的比例；浮动部分的发放条件、考核标准与历史发放比例要落到书面上。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:绩效|浮动|奖金|提成)[^。；\n]{0,40}/g, (m) => {
        const percent = /(\d{1,3})\s*%/.exec(m[0])
        if (!percent) return null
        const value = Number(percent[1])
        if (value < 20) return null
        return {
          severity: value >= 40 ? 'high' : 'medium',
          reason: `浮动部分占薪资的 ${value}%，且发放条件由公司评定，实际到手存在不确定性。`,
        }
      })
    },
  },
  {
    id: 'offer.discretionary-bonus',
    title: '年终奖"酌情发放"',
    pack: 'offer',
    severity: 'medium',
    legalBasis: '《劳动合同法》第 30 条：用人单位应当按照劳动合同约定和国家规定，向劳动者及时足额支付劳动报酬。',
    reason: '"公司有权根据经营状况决定是否发放年终奖"，意味着年终奖没有任何可主张的确定性。',
    suggestion: '要求写明年终奖的计发基数、比例、发放时间与考核口径；至少写入"上年度实际发放不低于 X 个月"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:年终奖|年终奖金|十三薪|十四薪)[^。；\n]{0,40}(?:酌情|视|根据(?:公司)?经营|由公司决定|不保证|可能不予发放|有权不予发放)/g,
      )
    },
  },
  {
    id: 'offer.equity-no-vesting',
    title: '期权缺少归属安排',
    pack: 'offer',
    severity: 'high',
    legalBasis: '《民法典》第 470 条：合同内容应当包括履行期限、方式等条款。',
    reason: '只写"授予 X 股期权"，不写行权价、归属周期（vesting）、离职后处理，期权几乎无法兑现。',
    suggestion: '要求书面明确：授予总量、行权价、归属节奏（如 4 年 1 年 cliff）、加速归属条件、离职后行权窗口。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:期权|股权激励|限制性股票|RSU|ESOP)[^。；\n]{0,60}/g, (m) => {
        const window = m[0]
        if (!/(?:股|份|期权)/.test(window)) return null
        if (/(?:行权价|归属|vesting|分\s*\d\s*年|cliff|成熟|兑现)/i.test(window)) return null
        return {
          severity: 'high',
          reason: `期权条款未写明行权价与归属安排（"${window.trim().slice(0, 30)}…"），条款缺乏可执行性。`,
        }
      })
    },
  },
  {
    id: 'offer.equity-repurchase',
    title: '离职后期权被强制回购',
    pack: 'offer',
    severity: 'high',
    legalBasis: '《民法典》第 585 条：约定的违约责任应与其造成的损失相当。',
    reason: '约定离职时公司可按"原始出资额/面值"回购已归属股权，等于把已归属的收益收回。',
    suggestion: '要求区分"已归属"与"未归属"部分：已归属部分不得以低于公允价格回购。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:回购|收回|无偿收回|按(?:原始)?出资额)[^。；\n]{0,30}(?:股权|期权|股份|份额)|(?:离职|解除)[^。；\n]{0,16}(?:股权|期权|股份)[^。；\n]{0,16}(?:回购|收回)/g,
      )
    },
  },
  {
    id: 'offer.noncompete-without-pay',
    title: 'Offer 附竞业限制但无补偿',
    pack: 'offer',
    severity: 'high',
    legalBasis: '《劳动合同法》第 23 条：竞业限制期间应当按月给予经济补偿。',
    reason: 'Offer 阶段就要求接受竞业限制却没有补偿约定，入职后会被绑定。',
    suggestion: '要求写明竞业限制的期限、范围与月度补偿金额，否则不签。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /竞业[^。；\n]{0,50}/g, (m) => {
        if (/(?:补偿|补偿金|按月支付)/.test(m[0])) return null
        return {}
      })
    },
  },
  {
    id: 'offer.probation-pay-undisclosed',
    title: '试用期薪资未明确',
    pack: 'offer',
    severity: 'medium',
    legalBasis: '《劳动合同法》第 20 条：试用期工资不得低于约定工资的 80%，且不低于当地最低工资。',
    reason: '"试用期薪资面议/另议"是最常见的信息缺口，入职后往往按低于承诺的数字执行。',
    suggestion: '要求 Offer 写明试用期与转正后的具体数字（或至少写明试用期为转正的百分比）。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /试用期[^。；\n]{0,24}(?:工资|薪资|薪酬|待遇)[^。；\n]{0,20}/g,
        (m) => {
          if (/(?:另议|面议|另定|待定|以(?:公司)?规定为准|另行约定)/.test(m[0])) return {}
          // 已写明具体数字视为明确，否则按"未明确"上报
          if (/\d/.test(m[0])) return null
          return {}
        },
      )
    },
  },
  {
    id: 'offer.location-adjustable',
    title: '工作地点可调整',
    pack: 'offer',
    severity: 'medium',
    legalBasis: '《劳动合同法》第 17 条：工作地点属于劳动合同必备条款。',
    reason: '"公司有权根据业务需要调整工作地点"可能让你日后被要求跨城办公。',
    suggestion: '要求写明具体办公地址；如需弹性条款，约定"调整限于同城，且提供交通补贴或搬迁支持"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:工作地点|办公地点|常驻地点)[^。；\n]{0,30}(?:可|可以|有权|根据)[^。；\n]{0,16}(?:调整|变更|安排|调动)/g,
      )
    },
  },
  {
    id: 'offer.salary-includes-overtime',
    title: 'Offer 薪资含加班费',
    pack: 'offer',
    severity: 'high',
    legalBasis: '《劳动法》第 44 条：延长工作时间应依法支付加班工资。',
    reason: 'Offer 阶段就把加班费打包进月薪，等于提前放弃了加班费请求权。',
    suggestion: '要求删除；确认加班费计算基数与调休规则，必要时在入职前书面确认。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:薪资|薪酬|月薪|年薪|package|总包)[^。；\n]{0,24}(?:已包含|包含|已含|含)[^。；\n]{0,10}(?:加班|加班费|加班工资)/gi,
      )
    },
  },
  {
    id: 'offer.revocable-anytime',
    title: 'Offer 可随时撤销',
    pack: 'offer',
    severity: 'high',
    legalBasis: '《民法典》第 476、477 条：要约可以撤销，但受要约人有理由认为不可撤销并已合理信赖的除外。',
    reason: '"本 Offer 不构成劳动合同，公司有权随时撤回"，意味着你辞职后可能拿不到这份工作。',
    suggestion: '要求写明"自签署之日起生效，公司撤销需承担相应责任"；至少在离职前取得书面确认。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:有权|可|可以)[^。；\n]{0,10}(?:随时|单方|无条件)?[^。；\n]{0,6}(?:撤回|撤销|取消|作废)[^。；\n]{0,10}(?:本)?(?:Offer|录用通知|offer|聘用通知)|(?:不构成|并非)[^。；\n]{0,10}(?:劳动合同|聘用合同|正式合同)/gi,
      )
    },
  },
  {
    id: 'offer.service-period-bond',
    title: 'Offer 绑定服务期',
    pack: 'offer',
    severity: 'medium',
    legalBasis: '《劳动合同法》第 22 条：只有提供专项培训费用才能约定服务期。',
    reason: '入职即约定服务期与违约金（如"未满 2 年离职赔偿 X 万"），但未提供专项培训。',
    suggestion: '要求删除；如确有培训，要求写明培训项目、费用与实际报销凭证。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:服务期|最低服务年限|未满\s*\d+\s*年)[^。；\n]{0,30}(?:违约金|赔偿|退还)/g,
      )
    },
  },
  {
    id: 'offer.social-insurance-minimum-base',
    title: '社保按最低基数缴纳',
    pack: 'offer',
    severity: 'high',
    legalBasis: '《社会保险法》第 60 条：用人单位应当自行申报、按时足额缴纳社会保险费。',
    reason: '按最低基数缴纳会直接影响医保报销额度、生育津贴、失业保险金与将来的养老金。',
    suggestion: '要求按实际工资作为缴费基数；若公司坚持，需评估对落户/购房/生育待遇的影响。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:社保|社会保险|公积金)[^。；\n]{0,24}(?:按|以)[^。；\n]{0,10}(?:最低|下限)[^。；\n]{0,10}(?:基数|标准)/g,
      )
    },
  },
  {
    id: 'offer.defer-to-labor-contract',
    title: '关键条款推给"以劳动合同为准"',
    pack: 'offer',
    severity: 'medium',
    legalBasis: '《劳动合同法》第 10 条：已建立劳动关系，未同时订立书面劳动合同的，应当自用工之日起一个月内订立。',
    reason: 'Offer 把薪资、岗位、期限等关键内容统统推给"以最终劳动合同为准"，等于 Offer 阶段没有任何约束力，签约时容易被改条件。',
    suggestion: '要求 Offer 自身写明签约主体全称、岗位、薪资、合同期限与报到时间；并注明"劳动合同不得低于本 Offer 条件"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:具体|最终|详细)[^。；\n]{0,10}(?:以|按)[^。；\n]{0,10}(?:劳动合同|正式合同|聘用合同)[^。；\n]{0,10}(?:为)?准|(?:先|可)[^。；\n]{0,6}(?:入职|到岗)[^。；\n]{0,10}(?:后|再)[^。；\n]{0,6}(?:补签|签订)[^。；\n]{0,6}(?:劳动合同|合同)/g,
      )
    },
  },
]
