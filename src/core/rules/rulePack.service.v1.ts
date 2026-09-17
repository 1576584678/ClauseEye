/** 服务 / 外包 / 委托协议 · v1 扩充包 */

import { findMatches, type Rule } from './engine'

export const SERVICE_V1_RULES: Rule[] = [
  {
    id: 'service.full-advance-payment',
    title: '要求全额预付',
    pack: 'service',
    severity: 'high',
    legalBasis: '《民法典》第 509 条：当事人应当遵循诚信原则履行合同义务。',
    reason: '开工前一次性付清全款，一旦对方拖延或质量不合格，你几乎没有谈判筹码。',
    suggestion: '要求按里程碑分期付款（如 3:4:3），至少保留 20%—30% 在验收合格后支付。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:合同签订|签订后|开工前|开始前)[^。；\n]{0,16}(?:一次|全额|全部|100%)[^。；\n]{0,8}(?:支付|付款|预付)|(?:预付|预付全款|先付款)/g,
      )
    },
  },
  {
    id: 'service.deemed-acceptance',
    title: '验收视为通过条款',
    pack: 'service',
    severity: 'high',
    legalBasis: '《民法典》第 782 条：承揽人交付工作成果，定作人应当验收。',
    reason: '约定"交付后 3 日内未提出异议即视为验收合格"，实际上没有给你充分的验收时间。',
    suggestion: '要求把异议期延长到合理区间（如 10—15 个工作日），并写明验收标准与整改流程。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:\d{1,2}\s*(?:日|天|个工作日)内?)[^。；\n]{0,16}(?:未|不)[^。；\n]{0,8}(?:提出|回复|异议)[^。；\n]{0,10}(?:视为|即视为)[^。；\n]{0,8}(?:验收|合格|通过|确认)/g,
      )
    },
  },
  {
    id: 'service.nonrefundable-payment',
    title: '已付款项一律不退',
    pack: 'service',
    severity: 'high',
    legalBasis: '《民法典》第 566 条：合同解除后，尚未履行的终止履行；已经履行的，根据履行情况和合同性质，当事人可以请求恢复原状。',
    reason: '约定"无论何种原因终止，已付款项不予退还"，把对方违约的风险也转给了你。',
    suggestion: '要求按实际完成工作量结算，并写明"因对方违约或不可归责于甲方的原因终止时，未履行部分应退还"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:已付|已支付|已收取)[^。；\n]{0,12}(?:款项|费用|款)[^。；\n]{0,12}(?:不予退还|概不退还|不退还|不退)/g,
      )
    },
  },
  {
    id: 'service.client-only-termination',
    title: '仅委托方可无责终止',
    pack: 'service',
    severity: 'high',
    legalBasis: '《民法典》第 933 条：委托合同的委托人与受托人均可以随时解除合同。',
    reason: '委托方可以随时无责终止，而受托方终止要付高额违约金，权利义务明显不对等。',
    suggestion: '要求双向对等：任一方提前 X 日书面通知即可终止，并按已完成工作量结算。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:甲方|委托方|发包方|客户)[^。；\n]{0,24}(?:有权|可|可以)[^。；\n]{0,10}(?:随时|单方)?[^。；\n]{0,8}(?:解除|终止)[^。；\n]{0,16}(?:无需|不承担|不支付)/g,
      )
    },
  },
  {
    id: 'service.broad-indemnity',
    title: '无限连带赔偿 / 兜底赔偿',
    pack: 'service',
    severity: 'high',
    legalBasis: '《民法典》第 585 条：违约金与实际损失应相当。',
    reason: '约定"赔偿甲方及其关联方遭受的一切损失，并承担连带责任"，风险无法计量。',
    suggestion: '要求把赔偿限定为直接损失，并设置不超过合同总金额（或已收服务费）的赔偿上限。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:一切|全部|任何)[^。；\n]{0,12}(?:损失|责任)[^。；\n]{0,20}(?:连带|赔偿|承担)|(?:连带责任|连带赔偿)/g,
      )
    },
  },
  {
    id: 'service.invoice-tax-shift',
    title: '发票 / 税费由服务方承担',
    pack: 'service',
    severity: 'medium',
    legalBasis: '《发票管理办法》第 19 条：销售商品、提供服务以及从事其他经营活动的单位和个人，应当向付款方开具发票。',
    reason: '"如需发票，税费从服务费中扣除"，等于变相压价。',
    suggestion: '在报价时就把含税价写清楚；要求约定"服务费为含税价，甲方不得以开票为由扣减费用"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:如需|需要)[^。；\n]{0,8}发票[^。；\n]{0,16}(?:税费|税点|费用)[^。；\n]{0,10}(?:由|从)[^。；\n]{0,10}(?:乙方|服务方|承担|扣除)/g,
      )
    },
  },
  {
    id: 'service.noncompete-without-pay',
    title: '服务期竞业限制无补偿',
    pack: 'service',
    severity: 'medium',
    legalBasis: '《民法典》第 497 条：格式条款不合理限制对方主要权利的可能无效。',
    reason: '要求合作结束后 X 年内不得为同类客户提供服务，却不给任何补偿。',
    suggestion: '要求限定范围与期限，并约定相应的补偿金额；否则要求删除该条。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:竞业|同业竞争|不得为)[^。；\n]{0,40}/g, (m) => {
        const window = m[0]
        if (!/(?:不得|禁止|限制)/.test(window)) return null
        if (/(?:补偿|补偿金|费用)/.test(window)) return null
        return {}
      })
    },
  },
  {
    id: 'service.subcontract-ban',
    title: '禁止分包 / 转委托',
    pack: 'service',
    severity: 'low',
    legalBasis: '《民法典》第 923 条：受托人应当亲自处理委托事务，经委托人同意可以转委托。',
    reason: '完全禁止分包，却不说明违约责任与例外，个人服务者常需借助协作完成。',
    suggestion: '要求改为"经甲方书面同意可分包，乙方对分包部分承担连带责任"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:不得|禁止|未经同意)[^。；\n]{0,10}(?:分包|转包|转委托|委托第三方)/g)
    },
  },
  {
    id: 'service.delay-penalty-uncapped',
    title: '逾期违约金不设上限',
    pack: 'service',
    severity: 'high',
    legalBasis: '《民法典》第 585 条：约定的违约金过分高于造成的损失的，可以请求适当减少。',
    reason: '按日计罚且不设上限，一旦工期稍有延误，违约金可能超过合同总额。',
    suggestion: '要求设置违约金封顶（如不超过合同总金额的 10%—20%），并约定顺延工期的情形。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:每|按)[^。；\n]{0,6}(?:日|天)[^。；\n]{0,16}(?:违约金|罚款|扣款|%\u0025|百分之[一二三四五六七八九十]+)/g,
        (m) => {
          const window = ctx.text.slice(Math.max(0, m.index - 60), m.index + 120)
          if (/(?:不超过|上限|封顶|最高)/.test(window)) return null
          return {}
        },
      )
    },
  },
  {
    id: 'service.no-milestone-settlement',
    title: '一次性结算、无过程节点',
    pack: 'service',
    severity: 'medium',
    legalBasis: '《民法典》第 509 条：当事人应当遵循诚信原则履行合同义务。',
    reason: '只约定"项目结束一次性付款"，中期无法拿到进度款，现金流压力全在你这边。',
    suggestion: '要求按阶段结算：需求确认、中期交付、验收合格分别对应付款节点。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:项目|服务)[^。；\n]{0,12}(?:完成|结束|交付)[^。；\n]{0,14}(?:一次性|一次性支付|全额支付|结清)/g)
    },
  },
  {
    id: 'service.portfolio-rights-banned',
    title: '禁止展示作品 / 案例',
    pack: 'service',
    severity: 'low',
    legalBasis: '《民法典》第 465 条：合同约定不得违反法律强制性规定。',
    reason: '禁止以任何形式展示成果（含作品集、案例），会直接影响你后续获客。',
    suggestion: '要求增加例外："乙方可在脱敏后于作品集、案例中展示服务成果。"',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:不得|禁止)[^。；\n]{0,16}(?:展示|公开|宣传|作品集|案例|署名)/g)
    },
  },
  {
    id: 'service.liability-cap-none',
    title: '责任与收益严重不匹配',
    pack: 'service',
    severity: 'high',
    legalBasis: '《民法典》第 585 条：违约金的约定应当与损失相当。',
    reason: '合同金额很小，却要承担对方业务中断、数据丢失等巨额间接损失。',
    suggestion: '要求写入责任上限条款："乙方累计赔偿责任以已收取服务费总额为限。"',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:业务中断|数据丢失|利润损失|商誉损失|第三方索赔)/g, (m) => {
        const window = ctx.text.slice(Math.max(0, m.index - 80), m.index + 80)
        if (/(?:不超过|上限|以已收|服务费总额为限)/.test(window)) return null
        return {}
      })
    },
  },
]
