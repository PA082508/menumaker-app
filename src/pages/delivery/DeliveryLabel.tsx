/**
 * DeliveryLabel.tsx  v2
 * Лейбл на контейнер — полный, соответствует Ohio OAC 3717-1-03.4, 3717-1-03.5, 3717-1-03.7
 * Путь в проекте: src/pages/delivery/DeliveryLabel.tsx
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// ─── константы ──────────────────────────────────────────────────────────────
const MEAL_SLOT_LABELS: Record<string, string> = {
  breakfast: "BREAKFAST",
  am_snack:  "AM SNACK",
  lunch:     "LUNCH",
  pm_snack:  "PM SNACK",
  supper:    "SUPPER",
};

const CENTER_ADDRESSES: Record<string, string> = {
  "881ef4ce-1a27-4d3b-aa60-59d2a307bf2b": "6285 Pearl Rd #30, Parma Hts, OH 44130",
  "099c404b-e6d3-4543-9d9a-1fb11a2ee62d": "201 Alpha Park, Highland Heights, OH 44143",
};

const ALLERGEN_LABELS: Record<string, string> = {
  milk:       "Milk",
  eggs:       "Eggs",
  fish:       "Fish",
  shellfish:  "Shellfish",
  tree_nuts:  "Tree Nuts",
  peanuts:    "Peanuts",
  wheat:      "Wheat",
  soybeans:   "Soy",
  sesame:     "Sesame",
};

// ─── хелперы ────────────────────────────────────────────────────────────────
/** dispatch + 4h = serve/discard deadline  (OAC 3717-1-03.4) */
function calcDeadline(dispatchedAt: string | null): string {
  if (!dispatchedAt) return "—";
  const d = new Date(dispatchedAt);
  d.setHours(d.getHours() + 4);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

/** prep_date + 7 days = refrigerated shelf life  (OAC 3717-1-03.4 G) */
function calcShelfLife(prepDate: string | null): string {
  if (!prepDate) return "—";
  const d = new Date(prepDate + "T12:00:00");
  d.setDate(d.getDate() + 7);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function tempStatus(temp: number | null): "hot" | "cold" | "warn" | "unknown" {
  if (temp === null) return "unknown";
  if (temp >= 135)   return "hot";
  if (temp <= 41)    return "cold";
  return "warn";
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

// ─── типы ───────────────────────────────────────────────────────────────────
interface LabelData {
  delivery_date:       string;
  meal_slot:           string;
  dispatched_at:       string | null;
  dispatched_by:       string | null;
  center_id:           string;
  center_name:         string;
  center_address:      string;
  arrival_window:      string | null;
  temp_at_dispatch:    number | null;
  special_instructions:string | null;
  container_label:     string | null;
  container_type:      string | null;
  program:             string;
  portion_count:       number;
  portions_by_dish:    Record<string, number> | null;
  allergens:           string[];
  prep_date:           string | null;
  is_hsp:              boolean;
  notes:               string | null;
}

// ─── компонент ──────────────────────────────────────────────────────────────
interface Props {
  routeId:     string;
  stopId:      string;
  containerId: string;
  onClose?:    () => void;
}

export function DeliveryLabel({ routeId, stopId, containerId, onClose }: Props) {
  const [data, setData]       = useState<LabelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [routeRes, stopRes] = await Promise.all([
          supabase.schema("menumaker").from("delivery_routes")
            .select("delivery_date,meal_slot,dispatched_at,dispatched_by")
            .eq("id", routeId).single(),
          supabase.schema("menumaker").from("delivery_stops")
            .select("center_id,arrival_window,temp_at_dispatch,special_instructions")
            .eq("id", stopId).single(),
        ]);
        if (routeRes.error) throw routeRes.error;
        if (stopRes.error)  throw stopRes.error;

        const [centerRes, containerRes] = await Promise.all([
          supabase.schema("menumaker").from("centers")
            .select("name").eq("id", stopRes.data.center_id).single(),
          supabase.schema("menumaker").from("delivery_containers")
            .select("container_label,container_type,program,portion_count,portions_by_dish,allergens,prep_date,is_hsp,notes,temp_at_dispatch")
            .eq("id", containerId).single(),
        ]);
        if (centerRes.error)    throw centerRes.error;
        if (containerRes.error) throw containerRes.error;

        const c = containerRes.data;
        const s = stopRes.data;
        const r = routeRes.data;

        setData({
          delivery_date:        r.delivery_date,
          meal_slot:            r.meal_slot,
          dispatched_at:        r.dispatched_at,
          dispatched_by:        r.dispatched_by,
          center_id:            s.center_id,
          center_name:          centerRes.data.name,
          center_address:       CENTER_ADDRESSES[s.center_id] ?? "",
          arrival_window:       s.arrival_window,
          temp_at_dispatch:     c.temp_at_dispatch ?? s.temp_at_dispatch,
          special_instructions: s.special_instructions,
          container_label:      c.container_label,
          container_type:       c.container_type,
          program:              c.program,
          portion_count:        c.portion_count,
          portions_by_dish:     c.portions_by_dish,
          allergens:            c.allergens ?? [],
          prep_date:            c.prep_date,
          is_hsp:               c.is_hsp ?? true,
          notes:                c.notes,
        });
      } catch (err: any) {
        setError(err.message ?? "Load error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [routeId, stopId, containerId]);

  if (loading) return <div className="p-8 text-center text-gray-400">Loading label…</div>;
  if (error)   return <div className="p-8 text-center text-red-500">{error}</div>;
  if (!data)   return null;

  const status      = tempStatus(data.temp_at_dispatch);
  const deadline    = calcDeadline(data.dispatched_at);
  const shelfLife   = calcShelfLife(data.prep_date);
  const dispatchTime= fmtTime(data.dispatched_at);
  const dateStr     = new Date(data.delivery_date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
  const prepDateStr = data.prep_date
    ? new Date(data.prep_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";

  const dishes         = data.portions_by_dish ? Object.entries(data.portions_by_dish) : null;
  const allergenLabels = data.allergens.map((a) => ALLERGEN_LABELS[a] ?? a).filter(Boolean);

  const tempBg =
    status === "warn"    ? "bg-red-50"   :
    status === "unknown" ? "bg-gray-50"  : "bg-green-50";
  const tempColor =
    status === "warn"    ? "text-red-600"   :
    status === "unknown" ? "text-gray-400"  : "text-green-700";

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      {/* toolbar */}
      <div className="mb-4 flex gap-3 print:hidden">
        {onClose && (
          <button onClick={onClose}
            className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium hover:bg-gray-300">
            ← Back
          </button>
        )}
        <button onClick={() => window.print()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          🖨 Print Label
        </button>
      </div>

      {/* ── LABEL CARD ───────────────────────────────────────────────────── */}
      <div id="delivery-label"
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm border-2 border-gray-800 overflow-hidden print:shadow-none print:rounded-none print:border-black"
        style={{ fontFamily: "Arial, sans-serif" }}>

        {/* HEADER */}
        <div className="bg-gray-900 text-white px-4 py-3 flex justify-between items-start">
          <div>
            <div className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase">
              Play Academy Kitchen → {data.center_name.replace("Play Academy ", "")}
            </div>
            <div className="text-xl font-black leading-tight mt-0.5">
              {MEAL_SLOT_LABELS[data.meal_slot] ?? data.meal_slot.toUpperCase()}
            </div>
            <div className="text-sm text-gray-300 mt-0.5">{dateStr}</div>
          </div>
          {data.is_hsp && (
            <div className="bg-orange-500 text-white text-[9px] font-black px-2 py-1 rounded-lg text-center leading-tight mt-1">
              HSP<br/>FACILITY
            </div>
          )}
        </div>

        {/* DESTINATION */}
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Destination</div>
          <div className="text-base font-bold text-gray-900">{data.center_name}</div>
          {data.center_address && (
            <div className="text-xs text-gray-500 mt-0.5">{data.center_address}</div>
          )}
          {data.arrival_window && (
            <div className="text-xs text-blue-600 font-medium mt-1">
              Expected arrival: {data.arrival_window}
            </div>
          )}
        </div>

        {/* CONTAINER + PORTIONS */}
        <div className="px-4 py-3 border-b border-gray-200 flex gap-4">
          <div className="flex-1">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Container</div>
            <div className="text-2xl font-black text-gray-900">{data.container_label ?? "—"}</div>
            <div className="text-xs text-gray-500 capitalize">
              {data.container_type ?? ""}{data.container_type && data.program ? " · " : ""}{data.program}
            </div>
          </div>
          <div className="flex-1">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Portions</div>
            <div className="text-2xl font-black text-gray-900">{data.portion_count}</div>
          </div>
        </div>

        {/* CONTENTS */}
        {dishes && dishes.length > 0 && (
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Contents</div>
            <div className="space-y-1">
              {dishes.map(([dish, count]) => (
                <div key={dish} className="flex justify-between text-sm">
                  <span className="text-gray-700">{dish}</span>
                  <span className="font-semibold text-gray-900">{count} pcs</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ALLERGENS  (OAC 3717-1-03.5 D.6) */}
        <div className={`px-4 py-3 border-b border-gray-200 ${allergenLabels.length > 0 ? "bg-amber-50" : ""}`}>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
            Allergens · OAC 3717-1-03.5(D)(6)
          </div>
          {allergenLabels.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {allergenLabels.map((a) => (
                <span key={a}
                  className="bg-amber-200 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded">
                  {a}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-400 italic">No major allergens declared</div>
          )}
        </div>

        {/* TEMPERATURE  (OAC 3717-1-03.4 F) */}
        <div className={`px-4 py-3 border-b border-gray-200 ${tempBg}`}>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
            Temp at Dispatch · OAC 3717-1-03.4(F)
          </div>
          <div className="flex items-center gap-3">
            <div className={`text-2xl font-black ${tempColor}`}>
              {data.temp_at_dispatch !== null ? `${data.temp_at_dispatch}°F` : "—"}
            </div>
            <div className="text-xs leading-snug">
              {status === "hot"     && <span className="text-green-700 font-semibold">✓ HOT HOLD OK (≥135°F)</span>}
              {status === "cold"    && <span className="text-green-700 font-semibold">✓ COLD HOLD OK (≤41°F)</span>}
              {status === "warn"    && <span className="text-red-600 font-bold">⚠ VIOLATION<br/>Reheat to 165°F within 2h</span>}
              {status === "unknown" && <span className="text-gray-400">Not recorded</span>}
            </div>
          </div>
        </div>

        {/* TIMES + DATES  (OAC 3717-1-03.4 G — date marking) */}
        <div className="px-4 py-3 border-b border-gray-200 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Dispatched</div>
            <div className="text-sm font-semibold text-gray-800">{dispatchTime}</div>
            {data.dispatched_by && (
              <div className="text-[10px] text-gray-400">{data.dispatched_by}</div>
            )}
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Serve / Discard By</div>
            <div className={`text-sm font-bold ${status === "warn" ? "text-red-600" : "text-gray-800"}`}>
              {deadline}
            </div>
            <div className="text-[10px] text-gray-400">4-hour rule</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Prep Date</div>
            <div className="text-sm font-semibold text-gray-800">{prepDateStr}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Refrigerated Until</div>
            <div className="text-sm font-semibold text-gray-800">{shelfLife}</div>
            <div className="text-[10px] text-gray-400">7-day max · OAC 3717-1-03.4(G)</div>
          </div>
        </div>

        {/* HSP WARNING  (OAC 3717-1-03.7) */}
        {data.is_hsp && (
          <div className="px-4 py-2 border-b border-orange-200 bg-orange-50">
            <div className="text-[10px] font-bold text-orange-700 uppercase tracking-wider mb-0.5">
              HSP Facility · OAC 3717-1-03.7
            </div>
            <div className="text-[10px] text-orange-800 leading-snug">
              Served to children ≤9 yrs. No raw/undercooked animal foods.
              Pasteurized eggs required. No raw juice. No raw sprouts.
            </div>
          </div>
        )}

        {/* SPECIAL INSTRUCTIONS */}
        {(data.special_instructions || data.notes) && (
          <div className="px-4 py-3 border-b border-yellow-200 bg-yellow-50">
            <div className="text-[10px] font-bold text-yellow-700 uppercase tracking-wider mb-1">
              Special Instructions
            </div>
            <div className="text-xs text-yellow-900 leading-snug">
              {[data.special_instructions, data.notes].filter(Boolean).join(" · ")}
            </div>
          </div>
        )}

        {/* FOOTER */}
        <div className="px-4 py-2 bg-gray-50">
          <div className="text-[9px] text-gray-400 text-center leading-tight">
            Ohio OAC 3717-1-03.4 · 3717-1-03.5(D)(6) · 3717-1-03.7 · ORC §3715.041
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #delivery-label, #delivery-label * { visibility: visible; }
          #delivery-label {
            position: fixed; top: 0; left: 0;
            width: 3.5in; border: 2px solid black;
            font-size: 11px;
          }
        }
      `}</style>
    </div>
  );
}

export default DeliveryLabel;
