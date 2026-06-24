/**
 * DeliveryTemperatureLog.tsx  v2
 * Журнал температур транспортировки + колонка событий разогрева (Reheat Events)
 * Ohio OAC 3717-1-03.4 · OAC 3717-1-03.3(I)(4) · OAC 3717-1-03.7
 * Путь в проекте: src/pages/delivery/DeliveryTemperatureLog.tsx
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// ─── типы ───────────────────────────────────────────────────────────────────
interface TempLogRow {
  route_id:          string;
  delivery_date:     string;
  meal_slot:         string;
  dispatched_at:     string | null;
  dispatched_by:     string | null;
  stop_id:           string;
  center_name:       string;
  arrival_window:    string | null;
  temp_at_dispatch:  number | null;
  temp_at_receipt:   number | null;
  received_at:       string | null;
  reheat_temp:       number | null;
  reheat_at:         string | null;
  reheat_by:         string | null;
  status:            "ok" | "reheated" | "violation" | "pending" | "no_data";
}

const MEAL_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  am_snack:  "AM Snack",
  lunch:     "Lunch",
  pm_snack:  "PM Snack",
  supper:    "Supper",
};

function evalStatus(td: number | null, tr: number | null, rh: number | null): TempLogRow["status"] {
  if (td === null && tr === null) return "no_data";
  if (tr === null)                return "pending";
  if (tr >= 135 || tr <= 41)      return "ok";
  // receipt out of range — was it reheated to 165?
  if (rh !== null && rh >= 165)   return "reheated";
  return "violation";
}

const STATUS_STYLE: Record<TempLogRow["status"], string> = {
  ok:        "bg-green-100 text-green-800 border border-green-300",
  reheated:  "bg-blue-100 text-blue-800 border border-blue-300",
  violation: "bg-red-100 text-red-800 border border-red-300 font-bold",
  pending:   "bg-yellow-100 text-yellow-800 border border-yellow-300",
  no_data:   "bg-gray-100 text-gray-500 border border-gray-200",
};

const STATUS_LABEL: Record<TempLogRow["status"], string> = {
  ok:        "✓ Compliant",
  reheated:  "🔥 Reheated OK",
  violation: "⚠ VIOLATION",
  pending:   "⏳ Pending",
  no_data:   "— No Data",
};

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}
function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
function tempColor(t: number | null, min = 135, max = 41): string {
  if (t === null) return "text-gray-400";
  if (t >= min || t <= max) return "text-green-700 font-bold";
  return "text-red-600 font-bold";
}

// ─── компонент ──────────────────────────────────────────────────────────────
interface Props { orgId?: string; defaultFrom?: string; defaultTo?: string; }

export function DeliveryTemperatureLog({ orgId, defaultFrom, defaultTo }: Props) {
  const today      = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";

  const [from, setFrom]   = useState(defaultFrom ?? monthStart);
  const [to, setTo]       = useState(defaultTo   ?? today);
  const [rows, setRows]   = useState<TempLogRow[]>([]);
  const [loading, setLoading] = useState(false);

  // inline edit: stopId → fields
  const [editReceipt, setEditReceipt] = useState<Record<string, { temp: string; time: string }>>({});
  const [editReheat,  setEditReheat]  = useState<Record<string, { temp: string; time: string; by: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      let rq = supabase.schema("menumaker").from("delivery_routes")
        .select("id,delivery_date,meal_slot,dispatched_at,dispatched_by")
        .gte("delivery_date", from).lte("delivery_date", to)
        .order("delivery_date", { ascending: false }).order("meal_slot");
      if (orgId) rq = rq.eq("org_id", orgId);
      const { data: routes } = await rq;
      if (!routes?.length) { setRows([]); return; }

      const { data: stops } = await supabase.schema("menumaker").from("delivery_stops")
        .select("id,route_id,center_id,arrival_window,temp_at_dispatch,temp_at_receipt,received_at,reheat_temp,reheat_at,reheat_by")
        .in("route_id", routes.map(r => r.id));

      const centerIds = [...new Set((stops ?? []).map(s => s.center_id))];
      const { data: centers } = await supabase.schema("menumaker").from("centers")
        .select("id,name").in("id", centerIds);
      const cmap: Record<string,string> = {};
      centers?.forEach(c => { cmap[c.id] = c.name; });

      const built: TempLogRow[] = [];
      for (const route of routes) {
        for (const stop of (stops ?? []).filter(s => s.route_id === route.id)) {
          const td = stop.temp_at_dispatch as number | null;
          const tr = stop.temp_at_receipt  as number | null;
          const rh = stop.reheat_temp      as number | null;
          built.push({
            route_id:         route.id,
            delivery_date:    route.delivery_date,
            meal_slot:        route.meal_slot,
            dispatched_at:    route.dispatched_at,
            dispatched_by:    route.dispatched_by,
            stop_id:          stop.id,
            center_name:      cmap[stop.center_id] ?? stop.center_id,
            arrival_window:   stop.arrival_window,
            temp_at_dispatch: td,
            temp_at_receipt:  tr,
            received_at:      stop.received_at,
            reheat_temp:      rh,
            reheat_at:        stop.reheat_at,
            reheat_by:        stop.reheat_by,
            status:           evalStatus(td, tr, rh),
          });
        }
      }
      setRows(built);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [from, to]);

  async function saveReceipt(stopId: string) {
    const ed = editReceipt[stopId]; if (!ed) return;
    const temp = parseFloat(ed.temp); if (isNaN(temp)) return;
    setSaving(stopId);
    try {
      const received_at = ed.time
        ? new Date(`${today}T${ed.time}`).toISOString()
        : new Date().toISOString();
      await supabase.schema("menumaker").from("delivery_stops")
        .update({ temp_at_receipt: temp, received_at }).eq("id", stopId);
      await load();
      setEditReceipt(p => { const n={...p}; delete n[stopId]; return n; });
    } finally { setSaving(null); }
  }

  async function saveReheat(stopId: string) {
    const ed = editReheat[stopId]; if (!ed) return;
    const temp = parseFloat(ed.temp); if (isNaN(temp)) return;
    setSaving(stopId);
    try {
      const reheat_at = ed.time
        ? new Date(`${today}T${ed.time}`).toISOString()
        : new Date().toISOString();
      await supabase.schema("menumaker").from("delivery_stops")
        .update({ reheat_temp: temp, reheat_at, reheat_by: ed.by || null }).eq("id", stopId);
      await load();
      setEditReheat(p => { const n={...p}; delete n[stopId]; return n; });
    } finally { setSaving(null); }
  }

  const violations = rows.filter(r => r.status === "violation").length;
  const pending    = rows.filter(r => r.status === "pending").length;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">

        {/* header */}
        <div className="flex items-start justify-between mb-6 print:mb-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Food Transport Temperature Log</h1>
            <p className="text-sm text-gray-500 mt-1">
              Play Academy Kitchen · Ohio OAC 3717-1-03.4 · HSP Facility (children ≤9 yrs, OAC 3717-1-03.7)
            </p>
          </div>
          <button onClick={() => window.print()}
            className="print:hidden px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
            🖨 Print Log
          </button>
        </div>

        {/* filters */}
        <div className="flex gap-4 mb-5 print:hidden flex-wrap">
          {[["From", from, setFrom], ["To", to, setTo]].map(([label, val, setter]) => (
            <div key={label as string}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label as string}</label>
              <input type="date" value={val as string}
                onChange={e => (setter as (v:string)=>void)(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
          ))}
          <div className="flex items-end">
            <button onClick={load}
              className="px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-900">Refresh</button>
          </div>
        </div>

        {/* badges */}
        {!loading && rows.length > 0 && (
          <div className="flex gap-3 mb-5 flex-wrap">
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm">
              <span className="text-gray-500">Total: </span><span className="font-bold">{rows.length}</span>
            </div>
            {violations > 0 && (
              <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-2 text-sm text-red-700 font-bold">
                ⚠ {violations} violation{violations>1?"s":""}
              </div>
            )}
            {pending > 0 && (
              <div className="bg-yellow-50 border border-yellow-300 rounded-xl px-4 py-2 text-sm text-yellow-700">
                ⏳ {pending} awaiting receipt temp
              </div>
            )}
            {violations===0 && pending===0 && (
              <div className="bg-green-50 border border-green-300 rounded-xl px-4 py-2 text-sm text-green-700 font-semibold">
                ✓ All compliant
              </div>
            )}
          </div>
        )}

        {/* print period */}
        <div className="hidden print:block mb-3 text-xs text-gray-500">
          Period: {from} — {to} · Printed: {new Date().toLocaleDateString("en-US")}
        </div>

        {loading && <div className="text-center py-16 text-gray-400">Loading…</div>}
        {!loading && rows.length === 0 && (
          <div className="text-center py-16 text-gray-400">No records for this period.</div>
        )}

        {/* table */}
        {!loading && rows.length > 0 && (
          <div className="bg-white rounded-2xl shadow overflow-x-auto print:shadow-none print:rounded-none">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="bg-gray-900 text-white text-[11px] uppercase tracking-wide">
                  <th className="text-left px-3 py-3">Date</th>
                  <th className="text-left px-3 py-3">Meal</th>
                  <th className="text-left px-3 py-3">Destination</th>
                  <th className="text-center px-3 py-3">Dispatch<br/><span className="font-normal normal-case">Time</span></th>
                  <th className="text-center px-3 py-3">Temp °F<br/><span className="font-normal normal-case">Dispatch</span></th>
                  <th className="text-center px-3 py-3">Receipt<br/><span className="font-normal normal-case">Time</span></th>
                  <th className="text-center px-3 py-3">Temp °F<br/><span className="font-normal normal-case">Receipt</span></th>
                  <th className="text-center px-3 py-3">Reheat<br/><span className="font-normal normal-case">°F / Time</span></th>
                  <th className="text-center px-3 py-3">Status</th>
                  <th className="text-center px-3 py-3 print:hidden">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const erx = editReceipt[row.stop_id];
                  const erh = editReheat[row.stop_id];
                  const isSaving = saving === row.stop_id;
                  const needsReheat = row.temp_at_receipt !== null &&
                    row.temp_at_receipt < 135 && row.temp_at_receipt > 41 &&
                    row.reheat_temp === null;

                  return (
                    <tr key={row.stop_id}
                      className={`border-t border-gray-100 ${
                        row.status==="violation" ? "bg-red-50" :
                        row.status==="reheated"  ? "bg-blue-50" :
                        i%2===0 ? "bg-white" : "bg-gray-50"
                      }`}>
                      <td className="px-3 py-3 font-medium text-gray-700 whitespace-nowrap">{fmtDate(row.delivery_date)}</td>
                      <td className="px-3 py-3 text-gray-700">{MEAL_LABELS[row.meal_slot] ?? row.meal_slot}</td>
                      <td className="px-3 py-3 text-gray-700">
                        <div>{row.center_name}</div>
                        {row.arrival_window && <div className="text-[10px] text-gray-400">{row.arrival_window}</div>}
                      </td>
                      <td className="px-3 py-3 text-center text-gray-600 whitespace-nowrap">{fmtTime(row.dispatched_at)}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={tempColor(row.temp_at_dispatch)}>
                          {row.temp_at_dispatch !== null ? `${row.temp_at_dispatch}°` : "—"}
                        </span>
                      </td>
                      {/* Receipt time */}
                      <td className="px-3 py-3 text-center text-gray-600 whitespace-nowrap">
                        {erx
                          ? <input type="time" value={erx.time}
                              onChange={e => setEditReceipt(p=>({...p,[row.stop_id]:{...erx,time:e.target.value}}))}
                              className="border rounded px-2 py-1 text-xs w-24 print:hidden"/>
                          : fmtTime(row.received_at)}
                      </td>
                      {/* Receipt temp */}
                      <td className="px-3 py-3 text-center">
                        {erx
                          ? <input type="number" step="0.1" placeholder="°F" value={erx.temp}
                              onChange={e => setEditReceipt(p=>({...p,[row.stop_id]:{...erx,temp:e.target.value}}))}
                              className="border rounded px-2 py-1 text-xs w-20 text-center print:hidden"/>
                          : <span className={tempColor(row.temp_at_receipt)}>
                              {row.temp_at_receipt !== null ? `${row.temp_at_receipt}°` : "—"}
                            </span>}
                      </td>
                      {/* Reheat */}
                      <td className="px-3 py-3 text-center">
                        {erh
                          ? <div className="flex flex-col gap-1 items-center print:hidden">
                              <input type="number" step="0.1" placeholder="°F" value={erh.temp}
                                onChange={e => setEditReheat(p=>({...p,[row.stop_id]:{...erh,temp:e.target.value}}))}
                                className="border rounded px-2 py-1 text-xs w-20 text-center"/>
                              <input type="time" value={erh.time}
                                onChange={e => setEditReheat(p=>({...p,[row.stop_id]:{...erh,time:e.target.value}}))}
                                className="border rounded px-2 py-1 text-xs w-24"/>
                              <input type="text" placeholder="By (name)" value={erh.by}
                                onChange={e => setEditReheat(p=>({...p,[row.stop_id]:{...erh,by:e.target.value}}))}
                                className="border rounded px-2 py-1 text-xs w-28"/>
                            </div>
                          : row.reheat_temp !== null
                            ? <div className="text-xs text-center">
                                <div className={`font-bold ${row.reheat_temp>=165?"text-blue-700":"text-red-600"}`}>
                                  {row.reheat_temp}°F
                                </div>
                                <div className="text-gray-400">{fmtTime(row.reheat_at)}</div>
                                {row.reheat_by && <div className="text-gray-400">{row.reheat_by}</div>}
                              </div>
                            : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-block text-[11px] px-2 py-1 rounded-full whitespace-nowrap ${STATUS_STYLE[row.status]}`}>
                          {STATUS_LABEL[row.status]}
                        </span>
                      </td>
                      {/* Action */}
                      <td className="px-3 py-3 text-center print:hidden">
                        <div className="flex flex-col gap-1 items-center">
                          {/* Receipt entry */}
                          {row.temp_at_receipt === null && !erx && (
                            <button
                              onClick={() => setEditReceipt(p=>({...p,[row.stop_id]:{temp:"",time:""}}))}
                              className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 whitespace-nowrap">
                              + Receipt temp
                            </button>
                          )}
                          {erx && (
                            <div className="flex gap-1">
                              <button onClick={() => saveReceipt(row.stop_id)} disabled={isSaving||!erx.temp}
                                className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                                {isSaving?"…":"Save"}
                              </button>
                              <button onClick={() => setEditReceipt(p=>{const n={...p};delete n[row.stop_id];return n;})}
                                className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded hover:bg-gray-300">✕</button>
                            </div>
                          )}
                          {/* Reheat entry */}
                          {needsReheat && !erh && (
                            <button
                              onClick={() => setEditReheat(p=>({...p,[row.stop_id]:{temp:"",time:"",by:""}}))}
                              className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded hover:bg-orange-200 whitespace-nowrap">
                              + Reheat event
                            </button>
                          )}
                          {erh && (
                            <div className="flex gap-1">
                              <button onClick={() => saveReheat(row.stop_id)} disabled={isSaving||!erh.temp}
                                className="text-xs px-2 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50">
                                {isSaving?"…":"Save"}
                              </button>
                              <button onClick={() => setEditReheat(p=>{const n={...p};delete n[row.stop_id];return n;})}
                                className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded hover:bg-gray-300">✕</button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-400 flex flex-wrap gap-4">
              <span>Hot hold ≥135°F · Cold hold ≤41°F · 4h max in transit</span>
              <span>Reheat to ≥165°F within 2h if temp violation · OAC 3717-1-03.3(I)(4)</span>
              <span>HSP: children ≤9 yrs · OAC 3717-1-03.7</span>
            </div>
          </div>
        )}

        {/* print signatures */}
        <div className="hidden print:grid grid-cols-3 gap-12 mt-8 text-xs text-gray-600">
          {["Driver / Cook", "Director (Pearl)", "Director (Alpha)"].map(role => (
            <div key={role}>
              <div className="border-b border-gray-400 pb-8 mb-1"/>
              <div>{role} · Signature · Date</div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @media print {
          .print\\:hidden { display:none!important; }
          .print\\:block  { display:block!important; }
          .print\\:grid   { display:grid!important; }
          body { background:white; font-size:10px; }
          th,td { padding:4px 6px; }
        }
      `}</style>
    </div>
  );
}

export default DeliveryTemperatureLog;
