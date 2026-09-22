/**
 * BYOK（Bring Your Own Key）深度分析。
 * 只把必要的条款文本发往"用户自己指定的模型接口"，ClauseEye 不做任何中转与留存；
 * 离线模式下该模块会直接拒绝所有请求。
 */

import { mergeModelRisks, type MergeOutcome, type ModelRiskInput } from '../core/analyze'
import type { OfferComparison } from '../core/offer'
import type { AnalysisResult, AppSettings, DocumentRecord, Severity } from '../core/types'

export class OfflineModeError extends Error {
  constructor() {
    super('离线模式已开启：ClauseEye 不会发出任何网络请求。如需 BYOK 深度分析，请在设置中关闭离线模式。')
  }
}

export class ByokNotConfiguredError extends Error {
  constructor() {
    super('尚未启用 BYOK：请在「设置」中填写你自己的模型接口地址、模型名与 API Key。')
  }
}

const MAX_PROMPT_CHARS = 14000

/** 仅本机回环地址允许使用明文 http（本地推理服务常见场景） */
const LOCAL_HTTP = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i

interface ChatOptions {
  temperature?: number
  timeoutMs?: number
}

function endpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (!trimmed) throw new Error('接口地址为空')
  // 明文 http 会把 Authorization: Bearer 暴露在链路上，只放行本机回环地址
  if (!/^https:\/\//i.test(trimmed) && !LOCAL_HTTP.test(trimmed)) {
    throw new Error('接口地址必须使用 https（仅本机 localhost/127.0.0.1 可用 http），否则 API Key 会以明文传输')
  }
  if (/\/chat\/completions$/.test(trimmed)) return trimmed
  return `${trimmed}/chat/completions`
}

async function chatJson(settings: AppSettings, system: string, user: string, options: ChatOptions = {}): Promise<unknown> {
  if (settings.offlineMode) throw new OfflineModeError()
  const { enabled, apiKey, baseUrl, model } = settings.byok
  if (!enabled || !apiKey.trim()) throw new ByokNotConfiguredError()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 90_000)

  const body: Record<string, unknown> = {
    model: model.trim(),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: options.temperature ?? 0.2,
    response_format: { type: 'json_object' },
  }

  try {
    let response = await fetch(endpoint(baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (response.status === 400) {
      // 部分兼容接口不支持 response_format，降级重试一次
      delete body.response_format
      response = await fetch(endpoint(baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`模型接口返回 ${response.status}${detail ? `：${detail.slice(0, 200)}` : ''}`)
    }

    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] }
    const content = payload.choices?.[0]?.message?.content ?? ''
    return parseJsonLoose(content)
  } finally {
    clearTimeout(timer)
  }
}

export function parseJsonLoose(content: string): unknown {
  const trimmed = content.trim()
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed)
  const candidate = fenced ? fenced[1].trim() : trimmed
  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1))
      } catch {
        /* ignore */
      }
    }
    throw new Error('模型返回内容不是合法 JSON，已忽略本次结果。')
  }
}

const SEVERITY_VALUES: Severity[] = ['high', 'medium', 'low']

function normalizeSeverity(value: unknown): Severity {
  return SEVERITY_VALUES.includes(value as Severity) ? (value as Severity) : 'medium'
}

const REVIEW_SYSTEM = `你是帮助普通个人快速读懂合同的助手。你只做文本提示，不提供法律意见，也不做律师工作。
硬性要求：
1. 只针对用户提供的合同原文，不要引入外部事实；引用必须逐字复制原文片段。
2. 每条风险必须同时给出：原文引用（quote）、通俗解释（reason）、可执行的修订建议（suggestion）。
3. 风险等级只能用 high / medium / low 三档。
4. 只输出 JSON，不要输出任何解释性文字或 Markdown。
5. 若原文中不存在明显风险，返回空数组，不要编造。`

