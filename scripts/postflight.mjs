#!/usr/bin/env node
// ============================================================================
// ПОСЛЕПОЛЁТ, половина «витрина» — что реально отдаётся браузеру.
//
// ПОВОД (Николай, 2026-07-28). Пять раз подряд я проверял выкладку руками и
// каждый раз одинаково. Шестой ручной прогон ничего нового не доказал бы, а вот
// первый пропущенный — доказал бы обратное молча. Ручная проверка, повторённая
// пять раз, — это скрипт, который просто ещё не написали.
//
// ЧТО ОН ПРОВЕРЯЕТ И ЧЕГО НЕ МОЖЕТ. Он читает ЖИВОЙ бандл с выкладки, а не
// рабочее дерево: «собралось у меня» и «доехало до людей» — разные утверждения,
// и путал их не кто-нибудь, а я. Он не открывает экранов и не кликает — это
// делает человек. Он отвечает ровно на один вопрос: «то, что мы решили, попало
// в отданный файл?»
//
// ПОЧЕМУ СТРОКОВЫЕ ЛИТЕРАЛЫ, А НЕ ИМЕНА. Vite минифицирует: writeChildField
// станет `Xu`. Имена в бандле искать бессмысленно — они не переживают сборку.
// Строковые литералы переживают: имена RPC, тексты отказов, ключи полей. Ищем
// то, что осталось собой.
//
// ПРОВАЛ ЗАКРЫТЫЙ. Не смогли скачать — это ПРОВАЛ, а не пропуск: «мы не сумели
// посмотреть» никогда не должно читаться как «посмотрели, всё хорошо».
//
// ЗАПУСК:  node scripts/postflight.mjs            (прод)
//          APP_ORIGIN=https://…  node scripts/postflight.mjs   (превью)
// ============================================================================

const APP = process.env.APP_ORIGIN || 'https://menumaker-app.vercel.app'
const PAGES = 'https://pa082508.github.io'

// ── что должно быть в отданном файле ────────────────────────────────────────
// Каждая строка — решение, принятое словом. Если её нет в бандле, решение не
// доехало, чем бы ни клялось рабочее дерево.
const EXPECT = [
  // этап Б — защищённый путь записи
  { lit: 'record_child_field_change', why: 'запись поля ребёнка идёт через защищённый путь, а не напрямую в таблицу' },
  { lit: 'child_field_events',        why: 'журнал полей читается экраном (история и происхождение)' },
  // этап В — замок
  { lit: 'child_field_locks',         why: 'уровни замка (🔒 документ / ⚠ помечено / свободно) доезжают до экрана' },
  // этап А — провод происхождения
  { lit: 'record_origin',             why: 'запись объявляет своё происхождение' },
  // ключ ребёнка — течь, ради которой всё это
  { lit: 'resolve_or_create_child',   why: 'зачисление выдаёт ребёнку ключ, а не оставляет его пустым' },
  { lit: 'find_child_candidates',     why: 'перед созданием сущности показываются кандидаты' },
  // неделя приёмов
  { lit: 'approve_meal_week',         why: 'утверждение недели идёт через серверные ворота, а не мимо них' },
  // права
  { lit: 'set_child_active_state',    why: 'снятие/возврат ребёнка идёт защищённым путём' },
]

// Чего в бандле быть НЕ должно. Отдельный список, потому что «нет плохого» —
// не то же самое, что «есть хорошее», и ловится это разными глазами.
const FORBID = [
  { lit: "method:'typed'",  why: 'печатное имя снова выдаётся за подпись' },
  { lit: 'method: "typed"', why: 'печатное имя снова выдаётся за подпись' },
  { lit: "'manual_entry'",  why: 'источник записи снова подставлен в поле редакции формы' },
]

const ok = (s) => `\x1b[32m✅\x1b[0m ${s}`
const no = (s) => `\x1b[31m❌\x1b[0m ${s}`
const warn = (s) => `\x1b[33m⚠\x1b[0m ${s}`

let failures = 0
const fail = (m) => { failures++; console.log(no(m)) }

async function get(url) {
  const r = await fetch(url, { headers: { 'cache-control': 'no-cache' } })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return await r.text()
}

