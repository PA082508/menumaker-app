// src/lib/spokenLines.ts
// MenuMaker · Что именно произносится вслух — чистые строки, без звука и экрана.
//
// ПРАВИЛО ЯРУСА «ГОЛОС» (владелец, 04.08): вслух произносится ПИСЬМЕННАЯ
// КВИТАНЦИЯ, а не пересказ. Голос не имеет права сказать больше, чем написано:
// сказанное исчезает, написанное остаётся, и расходиться им нельзя. Поэтому
// строки собираются здесь, ОДНОЙ функцией на событие, и проверяются тестом —
// а не собираются по месту в трёх обработчиках.
//
// ЧАС В ГОЛОСЕ — 12-ЧАСОВОЙ, БЕЗ am/pm. На полосе квитанции час стоит 24-часовой
// («17:12»), и это правильно для бумаги. Вслух «семнадцать двенадцать» никто не
// говорит: образец владельца — «released to …, 5:12». Мгновение одно и то же,
// разное только чтение — и это единственное расхождение голоса с полосой,
// названное здесь нарочно, чтобы его не «исправили» обратно.

export type HandoffAction = 'drop_off' | 'pick_up'

/** Час для голоса: 12-часовой, без ведущего нуля и без am/pm («8:02», «5:12»). */
export function spokenClock(iso: string | null | undefined, now = new Date()): string {
  const d = iso ? new Date(iso) : now
  if (Number.isNaN(d.getTime())) return ''
  const h24 = d.getHours()
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`
}

export interface HandoffLineInput {
  action: HandoffAction
  childName: string
  /** Кому отдали — доверенное лицо/родитель. Пусто — фразы «кому» не будет. */
  personName?: string | null
  /** Время подтверждения (ISO). Пусто — берётся «сейчас». */
  atISO?: string | null
  now?: Date
}

/**
 * Квитанция передачи вслух.
 *   приём:  «Emma Carter — accepted, 8:02»
 *   выдача: «Emma Carter — released to Maria Lopez, 5:12»
 * Без имени принимающего — «released», без «to»: назвать «to parent» значило бы
 * сказать вслух то, чего в квитанции нет.
 */
export function spokenHandoff(i: HandoffLineInput): string {
  const time = spokenClock(i.atISO, i.now)
  const child = i.childName.trim()
  const person = (i.personName ?? '').trim()
  if (i.action === 'drop_off') return `${child} — accepted, ${time}`
  return person
    ? `${child} — released to ${person}, ${time}`
    : `${child} — released, ${time}`
}

/**
 * Родитель заявил приход из своего приложения — объявление на планшете класса,
 * ДО подтверждения учителем. Событие существует: `safepass_request_handoff`
 * кладёт строку `safepass_sessions` со статусом `waiting` и `person_initiated_at`,
 * и планшет уже получает её живьём (таблица в публикации Realtime).
 *
 * Без имени пришедшего объявляем без имени: «Someone» в детском саду звучит
 * тревожно, а выдумывать имя нельзя.
 */
export function spokenArrival(personName: string | null | undefined, childName: string): string {
  const person = (personName ?? '').trim()
  const child = childName.trim()
  return person ? `${person} is here for ${child}` : `Someone is here for ${child}`
}

/**
 * Отказ записи отметки — голос ПОВЕРХ полосы отказа, тем же языком, что полоса.
 * Язык всего интерфейса английский (правило владельца, подтверждено 04.08), и
 * голос обязан идти за экраном: русская фраза над английской полосой — это два
 * разных сообщения об одном отказе. Длинную полосу вслух не читают: голос несёт
 * ровно то, что человек должен сделать, подробности остаются написанными.
 */
export function spokenMarkRefusal(childName: string): string {
  const child = childName.trim()
  return child ? `Mark not saved: ${child}. Mark it again.` : 'Mark not saved. Mark it again.'
}

// ─── Сообщение директору на 15-й минуте ──────────────────────────────────────

export interface DirectorAlertInput {
  className: string
  slotLabel: string
  /** Час начала окна, HH:MM. */
  startedHHMM: string
  /** Минут от начала окна на момент отправки. */
  minutesIn: number
  /** Строка о заглушённом звуке или null (см. lib/soundMute.ts). */
  muteLine?: string | null
}

/**
 * Тело сообщения директору. Первой строкой — ровно то, что заказано: класс,
 * приём, время начала. Второй — почему это не может подождать. Третьей, если
 * звук на устройстве заглушён, — что класс сигнала НЕ СЛЫШАЛ: без этой строки
 * директор прочтёт молчание класса как «слышали и не пошли».
 */
export function directorAlertBody(i: DirectorAlertInput): string {
  const lines = [
    `${i.className} · ${i.slotLabel} · window opened ${i.startedHHMM} — no marks ${i.minutesIn} minutes in.`,
    'Food is on the tables now. An unmarked meal is money that cannot be claimed back later.',
  ]
  if (i.muteLine) lines.push(`⚠️ ${i.muteLine} — the room did not hear the alert.`)
  return lines.join('\n')
}

/** Заголовок-подпись отправителя: сообщение шлёт планшет, а не человек. */
export const DIRECTOR_ALERT_SENDER = 'Meal window alert'

/**
 * КОЛОНКИ `menumaker.internal_messages` — ЗАМЕРЕНЫ 04.08, не взяты по памяти:
 *   select column_name, is_nullable from information_schema.columns
 *    where table_schema='menumaker' and table_name='internal_messages';
 *
 * Список нужен здесь потому, что PostgREST отбивает ВЕСЬ insert на одной чужой
 * колонке, а голый await такой отказ глотает целиком: так 68 сканов посещаемости
 * легли в хранилище, не оставив ни одной строки в базе (29.07). Проба сверяет
 * нагрузку с этим списком, отказ связывается на месте вызова.
 */
export const INTERNAL_MESSAGE_COLUMNS = [
  'id', 'org_id', 'center_id', 'sender_id', 'sender_name', 'recipient_type',
  'recipient_value', 'recipient_label', 'body', 'attachments', 'read_by', 'created_at',
] as const

/** Колонки, которые база объявила NOT NULL и без умолчания — их обязан нести любой insert. */
export const INTERNAL_MESSAGE_REQUIRED = ['org_id', 'recipient_value'] as const

export interface DirectorAlertRowInput extends DirectorAlertInput {
  orgId: string | undefined
  centerId: string | null
  centerName: string
  senderId: string | undefined
}

/** Строка для internal_messages. Чистая — чтобы форму нагрузки проверяла машина. */
export function directorAlertRow(i: DirectorAlertRowInput): Record<string, unknown> {
  return {
    org_id: i.orgId,
    center_id: i.centerId,
    // Политика send_as_self пропускает вставку только когда sender_id = auth.uid():
    // планшет вошёл настоящей учёткой центра, ею и подписывается.
    sender_id: i.senderId,
    sender_name: DIRECTOR_ALERT_SENDER,
    recipient_type: 'role',
    recipient_value: 'director',
    recipient_label: `Director · ${i.centerName}`.trim(),
    body: directorAlertBody(i),
  }
}

// ─── Заявка учителя на правку замкнутого приёма (заказ владельца 08.08) ──────
// Замок закрывает приём — но у человека остаётся дело: «я отметил не всех», «Мия
// доела после звонка». Тупик здесь хуже открытой галочки: он учит обходить
// систему. Поэтому у полосы замка стоит дверь — заявка ДИРЕКТОРУ, тем же рельсом
// (`internal_messages`), которым уже ходит тревога пустого окна: рельс живой,
// доставка проверена, второго канала заводить незачем.
//
// БУДУЩИЙ СТЫК НАЗВАН СРАЗУ: эта же заявка станет ВХОДОМ директорской PIN-правки
// `amended` (спека 2026-08-07-meal-marks-amendment) — директор открывает
// сообщение и правит адресно, не разыскивая, о каком ребёнке и дне речь. Поэтому
// в теле стоят ровно те четыре опоры, которые нужны правке: кто · комната ·
// приём · день.

export interface ChangeRequestInput {
  /** Имя вошедшего по PIN — заявку подаёт ЧЕЛОВЕК, а не планшет. */
  personName: string
  className: string
  slotLabel: string
  /** День отметки словами, как его видит человек: «Friday, Aug 7». */
  dayLabel: string
  /** Необязательная приписка учителя. Пусто — значит пусто, выдумывать нечего. */
  note?: string | null
}

export const CHANGE_REQUEST_SENDER = 'Meal mark — change request'

export function changeRequestBody(i: ChangeRequestInput): string {
  const lines = [
    `${i.personName} asks to change ${i.slotLabel} for ${i.className} — ${i.dayLabel}.`,
    'The meal is closed on the classroom tablet, so the change has to come from you.',
  ]
  const note = (i.note ?? '').trim()
  if (note) lines.push(`Their note: “${note}”`)
  return lines.join('\n')
}

export interface ChangeRequestRowInput extends ChangeRequestInput {
  orgId: string | undefined
  centerId: string | null
  centerName: string
  senderId: string | undefined
}

/** Строка для internal_messages. Форма — та же, что у тревоги окна (та проверена
 *  живьём 04.08): политика `send_as_self` пропускает вставку, только когда
 *  sender_id = auth.uid(), а `can_see_message` доставляет её роли director
 *  этого центра. */
export function changeRequestRow(i: ChangeRequestRowInput): Record<string, unknown> {
  return {
    org_id: i.orgId,
    center_id: i.centerId,
    sender_id: i.senderId,
    // Подписывается ЧЕЛОВЕК: директор должен видеть, кто просит, не открывая тело.
    sender_name: `${CHANGE_REQUEST_SENDER} · ${i.personName}`,
    recipient_type: 'role',
    recipient_value: 'director',
    recipient_label: `Director · ${i.centerName}`.trim(),
    body: changeRequestBody(i),
  }
}
