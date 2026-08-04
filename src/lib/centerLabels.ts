// src/lib/centerLabels.ts
// ПОДПИСИ центров в интерфейсе — и ТОЛЬКО подписи.
//
// ЗАКАЗ ВЛАДЕЛЬЦА 04.08: в переключателе и меню центры зовутся так, как их зовут
// люди в разговоре — по городу. «Play Academy Ridge» на бланке и «Wickliffe» в
// переключателе — это один центр, названный для двух разных читателей: для
// проверяющего и для своего.
//
// ❌ ЧЕГО ЭТО НЕ ТРОГАЕТ И НЕ ДОЛЖНО: slug'и (`ridge`, `pearl`, `alpha`), адреса
// страниц, значения в базе и ОФИЦИАЛЬНОЕ имя на печатных бланках и в снимках
// опубликованного меню. Там имя юридическое, и подменять его разговорным значит
// подделывать документ. Официальное имя берётся из `centers.name` напрямую и
// через эти функции НЕ проходит.
//
// Ключ — slug, а не имя: имя центра однажды поправят в базе, и подпись отвяжется
// молча. Slug не меняется — он же в адресах.

export const CENTER_DISPLAY_BY_SLUG: Record<string, string> = {
  ridge: 'Wickliffe',
  pearl: 'Parma Heights',
  // Highland Heights остаётся как есть — город и есть его привычное имя.
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
