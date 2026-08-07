// print-attendance-aug10.mjs — печатные бланки Attendance по классам, неделя 10–14.08.2026.
//
// Собран из aug3-генератора 06.08. Отличия ровно два: неделя и ⭐ решение владельца
// 06.08 — число недели стоит В ОДНУ ЛИНИЮ с днём и ТЕМ ЖЕ кеглем (мелкая вторая
// строка читалась как сноска, а это часть даты). Прочий канон не тронут:
// Имя Фамилия · старшие первыми · без DOB честно в конце · Wed/Thu · три пустые
// строки · подписи учителя и директора.
//
// ТОЛЬКО ЧТЕНИЕ. Ни одной записи: читает ростер и комнаты через PostgREST под живой
// сессией директора из ./.demo-profile и рисует PDF. В базу не пишет ничего.
//
// КАНОН ЛИСТА — «Weekly Attendance Report» владельца, форма, прошедшая проверку без
// замечаний; DCY 01208 — РЕФЕРЕНС СООТВЕТСТВИЯ, НЕ ШАБЛОН (docs/DECISIONS.md, строка
// «Канон — Weekly Attendance Report владельца»). Поэтому шапка, сетка Mon–Fri × in/out
// и колонка DOB взяты из экранного бланка (src/pages/reports/AttendanceBlankReport.tsx),
// а не сочинены заново.
//
// ⚠️ ОДНО ОТСТУПЛЕНИЕ ОТ ДЕЙСТВУЮЩЕГО КАНОНА — ПО ПРЯМОМУ ЗАКАЗУ 02.08:
// имя печатается «Имя Фамилия» (экранный бланк печатает «Фамилия Имя» —
// displayChildName, канон CACFP). Названо в отчёте: это заказ, а не случайность.
//
// Сортировка — СТАРШИЕ ПЕРВЫМИ (DOB по возрастанию), как в образце владельца.
// Первый выпуск 02.08 шёл от младших к старшим и был перевыпущен: канон здесь
// сильнее удобства, платит за расхождение с образцом инспекция.

import { chromium } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const WEEK = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14']
const WEEK_LABEL = 'Aug 10 – Aug 14, 2026'
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const BLANK_ROWS = 3
const OUT = process.env.OUT_DIR || path.join(os.homedir(), 'Downloads')
const CENTERS = [
  // Имена файлов приехали копией с aug3-генератора и называли ЧУЖУЮ неделю:
  // лист на 10–14 августа лёг бы в папку под именем Aug3. Бумага, назвавшая не
  // свою неделю, опаснее отсутствующей — её подошьют.
  { slug: 'ridge', file: 'Attendance_Ridge_Aug10.pdf' },
  { slug: 'alpha', file: 'Attendance_Alpha_Aug10.pdf' },
  { slug: 'pearl', file: 'Attendance_Pearl_Aug10.pdf' },
]

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n')
  .filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const URL = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY

// ─── Живая сессия из профиля (тот же приём, что у остальных проб) ────────────
const ctx = await chromium.launchPersistentContext(path.resolve('./.demo-profile'), {
  headless: true, serviceWorkers: 'block',
})
const page = ctx.pages()[0] ?? await ctx.newPage()
await page.goto('https://menumaker-app.vercel.app', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(12000)     // токен обновляется на загрузке; читаем ПОСЛЕ
const token = await page.evaluate(() => {
  const raw = localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('sb-')) ?? '')
  return raw ? JSON.parse(raw).access_token : null
})
if (!token) { console.error('НЕТ сессии в .demo-profile'); process.exit(2) }

async function get(table, query) {
  const r = await fetch(`${URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Accept-Profile': 'menumaker' },
  })
  if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`)
  return r.json()
}

// ─── Чтение ──────────────────────────────────────────────────────────────────
const centers = await get('centers', `select=id,name,slug&slug=in.(ridge,alpha,pearl)`)
const ids = centers.map(c => c.id)
const classrooms = await get('classrooms',
  `select=id,name,center_id,sort_order,is_active,is_roster&center_id=in.(${ids.join(',')})&is_active=eq.true&order=sort_order`)
const roster = await get('roster',
  `select=id,child_name,first_name,last_name,birthday,classroom_id,center_id,is_active,date_in,date_out` +
  `&center_id=in.(${ids.join(',')})&is_active=eq.true&limit=2000`)

// ─── Правила отбора ──────────────────────────────────────────────────────────
// Комната идёт на бланк, если активна и НЕ псевдокласс персонала. Признак —
// is_roster=false (тот же, которым персонал исключён из сетки счёта); имя «Staff»
// проверяется вторым слоем, потому что признак когда-то могли не проставить.
const isStaffRoom = (cl) => cl.is_roster === false || /staff/i.test(cl.name)
const inWeek = (r) => (!r.date_in || r.date_in <= WEEK[4]) && (!r.date_out || r.date_out >= WEEK[0])

