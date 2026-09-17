/**
 * 生成应用图标（不依赖任何图形库）：build/icon.png + build/icon.ico
 * 图形语义：「契眼」— 一只看向合同的眼睛。
 * 用法：node scripts/make-icon.mjs
 */
import zlib from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 256
const SS = 3 // 每个像素 3x3 子采样做抗锯齿

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'build')

/* ---------------- 绘图 ---------------- */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
const hex = (s) => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
]

const BG_TOP = hex('#1d3057')
const BG_BOTTOM = hex('#0a1020')
const EYE_LIGHT = hex('#eaf2ff')
const EYE_DIM = hex('#9fc0ef')
const IRIS_OUTER = hex('#3b82f6')
const IRIS_INNER = hex('#22d3ee')
const PUPIL = hex('#060c18')

const RADIUS = 58
const CX = SIZE / 2
const EYE_CY = 132
const EYE_HALF_W = 86
const EYE_HALF_H = 62
const IRIS_R = 40
const PUPIL_R = 17

function roundedRectCoverage(x, y) {
  const half = SIZE / 2
  const dx = Math.max(Math.abs(x - half) - (half - RADIUS), 0)
  const dy = Math.max(Math.abs(y - half) - (half - RADIUS), 0)
  return Math.hypot(dx, dy) <= RADIUS ? 1 : 0
}

/** 杏仁形眼睛的归一化纵向半高（0~1），u 为 0~1 的横向位置 */
function eyeProfile(u) {
  if (u <= 0 || u >= 1) return 0
  return Math.pow(Math.sin(Math.PI * u), 0.82)
}

function insideEye(x, y, inflate = 0) {
  const u = (x - (CX - EYE_HALF_W)) / (2 * EYE_HALF_W)
  if (u <= 0 || u >= 1) return false
  const halfH = EYE_HALF_H * eyeProfile(u) + inflate
  return Math.abs(y - EYE_CY) <= halfH
}

/** 取某点的颜色（含渐变与形状叠加），返回 [r,g,b,a] */
function sample(x, y) {
  if (!roundedRectCoverage(x, y)) return [0, 0, 0, 0]

  // 底：上深蓝 → 下近黑
  let color = mix(BG_TOP, BG_BOTTOM, clamp01((y - 26) / (SIZE - 52)))

  const inside = insideEye(x, y, 0)
  const insideStroke = insideEye(x, y, 6)

  if (insideStroke && !inside) {
    // 眼睛外描边
    color = mix(color, IRIS_OUTER, 0.85)
  } else if (inside) {
    // 眼白：上亮下略暗，做出球面感
    const t = clamp01((y - (EYE_CY - EYE_HALF_H)) / (2 * EYE_HALF_H))
    color = mix(EYE_LIGHT, EYE_DIM, t * 0.75)

    const d = Math.hypot(x - CX, y - EYE_CY)
    if (d <= IRIS_R) {
      // 虹膜：蓝 → 青
      const tIris = clamp01((x - (CX - IRIS_R)) / (2 * IRIS_R))
      color = mix(IRIS_OUTER, IRIS_INNER, tIris)
      if (d <= PUPIL_R) color = PUPIL
    }

    // 高光
    const dh = Math.hypot(x - (CX - 13), y - (EYE_CY - 15))
    if (dh <= 10) color = mix(color, [255, 255, 255], 0.8)
  }

  return [color[0], color[1], color[2], 255]
}

function render() {
  const px = Buffer.alloc(SIZE * SIZE * 4)
  const step = 1 / SS
  const offset = step / 2

  for (let py = 0; py < SIZE; py++) {
    for (let pxi = 0; pxi < SIZE; pxi++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample(pxi + offset + sx * step, py + offset + sy * step)
          const alpha = c[3] / 255
          r += c[0] * alpha
          g += c[1] * alpha
          b += c[2] * alpha
          a += alpha
        }
      }

      const n = SS * SS
      const alpha = a / n
      const idx = (py * SIZE + pxi) * 4
      if (alpha > 0) {
        px[idx] = Math.round(r / a)
        px[idx + 1] = Math.round(g / a)
        px[idx + 2] = Math.round(b / a)
      }
      px[idx + 3] = Math.round(alpha * 255)
    }
  }
  return px
}

/* ---------------- PNG 编码 ---------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePng(px, size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/** ICO 直接内嵌 PNG（Windows Vista+ 支持），省掉 BMP 布局的麻烦 */
function encodeIco(png, size) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(1, 4) // 1 image

  const entry = Buffer.alloc(16)
  entry[0] = size >= 256 ? 0 : size
  entry[1] = size >= 256 ? 0 : size
  entry[2] = 0
  entry[3] = 0
  entry.writeUInt16LE(1, 4) // planes
  entry.writeUInt16LE(32, 6) // bpp
  entry.writeUInt32BE(0, 8)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(22, 12)

  return Buffer.concat([header, entry, png])
}

/* ---------------- 输出 ---------------- */

const pixels = render()
const png = encodePng(pixels, SIZE)

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(join(OUT_DIR, 'icon.png'), png)
writeFileSync(join(OUT_DIR, 'icon.ico'), encodeIco(png, SIZE))

console.log(`icon.png  ${png.length} bytes`)
console.log(`icon.ico  ${encodeIco(png, SIZE).length} bytes`)
