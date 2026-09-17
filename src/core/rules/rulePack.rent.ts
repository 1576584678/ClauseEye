/** 租房合同 · 种子规则包 v0.1（10 类高频坑点） */

import { findMatches, type Rule } from './engine'

export const RENT_RULES: Rule[] = [
  {
    id: 'rent.deposit-not-refundable',
    title: '押金不予退还',
    pack: 'rent',
    severity: 'high',
    legalBasis: '《民法典》第 733 条：租赁期限届满，承租人应当返还租赁物；押金扣除应限于实际损失。',
    reason: '约定押金一律不退、或因"墙面轻微污损/正常使用痕迹"全额扣除，属于典型的霸王条款。',
    suggestion: '改为"退租时双方现场验收，除实际损坏外应于 X 日内无息退还押金"，并在入住时拍照留证。',
    maxMatches: 3,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:押金|保证金|定金)[^。；\n]{0,30}(?:不予退还|不退还|概不退还|不退|没收|全部扣除|扣除全部)/g,
      )
    },
  },
  {
    id: 'rent.auto-renew',
    title: '自动续租',
    pack: 'rent',
    severity: 'high',
    legalBasis: '《民法典》第 734 条：租赁期限届满，承租人继续使用且出租人未提出异议的，原合同继续有效，但为不定期租赁。',
    reason: '约定"到期自动续租 X 个月/一年"会形成一个很难退出的新租期，退租即违约。',
    suggestion: '改为"到期前 30 日双方协商是否续租"，或明确约定为不定期租赁、随时可解除。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:到期|期满)[^。；\n]{0,12}自动(?:续租|续约|顺延|延期|展期)|(?:自动续租|自动续约)/g)
    },
  },
  {
    id: 'rent.unilateral-rent-increase',
    title: '出租方可单方涨租',
    pack: 'rent',
    severity: 'high',
    legalBasis: '《民法典》第 543 条：变更合同内容需双方协商一致。',
    reason: '租期内约定出租方"可根据市场行情调整租金"，会让你的预算完全失控。',
    suggestion: '要求固定租金，或约定"租期内不涨租；续租涨幅不超过 X%"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:租金|房租)[^。；\n]{0,24}(?:上调|涨价|上涨|调整|增加)[^。；\n]{0,24}|(?:甲方|出租方|出租人|房东)[^。；\n]{0,16}(?:有权|可以)[^。；\n]{0,16}(?:调整|上调|变更)[^。；\n]{0,10}(?:租金|房租)/g,
      )
    },
  },
  {
    id: 'rent.landlord-entry',
    title: '出租方可随时进入房屋',
    pack: 'rent',
    severity: 'high',
    legalBasis: '《民法典》第 1032 条（隐私权）、第 1033 条：不得侵扰他人私人生活安宁。',
    reason: '"房东可随时进入查看"会直接侵犯你的居住安宁与隐私，也存在财物纠纷风险。',
    suggestion: '改为"出租方需提前 24 小时书面通知并取得承租方同意，紧急情况（漏水/火警）除外"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:甲方|出租方|出租人|房东)[^。；\n]{0,24}(?:有权|可以|可)[^。；\n]{0,20}(?:随时|随时可|自行)[^。；\n]{0,10}(?:进入|入内|查看|检查|带看|开门)/g,
      )
    },
  },
  {
    id: 'rent.tenant-pays-all-repairs',
    title: '全部维修责任归承租方',
    pack: 'rent',
    severity: 'medium',
    legalBasis: '《民法典》第 712 条：出租人应当履行租赁物的维修义务，但当事人另有约定的除外。',
    reason: '把房屋主体、老旧设备的自然损坏维修全部推给租客，可能出现"修一次等于多付一个月房租"。',
    suggestion: '约定"自然损耗及房屋主体/原有家电设备的维修由出租方负责；因承租方使用不当造成的损坏由承租方负责"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:维修|修缮|修理|更换)[^。；\n]{0,40}/g,
        (m) => {
          if (!/(?:均由|全部由|都由|一概由|乙方负责|承租方承担|租客承担)/.test(m[0])) return null
          if (/(?:自然损耗|自然磨损)[^。；\n]{0,10}(?:由|归)[^。；\n]{0,10}(?:甲方|出租方)/.test(m[0])) return null
          return {}
        },
      )
    },
  },
  {
    id: 'rent.early-termination-penalty',
    title: '提前退租违约责任过重',
    pack: 'rent',
    severity: 'medium',
    legalBasis: '《民法典》第 585 条：约定违约金过分高于实际损失的，当事人可请求适当减少。',
    reason: '提前退租即没收全部押金 + 支付剩余租期租金，违约责任与实际损失严重不匹配。',
    suggestion: '争取"提前 30 日通知即可退租，违约金不超过 1 个月租金"，并写明转租可免责。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:提前退租|提前解除|提前终止|中途退租)[^。；\n]{0,60}/g, (m) => {
        if (!/(?:违约金|押金不退|没收押金|不予退还|扣除|全部租金|剩余租期)/.test(m[0])) return null
        if (/(?:没收押金|押金不退|不予退还押金|全部租金|剩余租期租金)/.test(m[0])) {
          return { severity: 'high', reason: '提前退租即没收押金/支付剩余租期全部租金，责任明显过重。' }
        }
        return {}
      })
    },
  },
  {
    id: 'rent.unilateral-takeback',
    title: '出租方可提前收回房屋',
    pack: 'rent',
    severity: 'high',
    legalBasis: '《民法典》第 708 条：出租人应当按照约定将租赁物交付承租人并在租赁期内保持其符合约定用途。',
    reason: '"出租方因出售/自用可提前收回，仅需通知"会让你随时面临搬家风险。',
    suggestion: '约定"租期内出租方不得单方收回；如因出售需收回，须提前 60 日通知并补偿 1—2 个月租金及搬家费用"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:甲方|出租方|出租人|房东)[^。；\n]{0,24}(?:有权|可以|可)[^。；\n]{0,20}(?:提前收回|收回房屋|终止合同|解除合同|收回该房屋)/g,
      )
    },
  },
  {
    id: 'rent.utilities-unclear',
    title: '水电物业费用约定不清',
    pack: 'rent',
    severity: 'low',
    legalBasis: '《民法典》第 509 条：当事人应当按照约定全面履行义务；约定不明易生争议。',
    reason: '只写"水电物业费由承租方承担"而无单价、抄表方式与缴费渠道，容易出现天价账单或欠费纠纷。',
    suggestion: '明确各项费用的单价、抄表起始读数、缴费主体与过户方式，并保留缴费凭证。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:水费|电费|燃气费|物业费|供暖费|宽带费|网络费)[^。；\n]{0,30}/g,
        (m) => (/(?:乙方|承租方|租客|住户)[^。；\n]{0,10}(?:承担|支付|自理)/.test(m[0]) ? {} : null),
      )
    },
  },
  {
    id: 'rent.sublet-ban',
    title: '禁止转租/禁止增加居住人',
    pack: 'rent',
    severity: 'low',
    legalBasis: '《民法典》第 716 条：承租人经出租人同意可以转租。',
    reason: '完全禁止转租且禁止提前退租，意味着一旦工作变动，你只能承担全部违约成本。',
    suggestion: '争取"经出租方书面同意可转租或更换承租人，出租方不得无理由拒绝"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:不得|禁止|严禁)[^。；\n]{0,12}(?:转租|分租|合租|增加居住人|留宿|借住)/g)
    },
  },
  {
    id: 'rent.late-fee',
    title: '逾期违约金/滞纳金偏高',
    pack: 'rent',
    severity: 'medium',
    legalBasis: '《民法典》第 585 条：违约金应以实际损失为基础。',
    reason: '按日计收高额滞纳金（如日万分之五以上、甚至按日租金双倍）会迅速放大逾期成本。',
    suggestion: '争取"逾期支付租金的违约金按日万分之三计算，且总额不超过当期租金的 10%"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(ctx, /(?:逾期|迟延|拖欠)[^。；\n]{0,30}(?:违约金|滞纳金|罚息)[^。；\n]{0,40}/g, (m) => {
        const rate = /(?:日|每天|每日)[^。；\n]{0,10}(\d+(?:\.\d+)?)\s*(%|‰|万分之|千分之)/.exec(m[0])
        if (!rate) return {}
        return { severity: 'high', reason: `逾期违约按日计收（约 ${rate[1]}${rate[2] === '%' ? '%' : rate[2]} / 日），累计金额会快速放大。` }
      })
    },
  },
]
