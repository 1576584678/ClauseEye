/**
 * 下载 OCR 语言包（tessdata_fast，体积小、识别速度快的版本）
 *
 * 用法：node scripts/fetch-tessdata.mjs [--force]
 * 产物：public/tessdata/{chi_sim,eng}.traineddata
 *
 * 说明：语言包只在下一次 build 时被拷进 dist，运行时完全离线。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'public', 'tessdata')
const BASE = 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main'
const LANGS = ['chi_sim', 'eng']
const force = process.argv.includes('--force')

fs.mkdirSync(OUT_DIR, { recursive: true })

for (const lang of LANGS) {
  const file = path.join(OUT_DIR, `${lang}.traineddata`)
  if (!force && fs.existsSync(file) && fs.statSync(file).size > 100_000) {
    console.log(`[tessdata] 已存在，跳过 ${lang}（${(fs.statSync(file).size / 1048576).toFixed(2)} MB）`)
    continue
  }
  const url = `${BASE}/${lang}.traineddata`
  process.stdout.write(`[tessdata] 下载 ${lang} … `)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`下载失败 ${url} → HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(file, buf)
  console.log(`${(buf.length / 1048576).toFixed(2)} MB`)
}

console.log(`[tessdata] 完成，输出目录 ${path.relative(ROOT, OUT_DIR)}`)
