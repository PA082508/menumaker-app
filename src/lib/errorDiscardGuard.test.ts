import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
// @ts-expect-error — детектор один на карту и на гард, он .mjs без типов
import { scanErrorDiscards } from '../../scripts/errorDiscardScan.mjs'

// ============================================================================
// ГАРД ВЫБРОШЕННОГО error — сборка падает, если из пары { data, error }
// снова взяли только data.
//
// ПОВОД. Обе аварии 29.07 вышли из ОДНОГО идиома, и линт его не ловил: он ищет
// ГОЛЫЙ await без привязки, а здесь привязка ЕСТЬ. Идиом выглядит аккуратно и
// молчит:
//   карточка сотрудника  const [{data:R}] = await Promise.all([...])  → пустой экран
//   ручное добавление    const { data: kid } = await ...rpc(...)      → строка без ключа
// Читая код, этого не видно — значит правило дешевле дисциплины, и место ему
// в сборке, а не в памяти.
//
// ХРАПОВИК, А НЕ ЗАПРЕТ. На день постановки таких мест 173 в 66 файлах.
// Чинить их все одним заходом — это правка 66 экранов без сверки, то есть
// новая авария вместо старой. Поэтому потолок ЗАМОРОЖЕН и может только
// опускаться: любое НОВОЕ место валит сборку сразу, а старые гасятся партиями,
// и каждая партия опускает потолок.
//
// Законный отказ от error — один: `// error-ignored: <причина>` строкой выше.
// Причина обязана быть НАЗВАНА: пустая отговорка — то же молчание, только с
// виду законное.
//
// Fail-closed: нечитаемое дерево — тоже провал. «Мы не смогли посмотреть»
// никогда не должно читаться как «мы посмотрели, и там чисто».
// ============================================================================

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(HERE, '..')
const BASELINE = JSON.parse(
  readFileSync(resolve(HERE, '..', '..', 'docs', 'maintenance', 'error-discard-baseline.json'), 'utf8'),
)

describe('guard — a discarded error is a screen that lies', () => {
  const { app, byFile, byVerb } = scanErrorDiscards(SRC + '/')

  // ── ПИСАТЕЛИ: не храповик, а НОЛЬ. ───────────────────────────────────────
  // Читатель, потерявший error, рисует пустой экран — плохо, но ВИДНО.
  // Писатель, потерявший error, даёт тихую потерю данных: экран говорит
  // «сохранено», в базе нет ничего. Все 12 таких погашены 29.07 в один заход,
  // поэтому здесь потолок не нужен — здесь ноль.
  it('NOT ONE write discards its error — a saved screen with nothing saved', () => {
    const writers = app.filter((h: any) => h.verb !== 'чтение')
      .map((h: any) => `${h.rel}:${h.line} [${h.verb}]`)
    expect(
      writers,
      'a write (insert/update/upsert/delete/rpc/upload) drops its error. Readers have a frozen ceiling; ' +
      'writers have none — bind it and refuse in words (src/lib/queryError.ts: throwIf).',
    ).toEqual([])
    expect(byVerb['запись'] ?? 0).toBe(0)
    expect(byVerb['rpc'] ?? 0).toBe(0)
  })

  it('the tree is readable — the guard fails closed', () => {
    expect(Object.keys(byFile).length).toBeGreaterThan(0)
    expect(app.length).toBeGreaterThan(0)
  })

  it('no NEW file discards a supabase error', () => {
    const fresh = Object.keys(byFile).filter(f => !(f in BASELINE.byFile))
    expect(
      fresh,
      'these files discard the error from a supabase call. Bind it — `const { data, error } = await …; if (error) throw error` — ' +
      'or say why not, in the code: `// error-ignored: <reason>`. PostgREST rejects the WHOLE select on one unknown column, ' +
      'and an unbound error renders as a confident empty screen (docs/platform-standards.md).',
    ).toEqual([])
  })

  it('no known file grows a new discard', () => {
    const grown = Object.entries(byFile)
      .filter(([f, n]) => f in BASELINE.byFile && (n as number) > BASELINE.byFile[f])
      .map(([f, n]) => `${f}: ${BASELINE.byFile[f]} → ${n}`)
    expect(grown, 'a discarded error was added to a file that already had some — the ceiling only comes down').toEqual([])
  })

  // ПРИЁМ ИЗ ГАРДА signature_date, применённый ко всем спискам исключений
  // (владелец, 29.07): файл, переставший нарушать, обязан УЙТИ из списка.
  // Мёртвое исключение завтра прикроет живое нарушение — это единственное
  // место, где списки исключений гниют.
  it('в базовой линии нет мёртвых строк — файл без нарушений уходит из списка', () => {
    const dead = Object.keys(BASELINE.byFile).filter(f => !(f in byFile))
    expect(
      dead,
      'эти файлы больше не выбрасывают error — убрать из базовой линии: ' +
      '`node scripts/scan-error-discards.mjs --baseline`. Мёртвое исключение прикроет живое нарушение.',
    ).toEqual([])
  })

  it('the ceiling only comes down — lower it in the same commit that clears places', () => {
    expect(
      app.length,
      `${app.length} discards against a frozen ceiling of ${BASELINE.total}. If you cleared some, re-freeze: ` +
      '`node scripts/scan-error-discards.mjs --baseline`',
    ).toBeLessThanOrEqual(BASELINE.total)
  })
})
