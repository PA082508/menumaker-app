// src/lib/mealWindows.ts
// MenuMaker · Окна приёма пищи — вся арифметика ритуала «Пристегни ремни».
//
// Здесь НЕТ ни экрана, ни звука, ни сети: только «который час» → «что сейчас с
// этим окном». Так ритуал проверяется машиной целиком, а не глазами в 11:30.
//
// ЧТО ТАКОЕ ОКНО. Строка `meal_schedule` (класс × приём) со временем начала и
// конца. Времена — не наша удобная линейка, а ЛИНИЯ, НА КОТОРОЙ ИНСПЕКТОР
// ОТКАЗЫВАЕТ В ДЕНЬГАХ: у Play Academy уже был случай, когда класс сел есть на
// 5-10 минут раньше заявленного, и приём не возместили (канон 31.07). Поэтому
// ритуал говорит «можно начинать» ровно в начале окна и никогда раньше.
//
// ПОЧЕМУ `on_arrival` ИСКЛЮЧЁН. Завтрак «по мере прихода» начала не имеет —
// у него нет минуты, в которую «можно начинать». Подсказка «начинайте» там
// подталкивала бы к раннему кормлению, то есть ровно к тому, что мы предотвращаем.
// Такое окно живёт в списке дня, но голосом старта не звонит.

import { parseHHMM } from './ritualClock'

export type WindowPhase = 'before' | 'open' | 'reminder' | 'closed'

/** Ритуальный отсчёт: обещание плашки — «отсчёт 30 минут» от начала окна. */
export const RITUAL_COUNTDOWN_MIN = 30
/** За сколько минут до конца окна звучит напоминание. */
export const REMINDER_LEAD_MIN = 10

// ─── Ступени пустого окна (карта звуков 04.08) ───────────────────────────────
// Отсчёт идёт от НАЧАЛА окна, а не от его конца, и только при НУЛЕ отметок:
//   +10 мин → горн на планшете класса   (звук, глушится тумблером)
//   +15 мин → сообщение директору центра (не звук — глушителем не отменяется)
// Почему от начала: еда уже на столах, и цена промедления растёт с первой минуты,
// а не с последней. Почему две ступени, а не одна: горн даёт комнате шанс
// исправиться самой, и только если она им не воспользовалась, тревожат директора.

export const HORN_AFTER_MIN = 10
export const DIRECTOR_ALERT_AFTER_MIN = 15

export type AlertStage = 'none' | 'horn' | 'director'

/**
 * Ступень тревоги для окна прямо сейчас. Чистая функция — вся лестница
 * проверяется машиной, а не глазами в 9:40.
 *
 * Ступени живут ВНУТРИ окна: закрывшееся окно молчит вовсе (решение 04.08 —
 * «закрытие без звука»), его подбирает красный список конца дня. У окна короче
 * 10 минут ступеней не бывает — и это верно: догонять там уже нечего.
 */
export function alertStage(w: MealWindow, nowMin: number, marked: boolean): AlertStage {
  if (marked) return 'none'
  const ph = phaseOf(w, nowMin)
  if (ph !== 'open' && ph !== 'reminder') return 'none'
  const since = nowMin - w.start
  if (since >= DIRECTOR_ALERT_AFTER_MIN) return 'director'
  if (since >= HORN_AFTER_MIN) return 'horn'
  return 'none'
}

export interface ScheduleRow {
  slot: string
  start_time: string | null
  end_time: string | null
  intake_mode?: string | null
  classroom_id?: string
}

export interface MealWindow {
  slot: string
  classroom_id?: string
  /** Начало окна, минуты от полуночи. */
  start: number
  /** Конец окна. Нет `end_time` → начало + 30 минут (то же, что обещает плашка). */
  end: number
  /** Минута напоминания: за 10 минут до конца, но не раньше начала. */
  remindAt: number
  /** Минута, до которой тикает плашка: 30 минут ритуала, но не дольше окна. */
  countdownTo: number
  /** true — «по мере прихода»: у окна нет минуты старта, голосом не звоним. */
  onArrival: boolean
}

/** Строка расписания → окно. null, если времени начала нет: окна без начала не бывает. */
export function toWindow(row: ScheduleRow): MealWindow | null {
  const start = parseHHMM(row.start_time)
  if (start === null) return null
  const parsedEnd = parseHHMM(row.end_time)
  // Конец раньше начала (ночная смена в данных) не бывает у детского сада — такую
  // строку считаем как «конца нет», а не разворачиваем сутки наизнанку.
  const end = parsedEnd !== null && parsedEnd > start ? parsedEnd : start + RITUAL_COUNTDOWN_MIN
  return {
    slot: row.slot,
    classroom_id: row.classroom_id,
    start,
    end,
    remindAt: Math.max(start, end - REMINDER_LEAD_MIN),
    countdownTo: Math.min(start + RITUAL_COUNTDOWN_MIN, end),
    onArrival: (row.intake_mode ?? 'event') === 'on_arrival',
  }
}

