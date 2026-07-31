import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ГАРД «ОДИН СЧЁТЧИК». Не «маловероятно», а НЕВОЗМОЖНО: страница заявки не имеет
// права ни считать приёмы сама, ни читать строки недели. Единственный источник цифр —
// menumaker.compute_monthly_claim.
//
// Почему гард текстовый, а не типовой: расхождение рождается не из типов, а из ВТОРОЙ
// РЕАЛИЗАЦИИ ПРАВИЛА. Поймать можно только сам факт появления такой реализации в файле.
//
// Цена вопроса замерена 31.07: дашборд 3 889 против страницы 3 893 по Highland за июль —
// четыре дня «Завтрак + Ланч + Ужин, снека нет», где клиентское правило считало
// «всего ≤ 3 → не исключать ничего», а норма CACFP — 2 приёма + 1 снек.

const FORBIDDEN: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /meal_week_records/, why: 'страница читает строки недели напрямую — счёт обязан приходить из RPC' },
  { pattern: /getExcludedSlot/, why: 'вернулось клиентское правило исключения приёмов' },
  { pattern: /\bMEAL_SLOTS\b|\bSNACK_SLOTS\b/, why: 'вернулись клиентские таблицы приёмов/снеков' },
  { pattern: /PRIORITY\s*:\s*Record/, why: 'вернулся клиентский приоритет приёмов' },
]

/** Комментарии из проверки исключаются: запись «getExcludedSlot УДАЛЁН» — это
 *  память о дефекте, а не дефект. Гард ловит КОД. */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ')
}

/** Чистая проверка — чтобы её саму можно было проверить негативной пробой. */
export function singleCounterViolations(src: string): string[] {
  const code = stripComments(src)
  return FORBIDDEN.filter(f => f.pattern.test(code)).map(f => f.why)
}

const pagePath = resolve(__dirname, 'SiteClaimReport.tsx')

describe('гард «один счётчик» на странице заявки', () => {
  it('SiteClaimReport не считает приёмы и не читает строки недели', () => {
    const src = readFileSync(pagePath, 'utf8')
    expect(singleCounterViolations(src)).toEqual([])
  })

  it('страница действительно ходит в compute_monthly_claim', () => {
    const src = readFileSync(pagePath, 'utf8')
    expect(src).toMatch(/compute_monthly_claim/)
    expect(src).toMatch(/claimFromRpc/)
  })

  it('НЕГАТИВНАЯ ПРОБА: на коде, каким он был до 31.07, гард краснеет', () => {
    // Дословный фрагмент прежней страницы — тот самый второй счётчик.
    const before = `
      const {data:allRecs}=await supabase.schema("menumaker").from("meal_week_records")
        .select("*").eq("center_id",centerId).in("monday_date",mondays);
      const MEAL_SLOTS  = ["b","l","su"];
      const excl=getExcludedSlot(dv);
    `
    const found = singleCounterViolations(before)
    expect(found.length).toBeGreaterThanOrEqual(3)
    // и проба на самой проверке: закомментированный дефект дефектом НЕ считается
    expect(singleCounterViolations('// const excl = getExcludedSlot(dv)')).toEqual([])
    expect(found.join(' ')).toMatch(/строки недели/)
  })
})
