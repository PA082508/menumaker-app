// scripts/uiLanguageScan.mjs
// ДЕТЕКТОР КИРИЛЛИЦЫ В ИНТЕРФЕЙСЕ. Один на CLI и на гард — проверка, живущая
// отдельно от того, что она проверяет, расходится с ней.
//
// ПРАВИЛО ВЛАДЕЛЬЦА (закреплено, подтверждено 04.08): весь UI — только
// английский; русский живёт в комментариях кода.
//
// ЧТО СЧИТАЕТСЯ НАРУШЕНИЕМ: кириллица где угодно в исходнике ПОСЛЕ вырезания
// комментариев — строковый литерал, текст JSX, сообщение console, текст ошибки.
// Границу «строка против JSX-текста» детектор нарочно не проводит: текст между
// тегами — тот же интерфейс, а разбирать TSX разбором вместо вырезания
// комментариев значит завести второй парсер ради того же ответа.
//
// ЧТО НЕ СЧИТАЕТСЯ:
//   · комментарии — там русский разрешён прямо правилом;
//   · *.test.ts(x) — имена проб читает разработчик, а не сад;
//   · строки с меткой `ui-english-exempt` в комментарии на этой же или одной из
//     ТРЁХ предыдущих строк. Метка существует для ДАННЫХ, а не для UI: например
//     сопоставление с русским ответом edge-функции — перевести его значит
//     сломать разбор. Причина обязана быть НАЗВАНА рядом: пустая отговорка —
//     то же нарушение, только с виду законное.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const CYRILLIC = /[Ѐ-ӿԀ-ԯ]/
const EXEMPT_MARK = 'ui-english-exempt'
const EXEMPT_LOOKBACK = 3

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(p)) out.push(p)
  }
  return out
}

/**
 * Вырезает комментарии, СОХРАНЯЯ разбивку на строки (иначе номер строки в
 * отчёте указывал бы не туда, и находку невозможно было бы открыть).
 * Строковые литералы не разбираются: `//` внутри строки встречается в URL, но
 * ложно «погашенная» им строка потеряла бы кириллицу только вместе со своим
 * же хвостом — а хвост URL по-русски не пишут.
 */
export function stripComments(src) {
  let out = ''
  let mode = 'code'
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    const next = src[i + 1]
    if (mode === 'code') {
      if (c === '/' && next === '*') { mode = 'block'; out += '  '; i++; continue }
      if (c === '/' && next === '/') { mode = 'line'; out += '  '; i++; continue }
      out += c
      continue
    }
    if (mode === 'block') {
      if (c === '*' && next === '/') { mode = 'code'; out += '  '; i++; continue }
      out += c === '\n' ? '\n' : ' '
      continue
    }
    // mode === 'line'
    if (c === '\n') { mode = 'code'; out += '\n'; continue }
    out += ' '
  }
  return out
}

export function scanCyrillicUi(srcDir) {
  const files = walk(srcDir)
  const hits = []
  const exempt = []
  for (const file of files) {
    if (/\.test\.tsx?$/.test(file)) continue
    const raw = readFileSync(file, 'utf8')
    const rawLines = raw.split('\n')
    const codeLines = stripComments(raw).split('\n')
    codeLines.forEach((line, idx) => {
      if (!CYRILLIC.test(line)) return
      const from = Math.max(0, idx - EXEMPT_LOOKBACK)
      const marked = rawLines.slice(from, idx + 1).some((l) => l.includes(EXEMPT_MARK))
      const rec = { rel: relative(srcDir, file), line: idx + 1, text: line.trim().slice(0, 160) }
      ;(marked ? exempt : hits).push(rec)
    })
  }
  const byFile = {}
  for (const h of hits) byFile[h.rel] = (byFile[h.rel] ?? 0) + 1
  return { hits, exempt, byFile }
}

// Запуск напрямую: карта нарушений.
if (process.argv[1] && process.argv[1].endsWith('uiLanguageScan.mjs')) {
  const src = new URL('../src/', import.meta.url).pathname
  const { hits, exempt } = scanCyrillicUi(src)
  for (const h of hits) console.log(`${h.rel}:${h.line}  ${h.text}`)
  console.log(`\n  кириллица в интерфейсе : ${hits.length}`)
  console.log(`  помечено как данные    : ${exempt.length}  (${EXEMPT_MARK})`)
  if (hits.length) process.exitCode = 1
}
