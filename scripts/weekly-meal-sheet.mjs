// scripts/weekly-meal-sheet.mjs
// CHILDREN'S MEAL COUNT BY INDIVIDUAL NAME — печатный недельный лист.
//
// ⚠️ ПЕРЕПИСАН 31.07 ПО ПРАВИЛАМ ВЛАДЕЛЬЦА. Прежняя версия была собрана БЕЗ
// прохода по канонам и нарушила четыре правила, лежавшие в репозитории (часть —
// нашими же коммитами): показ имени, ось сортировки, кружок исключённого приёма,
// свои тексты на официальном бланке. Правила листа — spec §15
// (docs/specs/2026-07-29-weekly-meal-count-sheet.md), процессное правило —
// platform-standards «ПЕРЕД ГЕНЕРАЦИЕЙ ЛЮБОЙ ФОРМЫ — ПРОХОД ПО КАНОНАМ».
//
// ПРИМЕНЁННЫЕ ПРАВИЛА (печатаются и в отчёт запуска):
//   §1  показ «Фамилия Имя», собран из first/last ростера по roster_id
//   §2a возрастные полосы, старшие первыми; внутри полосы — по фамилии
//   spec §8 п.7  правило кружка: показано ВСЁ поданное, исключённое обведено
//   spec §8 п.9  счёт по правилу возмещения — одна логика с клеймом
//   «рабочие данные из окон»  на бланке нет ни одного нашего текста
//
// ЧТО ЛЕЖИТ ГДЕ:
//   официальный лист  — только бланк. Ни подвала, ни пояснений, ни пометок.
//   служебный лист    — --service <out.html>: сироты имени, спорные строки,
//                       строка применённых правил. Помечен как НЕ официальный.
//
// ⚠️ УСЛОВИЕ ИСТОЧНИКА. Лист несёт ЭКРАННУЮ ПРАВДУ — то, что видит и подписывает
// директор. После перевода экрана на союз (ростер ∪ строки недели по roster_id)
// это и есть строки недели (spec §A5); до перевода два множества расходятся —
// поэтому лист выпускается ПОСЛЕ починки ключа, а не раньше.
//
// Вход:  JSON [{ room, week, holidays?, kids: [
//          { rid, first, last, name?, band, m } ] }]
//        rid  — roster_id (идентичность строки)
//        first/last — части имени ИЗ РОСТЕРА; name — хранимый child_name,
//                     только подпись: в лист идёт лишь когда частей нет вовсе,
//                     и такая строка попадает в служебный лист
//        band — возрастная полоса (age_group_food): birth_5m | 6_11m | 1y | 2y |
//               3_5y | 6_12y (принимаются и экранные написания infant_0_5m и т.п.)
//        m    — 30 символов 0/1, day-major: пн..пт × (B, AM, L, PM, S, ES)
//        hot  — необязательно: строка под вопросом → ТОЛЬКО в служебный лист
//
//   node scripts/weekly-meal-sheet.mjs <data.json> <out.html> [--service <svc.html>]

import fs from 'node:fs'

const [, , dataPath, outPath, ...rest] = process.argv
if (!dataPath || !outPath) {
  console.error('usage: node scripts/weekly-meal-sheet.mjs <data.json> <out.html> [--service <svc.html>]')
  process.exit(1)
}
const svcPath = rest.includes('--service') ? rest[rest.indexOf('--service') + 1] : null

const APPLIED_RULES = [
  'platform-standards §1 — показ «Фамилия Имя» из частей ростера по roster_id',
  'platform-standards §2a — возрастные полосы, старшие первыми; внутри полосы по фамилии',
  'spec meal count §8 п.7 — правило кружка: показано всё поданное, исключённое обведено',
  'spec meal count §8 п.9 — счёт по правилу возмещения, одна логика с клеймом',
  'platform-standards «рабочие данные из окон» — на бланке нет наших текстов',
]

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

// ─── Возрастные полосы (§2a: старшие первыми) ────────────────────────────────
// Два словаря живут одновременно: age_group_food в базе (birth_5m…) и экранные
// ключи MealCountPage (infant_0_5m…). Принимаем оба, порядок один.
const BAND_ORDER = ['6_12y', '3_5y', '2y', '1y', '6_11m', 'birth_5m']
const BAND_ALIAS = {
  infant_0_5m: 'birth_5m', birth_5m: 'birth_5m', '0_5m': 'birth_5m',
  infant_6_11m: '6_11m', '6_11m': '6_11m',
  '1y': '1y', '2y': '2y',
  '3_5': '3_5y', '3_5y': '3_5y',
  '6_12': '6_12y', '6_12y': '6_12y',
}
const BAND_LABEL = {
  birth_5m: '0-5m', '6_11m': '6-11m', '1y': '1yr', '2y': '2yr', '3_5y': '3-5y', '6_12y': '6-12y',
}
const bandKey = b => BAND_ALIAS[String(b ?? '').trim()] ?? null
const bandRank = b => { const i = BAND_ORDER.indexOf(bandKey(b)); return i < 0 ? BAND_ORDER.length : i }

