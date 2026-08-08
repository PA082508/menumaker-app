// src/pages/meal-count/MealCountPage.tsx
// MenuMaker · Meal Count (A) — single role-aware screen.
//
// Tabs by role (most-privileged role wins — see useAuth):
//   cook                  -> Current Meal + Week View
//   director              -> Director
//   admin / office_manager-> all three
//
// Roster + Milk/oz/diet come ONLY from v_meal_grid (raw `roster` is empty under
// cook/director RLS). Checkboxes live in meal_week_records keyed by
// classroom_id + monday_date. TOTAL MILK (cups) per column = ceil(Σ oz checked / 8).
// Director approval (director_initials) is shown only to director/admin.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useOrg } from "@/contexts/OrgContext";
import Avatar from "@/components/Avatar";
import { format, startOfWeek, addDays, isWeekend } from "date-fns";
import { displayChildName } from "@/lib/childName";
import { enqueueMark, cellKey } from "@/lib/mealMarkQueue";
import { weekRowKey, indexWeekRecords } from "@/lib/weekRowKey";
import { useMealRitual } from "@/hooks/useMealRitual";
import { hhmm, isRitualClockOverridden, ritualDay, ritualMinutes } from "@/lib/ritualClock";
import { DEFAULT_VARIANT, isChimeVariant, phraseFor, type ChimeVariantKey } from "@/lib/mealChime";
import type { BannerState, MealWindow, ScheduleRow, UnbuckledWindow, SlotLock } from "@/lib/mealWindows";
import { buildWindows, slotLock, lockLine } from "@/lib/mealWindows";
import { useMealMarkQueue } from "@/hooks/useMealMarkQueue";
import { weekFocus } from "@/lib/weekFocus";
import { centerOfficialName } from "@/lib/centerLabels";
import MuteToggle from "@/components/sound/MuteToggle";
import ExpectedCountsTile from "@/components/meal-count/ExpectedCountsTile";
import { mutedSinceHHMM, muteNoteLine } from "@/lib/soundMute";
import { speakLine } from "@/lib/soundKit";
import { directorAlertRow, spokenMarkRefusal, changeRequestRow } from "@/lib/spokenLines";
import { DIRECTOR_ALERT_AFTER_MIN } from "@/lib/mealWindows";

// ─── Types ───────────────────────────────────────────────────────────────────

type SlotKey = "breakfast" | "am_snack" | "lunch" | "supper";
type DayKey = "mon" | "tue" | "wed" | "thu" | "fri";
type Mode = "current" | "week" | "director";

interface Child {
  roster_id: string;
  child_name: string;
  first_name: string | null;
  last_name: string | null;
  birthday: string | null;
  classroom_id: string;
  center_id: string;
  milk_label: string | null;
  oz: number | null;
  allergies: string | null;
  age_group_food: string | null;
  is_active: boolean;
  photo_url?: string | null;
}

interface Classroom {
  id: string;
  class_key: string;
  name: string;
  sort_order: number;
  center_id?: string;
  is_roster?: boolean;
  org_id?: string;
  /** Комната перешла на именные отметки через App учителя → у неё работает замок. */
  app_marks?: boolean;
}

interface MealCountSettings {
  active_slots: SlotKey[];
  milk_slots: SlotKey[];
}

interface WeekRecord {
  id: string;
  child_name: string;
  /** Идентичность строки недели. Имя рядом — подпись, см. lib/weekRowKey.ts. */
  roster_id?: string | null;
  status?: string;
  director_initials?: string;
  director_signed_at?: string;
  [key: string]: string | number | null | undefined;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SLOT_LABELS: Record<SlotKey, string> = {
  breakfast: "Breakfast", am_snack: "AM Snack", lunch: "Lunch", supper: "Supper",
};
const SLOT_COL: Record<SlotKey, string> = {
  breakfast: "b", am_snack: "as", lunch: "l", supper: "su",
};
const SLOT_TYPE: Record<SlotKey, "meal" | "snack"> = {
  breakfast: "meal", am_snack: "snack", lunch: "meal", supper: "meal",
};
const SLOT_PRIORITY: Record<SlotKey, number> = {
  breakfast: 1, am_snack: 2, lunch: 3, supper: 4,
};
const DAY_LABELS: Record<DayKey, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri",
};
const DAYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri"];

const AGE_LABEL: Record<string, string> = {
  infant_0_5m: "0-5m", infant_6_11m: "6-11m",
  "1y": "1yr", "2y": "2yr", "3_5": "3-5y", "6_12": "6-12y",
};

// ─── Role → available tabs ─────────────────────────────────────────────────────

// Tab visibility is the UNION of what every one of the user's roles unlocks —
// NOT just the single most-privileged role. A cook+director sees all three.
//   cook              -> Current Meal + Week View
//   director          -> Director
//   admin / office_mgr -> all three
function modesForRoles(roleSet: Set<string>): Mode[] {
  if (roleSet.has("admin") || roleSet.has("office_manager")) return ["current", "week", "director"];
  const modes = new Set<Mode>();
  if (roleSet.has("cook")) { modes.add("current"); modes.add("week"); }
  if (roleSet.has("director")) { modes.add("director"); }
  // Canonical order; fall back to the read-only-ish base tabs if no known role.
  const ordered = (["current", "week", "director"] as Mode[]).filter((m) => modes.has(m));
  return ordered.length ? ordered : ["current", "week"];
}

// ─── Door split (concurrent-user safety) ────────────────────────────────────────
// Cook and director are concurrent users on different devices; a single screen
// with a Director tab meant one person's tab blocked the other. The module is now
// mounted at two routes, each a separate "door":
//   variant="kitchen"  (/meal-count)          → cook/admin: Current Meal + Week View
//   variant="director" (/meal-count-director) → director/office_manager/admin: Director
// The role gate (modesForRoles) still applies; the variant simply intersects it so
// each door exposes only its own tabs — even admin (who holds every role) sees a
// clean single-purpose screen per door.
//   variant="teacher"  (вкладка «Питание» в App учителя /teacher) → ОДНА комната,
//                      ОДИН день, без справочных панелей — см. ниже.
export type Variant = "kitchen" | "director" | "teacher";
const VARIANT_MODES: Record<Variant, Mode[]> = {
  kitchen:  ["current", "week"],
  director: ["director"],
  teacher:  ["current"],
};
const VARIANT_TITLE: Record<Variant, string> = {
  kitchen:  "Meal Count — Kitchen",
  director: "Meal Count — Director",
  teacher:  "Meals",
};

// ─── Учительский вид (слово владельца 08.08) ──────────────────────────────────
// Кухонно-директорский экран показывает ЦЕНТР: табы всех комнат, всю неделю,
// прогноз порций и красный список чужих окон. Учителю за планшетом группы всё
// это — чужая работа: он отвечает за СВОЮ комнату СЕГОДНЯ, и каждая лишняя
// панель отодвигает вниз единственное, ради чего он открыл вкладку.
//
// Это НЕ второй экран и НЕ второй вычислитель: те же данные, тот же `toggle`,
// та же очередь отметок, тот же ритуал. Разница — только в том, что показано.
// Кухонная и директорская двери не тронуты.
const TEACHER_VIEW = (v?: Variant) => v === "teacher";

// Default landing tab uses the single most-privileged role.
function defaultMode(topRole: string | null, available: Mode[]): Mode {
  const pick = (m: Mode): Mode => (available.includes(m) ? m : available[0]);
  if (topRole === "admin" || topRole === "office_manager") return pick("current");
  if (topRole === "director") return pick("director");
  if (topRole === "cook") return pick("current");
  return available[0];
}

// ─── CACFP reimbursement (max 2 meals + 1 snack, or 1 meal + 2 snacks) ──────────

