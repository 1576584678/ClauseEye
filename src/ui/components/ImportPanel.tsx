import { useEffect, useRef, useState } from 'react'
import { ocrBridge } from '../../desktop/bridge'
import { SAMPLE_DOCS } from '../../samples'
import { useApp } from '../../state/store'
import { Modal } from './Common'

type Tab = 'file' | 'paste' | 'sample'

export function ImportPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { importFiles, importPasted, loadSample, loadAllSamples, acceptAttr } = useApp()
  const [tab, setTab] = useState<Tab>('file')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [useOcr, setUseOcr] = useState(true)
  const [ocrReady, setOcrReady] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    void ocrBridge.available().then((ok) => {
      if (!cancelled) setOcrReady(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleFiles = async (files: FileList | File[] | null) => {
    const list = files ? Array.from(files) : []
    if (list.length === 0) return
    await importFiles(list, { ocr: useOcr })
    onClose()
  }

  return (
    <Modal open={open} title="导入文档" subtitle="全部解析与分析都在本机完成，不会上传任何内容" onClose={onClose} width={720}>
      <div className="tabs">
        <button type="button" className={tab === 'file' ? 'tab active' : 'tab'} onClick={() => setTab('file')}>
          文件导入
        </button>
        <button type="button" className={tab === 'paste' ? 'tab active' : 'tab'} onClick={() => setTab('paste')}>
          粘贴文本
        </button>
        <button type="button" className={tab === 'sample' ? 'tab active' : 'tab'} onClick={() => setTab('sample')}>
          示例文档
        </button>
      </div>

      {tab === 'file' ? (
        <div
          className={`dropzone ${dragging ? 'dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            void handleFiles(e.dataTransfer.files)
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <div className="dropzone-icon">📥</div>
          <div className="dropzone-title">把合同拖到这里，或点击选择文件</div>
          <p className="muted small">
            支持 PDF、DOCX、TXT/MD/CSV/JSON，以及图片（PNG/JPG 等）与扫描版 PDF。
          </p>
          <label className="switch-row" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={useOcr && ocrReady !== false} disabled={ocrReady === false} onChange={(e) => setUseOcr(e.target.checked)} />
            <span>
              <strong>对扫描件/图片启用本地 OCR</strong>
              <span className="muted small">
                {ocrReady === null
                  ? '正在检测本地 OCR 引擎…'
                  : ocrReady
                    ? '识别在本机完成（tesseract.js + 中文语言包），不联网；识别结果可能有个别错字，关键数字请核对。'
                    : '当前环境没有内置 OCR 引擎（网页版），请改用「粘贴文本」。'}
              </span>
            </span>
          </label>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={acceptAttr}
            hidden
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </div>
      ) : null}

      {tab === 'paste' ? (
        <div className="stack">
          <label>
            <span>文档标题</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：劳动合同（2026 版）" />
          </label>
          <label>
            <span>正文文本</span>
            <textarea
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="把合同全文粘贴到这里（图片/扫描件 OCR 结果同样适用）"
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={text.trim().length < 10}
            onClick={async () => {
              await importPasted(title, text)
              onClose()
            }}
          >
            导入并立即分析
          </button>
        </div>
      ) : null}

      {tab === 'sample' ? (
        <div className="stack">
          <p className="muted small">内置虚构示例文档，用于快速体验分类、坑点清单与多 Offer 对比。</p>
          <ul className="sample-list">
            {SAMPLE_DOCS.map((sample) => (
              <li key={sample.key}>
                <div>
                  <strong>{sample.title}</strong>
                  <div className="muted small">{sample.hint}</div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={async () => {
                    await loadSample(sample.key)
                    onClose()
                  }}
                >
                  导入
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              await loadAllSamples()
              onClose()
            }}
          >
            一键导入全部示例
          </button>
        </div>
      ) : null}
    </Modal>
  )
}
