// scripts/weekly-meal-sheet.mjs
// CHILDREN'S MEAL COUNT BY INDIVIDUAL NAME — печатный недельный лист.
//
// НАЗНАЧЕНИЕ (владелец, 30.07): лист кладётся РЯДОМ с бумажным сканом той же
// комнато-недели, и расхождение видно глазом. Проследить ребёнка по скану иначе
// невозможно — это и есть инструмент, разблокирующий решение по задвоению.
//
// ⚠️ УСЛОВИЕ 1 — ИСТОЧНИК СТРОК. Лист строится ИСКЛЮЧИТЕЛЬНО из строк недели
// (meal_week_records по своему classroom_id + monday_date). Экранный список по
// текущему roster.classroom_id НЕ используется НИКОГДА: переведённый ребёнок
// исчез бы из старого класса, а именно он и есть предмет спора.
// Существующий src/utils/PrintMealCountForm.ts для этого НЕ ГОДИТСЯ — он читает
// roster по classroom_id + is_active, то есть ровно запрещённый путь.
//
// Вход:  JSON [{room, week, kids:[{n, a, m}]}], m = 30 символов 0/1,
//        порядок day-major: пн..пт × (B, AM, L, PM, S, ES).
//        Необязательно на строке: hot=true — подсветить; mk='▲' — знак в колонке
//        номера. Необязательно на странице: legend — своя строка легенды в подвале.
//        Подсветка данными нужна там, где спорна не фамилия, а КОНКРЕТНАЯ СТРОКА:
//        при расщеплении по имени один ребёнок стоит в листе дважды под разными
//        написаниями, и по списку фамилий их не различить.
// Выход: один HTML, по странице на комнато-неделю, готов к печати (альбом).
//
//   node scripts/weekly-meal-sheet.mjs <data.json> <out.html> [--order lastname|asis]
//
// Порядок строк: см. ORDER ниже — на бумаге он НАМИ НЕ ЗАФИКСИРОВАН, и это
// сказано прямо в подвале каждого листа, чтобы сверка не приняла наш порядок
// за утверждение о бумаге.

import fs from 'node:fs'

const [, , dataPath, outPath, ...rest] = process.argv
if (!dataPath || !outPath) {
  console.error('usage: node scripts/weekly-meal-sheet.mjs <data.json> <out.html> [--order lastname|asis]')
  process.exit(1)
}
const ORDER = (rest.includes('--order') ? rest[rest.indexOf('--order') + 1] : 'lastname')

// Пять фамилий из замера 30.07(b) B3 — подсвечиваются ТОЛЬКО на нашей копии.
// На скане, разумеется, не трогается ничего.
const DISPUTED = new Set([
  'Mason Skyla', 'Morgan Kairio', 'Resendez Josean', 'Sekongo Messie', 'Williams Bailey',
])

const SLOTS = [
  { k: 'B',  t: 'Breakfast' },
  { k: 'AM', t: 'AM Snack' },
  { k: 'L',  t: 'Lunch' },
  { k: 'PM', t: 'PM Snack' },
  { k: 'S',  t: 'Supper' },
  { k: 'ES', t: 'Eve Snack' },
]
const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]))
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d }
const md = d => `${d.getMonth() + 1}/${d.getDate()}`

/** Ячейка недели: 1 если отмечено. day 0..4, slot 0..5. */
const mark = (m, day, slot) => m[day * 6 + slot] === '1'

