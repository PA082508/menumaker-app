// src/pages/meal-count/MealCountPage.tsx
// MenuMaker · Meal Count module
// Two modes:
//   "current"  — runner hands iPad to teacher, one slot, large checkboxes, milk panel
//   "week"     — full 5×4 grid for director review / edit

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { format, startOfWeek, addDays, isWeekend } from "date-fns";

// ─── Types ───────────────────────────────────────────────────────────────────

type SlotKey = "breakfast" | "am_snack" | "lunch" | "supper";
type DayKey = "mon" | "tue" | "wed" | "thu" | "fri";

interface Child {
  id: string;
  child_name: string;
  milk_kind: "red" | "1pct" | "substitute";
  substitute_milk: string | null;
  substitute_reimbursable: boolean;
  rate_oz: number;
  age_group_food: string;
}

interface Classroom {
  id: string;
  class_key: string;
  name: string;
  sort_order: number;
}

interface MealCountSettings {
  active_slots: SlotKey[];
  milk_slots: SlotKey[];
  claim_excluded_slot: SlotKey;
}

interface WeekRecord {
  id: string;
  child_name: string;
  [key: string]: string | number; // slot columns like mon_b, tue_l …
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SLOT_LABELS: Record<SlotKey, string> = {
  breakfast: "Breakfast",
  am_snack: "AM Snack",
  lunch: "Lunch",
  supper: "Supper",
};

const SLOT_COL: Record<SlotKey, string> = {
  breakfast: "b",
  am_snack: "as",
  lunch: "l",
  supper: "su",
};

const DAY_LABELS: Record<DayKey, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
};

const DAYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function colName(day: DayKey, slot: SlotKey): string {
  return `${day}_${SLOT_COL[slot]}`;
}

