import { useEffect, useMemo, useState } from 'react'
import { buildComparison, extractOffer } from '../../core/offer'
import type { DocumentRecord } from '../../core/types'
import { adviseOffersWithByok } from '../../llm/byok'
import { useApp } from '../../state/store'
import { CategoryTag, Disclaimer, EmptyState, Progress } from '../components/Common'
import { Icon } from '../components/Icon'
import { formatRelative } from '../format'
import { navigate } from '../router'

export function OfferComparePage() {
  const { documents, settings, notify } = useApp()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [modelAdvice, setModelAdvice] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(false)

  const analyzable = useMemo(() => documents.filter((d) => d.analysis), [documents])

  useEffect(() => {
    setSelectedIds((prev) => {
      const stillThere = prev.filter((id) => analyzable.some((d) => d.id === id))
      if (stillThere.length > 0) return stillThere
      const offers = analyzable.filter((d) => d.category === 'offer').slice(0, 4)
      return offers.map((d) => d.id)
    })
  }, [analyzable])

  const selected = useMemo(
    () => selectedIds.map((id) => analyzable.find((d) => d.id === id)).filter((d): d is DocumentRecord => Boolean(d)),
    [analyzable, selectedIds],
  )

  const extraction = useMemo(
    () => selected.map((doc) => extractOffer(doc.text, doc.id, doc.title)),
    [selected],
  )

  const comparison = useMemo(() => (extraction.length >= 2 ? buildComparison(extraction) : null), [extraction])

  const canByok = !settings.offlineMode && settings.byok.enabled && settings.byok.apiKey.trim().length > 0

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>多 Offer 对比</h1>
          <p className="muted">
            勾选 2 份以上 Offer，ClauseEye 会在本机做结构化抽取（薪资 / 试用期 / 期权 / 违约金），并排对比、自动高亮差异。
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!comparison || !canByok || loading}
          title={canByok ? '把你自己的模型用于生成综合建议' : '需在设置中开启 BYOK 并关闭离线模式'}
          onClick={async () => {
            if (!comparison) return
            setLoading(true)
            try {
              const advice = await adviseOffersWithByok(settings, comparison)
              setModelAdvice(advice)
              notify('模型建议已生成（数据仅发往你指定的接口）。', 'success')
            } catch (error) {
              notify(error instanceof Error ? error.message : String(error), 'error')
            } finally {
              setLoading(false)
            }
          }}
        >
          {loading ? '生成中…' : (
            <>
              <Icon name="sparkles" size={15} /> 生成模型建议
            </>
          )}
        </button>
      </header>

      {analyzable.length === 0 ? (
        <EmptyState
          icon="file-text"
          title="还没有可以对比的文档"
          description="先导入两份以上的 Offer，再回到这里进行横向对比。"
          action={
            <button type="button" className="btn btn-primary" onClick={() => navigate({ name: 'vault' })}>
              去导入 Offer
            </button>
          }
        />
      ) : (
        <>
          <section className="picker">
            <div className="picker-head">
              <strong>选择参与对比的文档</strong>
              <span className="muted small">已选 {selected.length} 份（建议 2—4 份）</span>
            </div>
            <ul className="picker-list">
              {analyzable.map((doc) => {
                const checked = selectedIds.includes(doc.id)
                return (
                  <li key={doc.id}>
                    <label className="inline-check">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setSelectedIds((prev) => (e.target.checked ? [...prev, doc.id] : prev.filter((id) => id !== doc.id)))
                          setModelAdvice(null)
                        }}
                      />
                      <span className="picker-title">{doc.title}</span>
                    </label>
                    <div className="row gap-sm">
                      <CategoryTag code={doc.category} muted />
                      <span className="muted small">{formatRelative(doc.importedAt)}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>

          {comparison ? (
            <>
              <section className="score-row">
                {comparison.columns.map((col, i) => (
                  <div key={col.docId} className={`score-card rank-${comparison.ranks[i]}`}>
                    <div className="score-rank">#{comparison.ranks[i]}</div>
                    <div>
                      <strong>{col.title}</strong>
                      <div className="muted small">本地启发式评分（含薪资/试用期/期权/违约金等权重）</div>
                    </div>
                    <div className="score-value">
                      {comparison.scores[i]}
                      <Progress value={comparison.scores[i] / 100} />
                    </div>
                  </div>
                ))}
              </section>

              <section className="table-wrap">
                <table className="compare-table">
                  <thead>
                    <tr>
                      <th>字段</th>
                      {comparison.columns.map((col) => (
                        <th key={col.docId}>{col.title}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.rows.map((row) => (
                      <tr key={row.key}>
                        <th scope="row">
                          {row.label}
                          {row.hint ? <span className="muted small"> ({row.hint})</span> : null}
                        </th>
                        {row.cells.map((cell, i) => (
                          <td
                            key={`${row.key}-${i}`}
                            className={`${i === row.bestIndex ? 'cell-best' : ''} ${i === row.worstIndex ? 'cell-worst' : ''}`}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="advice">
                <h2>本地简评</h2>
                <ul>
                  {comparison.advice.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {modelAdvice ? (
                  <>
                    <h2>模型建议（BYOK）</h2>
                    <ul className="model-advice">
                      {modelAdvice.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="muted small">
                    开启 BYOK 后，可让"你自己指定的模型"基于上述结构化数据补充一段综合建议（仍只发往你填写的接口）。
                  </p>
                )}
              </section>

              <Disclaimer />
            </>
          ) : (
            <EmptyState icon="scale" title="至少选择 2 份文档" description="勾选两份以上 Offer 后即可生成对比矩阵。" />
          )}
        </>
      )}
    </div>
  )
}