// ─── Показ имени (§1) ────────────────────────────────────────────────────────
// «Фамилия Имя», собранное из частей ростера. Хранимый child_name — подпись, а
// не источник: он и есть носитель смеси порядков (519 «Фамилия Имя» против 96
// «Имя Фамилия»), из-за которой лист и экран разошлись у 12 детей из 14.
const displayName = k => {
  const last = String(k.last ?? '').trim(), first = String(k.first ?? '').trim()
  if (last || first) return [last, first].filter(Boolean).join(' ')
  return String(k.name ?? '').trim()          // сирота имени — уйдёт в служебный лист
}
const nameFromRoster = k => Boolean(String(k.last ?? '').trim() || String(k.first ?? '').trim())
const sortLast = k => (String(k.last ?? '').trim() || displayName(k)).toLowerCase()

// ─── Правило возмещения (spec §8 п.9) ────────────────────────────────────────
// Одна логика с клеймом. Экран: reimbursableSlots (MealCountPage.tsx:141) —
// максимум 2 приёма + 1 снек, приоритет supper > lunch > am > breakfast.
// Клейм: compute_monthly_claim (20260730b) — bre*(1−b*l*s), pm*(1−am),
// es*(1−am)*(1−pm). Для приёмов бланка это ОДНО И ТО ЖЕ правило:
//   завтрак исключается, когда в тот же день есть И ланч, И ужин;
//   PM-снек — когда есть AM; вечерний — когда есть AM или PM.
// Кружок ничего не удаляет: он показывает решение о возмещении. Выбор
// исключаемого приёма по тексту бланка принадлежит администрации центра
// (§8 п.8) — расхождение правится человеком на бумаге.
const IDX = { B: 0, AM: 1, L: 2, PM: 3, S: 4, ES: 5 }
function excludedOn(m, day) {
  const on = s => m[day * 6 + IDX[s]] === '1'
  const ex = new Set()
  if (on('B') && on('L') && on('S')) ex.add(IDX.B)
  if (on('PM') && on('AM')) ex.add(IDX.PM)
  if (on('ES') && (on('AM') || on('PM'))) ex.add(IDX.ES)
  return ex
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]))
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d }
const md = d => `${d.getMonth() + 1}/${d.getDate()}`
const mark = (m, day, slot) => m[day * 6 + slot] === '1'