// Имя «Имя Фамилия» — заказ 02.08. Если полей нет, печатаем то, что в child_name,
// КАК ЕСТЬ (оно хранится «Фамилия Имя»): переставлять слова догадкой на бумаге,
// которую подпишет учитель, нельзя — фамилия из двух слов молча превратится в чужое имя.
const nameOf = (k) => (k.first_name && k.last_name)
  ? `${k.first_name} ${k.last_name}`.replace(/\s+/g, ' ').trim()
  : (k.child_name ?? '')
const needsNameCheck = (k) => !(k.first_name && k.last_name)
const usDate = (iso) => iso ? (([y, m, d]) => `${m}/${d}/${y}`)(iso.slice(0, 10).split('-')) : ''
// Дата печати — МЕСТНАЯ. `toISOString()` в вечерней печати ставит завтрашний день
// (UTC уже наступил), и лист уходит в папку с датой, которой ещё не было. Ровно этим
// предостережением открыт экранный бланк (AttendanceBlankReport.todayLocal).
const todayLocal = () => {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}
// СТАРШИЕ ПЕРВЫМИ — DOB по возрастанию, как в образце владельца (правка 02.08).
// Это же и действующий канон: platform-standards §2a, `byAgeOldestFirst`
// (src/lib/childName.ts) — печатная реплика следует образцу, а не алфавиту.
// Без даты рождения — в конец: возраст неизвестен, и ставить такого ребёнка в
// середину значило бы выдумать ему возраст. Равные даты разводим по имени, чтобы
// повторная печать давала тот же лист, а не случайный порядок.
const byAgeOldestFirst = (a, b) => {
  if (!a.birthday && !b.birthday) return nameOf(a).localeCompare(nameOf(b))
  if (!a.birthday) return 1
  if (!b.birthday) return -1
  return a.birthday.localeCompare(b.birthday) || nameOf(a).localeCompare(nameOf(b))
}
const esc = (s) => String(s ?? '').replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]))

// ─── Лист одного класса ──────────────────────────────────────────────────────
function sheet(center, room, kids, no, of) {
  const head = DAYS.map((d, i) => {
    const [, m, dd] = WEEK[i].split('-')
    // ⭐ 06.08: день и число — одной строкой, одним кеглем.
    return `<th colspan="2" class="day">${d} ${Number(m)}/${Number(dd)}</th>`
  }).join('')
  const io = DAYS.map(() => `<th class="io">in</th><th class="io">out</th>`).join('')
  const cells = DAYS.map(() => `<td class="io"></td><td class="io"></td>`).join('')
  const rows = kids.map((k, i) => `<tr>
      <td class="num">${i + 1}</td>
      <td class="nm">${esc(nameOf(k))}</td>
      <td class="dob">${esc(usDate(k.birthday))}</td>${cells}</tr>`).join('')
  // Три пустые строки — для детей, пришедших среди недели: их вписывают от руки,
  // как это делается на бумаге сейчас.
  const blanks = Array.from({ length: BLANK_ROWS }, (_, i) => `<tr class="blank">
      <td class="num">${kids.length + i + 1}</td><td class="nm"></td><td class="dob"></td>${cells}</tr>`).join('')

  return `<section class="sheet">
    <h1>Weekly Attendance Report</h1>
    <div class="sub">${esc(center.name)} · ${esc(room.name)} · ${WEEK_LABEL} · Sheet ${no} of ${of}</div>
    <div class="meta">
      <div class="f"><span class="lbl">Teacher(s):</span></div>
      <div class="f"><span class="lbl">Room:</span> ${esc(room.name)}</div>
    </div>
    <table>
      <thead>
        <tr><th rowspan="2" class="num">#</th><th rowspan="2" class="nm">Child's Name</th>
            <th rowspan="2" class="dob">DOB</th>${head}</tr>
        <tr>${io}</tr>
      </thead>
      <tbody>${rows}${blanks}</tbody>
    </table>
    <div class="sig">
      <div class="s"><div class="line"></div>Teacher signature / date</div>
      <div class="s"><div class="line"></div>Director signature / date</div>
    </div>
    <div class="foot">
      <span>${esc(center.name)} · ${esc(room.name)} · ${kids.length} children on the roster as of ${usDate(WEEK[0])}
        · ${BLANK_ROWS} blank lines for mid-week additions</span>
      <span>Printed ${usDate(todayLocal())}</span>
    </div>
  </section>`
}

