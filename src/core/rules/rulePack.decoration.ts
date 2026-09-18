/** 装修 / 家装合同 · 规则包 v0.5（12 类高频坑点） */

import { findMatches, type Rule } from './engine'

/** 从"60%"这种片段里取数字 */
function percentOf(raw: string): number {
  const m = raw.match(/(\d{1,3})\s*%/)
  return m ? Number(m[1]) : 0
}

export const DECORATION_RULES: Rule[] = [
  {
    id: 'decoration.advance-payment-too-high',
    title: '开工前付款比例过高',
    pack: 'decoration',
    severity: 'high',
    legalBasis: '《民法典》第 626 条、第 627 条：定作人应按约定支付报酬，但进度款应与已完成工作量相匹配。',
    reason: '开工前就支付 50% 以上（常见是 60%）的工程款，一旦施工方停工、跑路或质量问题返工，主动权完全不在业主手里。',
    suggestion: '改为按节点付款（如开工 30%、水电验收 30%、竣工验收 30%、质保金 10%），并约定停工超过 X 日的解约与退款条款。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:首期款|首付款|预付款|开工前|合同签订(?:后|之日起))[^。；\n]{0,28}?(\d{1,3})\s*%/g,
        (m) => (percentOf(m[0]) >= 50 ? { severity: 'high' } : null),
      )
    },
  },
  {
    id: 'decoration.deadline-not-fixed',
    title: '工期不固定',
    pack: 'decoration',
    severity: 'medium',
    legalBasis: '《民法典》第 510 条：合同约定不明确时应协商补充，无法补充的按交易习惯确定。',
    reason: '约定"工期以实际进度为准"或"竣工日期另行协商"，等于没有工期约束，拖延数月也难以主张违约金。',
    suggestion: '写明开工日、竣工日与总日历天数，并约定工期顺延必须书面确认（否则不予顺延）。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:工期|施工周期|竣工日期|完工日期)[^。；\n]{0,26}(?:以|按)[^。；\n]{0,16}(?:实际|实际情况|进度|现场情况)[^。；\n]{0,10}(?:为准|确定)|(?:工期|竣工日期|完工日期)[^。；\n]{0,20}(?:另行|双方另行|再行)[^。；\n]{0,10}(?:协商|约定|确认)/g,
      )
    },
  },
  {
    id: 'decoration.extra-items-unlimited',
    title: '增项费用无上限',
    pack: 'decoration',
    severity: 'high',
    legalBasis: '《民法典》第 543 条：变更合同内容应协商一致；《消费者权益保护法》第 8 条：消费者享有知情权。',
    reason: '装修公司最常用的手法：先低价签单，再靠"增项"把总价抬高 30%～100%，而条款里写着"按实结算、不设上限"。',
    suggestion: '约定"增项须经业主书面确认后方可施工；未确认的增项业主有权拒付"，并设定总价上浮上限（如不超过合同价的 5%）。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:增项|增加项目|变更项目|追加项目|现场变更)[^。；\n]{0,30}(?:按实结算|据实结算|另行协商|以实际发生为准|不设上限|不封顶|据实调整)/g,
      )
    },
  },
  {
    id: 'decoration.material-substitution',
    title: '材料品牌可"同等"替代',
    pack: 'decoration',
    severity: 'medium',
    legalBasis: '《民法典》第 577 条：擅自变更标的物属于违约；《住宅室内装饰装修管理办法》第 24 条要求按图施工、不得擅自改动。',
    reason: '"可替换为同等档次品牌"没有客观标准，实际常被换成低价的杂牌产品，且业主很难举证"不同等"。',
    suggestion: '把品牌、型号、规格逐项写进《主材清单》并作为合同附件；确需替换需业主书面同意，差价按实退补。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:材料|主材|产品|品牌)[^。；\n]{0,26}(?:同等|同类|相当|类似|相近)[^。；\n]{0,16}(?:替代|更换|调整)|(?:乙方|施工方|装修公司|承包方)[^。；\n]{0,22}(?:有权|可)[^。；\n]{0,14}(?:更换|调整|替换)[^。；\n]{0,12}(?:材料|品牌|主材)/g,
      )
    },
  },
  {
    id: 'decoration.warranty-too-short',
    title: '保修期低于规定',
    pack: 'decoration',
    severity: 'medium',
    legalBasis: '《住宅室内装饰装修管理办法》第 32 条：装修工程保修期自竣工验收合格之日起不少于 2 年，有防水要求的厨房、卫生间和外墙面防渗漏为 5 年。',
    reason: '保修期低于国家规定（整体 2 年、防水 5 年）的约定无效，但写在合同里会让业主在出问题时被施工方以此推诿。',
    suggestion: '写明"保修期不低于国家规定的 2 年，防水工程 5 年"，并写明报修响应时间与维修费用承担方。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:保修|质保)[^。；\n]{0,16}?(\d{1,2})\s*(?:个)?月|(?:保修|质保)[^。；\n]{0,16}?(\d{1,2})\s*年/g,
        (m) => {
          const months = m[1] ? Number(m[1]) : Number(m[2]) * 12
          return months < 24 ? { severity: months <= 6 ? 'high' : 'medium' } : null
        },
      )
    },
  },
  {
    id: 'decoration.quality-standard-vague',
    title: '验收标准由施工方说了算',
    pack: 'decoration',
    severity: 'medium',
    legalBasis: '《民法典》第 511 条：质量要求不明确的，按照强制性国家标准履行；没有强制性国家标准的，按照推荐性国家标准履行。',
    reason: '约定"以本公司施工标准为准"，把验收标准交给施工方单方解释，业主按国标提出的问题都会被驳回。',
    suggestion: '约定"按国家标准（GB 50327、GB 50210 等）与企业标准中较高者验收"，并写明验收流程与整改期限。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:验收|质量标准|质量)[^。；\n]{0,26}(?:以|按)[^。；\n]{0,18}(?:乙方|公司|施工方|装修公司)[^。；\n]{0,14}(?:标准|要求|规范)[^。；\n]{0,8}(?:为准|执行)/g,
      )
    },
  },
  {
    id: 'decoration.contractor-delay-no-liability',
    title: '施工方逾期不担责',
    pack: 'decoration',
    severity: 'high',
    legalBasis: '《民法典》第 577 条、第 584 条：违约方应承担继续履行、赔偿损失等责任。',
    reason: '工期延误是装修最常见的纠纷，若条款写"乙方不承担逾期责任"或"因材料、工人原因延误不视为违约"，业主只能被动等。',
    suggestion: '约定逾期违约金（如每日合同价的 0.05%～0.1%），并写明超过 30 日业主有权解除合同并要求退款。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:乙方|施工方|装修公司|承包方)[^。；\n]{0,26}(?:逾期|延期|延误)[^。；\n]{0,20}(?:不承担|无需承担|不视为违约|不构成违约|不予追究)/g,
      )
    },
  },
  {
    id: 'decoration.risk-all-on-owner',
    title: '施工风险全部由业主承担',
    pack: 'decoration',
    severity: 'high',
    legalBasis: '《民法典》第 1192 条：提供劳务一方因劳务受到损害的，按双方各自过错承担相应责任；第 1258 条：施工人应对施工造成的损害承担侵权责任。',
    reason: '施工过程中工人受伤、楼下漏水、公共设施损坏，条款却写成"一切责任由业主承担"，等于把第三方侵权责任也揽到自己身上。',
    suggestion: '约定施工方负责现场安全管理、为其人员购买保险；因施工造成的第三方损失由施工方承担。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:一切|全部|任何)[^。；\n]{0,14}(?:责任|损失|风险|事故|后果)[^。；\n]{0,18}(?:由|均由)[^。；\n]{0,10}(?:甲方|业主)[^。；\n]{0,8}承担|(?:人身伤害|人员伤亡|人身损害|工伤事故)[^。；\n]{0,26}与(?:乙方|施工方|装修公司)无关/g,
      )
    },
  },
  {
    id: 'decoration.final-payment-before-acceptance',
    title: '先付尾款再验收',
    pack: 'decoration',
    severity: 'medium',
    legalBasis: '《民法典》第 782 条：承揽人交付工作成果后，定作人应当验收；付款义务与交付、验收相对等。',
    reason: '要求业主在验收前付清尾款，等于放弃了对质量问题的唯一筹码——扣款权。',
    suggestion: '改为"竣工验收合格并完成整改后 X 日内支付尾款，保留 5%～10% 质保金至保修期满"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:尾款|末期款|竣工款|验收款)[^。；\n]{0,26}(?:支付|付清|结清)[^。；\n]{0,18}后[^。；\n]{0,12}验收|验收(?:之前|前)[^。；\n]{0,18}(?:付清|结清|支付)[^。；\n]{0,12}(?:尾款|全部款项|剩余款项)/g,
      )
    },
  },
  {
    id: 'decoration.hidden-works-skipped',
    title: '隐蔽工程不验收不拍照',
    pack: 'decoration',
    severity: 'medium',
    legalBasis: '《住宅室内装饰装修管理办法》第 24 条：隐蔽部位应经业主验收后方可封闭。',
    reason: '水电、防水一旦封闭就无法检查，不验收、不留照片等于放弃对最贵、最易出问题的工序的监督。',
    suggestion: '约定水电、防水等隐蔽工程必须经业主验收并留存照片/视频后方可封闭，并提供管线走向图。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /隐蔽工程[^。；\n]{0,26}(?:不|无需|免)[^。；\n]{0,12}(?:验收|确认|留存|拍照|通知)|(?:水电|防水|管线)[^。；\n]{0,18}(?:封闭|覆盖)[^。；\n]{0,26}(?:不通知|不告知|无需|不必)[^。；\n]{0,10}(?:验收|确认|业主)/g,
      )
    },
  },
  {
    id: 'decoration.owner-materials-all-risk',
    title: '业主自购材料全部担责',
    pack: 'decoration',
    severity: 'low',
    legalBasis: '《民法典》第 776 条：定作人提供的材料，承揽人应及时检验并通知定作人；未通知即使用的，承揽人应承担相应责任。',
    reason: '材料由业主自购不等于施工方可以免责：施工方有检验与提醒义务。条款写成"一切后果由业主承担"会放大你的责任。',
    suggestion: '约定"业主自购材料由施工方负责验收与保管，发现问题应及时通知；未通知即使用的质量后果由施工方承担"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:甲方|业主)[^。；\n]{0,22}(?:自行采购|自购|自行提供|提供)[^。；\n]{0,16}(?:材料|主材)[^。；\n]{0,26}(?:一切|全部|所有)[^。；\n]{0,12}(?:责任|后果|质量)[^。；\n]{0,14}(?:由|均由)[^。；\n]{0,10}(?:甲方|业主)[^。；\n]{0,8}承担/g,
      )
    },
  },
  {
    id: 'decoration.environment-waiver',
    title: '环保 / 甲醛不达标不负责',
    pack: 'decoration',
    severity: 'high',
    legalBasis: '《民法典》第 509 条、第 582 条：《民用建筑工程室内环境污染控制标准》GB 50325 为强制性标准。',
    reason: '用的板材、胶水不达标导致甲醛超标，条款却写"空气质量由业主自行负责"，直接放弃了对健康最重要的保障。',
    suggestion: '约定"竣工后按 GB/T 18883 或 GB 50325 检测，不合格由施工方免费整改并承担检测费；整改期间不计入工期的按违约处理"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:甲醛|空气质量|环保检测|室内环境)[^。；\n]{0,30}(?:不承担|不负责|不予保证|自行负责|与(?:乙方|施工方|装修公司)无关)/g,
      )
    },
  },
]
