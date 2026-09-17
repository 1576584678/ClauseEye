/**
 * ClauseEye 桌面版主进程
 *
 * 设计要点：
 * 1. 用自定义协议 app://local 承载前端产物，而不是本地 HTTP 服务。
 *    好处是「源」固定不变 —— IndexedDB 的数据库是按源隔离的，
 *    如果用 http://127.0.0.1:<随机端口>，每次启动端口一变数据就"丢了"。
 * 2. 渲染进程关闭 Node 集成、开启 contextIsolation 与 sandbox，
 *    页面里能跑的代码和浏览器里完全一致，没有额外的本地能力入口。
 * 3. 任何外链、外部导航一律交给系统默认浏览器，应用窗口本身不联网。
 */
const { app, BrowserWindow, Menu, Notification, dialog, ipcMain, protocol, safeStorage, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const SCHEME = 'app'
const HOST = 'local'
const ORIGIN = `${SCHEME}://${HOST}`
const DIST_DIR = path.join(__dirname, '..', 'dist')
const INDEX_FILE = path.join(DIST_DIR, 'index.html')
const ICON_FILE = path.join(__dirname, '..', 'build', 'icon.png')
const PRELOAD_FILE = path.join(__dirname, 'preload.cjs')

/** 开发模式：CLAUSEEYE_DEV_URL=http://localhost:5173 npm run electron:dev */
const DEV_URL = process.env.CLAUSEEYE_DEV_URL || ''

/**
 * 冒烟自检：CLAUSEEYE_SMOKE=1 electron .
 * 启动后检查页面是否渲染、IndexedDB 是否可用、worker 能否加载，然后自动退出。
 * 用于在没有人工点击的情况下验证打包结果（CI 也会跑）。
 */
const SMOKE = process.env.CLAUSEEYE_SMOKE === '1'

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true,
    },
  },
])

/** @type {BrowserWindow | null} */
let mainWindow = null

function createWindow() {
  const smoke = SMOKE

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1000,
    minHeight: 660,
    backgroundColor: '#0b0f19',
    title: 'ClauseEye · 契眼',
    ...(fs.existsSync(ICON_FILE) ? { icon: ICON_FILE } : {}),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: fs.existsSync(PRELOAD_FILE) ? PRELOAD_FILE : undefined,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  })

  win.once('ready-to-show', () => {
    if (SMOKE) return
    win.show()
  })

  if (SMOKE) runSmokeChecks(win)

  // 窗口标题固定，不随页面的 <title> 变
  win.on('page-title-updated', (event) => event.preventDefault())

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    const allowed = DEV_URL ? url.startsWith(DEV_URL) : url.startsWith(ORIGIN)
    if (allowed) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  const target = DEV_URL ? `${DEV_URL}/#/vault` : `${ORIGIN}/index.html#/vault`
  win.loadURL(target)

  win.on('closed', () => {
    mainWindow = null
  })

  return win
}

function buildMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '导入文档', accelerator: 'CmdOrCtrl+O', click: () => focusRoute('#/vault') },
        { type: 'separator' },
        { label: '退出', role: 'quit' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '保险箱', accelerator: 'CmdOrCtrl+1', click: () => focusRoute('#/vault') },
        { label: 'Offer 对比', accelerator: 'CmdOrCtrl+2', click: () => focusRoute('#/offers') },
        { label: '提醒', accelerator: 'CmdOrCtrl+3', click: () => focusRoute('#/reminders') },
        { label: '设置', accelerator: 'CmdOrCtrl+4', click: () => focusRoute('#/settings') },
        { type: 'separator' },
        { label: '重新加载', role: 'reload' },
        { label: '开发者工具', role: 'toggleDevTools', visible: !app.isPackaged },
        { type: 'separator' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { label: '重置缩放', role: 'resetZoom' },
        { type: 'separator' },
        { label: '全屏', role: 'togglefullscreen' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '关于 ClauseEye', click: showAbout },
        { label: '数据存放位置', click: showDataLocation },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function focusRoute(hash) {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
  void mainWindow.loadURL(`${DEV_URL || `${ORIGIN}/index.html`}${hash}`)
}

function showAbout() {
  void dialog.showMessageBox(mainWindow ?? undefined, {
    type: 'info',
    title: '关于 ClauseEye',
    message: 'ClauseEye · 契眼',
    detail: [
      `版本 ${app.getVersion()}`,
      '',
      '本地优先的个人合同与证明文档管家。',
      '所有文档仅保存在本机，应用不连接任何自建服务；',
      '深度分析走你自己配置的模型接口（BYOK）。',
    ].join('\n'),
    buttons: ['好'],
    noLink: true,
  })
}

async function showDataLocation() {
  const dir = app.getPath('userData')
  const res = await dialog.showMessageBox(mainWindow ?? undefined, {
    type: 'question',
    title: '数据存放位置',
    message: '你的加密保险箱存放在：',
    detail: `${dir}\n\n可以通过「设置 → 导出备份」把数据另存到别处。`,
    buttons: ['打开文件夹', '好'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  })
  if (res.response === 0) void shell.openPath(dir)
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
}

/**
 * 主进程侧的三项本机能力：系统通知、系统钥匙串、本地 OCR。
 * 渲染进程只能通过 preload 暴露的窄接口调用，且都有明确的降级路径。
 */

/** 打开文档：先聚焦窗口，再让渲染进程切换到对应详情页 */
function focusDocument(docId) {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  mainWindow.webContents.send('reminders:open-document', docId)
}

/** @type {ReturnType<typeof import('./updater.cjs').createUpdater> | null} */
let updater = null
/** 已弹过通知的版本，避免重复打扰 */
const notifiedUpdates = new Set()

function notifyUpdate(notice) {
  if (!Notification.isSupported() || !notice || notifiedUpdates.has(notice.body)) return
  notifiedUpdates.add(notice.body)
  const notification = new Notification({
    title: notice.title,
    body: notice.body,
    ...(fs.existsSync(ICON_FILE) ? { icon: ICON_FILE } : {}),
  })
  notification.on('click', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('updater:open-settings')
  })
  notification.show()
}

function setUpdater() {
  const { createUpdater } = require('./updater.cjs')
  updater = createUpdater({
    app,
    onEvent: (state) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('updater:event', state)
      if (state.state === 'available') {
        notifyUpdate({
          title: '发现 ClauseEye 新版本',
          body:
            state.mode === 'portable'
              ? `v${state.version} 已发布，免安装版请到 Releases 下载替换`
              : `v${state.version} 已发布，可在设置页一键更新`,
        })
      }
      if (state.state === 'downloaded') {
        notifyUpdate({
          title: '新版本已下载完成',
          body: `v${state.version} 已就绪，重启应用即可生效`,
        })
      }
    },
  })
}

