// src/lib/appUpdate.ts
// MenuMaker · Принудительное обновление клиента (план 31.07d §7.2, работа 2).
//
// ЗАЧЕМ ЭТО ЕСТЬ
// ──────────────
// Планшет Ridge месяц исполнял сборку до 10.07 — ту, чей `toggle` писал клетку сетки
// НАПРЯМУЮ, без строки журнала точки обслуживания. Отметки существовали и попадали в
// заявку, а времени тапа у них не было вовсе, поэтому своевременность Ridge не измеряется
// ни за одну неделю. Нашли это КОСВЕННО — по отсутствию строк журнала.
//
// ЧЕГО НЕ ХВАТАЛО ИМЕННО В МЕХАНИКЕ (проверено по исходникам, а не по памяти):
//   · `registerType: 'autoUpdate'` + `skipWaiting` + `clientsClaim` в vite.config УЖЕ стоят,
//     и клиент vite-plugin-pwa в режиме auto САМ перезагружает страницу на событии
//     'activated' с isUpdate (node_modules/vite-plugin-pwa/dist/client/build/register.js);
//   · но браузер ищет новую версию service worker'а только при РЕГИСТРАЦИИ — то есть при
//     загрузке страницы — либо по явному `registration.update()`.
//   · Планшет в группе не закрывают неделями: приложение висит открытым, регистрация не
//     повторяется, `update()` не зовёт никто → новая сборка не ищется НИКОГДА.
// Дыра была не в «умеет ли обновляться», а в «когда он вообще смотрит».
//
// ЧТО ДЕЛАЕТ ЭТОТ МОДУЛЬ — ДВЕ НЕЗАВИСИМЫЕ ДОРОГИ, НАРОЧНО
//   1. ОПРОС: `registration.update()` по таймеру, при возврате на вкладку и при появлении
//      сети. Дальше работает штатный autoUpdate.
//   2. СВЕРКА ВЕРСИИ: сборка, которую отдаёт сервер (`/version.json`, генерируется в
//      vite.config), сравнивается со сборкой, которая ИСПОЛНЯЕТСЯ (`__BUILD_ID__`).
//      Расходятся → экран «обновите приложение» с кнопкой.
//
// Почему второй дороги мало было бы одной, а первой — недостаточно: (1) чинит нормальный
// случай молча, но опирается на исправный service worker. (2) не опирается ни на что, кроме
// сети, и потому ловит ровно тот случай, где (1) уже не работает — залипший или отсутствующий
// SW. Ridge был вторым случаем.
//
// 🔴 ЧЕСТНО И ГЛАВНОЕ: НИ ОДНА ИЗ ЭТИХ ДОРОГ НЕ ДОСТАЁТ ДО УЖЕ УСТАРЕВШЕГО КЛИЕНТА.
// Код, который сегодня исполняется на планшете Ridge, написан до 10.07 и о существовании
// этого файла не знает. Ничего, что мы выкатим, там не запустится. Ridge чинится РУКАМИ
// (см. docs/instructions/), а этот модуль существует, чтобы СЛЕДУЮЩИЙ отставший нашёлся
// сам и починился сам.

import { registerSW } from 'virtual:pwa-register'

/** Как часто спрашивать сервер о новой сборке. Полчаса: планшет висит открытым весь день,
 *  а трафик — два коротких запроса; чаще смысла нет, реже — смена успевает пройти на
 *  старой сборке. */
const CHECK_MS = 30 * 60 * 1000

/** Отдаётся сервером, НЕ прекэшируется: workbox precache'ит только js/css/html/ico/png/svg/
 *  woff (globPatterns в vite.config), json туда не попадает. Значит ответ всегда сетевой —
 *  иначе сверка сравнивала бы кэш с кэшем и всегда молчала. */
const VERSION_URL = '/version.json'

let registration: ServiceWorkerRegistration | undefined
let watching = false

// ─── Внешнее хранилище для React (то же, что у очереди отметок) ───────────────
let stale = false
let servedBuild: string | null = null
let snapshotVersion = 0
const listeners = new Set<() => void>()

function emit() {
  snapshotVersion++
  for (const l of listeners) l()
}

export function subscribeAppUpdate(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
export function getAppUpdateVersion() { return snapshotVersion }
/** true — сервер отдаёт сборку, отличную от исполняемой. */
export function isAppStale() { return stale }
/** Сборка, которую отдаёт сервер (для показа человеку и для разговора по телефону). */
export function getServedBuild() { return servedBuild }
/** Сборка, которая исполняется прямо сейчас. */
export function getRunningBuild(): string {
  return typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'unknown'
}

/** Забрать уже существующую регистрацию у самого браузера — без обёртки.
 *  Нужна там, где обёртка отказала: worker с прошлого запуска обычно жив, и
 *  тогда дорога 1 (`update()`) остаётся рабочей. Молчит при любой неудаче:
 *  отсутствие service worker — не ошибка, а обычная жизнь iOS-вкладки. */
async function adoptExistingRegistration(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const r = await navigator.serviceWorker.getRegistration()
    if (r) registration = r
  } catch { /* нет доступа — дорога 2 работает и без этого */ }
}

// ─── Проверка ────────────────────────────────────────────────────────────────

