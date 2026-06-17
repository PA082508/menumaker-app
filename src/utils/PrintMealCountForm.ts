// src/utils/PrintMealCountForm.ts
// Generates and opens a printable CACFP weekly meal count attendance form.

import { supabase } from "@/lib/supabase";
import { format, addDays } from "date-fns";

export interface PrintMealCountParams {
  centerId:      string;
  classroomId:   string;
  classroomName: string;
  teacherName:   string;
  mondayDate:    string;   // "yyyy-MM-dd"
  reportMonth:   number;
  reportYear:    number;
}

const SLOT_KEYS = ["b","as","l","ps","su","es"];
const SLOT_LABEL: Record<string,string> = {
  b:"Breakfast", as:"AM Snack", l:"Lunch", ps:"PM Snack", su:"Supper", es:"Eve Snack"
};
const DAY_KEYS  = ["mon","tue","wed","thu","fri"];
const DAY_LABEL = ["Monday","Tuesday","Wednesday","Thursday","Friday"];
const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];

const SLOT_MAP: Record<string,string> = {
  breakfast:"b", am_snack:"as", lunch:"l", pm_snack:"ps", supper:"su", evening_snack:"es"
};

export async function printMealCountForm(params: PrintMealCountParams): Promise<void> {
  const { centerId, classroomId, classroomName, teacherName, mondayDate, reportMonth, reportYear } = params;

  // ── Fetch active slots ──────────────────────────────────────────────────────
  const { data: cfg } = await supabase.schema("menumaker").from("meal_count_settings")
    .select("active_slots").eq("center_id", centerId).single();

  const activeSlots: string[] =
    cfg?.active_slots?.map((s: string) => SLOT_MAP[s] || s) ?? ["b","as","l","su"];

  // ── Fetch roster ────────────────────────────────────────────────────────────
  const { data: rosterRaw } = await supabase.schema("menumaker").from("roster")
    .select("id,child_name,age_group_food")
    .eq("classroom_id", classroomId).eq("is_active", true)
    .order("child_name");
  const roster = rosterRaw ?? [];

  // ── Fetch existing records for this week ────────────────────────────────────
  const { data: recordsRaw } = await supabase.schema("menumaker").from("meal_week_records")
    .select("*").eq("classroom_id", classroomId).eq("monday_date", mondayDate);
  const records = (recordsRaw ?? []) as any[];

  const recMap: Record<string, any> = {};
  for (const r of records) recMap[r.child_name] = r;

  // ── Date helpers ────────────────────────────────────────────────────────────
  const monday = new Date(mondayDate + "T12:00:00");
  const dates  = DAY_KEYS.map((_, i) => format(addDays(monday, i), "M/d"));
  const nSlots = activeSlots.length;

  function checked(childName: string, dk: string, sk: string): boolean {
    return (recMap[childName]?.[`${dk}_${sk}`] ?? 0) === 1;
  }

  function slotTotal(dk: string, sk: string): number {
    return roster.filter(c => checked(c.child_name, dk, sk)).length;
  }

  // ── Build HTML ──────────────────────────────────────────────────────────────
  const CS = (extra = "") =>
    `border:1px solid #ccc;padding:3px 5px;text-align:center;font-size:8.5pt;${extra}`;

  const dayHeaderCols = DAY_KEYS.map((_, di) =>
    `<th colspan="${nSlots}" style="${CS(`background:#1a5276;color:#fff;border:1px solid #0d3a5c;` +
      (di > 0 ? "border-left:2px solid #555;" : ""))}">${DAY_LABEL[di].slice(0,3)}&nbsp;${dates[di]}</th>`
  ).join("");

  const slotSubCols = DAY_KEYS.flatMap((_, di) =>
    activeSlots.map((sk, si) =>
      `<th style="${CS(`background:#d6e4f0;font-size:7pt;` + (si===0&&di>0?"border-left:2px solid #555;":""))}">
        ${sk==="as"?"Snk":(SLOT_LABEL[sk]||sk).slice(0,3)}</th>`
    )
  ).join("");

  const childRows = roster.map((child, idx) => {
    const cells = DAY_KEYS.flatMap((dk, di) =>
      activeSlots.map((sk, si) => {
        const mark = checked(child.child_name, dk, sk) ? "✓" : "";
        const lb = (si===0&&di>0) ? "border-left:2px solid #aaa;" : "";
        return `<td style="${CS(lb)}"><b style="color:#0f4c35;font-size:10pt;">${mark}</b></td>`;
      })
    ).join("");
    const bg = idx % 2 === 0 ? "#fff" : "#f7f7f7";
    return `<tr style="background:${bg};">
      <td style="${CS("text-align:right;color:#999;padding:3px 5px;")} ">${idx+1}</td>
      <td style="${CS("text-align:left;padding:3px 8px;font-weight:500;min-width:150px;")}">
        ${child.child_name}</td>
      ${cells}</tr>`;
  }).join("");

  const totalCells = DAY_KEYS.flatMap((dk, di) =>
    activeSlots.map((sk, si) => {
      const n = slotTotal(dk, sk);
      const lb = (si===0&&di>0) ? "border-left:2px solid #aaa;" : "";
      return `<td style="${CS(`font-weight:700;color:#0f4c35;background:#e8f4e8;${lb}`)}">${n||""}</td>`;
    })
  ).join("");

  const weekStatus = records.length > 0
    ? (records.every(r => r.status === "director_approved") ? "✅ Approved" : "📝 Draft")
    : "No data";

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Meal Count · ${classroomName} · ${mondayDate}</title>
<style>
  @page { size: landscape; margin: .35in .4in .35in .4in; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; }
  table { border-collapse: collapse; width: 100%; }
  .no-print { margin-top: 18px; text-align: center; }
  @media print { .no-print { display: none; } }
  button { padding: 7px 18px; font-size: 10pt; cursor: pointer; border-radius: 5px; }
</style>
</head>
<body>

<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:7px;">
  <div>
    <div style="font-size:13pt;font-weight:bold;color:#0f4c35;">
      Play Academy — CACFP Daily Meal Count Record
    </div>
    <div style="font-size:8pt;color:#666;margin-top:2px;">
      Site #011269 · 201 Alpha Park, Highland Heights, OH 44143
    </div>
  </div>
  <div style="text-align:right;font-size:9pt;line-height:1.6;">
    <div><b>Month:</b> ${MONTH_NAMES[reportMonth-1]} ${reportYear}</div>
    <div><b>Week of:</b> ${dates[0]} – ${dates[4]}</div>
    <div><b>Status:</b> ${weekStatus}</div>
  </div>
</div>

<table style="margin-bottom:7px;border:1px solid #aaa;font-size:9pt;">
  <tr>
    <td style="padding:3px 8px;border:1px solid #ccc;"><b>Classroom:</b> ${classroomName}</td>
    <td style="padding:3px 8px;border:1px solid #ccc;"><b>Teacher:</b> ${teacherName || "________________________"}</td>
    <td style="padding:3px 8px;border:1px solid #ccc;"><b>Children enrolled:</b> ${roster.length}</td>
  </tr>
</table>

<table>
  <thead>
    <tr>
      <th rowspan="2" style="${CS("background:#0a3320;color:#fff;width:22px;")} ">#</th>
      <th rowspan="2" style="${CS("background:#0a3320;color:#fff;text-align:left;padding:3px 8px;min-width:150px;")}">
        Child's Name</th>
      ${dayHeaderCols}
    </tr>
    <tr>${slotSubCols}</tr>
  </thead>
  <tbody>
    ${childRows}
    <tr style="border-top:2px solid #333;">
      <td colspan="2" style="${CS("text-align:right;padding:3px 8px;font-weight:700;background:#e8f4e8;")}">
        DAILY TOTALS</td>
      ${totalCells}
    </tr>
  </tbody>
</table>

<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:14px;font-size:8.5pt;">
  <div style="border-top:1px solid #555;padding-top:4px;">
    Cook Signature: _______________________</div>
  <div style="border-top:1px solid #555;padding-top:4px;">
    Director Initials: ____________ &nbsp; Date: ____________</div>
  <div style="border-top:1px solid #555;padding-top:4px;">
    Printed: ${format(new Date(), "M/d/yyyy h:mm a")}</div>
</div>

<div class="no-print">
  <button onclick="window.print()" style="background:#0f4c35;color:#fff;border:none;margin-right:8px;">
    🖨️ Print</button>
  <button onclick="window.close()" style="background:#fff;color:#333;border:1px solid #ccc;">
    ✕ Close</button>
</div>

</body>
</html>`;

  const win = window.open("", "_blank", "width=1150,height=800,scrollbars=yes");
  if (!win) {
    alert("Pop-up blocked — please allow pop-ups for this site and try again.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
}
