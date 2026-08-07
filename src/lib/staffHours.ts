// staffHours.ts — ЕДИНСТВЕННЫЙ ВЫЧИСЛИТЕЛЬ ЧАСОВ РАБОЧЕГО ДНЯ.
//
// Повод (07.08, слово владельца по живому Work Schedule): строка Mon 06:30–15:30
// с обедом 12:00–13:00 показывала Hours 8.0, а Total weekly — 8.5h. Считали два
// разных места: строка вычитала обед ИНТЕРВАЛОМ, итог — legacy-минутами
// (break_minutes = 30). Замер того же дня: все 10 строк staff_schedules, созданных
// после Work Schedule v2 (2fb145b, 06.08), несут ОБА представления обеда сразу —
// строк только с интервалом 0, только с legacy 0. То есть расхождение не редкий
// случай, а свойство каждой новой строки: два поля, два читателя, два ответа.
//
// Правило, которое здесь закреплено: часы дня считает ОДНО место — вот это.
// Недельный итог не считает ничего, он складывает то, что человек видит в строках.
//
// Округление живёт ЗДЕСЬ, а не в разметке: строка показывает одну десятую, и если
// итог сложит неокруглённые часы, «итог = сумма видимых» перестанет быть правдой
// на нескольких днях (5 × 7.75 = 38.75 → 38.8, а глазами человек складывает
// 5 × 7.8 = 39.0). Поэтому вычислитель отдаёт уже ту десятую, что видна.

/** Ровно те поля дня, от которых зависят часы. Больше вычислителю не нужно. */
export type HoursDay = {
  is_active: boolean
  shift_start: string   // 'HH:MM'
  shift_end: string     // 'HH:MM'
  break_start: string   // 'HH:MM' | '' — пусто значит «время обеда ещё не задано»
  break_end: string     // 'HH:MM' | ''
  break_minutes: number // legacy-представление обеда
}

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Часы дня, округлённые до десятой — ровно то число, что стоит в столбце Hours.
 * `null` = в строке стоит «—»: день выключен, смена не задана или обед съел смену.
 * Итог недели складывает эти же значения и ничего не пересчитывает.
 */
export function dayHours(d: HoursDay): number | null {
  if (!d.is_active || !d.shift_start || !d.shift_end) return null

  // Обед интервалом, если задан обоими концами; иначе — legacy-минуты (дорога A).
  const lunch = (d.break_start && d.break_end)
    ? Math.max(0, minutes(d.break_end) - minutes(d.break_start))
    : d.break_minutes

  const total = minutes(d.shift_end) - minutes(d.shift_start) - lunch
  return total > 0 ? Math.round((total / 60) * 10) / 10 : null
}

/** Недельный итог = сумма видимых Hours. Единственное действие — сложение. */
export function weekHours(days: HoursDay[]): number {
  return days.reduce((sum, d) => sum + (dayHours(d) ?? 0), 0)
}

// ─── ФАКТИЧЕСКИЕ часы: пары «пришёл → ушёл» ─────────────────────────────────
// Вкладка «Моё время» показывает не расписание, а ФАКТ тапов. Считает это тот же
// файл нарочно: два места, считающие часы, разошлись 07.08 в карточке, и второй
// раз мы этой ошибки не повторяем — здесь один дом для любых часов.

export type TimeEvent = {
  event_type: string            // 'check_in' | 'check_out' | …
  event_at: string              // ISO
  classroom_name?: string | null
  note?: string | null
}

export type Shift = {
  in_at: string
  out_at: string | null         // null = смена ещё открыта
  classroom_name: string | null
  hours: number | null          // null пока смена не закрыта — часы не угадываем
  note?: string | null
}

/**
 * Собирает события в смены. Открытая смена (вошёл и не вышел) возвращается с
 * `out_at: null` и `hours: null` — НЕ достраивается «до сейчас»: незакрытая
 * смена это факт незакрытой смены, а не оценка. Экран показывает её словами.
 */
export function pairShifts(events: TimeEvent[]): Shift[] {
  const sorted = [...events].sort((a, b) => a.event_at.localeCompare(b.event_at))
  const shifts: Shift[] = []
  let open: Shift | null = null
  for (const e of sorted) {
    if (e.event_type === 'check_in') {
      if (open) shifts.push(open)                       // два входа подряд — первый остаётся открытым
      open = { in_at: e.event_at, out_at: null, classroom_name: e.classroom_name ?? null, hours: null, note: e.note ?? null }
    } else if (e.event_type === 'check_out') {
      if (!open) continue                               // выход без входа: показывать нечего, сочинять вход нельзя
      const ms = new Date(e.event_at).getTime() - new Date(open.in_at).getTime()
      open.out_at = e.event_at
      open.hours = ms > 0 ? Math.round((ms / 3600000) * 10) / 10 : 0
      shifts.push(open)
      open = null
    }
  }
  if (open) shifts.push(open)
  return shifts
}

/** Итог = сумма ВИДИМЫХ часов закрытых смен. Тот же инвариант, что в карточке. */
export function sumShiftHours(shifts: Shift[]): number {
  return shifts.reduce((s, sh) => s + (sh.hours ?? 0), 0)
}
