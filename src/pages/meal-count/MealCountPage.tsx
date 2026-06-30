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
import { format, startOfWeek, addDays, isWeekend } from "date-fns";

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
}

interface Classroom {
  id: string;
  class_key: string;
  name: string;
  sort_order: number;
  center_id?: string;
}

interface MealCountSettings {
  active_slots: SlotKey[];
  milk_slots: SlotKey[];
}

interface WeekRecord {
  id: string;
  child_name: string;
  status?: string;
  director_initials?: string;
  director_signed_at?: string;
  [key: string]: string | number | undefined;
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

// Display name: "last_name first_name" (e.g. "Rodriguez Juan"). Falls back to
// the legacy child_name when either part is missing. NOTE: child_name remains
// the identity/join key into meal_week_records — only the label changes.
const displayName = (c: { last_name?: string | null; first_name?: string | null; child_name: string }) =>
  (c.last_name?.trim() && c.first_name?.trim())
    ? `${c.last_name.trim()} ${c.first_name.trim()}`
    : c.child_name;

interface MilkBucket { label: string; oz: number; }

// ─── Main component ───────────────────────────────────────────────────────────

export default function MealCountPage({ portalRoles }: { portalRoles?: string[] } = {}) {
  const { role, roles } = useAuth();
  const { currentCenter, orgRole } = useOrg();

  // Union of user_roles + admin from org bootstrap.
  const effectiveRoles = useMemo(() => {
    if (portalRoles?.length) return new Set<string>(portalRoles);
    const s = new Set<string>(roles);
    if (orgRole === "admin") s.add("admin");
    if (role) s.add(role);
    return s;
  }, [roles, orgRole, role, portalRoles]);

  const availableModes = useMemo(() => modesForRoles(effectiveRoles), [effectiveRoles]);
  const showApprove = effectiveRoles.has("director") || effectiveRoles.has("admin");

  const [mode, setMode] = useState<Mode>("current");
  useEffect(() => { setMode(defaultMode(role, availableModes)); }, [role, availableModes]);

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedClassName, setSelectedClassName] = useState("");
  const [settings, setSettings] = useState<MealCountSettings | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotKey>("breakfast");
  const [roster, setRoster] = useState<Child[]>([]);
  const [records, setRecords] = useState<Record<string, WeekRecord>>({});
  const [holidays, setHolidays] = useState<Record<string, { type: string; close_time: string | null }>>({});
  const [slotStart, setSlotStart] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Map<string, boolean>>(new Map());
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const today = new Date();
    const dow = today.getDay();
    const mon = mondayOf(today);
    if (dow === 6) return addDays(mon, 7);
    if (dow === 0) return addDays(mon, 1);
    return mon;
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isStaff = selectedClassName.toLowerCase().includes("staff");

