import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { analyzeDocument } from '../core/analyze'
import { DEFAULT_SETTINGS, type AppSettings, type DocumentRecord, type FlagStatus } from '../core/types'
import { ACCEPT_ATTR, ingestFile, ingestPastedText } from '../ingest'
import { analyzeWithByok, byokAvailable } from '../llm/byok'
import { SAMPLE_DOCS } from '../samples'
import { sha256Hex } from '../storage/crypto'
import { vault, type VaultStatus } from '../storage/vault'

export type ToastKind = 'info' | 'success' | 'error' | 'warn'

export interface Toast {
  kind: ToastKind
  text: string
  id: number
}

interface AppContextValue {
  ready: boolean
  status: VaultStatus
  hasPassphrase: boolean
  documents: DocumentRecord[]
  settings: AppSettings
  busy: boolean
  busyText: string
  toast: Toast | null
  acceptAttr: string
  notify: (text: string, kind?: ToastKind) => void
  dismissToast: () => void
  createVault: (passphrase?: string, hint?: string) => Promise<void>
  unlockVault: (passphrase?: string) => Promise<void>
  lockVault: () => void
  importFiles: (files: File[], options?: { ocr?: boolean }) => Promise<void>
  importPasted: (title: string, text: string) => Promise<void>
  loadSample: (key: string) => Promise<void>
  loadAllSamples: () => Promise<void>
  removeDocument: (id: string) => Promise<void>
  reanalyze: (id: string) => Promise<void>
  setCategory: (id: string, category: DocumentRecord['category']) => Promise<void>
  setFlagStatus: (docId: string, flagId: string, status: FlagStatus) => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  runByok: (docId: string) => Promise<void>
  canRunByok: boolean
  exportBackup: () => Promise<void>
  wipeAll: () => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState<VaultStatus>('uninitialized')
  const [hasPassphrase, setHasPassphrase] = useState(false)
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [busy, setBusy] = useState(false)
  const [busyText, setBusyText] = useState('')
  const [toast, setToast] = useState<Toast | null>(null)
  const toastId = useRef(0)

  const notify = useCallback((text: string, kind: ToastKind = 'info') => {
    toastId.current += 1
    setToast({ kind, text, id: toastId.current })
  }, [])

  const dismissToast = useCallback(() => setToast(null), [])