// ─── Честная страница «не попали ни на один бланк» ───────────────────────────
// Канон «дети без комнаты — ВИДИМАЯ ОЧЕРЕДЬ, а не пустое место» (DECISIONS) для
// бумаги значит ровно это: ребёнок, которого не видно ни на одном классном листе,
// обязан быть НАЗВАН, и рядом с ним обязана стоять причина. Пустое место в тираже
// молча теряет человека — и заметится это, когда его будут искать.
// На листе классов такому ребёнку места нет физически: лист — это комната.
// Взрослые из псевдокласса Staff сюда НЕ попадают: они не дети, и их место —
// в числах доклада, а не в списке детей.
function offSheetPage(center, kids) {
  const rows = kids.map((k, i) => `<tr>
      <td class="num">${i + 1}</td>
      <td class="nm">${esc(nameOf(k))}</td>
      <td class="dob">${esc(usDate(k.birthday))}</td>
      <td class="why">${esc(k.__why)}</td></tr>`).join('')
  return `<section class="sheet">
    <h1>Weekly Attendance Report — children not on a classroom sheet</h1>
    <div class="sub">${esc(center.name)} · ${WEEK_LABEL}</div>
    <div class="note">These children are on this center's roster but appear on no classroom sheet for
      this week. The reason is printed beside each name. This page is for the office — it is not an
      attendance sheet and has no in/out grid.</div>
    <table>
      <thead><tr><th class="num">#</th><th class="nm">Child's Name</th>
        <th class="dob">DOB</th><th class="why">Why not on a sheet</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="foot">
      <span>${esc(center.name)} · ${kids.length} ${kids.length === 1 ? 'child' : 'children'} off the sheets as of ${usDate(WEEK[0])}</span>
      <span>Printed ${usDate(todayLocal())}</span>
    </div>
  </section>`
}

// Причина словами. Причин может быть НЕСКОЛЬКО сразу, и называются все: у ребёнка
// без комнаты, чьё зачисление начинается позже недели, комнату искать сегодня
// незачем — но узнать это можно, только если сказаны обе строки.
const whyOffSheet = (k) => {
  const why = []
  if (!k.classroom_id) why.push('no classroom assigned')
  if (k.date_in && k.date_in > WEEK[4]) why.push(`enrollment starts ${usDate(k.date_in)}`)
  if (k.date_out && k.date_out < WEEK[0]) why.push(`left ${usDate(k.date_out)}`)
  if (!why.length) why.push('classroom is not printed this week (inactive room)')
  return why.join(' · ')
}

const CSS = `
@page { size: letter landscape; margin: 9mm }
body { font-family: Arial, Helvetica, sans-serif; color:#000; margin:0 }
.sheet { page-break-after: always; }
.sheet:last-child { page-break-after: auto; }
h1 { font-size:16px; margin:0 0 2px; text-align:center; letter-spacing:.02em }
.sub { text-align:center; font-size:11px; margin-bottom:8px }
.meta { display:flex; gap:26px; font-size:12px; margin:0 0 8px }
.meta .f { flex:1; border-bottom:1px solid #000; padding-bottom:1px }
.meta .lbl { font-weight:bold }
table { border-collapse:collapse; width:100%; font-size:11px; table-layout:fixed }
th, td { border:1px solid #000; padding:0 3px; height:21px }
th { background:#f2f2f2; font-size:10.5px; text-align:center }
th.day { font-size:11px }
th.io, td.io { width:32px; text-align:center }
.num { width:22px; text-align:center }
.nm { width:165px; text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.dob { width:66px; text-align:center }
tr.blank td { background:#fcfcfc }
.sig { display:flex; gap:40px; margin-top:14px; font-size:10px }
.sig .s { flex:1 }
.sig .line { border-bottom:1px solid #000; height:20px; margin-bottom:2px }
.foot { margin-top:6px; font-size:8.5px; color:#444; display:flex; justify-content:space-between; gap:20px }
.why { width:auto; text-align:left; padding-left:6px }
.note { font-size:10.5px; margin:0 0 8px; }
`