function reimbursableSlots(checked: SlotKey[]): Set<SlotKey> {
  if (!checked.length) return new Set();
  const meals = checked.filter((s) => SLOT_TYPE[s] === "meal");
  const snacks = checked.filter((s) => SLOT_TYPE[s] === "snack");
  let maxMeals = 2, maxSnacks = 1;
  if (snacks.length > meals.length) { maxMeals = 1; maxSnacks = 2; }
  const keptMeals = [...meals].sort((a, b) => SLOT_PRIORITY[b] - SLOT_PRIORITY[a]).slice(0, maxMeals);
  const keptSnacks = [...snacks].sort((a, b) => SLOT_PRIORITY[b] - SLOT_PRIORITY[a]).slice(0, maxSnacks);
  return new Set([...keptMeals, ...keptSnacks]);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const colName = (day: DayKey, slot: SlotKey) => `${day}_${SLOT_COL[slot]}`;
const mondayOf = (d: Date) => startOfWeek(d, { weekStartsOn: 1 });
const ceilCups = (oz: number) => Math.ceil(oz / 8);

// Display name: canonical CACFP "Last First" via shared helper. NOTE: child_name remains
// the identity/join key into meal_week_records — only the label changes.
// ИДЕНТИЧНОСТЬ СТРОКИ НЕДЕЛИ. Экран индексирует строки по roster_id, а не по написанию
// имени: разное написание того же ребёнка — ОДНА строка, а не вторая. Работает в обеих
// схемах (ключ по имени сегодня, по roster_id после 20260731a) — см. lib/weekRowKey.ts.
const rowKeyOf = (c: { roster_id?: string | null; child_name: string }) =>
  weekRowKey(c.roster_id, c.child_name);

const displayName = (c: { last_name?: string | null; first_name?: string | null; child_name: string }) =>
  displayChildName(c);

interface MilkBucket { label: string; oz: number; }

// ─── Main component ───────────────────────────────────────────────────────────

export default function MealCountPage({ portalRoles, variant, roomId, roomName, centerId: pointCenterId, centerName: pointCenterName, personName }: {
  portalRoles?: string[];
  variant?: Variant;
  /** Учительский вид: комната PIN-сессии. Экран НЕ выбирает комнату сам. */
  roomId?: string;
  roomName?: string;
  /** Учительский вид: ЦЕНТР ТОЧКИ — из токена устройства, а не из логина. */
  centerId?: string;
  centerName?: string;
  /** Учительский вид: имя вошедшего по PIN — заявку директору подаёт ЧЕЛОВЕК. */
  personName?: string;
} = {}) {
  const teacherView = TEACHER_VIEW(variant);
  const { role, roles, user } = useAuth();
  const { currentCenter, orgRole, org, centers, isOrgAdmin } = useOrg();

  // ─── ГДЕ МЫ: источник места ОДИН — токен устройства ──────────────────────────
  // Живая сверка владельца 08.08 нашла шов: учительский вид брал КОМНАТУ из
  // токена, а ЦЕНТР — из логина служебной учётки, и на iPad с pearl-логином и
  // Ridge-токеном экран честно отказал: «"Red" is not an active children's room
  // in Play Academy Pearl». Отказ был правдив, но вопрос был неверный: место
  // человека решает ТОЧКА, у которой он стоит, а логин — только транспорт данных.
  // На школьном планшете (свой логин, свой центр) дефект молчал бы до первого
  // чужого входа — то есть до самого неудобного дня.
  //
  // Кухонная и директорская двери не тронуты: там центр приходит переключателем,
  // и это правильно — офисный браузер СМОТРИТ центры, планшет СТОИТ в одном.
  const centerId = (teacherView ? pointCenterId : currentCenter?.id) ?? undefined;
  // Имя центра НАРУЖУ — официальное, по городу: оно уходит в шапку, в выгрузку
  // для листа и в отказы, а рабочая кличка «Ridge» в документе — чужое имя
  // (канон владельца 08.08). У учительского вида имя уже переведено оболочкой.
  const centerName = (teacherView
    ? pointCenterName
    : (currentCenter ? centerOfficialName(currentCenter) : "")) ?? "";
  // Какие центры вообще кормят. Читается один раз; отказ НЕ глотается — пустой
  // набор здесь означал бы «вкладок нет» на ровном месте.
  const [mealSiteIds, setMealSiteIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!org?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.schema("menumaker").from("centers")
        .select("id, is_meal_site").eq("org_id", org.id).eq("is_meal_site", true);
      if (cancelled) return;
      if (error) { console.warn("[MealCount] meal sites:", error.message); return; }
      setMealSiteIds(new Set((data ?? []).map((c: { id: string }) => c.id)));
    })();
    return () => { cancelled = true; };
  }, [org?.id]);

  // Union of user_roles + admin from org bootstrap.
  const effectiveRoles = useMemo(() => {
    if (portalRoles?.length) return new Set<string>(portalRoles);
    const s = new Set<string>(roles);
    if (orgRole === "admin") s.add("admin");
    if (role) s.add(role);
    return s;
  }, [roles, orgRole, role, portalRoles]);

  // Role-unlocked modes, then intersected with this door's allowed modes.
  const roleModes = useMemo(() => modesForRoles(effectiveRoles), [effectiveRoles]);
  const availableModes = useMemo(() => {
    if (!variant) return roleModes;                       // portal / legacy: role-driven
    const allow = VARIANT_MODES[variant];
    return roleModes.filter((m) => allow.includes(m));
  }, [roleModes, variant]);
  const showApprove = effectiveRoles.has("director") || effectiveRoles.has("admin");

  const [mode, setMode] = useState<Mode>(() => availableModes[0] ?? "current");
  useEffect(() => {
    if (!availableModes.length) return;                   // no access on this door — leave as-is
    setMode(defaultMode(role, availableModes));
  }, [role, availableModes]);

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedClassName, setSelectedClassName] = useState("");
  const [settings, setSettings] = useState<MealCountSettings | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotKey>("breakfast");
  const [roster, setRoster] = useState<Child[]>([]);
  const [records, setRecords] = useState<Record<string, WeekRecord>>({});
  const [holidays, setHolidays] = useState<Record<string, { type: string; close_time: string | null }>>({});
  const [slotStart, setSlotStart] = useState<Record<string, string>>({});
  // «Пристегни ремни» — окна выбранного класса, окна всего центра, отметки центра
  // и выбранная мелодия. Всё, что ритуалу нужно знать снаружи себя.
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([]);
  const [centerSchedule, setCenterSchedule] = useState<(ScheduleRow & { classroomName: string })[]>([]);
  const [centerMarks, setCenterMarks] = useState<Record<string, boolean>>({});
  const [chimeVariant, setChimeVariant] = useState<ChimeVariantKey>(DEFAULT_VARIANT);
  // Какая неделя перед человеком — решает ОДИН вычислитель на всю платформу
  // (lib/weekFocus.ts, слово владельца 08.08): Пн–Пт текущая, Сб ещё прошедшая
  // (её закрывают и подписывают), Вс уже следующая. Здесь этого правила больше
  // НЕТ — раньше своя копия жила на каждой двери, и субботние копии разошлись.
  const focus = weekFocus();
  const [weekStart, setWeekStart] = useState<Date>(() => focus.weekStart);
  const [loading, setLoading] = useState(true);
  // Standard (platform-standards): a failed load must SHOUT, never render as empty.
  // This grid is the claim record — a silent empty kitchen reads as "no children today".
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Offline meal-count queue — badge count, error state, and per-cell "queued"
  // (unsynced) styling. Marks tapped without a network survive here until sync.
  const { pendingCount, hasError, lastError, isCellPending, syncNow } = useMealMarkQueue();
  // Отказ записи, показанный ЧЕЛОВЕКУ. Молчаливый откат галочки — худший из исходов:
  // повар видит, что отметка «сама снялась», и считает, что промахнулся сам.
  const [writeErr, setWriteErr] = useState<string | null>(null);

  // Служебность комнаты — по ПРИЗНАКУ `classrooms.is_roster`, а не по имени
  // (слово владельца 08.08). Признак замерен в базе 08.08: он есть, NOT NULL,
  // и у всех четырёх служебных комнат стоит false. Имя же — это надпись: комнату
  // переименуют, и подсчёт молча начнёт считать взрослых детьми.
  const isStaff = classrooms.find((c) => c.id === selectedClassId)?.is_roster === false;

  // Тот же вычислитель, что и неделя: в субботу день фокуса — пятница закрываемой
  // недели, в воскресенье — понедельник следующей.
  const todayDayKey = focus.day;
  const [selectedDay, setSelectedDay] = useState<DayKey>(todayDayKey);

  // День ритуала: в выходной — null, ритуала нет. На localhost его можно подменить
  // (?mm_clock=11:31&mm_day=mon) — иначе окно 11:30 проверялось бы только в 11:30.
  const ritualDayKey = ritualDay() as DayKey | null;

  // ─── Load classrooms + settings + holidays ────────────────────────────────
  useEffect(() => {
    // Meal Count is center-scoped. Never load without a concrete center, or the
    // query returns every center's classrooms mixed together (RLS lets admins
    // read the whole org). In Organization view we simply show nothing here.
    if (!centerId) {
      setClassrooms([]);
      setSelectedClassId("");
      setSelectedClassName("");
      return;
    }
    (async () => {
      const { data: cls } = await supabase
        .schema("menumaker").from("classrooms")
        .select("id,class_key,name,sort_order,center_id,org_id,is_roster,app_marks")
        .eq("is_active", true)
        .eq("center_id", centerId)
        .order("sort_order");
      // Exclude staff pseudo-classes (is_roster=false): adults mis-filed as
      // children must never appear in the child meal grid or flow into claim
      // records. Same is_roster!==false pattern as SiteClaimReport /
      // KitchenPlanningReport / CenterRosterPage (commit d728e26). Staff kitchen
      // consumption is shown separately in KitchenPlanningReport "Actual Dishes".
      const rosterCls = ((cls ?? []) as Classroom[]).filter((c) => c.is_roster !== false);
      if (rosterCls.length) {
        setClassrooms(rosterCls);
        // Учительский вид: комната приходит от PIN-сессии, экран её НЕ выбирает.
        // Если названной комнаты в центре нет (деактивирована, служебная, чужой
        // центр) — не подставляем первую попавшуюся: молчаливая подмена комнаты
        // означала бы отметки не тому классу. Пусто и сказано словами ниже.
        const seat = roomId ? rosterCls.find((c) => c.id === roomId) : rosterCls[0];
        setSelectedClassId(seat?.id ?? "");
        setSelectedClassName(seat?.name ?? "");
      } else {
        setClassrooms([]);
        setSelectedClassId("");
        setSelectedClassName("");
      }

      const { data: cfg } = await supabase
        .schema("menumaker").from("meal_count_settings")
        .select("active_slots,milk_slots").limit(1).single();
      if (cfg) setSettings(cfg as MealCountSettings);

      // Holidays for this center. The table is keyed by year/month/day (no date
      // column), so build a date→{type,close_time} map for this + next year.
      const yr = new Date().getFullYear();
      const { data: hols } = await supabase
        .schema("menumaker").from("holidays")
        .select("year, month, day, type, close_time")
        .eq("center_id", centerId)
        .in("year", [yr, yr + 1]);
      const hmap: Record<string, { type: string; close_time: string | null }> = {};
      for (const h of (hols ?? []) as { year: number; month: number; day: number; type: string; close_time: string | null }[]) {
        const key = `${h.year}-${String(h.month).padStart(2, "0")}-${String(h.day).padStart(2, "0")}`;
        hmap[key] = { type: h.type, close_time: h.close_time };
      }
      setHolidays(hmap);
    })();
    // roomId читается внутри: смена комнаты PIN-сессии обязана пересадить экран,
    // иначе учитель после «change room» отмечал бы прежнюю комнату.
  }, [centerId, roomId]);

  // Per-classroom slot start times (for short-day slot blocking) + the full window
  // rows the ritual needs (end_time, intake_mode). ОДИН запрос на оба дела: время
  // начала уже читалось здесь, и второй поход за теми же строками был бы данью
  // структуре кода, а не нуждой.
  useEffect(() => {
    if (!selectedClassId) { setSlotStart({}); setScheduleRows([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.schema("menumaker").from("meal_schedule")
        .select("slot, start_time, end_time, intake_mode").eq("classroom_id", selectedClassId);
      if (cancelled) return;
      const rows = (data ?? []) as ScheduleRow[];
      const m: Record<string, string> = {};
      for (const r of rows) if (r.start_time) m[r.slot] = r.start_time.slice(0, 5);
      setSlotStart(m);
      setScheduleRows(rows.map((r) => ({ ...r, classroom_id: selectedClassId })));
    })();
    return () => { cancelled = true; };
  }, [selectedClassId]);

  // ─── «Пристегни ремни»: расписание ВСЕГО центра + отметки всех классов ──────
  // Красный список к концу дня показывает центр целиком, а не только открытую
  // комнату: пропущенное окно чужого класса — это ровно то, что иначе всплывёт
  // через месяц, на сверке заявки.
  useEffect(() => {
    if (!classrooms.length) { setCenterSchedule([]); return; }
    let cancelled = false;
    (async () => {
      const ids = classrooms.map((c) => c.id);
      const { data, error } = await supabase.schema("menumaker").from("meal_schedule")
        .select("classroom_id, slot, start_time, end_time, intake_mode").in("classroom_id", ids);
      if (cancelled) return;
      // Отказ здесь = «окон нет» = пустой красный список, то есть тихое «всё хорошо»
      // поверх непроверенного. Пусть лучше список пуст и об этом сказано в консоли,
      // чем он молча выглядит как чистый день.
      if (error) { console.error("[ritual] centre schedule was not read", error.message); setCenterSchedule([]); return; }
      const byId = new Map(classrooms.map((c) => [c.id, c.name]));
      setCenterSchedule(((data ?? []) as ScheduleRow[]).map((r) => ({
        ...r, classroomName: byId.get(r.classroom_id ?? "") ?? "—",
      })));
    })();
    return () => { cancelled = true; };
  }, [classrooms]);

  // Отметки всех классов центра за сегодняшнюю колонку — источник «пристёгнут ли».
  // Обновляется раз в минуту: список к концу дня, минутная точность здесь избыточна.
  useEffect(() => {
    if (!classrooms.length || !ritualDayKey) { setCenterMarks({}); return; }
    let cancelled = false;
    const col = colName(ritualDayKey, "breakfast").split("_")[0];  // 'mon' и т.п.
    const load = async () => {
      const ids = classrooms.map((c) => c.id);
      const cols = (["breakfast", "am_snack", "lunch", "supper"] as SlotKey[])
        .map((s) => `${col}_${SLOT_COL[s]}`).join(",");
      const { data, error } = await supabase.schema("menumaker").from("meal_week_records")
        .select(`classroom_id,${cols}`)
        .in("classroom_id", ids).eq("monday_date", format(weekStart, "yyyy-MM-dd"));
      if (cancelled) return;
      if (error) { console.error("[ritual] centre marks were not read", error.message); return; }
      const acc: Record<string, boolean> = {};
      for (const r of (data ?? []) as Record<string, any>[]) {
        for (const s of ["breakfast", "am_snack", "lunch", "supper"] as SlotKey[]) {
          if (r[`${col}_${SLOT_COL[s]}`] === 1) acc[`${r.classroom_id}|${s}`] = true;
        }
      }
      setCenterMarks(acc);
    };
    void load();
    const t = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, [classrooms, weekStart, ritualDayKey]);

  // Мелодия центра. ОТДЕЛЬНЫМ запросом нарочно: колонка `chime_variant` появится
  // миграцией, а PostgREST на неизвестную колонку отбивает ВЕСЬ select — попроси
  // её вместе с active_slots, и до миграции экран остался бы без настроек вообще
  // (см. docs/platform-standards.md и правило «а view is NOT its table»).
  useEffect(() => {
    if (!centerId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.schema("menumaker").from("meal_count_settings")
        .select("chime_variant").eq("center_id", centerId).maybeSingle();
      if (cancelled) return;
      if (error) {
        // Колонка применена 03.08 (20260802c), но отдельный запрос оставлен: если он
        // всё же откажет (сеть, права), экран звонит голосом по умолчанию и работает
        // дальше. Запасного пути через localStorage больше нет — выбор живёт в БД.
        setChimeVariant(DEFAULT_VARIANT);
        return;
      }
      const v = (data as { chime_variant?: string } | null)?.chime_variant;
      setChimeVariant(isChimeVariant(v) ? v : DEFAULT_VARIANT);
    })();
    return () => { cancelled = true; };
  }, [centerId]);

  // ─── Load roster (v_meal_grid) + records ──────────────────────────────────
  useEffect(() => {
    if (!selectedClassId) return;
    setLoading(true);
    (async () => {
      const cls = classrooms.find((c) => c.id === selectedClassId);
      const mon = format(weekStart, "yyyy-MM-dd");

      let gridQ = supabase
        .schema("menumaker").from("v_meal_grid")
        // photo_url is back: v_meal_grid carries it as of 20260716d. It was removed in
        // adb2454 because the view did NOT have it and asking made PostgREST reject the
        // WHOLE select — which rendered the kitchen as a class with no children. If this
        // column ever disappears from the view again, this select empties the grid, not
        // just the avatars: `error` is bound below and the red banner is the safety net.
        .select("roster_id,child_name,first_name,last_name,birthday,classroom_id,center_id,milk_label,oz,allergies,age_group_food,is_active,photo_url")
        .eq("classroom_id", selectedClassId)
        .eq("is_active", true);
      if (cls?.center_id) gridQ = gridQ.eq("center_id", cls.center_id);
      // CACFP standard: oldest children first → ORDER BY birthday ASC.
      const { data: kids, error: gridErr } = await gridQ
        .order("birthday", { ascending: true, nullsFirst: false })
        .order("last_name")
        .order("first_name");
      // A failed load must never render as "no children". This grid IS the claim
      // record — a silently empty kitchen looks like a day with no children in it.
      if (gridErr) {
        setLoadErr(gridErr.message);
        setRoster([]);
        setLoading(false);
        return;
      }
      setLoadErr(null);
      // v_meal_grid doesn't expose date_out, so filter departed children (date_out
      // < this week's Monday) via a companion query — defense in depth against a
      // stale is_active row being claimed. A mid-week leaver (date_out >= Monday)
      // stays for their valid days. See src/lib/childActive.ts.
      const { data: departed } = await supabase
        .schema("menumaker").from("roster")
        .select("id").eq("classroom_id", selectedClassId)
        .not("date_out", "is", null).lt("date_out", mon);
      const goneIds = new Set((departed ?? []).map((r: any) => r.id));
      const kidsHere = ((kids ?? []) as Child[]).filter((k) => !goneIds.has((k as any).roster_id));
      setRoster(kidsHere);

      const { data: recs } = await supabase
        .schema("menumaker").from("meal_week_records")
        .select("*").eq("classroom_id", selectedClassId).eq("monday_date", mon);
      setRecords(indexWeekRecords((recs ?? []) as WeekRecord[], kidsHere));
      setLoading(false);
    })();
  }, [selectedClassId, weekStart, classrooms]);

  // Тик часов для замка: 15 секунд, как у ритуала. Минута опоздания замка — это
  // минута, в которую можно переставить чужую отметку.
  const [nowMinTick, setNowMinTick] = useState(() => ritualMinutes());
  useEffect(() => {
    const t = setInterval(() => setNowMinTick(ritualMinutes()), 15000);
    return () => clearInterval(t);
  }, []);

  // ─── ЗАМОК ОТМЕТОК (заказ владельца 08.08) ─────────────────────────────────
  // Учительский вид: закрылось окно приёма (плюс льгота) — приём замыкается, и
  // повторный тап невозможен. Правит после этого директор под своим PIN со
  // штампом «amended» — до постройки той точки дорога правки остаётся
  // директорским видом, и он этим замком НЕ трогается.
  //
  // Арифметика — в lib/mealWindows (`slotLock`), рядом с окнами: второй счётчик
  // «закрылось ли окно» разошёлся бы с красным списком в первый же особый день.
  const windowBySlot = useMemo(() => {
    const m = new Map<string, MealWindow>();
    for (const w of buildWindows(scheduleRows)) m.set(w.slot, w);
    return m;
  }, [scheduleRows]);

  // Показанный день против сегодняшнего — в днях. Замыкает прошлое безусловно.
  const dayOffset = useMemo(() => {
    const shown = addDays(weekStart, DAYS.indexOf(selectedDay));
    const today = new Date();
    const d0 = new Date(shown.getFullYear(), shown.getMonth(), shown.getDate()).getTime();
    const d1 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    return Math.round((d0 - d1) / 86400000);
  }, [weekStart, selectedDay]);

  // Часы — те же, что у ритуала (ritualMinutes + тик), чтобы «окно закрылось» на
  // плашке и «замок встал» на галочках не расходились на минуту.
  // СКОУП ЗАМКА — ТОЛЬКО КОМНАТЫ, ПЕРЕШЕДШИЕ НА APP (уточнение владельца 08.08).
  // Остальные комнаты отмечает ПОВАР: пакетно, по доставке, задним числом внутри
  // дня. Замок там отнял бы работающий инструмент раньше, чем дал новый, — и
  // отнял бы молча, у людей, которые про App ещё не слышали.
  //
  // Носитель — `classrooms.app_marks`, признак НА КОМНАТЕ (миграция 20260808b):
  // раскатка идёт по комнатам, и признак обязан иметь ту же зернистость. По
  // умолчанию false — по умолчанию не замкнуто НИЧЕГО, каждая комната входит в
  // замок отдельным словом: `update … set app_marks = true where name = 'Blue'`,
  // без выкладки. Канон: замок следует за App.
  const roomOnApp = classrooms.find((c) => c.id === selectedClassId)?.app_marks === true;

  const lockOf = useCallback((slot: SlotKey): SlotLock => (
    teacherView && roomOnApp ? slotLock(windowBySlot.get(slot), nowMinTick, dayOffset) : { locked: false }
  ), [teacherView, roomOnApp, windowBySlot, nowMinTick, dayOffset]);

  // ─── ЗАЯВКА НА ПРАВКУ ЗАМКНУТОГО ПРИЁМА (уточнение владельца 08.08) ────────
  // Замок закрывает приём — но у человека остаётся дело: «я отметил не всех»,
  // «ребёнок доел после звонка». ТУПИК ЗДЕСЬ ХУЖЕ ОТКРЫТОЙ ГАЛОЧКИ: он учит
  // обходить систему. Поэтому у полосы замка стоит дверь — заявка директору тем
  // же рельсом (`internal_messages`), которым уже ходит тревога пустого окна.
  //
  // ОТБОЙ БЕЗ СПАМА: ключ живёт в localStorage и несёт день · комнату · приём,
  // поэтому переживает перезагрузку планшета (её на планшете группы делают по
  // десять раз на дню). Повторный тап не плодит дубли, а ГОВОРИТ, что заявка уже
  // ушла: молчание человек прочитал бы как «не отправилось», и он нажал бы ещё.
  const changeReqKey = useCallback((slot: SlotKey) =>
    `mm_change_req_${format(addDays(weekStart, DAYS.indexOf(selectedDay)), "yyyy-MM-dd")}_${selectedClassId}_${slot}`,
    [weekStart, selectedDay, selectedClassId]);

  const [changeReq, setChangeReq] = useState<{ kind: "sent" | "already" | "failed"; text: string } | null>(null);

  const requestChange = useCallback(async (slot: SlotKey, note: string) => {
    const key = changeReqKey(slot);
    let already = false;
    try { already = localStorage.getItem(key) === "1"; } catch { /* приватный режим — спросим сервер */ }
    if (already) {
      setChangeReq({ kind: "already", text: "Your director already has this request — no need to send it again." });
      return;
    }
    const dayLabel = format(addDays(weekStart, DAYS.indexOf(selectedDay)), "EEEE, MMM d");
    const row = changeRequestRow({
      personName: personName || "A teacher",
      className: selectedClassName,
      slotLabel: SLOT_LABELS[slot],
      dayLabel,
      note,
      orgId: org?.id,
      centerId: centerId ?? null,
      centerName,
      senderId: user?.id,
    });
    const { error } = await supabase.schema("menumaker").from("internal_messages").insert(row);
    // Тихо потерянный отказ здесь = человек уверен, что директора позвали, а его
    // не позвали, и приём так и останется неправленым.
    if (error) {
      setChangeReq({ kind: "failed", text: `The request did NOT reach your director: ${error.message}. Tell the office.` });
      return;
    }
    try { localStorage.setItem(key, "1"); } catch { /* не запомнили — переспросит сервер отказом дубля */ }
    setChangeReq({ kind: "sent", text: "Sent — your director has it, with the room, the meal and the day." });
  }, [changeReqKey, weekStart, selectedDay, selectedClassName, personName, org?.id, centerId, centerName, user?.id]);

  // ─── Toggle checkbox ──────────────────────────────────────────────────────
  // Every tap is optimistic + durably queued (IndexedDB). The queue drains to
  // menumaker.sync_meal_marks when online — so this one path works identically
  // whether there's WiFi or not, and a flaky/failed request never loses a mark
  // (it stays queued with the badge, unlike the old revert-on-error). The mark
  // carries marked_at = now = the CACFP point-of-service time.
  const toggle = useCallback(async (child: Child, day: DayKey, slot: SlotKey) => {
    // Замок стоит У ПИСАТЕЛЯ, а не только в вёрстке: правило, которое живёт
    // одной серой кнопкой, — не правило. Отказ ГОВОРИТ словами: молчаливое
    // «не реагирует» человек читает как поломку планшета.
    const lk = lockOf(slot);
    if (lk.locked) { setWriteErr(lockLine(lk, SLOT_LABELS[slot])); return; }
    const col = colName(day, slot);
    const rk = rowKeyOf(child);
    const existing = records[rk];
    const current = existing ? (existing[col] as number) : 0;
    const next: 0 | 1 = current ? 0 : 1;

    // Optimistic UI (preserve any existing id so director approve/re-sync work).
    setRecords((prev) => ({
      ...prev,
      [rk]: { ...(prev[rk] ?? { child_name: child.child_name, roster_id: child.roster_id }), [col]: next },
    }));

    try {
      await enqueueMark({
        center_id: child.center_id,
        classroom_id: selectedClassId,
        classroom: selectedClassName,
        roster_id: child.roster_id,
        child_name: child.child_name,
        monday_date: format(weekStart, "yyyy-MM-dd"),
        day, slot, col, value: next,
      });
    } catch (e) {
      // Сюда попадаем, только если недоступен сам IndexedDB. Откатываем клетку —
      // но НЕ молча: без слов человек решит, что промахнулся, и отметит ещё раз.
      setRecords((prev) => ({ ...prev, [rk]: { ...(prev[rk] ?? {}), [col]: current } }));
      setWriteErr(
        `Mark NOT saved — ${displayName(child)}, ${day} ${slot}. ` +
        `${e instanceof Error ? e.message : String(e)}. Mark it again; if it happens twice, tell the office.`,
      );
      // Голос ПОВЕРХ полосы отказа (карта звуков 04.08). Полоса красная и
      // подробная, но человек в этот момент смотрит на ребёнка, а не на планшет:
      // отказ, который только видно, на кухне пропускают. Вслух — коротко и тем
      // же языком, что полоса (интерфейс английский); подробности остаются написанными.
      speakLine(spokenMarkRefusal(displayName(child)));
    }
  }, [records, selectedClassId, selectedClassName, weekStart, lockOf]);

  // Is this grid cell still awaiting sync? (drives the "queued" styling.)
  const mondayStr = format(weekStart, "yyyy-MM-dd");
  const isQueued = useCallback(
    (child: { roster_id?: string | null; child_name: string }, col: string) =>
      isCellPending(cellKey(selectedClassId, rowKeyOf(child), mondayStr, col)),
    [isCellPending, selectedClassId, mondayStr],
  );

  // ─── «Пристегни ремни» ─────────────────────────────────────────────────────
  // Ритуал живёт только на СЕГОДНЯШНЕЙ неделе: листая архив, никто не должен
  // слышать звонок обеда и видеть отсчёт по неделе, которая давно прошла.
  const showsThisWeek = format(weekStart, "yyyy-MM-dd") === format(focus.weekStart, "yyyy-MM-dd");
  const ritualEnabled = ritualDayKey !== null && (showsThisWeek || isRitualClockOverridden());
  const ritualDateISO = ritualDayKey
    ? format(addDays(weekStart, DAYS.indexOf(ritualDayKey)), "yyyy-MM-dd")
    : format(weekStart, "yyyy-MM-dd");

  const isSlotMarked = useCallback((slot: string) => {
    if (!ritualDayKey) return false;
    const col = colName(ritualDayKey, slot as SlotKey);
    return roster.some((c) => records[rowKeyOf(c)]?.[col] === 1);
  }, [ritualDayKey, roster, records]);

  const isCenterSlotMarked = useCallback((classroomId: string, slot: string) => {
    // У ОТКРЫТОЙ комнаты правда живее в сетке: тап виден сразу, а сводка по центру
    // перечитывается раз в минуту. Иначе только что отмеченное окно на минуту
    // краснело бы у себя же на экране.
    if (classroomId === selectedClassId) return isSlotMarked(slot);
    return centerMarks[`${classroomId}|${slot}`] === true;
  }, [selectedClassId, isSlotMarked, centerMarks]);

  const openSlotFromRitual = useCallback((slot: string) => {
    setSelectedSlot(slot as SlotKey);
    if (ritualDayKey) setSelectedDay(ritualDayKey);
    // Табло само загорается — но только на кухонной двери. Директору, который
    // разбирает прошлую неделю, экран из-под рук не выдёргивают.
    if (variant !== "director" && availableModes.includes("current")) setMode("current");
  }, [ritualDayKey, variant, availableModes]);

  // ─── 15-я минута пустого окна: позвать директора ──────────────────────────
  // РЕЛЬС — internal_messages, и выбран он не за красоту: это единственный из
  // существующих каналов, который доходит от планшета до директора БЕЗ правки
  // базы. Политика записи `send_as_self` пропускает планшет (он вошёл настоящей
  // учёткой центра), политика чтения `can_see_message` доставляет строку роли
  // director этого центра. Строка durable: закрытая вкладка её не теряет, и
  // через месяц видно, звали ли директора и когда.
  //
  // Почему НЕ notification_log, который по смыслу ближе: у него RLS включена и
  // НОЛЬ политик — туда пишет только служебный ключ из edge-функции, а планшету
  // нужна новая политика, то есть правка боевой базы. Почему не одна лишь
  // плашка на Director Home: плашка живёт в памяти вкладки, а деньги — нет.
  const [alertNote, setAlertNote] = useState<string | null>(null);
  const sendDirectorAlert = useCallback(async (w: MealWindow) => {
    const className = classrooms.find((c) => c.id === (w.classroom_id ?? selectedClassId))?.name
      ?? selectedClassName;
    const row = directorAlertRow({
      className,
      slotLabel: SLOT_LABELS[w.slot as SlotKey] ?? w.slot,
      startedHHMM: hhmm(w.start),
      minutesIn: DIRECTOR_ALERT_AFTER_MIN,
      muteLine: muteNoteLine(mutedSinceHHMM()),
      orgId: org?.id,
      centerId: centerId ?? null,
      centerName,
      senderId: user?.id,
    });
    const { error } = await supabase.schema("menumaker").from("internal_messages").insert(row);
    // Тихо потерянный отказ здесь = комната уверена, что директора позвали, а его
    // не позвали. Ступень одноразовая, второй попытки не будет — значит сказать
    // надо сразу и на экране.
    if (error) setAlertNote(`The director was NOT told about ${className}: ${error.message}`);
    else setAlertNote(`Director notified: ${className} · ${SLOT_LABELS[w.slot as SlotKey] ?? w.slot} — no marks.`);
  }, [classrooms, selectedClassId, selectedClassName, org?.id, centerId, centerName, user?.id]);

  const ritual = useMealRitual({
    enabled: ritualEnabled,
    todayISO: ritualDateISO,
    classroomId: selectedClassId,
    rows: scheduleRows,
    centerRows: centerSchedule,
    isSlotMarked,
    isCenterSlotMarked,
    variant: chimeVariant,
    onOpenSlot: openSlotFromRitual,
    onDirectorAlert: sendDirectorAlert,
  });

  // iOS: звук оживает ТОЛЬКО внутри жеста. Ловим первое касание экрана за день —
  // любое, хоть по пустому месту, — и на нём разблокируем. До этого плашка
  // беззвучная и прямо об этом говорит.
  useEffect(() => {
    if (ritual.audioUnlocked) return;
    const h = () => ritual.unlock();
    window.addEventListener("pointerdown", h, { once: true });
    window.addEventListener("keydown", h, { once: true });
    return () => {
      window.removeEventListener("pointerdown", h);
      window.removeEventListener("keydown", h);
    };
  }, [ritual.audioUnlocked, ritual.unlock]);

  // ─── Director: approve week ───────────────────────────────────────────────
  const approveWeek = useCallback(async (initials: string, scanFile: File | null) => {
    const mon = format(weekStart, "yyyy-MM-dd");
    const now = new Date().toISOString();
    // Approve goes through the SERVER, which owns the rule: only a COMPLETED
    // week may be approved (week_end < the centre's local today). The client does
    // not decide it — a rule that lives only in the UI is not a rule. On 27.07 a
    // director approved the week on its Monday; the refusal below is what stops
    // a signature from certifying a week that is still running.
    const { error: approveErr } = await (supabase.schema("menumaker").rpc as any)("approve_meal_week", {
      p_center: centerId, p_classroom_id: selectedClassId, p_monday: mon,
      p_initials: initials, p_actor_name: initials,
    });
    if (approveErr) throw new Error(approveErr.message);
    if (scanFile) {
      const path = `${selectedClassId}/${mon}/${scanFile.name}`;
      // Скан посещаемости — доказательство к клеймовой неделе; голый await глотал
      // отказ целиком (найдено 29.07 расширением признака).
      const { error: upErr } = await supabase.storage.from("attendance-scans").upload(path, scanFile, { upsert: true });
      if (upErr) throw new Error(`Attendance scan was NOT attached: ${upErr.message}`);
      const cls = classrooms.find(c => c.id === selectedClassId);
      const { error: attErr } = await supabase.schema("menumaker").from("meal_week_attachments").upsert({
        // ⚠️ КОЛОНКИ ЗАМЕРЕНЫ 29.07, а не взяты по памяти. Прежняя полезная
        // нагрузка слала `created_at`, которого В ТАБЛИЦЕ НЕТ, и не слала
        // обязательные center_id и classroom. PostgREST отбивал запись ЦЕЛИКОМ,
        // а голый await глотал отказ: 68 сканов легли в хранилище, и НИ ОДНОЙ
        // строки о них не появилось. Экран каждый раз показывал успех.
        center_id: cls?.center_id ?? null,
        org_id: cls?.org_id ?? null,
        classroom: cls?.name ?? "",
        classroom_id: selectedClassId,
        monday_date: mon,
        file_path: path,
        file_name: scanFile.name,
        uploaded_by: "cook",
        uploaded_at: now,
      });
      if (attErr) throw new Error(`Attendance scan uploaded but NOT registered: ${attErr.message}`);
    }
    const { data: recs } = await supabase
      .schema("menumaker").from("meal_week_records")
      .select("*").eq("classroom_id", selectedClassId).eq("monday_date", mon);
    // Перечитывание после Approve индексируется ТЕМ ЖЕ ключом, что загрузка недели.
    // Индексируй здесь по имени — и после подписи экран показал бы другую неделю,
    // чем до неё, на тех же данных.
    setRecords(indexWeekRecords((recs ?? []) as WeekRecord[], roster));
  }, [records, roster, selectedClassId, weekStart]);

  // ─── Milk: bucket checked children by milk_label, sum oz ──────────────────
  function milkForSlot(slot: SlotKey, day: DayKey): { buckets: MilkBucket[]; totalCups: number } | null {
    if (!settings?.milk_slots.includes(slot)) return null;
    const col = colName(day, slot);
    const map: Record<string, number> = {};
    let totalOz = 0;
    for (const child of roster) {
      if (records[rowKeyOf(child)]?.[col] !== 1) continue;
      const oz = child.oz ?? 0;
      if (oz <= 0 || !child.milk_label) continue;
      map[child.milk_label] = (map[child.milk_label] ?? 0) + oz;
      totalOz += oz;
    }
    return {
      buckets: Object.entries(map).map(([label, oz]) => ({ label, oz })),
      totalCups: ceilCups(totalOz),
    };
  }

  function checkedCount(day: DayKey, slot: SlotKey) {
    return roster.filter((c) => records[rowKeyOf(c)]?.[colName(day, slot)] === 1).length;
  }

  function dayTotals(day: DayKey) {
    if (isStaff) return { total: 0, reimbursable: 0 };
    const active = settings?.active_slots ?? (["breakfast", "am_snack", "lunch", "supper"] as SlotKey[]);
    let total = 0, reimbursable = 0;
    for (const child of roster) {
      const checked = active.filter((s) => records[rowKeyOf(child)]?.[colName(day, s)] === 1);
      total += checked.length;
      reimbursable += reimbursableSlots(checked).size;
    }
    return { total, reimbursable };
  }

  function dayBlocked(day: DayKey) {
    const date = addDays(weekStart, DAYS.indexOf(day));
    if (isWeekend(date)) return true;
    return holidays[format(date, "yyyy-MM-dd")]?.type === "holiday"; // whole-day closure
  }
  // Short day: block only slots that START at/after the close time.
  function slotBlocked(day: DayKey, slot: SlotKey) {
    if (dayBlocked(day)) return true;
    const h = holidays[format(addDays(weekStart, DAYS.indexOf(day)), "yyyy-MM-dd")];
    if (h?.type === "short_day" && h.close_time) {
      const start = slotStart[slot];
      return !!start && start >= h.close_time.slice(0, 5);
    }
    return false;
  }
  // Human label for a blocked cell: "CLOSED", "Weekend", or "Short Day · closes HH:MM".
  function blockLabel(day: DayKey, slot: SlotKey): string | null {
    const date = addDays(weekStart, DAYS.indexOf(day));
    if (isWeekend(date)) return "Weekend";
    const h = holidays[format(date, "yyyy-MM-dd")];
    if (h?.type === "holiday") return "CLOSED";
    if (h?.type === "short_day" && h.close_time && slotBlocked(day, slot)) {
      return `Short Day · closes ${h.close_time.slice(0, 5)}`;
    }
    return null;
  }

  const activeSlots = settings?.active_slots ?? (["breakfast", "am_snack", "lunch", "supper"] as SlotKey[]);
  const weekStatus = Object.values(records)[0]?.status ?? "open";
  const isApproved = weekStatus === "director_approved";

  // ─── Export current week (selected classroom) → Google Sheets CSV ──────────────
  // Matches the Google Sheets layout: header rows + TRUE/FALSE per slot, 4 meals
  // (breakfast, snack, lunch, supper) × 5 days, then a Total milk (CUPS) row.
  function exportWeekCSV() {
    const EXPORT_SLOTS: SlotKey[] = ["breakfast", "am_snack", "lunch", "supper"];
    const SUB: Record<SlotKey, string> = { breakfast: "breakfast", am_snack: "snack", lunch: "lunch", supper: "supper" };
    const DAY_FULL: Record<DayKey, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday" };
    const esc = (v: string | number) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const rows: (string | number)[][] = [];
    rows.push([centerName, format(weekStart, "MMMM yyyy")]);              // Row 1
    rows.push([selectedClassName, "Teachers: "]);                                        // Row 2

    const r3: (string | number)[] = ["Child's Name"];                                    // Row 3
    DAYS.forEach((day, i) => r3.push(`${DAY_FULL[day]} ${format(addDays(weekStart, i), "M/d")}`, "", "", ""));
    rows.push(r3);

    const r4: (string | number)[] = ["#", "Child's Name"];                               // Row 4
    DAYS.forEach(() => EXPORT_SLOTS.forEach((s) => r4.push(SUB[s])));
    rows.push(r4);

    roster.forEach((child, idx) => {                                                     // Rows 5+
      const r: (string | number)[] = [idx + 1, child.child_name];
      DAYS.forEach((day) => EXPORT_SLOTS.forEach((slot) =>
        r.push(records[rowKeyOf(child)]?.[colName(day, slot)] === 1 ? "TRUE" : "FALSE")));
      rows.push(r);
    });

    const milkRow: (string | number)[] = ["Total milk (CUPS)", ""];                      // Total milk
    DAYS.forEach((day) => EXPORT_SLOTS.forEach((slot) => {
      const m = milkForSlot(slot, day);
      milkRow.push(m ? m.totalCups : 0);
    }));
    rows.push(milkRow);

    const csv = rows.map((r) => r.map(esc).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const cc = (centerName || "center").replace(/^Play Academy\s*/i, "").replace(/\s+/g, "");
    const rm = (selectedClassName || "class").replace(/\s+/g, "");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cc}_${rm}_${format(weekStart, "yyyy-MM-dd")}_meal_count.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (variant && !availableModes.length) return (
    <div className="mc-loading">
      This view is for {variant === "director" ? "directors" : "kitchen staff"}.
      {variant === "director"
        ? " Kitchen staff enter meals under Meal Count — Kitchen."
        : " Directors review and approve under Meal Count — Director."}
    </div>
  );
  if (!centerId) return <div className="mc-loading">Pick a center in the switcher at the top to view meal counts.</div>;
  if (!classrooms.length) return <div className="mc-loading">No active classrooms for {centerName || "this center"}.</div>;
  // Учительский вид без посадки: комната сессии не найдена среди детских комнат
  // центра. Пустая сетка здесь читалась бы как «в группе нет детей», а это
  // другой факт — поэтому вслух и с именем комнаты.
  if (teacherView && !selectedClassId) return (
    <div className="mc-loading">
      “{roomName ?? "This room"}” is not an active children’s room in {centerName || "this center"},
      so meals cannot be marked here. Nothing is lost — tell your director.
    </div>
  );

  // ПЛИТКА ПРОГНОЗА над сеткой: сколько порций ждать. Повару — его центр (он у
  // него один), админу — вкладками все центры-питания. Это подсказка, а не факт:
  // сама сетка ниже остаётся единственным местом, где отмечают съеденное.
  // Вкладки — только центры ПИТАНИЯ: кухня-склад и демо-центр детей не кормят,
  // и вкладка с вечным «прогноза нет» читалась бы как поломка.
  const tileCenters = (isOrgAdmin ? centers : (currentCenter ? [currentCenter] : []))
    .filter((c: { slug?: string }) => !!c.slug && mealSiteIds.has((c as { id: string }).id))
    .map((c: { id: string; slug: string; name: string }) => ({ id: c.id, slug: c.slug, name: c.name }));

  return (
    <div className="mc-page">
      {/* Прогноз порций — работа кухни: она печёт на центр. Учителю в группе он
          не помогает отметить своих детей, а отодвигает сетку вниз. */}
      {!teacherView && tileCenters.length > 0 && (
        <ExpectedCountsTile centers={tileCenters} initialCenterId={currentCenter?.id ?? null} />
      )}
      <div className="mc-header">
        <div className="mc-header-left">
          <h1 className="mc-title">
            {teacherView ? `Meals · ${selectedClassName}` : variant ? VARIANT_TITLE[variant] : "Meal Count"}
          </h1>
          <a href="/meal-count/help" target="_blank"
            style={{ fontSize: 12, color: '#1a5c3f', textDecoration: 'none', fontWeight: 600, padding: '6px 12px', borderRadius: 8, background: '#f0f7f4', border: '1px solid #d1fae5', display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 12 }}>
            ❓ Help
          </a>
          <div className="mc-week-nav">
            {/* Учителю — ДЕНЬ, а не неделя: он отмечает сегодняшний приём, и
                диапазон недели над сеткой обещал бы выбор, которого здесь нет. */}
            {teacherView ? (
              <span className="mc-week-label">
                {format(addDays(weekStart, DAYS.indexOf(selectedDay)), "EEEE, MMM d")}
              </span>
            ) : mode === "director" ? (
              <select className="mc-week-select" value={format(weekStart, "yyyy-MM-dd")}
                onChange={(e) => setWeekStart(new Date(e.target.value + "T12:00:00"))}>
                {Array.from({ length: 12 }, (_, i) => {
                  const m = addDays(mondayOf(new Date()), (i - 8) * 7);
                  const val = format(m, "yyyy-MM-dd");
                  return <option key={val} value={val}>{`${format(m, "MMM d")} – ${format(addDays(m, 4), "MMM d")}`}</option>;
                })}
              </select>
            ) : (
              <span className="mc-week-label">
                {format(weekStart, "MMM d")} – {format(addDays(weekStart, 4), "MMM d, yyyy")}
              </span>
            )}
          </div>
          {pendingCount > 0 && (
            <button
              type="button"
              className={`mc-queue-badge ${hasError ? "err" : ""}`}
              onClick={syncNow}
              title={hasError
                ? "Sync failed — tap to retry. Marks are safe on this device."
                : "Waiting to send. Marks are saved on this device and sync automatically."}>
              <span className="mc-queue-icon">{hasError ? "⚠" : "◷"}</span>
              {pendingCount} {pendingCount === 1 ? "mark" : "marks"} waiting{hasError ? " · retry" : ""}
            </button>
          )}
          {isApproved && <span className="mc-approved-badge">✓ Approved</span>}
          {/* Тихий час. Глушит ВСЕ ярусы звука этого планшета — и только звук:
              пульсация плашки и ступень директора остаются (решение 04.08). */}
          <MuteToggle device={selectedClassName || centerName || "Meal Count"} />
        </div>

        {/* ВИДИМЫЙ ОТКАЗ. Значок очереди в углу — не сообщение об ошибке: на планшете
            нет наведения, а значит и подсказки title. Отказ обязан быть читаемым текстом
            с именем ребёнка и словами сервера. */}
        {(writeErr || (hasError && lastError)) && (
          <div className="mc-write-err" role="alert">
            <span className="mc-write-err-icon">⚠</span>
            <div className="mc-write-err-body">
              <b>{writeErr ? "Mark not saved" : "Marks are not reaching the server"}</b>
              <div className="mc-write-err-msg">{writeErr ?? lastError}</div>
              {!writeErr && (
                <div className="mc-write-err-note">
                  Marks are safe on this tablet and will send themselves when the connection is back.
                </div>
              )}
            </div>
            <div className="mc-write-err-actions">
              {!writeErr && <button type="button" onClick={syncNow}>Retry</button>}
              <button type="button" onClick={() => setWriteErr(null)}>Dismiss</button>
            </div>
          </div>
        )}
        {/* Ступень директора сработала — комната обязана знать, что его позвали
            (или что позвать НЕ удалось): ступень одноразовая, второй попытки нет. */}
        {alertNote && (
          <div className="mc-write-err" role="status" style={{ background: "#fff8e6", borderColor: "#f0a020" }}>
            <span className="mc-write-err-icon">📣</span>
            <div className="mc-write-err-body"><b>{alertNote}</b></div>
            <div className="mc-write-err-actions">
              <button type="button" onClick={() => setAlertNote(null)}>Dismiss</button>
            </div>
          </div>
        )}
        {availableModes.length > 1 && (
          <div className="mc-mode-toggle">
            {availableModes.includes("current") && (
              <button className={mode === "current" ? "active" : ""} onClick={() => setMode("current")}>Current Meal</button>
            )}
            {availableModes.includes("week") && (
              <button className={mode === "week" ? "active" : ""} onClick={() => setMode("week")}>Week View</button>
            )}
            {availableModes.includes("director") && (
              <button className={mode === "director" ? "active director" : ""} onClick={() => setMode("director")}>Director</button>
            )}
          </div>
        )}
      </div>

      {/* Выгрузка недели в лист — работа кухни и офиса, а не учителя за планшетом
          группы: она отдаёт ВСЮ неделю всех дней одним файлом. */}
      {!teacherView && <div style={{ display: "flex", justifyContent: "flex-end", width: "100%",
        background: "#0f4c35", padding: "0 1.25rem .75rem" }}>
        <button onClick={exportWeekCSV} title="Download CSV for Google Sheets"
          style={{ position: "static", padding: "7px 14px", borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.6)", background: "transparent", color: "#fff",
            fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
          ⬇ Export for Google Sheets
        </button>
      </div>}

      <BuckleBanner banner={ritual.banner} variant={chimeVariant} onUnlock={ritual.unlock} />
      {/* Красный список «окна закрылись без отметок» — сводка по ЦЕНТРУ, и на
          кухне это правильно: повар видит весь дом. Учителю чужие комнаты не
          показываем — не его ответственность и не его право знать; своя строка
          остаётся, потому что она про него. */}
      <UnbuckledList items={teacherView
        ? ritual.unbuckled.filter((w) => w.classroom_id === selectedClassId)
        : ritual.unbuckled} />

      {/* Табы комнат — только там, где комнату ВЫБИРАЮТ. У учителя комната одна:
          та, в которой он стоит и под которой вошёл по PIN. */}
      {!teacherView && <div className="mc-class-bar">
        {classrooms.map((cls) => (
          <button key={cls.id}
            className={`mc-class-btn ${selectedClassId === cls.id ? "active" : ""} ${cls.is_roster === false ? "staff" : ""}`}
            onClick={() => { setSelectedClassId(cls.id); setSelectedClassName(cls.name); }}>
            {cls.name}
          </button>
        ))}
      </div>}

      {loadErr && (
        <div role="alert" style={{
          display: "flex", alignItems: "flex-start", gap: 10, margin: "0 0 14px",
          padding: "12px 16px", borderRadius: 10,
          background: "#fef2f2", border: "1px solid #fca5a5", color: "#991b1b",
          fontSize: 13, fontWeight: 500,
        }}>
          <span style={{ fontSize: 16, lineHeight: 1.2 }}>⚠</span>
          <span>
            The roster could not be loaded — this class is <b>not</b> empty, the load failed.
            Do not record meals from this screen until it is fixed. Tell the office: {loadErr}
          </span>
        </div>
      )}

      {loading ? <div className="mc-loading">Loading roster…</div>
        : mode === "current" ? (
          <CurrentMode
            roster={roster} records={records} activeSlots={activeSlots}
            selectedSlot={selectedSlot} setSelectedSlot={setSelectedSlot}
            selectedDay={selectedDay} setSelectedDay={setSelectedDay}
            todayDayKey={todayDayKey} dayBlocked={dayBlocked} slotBlocked={slotBlocked} blockLabel={blockLabel}
            toggle={toggle} checkedCount={checkedCount}
            milkForSlot={milkForSlot} isQueued={isQueued}
            isStaff={isStaff} dayTotals={dayTotals}
            lockDay={teacherView} lockFor={lockOf}
            onRequestChange={teacherView ? requestChange : undefined}
            changeReq={changeReq}
          />
        ) : mode === "director" ? (
          <DirectorMode
            roster={roster} records={records} activeSlots={activeSlots}
            dayBlocked={dayBlocked} slotBlocked={slotBlocked} blockLabel={blockLabel} toggle={toggle} milkForSlot={milkForSlot}
            weekStart={weekStart} isQueued={isQueued} isStaff={isStaff} dayTotals={dayTotals}
            isApproved={isApproved} onApprove={approveWeek} showApprove={showApprove}
          />
        ) : (
          <WeekMode
            roster={roster} records={records} activeSlots={activeSlots}
            dayBlocked={dayBlocked} slotBlocked={slotBlocked} blockLabel={blockLabel} toggle={toggle} milkForSlot={milkForSlot}
            weekStart={weekStart} isQueued={isQueued} isStaff={isStaff} dayTotals={dayTotals}
          />
        )}
      <style>{styles}</style>
    </div>
  );
}

// ─── shared prop shape for grid ─────────────────────────────────────────────────

interface GridProps {
  roster: Child[];
  records: Record<string, WeekRecord>;
  activeSlots: SlotKey[];
  dayBlocked: (d: DayKey) => boolean;
  slotBlocked: (d: DayKey, s: SlotKey) => boolean;
  blockLabel: (d: DayKey, s: SlotKey) => string | null;
  toggle: (c: Child, d: DayKey, s: SlotKey) => void;
  milkForSlot: (s: SlotKey, d: DayKey) => { buckets: MilkBucket[]; totalCups: number } | null;
  weekStart: Date;
  /** True when this cell is queued offline (unsynced). Drives "queued" styling. */
  isQueued: (child: { roster_id?: string | null; child_name: string }, col: string) => boolean;
  isStaff: boolean;
  dayTotals: (d: DayKey) => { total: number; reimbursable: number };
  readOnly?: boolean;
}

// ─── «Пристегни ремни»: плашка окна ──────────────────────────────────────────
// Плашка НИЧЕГО НЕ БЛОКИРУЕТ и ничего не закрывает собой: у неё нет ни оверлея,
// ни модального окна, ни кнопки «понятно», без которой не пройти. Отнять экран
// посреди обеда дороже, чем не напомнить (канон 31.07 о сообщении на планшете).

function BuckleBanner({ banner, variant, onUnlock }: {
  banner: BannerState; variant: ChimeVariantKey; onUnlock: () => void;
}) {
  if (banner.kind === "none" || !banner.slot) return null;
  const slotLabel = SLOT_LABELS[banner.slot as SlotKey] ?? banner.slot;

  if (banner.kind === "done") {
    return (
      <div className="mc-buckle done" role="status">
        <span className="mc-buckle-icon">✓</span>
        <span className="mc-buckle-text">
          <b>{slotLabel} marked{banner.markedAt ? ` ${banner.markedAt}` : ""}</b>
        </span>
      </div>
    );
  }

  const words = phraseFor(variant, banner.urgent ? "reminder" : "start").words;
  // Ритуальные 30 минут вышли, а окно ещё идёт → показываем время ДО ЗАКРЫТИЯ.
  // Ноль на видном месте читается как «поздно», хотя отметить ещё можно и нужно.
  const counting = banner.minutesLeft > 0;
  return (
    <div className={`mc-buckle ${banner.urgent ? "urgent" : "counting"}${banner.alarm ? " alarm" : ""}`} role="status">
      <span className="mc-buckle-icon">{banner.urgent ? "⏰" : "🍽"}</span>
      <span className="mc-buckle-text">
        <b>{slotLabel} in progress — mark portions</b>
        <span className="mc-buckle-words">«{words}»</span>
      </span>
      <span className="mc-buckle-timer">
        {counting ? banner.minutesLeft : banner.minutesToClose}
        <span className="mc-buckle-unit">{counting ? " min" : " min to close"}</span>
      </span>
      {banner.kind === "locked" && (
        // Беззвучно — и сказано об этом. Молчащая плашка без объяснения читается
        // как сломанный звук, и через день ей перестают верить.
        <button type="button" className="mc-buckle-unlock" onClick={onUnlock}>
          🔇 Tap to enable sound
        </button>
      )}
    </div>
  );
}

// Красный список к концу дня. ТОЛЬКО ВИДИМОСТЬ: ни одна строка ничего не
// запрещает и ничего не правит задним числом — она лишь показывает сегодня то,
// что иначе всплывёт через месяц, на сверке заявки.
function UnbuckledList({ items }: { items: UnbuckledWindow[] }) {
  if (!items.length) return null;
  return (
    <div className="mc-unbuckled" role="status">
      <div className="mc-unbuckled-head">
        Windows closed with no marks: {items.length}
        <span className="mc-unbuckled-note">Nothing is blocked — you can still mark them now.</span>
      </div>
      <div className="mc-unbuckled-rows">
        {items.map((w) => (
          <span key={`${w.classroom_id}_${w.slot}`} className="mc-unbuckled-row">
            <b>{w.classroomName}</b> · {SLOT_LABELS[w.slot as SlotKey] ?? w.slot} · {hhmm(w.start)}–{hhmm(w.end)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Current Meal Mode ────────────────────────────────────────────────────────

function CurrentMode({ roster, records, activeSlots, selectedSlot, setSelectedSlot,
  selectedDay, setSelectedDay, todayDayKey, dayBlocked, slotBlocked, blockLabel, toggle, checkedCount,
  milkForSlot, isQueued, isStaff, dayTotals, lockDay, lockFor, onRequestChange, changeReq }: {
    roster: Child[]; records: Record<string, WeekRecord>; activeSlots: SlotKey[];
    selectedSlot: SlotKey; setSelectedSlot: (s: SlotKey) => void;
    selectedDay: DayKey; setSelectedDay: (d: DayKey) => void; todayDayKey: DayKey;
    dayBlocked: (d: DayKey) => boolean; slotBlocked: (d: DayKey, s: SlotKey) => boolean;
    blockLabel: (d: DayKey, s: SlotKey) => string | null;
    toggle: (c: Child, d: DayKey, s: SlotKey) => void;
    checkedCount: (d: DayKey, s: SlotKey) => number;
    milkForSlot: (s: SlotKey, d: DayKey) => { buckets: MilkBucket[]; totalCups: number } | null;
    isQueued: (child: { roster_id?: string | null; child_name: string }, col: string) => boolean; isStaff: boolean;
    dayTotals: (d: DayKey) => { total: number; reimbursable: number };
    /** Учительский вид: день один — тот, что уже выбран, и линейки дней нет. */
    lockDay?: boolean;
    /** Замок приёма: закрытое окно и прошлый день отмечать не дают. */
    lockFor?: (s: SlotKey) => SlotLock;
    /** Дверь из замка: заявка директору на правку. */
    onRequestChange?: (s: SlotKey, note: string) => Promise<void>;
    changeReq?: { kind: "sent" | "already" | "failed"; text: string } | null;
  }) {
  const day = selectedDay;
  const blocked = slotBlocked(day, selectedSlot);
  const milk = milkForSlot(selectedSlot, day);
  const count = checkedCount(day, selectedSlot);
  const totals = dayTotals(day);
  // Замок приёма. Замкнутый приём ВИДЕН и ГОВОРИТ: тап по нему отвечает словами,
  // а не тишиной — «не реагирует» читается как сломанный планшет, и через день
  // такому экрану перестают верить.
  const lock: SlotLock = lockFor ? lockFor(selectedSlot) : { locked: false };
  const [lockSaid, setLockSaid] = useState(false);
  const [askNote, setAskNote] = useState("");
  const [asking, setAsking] = useState(false);
  useEffect(() => { setLockSaid(false); setAskNote(""); }, [selectedSlot, selectedDay]);

  return (
    <div className="mc-current">
      {/* Линейка дней — для кухни, которая правит вчерашнее и смотрит неделю.
          У учителя день один: правки задним числом идут через директора
          (документированное исключение, канон 07.08), а не тапом в группе. */}
      {!lockDay && <div className="mc-day-bar">
        {DAYS.map((d) => (
          <button key={d}
            className={`mc-day-btn ${selectedDay === d ? "active" : ""} ${dayBlocked(d) ? "blocked" : ""} ${d === todayDayKey ? "today" : ""}`}
            onClick={() => setSelectedDay(d)}>
            {DAY_LABELS[d]}{d === todayDayKey && <span className="mc-today-dot" />}
          </button>
        ))}
      </div>}

      <div className="mc-slot-bar">
        {activeSlots.map((slot) => {
          const lk = lockFor ? lockFor(slot) : { locked: false as const };
          return (
            <button key={slot} className={`mc-slot-btn ${selectedSlot === slot ? "active" : ""} ${lk.locked ? "locked" : ""}`}
              onClick={() => setSelectedSlot(slot)}>
              {lk.locked ? "🔒 " : ""}{SLOT_LABELS[slot]}
            </button>
          );
        })}
      </div>

      {blocked ? (
        <div className="mc-blocked"><span>🚫</span><p>{blockLabel(day, selectedSlot) ?? "Closed"} — no meal count for this slot.</p></div>
      ) : (
        <>
          {lock.locked && (
            <div className="mc-locked-strip" role="status">
              <span className="mc-locked-icon">🔒</span>
              <div className="mc-locked-body">
                <b>{lockLine(lock, SLOT_LABELS[selectedSlot])}</b>
                <span className="mc-locked-note">
                  Marks already made are kept — this meal is simply no longer open for changes here.
                </span>

                {/* ДВЕРЬ ИЗ ЗАМКА. Тупик учит обходить систему: человеку, у
                    которого осталось дело, нужен путь, а не стена. Заявка уходит
                    директору тем же рельсом, что и тревога пустого окна. */}
                {onRequestChange && (
                  <div className="mc-locked-ask">
                    <input
                      className="mc-locked-note-input"
                      placeholder="What needs changing? (optional)"
                      value={askNote}
                      maxLength={200}
                      onChange={(e) => setAskNote(e.target.value)}
                    />
                    <button
                      type="button"
                      className="mc-locked-ask-btn"
                      disabled={asking}
                      onClick={async () => {
                        setAsking(true);
                        try { await onRequestChange(selectedSlot, askNote); }
                        finally { setAsking(false); }
                      }}>
                      {asking ? "Sending…" : "Request change from director"}
                    </button>
                  </div>
                )}
                {changeReq && (
                  <div className={`mc-locked-ask-said ${changeReq.kind}`} role="alert">
                    {changeReq.kind === "failed" ? "⚠️ " : changeReq.kind === "already" ? "ⓘ " : "✓ "}
                    {changeReq.text}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mc-counter-bar">
            <span className="mc-counter-num">{count}</span>
            <span className="mc-counter-label">checked · {roster.length} in roster</span>
            {!isStaff && totals.total > 0 && (
              <div className="mc-day-totals">
                <span className="mc-tot-item">Day total: <b>{totals.total}</b></span>
                <span className="mc-tot-sep">·</span>
                <span className="mc-tot-item reimb">Reimbursable: <b>{totals.reimbursable}</b></span>
              </div>
            )}
            {isStaff && <span className="mc-staff-badge">Staff — not reimbursed</span>}
          </div>

          <div className="mc-checklist">
            {roster.map((child) => {
              const col = colName(day, selectedSlot);
              const checked = records[rowKeyOf(child)]?.[col] === 1;
              const queued = isQueued(child, col);
              return (
                <button key={child.roster_id}
                  className={`mc-check-row ${checked ? "checked" : ""} ${queued ? "queued" : ""} ${lock.locked ? "locked" : ""}`}
                  aria-disabled={lock.locked || undefined}
                  onClick={() => { if (lock.locked) { setLockSaid(true); return; } toggle(child, day, selectedSlot); }}>
                  <span className="mc-checkbox">{checked ? (lock.locked ? "🔒" : "✓") : ""}</span>
                  {queued && <span className="mc-queue-flag" title="Waiting to send">◷</span>}
                  <Avatar name={displayName(child)} path={child.photo_url} size={24} />
                  <span className="mc-child-name">{displayName(child)}</span>
                  {child.allergies && <span className="mc-sub-badge" title={child.allergies}>⚠ {child.allergies}</span>}
                  {child.milk_label && <span className="mc-milk-tag">{child.milk_label}</span>}
                </button>
              );
            })}
          </div>

          {lockSaid && (
            <div className="mc-locked-said" role="alert">
              {lockLine(lock, SLOT_LABELS[selectedSlot])} Your director can change it with their PIN.
            </div>
          )}

          {milk && (
            <div className="mc-milk-panel">
              <div className="mc-milk-title">🥛 Pour now · {milk.totalCups} cups total</div>
              <div className="mc-milk-rows">
                {milk.buckets.length === 0 ? (
                  <div className="mc-milk-zero">No children checked</div>
                ) : milk.buckets.map((b) => (
                  <div key={b.label} className="mc-milk-item">
                    <span className="mc-milk-cups">{ceilCups(b.oz)}</span>
                    <span className="mc-milk-kind">cups {b.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Shared Week Grid ────────────────────────────────────────────────────────

function WeekGrid({ roster, records, activeSlots, dayBlocked, slotBlocked, blockLabel, toggle, milkForSlot,
  weekStart, isQueued, isStaff, dayTotals, readOnly }: GridProps) {
  const nSlots = activeSlots.length;
  return (
    <div className="mc-week-scroll">
      <table className="mc-week-table">
        <thead>
          <tr>
            <th className="mc-th-fixed" rowSpan={2}>#</th>
            <th className="mc-th-fixed mc-th-child" rowSpan={2}>Child's Name</th>
            <th className="mc-th-fixed" rowSpan={2}>Age</th>
            <th className="mc-th-fixed" rowSpan={2}>Milk</th>
            <th className="mc-th-fixed" rowSpan={2}>oz</th>
            {DAYS.map((day, i) => (
              <th key={day} colSpan={nSlots} className={`mc-th-day-group ${dayBlocked(day) ? "blocked" : ""}`}>
                <span className="mc-th-dayname">{DAY_LABELS[day]}</span>
                <span className="mc-th-date"> {format(addDays(weekStart, i), "M/d")}</span>
                {dayBlocked(day) && <span className="mc-th-closed">{blockLabel(day, activeSlots[0]) ?? "CLOSED"}</span>}
              </th>
            ))}
          </tr>
          <tr>
            {DAYS.flatMap((day) =>
              activeSlots.map((slot) => (
                <th key={`${day}_${slot}`} title={slotBlocked(day, slot) ? blockLabel(day, slot) ?? "Closed" : undefined}
                  className={`mc-th-slot-sub ${slotBlocked(day, slot) ? "blocked" : ""} ${slot === activeSlots[0] ? "mc-td-day-start" : ""}`}>
                  {slot === "am_snack" ? "Snk" : SLOT_LABELS[slot].slice(0, 3)}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {roster.map((child, idx) => (
            <tr key={child.roster_id} className="mc-tr">
              <td className="mc-td-num">{idx + 1}</td>
              <td className="mc-td-name">{displayName(child)}</td>
              <td className="mc-td-age">{AGE_LABEL[child.age_group_food ?? ""] ?? child.age_group_food ?? "—"}</td>
              <td className="mc-td-milk-kind" title={child.milk_label ?? ""}>{child.milk_label ?? "—"}</td>
              <td className="mc-td-oz">{child.oz ?? "—"}</td>
              {DAYS.flatMap((day) => {
                return activeSlots.map((slot) => {
                  const blocked = slotBlocked(day, slot);
                  const col = colName(day, slot);
                  const checked = records[rowKeyOf(child)]?.[col] === 1;
                  const queued = isQueued(child, col);
                  return (
                    <td key={`${day}_${slot}`} title={blocked ? blockLabel(day, slot) ?? "Closed" : undefined}
                      className={`mc-td-cell ${blocked ? "blocked" : ""} ${slot === activeSlots[0] ? "mc-td-day-start" : ""}`}>
                      {blocked ? <span className="mc-hol">—</span> : (
                        <button className={`mc-cell-btn ${checked ? "checked" : ""} ${queued ? "queued" : ""}`}
                          onClick={() => !readOnly && toggle(child, day, slot)}
                          title={queued ? "Waiting to send" : undefined}
                          style={readOnly ? { cursor: "default" } : {}}>
                          {checked ? "✓" : ""}
                        </button>
                      )}
                    </td>
                  );
                });
              })}
            </tr>
          ))}
          {!isStaff && (
            <tr className="mc-tr-milk">
              <td colSpan={5} className="mc-td-milk-label">Total milk (cups)</td>
              {DAYS.flatMap((day) => activeSlots.map((slot) => {
                const milk = milkForSlot(slot, day);
                if (!milk) return <td key={`milk_${day}_${slot}`} className={`mc-td-milk-val no-milk ${slot === activeSlots[0] ? "mc-td-day-start" : ""}`}>—</td>;
                const tip = milk.buckets.map((b) => `${b.label}: ${ceilCups(b.oz)}c`).join(" / ");
                return <td key={`milk_${day}_${slot}`} className={`mc-td-milk-val ${slot === activeSlots[0] ? "mc-td-day-start" : ""}`}>
                  {milk.totalCups > 0 ? <span title={tip}>{milk.totalCups}</span> : "—"}
                </td>;
              }))}
            </tr>
          )}
          {!isStaff && (
            <tr className="mc-tr-reimb">
              <td colSpan={5} className="mc-td-reimb-label">Reimbursable</td>
              {DAYS.map((day) => {
                const t = dayTotals(day);
                return (
                  <td key={`reimb_${day}`} colSpan={nSlots} className="mc-td-reimb-val mc-td-day-start">
                    {t.total > 0 ? <span><b>{t.reimbursable}</b><span className="mc-reimb-of">/{t.total}</span></span> : "—"}
                  </td>
                );
              })}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function WeekMode(props: GridProps) {
  return <div className="mc-week-wrap"><WeekGrid {...props} /></div>;
}

// ─── Director Mode ────────────────────────────────────────────────────────────

// Document detection — crops receipt/scan edges automatically
async function detectAndCropReceipt(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = img.width; canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const w = canvas.width, h = canvas.height;
      let minX = w, maxX = 0, minY = h, maxY = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (data[i] < 240 || data[i+1] < 240 || data[i+2] < 240) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }
      const pad = 20;
      minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
      maxX = Math.min(w, maxX + pad); maxY = Math.min(h, maxY + pad);
      const cropW = maxX - minX, cropH = maxY - minY;
      if (cropW > w * 0.3 && cropH > h * 0.3 && (cropW < w * 0.95 || cropH < h * 0.95)) {
        const out = document.createElement('canvas');
        out.width = cropW; out.height = cropH;
        out.getContext('2d')!.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
        out.toBlob(blob => {
          if (blob) resolve(new File([blob], file.name.replace(/\.[^.]+$/, '') + '_cropped.jpg', { type: 'image/jpeg' }));
          else resolve(file);
        }, 'image/jpeg', 0.92);
      } else { resolve(file); }
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

function DirectorMode({ isApproved, onApprove, showApprove, ...gridProps }: GridProps & {
  isApproved: boolean;
  showApprove: boolean;
  onApprove: (initials: string, scan: File | null) => Promise<void>;
}) {
  const [initials, setInitials] = useState("");
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [approving, setApproving] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [approveErr, setApproveErr] = useState<string | null>(null);

  // The refusal must SPEAK. A greyed-out button eats the press and answers no one —
  // that is the lesson of Submit, Create and Save. The button stays live; the
  // server decides; whatever it says is shown here in full.
  const handleApprove = async () => {
    if (!initials.trim()) return;
    setApproving(true); setApproveErr(null);
    try {
      await onApprove(initials.trim().toUpperCase(), scanFile);
      setDone(true);
    } catch (e: any) {
      setApproveErr(e?.message ?? String(e));
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="mc-week-wrap">
      <div className="mc-director-bar">
        <span className="mc-director-label">📋 Director Review</span>
        <span className="mc-director-hint">Edit checkboxes if needed, then approve.</span>
      </div>

      {/* DISABLED by owner 2026-08-02, until further notice.
          Signature lock: an approved week's checkboxes were read-only. Removing the
          lock is the owner's instruction of 02.08 and applies to every centre,
          Alpha/Highland included. The line is kept, not deleted — restoring the lock
          means deleting the unlocked line below and un-commenting this one.
          Original: <WeekGrid {...gridProps} readOnly={isApproved} /> */}
      <WeekGrid {...gridProps} />

      {showApprove && (
        <div className="mc-approve-panel">
          {/* The approved-state notice STAYS (it is a warning, not a lock). Only the
              clause asserting a lock is corrected, because the lock is off. */}
          {isApproved ? (
            <div className="mc-approved-msg">✅ Week approved — editing stays open by owner's instruction of 02.08.</div>
          ) : (
            <>
              <div className="mc-approve-row">
                <label className="mc-approve-label">Director initials</label>
                <input className="mc-initials-input" maxLength={4} placeholder="e.g. CS"
                  value={initials} onChange={(e) => setInitials(e.target.value.toUpperCase())} />
              </div>
              <div className="mc-approve-row">
                <label className="mc-approve-label">Attendance scan (PDF / photo)</label>
                <div className="mc-scan-row">
                  <button className="mc-scan-btn" onClick={() => fileRef.current?.click()}>
                    📎 {scanFile ? scanFile.name : "Attach file"}
                  </button>
                  {scanFile && <button className="mc-scan-clear" onClick={() => setScanFile(null)}>✕</button>}
                  <input ref={fileRef} type="file" accept="application/pdf,image/*" capture="environment" style={{ display: "none" }}
                    onChange={async (e) => { const f = e.target.files?.[0]; if (f) setScanFile(await detectAndCropReceipt(f)); }} />
                </div>
              </div>
              <button className="mc-approve-btn" disabled={!initials.trim() || approving} onClick={handleApprove}>
                {approving ? "Approving…" : "✓ Approve Week"}
              </button>
              {approveErr && (
                <div role="alert" style={{
                  marginTop: 10, padding: "10px 13px", borderRadius: 10, fontSize: 13, lineHeight: 1.45,
                  background: "#eef2ff", border: "1px solid #c7d2fe", color: "#3730a3",
                }}>{approveErr}</div>
              )}
              {done && <div className="mc-approved-msg">✅ Approved!</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = `
.mc-page { min-height:100vh; background:#f4f7f4; font-family:'DM Sans',sans-serif; color:#1a2e1a; }
.mc-loading { padding:2rem; color:#666; font-size:.95rem; }
.mc-header { display:flex; align-items:center; justify-content:space-between; padding:1rem 1.25rem .75rem; background:#0f4c35; color:#fff; flex-wrap:wrap; gap:.5rem; }
.mc-header-left { display:flex; align-items:center; gap:.75rem; }
.mc-title { font-size:1.25rem; font-weight:700; margin:0; color:#fff; }
.mc-week-nav { display:flex; align-items:center; gap:.35rem; }
.mc-week-select { background:rgba(255,255,255,.15); border:1px solid rgba(255,255,255,.3); color:#fff; font-size:.85rem; padding:.3rem .6rem; border-radius:6px; cursor:pointer; font-family:inherit; outline:none; }
.mc-week-select option { background:#0f4c35; color:#fff; }
.mc-week-label { font-size:.85rem; opacity:.75; }
.mc-saving-dot { width:8px; height:8px; border-radius:50%; background:#7ee8b0; animation:mc-pulse 1s ease-in-out infinite; }
@keyframes mc-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
.mc-approved-badge { font-size:.8rem; background:#7ee8b0; color:#0a3320; padding:.2rem .6rem; border-radius:12px; font-weight:700; }
/* Offline queue badge — "N marks waiting". Amber = queued, red-ish = sync error. */
.mc-queue-badge { display:inline-flex; align-items:center; gap:.35rem; font-size:.8rem; font-weight:700; background:#f0a020; color:#3a2600; padding:.25rem .7rem; border-radius:12px; border:none; cursor:pointer; font-family:inherit; }
.mc-queue-badge .mc-queue-icon { font-size:.85rem; }
.mc-queue-badge.err { background:#e05a4a; color:#fff; animation:mc-pulse 1.4s ease-in-out infinite; }
/* ВИДИМЫЙ ОТКАЗ ЗАПИСИ. Полоса во всю ширину шапки (flex-basis:100% при
   flex-wrap у .mc-header) — на белом, чтобы читалась поверх зелёного, и с
   кнопками в палец: планшет, наведения нет, консоли нет. */
.mc-write-err { flex:1 1 100%; display:flex; align-items:flex-start; gap:.6rem; margin:.5rem 0 0;
  padding:.6rem .8rem; background:#fff; border:2px solid #c0392b; border-left-width:6px;
  border-radius:10px; color:#7a1f16; text-align:left; }
.mc-write-err-icon { font-size:1.1rem; line-height:1.3; }
.mc-write-err-body { flex:1; min-width:0; font-size:.85rem; }
.mc-write-err-body b { display:block; font-size:.9rem; color:#7a1f16; }
.mc-write-err-msg { margin-top:.15rem; word-break:break-word; }
.mc-write-err-note { margin-top:.2rem; color:#5a4a20; }
.mc-write-err-actions { display:flex; gap:.4rem; flex-shrink:0; }
.mc-write-err-actions button { padding:.35rem .7rem; font-size:.8rem; font-weight:700;
  font-family:inherit; border-radius:8px; border:1.5px solid #c0392b; background:#fff;
  color:#7a1f16; cursor:pointer; }
/* «Пристегни ремни» — плашка окна. Она НЕ перекрывает экран: обычная полоса в
   потоке, лента комнат и сетка остаются доступны в любую секунду. */
.mc-buckle { display:flex; align-items:center; gap:.7rem; margin:0; padding:.6rem 1rem;
  border-bottom:2px solid transparent; font-size:.9rem; }
.mc-buckle.counting { background:#fff6e0; border-color:#f0a020; color:#5a4200; }
.mc-buckle.urgent   { background:#ffe9e4; border-color:#e05a4a; color:#7a1f16; }
.mc-buckle.done     { background:#e8f7ee; border-color:#0f4c35; color:#0a3320; }
.mc-buckle-icon { font-size:1.25rem; line-height:1; }
.mc-buckle-text { display:flex; flex-direction:column; gap:.1rem; flex:1; min-width:0; }
.mc-buckle-text b { font-size:.95rem; }
.mc-buckle-words { font-size:.8rem; opacity:.75; font-style:italic; }
.mc-buckle-timer { font-size:1.5rem; font-weight:800; font-variant-numeric:tabular-nums; letter-spacing:.02em; white-space:nowrap; }
.mc-buckle-unit { font-size:.75rem; font-weight:600; opacity:.7; }
.mc-buckle-unlock { padding:.35rem .7rem; border-radius:8px; border:1.5px solid currentColor;
  background:transparent; color:inherit; font-family:inherit; font-size:.8rem; font-weight:700; cursor:pointer; }
/* Тревога десятой минуты: МЯГКИЙ пульс, а не мигание. Мигающая полоса на
   планшете посреди обеда раздражает и её выключают; медленное дыхание фона
   замечают краем глаза и не гасят. Пульс НЕ зависит ни от звука, ни от тумблера
   «тихий час» — заглушённая комната обязана остаться видимой. */
.mc-buckle.alarm { animation: mc-pulse 1.8s ease-in-out infinite; }
@keyframes mc-pulse {
  0%, 100% { box-shadow: inset 0 0 0 0 rgba(224,90,74,0); }
  50%      { box-shadow: inset 0 0 0 9999px rgba(224,90,74,0.16); }
}
/* Кто выключил анимации в системе, тот их выключил и здесь — но плашка обязана
   остаться заметной, поэтому вместо пульса ей достаётся постоянная рамка. */
@media (prefers-reduced-motion: reduce) {
  .mc-buckle.alarm { animation:none; box-shadow: inset 0 0 0 3px rgba(224,90,74,0.55); }
}

/* Непристёгнутые окна дня — видимость без запретов. */
.mc-unbuckled { background:#fff; border-left:6px solid #c0392b; padding:.55rem 1rem;
  display:flex; flex-direction:column; gap:.3rem; }
.mc-unbuckled-head { font-size:.85rem; font-weight:700; color:#7a1f16;
  display:flex; gap:.6rem; align-items:baseline; flex-wrap:wrap; }
.mc-unbuckled-note { font-weight:400; font-size:.78rem; color:#7a6a20; }
.mc-unbuckled-rows { display:flex; flex-wrap:wrap; gap:.35rem .6rem; }
.mc-unbuckled-row { font-size:.8rem; color:#7a1f16; background:#fdecea;
  border:1px solid #f3c3bc; border-radius:8px; padding:.15rem .5rem; }

/* Per-cell "queued" state — distinct from the solid-green SYNCED check. */
/* Замок отметок: замкнутое ВЫГЛЯДИТ замкнутым — не «серым и неотзывчивым», а
   явно закрытым, с замком на месте галочки и полосой словами над списком. */
.mc-locked-strip { display:flex; gap:.6rem; align-items:flex-start; margin:0 0 .75rem; padding:.7rem 1rem; border-radius:12px; background:#f4f6fa; border:1.5px solid #c2cbd9; color:#33415c; font-size:.9rem; line-height:1.45; }
.mc-locked-icon { font-size:1.05rem; line-height:1.2; }
.mc-locked-note { display:block; font-weight:400; color:#5b6780; margin-top:2px; }
.mc-locked-body { display:flex; flex-direction:column; }
.mc-locked-ask { display:flex; gap:.5rem; flex-wrap:wrap; margin-top:.6rem; }
.mc-locked-note-input { flex:1 1 220px; min-height:40px; padding:.45rem .7rem; border-radius:9px; border:1.5px solid #c2cbd9; font-family:inherit; font-size:.88rem; color:#25324a; background:#fff; }
.mc-locked-ask-btn { min-height:40px; padding:0 1rem; border-radius:9px; border:1.5px solid #0f4c35; background:#0f4c35; color:#fff; font-family:inherit; font-size:.88rem; font-weight:700; cursor:pointer; }
.mc-locked-ask-btn:disabled { opacity:.6; cursor:default; }
.mc-locked-ask-said { margin-top:.5rem; font-size:.85rem; font-weight:600; color:#1a5c3f; }
.mc-locked-ask-said.failed { color:#991b1b; }
.mc-locked-ask-said.already { color:#5b6780; }
.mc-locked-said { margin:.6rem 0 0; padding:.65rem .9rem; border-radius:10px; background:#fff8e6; border:1.5px solid #f0a020; color:#7a4b00; font-size:.88rem; font-weight:600; }
.mc-slot-btn.locked { opacity:.75; }
.mc-check-row.locked { cursor:default; background:#f7f8fb; border-color:#c2cbd9; }
.mc-check-row.locked.checked { background:#eef1f6; border-color:#8b98ad; }
.mc-check-row.locked .mc-checkbox { background:#e6eaf1; border-color:#c2cbd9; color:#5b6780; }
.mc-check-row.queued { border-color:#f0a020; background:#fff8ec; }
.mc-check-row.queued.checked { background:#eef7ee; }
.mc-queue-flag { color:#c07800; font-size:1rem; font-weight:700; margin-left:-.4rem; }
.mc-cell-btn.queued { box-shadow:0 0 0 2px #f0a020 inset; }
.mc-cell-btn.checked.queued { box-shadow:0 0 0 2px #c07800 inset; }
.mc-mode-toggle { display:flex; background:rgba(255,255,255,.15); border-radius:8px; overflow:hidden; }
.mc-mode-toggle button { padding:.4rem .85rem; font-size:.8rem; font-weight:600; color:rgba(255,255,255,.7); background:transparent; border:none; cursor:pointer; transition:all .15s; }
.mc-mode-toggle button.active { background:#7ee8b0; color:#0a3320; }
.mc-mode-toggle button.active.director { background:#f0c040; color:#3a2800; }
.mc-class-bar { display:flex; gap:.5rem; padding:.65rem 1rem; background:#0a3320; overflow-x:auto; -webkit-overflow-scrolling:touch; }
.mc-class-btn { flex-shrink:0; padding:.4rem .9rem; font-size:.82rem; font-weight:600; border-radius:20px; border:1.5px solid rgba(126,232,176,.35); background:transparent; color:rgba(255,255,255,.65); cursor:pointer; transition:all .15s; white-space:nowrap; }
.mc-class-btn.active { background:#7ee8b0; color:#0a3320; border-color:#7ee8b0; }
.mc-class-btn.staff { border-color:rgba(255,180,0,.4); color:rgba(255,200,80,.8); }
.mc-class-btn.staff.active { background:#e6a817; color:#3a2800; border-color:#e6a817; }
.mc-current { padding:.75rem 1rem 2rem; }
.mc-day-bar { display:flex; gap:.4rem; margin-bottom:.75rem; }
.mc-day-btn { flex:1; padding:.45rem .5rem; font-size:.85rem; font-weight:600; border-radius:8px; border:2px solid #d0e8d0; background:#fff; color:#555; cursor:pointer; transition:all .15s; position:relative; text-align:center; }
.mc-day-btn.active { background:#0f4c35; color:#fff; border-color:#0f4c35; }
.mc-day-btn.blocked { background:#f5f5f5; color:#bbb; border-color:#e0e0e0; }
.mc-day-btn.today { border-color:#0f4c35; }
.mc-today-dot { position:absolute; bottom:3px; left:50%; transform:translateX(-50%); width:5px; height:5px; border-radius:50%; background:#7ee8b0; }
.mc-day-btn.active .mc-today-dot { background:#fff; }
.mc-slot-bar { display:flex; gap:.5rem; margin-bottom:1rem; overflow-x:auto; }
.mc-slot-btn { flex-shrink:0; padding:.5rem 1rem; font-size:.88rem; font-weight:600; border-radius:8px; border:2px solid #d0e8d0; background:#fff; color:#555; cursor:pointer; transition:all .15s; }
.mc-slot-btn.active { background:#0f4c35; color:#fff; border-color:#0f4c35; }
.mc-counter-bar { display:flex; align-items:center; gap:.5rem; margin-bottom:.75rem; padding:.6rem .75rem; background:#e8f4e8; border-radius:10px; flex-wrap:wrap; }
.mc-counter-num { font-size:2rem; font-weight:800; color:#0f4c35; line-height:1; }
.mc-counter-label { font-size:.9rem; color:#4a6e4a; }
.mc-day-totals { margin-left:auto; display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; }
.mc-tot-item { font-size:.82rem; color:#4a6e4a; }
.mc-tot-sep { color:#aaa; }
.mc-staff-badge { margin-left:auto; font-size:.75rem; background:#fff3cd; color:#856404; padding:.2rem .6rem; border-radius:12px; font-weight:600; }
.mc-blocked { display:flex; flex-direction:column; align-items:center; gap:.5rem; padding:3rem 1rem; color:#888; }
.mc-blocked span { font-size:2.5rem; }
.mc-checklist { display:flex; flex-direction:column; gap:.5rem; margin-bottom:1.25rem; }
.mc-check-row { display:flex; align-items:center; gap:1rem; width:100%; min-height:60px; padding:.75rem 1rem; background:#fff; border:2px solid #e0ebe0; border-radius:12px; cursor:pointer; transition:all .12s; text-align:left; }
.mc-check-row.checked { background:#e8f7ee; border-color:#0f4c35; }
.mc-check-row.pending { opacity:.6; }
.mc-checkbox { width:36px; height:36px; border-radius:8px; border:2.5px solid #c0d8c0; display:flex; align-items:center; justify-content:center; font-size:1.3rem; font-weight:700; color:#0f4c35; flex-shrink:0; background:#fff; transition:all .12s; }
.mc-check-row.checked .mc-checkbox { background:#0f4c35; border-color:#0f4c35; color:#7ee8b0; }
.mc-child-name { font-size:1.05rem; font-weight:600; flex:1; }
.mc-sub-badge { font-size:.72rem; background:#fff3cd; color:#856404; padding:.2rem .5rem; border-radius:8px; }
.mc-milk-tag { font-size:.72rem; background:#eef6ff; color:#1a5c8a; padding:.2rem .5rem; border-radius:8px; }
.mc-milk-panel { background:#0f4c35; border-radius:14px; padding:1rem 1.25rem; color:#fff; }
.mc-milk-title { font-size:.9rem; font-weight:700; opacity:.85; margin-bottom:.6rem; letter-spacing:.03em; text-transform:uppercase; }
.mc-milk-rows { display:flex; flex-direction:column; gap:.4rem; }
.mc-milk-item { display:flex; align-items:baseline; gap:.5rem; }
.mc-milk-cups { font-size:2rem; font-weight:800; line-height:1; color:#7ee8b0; }
.mc-milk-kind { font-size:.95rem; opacity:.85; }
.mc-milk-zero { font-size:.9rem; opacity:.5; }
.mc-week-wrap { padding:.75rem 0 2rem; }
.mc-week-scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; }
.mc-week-table { border-collapse:collapse; font-size:.8rem; background:#fff; }
.mc-week-table th,.mc-week-table td { border:1px solid #dde8dd; }
.mc-th-fixed { background:#0f4c35; color:#fff; padding:.45rem .5rem; text-align:left; font-weight:700; white-space:nowrap; }
.mc-th-child { min-width:140px; }
.mc-th-day-group { background:#1a6645; color:#fff; padding:.35rem .4rem; text-align:center; font-weight:700; }
.mc-th-day-group.blocked { background:#999; }
.mc-th-dayname { font-weight:700; }
.mc-th-date { font-size:.72rem; font-weight:400; opacity:.8; }
.mc-th-closed { display:block; font-size:.6rem; font-weight:700; letter-spacing:.04em; text-transform:uppercase; opacity:.95; margin-top:1px; }
.mc-th-slot-sub { background:#e8f4e8; color:#1a2e1a; padding:.25rem .3rem; text-align:center; font-weight:600; font-size:.75rem; min-width:34px; }
.mc-th-slot-sub.blocked { background:#f0f0f0; color:#aaa; }
.mc-td-day-start { border-left:2px solid #0f4c35 !important; }
.mc-tr:nth-child(even) { background:#f9fcf9; }
.mc-td-num { padding:.3rem .4rem; color:#888; text-align:center; min-width:24px; }
.mc-td-name { padding:.3rem .5rem; font-weight:600; white-space:nowrap; }
.mc-td-age { padding:.3rem .4rem; text-align:center; color:#555; font-size:.78rem; white-space:nowrap; }
.mc-td-milk-kind { padding:.3rem .4rem; text-align:center; white-space:nowrap; font-size:.78rem; max-width:90px; overflow:hidden; text-overflow:ellipsis; }
.mc-td-oz { padding:.3rem .4rem; text-align:center; color:#555; font-size:.78rem; }
.mc-td-cell { padding:.15rem; text-align:center; }
.mc-td-cell.blocked { background:#f5f5f5; }
.mc-hol { color:#ccc; font-size:.8rem; }
.mc-cell-btn { width:30px; height:30px; border-radius:5px; border:1.5px solid #c8e0c8; background:#fff; color:#0f4c35; font-weight:700; font-size:.85rem; cursor:pointer; transition:all .1s; display:inline-flex; align-items:center; justify-content:center; }
.mc-cell-btn.checked { background:#0f4c35; border-color:#0f4c35; color:#7ee8b0; }
.mc-cell-btn.pending { opacity:.5; }
.mc-tr-milk { background:#e8f4e8 !important; border-top:2px solid #0f4c35; }
.mc-td-milk-label { padding:.35rem .5rem; font-weight:700; color:#0f4c35; font-size:.75rem; text-transform:uppercase; letter-spacing:.04em; }
.mc-td-milk-val { padding:.3rem .3rem; text-align:center; font-weight:700; color:#0f4c35; font-size:.82rem; }
.mc-td-milk-val.no-milk { color:#ccc; font-weight:400; }
.mc-tr-reimb { background:#e0f0e8 !important; border-top:2px solid #7ee8b0; }
.mc-td-reimb-label { padding:.35rem .5rem; font-weight:700; color:#0f4c35; font-size:.75rem; text-transform:uppercase; letter-spacing:.04em; }
.mc-td-reimb-val { padding:.3rem .3rem; text-align:center; font-size:.85rem; }
.mc-td-reimb-val b { color:#0f4c35; }
.mc-reimb-of { color:#888; font-size:.75rem; }
.mc-director-bar { display:flex; align-items:center; gap:1rem; padding:.6rem 1rem; background:#fff8e1; border-bottom:2px solid #f0c040; }
.mc-director-label { font-weight:700; color:#7a5800; font-size:.9rem; }
.mc-director-hint { font-size:.82rem; color:#9a7820; }
.mc-approve-panel { margin:1.5rem 1rem; padding:1.25rem 1.5rem; background:#fff; border-radius:14px; border:2px solid #e0ebe0; display:flex; flex-direction:column; gap:1rem; max-width:520px; }
.mc-approve-row { display:flex; flex-direction:column; gap:.4rem; }
.mc-approve-label { font-size:.82rem; font-weight:700; color:#555; text-transform:uppercase; letter-spacing:.04em; }
.mc-initials-input { width:100px; padding:.55rem .75rem; font-size:1.2rem; font-weight:700; text-transform:uppercase; letter-spacing:.15em; border:2px solid #c0d8c0; border-radius:8px; text-align:center; outline:none; font-family:inherit; }
.mc-initials-input:focus { border-color:#0f4c35; }
.mc-scan-row { display:flex; align-items:center; gap:.5rem; }
.mc-scan-btn { padding:.45rem 1rem; border-radius:8px; border:1.5px solid #c0d8c0; background:#f4f7f4; color:#1a2e1a; font-size:.85rem; cursor:pointer; font-family:inherit; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:300px; }
.mc-scan-btn:hover { border-color:#0f4c35; }
.mc-scan-clear { width:28px; height:28px; border-radius:50%; border:1.5px solid #c0d8c0; background:#fff; color:#888; cursor:pointer; font-size:.9rem; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.mc-approve-btn { padding:.7rem 1.5rem; background:#0f4c35; color:#fff; border:none; border-radius:10px; font-size:1rem; font-weight:700; cursor:pointer; transition:background .15s; font-family:inherit; align-self:flex-start; }
.mc-approve-btn:hover:not(:disabled) { background:#1a6645; }
.mc-approve-btn:disabled { opacity:.5; cursor:not-allowed; }
.mc-approved-msg { font-size:.95rem; color:#0f4c35; font-weight:600; padding:.6rem 1rem; background:#e8f7ee; border-radius:8px; }
`;
