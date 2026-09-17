/** 租房合同 · v1 扩充包 */

import { findMatches, type Rule } from './engine'

export const RENT_V1_RULES: Rule[] = [
  {
    id: 'rent.deposit-deduct-any-reason',
    title: '押金可因任何理由扣除',
    pack: 'rent',
    severity: 'high',
    legalBasis: '《民法典》第 733 条：承租人按照约定方法使用租赁物，租赁物正常损耗不承担赔偿责任。',
    reason: '约定"出租方有权根据房屋状况自行决定扣除押金"，缺少客观标准，退租时押金极难全额拿回。',
    suggestion: '要求写明扣除押金的具体情形（人为损坏、欠费）与计算方式，并约定退租后 X 日内退还并出具明细。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /押金[^。；\n]{0,30}(?:有权|可|可以)[^。；\n]{0,10}(?:自行)?[^。；\n]{0,6}(?:扣除|扣减|不予退还)|(?:扣除|扣减)[^。；\n]{0,10}押金[^。；\n]{0,10}(?:而无需|无需|不必)[^。；\n]{0,8}(?:说明|证明|提供依据|征得同意)/g,
      )
    },
  },
  {
    id: 'rent.mandatory-cleaning-fee',
    title: '强制清洁费 / 管理费',
    pack: 'rent',
    severity: 'medium',
    legalBasis: '《民法典》第 497 条：格式条款不合理加重对方责任的，可能被认定无效。',
    reason: '退租时无论房屋是否干净都要扣"清洁费""保洁费"，属于变相扣押金。',
    suggestion: '要求删除，或写明"仅在实际发生清洁支出且经双方确认后，凭票据据实扣除"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:清洁费|保洁费|卫生费|消毒费)/g, (m) => {
        const near = ctx.text.slice(Math.max(0, m.index - 40), m.index + 40)
        if (/(?:据实|凭票据|实报实销|双方确认)/.test(near)) return null
        return {}
      })
    },
  },
  {
    id: 'rent.agency-fee-shifted',
    title: '中介费 / 服务费转由承租人承担',
    pack: 'rent',
    severity: 'medium',
    legalBasis: '《房地产经纪管理办法》第 19 条：经纪机构应当明码标价，不得收取未标明费用。',
    reason: '出租方应付的中介服务费被转嫁给你，或反复收取"看房费""信息服务费"。',
    suggestion: '确认费用由谁承担并写入合同；索取正规发票，拒绝合同之外的额外收费。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:中介费|居间费|服务费|信息服务费|看房费)[^。；\n]{0,20}(?:由)?(?:承租人|乙方|租客)[^。；\n]{0,6}(?:承担|支付|负担)/g,
      )
    },
  },
  {
    id: 'rent.lock-change-banned',
    title: '禁止更换门锁',
    pack: 'rent',
    severity: 'high',
    legalBasis: '《民法典》第 708 条：出租人应当履行交付义务并保证租赁物符合约定用途。',
    reason: '不允许换锁意味着前租客、中介、甚至房东都可能有钥匙，居住安全没有保障。',
    suggestion: '要求允许承租人在入住后更换锁芯，退租时恢复或双方协商折算。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:不得|禁止|不允许|严禁)[^。；\n]{0,10}(?:更换|换)[^。；\n]{0,6}(?:门锁|锁芯|门禁卡|钥匙)/g)
    },
  },
  {
    id: 'rent.guest-or-occupancy-limit',
    title: '限制居住人数 / 访客',
    pack: 'rent',
    severity: 'medium',
    legalBasis: '《民法典》第 703、708 条：承租人享有依约使用租赁物的权利，出租人不得非法干涉。',
    reason: '"不得留宿任何人""访客不得超过 X 小时"，过度限制正常使用，也常被用来没收押金。',
    suggestion: '要求把限制限定在合理范围（如不得转租、不得长期共同居住），删除对正常访客的约束。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:不得|禁止|不允许)[^。；\n]{0,10}(?:留宿|过夜|访客|朋友|亲属|居住人数|常住)/g,
      )
    },
  },
  {
    id: 'rent.extra-utility-deposit',
    title: '额外收取水电/设备押金',
    pack: 'rent',
    severity: 'medium',
    legalBasis: '《民法典》第 586 条：当事人可以约定定金，但不得重复担保同一债务。',
    reason: '在房租押金之外再收"水电押金""家电押金""门禁押金"，退租时往往被分别扣减。',
    suggestion: '要求合并为一次性押金，并写明退还条件与期限。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:水电|电费|水费|家电|家具|门禁|电梯|刷卡)[^。；\n]{0,6}押金/g,
      )
    },
  },
  {
    id: 'rent.compound-late-interest',
    title: '逾期利息 / 复利条款',
    pack: 'rent',
    severity: 'medium',
    legalBasis: '《民法典》第 585 条：约定的违约金过分高于造成的损失的，可以请求适当减少。',
    reason: '约定"逾期每日按 X% 计息并计复利"，实际年化远超合理范围。',
    suggestion: '要求改为按 LPR 或银行同期利率计算单利，并设置上限。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /逾期[^。；\n]{0,24}/g, (m) => {
        const window = m[0]
        if (!/(?:利息|滞纳金|违约金)/.test(window)) return null
        if (/(?:复利|利滚利|滚动计算)/.test(window)) {
          return { severity: 'high', reason: `逾期费用约定计复利（"${window.trim().slice(0, 28)}…"），实际负担会快速放大。` }
        }
        const daily = /每日[^。；\n]{0,8}?([\d.]+)\s*%/.exec(window)
        if (daily && Number(daily[1]) >= 0.5) {
          return { severity: 'medium', reason: `逾期日利率约 ${daily[1]}%（年化约 ${(Number(daily[1]) * 365).toFixed(0)}%），明显偏高。` }
        }
        return {}
      })
    },
  },
  {
    id: 'rent.landlord-only-termination',
    title: '仅出租方可提前解约',
    pack: 'rent',
    severity: 'high',
    legalBasis: '《民法典》第 497、705 条：格式条款不得单方免除自身责任、加重对方责任。',
    reason: '出租方可随时收回房屋且不担责，而你提前退租要付高额违约金，权利义务严重不对等。',
    suggestion: '要求双向对等：出租方提前收回须提前 X 日通知并退还未使用租金、赔偿搬迁损失。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /出租(?:方|人|房主|甲方)[^。；\n]{0,30}(?:有权|可|可以)[^。；\n]{0,12}(?:随时|提前|单方)[^。；\n]{0,10}(?:解除|收回|终止)/g,
      )
    },
  },
  {
    id: 'rent.pet-penalty',
    title: '养宠高额违约金',
    pack: 'rent',
    severity: 'medium',
    legalBasis: '《民法典》第 585 条：违约金过高可请求调减。',
    reason: '"一经发现养宠即扣全部押金/支付 X 个月房租违约金"，惩罚程度与实际损失不匹配。',
    suggestion: '若要约定禁止养宠，违约金应限于实际修复/清洁成本；约定合理区间即可。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:宠物|养宠|猫|狗)[^。；\n]{0,30}(?:违约金|扣(?:除|发)|押金不予退还|解除合同)/g)
    },
  },
  {
    id: 'rent.sublet-profit-to-landlord',
    title: '转租收益归出租方',
    pack: 'rent',
    severity: 'low',
    legalBasis: '《民法典》第 716 条：承租人经出租人同意可以转租。',
    reason: '约定转租产生的差价全部归出租方，超出正常租赁关系的合理范围。',
    suggestion: '若确需转租，约定"经出租方书面同意后可转租，租金差价归承租人"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /转租[^。；\n]{0,30}(?:差价|收益|利润|租金差额)[^。；\n]{0,10}(?:归|属于)[^。；\n]{0,8}(?:出租|甲方|房东)/g)
    },
  },
  {
    id: 'rent.tax-shifted-to-tenant',
    title: '税费转嫁承租人',
    pack: 'rent',
    severity: 'medium',
    legalBasis: '《税收征收管理法》及各地房屋租赁税收规定：出租人依法为纳税义务人。',
    reason: '约定"因本合同产生的所有税费由承租人承担"，包括出租方本应承担的房产税、个人所得税。',
    suggestion: '要求写明"税费按法律规定各自承担"；若对方要求你承担，应以此作为压低租金的筹码。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:税费|税金|租赁税|房产税|个人所得税)[^。；\n]{0,20}(?:由)?(?:承租人|乙方|租客)[^。；\n]{0,6}(?:承担|支付|负担)|(?:一切|所有)[^。；\n]{0,6}(?:税费|税金)[^。；\n]{0,8}(?:承租人|乙方|租客)[^。；\n]{0,6}(?:承担|支付)/g,
      )
    },
  },
  {
    id: 'rent.handover-without-checklist',
    title: '交接缺少清单与照片',
    pack: 'rent',
    severity: 'medium',
    legalBasis: '《民法典》第 733 条：返还租赁物时，正常损耗不承担赔偿责任。',
    reason: '入住与退租都不做物品清单确认，退租时"房屋损坏"的举证责任变相落到你身上。',
    suggestion: '要求双方签署《房屋及物品交接单》，逐项记录现状并拍照/录像，注明日期并双方签字。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:交接|交付|验收|退还)[^。；\n]{0,20}/g,
        (m) => {
          const window = ctx.text.slice(Math.max(0, m.index - 60), m.index + 120)
          if (/(?:清单|物品明细|交接单|拍照|录像|照片|逐项)/.test(window)) return null
          if (!/(?:房屋|家电|家具|物品|钥匙)/.test(window)) return null
          return {}
        },
      )
    },
  },
  {
    id: 'rent.third-party-liability-shift',
    title: '第三方损害责任转嫁',
    pack: 'rent',
    severity: 'medium',
    legalBasis: '《民法典》第 1198、1253 条：建筑物、构筑物致害由所有人、管理人承担责任。',
    reason: '约定"房屋内发生任何人身/财产损害，一律由承租人负责"，把建筑本身缺陷的风险也推给你。',
    suggestion: '要求改为"因承租人使用不当造成的损失由承租人承担；因房屋本身缺陷造成的损失由出租人承担"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:一切|任何|全部)[^。；\n]{0,10}(?:人身|财产|意外|损害|损失|事故)[^。；\n]{0,20}(?:由)?(?:承租人|乙方|租客)[^。；\n]{0,8}(?:承担|负责)/g,
      )
    },
  },
  {
    id: 'rent.deposit-auto-offset-rent',
    title: '押金自动抵扣租金',
    pack: 'rent',
    severity: 'low',
    legalBasis: '《民法典》第 586 条：押金（保证金）与租金性质不同，未经同意不得径行抵扣。',
    reason: '约定"最后一期租金可直接从押金中扣除"，看似方便，但一旦发生争议押金与租金会被混同，难以主张返还。',
    suggestion: '建议保持押金与租金分离：租金按约支付，押金在退租验收后单独退还。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:押金|保证金)[^。；\n]{0,20}(?:直接|自动|可|可以)[^。；\n]{0,8}(?:抵(?:扣)?|冲抵)[^。；\n]{0,8}(?:租金|房租)/g,
      )
    },
  },
  {
    id: 'rent.waive-preemption-right',
    title: '放弃优先购买权',
    pack: 'rent',
    severity: 'medium',
    legalBasis: '《民法典》第 726 条：出租人出卖租赁房屋，应当在合理期限内通知承租人，承租人在同等条件下有优先购买权。',
    reason: '约定"承租人无条件放弃优先购买权并配合办理一切手续"，房子被卖掉时你只能被动接受新房东和新租赁条件。',
    suggestion: '保留"同等条件优先购买"表述，或至少写明"房屋出售不影响本合同继续履行，买卖不破租赁"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:放弃|不主张)[^。；\n]{0,10}优先(?:购买|承租|续租)权|无条件[^。；\n]{0,12}优先购买权/g,
      )
    },
  },
]