export function buildWindows(rows: readonly ScheduleRow[]): MealWindow[] {
  return rows.map(toWindow).filter((w): w is MealWindow => w !== null).sort((a, b) => a.start - b.start)
}

export function phaseOf(w: MealWindow, nowMin: number): WindowPhase {
  if (nowMin < w.start) return 'before'
  if (nowMin >= w.end) return 'closed'
  return nowMin >= w.remindAt ? 'reminder' : 'open'
}

/**
 * Открытое сейчас окно. Если открыты два (расписание внахлёст — данные это
 * позволяют), берём то, что началось позже: человек занят текущим приёмом,
 * а не тем, который вот-вот кончится.
 */
/**
 * Окна, которые ритуал ВЕДЁТ: голосом, отсчётом и авто-переключением экрана.
 *
 * Решение владельца 03.08: завтрак «по мере прихода» из ритуала исключён ЦЕЛИКОМ —
 * не поёт (ни старт, ни напоминание, ни закрытие), не крутит 30-минутный отсчёт,
 * экран на него сам не переключается. Причина не в удобстве: у такого окна нет
 * минуты, в которую «можно начинать», и любая подсказка толкала бы к ранней подаче —
 * ровно к тому, за что Play Academy уже снимали возмещение на проверке (канон 31.07).
 *
 * В красный список конца дня завтрак при этом ПОПАДАЕТ — но только при нуле отметок
 * за всё окно, на общих основаниях (см. unbuckledWindows). Видимость молчалива и
 * ничего не подсказывает во время еды, поэтому она разрешена там, где голос — нет.
 */
export const ritualLed = (w: MealWindow): boolean => !w.onArrival

/** Окно, которое ритуал ведёт прямо сейчас. «По мере прихода» сюда не попадает. */
export function activeRitualWindow(windows: readonly MealWindow[], nowMin: number): MealWindow | null {
  return activeWindow(windows.filter(ritualLed), nowMin)
}

export function activeWindow(windows: readonly MealWindow[], nowMin: number): MealWindow | null {
  let best: MealWindow | null = null
  for (const w of windows) {
    const ph = phaseOf(w, nowMin)
    if (ph === 'open' || ph === 'reminder') {
      if (!best || w.start > best.start) best = w
    }
  }
  return best
}

/** Сколько минут осталось тикать плашке. Ноль — отсчёт кончился, окно ещё открыто. */
export function countdownLeft(w: MealWindow, nowMin: number): number {
  return Math.max(0, w.countdownTo - nowMin)
}

// ─── ЗАМОК ОТМЕТОК (заказ владельца 08.08) ───────────────────────────────────
// Отметка питания — запись точки обслуживания, а не черновик: пока прошлые
// галочки остаются живыми, вчерашний завтрак можно переставить одним случайным
// касанием, и в заявке это будет неотличимо от настоящей отметки. Закрылось окно
// приёма — приём замыкается у учителя; правит после этого только директор под
// своим PIN, со штампом «amended» и причиной (спека meal-marks-amendment).
//
// ЛЬГОТА ПОСЛЕ КОНЦА ОКНА. Замок падает НЕ в минуту конца: у окна есть хвост —
// доели, убрали, дошли до планшета. Тридцать минут выбраны не на глаз: это тот же
// порог, которым уже меряется своевременность (RITUAL_COUNTDOWN_MIN и стык с
// meal-timing), и второе число рядом означало бы две разные «своевременности».
// Число живёт ОДНОЙ константой — слово владельца меняет его в одном месте.
export const LOCK_GRACE_MIN = 30

export type LockReason = 'past-day' | 'window-closed'
export type SlotLock = { locked: false } | { locked: true; reason: LockReason; sinceMin?: number }

const OPEN: SlotLock = { locked: false }

/**
 * Замкнут ли этот приём для отметки ПРЯМО СЕЙЧАС.
 *
 * `dayOffset` — показанный день относительно сегодняшнего: 0 сегодня, <0 прошлое.
 * Будущее НЕ замыкается: отметить наперёд нельзя по смыслу, но экран, который
 * показывает будущий день, до этой функции не доходит (у учителя день один).
 *
 * ⚠️ ОКНА НЕТ — ЗАМКА НЕТ. Комната без строки расписания на этот приём не должна
 * терять возможность отметить съеденное: замок на незнании — это отказ кормить
 * запись о реальной еде. Дыра названа вслух: её закрывает расписание, а не замок.
 */