  const refresh = useCallback(() => {
    setDocuments(vault.documents)
    setSettings({ ...vault.settings })
    setHasPassphrase(Boolean(vault.vaultMeta?.hasPassphrase))
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await vault.load()
        setHasPassphrase(Boolean(loaded.meta?.hasPassphrase))
        // 无口令模式的保险箱没有可输入的口令，直接打开
        if (loaded.status === 'locked' && loaded.meta && !loaded.meta.hasPassphrase) {
          try {
            await vault.unlock()
            setStatus('unlocked')
            refresh()
          } catch (error) {
            setStatus('locked')
            notify(errorText(error), 'error')
          }
        } else {
          setStatus(loaded.status)
        }
      } catch (error) {
        // 初始化失败也必须让界面进入可用状态，否则会永远卡在加载中
        setStatus('locked')
        notify(errorText(error), 'error')
      } finally {
        setReady(true)
      }
    })()
  }, [notify, refresh])

  const createVault = useCallback(
    async (passphrase?: string, hint?: string) => {
      try {
        await vault.create({ passphrase, hint })
        setStatus('unlocked')
        refresh()
        notify(passphrase ? '保险箱已创建（口令保护已开启）' : '保险箱已创建（无口令模式）', 'success')
      } catch (error) {
        notify(errorText(error), 'error')
      }
    },
    [notify, refresh],
  )

  const unlockVault = useCallback(
    async (passphrase?: string) => {
      try {
        await vault.unlock(passphrase)
        setStatus('unlocked')
        refresh()
      } catch (error) {
        notify(errorText(error), 'error')
      }
    },
    [notify, refresh],
  )

  const lockVault = useCallback(() => {
    vault.lock()
    setStatus('locked')
    setDocuments([])
  }, [])

  const importDocument = useCallback(
    async (input: { title: string; fileName: string; mimeType: string; sizeBytes: number; text: string; pageCount: number | null }, warnings: string[]) => {
      if (!input.text.trim()) {
        notify('未解析到可分析的文本内容，请改用「粘贴文本」或更换文件。', 'warn')
        return
      }
      const hash = await sha256Hex(input.text)
      const duplicate = vault.documents.find((d) => d.sourceHash === hash)
      if (duplicate) {
        notify(`已存在相同内容的文档：《${duplicate.title}》，本次已跳过。`, 'warn')
        return
      }
      const doc = await vault.importDocument(input)
      refresh()
      const riskCount = doc.analysis?.risks.length ?? 0
      notify(
        `已导入《${doc.title}》：识别为 ${doc.category}，发现 ${riskCount} 条风险点${
          warnings.length > 0 ? `。注意：${warnings[0]}` : ''
        }`,
        riskCount > 0 ? 'warn' : 'success',
      )
    },
    [notify, refresh],
  )

  const importFiles = useCallback(
    async (files: File[], options: { ocr?: boolean } = {}) => {
      if (files.length === 0) return
      setBusy(true)
      try {
        for (const file of files) {
          setBusyText(`正在本地解析 ${file.name}…`)
          const ingested = await ingestFile(file, {
            ocr: options.ocr,
            onProgress: (message) => setBusyText(message || `正在本地解析 ${file.name}…`),
          })
          await importDocument(
            {
              title: file.name.replace(/\.[^.]+$/, ''),
              fileName: ingested.fileName,
              mimeType: ingested.mimeType,
              sizeBytes: ingested.sizeBytes,
              text: ingested.text,
              pageCount: ingested.pageCount,
            },
            ingested.warnings,
          )
        }
      } catch (error) {
        notify(`解析失败：${errorText(error)}`, 'error')
      } finally {
        setBusy(false)
        setBusyText('')
      }
    },
    [importDocument, notify],
  )

  const importPasted = useCallback(
    async (title: string, text: string) => {
      setBusy(true)
      try {
        const ingested = ingestPastedText(title, text)
        await importDocument(
          {
            title: title || '粘贴文本',
            fileName: ingested.fileName,
            mimeType: ingested.mimeType,
            sizeBytes: ingested.sizeBytes,
            text: ingested.text,
            pageCount: ingested.pageCount,
          },
          ingested.warnings,
        )
      } catch (error) {
        notify(`解析失败：${errorText(error)}`, 'error')
      } finally {
        setBusy(false)
      }
    },
    [importDocument, notify],
  )

  const loadSample = useCallback(
    async (key: string) => {
      const sample = SAMPLE_DOCS.find((s) => s.key === key)
      if (!sample) return
      try {
        await importDocument(
          {
            title: sample.title,
            fileName: sample.fileName,
            mimeType: 'text/plain',
            sizeBytes: new TextEncoder().encode(sample.text).length,
            text: sample.text.replace(/\r\n/g, '\n'),
            pageCount: null,
          },
          [],
        )
      } catch (error) {
        notify(`示例导入失败：${errorText(error)}`, 'error')
      }
    },
    [importDocument, notify],
  )

  const loadAllSamples = useCallback(async () => {
    setBusy(true)
    setBusyText('正在导入示例文档…')
    try {
      for (const sample of SAMPLE_DOCS) {
        const hash = await sha256Hex(sample.text.replace(/\r\n/g, '\n'))
        if (vault.documents.some((d) => d.sourceHash === hash)) continue
        await vault.importDocument({
          title: sample.title,
          fileName: sample.fileName,
          mimeType: 'text/plain',
          sizeBytes: new TextEncoder().encode(sample.text).length,
          text: sample.text.replace(/\r\n/g, '\n'),
          pageCount: null,
        })
      }
      refresh()
      notify('示例文档已导入，可直接查看坑点清单与多 Offer 对比。', 'success')
    } catch (error) {
      notify(`示例导入失败：${errorText(error)}`, 'error')
    } finally {
      setBusy(false)
      setBusyText('')
    }
  }, [notify, refresh])

  const removeDocument = useCallback(
    async (id: string) => {
      try {
        await vault.deleteDocument(id)
        refresh()
        notify('文档已从本地保险箱删除。', 'success')
      } catch (error) {
        notify(`删除失败：${errorText(error)}`, 'error')
      }
    },
    [notify, refresh],
  )

  const reanalyze = useCallback(
    async (id: string) => {
      const doc = vault.getDocument(id)
      if (!doc) return
      setBusy(true)
      try {
        const analysis = analyzeDocument(doc.text)
        await vault.putDocument({ ...doc, analysis, category: analysis.category })
        refresh()
        notify('已用最新规则库重新分析（规则版本 ' + analysis.rulesVersion + '）。', 'success')
      } catch (error) {
        notify(`重新分析失败：${errorText(error)}`, 'error')
      } finally {
        setBusy(false)
      }
    },
    [notify, refresh],
  )

  const setCategory = useCallback(
    async (id: string, category: DocumentRecord['category']) => {
      const doc = vault.getDocument(id)
      if (!doc) return
      try {
        const analysis = analyzeDocument(doc.text)
        await vault.putDocument({
          ...doc,
          category,
          analysis: { ...analysis, category, notes: [...analysis.notes, '分类由用户手动确认。'] },
        })
        refresh()
        notify('已更新分类，并按新场景重跑规则与对比口径。', 'success')
      } catch (error) {
        notify(`更新分类失败：${errorText(error)}`, 'error')
      }
    },
    [notify, refresh],
  )

  const setFlagStatus = useCallback(
    async (docId: string, flagId: string, flagStatus: FlagStatus) => {
      const doc = vault.getDocument(docId)
      if (!doc?.analysis) return
      try {
        const risks = doc.analysis.risks.map((risk) => (risk.id === flagId ? { ...risk, status: flagStatus } : risk))
        await vault.putDocument({ ...doc, analysis: { ...doc.analysis, risks } })
        refresh()
      } catch (error) {
        notify(`标记失败：${errorText(error)}`, 'error')
      }
    },
    [notify, refresh],
  )

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      try {
        const next: AppSettings = { ...vault.settings, ...patch, byok: { ...vault.settings.byok, ...(patch.byok ?? {}) } }
        await vault.saveSettings(next)
        refresh()
      } catch (error) {
        notify(`设置保存失败：${errorText(error)}`, 'error')
      }
    },
    [notify, refresh],
  )

  const runByok = useCallback(
    async (docId: string) => {
      const doc = vault.getDocument(docId)
      if (!doc?.analysis) return
      setBusy(true)
      setBusyText('正在调用你指定的模型进行深度分析…')
      try {
        const outcome = await analyzeWithByok(vault.settings, doc, doc.analysis)
        await vault.putDocument({ ...doc, analysis: outcome.result })
        refresh()
        notify(
          `BYOK 完成：补充 ${outcome.accepted} 条风险，拦截 ${outcome.rejected.length} 条（引用无法在原文定位或与规则重复）。`,
          outcome.accepted > 0 ? 'warn' : 'success',
        )
      } catch (error) {
        notify(errorText(error), 'error')
      } finally {
        setBusy(false)
        setBusyText('')
      }
    },
    [notify, refresh],
  )

  const exportBackup = useCallback(async () => {
    try {
      const json = await vault.exportBackup()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `clauseeye-backup-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      notify('已导出台账备份（明文 JSON，不含 BYOK 密钥）。', 'success')
    } catch (error) {
      notify(`导出失败：${errorText(error)}`, 'error')
    }
  }, [notify])

  const wipeAll = useCallback(async () => {
    try {
      await vault.wipe()
      setStatus('uninitialized')
      setDocuments([])
      setSettings(DEFAULT_SETTINGS)
      notify('本地数据已全部清空。', 'success')
    } catch (error) {
      notify(`清空失败：${errorText(error)}`, 'error')
    }
  }, [notify])

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      status,
      hasPassphrase,
      documents,
      settings,
      busy,
      busyText,
      toast,
      acceptAttr: ACCEPT_ATTR,
      notify,
      dismissToast,
      createVault,
      unlockVault,
      lockVault,
      importFiles,
      importPasted,
      loadSample,
      loadAllSamples,
      removeDocument,
      reanalyze,
      setCategory,
      setFlagStatus,
      updateSettings,
      runByok,
      canRunByok: byokAvailable(settings) && Boolean(settings.byok.apiKey),
      exportBackup,
      wipeAll,
    }),
    [
      ready,
      status,
      hasPassphrase,
      documents,
      settings,
      busy,
      busyText,
      toast,
      notify,
      dismissToast,
      createVault,
      unlockVault,
      lockVault,
      importFiles,
      importPasted,
      loadSample,
      loadAllSamples,
      removeDocument,
      reanalyze,
      setCategory,
      setFlagStatus,
      updateSettings,
      runByok,
      exportBackup,
      wipeAll,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp 必须在 AppProvider 内使用')
  return ctx
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}



