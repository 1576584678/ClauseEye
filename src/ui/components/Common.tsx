import type { ReactNode } from 'react'
import type { CategoryCode, Severity } from '../../core/types'
import { categoryDescription, categoryLabel, severityLabel } from '../format'
import { Icon, type IconName } from './Icon'

export function RiskBadge({ severity, count }: { severity: Severity; count?: number }) {
  return (
    <span className={`badge badge-${severity}`}>
      <span className="dot" />
      {severityLabel(severity)}
      {count !== undefined ? ` ${count}` : ''}
    </span>
  )
}

export function CategoryTag({ code, muted }: { code: CategoryCode; muted?: boolean }) {
  return (
    <span className={`tag ${muted ? 'tag-muted' : ''}`} title={categoryDescription(code)}>
      {categoryLabel(code)}
    </span>
  )
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'high' | 'medium' | 'low' | 'plain' }) {
  return (
    <div className={`stat stat-${tone ?? 'plain'}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
  icon = 'file-text',
}: {
  title: string
  description?: string
  action?: ReactNode
  icon?: IconName
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={26} />
      </div>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  )
}

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 640,
}: {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  )
}

export function Disclaimer({ compact }: { compact?: boolean }) {
  return (
    <div className={`disclaimer ${compact ? 'disclaimer-compact' : ''}`}>
      <span className="disclaimer-icon">
        <Icon name="scale" size={15} />
      </span>
      <span>
        AI 辅助，非法律意见。所有分析均在你的本机完成（BYOK 除外），结论仅供参考；涉及重大权益请咨询执业律师或当地劳动/人社部门。
      </span>
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="spinner-wrap">
      <span className="spinner" />
      {label ? <span className="muted">{label}</span> : null}
    </span>
  )
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="bar">
      <div className="bar-fill" style={{ width: `${Math.min(100, Math.max(4, value * 100))}%` }} />
    </div>
  )
}
