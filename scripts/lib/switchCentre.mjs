// switchCentre.mjs — общий приём для проб: выбрать центр в боковой панели.
//
// ДВЕ ЛОВУШКИ, каждая стоила пробе ложного провала:
//   1. меню центров — HOVER-выпадашка: пока она закрыта, у её пунктов
//      pointer-events: none, и клик по пункту уходит в пустоту. Открывать её надо
//      ШАПКОЙ, где стоит подпись активного входа;
//   2. с 05.08 выбор центра ПОМНИТСЯ между переходами (localStorage). Проба,
//      которая раньше рассчитывала на сброс в Main Office после goto, теперь
//      останется в центре прошлого прогона — и прочитает чужой список.
//      Поэтому: либо чистить память в начале, либо выбирать центр явно.

/** Подпись активного входа — первая строка после названия продукта. */
export async function activeCentre(page) {
  const lines = (await page.locator('body').innerText()).split('\n').map(s => s.trim())
  const i = lines.findIndex(l => l === 'Play Academy')
  return i >= 0 ? lines[i + 1] : '(не найдено)'
}

/** Забыть выбранный центр — проба начинает с чистого листа. */
export async function forgetCentre(page) {
  await page.evaluate(() => {
    Object.keys(localStorage).filter(k => k.startsWith('mm.currentCenter.')).forEach(k => localStorage.removeItem(k))
  })
}

/** Выбрать центр (или 'Main Office') в переключателе. Возвращает активный вход. */
export async function pickCentre(page, label, settleMs = 3500) {
  const cur = await activeCentre(page)
  if (cur === label) return cur
  const header = page.getByText(cur, { exact: true }).first()
  if (await header.count().catch(() => 0)) {
    await header.hover().catch(() => {})
    await header.click().catch(() => {})
  }
  await page.waitForTimeout(900)
  const item = page.getByText(label, { exact: true }).last()
  if (await item.count().catch(() => 0)) await item.click().catch(() => {})
  await page.waitForTimeout(settleMs)
  await page.keyboard.press('Escape').catch(() => {})
  await page.mouse.move(1300, 820)
  await page.waitForTimeout(600)
  return await activeCentre(page)
}
