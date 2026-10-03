// Generates the Kiwi clock logo (SVG) and the PWA / favicon PNGs.
// Usage: npm run icons  (needs Chromium; set CHROMIUM_PATH if not at /opt/pw-browsers)
import { chromium } from 'playwright-core'
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const C = { x: 46, y: 51 }
const f = (n) => Number(n.toFixed(2))
const polar = (r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180
  return [f(C.x + r * Math.cos(a)), f(C.y + r * Math.sin(a))]
}

function seed(r, deg, rx, ry) {
  const [x, y] = polar(r, deg)
  return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${deg} ${x} ${y})" fill="#3B2A20"/>`
}

function rays() {
  const out = []
  for (let i = 0; i < 16; i++) {
    const deg = i * 22.5 + 11.25
    const [x1, y1] = polar(9, deg - 7)
    const [x2, y2] = polar(27, deg)
    const [x3, y3] = polar(9, deg + 7)
    out.push(`<path d="M${x1} ${y1} L${x2} ${y2} L${x3} ${y3} Z" fill="#E4EFB8" opacity="0.75"/>`)
  }
  return out.join('')
}

export function logoSvg({ arc = true, background = null } = {}) {
  const hourMarks = Array.from({ length: 12 }, (_, i) => seed(30.5, i * 30, 1.6, 2.5)).join('')
  const innerSeeds = Array.from({ length: 18 }, (_, i) => seed(17 + (i % 2) * 2.5, i * 20 + 10, 1.25, 2)).join('')
  const [hx, hy] = polar(13, -50)
  const [mx, my] = polar(21, 45)
  const viewBox = arc ? '0 0 100 100' : `${C.x - 43} ${C.y - 43} 86 86`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">
  <defs>
    <radialGradient id="flesh" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#E2EEAE"/>
      <stop offset="0.45" stop-color="#B5D453"/>
      <stop offset="1" stop-color="#7FAE2E"/>
    </radialGradient>
    <linearGradient id="arc" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#A9D14A"/>
      <stop offset="1" stop-color="#6E9E2E"/>
    </linearGradient>
  </defs>
  ${background ? `<rect x="-10" y="-10" width="120" height="120" fill="${background}"/>` : ''}
  ${arc ? `<path d="M${C.x} 4 A47 47 0 0 1 ${C.x} 98" fill="none" stroke="url(#arc)" stroke-width="3.2" stroke-linecap="round"/>` : ''}
  <circle cx="${C.x}" cy="${C.y}" r="40" fill="#FFFFFF" stroke="#4D4D52" stroke-width="5"/>
  <circle cx="${C.x}" cy="${C.y}" r="35" fill="url(#flesh)"/>
  ${rays()}
  <circle cx="${C.x}" cy="${C.y}" r="9" fill="#E8F2C2"/>
  ${hourMarks}
  ${innerSeeds}
  <path d="M${C.x} ${C.y} L${hx} ${hy}" stroke="#4D4D52" stroke-width="3" stroke-linecap="round"/>
  <path d="M${C.x} ${C.y} L${mx} ${my}" stroke="#6E9E2E" stroke-width="2.4" stroke-linecap="round"/>
  <circle cx="${C.x}" cy="${C.y}" r="1.8" fill="#4D4D52"/>
</svg>
`
}

writeFileSync('public/logo.svg', logoSvg())
writeFileSync('public/favicon.svg', logoSvg({ arc: false }))
console.log('wrote public/logo.svg and public/favicon.svg')

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const base = '/opt/pw-browsers'
  if (!existsSync(base)) return undefined
  for (const dir of readdirSync(base).filter((d) => d.startsWith('chromium'))) {
    for (const candidate of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
      const path = join(base, dir, candidate)
      if (existsSync(path)) return path
    }
  }
  return undefined
}

const browser = await chromium.launch({ executablePath: findChromium() })
const page = await browser.newPage()

async function png(file, size, svg, padding = 0, background = 'transparent') {
  await page.setViewportSize({ width: size, height: size })
  const inner = size - padding * 2
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;display:grid;place-items:center;background:${background}">` +
      `<div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></div></body></html>`,
  )
  await page.screenshot({ path: `public/${file}`, omitBackground: true })
  console.log(`wrote public/${file}`)
}

await png('pwa-192.png', 192, logoSvg({ arc: false }), 4)
await png('pwa-512.png', 512, logoSvg({ arc: false }), 10)
await png('apple-touch-icon.png', 180, logoSvg({ arc: false }), 12, '#FFFFFF')
// Maskable icons keep the logo inside the 80 % safe zone.
await png('pwa-maskable-512.png', 512, logoSvg({ arc: false }), 72, '#F3F8EC')
await browser.close()
