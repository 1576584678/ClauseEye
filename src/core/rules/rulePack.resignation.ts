/** 离职证明 · 种子规则包 v0.1 */

import { findMatches, wholeDocMatch, type Rule } from './engine'

const REQUIRED_ITEMS: { label: string; pattern: RegExp }[] = [
  { label: '劳动合同期限/在职起止', pattern: /(?:合同期限|在职期间|自\s*\d{4}\s*年|入职(?:日期|时间)|自[^。；\n]{0,20}起)/ },
  { label: '离职/解除日期', pattern: /(?:离职(?:日期|时间)|解除(?:日期|时间)|终止(?:日期|时间)|于[^。；\n]{0,20}(?:离职|解除|终止))/ },
  { label: '工作岗位', pattern: /(?:岗位|职位|职务|担任)/ },
  { label: '在本单位工作年限', pattern: /(?:在本单位(?:工作|任职)[^。；\n]{0,20})|(?:工作年限|工龄)/ },
]

export const RESIGNATION_RULES: Rule[] = [
  {
    id: 'resignation.waive-claims',
    title: '"双方再无争议/放弃权利"条款',
    pack: 'resignation',
    severity: 'high',
    legalBasis: '《劳动合同法》第 26 条：排除劳动者权利的条款无效，但实际争议中会造成举证困难。',
    reason: '离职证明里写"双方再无任何争议、放弃一切请求"，会显著增加你日后追讨欠薪、加班费、经济补偿的难度。',
    suggestion: '要求删除该表述；离职证明只做事实性记载（劳动合同法实施条例第 24 条）。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:(?:双方|甲乙双方)[^。；\n]{0,16}(?:再无|无任何|不存在)[^。；\n]{0,16}(?:争议|纠纷|劳动关系|未了事宜))|(?:(?:放弃|不再主张|不再要求)[^。；\n]{0,16}(?:任何|一切)?[^。；\n]{0,10}(?:权利|主张|请求|补偿|赔偿))/g,
      )
    },
  },
  {
    id: 'resignation.negative-wording',
    title: '离职原因含负面评价',
    pack: 'resignation',
    severity: 'high',
    legalBasis: '《劳动合同法实施条例》第 24 条：离职证明应写明劳动合同期限、解除或终止日期、工作岗位、在本单位工作年限，不得记载与劳动关系无关的负面信息。',
    reason: '记载"因严重违反规章制度被辞退/被开除/不胜任"，会直接影响背景调查与再就业，也可能构成名誉侵权。',
    suggestion: '要求改为中性表述（如"因个人原因/双方协商一致解除"），并保留原劳动合同与考勤记录。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:(?:因|由于)[^。；\n]{0,16}(?:严重违反|违纪|失职|过错|不胜任|不符合录用条件)[^。；\n]{0,20})|(?:(?:予以|决定|特此)[^。；\n]{0,8}(?:辞退|开除|除名))/g,
      )
    },
  },
  {
    id: 'resignation.missing-required-fields',
    title: '离职证明要素缺失',
    pack: 'resignation',
    severity: 'medium',
    legalBasis: '《劳动合同法实施条例》第 24 条：离职证明应当写明劳动合同期限、解除或终止日期、工作岗位、在本单位工作年限。',
    reason: '缺少法定要素的离职证明在新单位入职、落户、社保转移、失业金申领时会被退回。',
    suggestion: '要求补充：劳动合同起止时间、离职日期、岗位、在职年限，并加盖单位公章。',
    maxMatches: 1,
    detect(ctx) {
      const missing = REQUIRED_ITEMS.filter((item) => !item.pattern.test(ctx.text)).map((i) => i.label)
      if (missing.length === 0) return []
      return [wholeDocMatch(ctx, { reason: `离职证明缺少法定要素：${missing.join('、')}。` })]
    },
  },
  {
    id: 'resignation.settled-claim',
    title: '"工资/加班费已结清"表述需核对',
    pack: 'resignation',
    severity: 'medium',
    reason: '出具"薪酬、加班费、年休假已全部结清"的确认，可能被视为对未付款项的放弃，务必先核对到账。',
    suggestion: '先核对工资条与银行流水；未结清前不要签署"已结清/无异议"表述，或要求附"明细以财务结算为准"。',
    maxMatches: 2,
    detect(ctx) {
      return findMatches(
        ctx,
        /(?:工资|薪资|薪酬|加班费|年休假|经济补偿)[^。；\n]{0,20}(?:已结清|已结|已支付完毕|已发放完毕|无异议)/g,
      )
    },
  },
]
