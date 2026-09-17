import { useMemo, useState } from 'react'
import { CATEGORIES, CATEGORY_MAP } from '../../core/classify'
import { summarizeRisks } from '../../core/rules'
import type { CategoryCode } from '../../core/types'
import { useApp } from '../../state/store'
import { CategoryTag, EmptyState, RiskBadge, Stat } from '../components/Common'
import { ImportPanel } from '../components/ImportPanel'
import { Icon } from '../components/Icon'
import { formatBytes, formatRelative } from '../format'
import { navigate } from '../router'

export function VaultPage() {
  const { documents, removeDocument, loadAllSamples } = useApp()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<CategoryCode | 'all'>('all')
  const [importOpen, setImportOpen] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return documents.filter((doc) => {
      if (filter !== 'all' && doc.category !== filter) return false
      if (!keyword) return true
      return doc.title.toLowerCase().includes(keyword) || doc.text.toLowerCase().includes(keyword)
    })
  }, [documents, filter, query])

  const overview = useMemo(() => {
    const all = documents.flatMap((doc) => doc.analysis?.risks ?? [])
    const counts = summarizeRisks(all)
    const upcoming = documents
      .flatMap((doc) => doc.analysis?.keyDates ?? [])
      .filter((d) => d.date && new Date(`${d.date}T00:00:00`).getTime() >= Date.now() - 86_400_000).length
    return { ...counts, upcoming }
  }, [documents])

  const categoryCounts = useMemo(() => {
    const map = new Map<CategoryCode, number>()
    for (const doc of documents) map.set(doc.category, (map.get(doc.category) ?? 0) + 1)
    return map
  }, [documents])

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>保险箱</h1>
          <p className="muted">
            共 {documents.length} 份文档，全部以 AES-GCM 加密存放在本机；离线模式下的所有分析都不会联网。
          </p>
        </div>
        <div className="row gap">
          {documents.length === 0 ? (
            <button type="button" className="btn" onClick={() => void loadAllSamples()}>
              载入示例文档
            </button>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={() => setImportOpen(true)}>
            <Icon name="plus" size={16} /> 导入文档
          </button>
        </div>
      </header>

      <section className="stats">
        <Stat label="文档总数" value={documents.length} />
        <Stat label="高风险条款" value={overview.high} tone="high" />
        <Stat label="中风险条款" value={overview.medium} tone="medium" />
        <Stat label="低风险提示" value={overview.low} tone="low" />
        <Stat label="即将到期/待办日期" value={overview.upcoming} />
      </section>

      <section className="toolbar">
        <input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索标题或全文…" />
        <div className="chips">
          <button type="button" className={filter === 'all' ? 'chip active' : 'chip'} onClick={() => setFilter('all')}>
            全部 {documents.length}
          </button>
          {CATEGORIES.filter((c) => categoryCounts.get(c.code)).map((c) => (
            <button
              key={c.code}
              type="button"
              className={filter === c.code ? 'chip active' : 'chip'}
              onClick={() => setFilter(c.code)}
              title={c.description}
            >
              {c.short} {categoryCounts.get(c.code)}
            </button>
          ))}
        </div>
      </section>

      {filtered.length === 0 ? (
        <EmptyState
          icon="archive"
          title={documents.length === 0 ? '保险箱还是空的' : '没有匹配的文档'}
          description={
            documents.length === 0
              ? '导入你的第一份合同／Offer／证明，ClauseEye 会自动分类并标出坑点。数据不会离开这台设备。'
              : '试试更换关键词或分类筛选。'
          }
          action={
            documents.length === 0 ? (
              <div className="row gap">
                <button type="button" className="btn btn-primary" onClick={() => setImportOpen(true)}>
                  导入文档
                </button>
                <button type="button" className="btn" onClick={() => void loadAllSamples()}>
                  载入示例文档
                </button>
              </div>
            ) : null
          }
        />
      ) : (
        <section className="doc-grid">
          {filtered.map((doc) => {
            const counts = summarizeRisks(doc.analysis?.risks ?? [])
            return (
              <article key={doc.id} className="doc-card" onClick={() => navigate({ name: 'doc', id: doc.id })}>
                <div className="doc-card-head">
                  <CategoryTag code={doc.category} />
                  <span className="muted small">{formatRelative(doc.importedAt)}</span>
                </div>
                <h3>{doc.title}</h3>
                <div className="doc-card-meta muted small">
                  {CATEGORY_MAP[doc.category]?.description}
                  <br />
                  {doc.fileName} · {formatBytes(doc.sizeBytes)}
                  {doc.pageCount ? ` · ${doc.pageCount} 页` : ''}
                </div>
                <div className="doc-card-foot">
                  <div className="row gap-sm">
                    {counts.high > 0 ? <RiskBadge severity="high" count={counts.high} /> : null}
                    {counts.medium > 0 ? <RiskBadge severity="medium" count={counts.medium} /> : null}
                    {counts.low > 0 ? <RiskBadge severity="low" count={counts.low} /> : null}
                    {counts.total === 0 ? <span className="tag tag-muted">未发现明显坑点</span> : null}
                  </div>
                  <button
                    type="button"
                    className="link-btn danger"
                    onClick={(e) => {
                      e.stopPropagation()
                      setConfirmId(doc.id)
                    }}
                  >
                    删除
                  </button>
                </div>
              </article>
            )
          })}
        </section>
      )}

      <ImportPanel open={importOpen} onClose={() => setImportOpen(false)} />

      {confirmId ? (
        <div className="modal-backdrop" onClick={() => setConfirmId(null)} role="presentation">
          <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>确认删除</h2>
            </div>
            <div className="modal-body">
              <p>删除后该文档及其分析结果将从本机加密库中永久移除，无法恢复。</p>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn" onClick={() => setConfirmId(null)}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={async () => {
                  const id = confirmId
                  setConfirmId(null)
                  if (id) await removeDocument(id)
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