function registerIpc() {
  ipcMain.handle('reminders:supported', () => Notification.isSupported())

  ipcMain.handle('reminders:notify', (_event, notice) => {
    if (!Notification.isSupported() || !notice || typeof notice !== 'object') return false
    const title = String(notice.title || 'ClauseEye 提醒').slice(0, 120)
    const body = String(notice.body || '').slice(0, 400)
    const notification = new Notification({
      title,
      body,
      silent: false,
      ...(fs.existsSync(ICON_FILE) ? { icon: ICON_FILE } : {}),
    })
    notification.on('click', () => {
      if (notice.docId) focusDocument(notice.docId)
    })
    notification.show()
    return true
  })

  ipcMain.handle('reminders:test', () => {
    if (!Notification.isSupported()) return false
    const notification = new Notification({
      title: 'ClauseEye 提醒已开启',
      body: '关键日期临近时，我们会像这样提醒你（不会再打扰你其他时间）。',
      ...(fs.existsSync(ICON_FILE) ? { icon: ICON_FILE } : {}),
    })
    notification.show()
    return true
  })

  // ---- 系统钥匙串：用 OS 提供的加密能力保护保险箱主密钥 ----
  const keychainFile = () => path.join(app.getPath('userData'), 'keychain.bin')

  ipcMain.handle('keychain:available', () => {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  })

  ipcMain.handle('keychain:save', (_event, value) => {
    try {
      if (!safeStorage.isEncryptionAvailable()) return false
      if (typeof value !== 'string' || value.length === 0 || value.length > 4096) return false
      const sealed = safeStorage.encryptString(value)
      fs.writeFileSync(keychainFile(), sealed.toString('base64'), 'utf8')
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('keychain:load', () => {
    try {
      if (!safeStorage.isEncryptionAvailable()) return null
      const raw = fs.readFileSync(keychainFile(), 'utf8')
      if (!raw) return null
      return safeStorage.decryptString(Buffer.from(raw, 'base64'))
    } catch {
      return null
    }
  })

  ipcMain.handle('keychain:clear', () => {
    try {
      fs.rmSync(keychainFile(), { force: true })
      return true
    } catch {
      return false
    }
  })

  // ---- 应用更新 ----
  ipcMain.handle('updater:status', () => ({
    ...(updater ? updater.state : { state: 'idle' }),
    ...(updater ? updater.meta() : { mode: 'unknown', currentVersion: app.getVersion() }),
  }))

  ipcMain.handle('updater:check', async () => {
    if (!updater) return null
    await updater.check()
    return updater.state
  })

  ipcMain.handle('updater:download', async () => {
    if (!updater) return null
    await updater.download()
    return updater.state
  })

  ipcMain.handle('updater:install', () => (updater ? updater.install() : false))

  ipcMain.handle('updater:open-download', () => {
    const page = (updater && updater.state.downloadPage) || 'https://github.com/1576584678/ClauseEye/releases/latest'
    void shell.openExternal(page)
    return true
  })

  // ---- 本地 OCR：tesseract.js（离线 WASM 引擎）----
  let ocrQueue = Promise.resolve()

  ipcMain.handle('ocr:available', () => {
    try {
      const ocr = require('./ocr.cjs')
      return Boolean(ocr.tessdataDir())
    } catch {
      return false
    }
  })

  ipcMain.handle('ocr:recognize', (_event, payload) => {
    const dataUrl = payload && typeof payload.dataUrl === 'string' ? payload.dataUrl : ''
    const match = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/i.exec(dataUrl)
    if (!match) return { ok: false, error: 'OCR 输入必须是 base64 图片' }
    const buffer = Buffer.from(match[1], 'base64')
    if (buffer.length === 0) return { ok: false, error: '图片内容为空' }
    if (buffer.length > 24 * 1024 * 1024) return { ok: false, error: '单页图片过大（超过 24MB），请降低扫描分辨率' }

    // tesseract.js 单个 worker 不能并发识别，这里串行排队
    const job = ocrQueue.then(async () => {
      const ocr = require('./ocr.cjs')
      const langs = Array.isArray(payload.langs) && payload.langs.length ? payload.langs : undefined
      const result = await ocr.recognize(buffer, langs)
      return { ok: true, text: result.text, confidence: result.confidence }
    })
    ocrQueue = job.then(
      () => undefined,
      () => undefined,
    )
    return job.catch((error) => ({ ok: false, error: String((error && error.message) || error) }))
  })
}

function registerAppProtocol() {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url)
    let relative = decodeURIComponent(url.pathname)
    if (relative === '' || relative === '/') relative = '/index.html'

    const filePath = path.normalize(path.join(DIST_DIR, relative))
    // 防目录穿越
    if (filePath !== DIST_DIR && !filePath.startsWith(DIST_DIR + path.sep)) {
      return new Response('Forbidden', { status: 403 })
    }

    // 注意：不能用 net.fetch(file://) —— 打包后前端产物在 app.asar 里，
    // Chromium 的网络栈不认识 asar 这种虚拟路径。这里用 fs 读取（Electron 会
    // 自动映射 asar 内的路径），再手工构造响应。
    let body
    try {
      const stat = fs.statSync(filePath)
      if (!stat.isFile()) return new Response('Not Found', { status: 404 })
      body = fs.readFileSync(filePath)
    } catch {
      return new Response('Not Found', { status: 404 })
    }

    const mime = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(body.length),
        'Cache-Control': 'no-cache',
      },
    })
  })
}

