/**
 * DeliveryLog.tsx
 * Журнал доставки — полная история рейсов кухни с контейнерами, порциями, блюдами
 * Путь в проекте: src/pages/delivery/DeliveryLog.tsx
 *
 * Два режима:
 *   1. DISPATCH — экран повара: список контейнеров на сегодня, ввод температуры, «Confirm & Print»
 *   2. HISTORY  — история рейсов за выбранный период, фильтр по центру
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// ─── типы ───────────────────────────────────────────────────────────────────
interface DeliveryContainer {
  id: string;
  container_label: string | null;
  container_type: string | null;
  program: string;
  portion_count: number;
  portions_by_dish: Record<string, number> | null;
  temp_at_dispatch: number | null;
  notes: string | null;
}

interface DeliveryStop {
  id: string;
  center_id: string;
  center_name: string;
  stop_order: number;
  arrival_window: string | null;
  temp_at_dispatch: number | null;
  temp_at_receipt: number | null;
  received_at: string | null;
  special_instructions: string | null;
  containers: DeliveryContainer[];
}

interface DeliveryRoute {
  id: string;
  delivery_date: string;
  meal_slot: string;
  dispatched_at: string | null;
  dispatched_by: string | null;
  status: string;
  stops: DeliveryStop[];
}

const MEAL_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  am_snack: "AM Snack",
  lunch: "Lunch",
  pm_snack: "PM Snack",
  supper: "Supper",
};

const STATUS_CHIP: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border border-yellow-300",
  dispatched: "bg-blue-100 text-blue-800 border border-blue-300",
  delivered: "bg-green-100 text-green-800 border border-green-300",
  cancelled: "bg-gray-100 text-gray-500 border border-gray-200",
};

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "short", day: "numeric", year: "numeric",
  });
}
function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

// ─── данные ─────────────────────────────────────────────────────────────────
async function fetchRoutes(from: string, to: string, orgId?: string): Promise<DeliveryRoute[]> {
  let rq = supabase
    .schema("menumaker")
    .from("delivery_routes")
    .select("id,delivery_date,meal_slot,dispatched_at,dispatched_by,status")
    .gte("delivery_date", from)
    .lte("delivery_date", to)
    .order("delivery_date", { ascending: false })
    .order("meal_slot");
  if (orgId) rq = rq.eq("org_id", orgId);
  const { data: routes, error } = await rq;
  if (error) throw error;
  if (!routes?.length) return [];

  const routeIds = routes.map((r) => r.id);

  // stops
  const { data: stops } = await supabase
    .schema("menumaker")
    .from("delivery_stops")
    .select(
      "id,route_id,center_id,stop_order,arrival_window,temp_at_dispatch,temp_at_receipt,received_at,special_instructions"
    )
    .in("route_id", routeIds)
    .order("stop_order");

  // containers
  const stopIds = (stops ?? []).map((s) => s.id);
  const { data: containers } = stopIds.length
    ? await supabase
        .schema("menumaker")
        .from("delivery_containers")
        .select(
          "id,stop_id,container_label,container_type,program,portion_count,portions_by_dish,temp_at_dispatch,notes"
        )
        .in("stop_id", stopIds)
    : { data: [] };

  // centers
  const centerIds = [...new Set((stops ?? []).map((s) => s.center_id))];
  const { data: centers } = centerIds.length
    ? await supabase.schema("menumaker").from("centers").select("id,name").in("id", centerIds)
    : { data: [] };
  const centerMap: Record<string, string> = {};
  centers?.forEach((c) => { centerMap[c.id] = c.name; });

  // assemble
  return routes.map((route) => {
    const routeStops = (stops ?? [])
      .filter((s) => s.route_id === route.id)
      .map((stop) => ({
        ...stop,
        center_name: centerMap[stop.center_id] ?? stop.center_id,
        containers: (containers ?? []).filter((c) => c.stop_id === stop.id),
      }));
    return { ...route, stops: routeStops };
  });
}

// ─── sub-component: Route Card ───────────────────────────────────────────────
function RouteCard({ route, onPrintLabel }: {
  route: DeliveryRoute;
  onPrintLabel: (routeId: string, stopId: string, containerId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const totalPortions = route.stops.reduce(
    (sum, s) => sum + s.containers.reduce((cs, c) => cs + c.portion_count, 0),
    0
  );

  return (
    <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden mb-4">
      {/* route header */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 select-none"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex items-center gap-4">
          <div>
            <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">
              {fmtDate(route.delivery_date)}
            </div>
            <div className="text-lg font-bold text-gray-900">
              {MEAL_LABELS[route.meal_slot] ?? route.meal_slot}
            </div>
          </div>
          <span
            className={`text-xs px-2 py-1 rounded-full capitalize ${STATUS_CHIP[route.status] ?? STATUS_CHIP.pending}`}
          >
            {route.status}
          </span>
        </div>
        <div className="flex items-center gap-6 text-right">
          <div>
            <div className="text-xs text-gray-400">Stops</div>
            <div className="font-bold text-gray-800">{route.stops.length}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">Portions</div>
            <div className="font-bold text-gray-800">{totalPortions}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">Dispatched</div>
            <div className="font-semibold text-gray-700 text-sm">{fmtTime(route.dispatched_at)}</div>
          </div>
          <div className="text-gray-400 text-lg">{expanded ? "▲" : "▼"}</div>
        </div>
      </div>

      {/* expanded stops */}
      {expanded && (
        <div className="border-t border-gray-100">
          {route.stops.map((stop) => (
            <div key={stop.id} className="border-b border-gray-50 last:border-0">
              {/* stop header */}
              <div className="flex items-start justify-between px-5 py-3 bg-gray-50">
                <div>
                  <div className="font-semibold text-gray-800">{stop.center_name}</div>
                  {stop.arrival_window && (
                    <div className="text-xs text-gray-500">Expected: {stop.arrival_window}</div>
                  )}
                  {stop.special_instructions && (
                    <div className="text-xs text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded mt-1 inline-block">
                      ⚠ {stop.special_instructions}
                    </div>
                  )}
                </div>
                <div className="flex gap-6 text-right text-sm">
                  <div>
                    <div className="text-xs text-gray-400">Temp Dispatch</div>
                    <div
                      className={`font-bold ${
                        stop.temp_at_dispatch == null
                          ? "text-gray-400"
                          : stop.temp_at_dispatch >= 135 || stop.temp_at_dispatch <= 41
                          ? "text-green-700"
                          : "text-red-600"
                      }`}
                    >
                      {stop.temp_at_dispatch != null ? `${stop.temp_at_dispatch}°F` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">Temp Receipt</div>
                    <div
                      className={`font-bold ${
                        stop.temp_at_receipt == null
                          ? "text-gray-400"
                          : stop.temp_at_receipt >= 135 || stop.temp_at_receipt <= 41
                          ? "text-green-700"
                          : "text-red-600"
                      }`}
                    >
                      {stop.temp_at_receipt != null ? `${stop.temp_at_receipt}°F` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">Received</div>
                    <div className="text-gray-700">{fmtTime(stop.received_at)}</div>
                  </div>
                </div>
              </div>

              {/* containers */}
              <div className="px-5 py-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                      <th className="text-left pb-1">Container</th>
                      <th className="text-left pb-1">Type</th>
                      <th className="text-left pb-1">Program</th>
                      <th className="text-right pb-1">Portions</th>
                      <th className="text-left pb-1 pl-4">Contents</th>
                      <th className="text-right pb-1 print:hidden">Label</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stop.containers.map((c) => {
                      const dishes = c.portions_by_dish
                        ? Object.entries(c.portions_by_dish)
                        : null;
                      return (
                        <tr key={c.id} className="border-b border-gray-50 last:border-0">
                          <td className="py-2 font-bold text-gray-800">
                            {c.container_label ?? "—"}
                          </td>
                          <td className="py-2 text-gray-600 capitalize">
                            {c.container_type ?? "—"}
                          </td>
                          <td className="py-2 text-gray-600">{c.program}</td>
                          <td className="py-2 text-right font-semibold text-gray-800">
                            {c.portion_count}
                          </td>
                          <td className="py-2 pl-4 text-gray-500 text-xs">
                            {dishes
                              ? dishes.map(([d, n]) => `${d} ×${n}`).join(", ")
                              : "—"}
                          </td>
                          <td className="py-2 text-right print:hidden">
                            <button
                              onClick={() => onPrintLabel(route.id, stop.id, c.id)}
                              className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                            >
                              🏷 Label
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50">
                      <td colSpan={3} className="py-2 text-xs text-gray-400 font-medium">
                        Stop total
                      </td>
                      <td className="py-2 text-right font-bold text-gray-900 text-sm">
                        {stop.containers.reduce((s, c) => s + c.portion_count, 0)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── главный компонент ───────────────────────────────────────────────────────
interface Props {
  orgId?: string;
  onShowLabel?: (routeId: string, stopId: string, containerId: string) => void;
}

export function DeliveryLog({ orgId, onShowLabel }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";

  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRoutes(from, to, orgId);
      setRoutes(data);
    } catch (e: any) {
      setError(e.message ?? "Load error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [from, to]);

  const totalPortions = routes.reduce(
    (sum, r) =>
      sum +
      r.stops.reduce(
        (ss, s) => ss + s.containers.reduce((cs, c) => cs + c.portion_count, 0),
        0
      ),
    0
  );

  function handlePrintLabel(routeId: string, stopId: string, containerId: string) {
    if (onShowLabel) {
      onShowLabel(routeId, stopId, containerId);
    } else {
      window.open(`/delivery/label?routeId=${routeId}&stopId=${stopId}&containerId=${containerId}`, "_blank");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-5xl mx-auto">

        {/* header */}
        <div className="flex items-start justify-between mb-6 print:mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 print:text-xl">
              Delivery Log
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Play Academy Kitchen → Pearl & Alpha
            </p>
          </div>
          <button
            onClick={() => window.print()}
            className="print:hidden px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            🖨 Print Log
          </button>
        </div>

        {/* filters */}
        <div className="flex gap-4 mb-5 print:hidden flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
            <input
              type="date" value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <input
              type="date" value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={load}
              className="px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-900"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* summary */}
        {!loading && routes.length > 0 && (
          <div className="flex gap-3 mb-5 flex-wrap">
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm">
              <span className="text-gray-500">Routes: </span>
              <span className="font-bold text-gray-900">{routes.length}</span>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm">
              <span className="text-gray-500">Total portions: </span>
              <span className="font-bold text-gray-900">{totalPortions}</span>
            </div>
          </div>
        )}

        {/* print period */}
        <div className="hidden print:block mb-4 text-xs text-gray-500">
          Period: {from} — {to} · Printed: {new Date().toLocaleDateString()}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm mb-4">
            {error}
          </div>
        )}

        {loading && (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        )}

        {!loading && routes.length === 0 && !error && (
          <div className="text-center py-16 text-gray-400">
            No delivery records found for this period.
          </div>
        )}

        {!loading && routes.map((route) => (
          <RouteCard
            key={route.id}
            route={route}
            onPrintLabel={handlePrintLabel}
          />
        ))}

        {/* regulatory footer */}
        <div className="mt-6 text-xs text-gray-400 text-center print:mt-4">
          Ohio OAC 3717-1-03.4 · ORC §3715.041 · Hot hold ≥135°F · Cold hold ≤41°F · 4-hour rule
        </div>
      </div>

      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          body { background: white; font-size: 11px; }
        }
      `}</style>
    </div>
  );
}

export default DeliveryLog;