function sheet(page) {
  const monday = new Date(page.week + 'T12:00:00')
  const friday = addDays(page.week, 4)
  const dates  = [0, 1, 2, 3, 4].map(i => md(addDays(page.week, i)))

  // Неделя может лежать на стыке месяцев — в шапке MO/YR стоит месяц ПОНЕДЕЛЬНИКА,
  // а полный диапазон печатается в WEEK OF, чтобы лист сам нёс свои даты.
  const moLabel = MONTHS[monday.getMonth()]
  const yrLabel = monday.getFullYear()
  const weekOf  = `${md(monday)}/${String(monday.getFullYear()).slice(2)} – ${md(friday)}/${String(friday.getFullYear()).slice(2)}`

  const kids = page.kids.slice()
  if (ORDER === 'lastname') {
    // Стабильная сортировка по строке имени как она записана в строке недели.
    kids.sort((a, b) => a.n.localeCompare(b.n, 'en'))
  } // 'asis' — порядок как пришёл из запроса

  // Итоги: [день][слот]
  const daily = DAYS.map((_, d) => SLOTS.map((_, s) => kids.filter(k => mark(k.m, d, s)).length))
  const weekBySlot = SLOTS.map((_, s) => daily.reduce((n, day) => n + day[s], 0))
  const weekTotal  = weekBySlot.reduce((a, b) => a + b, 0)

  // Праздники приходят из menumaker.holidays по центру — НЕ зашиты в код.
  // Канон A7: праздничный день сохраняет свою колонку и ПОДПИСЫВАЕТСЯ, а не исчезает.
  // Без подписи пустая колонка на нашей копии прочиталась бы как расхождение с бумагой.
  const hol = page.holidays ?? {}   // { 'YYYY-MM-DD': 'Independence Day' }
  const isoOf = i => { const d = addDays(page.week, i); return d.toISOString().slice(0, 10) }
  const holOn = i => hol[isoOf(i)] ?? null

  const dayHeads = DAYS.map((d, i) => {
    const h = holOn(i)
    return `<th colspan="6" class="dh${i ? ' sep' : ''}${h ? ' hol' : ''}">${d}` +
           `<span class="dt">${dates[i]}${h ? ` · ${esc(h)}` : ''}</span></th>`
  }).join('')
  const slotHeads = DAYS.map((_, i) =>
    SLOTS.map((s, j) => `<th class="sh${!j && i ? ' sep' : ''}${holOn(i) ? ' hol' : ''}">${s.k}</th>`).join('')).join('')

  const bodyRows = kids.map((k, i) => {
    const hot = k.hot ?? DISPUTED.has(k.n)
    const mk  = k.mk ?? '▲'
    const cells = DAYS.map((_, d) =>
      SLOTS.map((_, s) =>
        `<td class="c${!s && d ? ' sep' : ''}${holOn(d) ? ' hol' : ''}">${mark(k.m, d, s) ? '×' : ''}</td>`).join('')).join('')
    // Метка спорной строки — БЕЗ СЛОВ (треугольник в колонке номера). Официальный бланк
    // остаётся англоязычным, а пояснение живёт в подвале, вне поля формы.
    return `<tr class="${hot ? 'hot' : ''}">
      <td class="num">${hot ? `<span class="mk">${esc(mk)}</span>` : ''}${i + 1}</td>
      <td class="nm">${esc(k.n)}</td>
      <td class="ag">${esc(k.a ?? '')}</td>${cells}</tr>`
  }).join('\n')

  const totalRow = DAYS.map((_, d) =>
    SLOTS.map((_, s) => `<td class="tc${!s && d ? ' sep' : ''}${holOn(d) ? ' hol' : ''}">${daily[d][s] || ''}</td>`).join('')).join('')

  const pageBox = SLOTS.map((s, i) =>
    `<div class="bx"><span class="bxk">${s.t}</span><span class="bxv">${weekBySlot[i]}</span></div>`).join('')

  return `<section class="sheet">
  <div class="ttl">CHILDREN'S MEAL COUNT BY INDIVIDUAL NAME</div>
  <table class="hdr"><tr>
    <td><b>MO</b><span>${moLabel}</span></td>
    <td><b>YR</b><span>${yrLabel}</span></td>
    <td class="w"><b>WEEK OF</b><span>${weekOf}</span></td>
    <td class="w"><b>CLASSROOM</b><span>${esc(page.room)}</span></td>
    <td class="w"><b>TEACHER</b><span class="blank"></span></td>
  </tr></table>

  <table class="grid">
    <thead>
      <tr><th class="num" rowspan="2">#</th><th class="nm" rowspan="2">CHILD'S NAME</th>
          <th class="ag" rowspan="2">AGE</th>${dayHeads}</tr>
      <tr>${slotHeads}</tr>
    </thead>
    <tbody>
${bodyRows}
    </tbody>
    <tfoot>
      <tr class="tot"><td colspan="3" class="tl">DAILY MEAL COUNT TOTALS</td>${totalRow}</tr>
    </tfoot>
  </table>

  <div class="foot">
    <div class="box">
      <div class="boxt">MEAL COUNT TOTALS FOR PAGE (WEEK)</div>
      <div class="boxr">${pageBox}<div class="bx all"><span class="bxk">TOTAL</span><span class="bxv">${weekTotal}</span></div></div>
    </div>
    <div class="sig">
      <div><span class="sl"></span>COOK</div>
      <div><span class="sl"></span>DIRECTOR</div>
    </div>
  </div>

  <div class="note">Наша копия · строки взяты из <b>строк недели</b> (<code>meal_week_records</code>,
    ${esc(page.room)} / ${page.week}), НЕ из текущего списка класса · детей в листе: ${kids.length} ·
    порядок строк: ${ORDER === 'lastname' ? 'по фамилии, А–Я' : 'как в базе'} —
    <b>порядок бумажного бланка нами не зафиксирован</b>, сверять глазом ·
    ${page.legend ?? '<span class="mk">▲</span> — спорная строка замера 30.07 (задвоение), на скане не помечено ничем'}${
      Object.keys(hol).length ? ' · праздничные дни подписаны в шапке колонки' : ''}</div>
</section>`
}

