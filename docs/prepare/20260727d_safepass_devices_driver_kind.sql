-- 20260727d_safepass_devices_driver_kind.sql
-- PREPARE — НЕ ПРИМЕНЕНО. Ждёт отдельного go Николая. Шаг (г) хода 2-Т.
--
-- ── ЗАЧЕМ
-- Вход водителя решено делать РЕЛЬСОМ device + PIN (не staff-логином): у `staff` нет `user_id`,
-- поэтому staff-логин потребовал бы заводить каждому водителю аккаунт auth.users с паролем и его
-- сбросами — ровно та стена, из-за которой мы не дали пароли родителям. Рельс device+PIN уже
-- построен, применён и ДОКАЗАН живым чек-ином 27.07 (ход 1 закрыт).
--
-- ── ЧТО МЕШАЕТ (измерено 27.07)
-- safepass_devices.classroom_id — NOT NULL. У телефона водителя комнаты нет и не будет.
-- Это единственный кусок хода 2-Т, которого не было в проектировании.
--
-- ── ЧТО ДЕЛАЕМ, И ЧЕГО НЕ ОСЛАБЛЯЕМ
-- Снимаем NOT NULL, но НЕ разрешаем классному паду остаться без комнаты: вводится device_kind,
-- и условный CHECK требует комнату у 'classroom'-устройств. То есть ограничение не снимается,
-- а становится ТОЧНЫМ: комната обязательна там, где она есть по смыслу.

begin;

-- (1) Тип устройства. Существующие две записи — классные пады, дефолт им и достаётся.
alter table menumaker.safepass_devices
  add column if not exists device_kind text not null default 'classroom';

alter table menumaker.safepass_devices
  drop constraint if exists safepass_devices_kind_check;
alter table menumaker.safepass_devices
  add constraint safepass_devices_kind_check
  check (device_kind = any (array['classroom', 'driver']));

-- (2) Комната перестаёт быть обязательной ДЛЯ ВСЕХ...
alter table menumaker.safepass_devices
  alter column classroom_id drop not null;

-- (3) ...и остаётся обязательной ДЛЯ КЛАССНЫХ. Запрет не ослаблен, он уточнён.
alter table menumaker.safepass_devices
  drop constraint if exists safepass_devices_classroom_required;
alter table menumaker.safepass_devices
  add constraint safepass_devices_classroom_required
  check (device_kind <> 'classroom' or classroom_id is not null);

commit;

-- ── ЧТО ЭТО НЕ ЛОМАЕТ (проверено чтением тел функций)
--  • safepass_staff_check_in: при устройстве без комнаты и без p_classroom поднимает
--    'no classroom' — верное поведение: у водительского телефона своей комнаты нет, а выбор
--    комнаты живёт только на устройствах без своей комнаты (правило чеклиста 27.07).
--  • safepass_device_context / safepass_confirm_handoff: обращаются к классным падам, у которых
--    classroom_id по-прежнему обязателен по (3).
--  • Существующие 2 устройства Ridge получают device_kind='classroom' дефолтом, их classroom_id
--    на месте — CHECK (3) для них истинен.
--
-- ── READ-BACK (сразу после apply)
--  R1. device_kind существует, default 'classroom', CHECK из двух значений.
--  R2. classroom_id стал nullable.
--  R3. CHECK safepass_devices_classroom_required на месте.
--  R4. Обе существующие записи: device_kind='classroom', classroom_id не пуст → 2 строки валидны.
--  R5. Проба (в откате): вставка driver-устройства без комнаты проходит; вставка classroom-
--      устройства без комнаты ОТБИВАЕТСЯ.
