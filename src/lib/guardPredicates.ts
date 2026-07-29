/**
 * ПРЕДИКАТЫ ГАРДОВ — вынесены из тестов, чтобы у каждого была НЕГАТИВНАЯ ПРОБА.
 *
 * ПОВОД (Николай, 29.07). Четыре гарда неделю объявляли «the build fails», не
 * будучи подключены к сборке: `tsc && vite build` не запускал vitest. Всё это
 * время мы говорили «блок защищён», а защищал его только тот, кто помнил
 * запустить тесты.
 *
 * Отсюда правило: **утверждение о МЕХАНИЗМЕ доказывается ПОПЫТКОЙ сделать
 * запрещённое, а не формулировкой.** «Сборка падает», «триггер блокирует»,
 * «политика защищает» — всё это заявления, пока никто не попробовал.
 *
 * Предикат, живущий отдельно от теста, позволяет ту же проверку прогнать по
 * заведомо ПЛОХОМУ образцу и увидеть, что она краснеет. Иначе гард, всегда
 * зелёный, в отчёте неотличим от исправного — та же болезнь, что у ворот,
 * закрытых всегда.
 */

// ── подпись: печатное имя не есть подпись ───────────────────────────────────
export const importsTypedRenderer = (src: string): boolean =>
  /from\s+['"][^'"]*typedSignature['"]/.test(src)

export const hasDrawTypeToggle = (src: string): boolean =>
  /'draw'\s*\|\s*'type'/.test(src)

export const emitsTypedMethod = (src: string): boolean =>
  /method:\s*'typed'/.test(src)

export const showsScriptFaces = (src: string): boolean =>
  /SIG_FACES|renderTypedSignature/.test(src)

// ── полка образцов подписи: обе поверхности выключены ───────────────────────
export const declaredSampleScope = (kitSrc: string): string | null =>
  kitSrc.match(/var\s+SAMPLE_SCOPE\s*=\s*'([a-z]+)'/)?.[1] ?? null

// ── провод происхождения ────────────────────────────────────────────────────
export const sendsBareRegistryVersion = (src: string): boolean =>
  /p_form_version:\s*version\b/.test(src)

export const usesDeclaredVersion = (src: string): boolean =>
  /function\s+declaredVersion\s*\(/.test(src) && /p_form_version:\s*declaredVersion\(/.test(src)

export const marksRegistryFallback = (src: string): boolean =>
  /'registry:'/.test(src)

export const declaresLiveOrigin = (src: string): boolean =>
  /p_record_origin:\s*'live'/.test(src)

export const putsManualEntryInFormVersion = (src: string): boolean =>
  /p_form_version:\s*'manual_entry'/.test(src)

// ── пол версии кита ─────────────────────────────────────────────────────────
/** Все включения кита ниже пола. */
export const kitIncludesBelow = (src: string, floor: number): string[] =>
  [...src.matchAll(/form-kit\.js\?v=(\d+)/g)]
    .map(m => m[1])
    .filter(v => Number(v) < floor)

/** Включение без ?v= вовсе — кэш навсегда, та же беда в другой одежде. */
export const hasBareKitInclude = (src: string): boolean =>
  /src=["'][^"']*form-kit\.js["']/.test(src)