  const todayDayKey = ((): DayKey => {
    const map: Record<number, DayKey> = { 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri" };
    return map[new Date().getDay()] ?? "mon";
  })();
  const [selectedDay, setSelectedDay] = useState<DayKey>(todayDayKey);

  // ─── Load classrooms + settings + holidays ────────────────────────────────
  useEffect(() => {
    // Meal Count is center-scoped. Never load without a concrete center, or the
    // query returns every center's classrooms mixed together (RLS lets admins
    // read the whole org). In Organization view we simply show nothing here.
    if (!currentCenter?.id) {
      setClassrooms([]);
      setSelectedClassId("");
      setSelectedClassName("");
      return;
    }
    const centerId = currentCenter.id;
    (async () => {
      const { data: cls } = await supabase
        .schema("menumaker").from("classrooms")
        .select("id,class_key,name,sort_order,center_id")
        .eq("is_active", true)
        .eq("center_id", centerId)
        .order("sort_order");
      if (cls?.length) {
        setClassrooms(cls as Classroom[]);
        setSelectedClassId(cls[0].id);
        setSelectedClassName(cls[0].name);
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
  }, [currentCenter?.id]);

  // Per-classroom slot start times (for short-day slot blocking).
  useEffect(() => {
    if (!selectedClassId) { setSlotStart({}); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.schema("menumaker").from("meal_schedule")
        .select("slot, start_time").eq("classroom_id", selectedClassId);
      if (cancelled) return;
      const m: Record<string, string> = {};
      for (const r of (data ?? []) as { slot: string; start_time: string | null }[]) {
        if (r.start_time) m[r.slot] = r.start_time.slice(0, 5);
      }
      setSlotStart(m);
    })();
    return () => { cancelled = true; };
  }, [selectedClassId]);

  // ─── Load roster (v_meal_grid) + records ──────────────────────────────────
  useEffect(() => {
    if (!selectedClassId) return;
    setLoading(true);
    (async () => {
      const cls = classrooms.find((c) => c.id === selectedClassId);
      const mon = format(weekStart, "yyyy-MM-dd");

      let gridQ = supabase
        .schema("menumaker").from("v_meal_grid")
        .select("roster_id,child_name,first_name,last_name,birthday,classroom_id,center_id,milk_label,oz,allergies,age_group_food,is_active")
        .eq("classroom_id", selectedClassId)
        .eq("is_active", true);
      if (cls?.center_id) gridQ = gridQ.eq("center_id", cls.center_id);
      // CACFP standard: oldest children first → ORDER BY birthday ASC.
      const { data: kids } = await gridQ
        .order("birthday", { ascending: true, nullsFirst: false })
        .order("last_name")
        .order("first_name");
      setRoster((kids ?? []) as Child[]);

      const { data: recs } = await supabase
        .schema("menumaker").from("meal_week_records")
        .select("*").eq("classroom_id", selectedClassId).eq("monday_date", mon);
      const map: Record<string, WeekRecord> = {};
      for (const r of recs ?? []) map[r.child_name] = r;
      setRecords(map);
      setLoading(false);
    })();
  }, [selectedClassId, weekStart, classrooms]);

  // ─── Toggle checkbox ──────────────────────────────────────────────────────
  const toggle = useCallback(async (child: Child, day: DayKey, slot: SlotKey) => {
    const col = colName(day, slot);
    const existing = records[child.child_name];
    const current = existing ? (existing[col] as number) : 0;
    const next = current ? 0 : 1;

    setRecords((prev) => ({
      ...prev,
      [child.child_name]: { ...(prev[child.child_name] ?? { child_name: child.child_name }), [col]: next },
    }));
    const key = `${child.child_name}_${col}`;
    setPending((p) => new Map(p).set(key, true));
    setSaving(true);

    try {
      const mon = format(weekStart, "yyyy-MM-dd");
      if (existing?.id) {
        await supabase.schema("menumaker").from("meal_week_records")
          .update({ [col]: next, updated_at: new Date().toISOString() }).eq("id", existing.id);
      } else {
        const { data: ins } = await supabase.schema("menumaker").from("meal_week_records")
          .upsert({
            classroom: selectedClassName, classroom_id: selectedClassId,
            center_id: child.center_id, roster_id: child.roster_id,
            child_name: child.child_name, monday_date: mon,
            status: "open", source: "app", [col]: next,
          }, { onConflict: "classroom_id,child_name,monday_date" })
          .select().single();
        if (ins) setRecords((prev) => ({ ...prev, [child.child_name]: ins as WeekRecord }));
      }
    } catch {
      setRecords((prev) => ({ ...prev, [child.child_name]: { ...(prev[child.child_name] ?? {}), [col]: current } }));
    } finally {
      setPending((p) => { const n = new Map(p); n.delete(key); return n; });
      setSaving(false);
    }
  }, [records, selectedClassId, selectedClassName, weekStart]);

  // ─── Director: approve week ───────────────────────────────────────────────
  const approveWeek = useCallback(async (initials: string, scanFile: File | null) => {
    const mon = format(weekStart, "yyyy-MM-dd");
    const now = new Date().toISOString();
    const ids = Object.values(records).map((r) => r.id).filter(Boolean);
    if (ids.length) {
      await supabase.schema("menumaker").from("meal_week_records")
        .update({ status: "director_approved", director_initials: initials, director_signed_at: now })
        .in("id", ids);
    }
    if (scanFile) {
      const path = `${selectedClassId}/${mon}/${scanFile.name}`;
      await supabase.storage.from("attendance-scans").upload(path, scanFile, { upsert: true });
      await supabase.schema("menumaker").from("meal_week_attachments").upsert({
        classroom_id: selectedClassId, monday_date: mon, file_path: path,
        uploaded_by: "director", created_at: now,
      });
    }
    const { data: recs } = await supabase
      .schema("menumaker").from("meal_week_records")
      .select("*").eq("classroom_id", selectedClassId).eq("monday_date", mon);
    const map: Record<string, WeekRecord> = {};
    for (const r of recs ?? []) map[r.child_name] = r;
    setRecords(map);
  }, [records, selectedClassId, weekStart]);

  // ─── Milk: bucket checked children by milk_label, sum oz ──────────────────
  function milkForSlot(slot: SlotKey, day: DayKey): { buckets: MilkBucket[]; totalCups: number } | null {
    if (!settings?.milk_slots.includes(slot)) return null;
    const col = colName(day, slot);
    const map: Record<string, number> = {};
    let totalOz = 0;
    for (const child of roster) {
      if (records[child.child_name]?.[col] !== 1) continue;
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
    return roster.filter((c) => records[c.child_name]?.[colName(day, slot)] === 1).length;
  }

  function dayTotals(day: DayKey) {
    if (isStaff) return { total: 0, reimbursable: 0 };
    const active = settings?.active_slots ?? (["breakfast", "am_snack", "lunch", "supper"] as SlotKey[]);
    let total = 0, reimbursable = 0;
    for (const child of roster) {
      const checked = active.filter((s) => records[child.child_name]?.[colName(day, s)] === 1);
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
    rows.push([currentCenter?.name ?? "", format(weekStart, "MMMM yyyy")]);              // Row 1
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
        r.push(records[child.child_name]?.[colName(day, slot)] === 1 ? "TRUE" : "FALSE")));
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
    const cc = (currentCenter?.name ?? "center").replace(/^Play Academy\s*/i, "").replace(/\s+/g, "");
    const rm = (selectedClassName || "class").replace(/\s+/g, "");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cc}_${rm}_${format(weekStart, "yyyy-MM-dd")}_meal_count.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!currentCenter?.id) return <div className="mc-loading">Select a center to view meal counts.</div>;
  if (!classrooms.length) return <div className="mc-loading">No active classrooms for {currentCenter.name}.</div>;

  return (
    <div className="mc-page">
      <div className="mc-header">
        <div className="mc-header-left">
          <h1 className="mc-title">Meal Count</h1>
          <a href="/meal-count/help" target="_blank"
            style={{ fontSize: 12, color: '#1a5c3f', textDecoration: 'none', fontWeight: 600, padding: '6px 12px', borderRadius: 8, background: '#f0f7f4', border: '1px solid #d1fae5', display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 12 }}>
            ❓ Help
          </a>
          <div className="mc-week-nav">
            {mode === "director" ? (
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
          {saving && <span className="mc-saving-dot" />}
          {isApproved && <span className="mc-approved-badge">✓ Approved</span>}
        </div>
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

      <div style={{ display: "flex", justifyContent: "flex-end", width: "100%",
        background: "#0f4c35", padding: "0 1.25rem .75rem" }}>
        <button onClick={exportWeekCSV} title="Download CSV for Google Sheets"
          style={{ position: "static", padding: "7px 14px", borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.6)", background: "transparent", color: "#fff",
            fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
          ⬇ Export for Google Sheets
        </button>
      </div>

      <div className="mc-class-bar">
        {classrooms.map((cls) => (
          <button key={cls.id}
            className={`mc-class-btn ${selectedClassId === cls.id ? "active" : ""} ${cls.name.toLowerCase().includes("staff") ? "staff" : ""}`}
            onClick={() => { setSelectedClassId(cls.id); setSelectedClassName(cls.name); }}>
            {cls.name}
          </button>
        ))}
      </div>

      {loading ? <div className="mc-loading">Loading roster…</div>
        : mode === "current" ? (
          <CurrentMode
            roster={roster} records={records} activeSlots={activeSlots}
            selectedSlot={selectedSlot} setSelectedSlot={setSelectedSlot}
            selectedDay={selectedDay} setSelectedDay={setSelectedDay}
            todayDayKey={todayDayKey} dayBlocked={dayBlocked} slotBlocked={slotBlocked} blockLabel={blockLabel}
            toggle={toggle} checkedCount={checkedCount}
            milkForSlot={milkForSlot} pending={pending}
            isStaff={isStaff} dayTotals={dayTotals}
          />
        ) : mode === "director" ? (
          <DirectorMode
            roster={roster} records={records} activeSlots={activeSlots}
            dayBlocked={dayBlocked} slotBlocked={slotBlocked} blockLabel={blockLabel} toggle={toggle} milkForSlot={milkForSlot}
            weekStart={weekStart} pending={pending} isStaff={isStaff} dayTotals={dayTotals}
            isApproved={isApproved} onApprove={approveWeek} showApprove={showApprove}
          />
        ) : (
          <WeekMode
            roster={roster} records={records} activeSlots={activeSlots}
            dayBlocked={dayBlocked} slotBlocked={slotBlocked} blockLabel={blockLabel} toggle={toggle} milkForSlot={milkForSlot}
            weekStart={weekStart} pending={pending} isStaff={isStaff} dayTotals={dayTotals}
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
  pending: Map<string, boolean>;
  isStaff: boolean;
  dayTotals: (d: DayKey) => { total: number; reimbursable: number };
  readOnly?: boolean;
}

// ─── Current Meal Mode ────────────────────────────────────────────────────────

function CurrentMode({ roster, records, activeSlots, selectedSlot, setSelectedSlot,
  selectedDay, setSelectedDay, todayDayKey, dayBlocked, slotBlocked, blockLabel, toggle, checkedCount,
  milkForSlot, pending, isStaff, dayTotals }: {
    roster: Child[]; records: Record<string, WeekRecord>; activeSlots: SlotKey[];
    selectedSlot: SlotKey; setSelectedSlot: (s: SlotKey) => void;
    selectedDay: DayKey; setSelectedDay: (d: DayKey) => void; todayDayKey: DayKey;
    dayBlocked: (d: DayKey) => boolean; slotBlocked: (d: DayKey, s: SlotKey) => boolean;
    blockLabel: (d: DayKey, s: SlotKey) => string | null;
    toggle: (c: Child, d: DayKey, s: SlotKey) => void;
    checkedCount: (d: DayKey, s: SlotKey) => number;
    milkForSlot: (s: SlotKey, d: DayKey) => { buckets: MilkBucket[]; totalCups: number } | null;
    pending: Map<string, boolean>; isStaff: boolean;
    dayTotals: (d: DayKey) => { total: number; reimbursable: number };
  }) {
  const day = selectedDay;
  const blocked = slotBlocked(day, selectedSlot);
  const milk = milkForSlot(selectedSlot, day);
  const count = checkedCount(day, selectedSlot);
  const totals = dayTotals(day);

  return (
    <div className="mc-current">
      <div className="mc-day-bar">
        {DAYS.map((d) => (
          <button key={d}
            className={`mc-day-btn ${selectedDay === d ? "active" : ""} ${dayBlocked(d) ? "blocked" : ""} ${d === todayDayKey ? "today" : ""}`}
            onClick={() => setSelectedDay(d)}>
            {DAY_LABELS[d]}{d === todayDayKey && <span className="mc-today-dot" />}
          </button>
        ))}
      </div>

      <div className="mc-slot-bar">
        {activeSlots.map((slot) => (
          <button key={slot} className={`mc-slot-btn ${selectedSlot === slot ? "active" : ""}`}
            onClick={() => setSelectedSlot(slot)}>{SLOT_LABELS[slot]}</button>
        ))}
      </div>

      {blocked ? (
        <div className="mc-blocked"><span>🚫</span><p>{blockLabel(day, selectedSlot) ?? "Closed"} — no meal count for this slot.</p></div>
      ) : (
        <>
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
              const checked = records[child.child_name]?.[col] === 1;
              const isPend = pending.has(`${child.child_name}_${col}`);
              return (
                <button key={child.roster_id}
                  className={`mc-check-row ${checked ? "checked" : ""} ${isPend ? "pending" : ""}`}
                  onClick={() => toggle(child, day, selectedSlot)}>
                  <span className="mc-checkbox">{checked ? "✓" : ""}</span>
                  <span className="mc-child-name">{displayName(child)}</span>
                  {child.allergies && <span className="mc-sub-badge" title={child.allergies}>⚠ {child.allergies}</span>}
                  {child.milk_label && <span className="mc-milk-tag">{child.milk_label}</span>}
                </button>
              );
            })}
          </div>

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
  weekStart, pending, isStaff, dayTotals, readOnly }: GridProps) {
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
                  const checked = records[child.child_name]?.[col] === 1;
                  const isPend = pending.has(`${child.child_name}_${col}`);
                  return (
                    <td key={`${day}_${slot}`} title={blocked ? blockLabel(day, slot) ?? "Closed" : undefined}
                      className={`mc-td-cell ${blocked ? "blocked" : ""} ${slot === activeSlots[0] ? "mc-td-day-start" : ""}`}>
                      {blocked ? <span className="mc-hol">—</span> : (
                        <button className={`mc-cell-btn ${checked ? "checked" : ""} ${isPend ? "pending" : ""}`}
                          onClick={() => !readOnly && toggle(child, day, slot)}
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

  const handleApprove = async () => {
    if (!initials.trim()) return;
    setApproving(true);
    await onApprove(initials.trim().toUpperCase(), scanFile);
    setApproving(false);
    setDone(true);
  };

  return (
    <div className="mc-week-wrap">
      <div className="mc-director-bar">
        <span className="mc-director-label">📋 Director Review</span>
        <span className="mc-director-hint">Edit checkboxes if needed, then approve.</span>
      </div>

      <WeekGrid {...gridProps} readOnly={isApproved} />

      {showApprove && (
        <div className="mc-approve-panel">
          {isApproved ? (
            <div className="mc-approved-msg">✅ Week approved — data is locked for reporting.</div>
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
