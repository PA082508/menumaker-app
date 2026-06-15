// src/pages/meal-count/MealCountPage.tsx
// MenuMaker · Meal Count module
// Modes:
//   "current"  — runner/teacher: one slot, large checkboxes, milk panel
//   "week"     — review grid (all roles)
//   "director" — week grid + initials + Approve + scan upload (director only)

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { format, startOfWeek, addDays, isWeekend } from "date-fns";

// ─── Types ───────────────────────────────────────────────────────────────────

type SlotKey = "breakfast" | "am_snack" | "lunch" | "supper";
type DayKey  = "mon" | "tue" | "wed" | "thu" | "fri";
type Mode    = "current" | "week" | "director";

interface Child {
  id: string;
  child_name: string;
  milk_kind: "red" | "1pct" | "substitute";
  substitute_milk: string | null;
  substitute_reimbursable: boolean;
  rate_oz: number;
  age_group_food: string;
  birthday: string | null;
}

interface MilkRateRow {
  age_group: string;
  milk_type: string;  // formula, red, 1pct, none
  rate_oz: number;
}

// Auto-calculate age group from birthday
function calcAgeGroup(birthday: string | null): string {
  if (!birthday) return "3_5";
  const bday = new Date(birthday);
  const now = new Date();
  const months = (now.getFullYear() - bday.getFullYear()) * 12 + (now.getMonth() - bday.getMonth());
  if (months < 6)  return "infant_0_5m";
  if (months < 12) return "infant_6_11m";
  if (months < 24) return "1y";
  if (months < 36) return "2y";
  if (months < 72) return "3_5";
  return "6_12";
}

function isInfant(ageGroup: string) {
  return ageGroup === "infant_0_5m" || ageGroup === "infant_6_11m";
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
const SLOT_TYPE: Record<SlotKey, "meal"|"snack"> = {
  breakfast: "meal", am_snack: "snack", lunch: "meal", supper: "meal",
};
const SLOT_PRIORITY: Record<SlotKey, number> = {
  breakfast: 1, am_snack: 2, lunch: 3, supper: 4,
};
const DAY_LABELS: Record<DayKey, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri",
};
const DAYS: DayKey[] = ["mon","tue","wed","thu","fri"];

// ─── CACFP reimbursement logic ────────────────────────────────────────────────

