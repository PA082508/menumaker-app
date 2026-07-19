---
title: SafePass — Parent Letter (Wickliffe) v2 — DRAFT
status: DRAFT. Публикация ТОЛЬКО по слову Николая. Ждёт одного — ДАТ.
based_on: v1 от 1 июля 2026 (полный текст получен 18.07). Это НАСТОЯЩЕЕ слияние;
          предыдущая редакция писалась вслепую и заменена целиком.
target: Pages-репо (не Drive) + карточка Hub одним заходом, анонимный curl-чек
---

# Карта правок против v1

| # | v1 | v2 | почему |
|---|---|---|---|
| 1 | July 1–14 / mandatory July 15 | **20–26 июля / с 27-го** | даты прошли; 20-е — внутренняя репетиция, родителей касается 27-е. **ЖДЁТ СЛОВА** |
| 2 | «Play Academy Mayfield Hills» | **Highland Heights** | подтверждено Николаем |
| 3 | «phone number is verified by SMS» | **confirmation code from Play Academy** | SMS-провайдера нет; вход по коду директора (`safepass_temp_codes`) |
| 4 | «works ONLY on devices registered and authorized by administration» *(в родительской секции)* | ось **само-регистрации** | канон 18.07. Фраза остаётся только там, где она про **сотрудников** — BYOD |
| 5 | Late Care: 15 / 30 / 45 + «система не даёт закрыть смену» | **операционная формулировка без таймеров** | измерено: `onEscalate` — всплывающая подсказка, ни звонка, ни записи; `🔒 Cannot close shift` — текстовый бейдж, ничего не блокирует |
| 6 | School-Age Transportation + GPS | **секция удалена целиком** | геолокации в коде нет |
| 7 | Field Trips and Special Activities | **секция удалена целиком** | не найдено в коде вовсе |
| 8 | «a legal record available to you at any time» | смягчено до фактического | журнал есть; append-only и именных отказов — нет |
| 9 | Early Care | **дословно, минус одна фраза** | текст = точное описание (а)-режима. Удалено: «Our system automatically routes your notification to the duty teacher on shift» — авто-роутинга нет: `duty_teacher_id` никем не пишется, `dutyChildren` не наполняется, маршрутизации уведомлений в коде не существует. Остальное слово в слово |
| 10 | Authorized Persons через директора | **сохранено**, уточнена граница с телефоном | `trusted_persons` — работает |

**Принцип отбора:** обещание без кода не уходит под «Coming next» — оно **не
пишется**. Родителю обещание с оговоркой читается как обещание.

---

# SafePass — Parent Letter (Wickliffe) v2

**Play Academy Wickliffe** · Wickliffe, Ohio
**Date:** _____ · **To:** Play Academy Wickliffe Families
**From:** Play Academy Wickliffe Administration
**Re:** SafePass — New Child Safety System — Pilot Program

Dear Play Academy Wickliffe Families,

The safety of your child is at the heart of everything we do at Play Academy
Wickliffe. We are proud to introduce **SafePass** — our new digital child safety
system — exclusively at our Wickliffe location.

Play Academy Wickliffe is the first center to launch this initiative. Your
participation and feedback will shape how we bring SafePass to Play Academy
Parma Heights and Play Academy Highland Heights.

## Timeline

> ⚠️ **ЖДЁТ СЛОВА НИКОЛАЯ.** Предложение: регистрация **20–26 июля**,
> обязательное использование **с 27 июля**. Без подтверждения не публикуется.

- **July 20–26, 2026:** Registration period. Set up the app and register your
  phone. Families who register early may begin practicing immediately.
- **July 27, 2026:** SafePass is mandatory for all pilot families for every
  drop-off and pick-up.

## How SafePass Works — Your Child is Protected at Every Moment

SafePass is built on one principle: your child is always in the documented,
accountable care of a named Play Academy staff member. From the moment you drop
off your child to the moment you pick them up, the system tracks every transfer
of responsibility.

