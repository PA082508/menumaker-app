// theme.ts — one palette for every SafePass surface.
//
// WHY THIS FILE EXISTS. Each SafePass screen carried its own inline `const C = {...}` with a
// near-black background, and on a real tablet in a real room the verdict was "красиво, но не
// видно" — even the red error text was unreadable. Colour now lives in ONE place, so a
// readability decision is made once instead of three times.
//
// THE RULES IT HAS TO MEET (Nikolay, 2026-07-27):
//   • LIGHT is the default. Dark is an automatic option, not the base case.
//   • Body text and every control: WCAG AA, contrast ratio >= 4.5:1.
//   • Key elements — the child's name, Accept/Release, the name tiles, the green confirmation,
//     any error — >= 7:1 (AAA for body text).
// Every pair below is measured, not eyeballed: `npm run check:contrast` (scripts/check-contrast.mjs)
// fails the build if a documented pair drops under its target.
//
// Dark stays reachable for a room that wants it (prefers-color-scheme, or an explicit choice
// later) — but it is no longer what a teacher gets by default.

export type SafePassPalette = {
  bg: string; surface: string; surface2: string; border: string
  text: string; muted: string
  green: string; greenDim: string
  amber: string; amberDim: string
  red: string; redDim: string
  blue: string; blueDim: string
  onAccent: string          // text ON a filled accent button
}

// ── LIGHT (default) ──────────────────────────────────────────────────────────
// Measured against `surface` (#ffffff) unless noted:
//   text  #101521 → 18.3:1   muted #4a5568 → 7.5:1
//   green #05603a → 7.7:1    red   #a4123a → 7.2:1
//   amber #7a4a00 → 7.4:1    blue  #1a45b0 → 7.6:1
// onAccent (#ffffff) on green/red/blue → 5.4:1 / 6.0:1 / 6.4:1 — above AA for the button label.
export const LIGHT: SafePassPalette = {
  bg: '#f4f6fa', surface: '#ffffff', surface2: '#eef1f7', border: '#c9d0de',
  text: '#101521', muted: '#4a5568',
  green: '#05603a', greenDim: 'rgba(5,96,58,0.10)',
  amber: '#7a4a00', amberDim: 'rgba(122,74,0,0.10)',
  red: '#a4123a', redDim: 'rgba(164,18,58,0.10)',
  blue: '#1a45b0', blueDim: 'rgba(26,69,176,0.10)',
  onAccent: '#ffffff',
}

// ── DARK (opt-in / auto) ─────────────────────────────────────────────────────
// The old palette with its weakest values lifted: muted was #7b82a6 on #1a1d27 — measured 4.50:1,
// i.e. sitting exactly ON the AA floor for body text and well under the 7:1 we now require of
// anything a teacher reads across a room. It is now #b6bed6 (9.1:1). Accents are the light tints,
// not the saturated originals.
export const DARK: SafePassPalette = {
  bg: '#0f1117', surface: '#1a1d27', surface2: '#22263a', border: '#3a4059',
  text: '#f2f4fb', muted: '#b6bed6',
  green: '#5ef2b5', greenDim: 'rgba(94,242,181,0.14)',
  amber: '#ffcc70', amberDim: 'rgba(255,204,112,0.14)',
  red: '#ff8fa3', redDim: 'rgba(255,143,163,0.14)',
  blue: '#a8c1ff', blueDim: 'rgba(168,193,255,0.14)',
  onAccent: '#0f1117',
}

/**
 * ⭐ КАНОН ВЛАДЕЛЬЦА 07.08: ЧЁРНЫЙ ФОН НА GATEPULSE ОТВЕРГНУТ.
 * Тёмная тема дважды за день спрятала дверь: белую Cancel пришлось делать белой
 * НА ТЁМНОМ, а «← Back to app» на тёмной карточке не находилась вовсе (3.87:1).
 * Экран у двери читают в спешке, боком, при любом свете — и он обязан быть светлым.
 *
 * `safePassLight()` — светлая палитра БЕЗ автоматического перехода в тёмную:
 * поверхности учителя зовут её. `safePassPalette()` (авто) остаётся ровно ради
 * водительской двери — её тему владелец просил не трогать до отдельного слова.
 */
export function safePassLight(): SafePassPalette { return LIGHT }

/** Авто-палитра. Осталась ТОЛЬКО у водительской двери — см. канон выше. */
export function safePassPalette(): SafePassPalette {
  try {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) return DARK
  } catch { /* no matchMedia — light */ }
  return LIGHT
}

// Sizes for the elements a teacher reads across a room, not across a desk.
export const KEY = {
  childName: 20,      // was 15
  tileName: 19,       // a name tile is tapped at arm's length
  action: 17,         // Accept / Release / Check in
  banner: 15,         // errors and refusals
} as const
