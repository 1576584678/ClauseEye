/**
 * 本地 OCR（主进程侧，离线运行）
 *
 * 采用 tesseract.js（WASM，无原生编译依赖）：
 * - 语言包放在 dist/tessdata，由 scripts/fetch-tessdata.mjs 在构建前下载后随包分发
 * - 识别完全在本机完成，识别期间不发起任何网络请求
 * - Worker 常驻复用，避免每次识别都重新加载模型
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const LANGS = ['chi_sim', 'eng']

/** 按语言组合缓存 Worker（tesseract.js 的单个 Worker 不能并发识别） */
const workers = new Map()

/** asar 内路径 → asar.unpacked 真实路径（WASM 需要真实文件） */
function resolveUnpacked(target) {
  const unpacked = target.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)
  try {
    if (fs.existsSync(unpacked)) return unpacked
  } catch {
    /* ignore */
  }
  return target
}

/** 语言包目录：随包分发的本地副本优先（打包后先看 asar.unpacked，再看 dev 的 public/） */
function tessdataDir() {
  const distDir = path.join(__dirname, '..', 'dist')
  const candidates = [
    resolveUnpacked(path.join(distDir, 'tessdata')),
    path.join(distDir, 'tessdata'),
    path.join(__dirname, '..', 'public', 'tessdata'),
    path.join(process.resourcesPath || '', 'tessdata'),
  ]
  for (const dir of candidates) {
    try {
      if (dir && fs.existsSync(path.join(dir, 'chi_sim.traineddata'))) return dir
    } catch {
      /* ignore */
    }
  }
  return null
}

function resolveModuleFile(request) {
  try {
    return resolveUnpacked(require.resolve(request))
  } catch {
    return undefined
  }
}

function getWorker(langs) {
  const key = langs.join('+')
  if (!workers.has(key)) {
    const pending = (async () => {
      const { createWorker, OEM } = require('tesseract.js')
      // cachePath 必须显式指定：tesseract.js 在 Node 下默认把语言包缓存写到当前工作目录，
      // 会污染用户目录。这里统一放到系统临时目录。
      const cachePath = path.join(os.tmpdir(), 'clauseeye-ocr-cache')
      try {
        fs.mkdirSync(cachePath, { recursive: true })
      } catch {
        /* ignore */
      }
      const options = { gzip: false, logger: () => {}, cachePath }
      const langPath = tessdataDir()
      if (!langPath) {
        throw new Error('缺少本地 OCR 语言包（dist/tessdata/chi_sim.traineddata）。请先运行 npm run tessdata 再构建。')
      }
      options.langPath = langPath
      const corePath = resolveModuleFile('tesseract.js-core/tesseract-core-simd.wasm.js')
      if (corePath) options.corePath = corePath
      return createWorker(langs, OEM.LSTM_ONLY, options)
    })().catch((error) => {
      workers.delete(key)
      throw error
    })
    workers.set(key, pending)
  }
  return workers.get(key)
}

/**
 * 识别一张图片（Buffer / 文件路径 / dataURL 均可）
 * @returns {Promise<{ text: string, confidence: number }>}
 */
async function recognize(image, langs = LANGS) {
  const worker = await getWorker(langs.length ? langs : LANGS)
  const { data } = await worker.recognize(image)
  return { text: data.text || '', confidence: data.confidence ?? 0 }
}

async function dispose() {
  const pending = [...workers.values()]
  workers.clear()
  for (const item of pending) {
    try {
      const worker = await item
      await worker.terminate()
    } catch {
      /* ignore */
    }
  }
}

module.exports = { recognize, dispose, tessdataDir }
