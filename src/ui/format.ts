import { CATEGORY_MAP } from '../core/classify'
import type { CategoryCode, Severity } from '../core/types'

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatDateOnly(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const diff = Date.now() - then
  const minute = 60_000
  if (diff < minute) return '刚刚'
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))} 小时前`
  const days = Math.floor(diff / (24 * 60 * minute))
  if (days < 30) return `${days} 天前`
  return formatDateOnly(iso)
}

export function categoryLabel(code: CategoryCode): string {
  return CATEGORY_MAP[code]?.short ?? '其他'
}

export function categoryDescription(code: CategoryCode): string {
  return CATEGORY_MAP[code]?.description ?? ''
}

export function severityLabel(severity: Severity): string {
  return severity === 'high' ? '高风险' : severity === 'medium' ? '中风险' : '低风险'
}

export function daysUntil(iso: string): number {
  const target = new Date(`${iso}T00:00:00`).getTime()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target - today.getTime()) / 86_400_000)
}

export function dueText(iso: string): string {
  const days = daysUntil(iso)
  if (days === 0) return '今天'
  if (days === 1) return '明天'
  if (days > 0) return `${days} 天后`
  return `已过期 ${Math.abs(days)} 天`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