**Morning Drop-Off**

- You arrive and open the Play Academy app on your registered smartphone
- Tap **Drop Off** and select your child
- If your child arrives before their classroom teacher — they are received by
  our Early Care duty staff
- When the classroom teacher arrives, they formally accept your child's group
- You receive confirmation at every step

**Afternoon Pick-Up**

- Open the app and tap **Pick Up**
- Your teacher is notified and prepares your child
- Your child is released only to you or your registered authorized person
- You both receive confirmation

## Early Care — Before Class Begins

Children who arrive before their classroom teacher begins their shift are
received by our Early Care duty staff. When your child's classroom teacher
arrives, they formally accept the class. You always receive confirmation that
your child is in safe hands.

## Late Care — If You Are Running Late

If you are delayed at pick-up, your child remains under the care of our **Late
Care duty staff** — a named member of our team who is responsible for your child
until you arrive. We will call you if we have not heard from you, and we will
keep you informed.

Your child is never left without a named, responsible staff member.

## How We Protect Your Child — Security You Can Trust

**Private by Design.** The Play Academy app is **NOT available in the App Store
or Google Play**. It can only be opened through a **personal invitation link**
sent directly to you by Play Academy Wickliffe.

**Your Phone is Your Key.** You register your own phone: open your personal
invitation link on the phone you use every day and enter the **confirmation
code** we give you at Play Academy. That phone becomes your trusted device —
nothing else to install, and no one else needs to handle your phone.

**Changing your phone?** Open the same personal link on the new one and register
again. The old device loses access.

**Lost your phone?** Tell us right away and we will revoke that device
immediately. Then register the new one with the same link.

**Unregistered Contacts are Flagged Immediately.** If anyone attempts to pick up
your child from an unregistered phone, your teacher receives an immediate alert.
Your child is **NOT** released until our director confirms authorization.

**Every Transfer is Recorded.** Every drop-off, pick-up, and staff transfer is
digitally timestamped and stored securely.

## Authorized Persons

If someone other than a parent will drop off or pick up your child, please
register their name and phone number **with Director Sonia Texidor**. Only
registered phone numbers are recognized by SafePass.

Who may collect your child is decided by you and recorded by our director — it
is separate from registering your own phone, and it stays under our control
rather than an app's.

*Please note: for the safety of your child, teachers may request a photo ID from
any authorized person they do not personally recognize.*

## Our Staff and Their Devices

Our teachers use **classroom iPads** as their primary SafePass device. On the
playground and during outdoor activities, teachers may use their personal
registered smartphone to ensure uninterrupted safety coverage for your child.
**All staff devices are registered and authorized by Play Academy
administration.** Teacher smartphone use is governed by our BYOD Policy
HR-BYOD-001.

## What You Need to Do

- Open the Play Academy app using your **personal invitation link** (sent
  separately)
- Enter the **confirmation code** we give you
- Confirm your registration with Director Sonia Texidor
- Register any authorized persons — name and phone number — with the director
- Practice the app before the mandatory date — early registrants may begin right
  away

Upon successful completion of this pilot, SafePass will be introduced at Play
Academy Parma Heights and Play Academy Highland Heights.

Thank you for your trust. SafePass is our commitment that your child's safety is
protected at every moment of every day.

Questions? Please contact **Director Sonia Texidor** at Play Academy Wickliffe.

Warmly,
**Play Academy Wickliffe Administration**
Wickliffe, Ohio

---

# Чек-лист публикации

- [ ] **даты подтверждены Николаем** ← единственный блокер
- [ ] публикация в **Pages-репо**, не Drive
- [ ] запись в реестре с версией + history-запись тем же заходом
- [ ] ссылка проверена **анонимным** curl → 200
- [ ] карточка Hub `safepass-parent-letter`: ссылка **и описание** обновлены тем
      же заходом — описание сейчас обещает «Registration July 1–14, mandatory
      July 15», витрина и файл не должны разъехаться