function buildReviewPrompt(doc: DocumentRecord, analysis: AnalysisResult): string {
  const clauses = analysis.clauses
    .map((c) => `【${c.index + 1}】${c.text.replace(/\s+/g, ' ').trim()}`)
    .join('\n')
  const body = clauses.slice(0, MAX_PROMPT_CHARS)
  const truncated = clauses.length > MAX_PROMPT_CHARS
  return `文档标题：${doc.title}
已识别场景：${analysis.category}
本地规则引擎已发现的问题（不要重复报告同一条款）：${
    analysis.risks.map((r) => `[${r.severity}] ${r.ruleTitle}`).join('；') || '无'
  }

请你找出本地规则遗漏、但确实对个人不利的条款（例如责任不对等、隐性成本、程序性陷阱、表述不清导致的风险）。

合同条款文本：
${body}${truncated ? '\n（文本过长已截断，仅分析以上内容）' : ''}

输出 JSON 结构：
{"risks":[{"severity":"high|medium|low","quote":"逐字原文片段","reason":"为什么对个人不利","suggestion":"怎么改或怎么谈","legalBasis":"可选，已知的法律依据"}]}`
}

export async function analyzeWithByok(
  settings: AppSettings,
  doc: DocumentRecord,
  analysis: AnalysisResult,
): Promise<MergeOutcome> {
  const raw = (await chatJson(settings, REVIEW_SYSTEM, buildReviewPrompt(doc, analysis))) as {
    risks?: unknown
  }
  const list = Array.isArray(raw?.risks) ? raw.risks : []
  const incoming: ModelRiskInput[] = list.slice(0, 20).map((item) => {
    const record = (item ?? {}) as Record<string, unknown>
    return {
      severity: normalizeSeverity(record.severity),
      quote: typeof record.quote === 'string' ? record.quote : '',
      reason: typeof record.reason === 'string' ? record.reason : '',
      suggestion: typeof record.suggestion === 'string' ? record.suggestion : undefined,
      legalBasis: typeof record.legalBasis === 'string' ? record.legalBasis : undefined,
    }
  })
  return mergeModelRisks(analysis, doc.text, incoming)
}

const OFFER_SYSTEM = `你是一位务实的职业顾问。用户会提供多份 Offer 的结构化对比数据，请给出简明的比较建议。
硬性要求：
1. 只依据用户提供的数据，不臆测未提供的信息；数据缺失时要明确说明。
2. 只输出 JSON：{"advice":["...","..."]}，3—6 条，每条不超过 80 字。
3. 最后一条必须提醒"最终决定应结合个人职业规划，不构成任何法律或职业意见"。`

export async function adviseOffersWithByok(settings: AppSettings, comparison: OfferComparison): Promise<string[]> {
  const payload = {
    columns: comparison.columns.map((c, i) => ({ title: c.title, score: comparison.scores[i], rank: comparison.ranks[i] })),
    rows: comparison.rows.map((r) => ({ field: r.label, values: r.cells })),
    localAdvice: comparison.advice,
  }
  const raw = (await chatJson(settings, OFFER_SYSTEM, JSON.stringify(payload))) as { advice?: unknown }
  const advice = Array.isArray(raw?.advice) ? raw.advice.filter((a): a is string => typeof a === 'string') : []
  if (advice.length === 0) throw new Error('模型未返回有效建议。')
  return advice
}

/** 设置页的连通性自检（仍然受离线模式限制） */
export async function testByokConnection(settings: AppSettings): Promise<{ ok: boolean; latencyMs: number; message: string }> {
  const started = Date.now()
  try {
    const raw = (await chatJson(
      settings,
      '你是一个测试端点，只输出 JSON。',
      '请仅输出 {"ok":true}',
      { timeoutMs: 20_000, temperature: 0 },
    )) as { ok?: boolean }
    return {
      ok: true,
      latencyMs: Date.now() - started,
      message: raw?.ok === false ? '接口可达，但返回内容异常。' : '接口连通正常，可以开始使用 BYOK 深度分析。',
    }
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - started, message: error instanceof Error ? error.message : String(error) }
  }
}

export function byokAvailable(settings: AppSettings): boolean {
  return !settings.offlineMode && settings.byok.enabled && settings.byok.apiKey.trim().length > 0
}
