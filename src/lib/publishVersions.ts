/**
 * Номер следующей версии опубликованного меню — ПО КАЖДОМУ ЦЕНТРУ ОТДЕЛЬНО.
 *
 * published_menus уникален по (program, center_id, year, month, version), и
 * публикация только вперёд: повторная публикация месяца добавляет версию, а не
 * переписывает прежнюю. Одно нажатие на планировщике публикует месяц сразу по
 * всем центрам, но общий счётчик здесь был бы ошибкой: у центра, который админ
 * переиздавал точечно, история длиннее — общий счётчик либо налетел бы на
 * уникальный индекс, либо перепрыгнул номер у остальных.
 *
 * Вынесено из publishMonth.ts отдельной чистой функцией именно затем, чтобы это
 * правило проверялось тестом, а не читалось на глаз.
 */
export function nextVersionByCenter(
  centerIds: string[],
  previous: { center_id: string; version: number | null }[],
): Record<string, number> {
  const next: Record<string, number> = {}
  for (const id of centerIds) next[id] = 1
  for (const row of previous) {
    // Чужой центр в выборке не должен заводить себе строку в ответе.
    if (!(row.center_id in next)) continue
    next[row.center_id] = Math.max(next[row.center_id], (row.version ?? 0) + 1)
  }
  return next
}