function mondayOf(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

function ceilCups(checks: number, rateOz: number): number {
  return Math.ceil((checks * rateOz) / 8);
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MealCountPage() {
  const [mode, setMode] = useState<"current" | "week">("current");

  // classroom selector
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  // slot selector (current mode)
  const [settings, setSettings] = useState<MealCountSettings | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotKey>("breakfast");

  // roster
  const [roster, setRoster] = useState<Child[]>([]);

  // week records keyed by child_name
  const [records, setRecords] = useState<Record<string, WeekRecord>>({});

  // holidays (set of YYYY-MM-DD strings that are blocked)
  const [holidays, setHolidays] = useState<Set<string>>(new Set());

  // pending writes queue for offline resilience
  const [pending, setPending] = useState<Map<string, boolean>>(new Map());

  // current week monday
  const [weekStart] = useState<Date>(() => mondayOf(new Date()));

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Derive today's DayKey ──
  const todayDayKey = ((): DayKey | null => {
    const d = new Date().getDay(); // 0=Sun
    const map: Record<number, DayKey> = { 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri" };
    return map[d] ?? null;
  })();

  // ─── Load classrooms + settings on mount ─────────────────────────────────

  useEffect(() => {
    (async () => {
      const { data: cls } = await supabase
        .schema("menumaker")
        .from("classrooms")
        .select("id,class_key,name,sort_order")
        .eq("is_active", true)
        .order("sort_order");

      if (cls && cls.length) {
        setClassrooms(cls);
        setSelectedClassId(cls[0].id);
      }

      const { data: cfg } = await supabase
        .schema("menumaker")
        .from("meal_count_settings")
        .select("active_slots,milk_slots,claim_excluded_slot")
        .limit(1)
        .single();

      if (cfg) {
        setSettings(cfg as MealCountSettings);
        // default slot = first active that is NOT excluded
        const first = (cfg.active_slots as SlotKey[]).find(
          (s) => s !== cfg.claim_excluded_slot
        );
        if (first) setSelectedSlot(first);
      }

      // holidays this week
      const mon = format(mondayOf(new Date()), "yyyy-MM-dd");
      const fri = format(addDays(mondayOf(new Date()), 4), "yyyy-MM-dd");
      const { data: hols } = await supabase
        .schema("menumaker")
        .from("holidays")
        .select("holiday_date")
        .gte("holiday_date", mon)
        .lte("holiday_date", fri);

      if (hols) {
        setHolidays(new Set(hols.map((h: { holiday_date: string }) => h.holiday_date)));
      }
    })();
  }, []);

  // ─── Load roster + week records when classroom changes ───────────────────

  useEffect(() => {
    if (!selectedClassId) return;
    setLoading(true);
    (async () => {
      const mon = format(weekStart, "yyyy-MM-dd");

      const { data: kids } = await supabase
        .schema("menumaker")
        .from("roster")
        .select(
          "id,child_name,milk_kind,substitute_milk,substitute_reimbursable,rate_oz,age_group_food"
        )
        .eq("classroom_id", selectedClassId)
        .eq("is_active", true)
        .order("child_name");

      setRoster((kids ?? []) as Child[]);

      const { data: recs } = await supabase
        .schema("menumaker")
        .from("meal_week_records")
        .select("*")
        .eq("classroom_id", selectedClassId)
        .eq("monday_date", mon);

      const map: Record<string, WeekRecord> = {};
      for (const r of recs ?? []) map[r.child_name] = r;
      setRecords(map);

      setLoading(false);
    })();
  }, [selectedClassId, weekStart]);

  // ─── Toggle a checkbox ────────────────────────────────────────────────────

  const toggle = useCallback(
    async (child: Child, day: DayKey, slot: SlotKey) => {
      const col = colName(day, slot);
      const existing = records[child.child_name];
      const current = existing ? (existing[col] as number) : 0;
      const next = current ? 0 : 1;

      // Optimistic update
      setRecords((prev) => ({
        ...prev,
        [child.child_name]: {
          ...(prev[child.child_name] ?? { child_name: child.child_name }),
          [col]: next,
        },
      }));

      const key = `${child.child_name}_${col}`;
      setPending((p) => new Map(p).set(key, true));
      setSaving(true);

      try {
        const mon = format(weekStart, "yyyy-MM-dd");

        if (existing?.id) {
          await supabase
            .schema("menumaker")
            .from("meal_week_records")
            .update({ [col]: next, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
        } else {
          const { data: ins } = await supabase
            .schema("menumaker")
            .from("meal_week_records")
            .upsert(
              {
                center_id: "881ef4ce-1a27-4d3b-aa60-59d2a307bf2b",
                classroom_id: selectedClassId,
                classroom: classrooms.find(c => c.id === selectedClassId)?.name ?? "",
                roster_id: child.id,
                child_name: child.child_name,
                monday_date: mon,
                status: "open",
                source: "app",
                [col]: next,
              },
              { onConflict: "center_id,classroom,child_name,monday_date" }
            )
            .select()
            .single();

          if (ins) {
            setRecords((prev) => ({
              ...prev,
              [child.child_name]: ins as WeekRecord,
            }));
          }
        }
      } catch {
        // Revert on failure
        setRecords((prev) => ({
          ...prev,
          [child.child_name]: {
            ...(prev[child.child_name] ?? {}),
            [col]: current,
          },
        }));
      } finally {
        setPending((p) => {
          const n = new Map(p);
          n.delete(key);
          return n;
        });
        setSaving(false);
      }
    },
    [records, selectedClassId, weekStart]
  );

  // ─── Milk totals ─────────────────────────────────────────────────────────

  function milkForSlot(slot: SlotKey, day: DayKey) {
    if (!settings?.milk_slots.includes(slot)) return null;
    const col = colName(day, slot);

    let red = 0;
    let pct1 = 0;
    let subs: { name: string; cups: number; reimbursable: boolean }[] = [];

    for (const child of roster) {
      const checked = records[child.child_name]?.[col] === 1;
      if (!checked) continue;
      if (child.milk_kind === "red") red += child.rate_oz;
      else if (child.milk_kind === "1pct") pct1 += child.rate_oz;
      else {
        const existing = subs.find((s) => s.name === (child.substitute_milk ?? "Sub"));
        if (existing) existing.cups += child.rate_oz;
        else
          subs.push({
            name: child.substitute_milk ?? "Substitute",
            cups: child.rate_oz,
            reimbursable: child.substitute_reimbursable,
          });
      }
    }

    return {
      red: red > 0 ? Math.ceil(red / 8) : 0,
      pct1: pct1 > 0 ? Math.ceil(pct1 / 8) : 0,
      subs: subs.map((s) => ({ ...s, cups: Math.ceil(s.cups / 8) })),
    };
  }

  // ─── Current mode: checked count for slot ────────────────────────────────

  function checkedCount(day: DayKey, slot: SlotKey): number {
    const col = colName(day, slot);
    return roster.filter((c) => records[c.child_name]?.[col] === 1).length;
  }

  // ─── Day blocked? ─────────────────────────────────────────────────────────

  function dayBlocked(day: DayKey): boolean {
    const idx = DAYS.indexOf(day);
    const date = format(addDays(weekStart, idx), "yyyy-MM-dd");
    return holidays.has(date) || isWeekend(addDays(weekStart, idx));
  }

  const activeSlots = settings?.active_slots ?? (["breakfast", "am_snack", "lunch", "supper"] as SlotKey[]);
  const claimExcluded = settings?.claim_excluded_slot ?? "breakfast";

  // ─── RENDER ───────────────────────────────────────────────────────────────

  if (!classrooms.length) {
    return (
      <div className="mc-loading">
        <p>Loading classrooms…</p>
      </div>
    );
  }

  return (
    <div className="mc-page">
      {/* ── Header ── */}
      <div className="mc-header">
        <div className="mc-header-left">
          <h1 className="mc-title">Meal Count</h1>
          <span className="mc-week-label">
            {format(weekStart, "MMM d")} – {format(addDays(weekStart, 4), "MMM d, yyyy")}
          </span>
          {saving && <span className="mc-saving-dot" title="Saving…" />}
        </div>

        <div className="mc-header-right">
          {/* Mode toggle */}
          <div className="mc-mode-toggle">
            <button
              className={mode === "current" ? "active" : ""}
              onClick={() => setMode("current")}
            >
              Current Meal
            </button>
            <button
              className={mode === "week" ? "active" : ""}
              onClick={() => setMode("week")}
            >
              Week View
            </button>
          </div>
        </div>
      </div>

      {/* ── Classroom selector ── */}
      <div className="mc-class-bar">
        {classrooms.map((cls) => (
          <button
            key={cls.id}
            className={`mc-class-btn ${selectedClassId === cls.id ? "active" : ""}`}
            onClick={() => setSelectedClassId(cls.id)}
          >
            {cls.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mc-loading">Loading roster…</div>
      ) : mode === "current" ? (
        <CurrentMode
          roster={roster}
          records={records}
          activeSlots={activeSlots}
          claimExcluded={claimExcluded}
          selectedSlot={selectedSlot}
          setSelectedSlot={setSelectedSlot}
          todayDayKey={todayDayKey}
          dayBlocked={dayBlocked}
          toggle={toggle}
          checkedCount={checkedCount}
          milkForSlot={milkForSlot}
          pending={pending}
        />
      ) : (
        <WeekMode
          roster={roster}
          records={records}
          activeSlots={activeSlots}
          claimExcluded={claimExcluded}
          dayBlocked={dayBlocked}
          toggle={toggle}
          milkForSlot={milkForSlot}
          weekStart={weekStart}
          pending={pending}
        />
      )}

      <style>{styles}</style>
    </div>
  );
}

// ─── Current Meal Mode ────────────────────────────────────────────────────────

function CurrentMode({
  roster,
  records,
  activeSlots,
  claimExcluded,
  selectedSlot,
  setSelectedSlot,
  todayDayKey,
  dayBlocked,
  toggle,
  checkedCount,
  milkForSlot,
  pending,
}: {
  roster: Child[];
  records: Record<string, WeekRecord>;
  activeSlots: SlotKey[];
  claimExcluded: SlotKey;
  selectedSlot: SlotKey;
  setSelectedSlot: (s: SlotKey) => void;
  todayDayKey: DayKey | null;
  dayBlocked: (d: DayKey) => boolean;
  toggle: (c: Child, d: DayKey, s: SlotKey) => void;
  checkedCount: (d: DayKey, s: SlotKey) => number;
  milkForSlot: (s: SlotKey, d: DayKey) => { red: number; pct1: number; subs: { name: string; cups: number; reimbursable: boolean }[] } | null;
  pending: Map<string, boolean>;
}) {
  const effectiveDay = todayDayKey ?? "mon";
  const blocked = dayBlocked(effectiveDay);
  const milk = milkForSlot(selectedSlot, effectiveDay);
  const count = checkedCount(effectiveDay, selectedSlot);
  const isExcluded = selectedSlot === claimExcluded;

  return (
    <div className="mc-current">
      {/* Slot selector */}
      <div className="mc-slot-bar">
        {activeSlots.map((slot) => (
          <button
            key={slot}
            className={`mc-slot-btn ${selectedSlot === slot ? "active" : ""} ${slot === claimExcluded ? "excluded" : ""}`}
            onClick={() => setSelectedSlot(slot)}
          >
            {SLOT_LABELS[slot]}
            {slot === claimExcluded && <span className="mc-no-claim"> ✕</span>}
          </button>
        ))}
      </div>

      {blocked ? (
        <div className="mc-blocked">
          <span>🚫</span>
          <p>Today is a holiday or weekend — no meal count.</p>
        </div>
      ) : (
        <>
          {/* Counter */}
          <div className="mc-counter-bar">
            <span className="mc-counter-num">{count}</span>
            <span className="mc-counter-label">
              checked · {roster.length} in roster
            </span>
            {isExcluded && (
              <span className="mc-excl-badge">Not reimbursed by CACFP</span>
            )}
          </div>

          {/* Large checkboxes */}
          <div className="mc-checklist">
            {roster.map((child) => {
              const col = colName(effectiveDay, selectedSlot);
              const checked = records[child.child_name]?.[col] === 1;
              const isPending = pending.has(`${child.child_name}_${col}`);

              return (
                <button
                  key={child.id}
                  className={`mc-check-row ${checked ? "checked" : ""} ${isPending ? "pending" : ""}`}
                  onClick={() => toggle(child, effectiveDay, selectedSlot)}
                >
                  <span className="mc-checkbox">{checked ? "✓" : ""}</span>
                  <span className="mc-child-name">{child.child_name}</span>
                  {child.milk_kind === "substitute" && (
                    <span className="mc-sub-badge">📋 {child.substitute_milk}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Milk panel */}
          {milk && (
            <div className="mc-milk-panel">
              <div className="mc-milk-title">🥛 Pour now</div>
              <div className="mc-milk-rows">
                {milk.red > 0 && (
                  <div className="mc-milk-item red">
                    <span className="mc-milk-cups">{milk.red}</span>
                    <span className="mc-milk-kind">cups Whole (Red)</span>
                  </div>
                )}
                {milk.pct1 > 0 && (
                  <div className="mc-milk-item pct1">
                    <span className="mc-milk-cups">{milk.pct1}</span>
                    <span className="mc-milk-kind">cups 1% milk</span>
                  </div>
                )}
                {milk.subs.map((s) => (
                  <div key={s.name} className="mc-milk-item sub">
                    <span className="mc-milk-cups">{s.cups}</span>
                    <span className="mc-milk-kind">
                      cups {s.name}
                      {s.reimbursable && " ✓"}
                    </span>
                  </div>
                ))}
                {milk.red === 0 && milk.pct1 === 0 && milk.subs.length === 0 && (
                  <div className="mc-milk-zero">No children checked for this meal</div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Week View (Director / Review) ───────────────────────────────────────────

function WeekMode({
  roster,
  records,
  activeSlots,
  claimExcluded,
  dayBlocked,
  toggle,
  milkForSlot,
  weekStart,
  pending,
}: {
  roster: Child[];
  records: Record<string, WeekRecord>;
  activeSlots: SlotKey[];
  claimExcluded: SlotKey;
  dayBlocked: (d: DayKey) => boolean;
  toggle: (c: Child, d: DayKey, s: SlotKey) => void;
  milkForSlot: (s: SlotKey, d: DayKey) => { red: number; pct1: number; subs: { name: string; cups: number; reimbursable: boolean }[] } | null;
  weekStart: Date;
  pending: Map<string, boolean>;
}) {
  // Build column headers: slot × day pairs
  const cols: { day: DayKey; slot: SlotKey; label: string; date: string }[] = [];
  for (const slot of activeSlots) {
    for (const [i, day] of DAYS.entries()) {
      cols.push({
        day,
        slot,
        label: `${DAY_LABELS[day]} ${SLOT_LABELS[slot].split(" ")[0]}`,
        date: format(addDays(weekStart, i), "M/d"),
      });
    }
  }

  return (
    <div className="mc-week-wrap">
      <div className="mc-week-scroll">
        <table className="mc-week-table">
          <thead>
            {/* Slot grouping row */}
            <tr>
              <th className="mc-th-name" rowSpan={2}>#</th>
              <th className="mc-th-name" rowSpan={2}>Child's Name</th>
              <th className="mc-th-name" rowSpan={2}>Milk</th>
              <th className="mc-th-name" rowSpan={2}>oz</th>
              {activeSlots.map((slot) => (
                <th
                  key={slot}
                  colSpan={5}
                  className={`mc-th-slot ${slot === claimExcluded ? "excluded" : ""}`}
                >
                  {SLOT_LABELS[slot]}
                  {slot === claimExcluded && " ✕"}
                </th>
              ))}
            </tr>
            {/* Day columns row */}
            <tr>
              {activeSlots.flatMap((slot) =>
                DAYS.map((day, i) => {
                  const blocked = dayBlocked(day);
                  return (
                    <th
                      key={`${slot}_${day}`}
                      className={`mc-th-day ${blocked ? "blocked" : ""}`}
                    >
                      <div>{DAY_LABELS[day]}</div>
                      <div className="mc-th-date">
                        {format(addDays(weekStart, i), "M/d")}
                      </div>
                    </th>
                  );
                })
              )}
            </tr>
          </thead>

          <tbody>
            {roster.map((child, idx) => (
              <tr key={child.id} className="mc-tr">
                <td className="mc-td-num">{idx + 1}</td>
                <td className="mc-td-name">{child.child_name}</td>
                <td className="mc-td-milk">
                  {child.milk_kind === "red"
                    ? "Red"
                    : child.milk_kind === "1pct"
                    ? "1%"
                    : <span className="mc-sub-tag">📋 {child.substitute_milk}</span>}
                </td>
                <td className="mc-td-oz">{child.rate_oz}</td>

                {activeSlots.flatMap((slot) =>
                  DAYS.map((day) => {
                    const col = colName(day, slot);
                    const blocked = dayBlocked(day);
                    const checked = records[child.child_name]?.[col] === 1;
                    const isPending = pending.has(`${child.child_name}_${col}`);

                    return (
                      <td key={`${slot}_${day}`} className={`mc-td-cell ${blocked ? "blocked" : ""}`}>
                        {blocked ? (
                          <span className="mc-hol">—</span>
                        ) : (
                          <button
                            className={`mc-cell-btn ${checked ? "checked" : ""} ${isPending ? "pending" : ""}`}
                            onClick={() => toggle(child, day, slot)}
                            title={`${child.child_name} · ${DAY_LABELS[day]} ${SLOT_LABELS[slot]}`}
                          >
                            {checked ? "✓" : ""}
                          </button>
                        )}
                      </td>
                    );
                  })
                )}
              </tr>
            ))}

            {/* Milk totals row */}
            <tr className="mc-tr-milk">
              <td colSpan={4} className="mc-td-milk-label">Total milk (CUPS)</td>
              {activeSlots.flatMap((slot) =>
                DAYS.map((day) => {
                  const milk = milkForSlot(slot, day);
                  if (!milk) return (
                    <td key={`milk_${slot}_${day}`} className="mc-td-milk-val no-milk">—</td>
                  );
                  const total = milk.red + milk.pct1 + milk.subs.reduce((a, s) => a + s.cups, 0);
                  return (
                    <td key={`milk_${slot}_${day}`} className="mc-td-milk-val">
                      {total > 0 ? (
                        <span title={[
                          milk.red ? `Red: ${milk.red}c` : "",
                          milk.pct1 ? `1%: ${milk.pct1}c` : "",
                          ...milk.subs.map((s) => `${s.name}: ${s.cups}c`),
                        ].filter(Boolean).join(" / ")}>
                          {total}
                        </span>
                      ) : "—"}
                    </td>
                  );
                })
              )}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = `
/* ── Page shell ─────────────────────────────── */
.mc-page {
  min-height: 100vh;
  background: #f4f7f4;
  font-family: 'DM Sans', sans-serif;
  color: #1a2e1a;
}

.mc-loading {
  padding: 2rem;
  color: #666;
  font-size: 0.95rem;
}

/* ── Header ──────────────────────────────────── */
.mc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem 0.75rem;
  background: #0f4c35;
  color: #fff;
}

.mc-header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.mc-title {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
  color: #fff;
}

.mc-week-label {
  font-size: 0.85rem;
  opacity: 0.75;
}

.mc-saving-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #7ee8b0;
  animation: mc-pulse 1s ease-in-out infinite;
}

@keyframes mc-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* ── Mode toggle ─────────────────────────────── */
.mc-mode-toggle {
  display: flex;
  background: rgba(255,255,255,0.15);
  border-radius: 8px;
  overflow: hidden;
}

.mc-mode-toggle button {
  padding: 0.4rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: rgba(255,255,255,0.7);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.mc-mode-toggle button.active {
  background: #7ee8b0;
  color: #0a3320;
}

/* ── Classroom bar ───────────────────────────── */
.mc-class-bar {
  display: flex;
  gap: 0.5rem;
  padding: 0.65rem 1rem;
  background: #0a3320;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.mc-class-btn {
  flex-shrink: 0;
  padding: 0.4rem 0.9rem;
  font-size: 0.82rem;
  font-weight: 600;
  border-radius: 20px;
  border: 1.5px solid rgba(126,232,176,0.35);
  background: transparent;
  color: rgba(255,255,255,0.65);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.mc-class-btn.active {
  background: #7ee8b0;
  color: #0a3320;
  border-color: #7ee8b0;
}

/* ── Current mode ─────────────────────────────── */
.mc-current {
  padding: 0.75rem 1rem 2rem;
}

/* Slot selector */
.mc-slot-bar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  overflow-x: auto;
}

.mc-slot-btn {
  flex-shrink: 0;
  padding: 0.5rem 1rem;
  font-size: 0.88rem;
  font-weight: 600;
  border-radius: 8px;
  border: 2px solid #d0e8d0;
  background: #fff;
  color: #555;
  cursor: pointer;
  transition: all 0.15s;
}

.mc-slot-btn.active {
  background: #0f4c35;
  color: #fff;
  border-color: #0f4c35;
}

.mc-slot-btn.excluded {
  opacity: 0.7;
}

.mc-no-claim {
  color: #d44;
  margin-left: 0.25rem;
}

/* Counter */
.mc-counter-bar {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  padding: 0.6rem 0.75rem;
  background: #e8f4e8;
  border-radius: 10px;
}

.mc-counter-num {
  font-size: 2rem;
  font-weight: 800;
  color: #0f4c35;
  line-height: 1;
}

.mc-counter-label {
  font-size: 0.9rem;
  color: #4a6e4a;
}

.mc-excl-badge {
  margin-left: auto;
  font-size: 0.75rem;
  background: #fff3cd;
  color: #856404;
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  font-weight: 600;
}

/* Blocked day */
.mc-blocked {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 3rem 1rem;
  color: #888;
  font-size: 1rem;
}

.mc-blocked span {
  font-size: 2.5rem;
}

/* Large checklist */
.mc-checklist {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.mc-check-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
  min-height: 60px;
  padding: 0.75rem 1rem;
  background: #fff;
  border: 2px solid #e0ebe0;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.12s;
  text-align: left;
}

.mc-check-row.checked {
  background: #e8f7ee;
  border-color: #0f4c35;
}

.mc-check-row.pending {
  opacity: 0.6;
}

.mc-checkbox {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 2.5px solid #c0d8c0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  font-weight: 700;
  color: #0f4c35;
  flex-shrink: 0;
  background: #fff;
  transition: all 0.12s;
}

.mc-check-row.checked .mc-checkbox {
  background: #0f4c35;
  border-color: #0f4c35;
  color: #7ee8b0;
}

.mc-child-name {
  font-size: 1.05rem;
  font-weight: 600;
  color: #1a2e1a;
  flex: 1;
}

.mc-sub-badge {
  font-size: 0.78rem;
  background: #fff8e1;
  color: #7a5800;
  padding: 0.2rem 0.5rem;
  border-radius: 8px;
}

/* Milk panel */
.mc-milk-panel {
  background: #0f4c35;
  border-radius: 14px;
  padding: 1rem 1.25rem;
  color: #fff;
}

.mc-milk-title {
  font-size: 0.9rem;
  font-weight: 700;
  opacity: 0.75;
  margin-bottom: 0.6rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.mc-milk-rows {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.mc-milk-item {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.mc-milk-cups {
  font-size: 2rem;
  font-weight: 800;
  line-height: 1;
  color: #7ee8b0;
}

.mc-milk-kind {
  font-size: 0.95rem;
  opacity: 0.85;
}

.mc-milk-zero {
  font-size: 0.9rem;
  opacity: 0.5;
}

/* ── Week mode ─────────────────────────────────── */
.mc-week-wrap {
  padding: 0.75rem 0 2rem;
}

.mc-week-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.mc-week-table {
  border-collapse: collapse;
  min-width: 900px;
  font-size: 0.82rem;
  background: #fff;
}

.mc-week-table th,
.mc-week-table td {
  border: 1px solid #e0ebe0;
}

.mc-th-name {
  background: #0f4c35;
  color: #fff;
  padding: 0.5rem 0.6rem;
  text-align: left;
  font-weight: 700;
  white-space: nowrap;
}

.mc-th-slot {
  background: #1a6645;
  color: #fff;
  padding: 0.4rem 0.5rem;
  text-align: center;
  font-weight: 700;
  white-space: nowrap;
}

.mc-th-slot.excluded {
  background: #5a5a3a;
}

.mc-th-day {
  background: #e8f4e8;
  color: #1a2e1a;
  padding: 0.3rem 0.4rem;
  text-align: center;
  font-weight: 600;
  min-width: 46px;
}

.mc-th-day.blocked {
  background: #f0f0f0;
  color: #aaa;
}

.mc-th-date {
  font-size: 0.72rem;
  font-weight: 400;
  opacity: 0.7;
}

.mc-tr:nth-child(even) {
  background: #f9fcf9;
}

.mc-td-num {
  padding: 0.4rem 0.5rem;
  color: #888;
  text-align: center;
  min-width: 28px;
}

.mc-td-name {
  padding: 0.4rem 0.6rem;
  font-weight: 600;
  white-space: nowrap;
}

.mc-td-milk {
  padding: 0.4rem 0.5rem;
  text-align: center;
  white-space: nowrap;
}

.mc-sub-tag {
  font-size: 0.75rem;
  color: #7a5800;
}

.mc-td-oz {
  padding: 0.4rem 0.5rem;
  text-align: center;
  color: #555;
}

.mc-td-cell {
  padding: 0.2rem;
  text-align: center;
}

.mc-td-cell.blocked {
  background: #f5f5f5;
}

.mc-hol {
  color: #ccc;
  font-size: 0.85rem;
}

.mc-cell-btn {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  border: 1.5px solid #d0e8d0;
  background: #fff;
  color: #0f4c35;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.1s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.mc-cell-btn.checked {
  background: #0f4c35;
  border-color: #0f4c35;
  color: #7ee8b0;
}

.mc-cell-btn.pending {
  opacity: 0.5;
}

/* Milk totals row */
.mc-tr-milk {
  background: #e8f4e8 !important;
  border-top: 2px solid #0f4c35;
}

.mc-td-milk-label {
  padding: 0.45rem 0.6rem;
  font-weight: 700;
  color: #0f4c35;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.mc-td-milk-val {
  padding: 0.35rem 0.4rem;
  text-align: center;
  font-weight: 700;
  color: #0f4c35;
  font-size: 0.88rem;
}

.mc-td-milk-val.no-milk {
  color: #ccc;
  font-weight: 400;
}

/* ═══════════════════════════════════════════════════════
   MOBILE / TABLET ADAPTATION  (≤768px)
   Primary target: iPad in portrait, iPhone
═══════════════════════════════════════════════════════ */

@media (max-width: 768px) {
  .mc-page { font-size: 15px; }

  .mc-header { padding: 10px 12px; flex-wrap: wrap; gap: 8px; }
  .mc-title { font-size: 18px; }
  .mc-week-label { font-size: 12px; }
  .mc-header-right { width: 100%; justify-content: flex-end; }

  .mc-mode-toggle button { padding: 6px 12px; font-size: 13px; }

  .mc-class-bar {
    padding: 8px 10px; gap: 6px;
    flex-wrap: nowrap; overflow-x: auto;
    -webkit-overflow-scrolling: touch; scrollbar-width: none;
  }
  .mc-class-bar::-webkit-scrollbar { display: none; }
  .mc-class-pill { flex-shrink: 0; padding: 6px 14px; font-size: 13px; white-space: nowrap; }

  .mc-slot-bar { padding: 10px 10px 0; gap: 6px; }
  .mc-slot-btn { flex: 1; padding: 10px 4px; font-size: 13px; }

  .mc-day-bar { padding: 8px 10px 0; gap: 4px; }
  .mc-day-btn { flex: 1; padding: 8px 2px; font-size: 12px; }

  .mc-counter { margin: 10px 10px 6px; padding: 10px 14px; font-size: 14px; }
  .mc-counter-num { font-size: 28px; }

  .mc-checklist { padding: 0 10px; gap: 8px; }
  .mc-check-row { padding: 16px 14px; border-radius: 12px; gap: 14px; }
  .mc-check-row:active { transform: scale(0.98); }

  .mc-checkbox { width: 40px; height: 40px; border-radius: 8px; font-size: 22px; flex-shrink: 0; }
  .mc-child-name { font-size: 17px; }
  .mc-milk-badge { font-size: 12px; text-align: right; flex-shrink: 0; }

  .mc-milk-panel {
    position: sticky; bottom: 0;
    margin: 12px 10px 0; padding: 14px 16px;
    border-radius: 14px 14px 0 0;
    box-shadow: 0 -4px 16px rgba(0,0,0,0.15);
  }
  .mc-milk-cups { font-size: 48px; line-height: 1; }
  .mc-milk-label { font-size: 13px; }

  .mc-blocked-day { padding: 20px 14px; font-size: 14px; border-radius: 10px; margin: 10px; }

  .mc-week-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .mc-week-table { font-size: 11px; min-width: 680px; }
  .mc-week-table th, .mc-week-table td { padding: 5px 3px; }
  .mc-week-cell-btn { width: 28px; height: 28px; font-size: 14px; }
  .mc-name-cell { min-width: 110px; font-size: 12px; }
}

@media (max-width: 390px) {
  .mc-check-row { padding: 14px 10px; }
  .mc-child-name { font-size: 15px; }
  .mc-checkbox { width: 36px; height: 36px; }
  .mc-milk-cups { font-size: 40px; }
}

@media (min-width: 769px) and (max-width: 1180px) and (orientation: landscape) {
  .mc-checklist { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
}

`;
