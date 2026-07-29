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
  // Здесь стояла строка find_child_candidates — и давала КРАСНЫЙ, которого нет.
  // Замер 29.07: этой строки нет и не должно быть ни в одном файле приложения.
  // Кандидатов ищет сама resolve_or_create_child на сервере и возвращает их
  // вопросом; клиенту вызывать их отдельно незачем. Проверка требовала ВХОД
  // (имя функции в бандле) вместо ОТВЕТА (доходит ли вопрос до человека) — это
  // зеркало ложного зелёного: красный от механизма, который никто не заказывал.
  // Проверка ответа — ниже, и она же ловит глотание ошибки.
  { lit: 'could not be given an identity key',
    why: 'оба пути зачисления ОТКАЗЫВАЮТ словами вместо строки без ключа' },
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
//
// БЫЛО ОТСТУПЛЕНИЕ. Прежняя редакция читала parent-forms.html и, не найдя там
// включений кита, писала «проверять нечего» — жёлтым, то есть в отчёте зелёным.
// А витрина — СПИСОК ссылок: включений в ней нет и не будет, значит проверка не
// проверяла НИЧЕГО и не могла покраснеть никогда.
//
// Канон 29.07: проверка не отступает — она идёт туда, где ответ есть. Реестр
// говорит, какая редакция каждой формы сейчас боевая; по ней и смотрим.
const KIT_FLOOR = 13   // держать в согласии с src/lib/kitVersionFloor.test.ts

async function storefront() {
  console.log(`\n── витрина родителя — ${PAGES}`)
  let html
  try { html = await get(`${PAGES}/parent-forms.html?center=zzdemo`) }
  catch (e) { fail(`витрина не отдалась: ${e.message} — ПРОВАЛ`); return }
  console.log(ok(`витрина отвечает (${(html.length / 1024 | 0)} КБ)`))

  let reg
  try { reg = JSON.parse(await get(`${PAGES}/enroll-registry.json`)) }
  catch (e) { fail(`реестр форм не прочитан: ${e.message} — ПРОВАЛ`); return }

  // ПРИЗНАК УТОЧНЁН ЗАМЕРОМ (29.07), а не ослаблен: первая редакция покраснела на
  // wic_information и what_to_bring_infant. Замер реестра: у обоих `signer: null` —
  // это КАРТОЧКИ ДЛЯ ЧТЕНИЯ, их никто не подписывает, и кит им не нужен. Кит
  // запускается там, где ставят подпись, значит и спрашиваем его там.
  const forms = reg.forms ?? reg
  const html2 = Object.entries(forms)
    .filter(([, v]) => v && typeof v === 'object' && v.current && v.versions)
    .map(([k, v]) => [k, v, v.versions[v.current]])
    .filter(([, , u]) => typeof u === 'string' && u.endsWith('.html'))
  // …и ПРИЗНАК УТОЧНЁН ВТОРОЙ РАЗ, снова замером. Первое уточнение («проверяем
  // только там, где есть signer») вывело из проверки ПЯТЬ форм, а замер показал:
  // у трёх из них — dcy_01218, child_release_authorization, transition_into_program —
  // кит на месте (v13), и signer в реестре просто НЕ ЗАПОЛНЕН. Пустое поле реестра
  // стало бы правом не проверять живую подписную форму.
  //
  // Поэтому смотрим ВСЕ html-редакции, а прощаем отсутствие кита только там, где
  // его и не должно быть: карточка для чтения, которую никто не подписывает.
  const live = html2.map(([k, , u]) => [k, u])
  const mayLackKit = new Set(html2.filter(([, v]) => !v.signer).map(([k]) => k))
  if (!live.length) { fail('в реестре НЕТ ни одной боевой html-редакции — проверять нечего, и это провал, а не пропуск'); return }

  const seen = new Map()
  const noKit = []
  for (const [key, url] of live) {
    let page
    try { page = await get(url) }
    catch (e) { fail(`${key}: боевая редакция не отдалась (${e.message})`); continue }
    const vs = [...new Set([...page.matchAll(/form-kit\.js\?v=(\d+)/g)].map(m => +m[1]))]
    if (!vs.length) {
      if (mayLackKit.has(key)) { noKit.push(key); continue }
      fail(`${key}: в боевой редакции НЕТ включения form-kit.js — форма без кита`); continue
    }
    if (vs.length > 1) { fail(`${key}: включения разъехались по версиям ${vs.join(', ')}`); continue }
    if (vs[0] < KIT_FLOOR) { fail(`${key}: кит v${vs[0]} ниже пола v${KIT_FLOOR}`); continue }
    seen.set(key, vs[0])
  }
  // Пропущенное НАЗЫВАЕТСЯ вслух: молчаливое сужение охвата читается как «всё проверено».
  if (noKit.length) console.log(`   без кита и правильно (карточки для чтения, ${noKit.length}): ${noKit.join(', ')}`)
  const versions = [...new Set(seen.values())]
  if (seen.size + noKit.length === live.length && versions.length === 1) {
    console.log(ok(`все ${seen.size} боевых редакций на form-kit.js?v=${versions[0]} (пол v${KIT_FLOOR})`))
  } else if (versions.length > 1) {
    fail(`боевые редакции на разных версиях кита: ${versions.join(', ')}`)
  }
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
