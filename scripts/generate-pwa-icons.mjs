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
  const white = [246, 248, 255]
  const inset = Math.round(size * paddingRatio)
  const radius = Math.round((size - inset * 2) * 0.22)

  const noteStemW = Math.max(4, Math.round(size * 0.08))
  const noteStemH = Math.round(size * 0.34)
  const noteStemX = Math.round(size * 0.57)
  const noteStemY = Math.round(size * 0.26)
  const noteHeadR = Math.max(7, Math.round(size * 0.105))
  const noteHead1X = Math.round(size * 0.45)
  const noteHead2X = Math.round(size * 0.64)
  const noteHeadY = Math.round(size * 0.66)

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

    const inStem = x >= noteStemX && x < noteStemX + noteStemW && y >= noteStemY && y < noteStemY + noteStemH
    const inBeam = y >= noteStemY && y < noteStemY + noteStemW && x >= noteStemX - Math.round(size * 0.12) && x <= noteStemX + noteStemW

    const dx1 = x - noteHead1X
    const dy1 = y - noteHeadY
    const inHead1 = dx1 * dx1 + dy1 * dy1 <= noteHeadR * noteHeadR

    const dx2 = x - noteHead2X
    const dy2 = y - (noteHeadY - Math.round(size * 0.03))
    const inHead2 = dx2 * dx2 + dy2 * dy2 <= noteHeadR * noteHeadR

    if (inStem || inBeam || inHead1 || inHead2) {
      return [white[0], white[1], white[2], 255]
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