function reimbursableSlots(checkedSlots: SlotKey[]): Set<SlotKey> {
  if (!checkedSlots.length) return new Set();
  const meals  = checkedSlots.filter(s => SLOT_TYPE[s] === "meal");
  const snacks = checkedSlots.filter(s => SLOT_TYPE[s] === "snack");
  let maxMeals = 2, maxSnacks = 1;
  if (snacks.length > meals.length) { maxMeals = 1; maxSnacks = 2; }
  const keptMeals  = [...meals].sort((a,b) => SLOT_PRIORITY[b]-SLOT_PRIORITY[a]).slice(0,maxMeals);
  const keptSnacks = [...snacks].sort((a,b) => SLOT_PRIORITY[b]-SLOT_PRIORITY[a]).slice(0,maxSnacks);
  return new Set([...keptMeals, ...keptSnacks]);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const colName = (day: DayKey, slot: SlotKey) => `${day}_${SLOT_COL[slot]}`;
const mondayOf = (d: Date) => startOfWeek(d, { weekStartsOn: 1 });
const ceilCups = (oz: number) => Math.ceil(oz / 8);

// ─── Main component ───────────────────────────────────────────────────────────

export default function MealCountPage() {
  const { role } = useAuth();
  const isDirector = role === "director";

  const [mode, setMode] = useState<Mode>("current");
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClassId, setSelectedClassId]     = useState("");
  const [selectedClassName, setSelectedClassName] = useState("");
  const [settings, setSettings] = useState<MealCountSettings | null>(null);
  const [milkRates, setMilkRates] = useState<MilkRateRow[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<SlotKey>("breakfast");
  const [roster, setRoster]   = useState<Child[]>([]);
  const [records, setRecords] = useState<Record<string, WeekRecord>>({});
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [pending, setPending]   = useState<Map<string, boolean>>(new Map());
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const today = new Date();
    const dow = today.getDay();
    const mon = mondayOf(today);
    // Saturday → +2 days to next Monday; Sunday → +1 day
    if (dow === 6) return addDays(mon, 7);
    if (dow === 0) return addDays(mon, 1);
    return mon;
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  const isStaff = selectedClassName.toLowerCase().includes("staff");

  const todayDayKey = ((): DayKey => {
    const map: Record<number, DayKey> = {1:"mon",2:"tue",3:"wed",4:"thu",5:"fri"};
    return map[new Date().getDay()] ?? "mon"; // weekend → monday
  })();

  const [selectedDay, setSelectedDay] = useState<DayKey>(todayDayKey);

  // ─── Load classrooms + settings ──────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const { data: cls, error: clsErr } = await supabase
        .schema("menumaker").from("classrooms")
        .select("id,class_key,name,sort_order")
        .eq("is_active", true).order("sort_order");
      console.log("classrooms:", cls, "error:", clsErr);
      if (cls?.length) {
        setClassrooms(cls);
        setSelectedClassId(cls[0].id);
        setSelectedClassName(cls[0].name);
      }

      const { data: cfg } = await supabase
        .schema("menumaker").from("meal_count_settings")
        .select("active_slots,milk_slots").limit(1).single();
      if (cfg) setSettings(cfg as MealCountSettings);

      const { data: rates } = await supabase
        .schema("menumaker").from("milk_rates")
        .select("age_group,milk_type,rate_oz").order("sort_order");
      if (rates) setMilkRates(rates as MilkRateRow[]);

      const mon = format(mondayOf(new Date()), "yyyy-MM-dd");
      const fri = format(addDays(mondayOf(new Date()), 4), "yyyy-MM-dd");
      const { data: hols } = await supabase
        .schema("menumaker").from("holidays")
        .select("holiday_date").gte("holiday_date", mon).lte("holiday_date", fri);
      if (hols) setHolidays(new Set(hols.map((h:{holiday_date:string}) => h.holiday_date)));
    })();
  }, []);

  // ─── Load roster + records ────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedClassId) return;
    setLoading(true);
    (async () => {
      const mon = format(weekStart, "yyyy-MM-dd");
      const { data: kids } = await supabase
        .schema("menumaker").from("roster")
        .select("id,child_name,milk_kind,substitute_milk,substitute_reimbursable,rate_oz,age_group_food,birthday")
        .eq("classroom_id", selectedClassId).eq("is_active", true).order("age_group_food").order("child_name");
      setRoster((kids ?? []) as Child[]);

      const { data: recs } = await supabase
        .schema("menumaker").from("meal_week_records")
        .select("*").eq("classroom_id", selectedClassId).eq("monday_date", mon);
      const map: Record<string, WeekRecord> = {};
      for (const r of recs ?? []) map[r.child_name] = r;
      setRecords(map);
      setLoading(false);
    })();
  }, [selectedClassId, weekStart]);

  // ─── Toggle checkbox ──────────────────────────────────────────────────────

  const toggle = useCallback(async (child: Child, day: DayKey, slot: SlotKey) => {
    const col = colName(day, slot);
    const existing = records[child.child_name];
    const current  = existing ? (existing[col] as number) : 0;
    const next     = current ? 0 : 1;

    setRecords(prev => ({
      ...prev,
      [child.child_name]: { ...(prev[child.child_name] ?? { child_name: child.child_name }), [col]: next },
    }));
    const key = `${child.child_name}_${col}`;
    setPending(p => new Map(p).set(key, true));
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
            child_name: child.child_name, monday_date: mon,
            status: "open", source: "app", [col]: next,
          }, { onConflict: "classroom_id,child_name,monday_date" })
          .select().single();
        if (ins) setRecords(prev => ({ ...prev, [child.child_name]: ins as WeekRecord }));
      }
    } catch {
      setRecords(prev => ({ ...prev, [child.child_name]: { ...(prev[child.child_name] ?? {}), [col]: current } }));
    } finally {
      setPending(p => { const n = new Map(p); n.delete(key); return n; });
      setSaving(false);
    }
  }, [records, selectedClassId, selectedClassName, weekStart]);

  // ─── Director: approve week ───────────────────────────────────────────────

  const approveWeek = useCallback(async (initials: string, scanFile: File | null) => {
    const mon = format(weekStart, "yyyy-MM-dd");
    const now = new Date().toISOString();

    // Update all records for this class/week
    const ids = Object.values(records).map(r => r.id).filter(Boolean);
    if (ids.length) {
      await supabase.schema("menumaker").from("meal_week_records")
        .update({ status: "director_approved", director_initials: initials, director_signed_at: now })
        .in("id", ids);
    }

    // Upload attendance scan if provided
    if (scanFile) {
      const path = `${selectedClassId}/${mon}/${scanFile.name}`;
      await supabase.storage.from("attendance-scans").upload(path, scanFile, { upsert: true });

      await supabase.schema("menumaker").from("meal_week_attachments").upsert({
        classroom_id: selectedClassId,
        monday_date: mon,
        file_path: path,
        uploaded_by: "director",
        created_at: now,
      });
    }

    // Refresh records
    const { data: recs } = await supabase
      .schema("menumaker").from("meal_week_records")
      .select("*").eq("classroom_id", selectedClassId).eq("monday_date", mon);
    const map: Record<string, WeekRecord> = {};
    for (const r of recs ?? []) map[r.child_name] = r;
    setRecords(map);
  }, [records, selectedClassId, weekStart]);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function dayTotals(day: DayKey) {
    if (isStaff) return { total: 0, reimbursable: 0 };
    const active = settings?.active_slots ?? (["breakfast","am_snack","lunch","supper"] as SlotKey[]);
    let total = 0, reimbursable = 0;
    for (const child of roster) {
      const checked = active.filter(s => records[child.child_name]?.[colName(day,s)] === 1);
      total += checked.length;
      reimbursable += reimbursableSlots(checked).size;
    }
    return { total, reimbursable };
  }

  function milkForSlot(slot: SlotKey, day: DayKey) {
    if (!settings?.milk_slots.includes(slot)) return null;
    const col = colName(day, slot);
    let red = 0, pct1 = 0;
    const subs: Record<string, { cups: number; reimbursable: boolean }> = {};
    for (const child of roster) {
      if (records[child.child_name]?.[col] !== 1) continue;
      const ageGroup = child.birthday ? calcAgeGroup(child.birthday) : child.age_group_food;
      // Infants get formula — skip milk count
      if (isInfant(ageGroup)) continue;
      // Look up rate from settings table
      const rateRow = milkRates.find(r => r.age_group === ageGroup);
      const oz = rateRow ? rateRow.rate_oz : child.rate_oz;
      const milkType = rateRow ? rateRow.milk_type : child.milk_kind;
      if (milkType === "none" || milkType === "formula") continue;
      if (milkType === "red") red += oz;
      else if (milkType === "1pct") pct1 += oz;
      else {
        const k = child.substitute_milk ?? "Substitute";
        if (!subs[k]) subs[k] = { cups: 0, reimbursable: child.substitute_reimbursable };
        subs[k].cups += oz;
      }
    }
    return {
      red:  red  > 0 ? ceilCups(red)  : 0,
      pct1: pct1 > 0 ? ceilCups(pct1) : 0,
      subs: Object.entries(subs).map(([name,v]) => ({ name, cups: ceilCups(v.cups), reimbursable: v.reimbursable })),
    };
  }

  function checkedCount(day: DayKey, slot: SlotKey) {
    return roster.filter(c => records[c.child_name]?.[colName(day,slot)] === 1).length;
  }

  function dayBlocked(day: DayKey) {
    const date = format(addDays(weekStart, DAYS.indexOf(day)), "yyyy-MM-dd");
    return holidays.has(date) || isWeekend(addDays(weekStart, DAYS.indexOf(day)));
  }

  const activeSlots = settings?.active_slots ?? (["breakfast","am_snack","lunch","supper"] as SlotKey[]);
  const weekStatus  = Object.values(records)[0]?.status ?? "open";
  const isApproved  = weekStatus === "director_approved";

  if (!classrooms.length) return <div className="mc-loading">Loading classrooms…</div>;

  return (
    <div className="mc-page">
      {/* Header */}
      <div className="mc-header">
        <div className="mc-header-left">
          <h1 className="mc-title">Meal Count</h1>
          <div className="mc-week-nav">
            {mode === "director" ? (
              <select
                className="mc-week-select"
                value={format(weekStart, "yyyy-MM-dd")}
                onChange={e => setWeekStart(new Date(e.target.value + "T12:00:00"))}
              >
                {Array.from({length: 12}, (_,i) => {
                  const mon = addDays(mondayOf(new Date()), (i - 8) * 7);
                  const val = format(mon, "yyyy-MM-dd");
                  const label = `${format(mon,"MMM d")} – ${format(addDays(mon,4),"MMM d")}`;
                  return <option key={val} value={val}>{label}</option>;
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
        <div className="mc-mode-toggle">
          <button className={mode==="current"  ? "active":""} onClick={() => setMode("current")}>Current Meal</button>
          <button className={mode==="week"     ? "active":""} onClick={() => setMode("week")}>Week View</button>
          {isDirector && (
            <button className={mode==="director" ? "active director":""} onClick={() => setMode("director")}>Director</button>
          )}
        </div>
      </div>

      {/* Classroom bar */}
      <div className="mc-class-bar">
        {classrooms.map(cls => (
          <button key={cls.id}
            className={`mc-class-btn ${selectedClassId===cls.id?"active":""} ${cls.name.toLowerCase().includes("staff")?"staff":""}`}
            onClick={() => { setSelectedClassId(cls.id); setSelectedClassName(cls.name); }}
          >{cls.name}</button>
        ))}
      </div>

      {loading ? <div className="mc-loading">Loading roster…</div>
        : mode === "current" ? (
          <CurrentMode
            roster={roster} records={records} activeSlots={activeSlots}
            selectedSlot={selectedSlot} setSelectedSlot={setSelectedSlot}
            selectedDay={selectedDay} setSelectedDay={setSelectedDay}
            todayDayKey={todayDayKey} dayBlocked={dayBlocked}
            toggle={toggle} checkedCount={checkedCount}
            milkForSlot={milkForSlot} pending={pending}
            isStaff={isStaff} dayTotals={dayTotals}
          />
        ) : mode === "director" ? (
          <DirectorMode
            roster={roster} records={records} activeSlots={activeSlots}
            dayBlocked={dayBlocked} toggle={toggle}
            milkForSlot={milkForSlot} weekStart={weekStart}
            pending={pending} isStaff={isStaff} dayTotals={dayTotals}
            settings={settings} isApproved={isApproved}
            onApprove={approveWeek} milkRates={milkRates}
          />
        ) : (
          <WeekMode
            roster={roster} records={records} activeSlots={activeSlots}
            dayBlocked={dayBlocked} toggle={toggle}
            milkForSlot={milkForSlot} weekStart={weekStart}
            pending={pending} isStaff={isStaff} dayTotals={dayTotals}
            settings={settings} milkRates={milkRates}
          />
        )
      }
      <style>{styles}</style>
    </div>
  );
}

// ─── Current Meal Mode ────────────────────────────────────────────────────────

function CurrentMode({ roster, records, activeSlots, selectedSlot, setSelectedSlot,
  selectedDay, setSelectedDay, todayDayKey, dayBlocked, toggle, checkedCount,
  milkForSlot, pending, isStaff, dayTotals }: {
  roster: Child[]; records: Record<string,WeekRecord>; activeSlots: SlotKey[];
  selectedSlot: SlotKey; setSelectedSlot:(s:SlotKey)=>void;
  selectedDay: DayKey; setSelectedDay:(d:DayKey)=>void;
  todayDayKey: DayKey;
  dayBlocked:(d:DayKey)=>boolean;
  toggle:(c:Child,d:DayKey,s:SlotKey)=>void;
  checkedCount:(d:DayKey,s:SlotKey)=>number;
  milkForSlot:(s:SlotKey,d:DayKey)=>{red:number;pct1:number;subs:{name:string;cups:number;reimbursable:boolean}[]}|null;
  pending:Map<string,boolean>; isStaff:boolean;
  dayTotals:(d:DayKey)=>{total:number;reimbursable:number};
}) {
  const day = selectedDay;
  const blocked = dayBlocked(day);
  const milk    = milkForSlot(selectedSlot, day);
  const count   = checkedCount(day, selectedSlot);
  const totals  = dayTotals(day);

  return (
    <div className="mc-current">
      {/* Day selector */}
      <div className="mc-day-bar">
        {DAYS.map(d => {
          const isBlocked = dayBlocked(d);
          const isToday   = d === todayDayKey;
          return (
            <button key={d}
              className={`mc-day-btn ${selectedDay===d?"active":""} ${isBlocked?"blocked":""} ${isToday?"today":""}`}
              onClick={() => setSelectedDay(d)}
            >
              {DAY_LABELS[d]}
              {isToday && <span className="mc-today-dot" />}
            </button>
          );
        })}
      </div>

      <div className="mc-slot-bar">
        {activeSlots.map(slot => (
          <button key={slot} className={`mc-slot-btn ${selectedSlot===slot?"active":""}`}
            onClick={() => setSelectedSlot(slot)}>{SLOT_LABELS[slot]}</button>
        ))}
      </div>

      {blocked ? (
        <div className="mc-blocked"><span>🚫</span><p>Holiday or weekend — no meal count.</p></div>
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
            {roster.map(child => {
              const col     = colName(day, selectedSlot);
              const checked = records[child.child_name]?.[col] === 1;
              const isPend  = pending.has(`${child.child_name}_${col}`);
              return (
                <button key={child.id}
                  className={`mc-check-row ${checked?"checked":""} ${isPend?"pending":""}`}
                  onClick={() => toggle(child, day, selectedSlot)}>
                  <span className="mc-checkbox">{checked?"✓":""}</span>
                  <span className="mc-child-name">{child.child_name}</span>
                  {(child.birthday ? calcAgeGroup(child.birthday) : child.age_group_food) === "infant"
                    ? <span className="mc-sub-badge">🍼 Formula</span>
                    : child.milk_kind==="substitute" && <span className="mc-sub-badge">📋 {child.substitute_milk}</span>
                  }
                </button>
              );
            })}
          </div>

          {milk && (
            <div className="mc-milk-panel">
              <div className="mc-milk-title">🥛 Pour now</div>
              <div className="mc-milk-rows">
                {milk.red  > 0 && <div className="mc-milk-item"><span className="mc-milk-cups">{milk.red}</span><span className="mc-milk-kind">cups Whole (Red)</span></div>}
                {milk.pct1 > 0 && <div className="mc-milk-item"><span className="mc-milk-cups">{milk.pct1}</span><span className="mc-milk-kind">cups 1% milk</span></div>}
                {milk.subs.map(s => <div key={s.name} className="mc-milk-item"><span className="mc-milk-cups">{s.cups}</span><span className="mc-milk-kind">cups {s.name}{s.reimbursable?" ✓":""}</span></div>)}
                {milk.red===0 && milk.pct1===0 && milk.subs.length===0 && <div className="mc-milk-zero">No children checked</div>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Shared grid — horizontal layout ────────────────────────────────────────
// Days across top, slots as sub-columns, children as rows

const AGE_LABEL: Record<string,string> = {
  "infant_0_5m":"0-5m", "infant_6_11m":"6-11m",
  "1y":"1yr", "2y":"2yr", "3_5":"3-5y", "6_12":"6-12y"
};

function WeekGrid({ roster, records, activeSlots, dayBlocked, toggle, milkForSlot,
  weekStart, pending, isStaff, dayTotals, milkRates, readOnly }: {
  roster:Child[]; records:Record<string,WeekRecord>; activeSlots:SlotKey[];
  dayBlocked:(d:DayKey)=>boolean; toggle:(c:Child,d:DayKey,s:SlotKey)=>void;
  milkForSlot:(s:SlotKey,d:DayKey)=>{red:number;pct1:number;subs:{name:string;cups:number;reimbursable:boolean}[]}|null;
  weekStart:Date; pending:Map<string,boolean>; isStaff:boolean;
  dayTotals:(d:DayKey)=>{total:number;reimbursable:number};
  settings:MealCountSettings|null; milkRates:MilkRateRow[]; readOnly?:boolean;
}) {
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
            {DAYS.map((day, i) => {
              const blocked = dayBlocked(day);
              return (
                <th key={day} colSpan={nSlots} className={`mc-th-day-group ${blocked?"blocked":""}`}>
                  <span className="mc-th-dayname">{DAY_LABELS[day]}</span>
                  <span className="mc-th-date"> {format(addDays(weekStart,i),"M/d")}</span>
                </th>
              );
            })}
          </tr>
          <tr>
            {DAYS.flatMap(day => {
              const blocked = dayBlocked(day);
              return activeSlots.map(slot => (
                <th key={`${day}_${slot}`} className={`mc-th-slot-sub ${blocked?"blocked":""} ${slot==="breakfast"?"mc-td-day-start":""}`}>
                  {slot==="am_snack"?"Snk":SLOT_LABELS[slot].slice(0,3)}
                </th>
              ));
            })}
          </tr>
        </thead>
        <tbody>
          {roster.map((child, idx) => (
            <tr key={child.id} className="mc-tr">
              <td className="mc-td-num">{idx+1}</td>
              <td className="mc-td-name">{child.child_name}</td>
              <td className="mc-td-age">{AGE_LABEL[child.birthday ? calcAgeGroup(child.birthday) : child.age_group_food] ?? child.age_group_food}</td>
              <td className="mc-td-milk-kind">
                {(() => {
                  const ag = child.birthday ? calcAgeGroup(child.birthday) : child.age_group_food;
                  if (isInfant(ag)) return <span className="mc-formula-tag">Fml</span>;
                  const r = milkRates.find(x => x.age_group === ag);
                  const mt = r ? r.milk_type : child.milk_kind;
                  if (mt === "red") return <span className="mc-red-tag">Red</span>;
                  if (mt === "1pct") return "1%";
                  if (mt === "substitute") return <span className="mc-sub-tag" title={child.substitute_milk??""}>📋</span>;
                  return "—";
                })()}
              </td>
              <td className="mc-td-oz">
                {(() => {
                  const ag = child.birthday ? calcAgeGroup(child.birthday) : child.age_group_food;
                  if (isInfant(ag)) return "—";
                  const r = milkRates.find(x => x.age_group === ag);
                  return r ? r.rate_oz : child.rate_oz;
                })()}
              </td>
              {DAYS.flatMap(day => {
                const blocked = dayBlocked(day);
                return activeSlots.map(slot => {
                  const col = colName(day, slot);
                  const checked = records[child.child_name]?.[col] === 1;
                  const isPend = pending.has(`${child.child_name}_${col}`);
                  return (
                    <td key={`${day}_${slot}`} className={`mc-td-cell ${blocked?"blocked":""} ${slot==="breakfast"?"mc-td-day-start":""}`}>
                      {blocked ? <span className="mc-hol">—</span> : (
                        <button
                          className={`mc-cell-btn ${checked?"checked":""} ${isPend?"pending":""}`}
                          onClick={() => !readOnly && toggle(child,day,slot)}
                          style={readOnly?{cursor:"default"}:{}}
                        >{checked?"✓":""}</button>
                      )}
                    </td>
                  );
                });
              })}
            </tr>
          ))}
          {!isStaff && (
            <tr className="mc-tr-milk">
              <td colSpan={5} className="mc-td-milk-label">Milk (cups)</td>
              {DAYS.flatMap(day => activeSlots.map(slot => {
                const milk = milkForSlot(slot, day);
                if (!milk) return <td key={`milk_${day}_${slot}`} className={`mc-td-milk-val no-milk ${slot==="breakfast"?"mc-td-day-start":""}`}>—</td>;
                const total = milk.red + milk.pct1 + milk.subs.reduce((a,s)=>a+s.cups,0);
                const tip = [milk.red?`Red:${milk.red}c`:"", milk.pct1?`1%:${milk.pct1}c`:""].filter(Boolean).join(" ");
                return <td key={`milk_${day}_${slot}`} className={`mc-td-milk-val ${slot==="breakfast"?"mc-td-day-start":""}`}>{total>0?<span title={tip}>{total}</span>:"—"}</td>;
              }))}
            </tr>
          )}
          {!isStaff && (
            <tr className="mc-tr-reimb">
              <td colSpan={5} className="mc-td-reimb-label">Reimbursable</td>
              {DAYS.map(day => {
                const t = dayTotals(day);
                return (
                  <td key={`reimb_${day}`} colSpan={nSlots} className="mc-td-reimb-val mc-td-day-start">
                    {t.total>0?<span><b>{t.reimbursable}</b><span className="mc-reimb-of">/{t.total}</span></span>:"—"}
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

// ─── Week View ────────────────────────────────────────────────────────────────

function WeekMode(props: Parameters<typeof WeekGrid>[0]) {
  return (
    <div className="mc-week-wrap">
      <WeekGrid {...props} />
    </div>
  );
}

// ─── Director Mode ────────────────────────────────────────────────────────────

function DirectorMode({ isApproved, onApprove, ...gridProps }: Parameters<typeof WeekGrid>[0] & {
  isApproved: boolean;
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
      {/* Director notice */}
      <div className="mc-director-bar">
        <span className="mc-director-label">📋 Director Review</span>
        <span className="mc-director-hint">Edit checkboxes if needed, then approve.</span>
      </div>

      <WeekGrid {...gridProps} readOnly={isApproved} />

      {/* Approve panel */}
      <div className="mc-approve-panel">
        {isApproved ? (
          <div className="mc-approved-msg">
            ✅ Week approved — data is locked for reporting.
          </div>
        ) : (
          <>
            <div className="mc-approve-row">
              <label className="mc-approve-label">Director initials</label>
              <input
                className="mc-initials-input"
                maxLength={4}
                placeholder="e.g. CS"
                value={initials}
                onChange={e => setInitials(e.target.value.toUpperCase())}
              />
            </div>

            <div className="mc-approve-row">
              <label className="mc-approve-label">Attendance scan (PDF / photo)</label>
              <div className="mc-scan-row">
                <button className="mc-scan-btn" onClick={() => fileRef.current?.click()}>
                  📎 {scanFile ? scanFile.name : "Attach file"}
                </button>
                {scanFile && (
                  <button className="mc-scan-clear" onClick={() => setScanFile(null)}>✕</button>
                )}
                <input ref={fileRef} type="file" accept="application/pdf,image/*"
                  style={{display:"none"}}
                  onChange={e => setScanFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>

            <button
              className="mc-approve-btn"
              disabled={!initials.trim() || approving}
              onClick={handleApprove}
            >
              {approving ? "Approving…" : "✓ Approve Week"}
            </button>

            {done && <div className="mc-approved-msg">✅ Approved!</div>}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = `
.mc-page { min-height:100vh; background:#f4f7f4; font-family:'DM Sans',sans-serif; color:#1a2e1a; }
.mc-loading { padding:2rem; color:#666; font-size:.95rem; }

.mc-header { display:flex; align-items:center; justify-content:space-between;
  padding:1rem 1.25rem .75rem; background:#0f4c35; color:#fff; flex-wrap:wrap; gap:.5rem; }
.mc-header-left { display:flex; align-items:center; gap:.75rem; }
.mc-title { font-size:1.25rem; font-weight:700; margin:0; color:#fff; }
.mc-week-nav { display:flex; align-items:center; gap:.35rem; }
.mc-week-select { background:rgba(255,255,255,.15); border:1px solid rgba(255,255,255,.3);
  color:#fff; font-size:.85rem; padding:.3rem .6rem; border-radius:6px; cursor:pointer;
  font-family:inherit; outline:none; }
.mc-week-select option { background:#0f4c35; color:#fff; }
.mc-week-label { font-size:.85rem; opacity:.75; }
.mc-saving-dot { width:8px; height:8px; border-radius:50%; background:#7ee8b0;
  animation:mc-pulse 1s ease-in-out infinite; }
@keyframes mc-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
.mc-approved-badge { font-size:.8rem; background:#7ee8b0; color:#0a3320;
  padding:.2rem .6rem; border-radius:12px; font-weight:700; }

.mc-mode-toggle { display:flex; background:rgba(255,255,255,.15); border-radius:8px; overflow:hidden; }
.mc-mode-toggle button { padding:.4rem .85rem; font-size:.8rem; font-weight:600;
  color:rgba(255,255,255,.7); background:transparent; border:none; cursor:pointer; transition:all .15s; }
.mc-mode-toggle button.active { background:#7ee8b0; color:#0a3320; }
.mc-mode-toggle button.active.director { background:#f0c040; color:#3a2800; }

.mc-class-bar { display:flex; gap:.5rem; padding:.65rem 1rem; background:#0a3320;
  overflow-x:auto; -webkit-overflow-scrolling:touch; }
.mc-class-btn { flex-shrink:0; padding:.4rem .9rem; font-size:.82rem; font-weight:600;
  border-radius:20px; border:1.5px solid rgba(126,232,176,.35); background:transparent;
  color:rgba(255,255,255,.65); cursor:pointer; transition:all .15s; white-space:nowrap; }
.mc-class-btn.active { background:#7ee8b0; color:#0a3320; border-color:#7ee8b0; }
.mc-class-btn.staff { border-color:rgba(255,180,0,.4); color:rgba(255,200,80,.8); }
.mc-class-btn.staff.active { background:#e6a817; color:#3a2800; border-color:#e6a817; }

/* Current mode */
.mc-current { padding:.75rem 1rem 2rem; }
.mc-day-bar { display:flex; gap:.4rem; margin-bottom:.75rem; }
.mc-day-btn { flex:1; padding:.45rem .5rem; font-size:.85rem; font-weight:600;
  border-radius:8px; border:2px solid #d0e8d0; background:#fff; color:#555;
  cursor:pointer; transition:all .15s; position:relative; text-align:center; }
.mc-day-btn.active { background:#0f4c35; color:#fff; border-color:#0f4c35; }
.mc-day-btn.blocked { background:#f5f5f5; color:#bbb; border-color:#e0e0e0; }
.mc-day-btn.today { border-color:#0f4c35; }
.mc-today-dot { position:absolute; bottom:3px; left:50%; transform:translateX(-50%);
  width:5px; height:5px; border-radius:50%; background:#7ee8b0; }
.mc-day-btn.active .mc-today-dot { background:#fff; }
.mc-slot-bar { display:flex; gap:.5rem; margin-bottom:1rem; overflow-x:auto; }
.mc-slot-btn { flex-shrink:0; padding:.5rem 1rem; font-size:.88rem; font-weight:600;
  border-radius:8px; border:2px solid #d0e8d0; background:#fff; color:#555; cursor:pointer; transition:all .15s; }
.mc-slot-btn.active { background:#0f4c35; color:#fff; border-color:#0f4c35; }

.mc-counter-bar { display:flex; align-items:center; gap:.5rem; margin-bottom:.75rem;
  padding:.6rem .75rem; background:#e8f4e8; border-radius:10px; flex-wrap:wrap; }
.mc-counter-num { font-size:2rem; font-weight:800; color:#0f4c35; line-height:1; }
.mc-counter-label { font-size:.9rem; color:#4a6e4a; }
.mc-day-totals { margin-left:auto; display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; }
.mc-tot-item { font-size:.82rem; color:#4a6e4a; }
.mc-tot-sep { color:#aaa; }
.mc-staff-badge { margin-left:auto; font-size:.75rem; background:#fff3cd; color:#856404;
  padding:.2rem .6rem; border-radius:12px; font-weight:600; }

.mc-blocked { display:flex; flex-direction:column; align-items:center; gap:.5rem;
  padding:3rem 1rem; color:#888; }
.mc-blocked span { font-size:2.5rem; }

.mc-checklist { display:flex; flex-direction:column; gap:.5rem; margin-bottom:1.25rem; }
.mc-check-row { display:flex; align-items:center; gap:1rem; width:100%; min-height:60px;
  padding:.75rem 1rem; background:#fff; border:2px solid #e0ebe0; border-radius:12px;
  cursor:pointer; transition:all .12s; text-align:left; }
.mc-check-row.checked { background:#e8f7ee; border-color:#0f4c35; }
.mc-check-row.pending { opacity:.6; }
.mc-checkbox { width:36px; height:36px; border-radius:8px; border:2.5px solid #c0d8c0;
  display:flex; align-items:center; justify-content:center; font-size:1.3rem;
  font-weight:700; color:#0f4c35; flex-shrink:0; background:#fff; transition:all .12s; }
.mc-check-row.checked .mc-checkbox { background:#0f4c35; border-color:#0f4c35; color:#7ee8b0; }
.mc-child-name { font-size:1.05rem; font-weight:600; flex:1; }
.mc-sub-badge { font-size:.78rem; background:#fff8e1; color:#7a5800; padding:.2rem .5rem; border-radius:8px; }

.mc-milk-panel { background:#0f4c35; border-radius:14px; padding:1rem 1.25rem; color:#fff; }
.mc-milk-title { font-size:.9rem; font-weight:700; opacity:.75; margin-bottom:.6rem;
  letter-spacing:.05em; text-transform:uppercase; }
.mc-milk-rows { display:flex; flex-direction:column; gap:.4rem; }
.mc-milk-item { display:flex; align-items:baseline; gap:.5rem; }
.mc-milk-cups { font-size:2rem; font-weight:800; line-height:1; color:#7ee8b0; }
.mc-milk-kind { font-size:.95rem; opacity:.85; }
.mc-milk-zero { font-size:.9rem; opacity:.5; }

/* Week grid */
.mc-week-wrap { padding:.75rem 0 2rem; }
.mc-week-scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; }
.mc-week-table { border-collapse:collapse; font-size:.8rem; background:#fff; }
.mc-week-table th,.mc-week-table td { border:1px solid #dde8dd; }
.mc-th-fixed { background:#0f4c35; color:#fff; padding:.45rem .5rem; text-align:left; font-weight:700; white-space:nowrap; position:sticky; }
.mc-th-child { min-width:140px; }
.mc-th-day-group { background:#1a6645; color:#fff; padding:.35rem .4rem; text-align:center; font-weight:700; }
.mc-th-day-group.blocked { background:#999; }
.mc-th-dayname { font-weight:700; }
.mc-th-date { font-size:.72rem; font-weight:400; opacity:.8; }
.mc-th-slot-sub { background:#e8f4e8; color:#1a2e1a; padding:.25rem .3rem; text-align:center; font-weight:600; font-size:.75rem; min-width:34px; }
.mc-th-slot-sub.blocked { background:#f0f0f0; color:#aaa; }
.mc-td-day-start { border-left:2px solid #0f4c35 !important; }
.mc-tr:nth-child(even) { background:#f9fcf9; }
.mc-td-num { padding:.3rem .4rem; color:#888; text-align:center; min-width:24px; }
.mc-td-name { padding:.3rem .5rem; font-weight:600; white-space:nowrap; }
.mc-td-age { padding:.3rem .4rem; text-align:center; color:#555; font-size:.78rem; white-space:nowrap; }
.mc-td-milk-kind { padding:.3rem .4rem; text-align:center; white-space:nowrap; font-size:.8rem; }
.mc-sub-tag { font-size:.78rem; cursor:help; }
.mc-formula-tag { font-size:.75rem; color:#1a5c8a; font-weight:600; }
.mc-red-tag { font-size:.78rem; color:#b91c1c; font-weight:600; }
.mc-td-oz { padding:.3rem .4rem; text-align:center; color:#555; font-size:.78rem; }
.mc-td-cell { padding:.15rem; text-align:center; }
.mc-td-cell.blocked { background:#f5f5f5; }
.mc-hol { color:#ccc; font-size:.8rem; }
.mc-cell-btn { width:30px; height:30px; border-radius:5px; border:1.5px solid #c8e0c8;
  background:#fff; color:#0f4c35; font-weight:700; font-size:.85rem; cursor:pointer;
  transition:all .1s; display:inline-flex; align-items:center; justify-content:center; }
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

/* Director mode */
.mc-director-bar { display:flex; align-items:center; gap:1rem; padding:.6rem 1rem;
  background:#fff8e1; border-bottom:2px solid #f0c040; }
.mc-director-label { font-weight:700; color:#7a5800; font-size:.9rem; }
.mc-director-hint { font-size:.82rem; color:#9a7820; }

.mc-approve-panel { margin:1.5rem 1rem; padding:1.25rem 1.5rem;
  background:#fff; border-radius:14px; border:2px solid #e0ebe0;
  display:flex; flex-direction:column; gap:1rem; max-width:520px; }
.mc-approve-row { display:flex; flex-direction:column; gap:.4rem; }
.mc-approve-label { font-size:.82rem; font-weight:700; color:#555; text-transform:uppercase; letter-spacing:.04em; }
.mc-initials-input { width:100px; padding:.55rem .75rem; font-size:1.2rem; font-weight:700;
  text-transform:uppercase; letter-spacing:.15em; border:2px solid #c0d8c0;
  border-radius:8px; text-align:center; outline:none; font-family:inherit; }
.mc-initials-input:focus { border-color:#0f4c35; }
.mc-scan-row { display:flex; align-items:center; gap:.5rem; }
.mc-scan-btn { padding:.45rem 1rem; border-radius:8px; border:1.5px solid #c0d8c0;
  background:#f4f7f4; color:#1a2e1a; font-size:.85rem; cursor:pointer; font-family:inherit;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:300px; }
.mc-scan-btn:hover { border-color:#0f4c35; }
.mc-scan-clear { width:28px; height:28px; border-radius:50%; border:1.5px solid #c0d8c0;
  background:#fff; color:#888; cursor:pointer; font-size:.9rem; display:flex;
  align-items:center; justify-content:center; flex-shrink:0; }
.mc-approve-btn { padding:.7rem 1.5rem; background:#0f4c35; color:#fff;
  border:none; border-radius:10px; font-size:1rem; font-weight:700; cursor:pointer;
  transition:background .15s; font-family:inherit; align-self:flex-start; }
.mc-approve-btn:hover:not(:disabled) { background:#1a6645; }
.mc-approve-btn:disabled { opacity:.5; cursor:not-allowed; }
.mc-approved-msg { font-size:.95rem; color:#0f4c35; font-weight:600;
  padding:.6rem 1rem; background:#e8f7ee; border-radius:8px; }
`;
