/**
 * ClauseEye 核心领域模型。
 * 该文件不依赖任何 UI / 运行时环境，便于被 UI、测试、以及未来的 Tauri(Rust) 侧复用。
 */

/** 文档分类（当前覆盖的种子场景） */
export type CategoryCode =
  | 'labor' // 劳动合同
  | 'rent' // 租房合同
  | 'offer' // 录用通知 / Offer
  | 'resignation' // 离职证明
  | 'injury' // 工伤鉴定 / 劳动能力鉴定
  | 'nda' // 保密协议
  | 'service' // 服务 / 外包 / 委托协议
  | 'house' // 二手房买卖
  | 'decoration' // 装修 / 家装
  | 'driving' // 驾校培训
  | 'other'

export type RulePackId = CategoryCode | 'common'

/** 风险等级：高 = 可能造成重大财产损失或权益丧失；中 = 明显不利但可协商；低 = 表述模糊，建议澄清 */
export type Severity = 'high' | 'medium' | 'low'

export interface CategoryMeta {
  code: CategoryCode
  name: string
  /** 卡片上的短标签 */
  short: string
  description: string
  rulePack: RulePackId
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  high: '高风险',
  medium: '中风险',
  low: '低风险',
}

export const SEVERITY_ORDER: Severity[] = ['high', 'medium', 'low']

/** 条款块：按"第 X 条"/段落切分后的内容片段，保留在原文中的偏移量以便高亮 */
export interface ClauseBlock {
  index: number
  page: number | null
  title: string
  text: string
  start: number
  end: number
}

export type FlagStatus = 'open' | 'confirmed' | 'false_positive'

export interface RiskFlag {
  id: string
  ruleId: string
  ruleTitle: string
  severity: Severity
  /** 命中的原文片段（必须能在原文中定位） */
  quote: string
  quoteStart: number | null
  clauseIndex: number | null
  /** 通俗解释：为什么这是坑 */
  reason: string
  /** 修订建议 */
  suggestion: string
  /** 法条 / 依据（可选） */
  legalBasis?: string
  /** true = 由 BYOK 模型识别 */
  byModel: boolean
  status: FlagStatus
  createdAt: string
}

export type KeyDateKind = 'start' | 'end' | 'deadline' | 'obligation'

export interface KeyDate {
  label: string
  kind: KeyDateKind
  /** ISO 日期（YYYY-MM-DD）；无法换算为绝对日期时为 null */
  date: string | null
  /** 相对表述，如"自收到鉴定结论之日起 15 日内" */
  relativeText?: string
  /** 原文引用 */
  source: string
}

export interface AnalysisResult {
  category: CategoryCode
  categoryConfidence: number
  categoryScores: { code: CategoryCode; score: number; hits: string[] }[]
  clauses: ClauseBlock[]
  risks: RiskFlag[]
  keyDates: KeyDate[]
  engine: 'rules' | 'rules+byok'
  rulesVersion: string
  analyzedAt: string
  /** 分析过程中的提示（如：BYOK 未启用、模型输出被降级等） */
  notes: string[]
}

export interface DocumentRecord {
  id: string
  title: string
  category: CategoryCode
  fileName: string
  mimeType: string
  sizeBytes: number
  importedAt: string
  /** 原文哈希，用于识别重复导入 */
  sourceHash: string
  /** 纯文本正文（本地加密存储） */
  text: string
  pageCount: number | null
  analysis: AnalysisResult | null
}

/** CYOK = Bring Your Own Key：调用用户自己指定的大模型 */
export interface ByokSettings {
  enabled: boolean
  /** OpenAI 兼容的接口地址，如 https://api.deepseek.com/v1 */
  baseUrl: string
  model: string
  apiKey: string
}

export interface AppSettings {
  /** 离线模式：开启后彻底禁止任何网络请求（含 BYOK） */
  offlineMode: boolean
  byok: ByokSettings
  /** 结果页是否默认展开低风险条目 */
  showLowRisk: boolean
  /** 关键日期到期时弹出系统通知（仅桌面版生效） */
  systemNotifications: boolean
  /** 提前多少天提醒 */
  reminderLeadDays: number
  /** 无口令模式下，用系统钥匙串（DPAPI / Keychain）保护主密钥 */
  useKeychain: boolean
  /** 启动后自动检查新版本（唯一会联网的行为，只读取版本号） */
  autoCheckUpdates: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  offlineMode: true,
  byok: {
    enabled: false,
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiKey: '',
  },
  showLowRisk: true,
  systemNotifications: true,
  reminderLeadDays: 7,
  useKeychain: true,
  autoCheckUpdates: true,
}

export interface IngestedDoc {
  fileName: string
  mimeType: string
  sizeBytes: number
  text: string
  pageCount: number | null
  /** 解析过程中的提示 / 降级说明 */
  warnings: string[]
}
