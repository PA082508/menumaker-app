import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ============================================================================
// ГАРД ДВЕРИ B — быстрое добавление ребёнка не назначает F/R.
//
// ПОВОД, ЦИФРОЙ. Модалка «➕ Add Child» пишет `roster.frp` прямой вставкой и НЕ пишет
// носитель `income_eligibility`. Заявку считает носитель — значит выбранная здесь `F`
// живёт только на экране. Замер 31.07: 21 ребёнок числится Free, а июль считает его Paid.
// И умолчанием поля стояла именно `'F'`, то есть Free выдавалось БЕЗ ЕДИНОГО ДЕЙСТВИЯ
// директора.
//
// ПОЧЕМУ ГАРД, А НЕ КОММЕНТАРИЙ. Вернуть `<option value="F">` — правка на одну строку,
// выглядящая как улучшение («директору же нужна категория»). Она не сломает ни сборку,
// ни экран; разойдётся только витрина с деньгами, и увидят это через месяц на заявке.
// Такое правило дешевле держать в сборке, чем в памяти, — тот же приём, что «один счётчик
// на оба выхода».
//
// ЧТО ЭТО НЕ ЗАПРЕЩАЕТ: назначение F/R там, где пишется НОСИТЕЛЬ, — карточка ребёнка и
// IEA Review (дверь A, `recordDetermination`). Гард смотрит только на дверь B.
//
// Fail-closed: не нашли блок — провал. «Не смогли посмотреть» не читается как «чисто».
// ============================================================================

const HERE = dirname(fileURLToPath(import.meta.url))
const FILE = resolve(HERE, 'CenterRosterPage.tsx')
const SRC = readFileSync(FILE, 'utf8')

/** Тело модалки быстрого добавления — от её объявления до следующей модалки. */
function quickAddBlock(): string {
  const start = SRC.indexOf('function AddChildModal(')
  expect(start, 'AddChildModal не найдена — гард смотрит не туда, это провал').toBeGreaterThan(-1)
  const end = SRC.indexOf('function ReactivateModal(', start)
  expect(end, 'конец блока AddChildModal не найден').toBeGreaterThan(start)
  return SRC.slice(start, end)
}

describe('гард — Quick Add (дверь B) не раздаёт категорию без носителя', () => {
  it('категория, которую пишет дверь B, зафиксирована на P', () => {
    expect(SRC).toMatch(/const QUICK_ADD_FRP = 'P' as const/)
  })

  it('в форме быстрого добавления НЕТ выбора Free / Reduced', () => {
    const block = quickAddBlock()
    expect(block, 'вернулся <option value="F"> — Free без носителя не считается в заявке')
      .not.toMatch(/<option\s+value="F"/)
    expect(block, 'вернулся <option value="R"> — Reduced без носителя не считается в заявке')
      .not.toMatch(/<option\s+value="R"/)
  })

  it('вставка в ростер берёт категорию из константы, а не из полей формы', () => {
    const block = quickAddBlock()
    expect(block).toMatch(/frp:\s*QUICK_ADD_FRP/)
    expect(block, 'категория снова читается из формы — значит её снова можно выбрать')
      .not.toMatch(/frp:\s*form\.frp/)
    expect(block, "set('frp', …) вернулся в форму быстрого добавления")
      .not.toMatch(/set\(\s*'frp'/)
  })

  it('человеку сказано словами, где категория назначается на самом деле', () => {
    const block = quickAddBlock()
    // Отказ обязан объяснять себя НА МЕСТЕ ДЕЙСТВИЯ: молча запертое поле читается как
    // поломка, и директор пойдёт искать обход вместо второй двери.
    expect(block).toMatch(/child's card/i)
  })
})
