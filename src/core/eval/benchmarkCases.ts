/**
 * 评测基准用例集
 *
 * 目的：让"规则库改动是否让识别变差"这件事可量化。
 * 每条用例都是一段真实语境下会出现的条款文本，并标注：
 * - expectHit：必须命中的规则（漏报 = recall 下降）
 * - expectMiss：必须不命中的规则（误报 = precision 下降）
 */

export interface BenchmarkCase {
  id: string
  title: string
  text: string
  expectHit: string[]
  expectMiss?: string[]
}

export const BENCHMARK_CASES: BenchmarkCase[] = [
  {
    id: 'labor-probation-over-limit',
    title: '2 年合同 + 6 个月试用期',
    text: '劳动合同期限为 2 年，自 2026 年 3 月 1 日起至 2028 年 2 月 28 日止。试用期为 6 个月，试用期工资为每月 8000 元。',
    expectHit: ['labor.probation-over-limit'],
  },
  {
    id: 'labor-legal-probation',
    title: '合法试用期不误报',
    text: '劳动合同期限为 3 年。试用期为 3 个月，试用期工资为每月 13500 元，转正后工资为每月 15000 元。',
    expectHit: [],
    expectMiss: ['labor.probation-over-limit', 'labor.probation-pay-low'],
  },
  {
    id: 'labor-waive-social-insurance',
    title: '约定放弃社保',
    text: '乙方自愿放弃参加社会保险，甲方每月另行发放社保补贴 500 元，此后不得再向甲方主张社保权益。',
    expectHit: ['labor.waive-social-insurance'],
  },
  {
    id: 'labor-annual-leave-waiver',
    title: '年休假权利被排除',
    text: '劳动合同\n\n第十二条 休假\n乙方知悉并同意：在职期间不享受带薪年休假，亦不向甲方主张未休年休假工资。',
    expectHit: ['labor.annual-leave-waiver'],
  },
  {
    id: 'rent-deposit-not-refundable',
    title: '押金不予退还',
    text: '租赁期满或合同提前解除的，乙方已支付的押金不予退还。',
    expectHit: ['rent.deposit-not-refundable'],
  },
  {
    id: 'rent-legal-deposit',
    title: '合规押金条款不误报',
    text: '租赁期满，乙方结清全部费用并完成房屋交接后，甲方应于 7 日内将押金全额退还乙方。',
    expectHit: [],
    expectMiss: ['rent.deposit-not-refundable', 'rent.deposit-deduct-any-reason'],
  },
  {
    id: 'rent-mandatory-cleaning-fee',
    title: '强制清洁费',
    text: '退租时乙方须支付清洁费 800 元，该费用由甲方从押金中直接扣除。',
    expectHit: ['rent.mandatory-cleaning-fee'],
  },
  {
    id: 'rent-waive-preemption-right',
    title: '放弃优先购买权',
    text: '租赁期内甲方有权出售该房屋，乙方无条件放弃优先购买权，并配合甲方办理一切手续。',
    expectHit: ['rent.waive-preemption-right'],
  },
  {
    id: 'offer-discretionary-bonus',
    title: '年终奖酌情发放',
    text: '录用通知书（Offer Letter）\n\n三、薪酬\n年终奖根据公司当年经营状况酌情发放，公司有权决定是否发放及发放金额。',
    expectHit: ['offer.discretionary-bonus'],
  },
  {
    id: 'nda-perpetual',
    title: '保密期限无上限',
    text: '保密协议\n\n第一条 保密义务\n本协议项下的保密义务长期有效，不因本协议终止或解除而终止。',
    expectHit: ['nda.perpetual'],
  },
  {
    id: 'resignation-reason-personal',
    title: '离职原因写成个人原因',
    text: '离职证明：兹证明某某同志因个人原因离职，双方劳动关系于 2026 年 5 月 20 日解除。',
    expectHit: ['resignation.reason-personal'],
  },
  {
    id: 'injury-recheck-deadline',
    title: '未提示再次鉴定期限',
    text: '劳动能力鉴定结论通知书\n\n被鉴定人伤情尚需进一步观察，初步意见如上，最终结论以复查为准。',
    expectHit: ['injury.no-recheck-deadline'],
  },
  {
    id: 'common-final-interpretation-right',
    title: '最终解释权归一方',
    text: '本合同的最终解释权归甲方所有。',
    expectHit: ['common.final-interpretation-right'],
  },
  {
    id: 'common-unlimited-liability',
    title: '责任无上限',
    text: '乙方对因本项目产生的一切损失向甲方承担无限连带赔偿责任。',
    expectHit: ['common.unlimited-liability'],
  },
  {
    id: 'service-ip-transfer-all',
    title: '成果知识产权全部归对方',
    text: '技术服务合同（委托服务协议）\n\n第五条 知识产权\n本项目产生的全部成果及其知识产权自始归委托方所有，服务方不得主张任何权利。',
    expectHit: ['service.ip-transfer-all'],
  },
  {
    id: 'house-deposit-forfeit-only-buyer',
    title: '定金只约束买方',
    text: '二手房买卖合同\n\n第三条 定金\n乙方于本合同签订之日支付定金 50,000 元。乙方违约或反悔不购买的，定金不予退还。',
    expectHit: ['house.deposit-forfeit-only-buyer'],
  },
  {
    id: 'house-legal-deposit',
    title: '对等的定金条款不误报',
    text: '二手房买卖合同\n\n第三条 定金\n乙方支付定金 50,000 元。乙方依约履行后，定金抵作购房款；卖方违约的，应双倍返还定金。',
    expectHit: [],
    expectMiss: ['house.deposit-forfeit-only-buyer'],
  },
  {
    id: 'house-all-taxes-on-buyer',
    title: '全部税费转嫁给买方',
    text: '二手房买卖合同\n\n第六条 税费承担\n本次交易产生的全部税费均由买方承担。',
    expectHit: ['house.all-taxes-on-buyer'],
  },
  {
    id: 'house-mortgage-unresolved',
    title: '抵押未解除且与买方无关',
    text: '二手房买卖合同\n\n第五条 房屋抵押情况\n该房屋目前存在银行抵押，抵押解除事宜与买方无关，由甲方自行处理。',
    expectHit: ['house.mortgage-or-seizure-unresolved'],
  },
  {
    id: 'decoration-advance-payment-too-high',
    title: '开工前付 60% 工程款',
    text: '家庭装饰装修施工合同\n\n第二条 付款方式\n合同签订后开工前，甲方支付工程款的 60%；竣工验收后支付剩余款项。',
    expectHit: ['decoration.advance-payment-too-high'],
  },
  {
    id: 'decoration-warranty-too-short',
    title: '保修期仅 6 个月',
    text: '家庭装饰装修施工合同\n\n第七条 保修\n本工程保修期为 6 个月，自竣工验收合格之日起计算。',
    expectHit: ['decoration.warranty-too-short'],
  },
  {
    id: 'decoration-legal-payment-and-warranty',
    title: '节点付款与合规保修期不误报',
    text: '家庭装饰装修施工合同\n\n第二条 付款方式\n开工前支付 30%，水电验收合格后支付 30%，竣工验收合格后支付 35%，质保期满后支付 5%。\n\n第七条 保修\n本工程保修期为 5 年。',
    expectHit: [],
    expectMiss: ['decoration.advance-payment-too-high', 'decoration.warranty-too-short'],
  },
  {
    id: 'driving-no-refund',
    title: '中途退学不退费',
    text: '机动车驾驶培训服务协议\n\n第二条 退费\n乙方中途退学的，已缴纳的培训费不予退还。',
    expectHit: ['driving.no-refund-on-withdraw'],
  },
  {
    id: 'driving-legal-refund',
    title: '按已完成学时退费不误报',
    text: '机动车驾驶培训服务协议\n\n第二条 退费\n乙方因个人原因申请退学的，驾校按照已完成培训学时扣除相应费用后，将剩余培训费退还乙方。',
    expectHit: [],
    expectMiss: ['driving.no-refund-on-withdraw'],
  },
  {
    id: 'driving-injury-waiver',
    title: '培训期间人身伤害免责',
    text: '机动车驾驶培训服务协议\n\n第六条 车辆与安全\n培训期间发生的人身伤害、意外事故与驾校无关。',
    expectHit: ['driving.injury-waiver'],
  },
  {
    id: 'driving-personal-info-marketing',
    title: '个人信息用于第三方营销',
    text: '机动车驾驶培训服务协议\n\n第八条 个人信息\n乙方同意甲方将报名信息、联系方式用于合作方的营销推广。',
    expectHit: ['driving.personal-info-marketing'],
  },
]