// ── 1. бандл приложения ─────────────────────────────────────────────────────
async function appBundle() {
  console.log(`\n── бандл приложения — ${APP}`)
  let html
  try { html = await get(APP) } catch (e) { fail(`страница не отдалась: ${e.message} — проверка ПРОВАЛЕНА, не пропущена`); return }

  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map(m => m[1])
  if (!srcs.length) { fail('в index.html нет ни одного скрипта — бандл не найден, проверка ПРОВАЛЕНА'); return }

  let all = ''
  for (const s of srcs) {
    const u = s.startsWith('http') ? s : APP.replace(/\/$/, '') + s
    try { all += await get(u) } catch (e) { fail(`не скачался кусок бандла ${s}: ${e.message}`) }
  }
  // Vite делит бандл; ленивые куски по ссылке из главного файла нужно добрать,
  // иначе «нет строки» будет значить «не в этом куске», а не «не выложено».
  const chunks = [...all.matchAll(/["']\.?\/?(assets\/[A-Za-z0-9_.-]+\.js)["']/g)].map(m => m[1])
  for (const c of [...new Set(chunks)]) {
    try { all += await get(`${APP.replace(/\/$/, '')}/${c}`) } catch { /* необязательный кусок */ }
  }
  console.log(`   собрано ${srcs.length} корневых + ${new Set(chunks).size} ленивых кусков, ${(all.length / 1024 | 0)} КБ`)
  if (all.length < 200_000) { fail(`бандл подозрительно мал (${all.length} байт) — вероятно скачалось не то, ПРОВАЛ`); return }

  for (const { lit, why } of EXPECT) {
    if (all.includes(lit)) console.log(ok(`${lit.padEnd(28)} — ${why}`))
    else fail(`${lit.padEnd(28)} НЕТ в выложенном бандле — ${why}`)
  }
  for (const { lit, why } of FORBID) {
    if (all.includes(lit)) fail(`ВЕРНУЛОСЬ «${lit}» — ${why}`)
    else console.log(ok(`нет «${lit}» — ${why}`))
  }
}

// ── 2. провод происхождения на витрине родителя ─────────────────────────────
// embed.js отдаётся приложением, а сами формы живут на Pages. Провод рвётся
// между ними, значит и проверять его надо между ними, а не в одном месте.
async function embedWire() {
  console.log(`\n── провод происхождения — ${APP}/embed.js`)
  let js
  try { js = await get(`${APP.replace(/\/$/, '')}/embed.js`) }
  catch (e) { fail(`embed.js не отдался: ${e.message} — ПРОВАЛ`); return }

  const checks = [
    [/function\s+declaredVersion\s*\(/, 'редакция формы берётся у самой формы, а не из указателя реестра'],
    [/p_form_version:\s*declaredVersion\(/, 'form_version идёт через declaredVersion()'],
    [/'registry:'/, 'запасной путь ПОМЕЧЕН — читатель отличит замер от догадки'],
    [/p_record_origin:\s*'live'/, 'запись объявляет себя живой'],
  ]
  for (const [re, why] of checks) {
    if (re.test(js)) console.log(ok(why))
    else fail(`${why} — В ВЫЛОЖЕННОМ embed.js ЭТОГО НЕТ`)
  }
  if (/p_form_version:\s*version\b/.test(js)) fail('вернулся голый указатель реестра как form_version')
}

// ── 3. витрина родителя жива и версия кита не откатилась ───────────────────
async function storefront() {
  console.log(`\n── витрина родителя — ${PAGES}`)
  let html
  try { html = await get(`${PAGES}/parent-forms.html?center=zzdemo`) }
  catch (e) { fail(`витрина не отдалась: ${e.message} — ПРОВАЛ`); return }
  console.log(ok(`витрина отвечает (${(html.length / 1024 | 0)} КБ)`))

  const vs = [...html.matchAll(/form-kit\.js\?v=(\d+)/g)].map(m => +m[1])
  if (!vs.length) console.log(warn('на этой странице нет включений form-kit.js — проверять нечего'))
  else if (new Set(vs).size > 1) fail(`включения form-kit.js разъехались по версиям: ${[...new Set(vs)].join(', ')} — правило бюста кита нарушено`)
  else console.log(ok(`form-kit.js?v=${vs[0]} — все ${vs.length} включений на одной версии`))
}

const t0 = Date.now()
await appBundle()
await embedWire()
await storefront()

console.log('\n' + '─'.repeat(70))
if (failures) {
  console.log(no(`ПОСЛЕПОЛЁТ ПРОВАЛЕН — ${failures} прове́рок не прошли. Выложенное НЕ соответствует решённому.`))
  process.exit(1)
}
console.log(ok(`послеполёт пройден за ${((Date.now() - t0) / 1000).toFixed(1)} с — выложенное соответствует решённому.`))
console.log('   Это НЕ сверка Николая: экраны не открывались. Находка закрывается живой сверкой.')