function sheet(page) {
  const monday = new Date(page.week + 'T12:00:00')
  const friday = addDays(page.week, 4)
  const dates  = [0, 1, 2, 3, 4].map(i => md(addDays(page.week, i)))

  // Неделя может лежать на стыке месяцев — в шапке MO/YR стоит месяц ПОНЕДЕЛЬНИКА,
  // а полный диапазон печатается в WEEK OF, чтобы лист сам нёс свои даты (§11).
  const moLabel = MONTHS[monday.getMonth()]
  const yrLabel = monday.getFullYear()
  const weekOf  = `${md(monday)}/${String(monday.getFullYear()).slice(2)} – ${md(friday)}/${String(friday.getFullYear()).slice(2)}`

  // §2a: возрастные полосы, старшие первыми; внутри полосы — по фамилии.
  // Полоса неизвестна → в конец (то же правило, что «нет birthday» на экране).
  const kids = page.kids.slice().sort((a, b) =>
    bandRank(a.band) - bandRank(b.band) ||
    sortLast(a).localeCompare(sortLast(b), 'en') ||
    displayName(a).localeCompare(displayName(b), 'en'))

  // Праздники приходят из menumaker.holidays по центру — НЕ зашиты в код.
  // Канон A7: праздничный день сохраняет свою колонку и ПОДПИСЫВАЕТСЯ.
  const hol = page.holidays ?? {}
  const isoOf = i => { const d = addDays(page.week, i); return d.toISOString().slice(0, 10) }
  const holOn = i => hol[isoOf(i)] ?? null

  // Итоги: всё поданное и к клейму — как на экране (claimable/total).
  const daily = DAYS.map((_, d) => SLOTS.map((_, s) => kids.filter(k => mark(k.m, d, s)).length))
  const dayAll = DAYS.map((_, d) => daily[d].reduce((a, b) => a + b, 0))
  const dayClaim = DAYS.map((_, d) => kids.reduce((n, k) => {
    const ex = excludedOn(k.m, d)
    return n + SLOTS.reduce((c, _, s) => c + (mark(k.m, d, s) && !ex.has(s) ? 1 : 0), 0)
  }, 0))
  const weekBySlot = SLOTS.map((_, s) => daily.reduce((n, day) => n + day[s], 0))
  const weekAll   = dayAll.reduce((a, b) => a + b, 0)
  const weekClaim = dayClaim.reduce((a, b) => a + b, 0)

  const dayHeads = DAYS.map((d, i) => {
    const h = holOn(i)
    return `<th colspan="6" class="dh${i ? ' sep' : ''}${h ? ' hol' : ''}">${d}` +
           `<span class="dt">${dates[i]}${h ? ` · ${esc(h)}` : ''}</span></th>`
  }).join('')
  const slotHeads = DAYS.map((_, i) =>
    SLOTS.map((s, j) => `<th class="sh${!j && i ? ' sep' : ''}${holOn(i) ? ' hol' : ''}">${s.k}</th>`).join('')).join('')

  const bodyRows = kids.map((k, i) => {
    const cells = DAYS.map((_, d) => {
      const ex = excludedOn(k.m, d)
      return SLOTS.map((_, s) => {
        const on = mark(k.m, d, s)
        const glyph = on ? (ex.has(s) ? '<span class="ex">×</span>' : '×') : ''
        return `<td class="c${!s && d ? ' sep' : ''}${holOn(d) ? ' hol' : ''}">${glyph}</td>`
      }).join('')
    }).join('')
    return `<tr>
      <td class="num">${i + 1}</td>
      <td class="nm">${esc(displayName(k))}</td>
      <td class="ag">${esc(BAND_LABEL[bandKey(k.band)] ?? '')}</td>${cells}</tr>`
  }).join('\n')

  const totalRow = DAYS.map((_, d) =>
    SLOTS.map((_, s) => `<td class="tc${!s && d ? ' sep' : ''}${holOn(d) ? ' hol' : ''}">${daily[d][s] || ''}</td>`).join('')).join('')
  // Вторая строка итогов — ровно то, что показывает экран директору: к клейму / всего.
  const claimRow = DAYS.map((_, d) =>
    `<td colspan="6" class="cc${d ? ' sep' : ''}${holOn(d) ? ' hol' : ''}">${
      dayAll[d] ? `<b>${dayClaim[d]}</b>/${dayAll[d]}` : ''}</td>`).join('')

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
      <tr class="clm"><td colspan="3" class="tl">REIMBURSABLE / TOTAL</td>${claimRow}</tr>
    </tfoot>
  </table>

  <div class="foot">
    <div class="box">
      <div class="boxt">MEAL COUNT TOTALS FOR PAGE (WEEK)</div>
      <div class="boxr">${pageBox}<div class="bx all"><span class="bxk">TOTAL</span><span class="bxv">${weekAll}</span></div><div class="bx all"><span class="bxk">REIMBURSABLE</span><span class="bxv">${weekClaim}</span></div></div>
    </div>
    <div class="sig">
      <div><span class="sl"></span>COOK</div>
      <div><span class="sl"></span>DIRECTOR</div>
    </div>
  </div>
</section>`
}

// ─── Служебный лист — ОТДЕЛЬНЫЙ ФАЙЛ, явно не официальный ────────────────────
// Всё, что раньше стояло подвалом на бланке, живёт здесь: тексты формы вместе с
// её названием имеют юридическую силу, и наш комментарий внутри рамки превращает
// реплику в самодельный документ.
function serviceSheet(pages) {
  const rows = []
  for (const p of pages) {
    for (const k of p.kids) {
      const orphan = !nameFromRoster(k)
      if (!orphan && !k.hot) continue
      rows.push(`<tr><td>${esc(p.room)}</td><td>${esc(p.week)}</td><td>${esc(displayName(k))}</td>
        <td>${esc(k.rid ?? '')}</td><td>${orphan ? 'имя не собрано из ростера — напечатан хранимый child_name' : ''}${
          orphan && k.hot ? ' · ' : ''}${k.hot ? 'строка под вопросом (задвоение)' : ''}</td></tr>`)
    }
  }
  const pageList = pages.map(p => `<li>${esc(p.room)} · ${esc(p.week)} · строк: ${p.kids.length}</li>`).join('')
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>Служебный лист — не официальный документ</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; margin: 24px; color: #111; }
  .warn { border: 2px solid #b91c1c; color: #b91c1c; font-weight: 700; padding: 8px 12px;
          margin-bottom: 14px; letter-spacing: .02em; }
  h2 { font-size: 13pt; margin: 18px 0 6px; }
  table { border-collapse: collapse; font-size: 9pt; }
  td, th { border: 1px solid #999; padding: 3px 7px; text-align: left; }
  ul, ol { font-size: 9pt; } li { margin-bottom: 2px; }
  code { font-size: 9pt; }
</style></head><body>
  <div class="warn">СЛУЖЕБНЫЙ ЛИСТ — НЕ ОФИЦИАЛЬНЫЙ ДОКУМЕНТ. Не подшивается, не подписывается,
  в пакет клейма не идёт.</div>

  <h2>ПРИМЕНЁННЫЕ ПРАВИЛА</h2>
  <ol>${APPLIED_RULES.map(r => `<li>${esc(r)}</li>`).join('')}</ol>

  <h2>Источник шаблона</h2>
  <p><code>template source: CHILDREN'S MEAL COUNT BY INDIVIDUAL NAME — реплика бланка центра,
  spec docs/specs/2026-07-29-weekly-meal-count-sheet.md §8–§9, §15</code></p>

  <h2>Листы в выпуске</h2>
  <ul>${pageList}</ul>

  <h2>Строки, требующие взгляда${rows.length ? '' : ' — нет'}</h2>
  ${rows.length ? `<table><tr><th>Комната</th><th>Неделя</th><th>Имя в листе</th><th>roster_id</th><th>Что с ней</th></tr>
  ${rows.join('\n')}</table>` : '<p>Все имена собраны из ростера, спорных строк нет.</p>'}
</body></html>`
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
  table.grid .nm  { width: 132px; text-align: left; padding-left: 4px; font-size: 8pt; white-space: nowrap;
                    overflow: hidden; text-overflow: ellipsis; }
  /* Праздник: колонка сохраняется и подписывается — никогда не исчезает (канон A7). */
  table.grid th.hol { background: #ddd; }
  table.grid td.hol { background: repeating-linear-gradient(45deg,#f2f2f2,#f2f2f2 3px,#e6e6e6 3px,#e6e6e6 6px) !important; }
  table.grid .ag  { width: 34px; font-size: 6.5pt; }
  table.grid td.c { height: 13px; font-size: 9pt; font-weight: 700; }
  table.grid .sep { border-left: 2px solid #000; }
  table.grid tbody tr:nth-child(even) td { background: #fbfbfb; }

  /* ПРАВИЛО КРУЖКА (§8 п.7): отметка остаётся, исключённое ОБВОДИТСЯ. */
  table.grid td.c .ex { display: inline-block; width: 11px; height: 11px; line-height: 10px;
                        border: 1.2px solid #000; border-radius: 50%; font-size: 7.5pt; }

  table.grid tfoot .tot td { background: #e8e8e8; font-weight: 700; font-size: 7.5pt; height: 15px; }
  table.grid tfoot .clm td { background: #f4f4f4; font-weight: 400; font-size: 7.5pt; height: 15px; }
  table.grid tfoot .clm b { font-size: 8.5pt; }
  table.grid tfoot .tl { text-align: right; padding-right: 6px; letter-spacing: .03em; font-weight: 700; }

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
  @media print { body { background: #fff; } }
</style></head><body>
${pages.map(sheet).join('\n')}
</body></html>`

fs.writeFileSync(outPath, html)
if (svcPath) fs.writeFileSync(svcPath, serviceSheet(pages))

// Отчёт запуска несёт строку применённых правил — без неё форма не принимается
// (platform-standards, рядом с «Ready-made forms first»).
console.log(`${pages.length} листов → ${outPath}`)
for (const p of pages) {
  const orphans = p.kids.filter(k => !nameFromRoster(k)).length
  console.log(`  ${p.room} · ${p.week} · детей ${p.kids.length}${orphans ? ` · имя не из ростера: ${orphans}` : ''}`)
}
console.log(`template source: CHILDREN'S MEAL COUNT BY INDIVIDUAL NAME — реплика бланка центра (spec §8–§9)`)
console.log('ПРИМЕНЁННЫЕ ПРАВИЛА:')
for (const r of APPLIED_RULES) console.log(`  · ${r}`)
console.log(svcPath ? `служебный лист → ${svcPath}` : 'служебный лист не запрошен (--service <файл>)')