// 单实例：两个实例会共用同一个存储分区，容易互相覆盖
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    if (!mainWindow) {
      mainWindow = createWindow()
      return
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    const hashArg = argv.find((a) => a.startsWith('#/'))
    if (hashArg) void mainWindow.loadURL(`${DEV_URL || `${ORIGIN}/index.html`}${hashArg}`)
  })

  // 必须在 ready 之前设置：userData 目录名依赖它（默认为 %APPDATA%\ClauseEye）
  app.setName('ClauseEye')
  app.setAppUserModelId('com.clauseeye.app')

  app.whenReady().then(() => {
    if (!DEV_URL && !fs.existsSync(INDEX_FILE)) {
      dialog.showErrorBox(
        '缺少前端产物',
        `没有找到 ${INDEX_FILE}\n\n请先执行 npm run build，再运行 Electron 打包。`,
      )
      app.quit()
      return
    }

    registerAppProtocol()
    registerIpc()
    setUpdater()
    buildMenu()
    mainWindow = createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}

/* ---------------- 冒烟自检 ---------------- */

/**
 * 在无人工干预的情况下验证：页面渲染、资源可加载、IndexedDB 可用、
 * 模块 Worker（pdfjs 解析器）能在 app:// 源下创建。
 * 任何一项失败都会以非 0 退出码结束，方便 CI 卡住回归。
 */
async function runSmokeChecks(win) {
  const errors = []

  win.webContents.on('console-message', (...args) => {
    // Electron 37+ 传入单个事件对象，之前是 (event, level, message, ...)
    const evt = args[0]
    const level = typeof evt === 'object' && evt !== null && 'level' in evt ? evt.level : args[1]
    const message = typeof evt === 'object' && evt !== null && 'message' in evt ? evt.message : args[2]
    if (level === 'error' || level === 3) errors.push(String(message))
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    errors.push(`render-process-gone: ${details.reason}`)
  })

  win.webContents.once('did-finish-load', async () => {
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const assetFiles = fs.readdirSync(path.join(DIST_DIR, 'assets'))
    // 优先选 ESM 版本：Vite 会把 pdfjs 的 worker 同时产出 .mjs 与 .js，后者依赖 DOM
    const workerFile =
      assetFiles.find((name) => name.startsWith('pdf.worker') && name.endsWith('.mjs')) ||
      assetFiles.find((name) => name.startsWith('pdf.worker'))
    const jsFile = assetFiles.find((name) => name.startsWith('index-') && name.endsWith('.js'))
    const cssFile = assetFiles.find((name) => name.endsWith('.css'))

    let result = null
    try {
      result = await win.webContents.executeJavaScript(`(async () => {
        const out = {}
        out.origin = location.origin
        out.hash = location.hash
        out.rootChildren = document.querySelector('#root') ? document.querySelector('#root').children.length : -1
        out.heading = (document.body.innerText || '').split('\\n').filter(Boolean).slice(0, 3).join(' | ')
        out.indexedDb = typeof indexedDB

        const probe = async (file) => {
          try {
            const res = await fetch(location.origin + '/assets/' + file)
            const body = await res.text()
            return res.status === 200 && body.length > 0 ? 'ok' : 'status:' + res.status
          } catch (e) { return 'throw:' + e.name }
        }
        out.assetFetch = await Promise.all(
          [${JSON.stringify(jsFile || '')}, ${JSON.stringify(cssFile || '')}].map(probe),
        )

        try {
          const res = await fetch(location.origin + '/assets/%2e%2e/package.json')
          out.traversal = res.status
        } catch (e) { out.traversal = 'throw:' + e.name }

        out.idbOpen = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve('timeout'), 5000)
          try {
            const req = indexedDB.open('__clauseeye_smoke__', 1)
            req.onupgradeneeded = () => { req.result.createObjectStore('t') }
            req.onsuccess = () => {
              clearTimeout(timer)
              req.result.close()
              indexedDB.deleteDatabase('__clauseeye_smoke__')
              resolve('ok')
            }
            req.onerror = () => { clearTimeout(timer); resolve('error:' + (req.error && req.error.name)) }
            req.onblocked = () => { clearTimeout(timer); resolve('blocked') }
          } catch (e) { clearTimeout(timer); resolve('throw:' + e.name) }
        })

        const bridge = window.clauseEye || null
        out.bridge = bridge ? 'ok' : 'missing'
        if (bridge) {
          out.keychain = await bridge.keychain.available()
          out.notifications = await bridge.reminders.supported()
          out.ocrAvailable = await bridge.ocr.available()
          out.updater = (await bridge.updater.status()).mode
          if (out.ocrAvailable) {
            const canvas = document.createElement('canvas')
            canvas.width = 700
            canvas.height = 140
            const ctx = canvas.getContext('2d')
            ctx.fillStyle = '#fff'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            ctx.fillStyle = '#000'
            ctx.font = '32px "Microsoft YaHei", sans-serif'
            ctx.fillText('劳动合同试用期六个月', 20, 60)
            ctx.fillText('ClauseEye OCR', 20, 108)
            const ocr = await bridge.ocr.recognize(canvas.toDataURL('image/png'), ['chi_sim', 'eng'])
            out.ocr = ocr && ocr.ok ? String(ocr.text || '').replace(/\s+/g, '').slice(0, 40) : 'fail:' + ((ocr && ocr.error) || 'unknown')
          } else {
            out.ocr = 'unavailable'
          }
        }

        out.moduleWorker = await new Promise((resolve) => {
          const file = ${JSON.stringify(workerFile || '')}
          if (!file) return resolve('no-worker-asset')
          try {
            const w = new Worker(location.origin + '/assets/' + file, { type: 'module' })
            w.onerror = (e) => resolve('error:' + (e.message || 'unknown'))
            setTimeout(() => { w.terminate(); resolve('ok') }, 1200)
          } catch (e) { resolve('throw:' + e.name + ':' + e.message) }
        })

        return out
      })()`)
    } catch (error) {
      errors.push(`executeJavaScript: ${error && error.message}`)
    }

    const failures = []
    if (errors.length) failures.push(`控制台错误 ${errors.length} 条`)
    if (!result) failures.push('无法在渲染进程求值')
    else {
      if (result.rootChildren < 1) failures.push('页面未渲染出内容')
      if (!Array.isArray(result.assetFetch) || result.assetFetch.some((r) => r !== 'ok')) {
        failures.push(`assets 资源无法从 app:// 取回（${JSON.stringify(result.assetFetch)}）`)
      }
      if (result.traversal === 200) failures.push('目录穿越未被拦截')
      if (result.idbOpen !== 'ok') failures.push(`IndexedDB 不可用（${result.idbOpen}）`)
      if (result.moduleWorker !== 'ok') failures.push(`模块 Worker 不可用（${result.moduleWorker}）`)
      if (result.bridge !== 'ok') failures.push('桌面桥接（preload）未注入')
      if (!['installer', 'portable', 'dev'].includes(String(result.updater))) {
        failures.push(`更新器形态异常（${result.updater}）`)
      }
      if (result.bridge === 'ok' && result.ocrAvailable && !String(result.ocr).includes('劳动合同')) {
        failures.push(`本地 OCR 未识别出预期文字（${result.ocr}）`)
      }
    }

    const report =
      `\n[smoke] ${failures.length === 0 ? 'PASS' : 'FAIL'}\n` +
      `${JSON.stringify({ ...(result || {}), errors, failures }, null, 2)}\n`

    process.stdout.write(report)

    // 打包后的 Windows GUI 程序没有控制台，把结果落到文件里方便脚本读取
    const outFile = process.env.CLAUSEEYE_SMOKE_OUT
    if (outFile) {
      try {
        fs.writeFileSync(outFile, report, 'utf8')
      } catch (error) {
        process.stdout.write(`无法写入冒烟报告：${error.message}\n`)
      }
    }

    app.exit(failures.length === 0 ? 0 : 1)
  })
}