// ─── Сборка ──────────────────────────────────────────────────────────────────
const report = []
for (const { slug, file } of CENTERS) {
  const center = centers.find(c => c.slug === slug)
  const rooms = classrooms.filter(cl => cl.center_id === center.id && !isStaffRoom(cl))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
  const mine = roster.filter(r => r.center_id === center.id)
  const pages = rooms.map((room, i) => {
    const kids = mine.filter(r => r.classroom_id === room.id && inWeek(r)).sort(byAgeOldestFirst)
    return { room, kids, html: sheet(center, room, kids, i + 1, rooms.length) }
  })
  // Дети центра, которых нет ни на одном классном листе. Псевдокласс персонала
  // исключён нарочно — это взрослые, они живут в числах доклада.
  const onSheetIds = new Set(pages.flatMap(p => p.kids).map(k => k.id))
  const offSheet = mine
    .filter(r => !onSheetIds.has(r.id))
    .filter(r => { const cl = classrooms.find(c => c.id === r.classroom_id); return !(cl && isStaffRoom(cl)) })
    .map(r => ({ ...r, __why: whyOffSheet(r) }))
    .sort(byAgeOldestFirst)
  const offHtml = offSheet.length ? offSheetPage(center, offSheet) : ''

  const html = `<!doctype html><html><head><meta charset="utf-8">
    <title>Attendance ${esc(center.name)} ${WEEK_LABEL}</title><style>${CSS}</style></head>
    <body>${pages.map(p => p.html).join('\n')}${offHtml}</body></html>`

  const tmp = path.join(os.tmpdir(), `att_${slug}.html`)
  fs.writeFileSync(tmp, html)
  const p = await ctx.newPage()
  await p.goto('file://' + tmp, { waitUntil: 'load' })
  const out = path.join(OUT, file)
  await p.pdf({ path: out, format: 'Letter', landscape: true, printBackground: true,
                margin: { top: '9mm', bottom: '9mm', left: '9mm', right: '9mm' } })
  await p.close()

  const onSheets = pages.reduce((s, p) => s + p.kids.length, 0)
  const centerActive = mine.length
  const staffRows = mine.filter(r => {
    const cl = classrooms.find(c => c.id === r.classroom_id)
    return cl && isStaffRoom(cl)
  }).length
  const noRoom = mine.filter(r => !r.classroom_id).length
  const noSplit = pages.flatMap(p => p.kids).filter(needsNameCheck)
  const noDob = pages.flatMap(p => p.kids).filter(k => !k.birthday)
  const firstPage = pages.find(p => p.kids.length)
  report.push({
    file: out, pages: pages.length, onSheets, centerActive, staffRows, noRoom,
    firstRoom: firstPage?.room.name ?? '—',
    firstKid: firstPage ? `${nameOf(firstPage.kids[0])} · DOB ${usDate(firstPage.kids[0].birthday)}` : '—',
    lastKid: firstPage ? `${nameOf(firstPage.kids.at(-1))} · DOB ${usDate(firstPage.kids.at(-1).birthday)}` : '—',
    empty: pages.filter(p => !p.kids.length).map(p => p.room.name),
    noSplit: noSplit.length, noDob: noDob.length,
    noSplitNames: noSplit.map(k => nameOf(k)),
    // Дырки называются ПОИМЁННО: число «1 без комнаты» ищут глазами по всему
    // ростеру, имя — не ищут.
    offSheet: offSheet.map(k => `${nameOf(k)}${k.birthday ? ` · DOB ${usDate(k.birthday)}` : ' · DOB —'} → ${k.__why}`),
    noDobNames: noDob.map(k => `${nameOf(k)} (${classrooms.find(c => c.id === k.classroom_id)?.name ?? '—'})`),
    balance: centerActive - staffRows - offSheet.length - onSheets,
  })
}
await ctx.close()

console.log('\n──────── ЧИСЛА ────────')
for (const r of report) {
  console.log(`\n${path.basename(r.file)}  → ${r.file}`)
  console.log(`  страниц (классов без Staff): ${r.pages}${r.empty.length ? `, из них пустых: ${r.empty.length} (${r.empty.join(', ')})` : ''}`)
  console.log(`  детей на бланках: ${r.onSheets}`)
  console.log(`  первая страница «${r.firstRoom}»: сверху ${r.firstKid} → снизу ${r.lastKid}`)
  console.log(`  активный ростер центра: ${r.centerActive} = ${r.onSheets} на бланках + ${r.staffRows} в классе персонала + ${r.offSheet.length} не на бланках` +
              `${r.balance ? `  ⚠ НЕ СХОДИТСЯ на ${r.balance}` : '  ✓ сходится'}`)
  if (r.noSplit) console.log(`  ⚠ без раздельных имени/фамилии: ${r.noSplit} — напечатано как хранится («Фамилия Имя»): ${r.noSplitNames.join(' · ')}`)
  if (r.noDob) console.log(`  ⚠ без даты рождения: ${r.noDob} — в конце списка, DOB пуст: ${r.noDobNames.join(' · ')}`)
  if (r.offSheet.length) {
    console.log(`  ⚠ НЕ НА БЛАНКАХ — ${r.offSheet.length}, названы отдельной страницей в конце PDF:`)
    for (const line of r.offSheet) console.log(`      ${line}`)
  }
}