/**
 * Спросить сервер о новой сборке. Ничего не ломает и ничего не перезагружает сам:
 * при исправном SW обновление проведёт autoUpdate, при неисправном — покажется экран.
 * Молча выходит офлайн: отсутствие сети — не устаревание.
 */
export async function checkForUpdate(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return

  // Дорога 1 — штатный путь. Ошибку глотаем намеренно: SW может быть не зарегистрирован
  // (iOS WebView, приватный режим), и это не повод молчать про версию.
  if (!registration) await adoptExistingRegistration()
  try { await registration?.update() } catch { /* дорога 2 ниже не зависит от неё */ }

  // Дорога 2 — сверка версий, ни от чего не зависит, кроме сети.
  try {
    const r = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return
    const j = await r.json()
    const served = typeof j?.build === 'string' ? j.build : null
    if (!served) return

    const running = getRunningBuild()
    // 'dev' — локальная сборка без git sha; сверять её с прод-версией бессмысленно и
    // привело бы к вечному баннеру у разработчика. 'unknown' — то же самое.
    const comparable = running !== 'unknown' && running !== 'dev' && served !== 'dev'
    const next = comparable && served !== running

    if (served !== servedBuild || next !== stale) {
      servedBuild = served
      stale = next
      emit()
    }
  } catch { /* сеть моргнула — не наше дело */ }
}

/**
 * Забрать новую сборку принудительно. Вызывается только с кнопки — человек решает, когда
 * перезагрузить, потому что перезагрузка посреди отметки класса неприятна (хотя и безопасна:
 * очередь живёт в IndexedDB, а не в Cache Storage, и чисткой кэшей не задевается).
 *
 * Порядок нарочный: сначала дать SW шанс подтянуться штатно, затем снести кэши приложения
 * (index.html и бандл лежат там же), затем перезагрузиться. Без чистки кэшей перезагрузка
 * залипшего клиента вернула бы ту же самую старую страницу из precache — то есть выглядела бы
 * как обновление, ничего не обновив.
 */
export async function applyUpdate(): Promise<void> {
  try { await registration?.update() } catch { /* дальше всё равно чистим и перезагружаемся */ }

  // Новая версия часто уже скачана и СТОИТ В ОЧЕРЕДИ (`registration.waiting`) —
  // она ждёт, пока закроются все вкладки со старой. Планшет группы не закрывают
  // неделями, значит не дождётся никогда. Одно слово ей — и она заступает.
  //
  // ⚠️ КАЖДОЕ ЗВЕНО ЗДЕСЬ ПРОВЕРЯЕТСЯ. Именно незащищённое обращение к `.waiting`
  // в пути обновления дало на проде 07.08 строку «SW register failed … reading
  // 'waiting'»: у планшета, где service worker не поднялся, читать `.waiting`
  // не у чего. Провал этого шага НЕ отменяет обновления — ниже чистится кэш и
  // страница перезагружается, а это работает и вовсе без service worker.
  try {
    const waiting = registration?.waiting
    if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' })
  } catch { /* нет SW / нет очереди — обновление идёт дорогой кэша */ }

  // ⚠️ Только онлайн. Снести кэш офлайн — оставить человека без приложения вообще:
  // shell брать будет неоткуда. Отметки при этом не пострадают (они в IndexedDB), но
  // работать будет не в чем.
  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    try {
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys()
        await Promise.all(keys.map(k => caches.delete(k)))
      }
    } catch { /* нет доступа к Cache Storage — перезагрузка всё равно осмысленна */ }
  }

  window.location.reload()
}

// ─── Запуск (один раз из main.tsx) ───────────────────────────────────────────

/**
 * Зарегистрировать service worker и начать следить за версией.
 * Регистрация переехала сюда из main.tsx целиком, чтобы `registration` был у нас в руках:
 * без него `update()` звать не на чем, а это и есть весь смысл работы.
 */
export function startAppUpdateWatch(): void {
  if (watching) return
  watching = true

  registerSW({
    immediate: true,
    onRegisteredSW: (_url, r) => {
      registration = r
      // Первая проверка сразу после регистрации: устройство, которое включили утром,
      // не должно ждать получаса.
      void checkForUpdate()
    },
    onRegisterError: (e) => {
      // SW не зарегистрировался — дорога 1 мертва. Дорога 2 продолжает работать, и это
      // ровно тот сценарий, ради которого она написана.
      console.error('[appUpdate] SW register failed', e)
      // …но прежде чем считать дорогу 1 мёртвой — спросим браузер напрямую.
      // Отказ регистрации в обёртке (её внутренний путь и споткнулся о `.waiting`
      // 07.08) НЕ означает, что зарегистрированного worker'а нет: он мог остаться
      // с прошлого раза. Тогда `registration` снова в руках, и `update()` есть
      // кому звать. Проверяется каждое звено — сама эта поправка не должна стать
      // вторым необработанным обращением в пути обновления.
      void adoptExistingRegistration()
      void checkForUpdate()
    },
  })

  if (typeof window === 'undefined') return

  setInterval(() => { void checkForUpdate() }, CHECK_MS)
  window.addEventListener('online', () => { void checkForUpdate() })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate()
  })
}