export function slotLock(
  w: MealWindow | null | undefined, nowMin: number, dayOffset: number,
): SlotLock {
  if (dayOffset < 0) return { locked: true, reason: 'past-day' }
  if (dayOffset > 0) return OPEN
  if (!w) return OPEN
  const closedFor = nowMin - (w.end + LOCK_GRACE_MIN)
  return closedFor >= 0 ? { locked: true, reason: 'window-closed', sinceMin: closedFor } : OPEN
}

/** Слова замка — те же и на плашке, и на тапе по замкнутой галочке. Отказ обязан
 *  ЗВУЧАТЬ: «не реагирует» человек читает как поломку планшета, а не как правило. */
export function lockLine(lock: SlotLock, slotLabel: string): string {
  if (!lock.locked) return ''
  return lock.reason === 'past-day'
    ? `${slotLabel} on an earlier day is closed — ask your director to change it.`
    : `${slotLabel} is closed — ask your director to change it.`
}

export interface UnbuckledWindow extends MealWindow {
  classroomName: string
}

/**
 * «Непристёгнутые»: окна, ЗАКРЫВШИЕСЯ сегодня без единой отметки.
 *
 * Только видимость. Ни одно из них ничего не запрещает и ничего не исправляет
 * задним числом — список существует, чтобы к концу дня было видно то, что иначе
 * заметят через месяц, при сверке заявки.
 *
 * Завтрак «по мере прихода» сюда ВХОДИТ наравне с прочими и по тому же условию:
 * окно закрылось, отметок за него — ноль. Это не противоречит исключению завтрака
 * из ритуала (см. ritualLed): голос звучит ВО ВРЕМЯ еды и может толкнуть к ранней
 * подаче, а список показывается ПОСЛЕ закрытия окна и подсказать уже нечему.
 */
export function unbuckledWindows(
  windows: readonly (MealWindow & { classroomName: string })[],
  nowMin: number,
  isMarked: (w: MealWindow) => boolean,
): UnbuckledWindow[] {
  return windows
    .filter((w) => phaseOf(w, nowMin) === 'closed' && !isMarked(w))
    .sort((a, b) => a.start - b.start || a.classroomName.localeCompare(b.classroomName))
}

// ─── Что показывает плашка ───────────────────────────────────────────────────

export type BannerKind = 'none' | 'locked' | 'counting' | 'done'

export interface BannerState {
  kind: BannerKind
  slot: string | null
  /** Минут до конца ритуального отсчёта (для 'counting'). */
  minutesLeft: number
  /** Минут до ЗАКРЫТИЯ окна. Когда ритуальные 30 минут вышли, а окно ещё идёт,
   *  плашка показывает именно это: «0» на видном месте читается как «поздно»,
   *  хотя отметить ещё можно и нужно. */
  minutesToClose: number
  /** Время первой отметки HH:MM (для 'done'). */
  markedAt: string | null
  /** true — идут последние 10 минут окна. */
  urgent: boolean
  /**
   * true с 10-й минуты пустого окна — плашка ПУЛЬСИРУЕТ.
   *
   * Видимость нарочно не зависит ни от разблокировки звука, ни от тумблера
   * «тихий час»: заглушённый планшет в тихий час обязан остаться видимым, иначе
   * тумблер выключал бы не звук, а само предупреждение.
   */
  alarm: boolean
}

export const EMPTY_BANNER: BannerState = {
  kind: 'none', slot: null, minutesLeft: 0, minutesToClose: 0, markedAt: null, urgent: false, alarm: false,
}

/**
 * Состояние плашки. `audioUnlocked=false` даёт 'locked' — беззвучную плашку,
 * которая честно говорит, что звука не будет, пока экрана не коснулись.
 */
export function bannerState(
  active: MealWindow | null,
  nowMin: number,
  marked: boolean,
  markedAt: string | null,
  audioUnlocked: boolean,
): BannerState {
  if (!active) return EMPTY_BANNER
  if (marked) {
    return { kind: 'done', slot: active.slot, minutesLeft: 0, minutesToClose: 0, markedAt, urgent: false, alarm: false }
  }
  return {
    kind: audioUnlocked ? 'counting' : 'locked',
    slot: active.slot,
    minutesLeft: countdownLeft(active, nowMin),
    minutesToClose: Math.max(0, active.end - nowMin),
    markedAt: null,
    urgent: phaseOf(active, nowMin) === 'reminder',
    alarm: alertStage(active, nowMin, false) !== 'none',
  }
}
