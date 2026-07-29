#!/usr/bin/env node
// ============================================================================
// КАРТА ВЫБРОШЕННОГО error — CLI поверх общего детектора.
//
//   node scripts/scan-error-discards.mjs             карта
//   node scripts/scan-error-discards.mjs --list      все места построчно
//   node scripts/scan-error-discards.mjs --baseline  заморозить потолок
//
// Тело детектора — scripts/errorDiscardScan.mjs, ОДНО на карту и на гард:
// проверка, живущая отдельно от того, что она проверяет, расходится с ней.
// ============================================================================
import { writeFileSync } from 'node:fs'
import { scanErrorDiscards } from './errorDiscardScan.mjs'

const SRC = new URL('../src/', import.meta.url).pathname
const ARG = process.argv[2] || ''
const { app, tests, byFile } = scanErrorDiscards(SRC)
const top = Object.entries(byFile).sort((a, b) => b[1] - a[1])

if (ARG === '--list') for (const h of app) console.log(`${h.rel}:${h.line}  [${h.kind}]  ${h.pattern}`)

console.log(`\n  ВЫБРОШЕННЫЙ error`)
console.log(`  ─────────────────────────────────────────────────────`)
console.log(`  в коде приложения : ${app.length}`)
console.log(`  в тестах          : ${tests.length}  (отдельно: тест врёт себе, не директору)`)
console.log(`  файлов затронуто  : ${top.length}`)
console.log(`\n  Худшие десять файлов:`)
for (const [f, n] of top.slice(0, 10)) console.log(`    ${String(n).padStart(3)}  ${f}`)
console.log()

if (ARG === '--baseline') {
  writeFileSync(
    new URL('../docs/maintenance/error-discard-baseline.json', import.meta.url),
    JSON.stringify({ frozen: '2026-07-29', total: app.length, byFile }, null, 2) + '\n',
  )
  console.log(`  базовая линия записана: ${app.length} мест в ${top.length} файлах\n`)
}
