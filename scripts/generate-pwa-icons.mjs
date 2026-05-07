import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const publicDir = path.resolve('public')

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function writeU32(num) {
  const buf = Buffer.alloc(4)
  buf.writeUInt32BE(num >>> 0, 0)
  return buf
}

function makeCrc32Table() {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[i] = c >>> 0
  }
  return table
}

const crcTable = makeCrc32Table()

function crc32(buffer) {
  let c = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) {
    c = crcTable[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const crcBuffer = Buffer.concat([typeBuffer, data])
  return Buffer.concat([
    writeU32(data.length),
    typeBuffer,
    data,
    writeU32(crc32(crcBuffer)),
  ])
}

function createPng(width, height, drawPixel) {
  const bytesPerPixel = 4
  const rowSize = 1 + width * bytesPerPixel
  const raw = Buffer.alloc(rowSize * height)

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * rowSize
    raw[rowOffset] = 0
    for (let x = 0; x < width; x += 1) {
      const idx = rowOffset + 1 + x * bytesPerPixel
      const [r, g, b, a] = drawPixel(x, y)
      raw[idx] = r
      raw[idx + 1] = g
      raw[idx + 2] = b
      raw[idx + 3] = a
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const idat = zlib.deflateSync(raw, { level: 9 })
  const png = Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
  return png
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t)
}

function roundedRectContains(x, y, size, inset, radius) {
  const left = inset
  const top = inset
  const right = size - inset - 1
  const bottom = size - inset - 1

  if (x >= left + radius && x <= right - radius && y >= top && y <= bottom) return true
  if (x >= left && x <= right && y >= top + radius && y <= bottom - radius) return true

  const corners = [
    [left + radius, top + radius],
    [right - radius, top + radius],
    [left + radius, bottom - radius],
    [right - radius, bottom - radius],
  ]
  for (const [cx, cy] of corners) {
    const dx = x - cx
    const dy = y - cy
    if (dx * dx + dy * dy <= radius * radius) return true
  }
  return false
}

function iconPixelFactory(size, paddingRatio) {
  const blueTop = [30, 64, 175]
  const blueBottom = [15, 23, 42]
  const inset = Math.round(size * paddingRatio)
  const radius = Math.round((size - inset * 2) * 0.22)

  const drawSize = size - 2 * inset
  const svgToPx = (v) => inset + (v / 64) * drawSize
  const svgToLen = (v) => (v / 64) * drawSize

  // Three stacked bars matching favicon.svg (64x64 viewBox)
  const bars = [
    { x: svgToPx(12), y: svgToPx(18), w: svgToLen(40), h: svgToLen(7), color: [196, 181, 253] },
    { x: svgToPx(12), y: svgToPx(29), w: svgToLen(28), h: svgToLen(7), color: [167, 139, 250] },
    { x: svgToPx(12), y: svgToPx(40), w: svgToLen(18), h: svgToLen(7), color: [124, 58, 237] },
  ]

  return (x, y) => {
    const t = y / Math.max(1, size - 1)
    const bg = [
      mix(blueTop[0], blueBottom[0], t),
      mix(blueTop[1], blueBottom[1], t),
      mix(blueTop[2], blueBottom[2], t),
      255,
    ]

    if (!roundedRectContains(x, y, size, inset, radius)) {
      return [0, 0, 0, 0]
    }

    for (const bar of bars) {
      const r = bar.h / 2
      const innerLeft = bar.x + r
      const innerRight = bar.x + bar.w - r
      const centerY = bar.y + r

      const inRect = x >= innerLeft && x <= innerRight && y >= bar.y && y < bar.y + bar.h
      const dxL = x - innerLeft
      const dyL = y - centerY
      const inLeftCap = dxL * dxL + dyL * dyL <= r * r
      const dxR = x - innerRight
      const dyR = y - centerY
      const inRightCap = dxR * dxR + dyR * dyR <= r * r

      if (inRect || inLeftCap || inRightCap) {
        return [bar.color[0], bar.color[1], bar.color[2], 255]
      }
    }

    return bg
  }
}

function writeIcon(fileName, size, paddingRatio) {
  const filePath = path.join(publicDir, fileName)
  const png = createPng(size, size, iconPixelFactory(size, paddingRatio))
  fs.writeFileSync(filePath, png)
  console.log(`Generated ${fileName} (${size}x${size})`)
}

ensureDir(publicDir)
writeIcon('pwa-192.png', 192, 0.08)
writeIcon('pwa-512.png', 512, 0.08)
writeIcon('pwa-maskable-512.png', 512, 0.02)
writeIcon('apple-touch-icon.png', 180, 0.12)