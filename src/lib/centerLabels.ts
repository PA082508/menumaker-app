// src/lib/centerLabels.ts
// ПОДПИСИ центров в интерфейсе — и ТОЛЬКО подписи.
//
// ЗАКАЗ ВЛАДЕЛЬЦА 04.08: в переключателе и меню центры зовутся так, как их зовут
// люди в разговоре — по городу. «Play Academy Ridge» на бланке и «Wickliffe» в
// переключателе — это один центр, названный для двух разных читателей: для
// проверяющего и для своего.
//
// ⚠️ ПОПРАВКА 08.08 — КАНОН ВЛАДЕЛЬЦА, ОТМЕНЯЮЩИЙ ДОПУЩЕНИЕ 04.08.
// Тогда здесь было написано, что «Play Academy Ridge» — законное имя на бланке.
// Это неверно: Ridge · Alpha · Pearl — РАБОЧИЕ КЛИЧКИ, внутренние слова стройки.
// Наружу центр зовётся по городу, и на бланке тоже: официальное имя — это
// «Play Academy Wickliffe» / «Play Academy Highland Heights» / «Play Academy
// Parma Heights». Кличка, вылезшая в шапку App учителя («Play Academy Ridge ·
// Red»), в письмо семьям или на печатный лист, — не «внутренняя деталь», а
// чужое имя в документе, который читают родители и проверяющий.
//
// Поэтому подписей ДВЕ, и обе живут ЗДЕСЬ, ключом по slug:
//   centerLabel(c)        → короткая, для переключателя и чипов: «Wickliffe»
//   centerOfficialName(c) → полная, для документов, шапок и печати:
//                           «Play Academy Wickliffe»
//
// ❌ ЧЕГО ЭТО НЕ ТРОГАЕТ И НЕ ДОЛЖНО: slug'и (`ridge`, `pearl`, `alpha`), адреса
// страниц, ключи, ветки и значения в базе. Меняется ТОЛЬКО то, что видит человек.
//
// Ключ — slug, а не имя: имя центра однажды поправят в базе, и подпись отвяжется
// молча. Slug не меняется — он же в адресах.

export const CENTER_DISPLAY_BY_SLUG: Record<string, string> = {
  ridge: 'Wickliffe',
  pearl: 'Parma Heights',
  // Highland Heights остаётся как есть — город и есть его привычное имя.
}

/** Официальное имя центра — то, что уместно в документе и в шапке у двери.
 *  Пока `centers.name` в базе несёт кличку («Play Academy Ridge»), перевод живёт
 *  здесь; когда имя в базе станет городом, эта карта опустеет сама собой —
 *  fallback уже отдаёт `name` как есть. */
export const CENTER_OFFICIAL_BY_SLUG: Record<string, string> = {
  ridge: 'Play Academy Wickliffe',
  pearl: 'Play Academy Parma Heights',
  alpha: 'Play Academy Highland Heights',
}

export function centerOfficialName(c: { slug?: string | null; name?: string | null }): string {
  const own = c.slug ? CENTER_OFFICIAL_BY_SLUG[c.slug] : undefined
  if (own) return own
  // Неизвестный центр отдаётся как есть: выдумывать ему город — хуже, чем
  // показать то имя, под которым он заведён.
  return (c.name ?? '').trim() || '—'
}

/** Подпись центра для интерфейса. Нет своей — короткое имя без «Play Academy». */
export function centerLabel(c: { slug?: string | null; name?: string | null }): string {
  const own = c.slug ? CENTER_DISPLAY_BY_SLUG[c.slug] : undefined
  if (own) return own
  return (c.name ?? '').replace(/^Play Academy\s+/i, '').trim() || '—'
}

/** Подпись организационного входа. «Organization» — слово из документа, а
 *  «Main Office» — место, куда человек идёт. */
export const ORG_LABEL = 'Main Office'

/**
 * Порядок в переключателе, сверху вниз (заказ владельца): Wickliffe ·
 * Highland Heights · Parma Heights. Центры вне списка идут следом по алфавиту —
 * новый центр не должен ни исчезнуть, ни встать первым молча.
 */
export const CENTER_ORDER: string[] = ['ridge', 'alpha', 'pearl']

export function sortCentersForSwitcher<T extends { slug?: string | null; name?: string | null }>(
  centers: readonly T[],
): T[] {
  const rank = (c: T) => {
    const i = c.slug ? CENTER_ORDER.indexOf(c.slug) : -1
    return i < 0 ? CENTER_ORDER.length : i
  }
  return [...centers].sort((a, b) => rank(a) - rank(b) || centerLabel(a).localeCompare(centerLabel(b)))
}
