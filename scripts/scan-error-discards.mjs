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
const { app, tests, byFile, byVerb } = scanErrorDiscards(SRC)
const top = Object.entries(byFile).sort((a, b) => b[1] - a[1])
const writers = app.filter(h => h.verb !== 'чтение')

if (ARG === '--list') for (const h of app) console.log(`${h.rel}:${h.line}  [${h.verb}/${h.kind}]  ${h.pattern}`)
if (ARG === '--writers') for (const h of writers) console.log(`${h.rel}:${h.line}  [${h.verb}]  ${h.pattern}`)

console.log(`\n  ВЫБРОШЕННЫЙ error — в формах: разбор { data } · голый await · const r + r.data · .then(({data}))`)
console.log(`  ─────────────────────────────────────────────────────`)
console.log(`  мест В ЭТИХ ФОРМАХ, в коде приложения : ${app.length}`)
console.log(`  в тестах          : ${tests.length}  (отдельно: тест врёт себе, не директору)`)
console.log(`  файлов затронуто  : ${top.length}`)
console.log(`\n  По глаголу — гасим по этому порядку, не по файлам:`)
console.log(`    запись : ${byVerb['запись'] || 0}  ← ТИХАЯ ПОТЕРЯ ДАННЫХ, не видно вовсе`)
console.log(`    rpc    : ${byVerb['rpc'] || 0}  ← считаем писателем: имя функции не порука`)
console.log(`    чтение : ${byVerb['чтение'] || 0}  ← пустой экран: плохо, но видно`)
console.log(`\n  Писательские по файлам (первая очередь):`)
const wByFile = {}
for (const h of writers) wByFile[h.rel] = (wByFile[h.rel] || 0) + 1
for (const [f, n] of Object.entries(wByFile).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`    ${String(n).padStart(3)}  ${f}`)
}
console.log()

if (ARG === '--baseline') {
  writeFileSync(
    new URL('../docs/maintenance/error-discard-baseline.json', import.meta.url),
    JSON.stringify({ frozen: '2026-07-29', total: app.length, byFile }, null, 2) + '\n',
  )
  console.log(`  базовая линия записана: ${app.length} мест в ${top.length} файлах\n`)
}
