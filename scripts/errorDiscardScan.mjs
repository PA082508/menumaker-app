// ============================================================================
// ДЕТЕКТОР ВЫБРОШЕННОГО error — одно тело для CLI-карты и для гарда сборки.
//
// Обе аварии 29.07 вышли из ОДНОГО идиома, и он НЕ голый await: привязка есть,
// но из пары { data, error } берут только data.
//   карточка сотрудника:  const [{data:R}] = await Promise.all([...])
//   ручное добавление:    const { data: kid } = await ...rpc(...)
// Дальше `?? null` или пустой рендер — и экран уверенно врёт директору.
//
// Признак УТОЧНЁННЫЙ (канон 28.07): не «нет слова error», а «результат вызова
// supabase разобран, и error в разбор не попал».
// ============================================================================
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/** Маркеры того, что await-выражение — обращение к базе, а не что угодно. */
const SUPA = /\bsupabase\b|\.from\(|\.rpc\(|\bS\(\)|\.schema\(|\.storage\b|\.auth\.|functions\.invoke/

/** Выражение после `await` до конца инструкции, со счётом скобок. */
function expressionAt(text, i) {
  let depth = 0
  for (let j = i; j < text.length && j < i + 4000; j++) {
    const c = text[j]
    if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) { if (depth === 0) return text.slice(i, j); depth-- }
    else if ((c === ';' || c === '\n') && depth === 0) return text.slice(i, j)
  }
  return text.slice(i, i + 4000)
}

function sourceFiles(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) { sourceFiles(p, out); continue }
    if (/\.tsx?$/.test(e)) out.push(p)
  }
  return out
}

const bindsError = (pattern) => /\berror\b/.test(pattern)

/**
 * Глагол вызова. Читатель, потерявший error, даёт ПУСТОЙ ЭКРАН — плохо, но
 * видно. Писатель, потерявший error, даёт ТИХУЮ ПОТЕРЮ ДАННЫХ — не видно вовсе:
 * экран говорит «сохранено», в базе нет ничего. Обе аварии 29.07 — по одной
 * каждого вида. Писательские гасятся первыми, независимо от файла.
 * `rpc` считается писателем: имени функции недостаточно, чтобы поручиться, что
 * она ничего не пишет, — а ошибаться здесь надо в сторону строгости.
 */
const verbOf = (expr) =>
  /\.(insert|update|upsert|delete)\s*\(/.test(expr) ? 'запись'
  : /\.rpc\s*(as any\s*)?\)?\s*\(|\.rpc\b/.test(expr) ? 'rpc'
  : /functions\.invoke/.test(expr) ? 'rpc'
  : /\.(upload|remove|createSignedUrl)\s*\(/.test(expr) ? 'запись'
  : 'чтение'

/**
 * Совпадение внутри КОММЕНТАРИЯ — не код. Поймано на собственном гарде: его
 * пояснение цитирует дурной идиом дословно, и детектор посчитал цитату
 * нарушением. Проверка, считающая разговор о проблеме самой проблемой, завышает
 * цифру — а цифра тут и есть весь смысл.
 */
const inComment = (text, idx) => {
  const lineStart = text.lastIndexOf('\n', idx - 1) + 1
  const head = text.slice(lineStart, idx).trimStart()
  if (head.startsWith('//') || head.startsWith('*')) return true
  const before = text.slice(0, idx)
  return before.lastIndexOf('/*') > before.lastIndexOf('*/')
}

/**
 * Явный отказ с НАЗВАННОЙ причиной — единственный законный способ не брать
 * error: `// error-ignored: <почему>` на строке выше или на две выше.
 * Пустая причина не считается: молчание с виду законным — то же молчание.
 */
const excusedNear = (text, idx) => {
  const from = text.lastIndexOf('\n', Math.max(0, text.lastIndexOf('\n', Math.max(0, idx - 1)) - 1))
  return /error-ignored:\s*\S/.test(text.slice(Math.max(0, from), idx))
}

/** @returns {{app: object[], tests: object[], byFile: Record<string, number>}} */
export function scanErrorDiscards(srcDir) {
  const hits = []
  for (const f of sourceFiles(srcDir)) {
    const text = readFileSync(f, 'utf8')
    const rel = relative(srcDir, f)
    const isTest = /\.test\.tsx?$/.test(rel)

    // 1) const { … } = await <supabase>   и   const [ { … }, … ] = await <supabase>
    const re = /(?:const|let|var)\s*(\{[^}]*\}|\[[^\]]*\])\s*=\s*await\s/g
    let m
    while ((m = re.exec(text))) {
      const pattern = m[1]
      const expr = expressionAt(text, m.index + m[0].length)
      if (!SUPA.test(expr)) continue
      if (inComment(text, m.index)) continue
      if (excusedNear(text, m.index)) continue
      const line = text.slice(0, m.index).split('\n').length
      const verb = verbOf(expr)
      if (pattern.startsWith('{')) {
        if (!bindsError(pattern)) hits.push({ rel, line, isTest, verb, kind: 'объект', pattern: pattern.replace(/\s+/g, ' ') })
      } else {
        const parts = pattern.slice(1, -1).split(/,(?![^{]*\})/).map(s => s.trim()).filter(Boolean)
        const bad = parts.filter(p => p.startsWith('{') && !bindsError(p))
        if (bad.length) hits.push({ rel, line, isTest, verb, kind: `массив ×${bad.length}`, pattern: pattern.replace(/\s+/g, ' ').slice(0, 90) })
      }
    }

    // 2) .then(({ data }) => …) — та же потеря, другой синтаксис
    const re2 = /\.then\(\s*\(\s*(\{[^}]*\})\s*\)\s*=>/g
    while ((m = re2.exec(text))) {
      if (bindsError(m[1])) continue
      if (!SUPA.test(text.slice(Math.max(0, m.index - 400), m.index))) continue
      if (inComment(text, m.index)) continue
      if (excusedNear(text, m.index)) continue
      hits.push({ rel, line: text.slice(0, m.index).split('\n').length, isTest, kind: '.then',
                  verb: verbOf(text.slice(Math.max(0, m.index - 400), m.index)), pattern: m[1].replace(/\s+/g, ' ') })
    }
  }

  const app = hits.filter(h => !h.isTest)
  const byFile = {}
  for (const h of app) byFile[h.rel] = (byFile[h.rel] || 0) + 1
  const byVerb = {}
  for (const h of app) byVerb[h.verb] = (byVerb[h.verb] || 0) + 1
  return { app, tests: hits.filter(h => h.isTest), byFile, byVerb }
}
