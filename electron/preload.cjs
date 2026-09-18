/**
 * 渲染进程与主进程之间的最小桥接层。
 *
 * 只暴露三类能力，且每一类都只做"本机操作"：
 * - 提醒：把到期提醒交给系统通知中心（主进程弹 Notification）
 * - 钥匙串：借操作系统钥匙串（Windows DPAPI / macOS Keychain）加密保存保险箱主密钥
 * - 单文件库：把加密好的记录存进主进程的 node:sqlite 单文件保险箱（只传密文）
 * - OCR：把图片交给主进程的本地 tesseract.js 引擎识别（全程离线）
 * - 更新：检查/下载/安装新版本（只读取版本号与发布说明，不上传任何本地数据）
 * - 桌面壳：托盘常驻 / 开机自启（关掉窗口也能继续到期提醒）
 *
 * 渲染进程仍保持 sandbox + contextIsolation，页面里拿不到 Node / fs。
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('clauseEye', {
  desktop: true,
  version: process.versions.electron,
  platform: process.platform,

  reminders: {
    supported: () => ipcRenderer.invoke('reminders:supported'),
    notify: (notice) => ipcRenderer.invoke('reminders:notify', notice),
    test: () => ipcRenderer.invoke('reminders:test'),
    onOpenDocument: (handler) => {
      const listener = (_event, docId) => handler(String(docId))
      ipcRenderer.on('reminders:open-document', listener)
      return () => ipcRenderer.removeListener('reminders:open-document', listener)
    },
  },

  keychain: {
    available: () => ipcRenderer.invoke('keychain:available'),
    save: (value) => ipcRenderer.invoke('keychain:save', value),
    load: () => ipcRenderer.invoke('keychain:load'),
    clear: () => ipcRenderer.invoke('keychain:clear'),
  },

  store: {
    status: () => ipcRenderer.invoke('store:status'),
    putRecord: (row) => ipcRenderer.invoke('store:records:put', row),
    getRecord: (id) => ipcRenderer.invoke('store:records:get', id),
    getAllRecords: () => ipcRenderer.invoke('store:records:all'),
    deleteRecord: (id) => ipcRenderer.invoke('store:records:delete', id),
    clearRecords: () => ipcRenderer.invoke('store:records:clear'),
    putMeta: (key, value) => ipcRenderer.invoke('store:meta:put', key, value),
    getMeta: (key) => ipcRenderer.invoke('store:meta:get', key),
    clearMeta: () => ipcRenderer.invoke('store:meta:clear'),
  },

  updater: {
    status: () => ipcRenderer.invoke('updater:status'),
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    openDownloadPage: () => ipcRenderer.invoke('updater:open-download'),
    onEvent: (handler) => {
      const listener = (_event, state) => handler(state)
      ipcRenderer.on('updater:event', listener)
      return () => ipcRenderer.removeListener('updater:event', listener)
    },
    onOpenSettings: (handler) => {
      const listener = () => handler()
      ipcRenderer.on('updater:open-settings', listener)
      return () => ipcRenderer.removeListener('updater:open-settings', listener)
    },
  },

  shell: {
    prefs: () => ipcRenderer.invoke('shell:prefs'),
    setPrefs: (patch) => ipcRenderer.invoke('shell:set-prefs', patch),
    showWindow: () => ipcRenderer.invoke('shell:show-window'),
    onPrefs: (handler) => {
      const listener = (_event, value) => handler(value)
      ipcRenderer.on('shell:prefs', listener)
      return () => ipcRenderer.removeListener('shell:prefs', listener)
    },
  },

  ocr: {
    available: () => ipcRenderer.invoke('ocr:available'),
    recognize: (dataUrl, langs) => ipcRenderer.invoke('ocr:recognize', { dataUrl, langs }),
  },
})
