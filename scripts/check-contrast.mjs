#!/usr/bin/env node
// check-contrast.mjs — measures every documented colour pair of the SafePass palette and fails
// if one drops under its target. "Looks fine on my laptop" is not a measurement; this is.
//
//   node scripts/check-contrast.mjs           → table + exit 1 on any failure
//
// Targets (Nikolay, 2026-07-27): body/controls AA >= 4.5, KEY elements >= 7.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../src/pages/safepass/shared/theme.ts', import.meta.url), 'utf8')
const grab = (name) => {
  const block = src.split(`export const ${name}: SafePassPalette = {`)[1].split('}')[0]
  const out = {}
  for (const m of block.matchAll(/(\w+):\s*'([^']+)'/g)) out[m[1]] = m[2]
  return out
}
const LIGHT = grab('LIGHT'), DARK = grab('DARK')

const lum = (hex) => {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

// [label, fg, bg, target]
const pairs = (P, theme) => [
  [`${theme} body text on surface`, P.text, P.surface, 4.5],
  [`${theme} body text on bg`, P.text, P.bg, 4.5],
  [`${theme} muted on surface`, P.muted, P.surface, 4.5],
  [`${theme} muted on surface2`, P.muted, P.surface2, 4.5],
  [`${theme} KEY green on surface`, P.green, P.surface, 7],
  [`${theme} KEY red (error) on surface`, P.red, P.surface, 7],
  [`${theme} KEY amber on surface`, P.amber, P.surface, 7],
  [`${theme} KEY blue on surface`, P.blue, P.surface, 7],
  [`${theme} button label on green`, P.onAccent, P.green, 4.5],
  [`${theme} button label on blue`, P.onAccent, P.blue, 4.5],
  [`${theme} button label on red`, P.onAccent, P.red, 4.5],
]

let failed = 0
const rows = [...pairs(LIGHT, 'light'), ...pairs(DARK, 'dark')].map(([label, fg, bg, target]) => {
  const r = ratio(fg, bg)
  const ok = r >= target
  if (!ok) failed++
  return `${ok ? '✓' : '✗'}  ${r.toFixed(2).padStart(6)} : 1   (target ${target})  ${label}`
})
console.log(rows.join('\n'))
console.log(failed ? `\n${failed} pair(s) UNDER target` : '\nall pairs meet their target')
process.exit(failed ? 1 : 0)
