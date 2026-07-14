# CHANGELOG

**Rule (in force from 2026-07-14):** every deploy / merge = one line here.
Format: `YYYY-MM-DD · <marker> · <what improved, in plain human language>`.
Markers: 🚀 deploy · 🔀 merge · 🔧 fix · 🏳️ flip · 🗄️ migration.
No exceptions. Weekly digest (maintainer skill) rolls the last 7 days into a
"what got better" note for directors/marketing.

---

<!-- newest on top -->

- 2026-07-14 · 🚀 · Sign once, reuse everywhere: after a family signs the Parent Consent, every other packet form shows a "✍️ Внести подпись" button that stamps that same signature in one tap — no more re-drawing it on each form. Drawing or typing by hand still works if they'd rather. (Signature stays on the device for the session; nothing new is stored server-side yet.)

- 2026-07-14 · 🚀 · Enrollment packets (Toddler/Preschool & Infant) now include the family's "keep" documents — Center Parent Information (Ohio Appendix 5101:2-12-07) and Building For the Future — as Download/Print cards, plus placeholders for WIC info, the Registration Start Form and the Parents Book. Every card shows its type at a glance (Fill & sign · Keep for your records · Director provides), and the packet page now checks off each form with a ✓ as families finish it. (No existing form versions changed.)

- 2026-07-14 · 🔧 · Parent Consent & USDA Waiver: fixed a stale-cache issue where some devices/browsers kept showing an older copy of these two forms as plain text (no Submit/signature). The storefront now points at fresh filenames so families always get the current, fully-working form. (Old links still resolve.)

- 2026-07-14 · 🚀 · Parent forms polish: the enrollment form now has a printed parent/guardian name line under the signature; a stray tap no longer counts as a signature; signature/expiry dates use your local date (no more next-day rollover on evening submits); a form that can't load inside the app now offers "Open in browser" instead of a dead end; and every parent form now shows a "didn't load fully — tap to reload" banner if its scripts are blocked, so it never silently shows as plain text. (No form versions changed.)
