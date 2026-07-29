/**
 * Один способ не потерять error из пары { data, error }.
 *
 * ПОВОД (29.07). Обе аварии дня вышли из одного идиома: из пары берут только
 * data. Читатель, потерявший error, рисует ПУСТОЙ ЭКРАН — плохо, но видно.
 * Писатель, потерявший error, даёт ТИХУЮ ПОТЕРЮ ДАННЫХ: экран говорит
 * «сохранено», в базе нет ничего, и не видно вовсе. Поэтому у писателей выход
 * один — сказать словами и не продолжать.
 *
 * `scope` — то, что человек прочтёт в сообщении. Не «request failed», а что
 * именно не сохранилось: по этой строке директор поймёт, звонить ли нам.
 */
export function throwIf(error: { message?: string } | null | undefined, scope: string): void {
  if (!error) return
  throw new Error(`${scope}: ${error.message ?? 'the database refused the request'}`)
}

/**
 * Для чтений на экранах, где показать ошибку сегодня негде. НЕ глушилка: она
 * обязана оставить след с именем места, чтобы «пусто» никогда не читалось как
 * «данных нет». Возвращает true, если ошибка была, — вызывающий может решить,
 * рисовать ли пустоту.
 */
export function warnIf(error: { message?: string } | null | undefined, scope: string): boolean {
  if (!error) return false
  console.error(`[${scope}] запрос отказан, экран покажет пустоту: ${error.message ?? 'unknown'}`)
  return true
}
