// replicaData.ts — форма данных, которую понимает РЕПЛИКА бланка.
//
// НАЙДЕНО СВЕРКОЙ ОБРАЗЦА 08.08 (заказ владельца — построчно сверить снимок с
// `form_data`). В реплике CACFP v11 дни ищутся строчными ключами:
//     DAYS = ['mon','tue','wed','thu','fri','sat','sun'];  var x = sch[d]
// а витрина кладёт их С ЗАГЛАВНОЙ: `schedule.Mon`. Замер по базе: из 51 заявки
// со расписанием 38 несут «Mon» и только 11 — «mon».
//
// Последствие было не косметическим: `sch['mon']` = undefined → в бланке ПУСТО
// всё расписание — дни, часы прихода-ухода и галочки приёмов пищи, то есть
// СЕРДЦЕВИНА формы зачисления CACFP. И «замороженный снимок», снятый с такого
// рендера, замораживал пустоту: копия, которая выглядит официальной и молчит о
// том, чего в ней нет.
//
// Чиним ОДНИМ местом — на входе в реплику, а не правкой сгенерированного HTML:
// реплика собирается генератором из витринного кита (`gen_cacfp_replica.py`), и
// ручная правка ушла бы при следующей перегенерации.

/** Дни недели, как их ждёт реплика. */
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

/**
 * Привести `form_data` к виду, который читает реплика. Сегодня это ровно одно:
 * ключи дней расписания приводятся к нижнему регистру («Mon» → «mon»).
 * Идемпотентно; всё остальное не трогается — это НЕ правка данных, а перевод
 * на язык бланка перед отрисовкой. В базе `form_data` остаётся как прислали.
 */
export function normalizeForReplica<T = any>(formData: T): T {
  const fd: any = formData
  if (!fd || typeof fd !== 'object') return formData
  const sch = fd.schedule
  if (!sch || typeof sch !== 'object' || Array.isArray(sch)) return formData

  const out: Record<string, unknown> = {}
  let changed = false
  for (const [k, v] of Object.entries(sch)) {
    const lower = k.toLowerCase()
    if (DAY_KEYS.includes(lower)) {
      if (lower !== k) changed = true
      // Уже есть строчный ключ — он старше: не затираем прочитанное явно.
      out[lower] = out[lower] ?? v
    } else {
      out[k] = v
    }
  }
  return changed ? { ...fd, schedule: out } : formData
}
