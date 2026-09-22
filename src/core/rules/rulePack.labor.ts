/** 劳动合同 · 种子规则包 v0.1（8 类高频坑点） */

import { extractTermMonths, legalProbationCapMonths, parseAmount, parseDurationMonths } from '../text'
import { findMatches, type Rule } from './engine'


/** 取片段中最像"金额"的数字：优先带单位（元/万/k）的数字，避免把"3 个月"当成工资金额 */
function amountNear(segment: string): number | null {
  const withUnit = /([\d][\d,]*(?:\.\d+)?)\s*(万元|万|w|W|千元|千|k|K|元)/.exec(segment)
  if (withUnit) return parseAmount(withUnit[0])
  const bare = /([\d][\d,]*(?:\.\d+)?)/.exec(segment)
  return bare ? parseAmount(bare[0]) : null
}

export const LABOR_RULES: Rule[] = [
  {
    id: 'labor.probation-over-limit',
    title: '试用期超出法定上限',
    pack: 'labor',
    severity: 'high',
    legalBasis: '《劳动合同法》第 19 条：合同期限 3 个月以上不满 1 年→试用期≤1 个月；1 年以上不满 3 年→≤2 个月；3 年以上或无固定期限→≤6 个月。',
    reason: '试用期长度超过法定上限，超出部分无效；同时也意味着更长时间的低薪/可随时辞退状态。',
    suggestion: '要求将试用期压到法定上限内，或改为"缩短试用期 + 转正后补差额"。',
    maxMatches: 2,
    detect(ctx) {
      const termMonths = extractTermMonths(ctx.text)
      const cap = legalProbationCapMonths(termMonths)
      return findMatches(ctx, /试用期[^。；]{0,40}/g, (m) => {
        // 窗口常把紧随其后的"劳动合同期限 2 年"一并纳入，先截断到第一段再解析
        const segment = m[0].split(/[，,；;。、()（）]|合同期限|劳动合同|合同有效期/)[0]
        const months = parseDurationMonths(segment)
        if (months === null) return null
        if (months <= cap) return null
        const termText = termMonths === null ? '未能识别合同期限' : `本合同期限约 ${termMonths} 个月`
        return {
          severity: 'high',
          reason: `约定试用期约 ${months} 个月；${termText}，对应的法定试用期上限为 ${cap || '不得约定试用期'}${
            cap ? ' 个月' : ''
          }（劳动合同法第 19 条）。`,
        }
      })
    },
  },
  {
    id: 'labor.probation-no-social-insurance',
    title: '试用期不缴社保',
    pack: 'labor',
    severity: 'high',
    legalBasis: '《社会保险法》第 58 条：用人单位应当自用工之日起 30 日内为职工办理社会保险登记。',
    reason: '社保从用工之日起就应缴纳，"试用期不缴、转正后再缴"属于违法约定，会直接影响医保报销、购房资格、工龄认定。',
    suggestion: '要求删除该约定，并在合同中写明"自用工之日起依法缴纳社会保险"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:试用期[^。；\n]{0,24}(?:不|暂不|不予|无需|不为其)[^。；\n]{0,12}(?:缴纳|购买|办理|参保)[^。；\n]{0,10}(?:社保|社会保险|五险一金))|(?:(?:转正|正式入职|转正后)(?:后|之后)?[^。；\n]{0,16}(?:才|方|再|予以)[^。；\n]{0,10}(?:缴纳|购买|办理)[^。；\n]{0,10}(?:社保|社会保险|五险一金))/g,
      )
    },
  },
  {
    id: 'labor.penalty-excessive',
    title: '违约金/赔偿金条款',
    pack: 'labor',
    severity: 'medium',
    legalBasis: '《劳动合同法》第 25 条：除服务期与竞业限制情形外，用人单位不得与劳动者约定由劳动者承担违约金。',
    reason: '劳动合同中约定劳动者违约金，除"服务期"和"竞业限制"两种法定情形外一律无效；若金额与实际损失严重不匹配，容易被用来施压。',
    suggestion: '确认违约金是否对应专项培训（服务期）或竞业限制；否则要求删除或写明"违约金不超过实际损失"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:违约金|赔偿金|罚金)[^。；\n]{0,50}/g, (m) => {
        if (/^(?:第[一二三四五六七八九十百]+条)?\s*(?:违约金|赔偿金|罚金)[：:]?$/.test(m[0].trim())) return null
        const harsh = /(?:全额|全部工资|双倍|三倍|十倍|月工资的?\s*\d+\s*倍|不予返还)/.test(m[0])
        const amount = parseAmount(m[0])
        if (harsh) {
          return {
            severity: 'high',
            reason: `违约金条款明显不对等（"${m[0].trim().slice(0, 24)}…"），常见于服务期/离职绑定的施压条款。`,
          }
        }
        if (amount !== null && amount >= 100000) {
          return { severity: 'high', reason: `约定违约金约 ${amount.toLocaleString('zh-CN')} 元，金额偏高且很可能超出实际损失。` }
        }
        return {}
      })
    },
  },
  {
    id: 'labor.unilateral-termination',
    title: '单方解除权不对等',
    pack: 'labor',
    severity: 'high',
    legalBasis: '《劳动合同法》第 39—41 条对解除情形作了法定限定；第 26 条规定排除劳动者权利的条款无效。',
    reason: '用人单位"可随时/无需理由解除"，而劳动者被限制离职，属于典型的单方解除权不对等条款。',
    suggestion: '要求对等化：双方解除均需提前 30 日书面通知，或按法定情形列举。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:甲方|公司|用人单位|本单位)[^。；\n]{0,24}(?:有权|可以|可)[^。；\n]{0,16}(?:随时|立即|单方|无需理由|不需理由)[^。；\n]{0,16}(?:解除|终止|辞退|不再聘用)/g,
      )
    },
  },
  {
    id: 'labor.noncompete',
    title: '竞业限制约定异常',
    pack: 'labor',
    severity: 'medium',
    legalBasis: '《劳动合同法》第 23、24 条：竞业限制期限不得超过 2 年，且用人单位应按月给予经济补偿。',
    reason: '竞业限制超过 2 年、或未约定经济补偿，会限制离职后的就业选择却不给对应补偿。',
    suggestion: '确认竞业期限 ≤ 2 年、范围/地域具体，并写明离职后按月发放的补偿标准（通常不低于月均工资的 30%）。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /竞业(?:限制|禁止)[^。；]{0,90}/g, (m) => {
        const months = parseDurationMonths(m[0])
        if (months !== null && months > 24) {
          return {
            severity: 'high',
            reason: `竞业限制期限约 ${months} 个月，超过法定上限 2 年，超出部分无效。`,
          }
        }
        if (!/补偿|补偿金|经济补偿/.test(m[0])) {
          return { severity: 'medium', reason: '竞业限制未同时约定经济补偿，离职后可能"只受限、无补偿"。' }
        }
        return null
      })
    },
  },
  {
    id: 'labor.unpaid-overtime',
    title: '无偿加班 / 放弃加班费',
    pack: 'labor',
    severity: 'high',
    legalBasis: '《劳动法》第 44 条、《劳动合同法》第 31 条：安排加班应依法支付加班费，不得强迫或变相强迫加班。',
    reason: '约定"加班不支付加班费""自愿放弃加班费"或实行 996/大小周且不付加班费，均属违法安排。',
    suggestion: '要求删除该约定；若确有加班需求，写明调休或按法定倍数支付加班费的计算方式。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:(?:加班|延时工作|延长工作时间)[^。；\n]{0,24}(?:不支付|不予支付|不另行支付|不计算|无加班费|没有加班费))|(?:(?:自愿|同意|承诺|放弃)[^。；\n]{0,16}(?:放弃)?[^。；\n]{0,10}加班费)|(?:\b996\b|大小周|7\s*[-×*]\s*7)/g,
      )
    },
  },
  {
    id: 'labor.deposit-or-id-retention',
    title: '押金 / 扣押证件',
    pack: 'labor',
    severity: 'high',
    legalBasis: '《劳动合同法》第 9 条：用人单位招用劳动者，不得扣押证件，不得要求提供担保或以其他名义收取财物。',
    reason: '入职押金、保证金、培训押金、扣押身份证/毕业证均属明确违法。',
    suggestion: '拒绝缴纳任何形式的押金；如已缴纳，保留转账凭证可要求返还并向劳动监察部门投诉。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:入职|培训|服装|工牌|设备)?(?:押金|保证金|抵押金)|(?:扣押|代为保管|暂存)[^。；\n]{0,10}(?:身份证|毕业证|学位证|职业资格证|证件)/g,
      )
    },
  },
  {
    id: 'labor.waive-social-insurance',
    title: '约定放弃社保',
    pack: 'labor',
    severity: 'high',
    legalBasis: '《社会保险法》：社会保险为法定强制义务，双方约定放弃无效。',
    reason: '"员工自愿放弃社保、公司折现补贴"的约定无效，一旦发生工伤/医疗/生育，损失由个人先行承担。',
    suggestion: '要求依法参保；如公司以补贴代替社保，可要求恢复参保（补贴可协商折算）。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:(?:自愿|同意|承诺|申请)[^。；\n]{0,20}(?:放弃|不缴纳|不参加|不办理)[^。；\n]{0,12}(?:社保|社会保险|五险一金))|(?:(?:以|用)[^。；\n]{0,10}(?:现金|补贴)[^。；\n]{0,10}(?:代替|替代)[^。；\n]{0,10}(?:社保|社会保险))/g,
      )
    },
  },
  {
    id: 'labor.auto-renew',
    title: '自动续签 / 自动顺延',
    pack: 'labor',
    severity: 'medium',
    legalBasis: '《劳动合同法》第 26 条：排除劳动者主要权利的条款可能无效。',
    reason: '约定"到期自动顺延 X 年""视为双方同意续签"，会剥夺你在续签时重新谈薪谈岗的机会。',
    suggestion: '改为"到期前 30 日双方书面协商续签条件"，或明确到期即终止。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:自动(?:续签|续订|续约|顺延|展期))|(?:视为(?:双方)?(?:同意)?(?:续签|续订|续约))/g)
    },
  },
  {
    id: 'labor.probation-pay-low',
    title: '试用期工资偏低/未明确',
    pack: 'labor',
    severity: 'medium',
    legalBasis: '《劳动合同法》第 20 条：试用期工资不得低于本单位相同岗位最低档工资或合同约定工资的 80%，且不得低于当地最低工资标准。',
    reason: '试用期工资低于正式工资 80%，或只写"按公司规定"而不写具体数字，都会导致实际收入缩水。',
    suggestion: '要求写明试用期与转正后的具体金额，并确认试用期不低于转正工资的 80%。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /试用期[^。；]{0,20}(?:工资|薪资|报酬|待遇)[^。；]{0,40}/g, (m) => {
        const window = m[0]
        const percent = /(\d{1,3})\s*%/.exec(window)
        if (percent) {
          const value = Number(percent[1])
          if (value < 80) return { severity: 'medium', reason: `试用期工资为转正工资的 ${value}%，低于法定下限 80%。` }
          return null
        }
        const parts = window.split(/(?:转正|正式)/)
        const trial = amountNear(parts[0] ?? '')
        const formal = parts[1] ? amountNear(parts[1]) : null
        if (trial !== null && formal !== null && formal > 0) {
          const ratio = Math.round((trial / formal) * 100)
          if (ratio < 80) {
            return {
              severity: 'medium',
              reason: `试用期工资 ${trial.toLocaleString('zh-CN')} 元仅为转正工资 ${formal.toLocaleString('zh-CN')} 元的 ${ratio}%，低于法定下限 80%。`,
            }
          }
          return null
        }
        if (/\d/.test(window)) return {}
        return { severity: 'low', reason: '试用期工资未写明具体金额，实际发放存在不确定性。' }
      })
    },
  },
]




