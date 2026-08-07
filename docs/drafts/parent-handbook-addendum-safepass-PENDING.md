---
title: Parent Handbook Addendum — SafePass (v3) — ЖДЁТ ТЕКСТА
status: BLOCKED. Пятый документ пакета 07.08 НЕ опубликован — дословный текст до
        исполнителя не дошёл. Ни реестровой записи, ни карточки Doc Hub, ни файла на
        витрине нарочно нет: заглушка в библиотеке читается как готовый документ.
owner_said: «текст выдан дословно (EN, handbook-стиль)… Текст не менять»
blocks: публикацию print-версии рядом с parent-guide и родительским письмом
---

# Что заказано (блок 07.08 + консолидированный блок №7)

**Пятый документ пакета ознакомления.** Print-версия в Doc Hub рядом с `gatepulse-parent-guide`
и родительским письмом. **В ack-страницу учителей НЕ входит** — документ родительский.
В рассылку родителям — приложением, по слову владельца.

Поля: `{DATE}` = **Monday, August 10** · `{LINK}` = общая ссылка активации Ridge
(`https://menumaker-app.vercel.app/safepass/parent?center=4aed7d5a-00d0-4a4c-ac99-311046ad2027`).

Разделы (порядок владельца):

1. назначение;
2. регистрация с фото;
3. ежедневное использование;
4. authorized pickup с поощрением ≥2 взрослых;
5. photo-ID без смартфона;
6. добровольность э-подписи и приватность фото / Revoke;
7. юр-основание OAC 5180:2-12-09 / -18 с точным временем передач;
8. вопросы директору.

# Что уже пришло дословно — один абзац из v3

Консолидированный блок №7 выдал **дословно** только замену абзаца «Adults without a smartphone»
(она заменяет «director will arrange» из v2; остальной v2-текст объявлен в силе):

> An authorized adult who does not use a smartphone — a grandparent, for example — receives a
> permanent personal QR code, printed as a card or saved as a picture on any phone. At pick-up,
> the teacher scans the code, sees that adult's photo, and confirms face to face — the same check
> as for everyone else. The code is personal, can be replaced at any time, and is deactivated
> immediately if lost. For a one-time pickup by someone new, speak with the director — a one-time
> authorization will be arranged.

# Чего не хватает

**Самого текста v2**, поверх которого этот абзац — правка. Заказ говорит «остальной v2-текст в
силе», но v2 в репозитории нет: `docs/` и `forms/3-library` содержат `ParentHandbook_*_v1.pdf`
(43 стр., редакция 1/1/2025) и **никакого** аддендума SafePass ни одной версии.

Сочинять его по списку разделов **нельзя**: заказ говорит «Текст не менять», то есть текст
существует. Сочинённый и опубликованный как ратифицированный — это подделка документа, который
семьи читают как политику центра.

# Что произойдёт, когда текст придёт

Одна вставка и три записи, одним коммитом:

1. `forms/1-data-sources/SafePass_Parent_Addendum_Ridge_v1.html` на витрине —
   тот же каркас, что `SafePass_Parent_Letter_Ridge_v1.html` (read-only, без подписи, {LINK} + QR);
2. реестр, **оба зеркала**: ключ `safepass_parent_addendum_ridge`, `kind: keep`,
   `audience: parent`;
3. карточка Doc Hub рядом с `safepass-parent-letter`, через `letterUrl('ridge', …)`;
4. строка в `docs/CHANGELOG.md`.

Абзац про QR из блока №7 — **уже дословный**, вставляется как есть.

См. [`../specs/2026-08-07-letter-ack-package.md`](../specs/2026-08-07-letter-ack-package.md).
