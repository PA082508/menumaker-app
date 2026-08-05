// ============================================================================
// ДЕТЕКТОР ПРЯМОГО ЧТЕНИЯ signature_date — одно тело для гарда и для пробы.
//
// ПОВОД (Николай, 29.07). Мы закрыли тихую ошибку порядком чтения
// (documentDateOf: колонка → form_data) и тем самым завели ОТЛОЖЕННУЮ: у 12
// запечатанных строк колонка не появится НИКОГДА, у всех бумажных до правки —
// тоже. Тот, кто через три месяца напишет запрос ПРЯМО ПО КОЛОНКЕ, получит для
// них пустоту и не заметит.
//
// Значит функция доступа обязана быть ЕДИНСТВЕННЫМ ВХОДОМ, а не рекомендацией.
//
// ЧТО НЕ СЧИТАЕТСЯ НАРУШЕНИЕМ:
//   · physician_signature_date / parent_signature_date — ДРУГИЕ поля;
//   · p_signature_date — ПАРАМЕТР записи в RPC, а не чтение колонки;
//   · `signature_date:` — ключ объекта или объявление типа (в том числе аргумент,
//     который СОБИРАЮТ для самого резолвера), а не чтение;
//   · упоминание в комментарии — разговор о правиле не есть его нарушение
//     (тот же урок, что с цитатой дурного идиома в гарде выброшенного error);
//   · файлы из ALLOW — с НАЗВАННОЙ причиной, а не просто «этот можно».
// ============================================================================
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/** Кому можно и ПОЧЕМУ. Причина обязательна: список без причин превращается в свалку. */
export const ALLOW = {
  'lib/enrollmentApprove.ts':
    'дом резолвера documentDateOf + formAsOf (у него своя задача — свежесть расписания)',
  'lib/dcyPort.ts':
    'правило DCY (даты ревизии на самой форме); остаток делегирован общему резолверу',
  'lib/childReadmission.ts':
    '«дата, когда форма легла в папку» — не документная дата, там уместен и created_at',
  'lib/enrollmentFieldMap.ts':
    'показывает значение ПОЛЯ формы в таблице сверки, а не решает документную дату',
  'pages/enrollment/EnrollmentReviewModal.tsx':
    'показывает найденную дату и говорит, откуда она взята',
  'pages/enrollment/EnrollmentInboxPage.tsx':
    'тянет колонку в список и ПЕРЕДАЁТ её резолверу; сам о документной дате не решает',
  'pages/children/ChildDocumentsTab.tsx':
    'тянет колонку в select, чтобы отдать её documentDateOf для даты на реплике бланка; сам не решает',
}

const inComment = (text, idx) => {
  const lineStart = text.lastIndexOf('\n', idx - 1) + 1
  const head = text.slice(lineStart, idx).trimStart()
  if (head.startsWith('//') || head.startsWith('*')) return true
  const before = text.slice(0, idx)
  return before.lastIndexOf('/*') > before.lastIndexOf('*/')
}

function sourceFiles(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) { sourceFiles(p, out); continue }
    if (/\.tsx?$/.test(e)) out.push(p)
  }
  return out
}

/** Нарушения в одном тексте — вынесено, чтобы проба могла кормить его образцом. */
export function violationsIn(text) {
  const out = []
  const re = /signature_date/g
  let m
  while ((m = re.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 12), m.index)
    if (/physician_$|parent_$/.test(before)) continue      // другое поле
    if (/p_$/.test(before)) continue                        // p_signature_date — ПАРАМЕТР записи, не чтение колонки
    if (text[m.index + 'signature_date'.length] === ':') continue  // КЛЮЧ объекта или объявление типа, не чтение
    if (inComment(text, m.index)) continue                  // разговор, не нарушение
    out.push(text.slice(0, m.index).split('\n').length)
  }
  return out
}

/** @returns {{offenders: {rel: string, lines: number[]}[], allowedSeen: string[]}} */
export function scanSignatureDate(srcDir) {
  const offenders = []
  const allowedSeen = []
  for (const f of sourceFiles(srcDir)) {
    const rel = relative(srcDir, f)
    if (/\.test\.tsx?$/.test(rel)) continue
    const lines = violationsIn(readFileSync(f, 'utf8'))
    if (!lines.length) continue
    if (rel in ALLOW) { allowedSeen.push(rel); continue }
    offenders.push({ rel, lines })
  }
  return { offenders, allowedSeen }
}