const pages = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Children's Meal Count — ${esc([...new Set(pages.map(p => p.room))].join(', '))} · ${
  esc(pages.map(p => p.week).join(' & '))}</title>
<style>
  @page { size: letter landscape; margin: 8mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; background: #f0f0f0; color: #000; }
  .sheet { background: #fff; width: 279mm; min-height: 200mm; padding: 6mm 7mm; margin: 0 auto 6mm;
           page-break-after: always; }
  .sheet:last-child { page-break-after: auto; }
  .ttl { text-align: center; font-size: 13pt; font-weight: 700; letter-spacing: .04em; margin-bottom: 4px; }
  table.hdr { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
  table.hdr td { border: 1px solid #000; padding: 2px 6px; font-size: 8.5pt; white-space: nowrap; }
  table.hdr td.w { width: 24%; }
  table.hdr b { font-size: 7pt; letter-spacing: .06em; margin-right: 6px; }
  table.hdr span { font-size: 9.5pt; font-weight: 700; }
  table.hdr .blank { display: inline-block; min-width: 90px; border-bottom: 1px solid #999; }

  table.grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.grid th, table.grid td { border: 1px solid #999; font-size: 7.5pt; text-align: center; padding: 1px 0; }
  table.grid th.dh { background: #e8e8e8; font-size: 7.5pt; letter-spacing: .03em; padding: 2px 0; }
  table.grid th.dh .dt { display: block; font-weight: 400; font-size: 6.5pt; }
  table.grid th.sh { background: #f4f4f4; font-size: 6.5pt; font-weight: 700; }
  table.grid .num { width: 30px; }
  table.grid .mk  { color: #b8860b; font-size: 6.5pt; margin-right: 2px; vertical-align: 1px; }
  table.grid .nm  { width: 132px; text-align: left; padding-left: 4px; font-size: 8pt; white-space: nowrap;
                    overflow: hidden; text-overflow: ellipsis; }
  /* Праздник: колонка сохраняется и подписывается — никогда не исчезает (канон A7). */
  table.grid th.hol { background: #ddd; }
  table.grid td.hol { background: repeating-linear-gradient(45deg,#f2f2f2,#f2f2f2 3px,#e6e6e6 3px,#e6e6e6 6px) !important; }
  table.grid .ag  { width: 34px; font-size: 6.5pt; }
  table.grid td.c { height: 13px; font-size: 9pt; font-weight: 700; }
  table.grid .sep { border-left: 2px solid #000; }
  table.grid tbody tr:nth-child(even) td { background: #fbfbfb; }

  /* Подсветка спорных — ТОЛЬКО на нашей копии. */
  table.grid tr.hot td { background: #fff3c4 !important; }
  table.grid tr.hot .nm { font-weight: 700; }
  .flag { font-size: 6pt; font-weight: 400; color: #8a5a12; margin-left: 5px;
          border: 1px solid #d8b357; border-radius: 3px; padding: 0 3px; }

  table.grid tfoot .tot td { background: #e8e8e8; font-weight: 700; font-size: 7.5pt; height: 15px; }
  table.grid tfoot .tl { text-align: right; padding-right: 6px; letter-spacing: .03em; }

  .foot { display: flex; gap: 8px; margin-top: 5px; align-items: stretch; }
  .box { border: 1.5px solid #000; padding: 3px 6px; flex: 1; }
  .boxt { font-size: 7pt; font-weight: 700; letter-spacing: .05em; margin-bottom: 2px; }
  .boxr { display: flex; gap: 4px; }
  .bx { border: 1px solid #999; padding: 2px 5px; flex: 1; text-align: center; }
  .bx.all { background: #e8e8e8; }
  .bxk { display: block; font-size: 6pt; letter-spacing: .03em; }
  .bxv { display: block; font-size: 11pt; font-weight: 700; }
  .sig { display: flex; gap: 12px; align-items: flex-end; padding-bottom: 3px; }
  .sig div { font-size: 6.5pt; letter-spacing: .05em; }
  .sig .sl { display: block; width: 110px; border-bottom: 1px solid #000; height: 16px; }
  .note { margin-top: 4px; font-size: 6.5pt; color: #666; }
  .note code { font-size: 6.5pt; }
  @media print { body { background: #fff; } .note { color: #888; } }
</style></head><body>
${pages.map(sheet).join('\n')}
</body></html>`

fs.writeFileSync(outPath, html)
console.log(`${pages.length} листов → ${outPath}`)
for (const p of pages) console.log(`  ${p.room} · ${p.week} · детей ${p.kids.length}`)
