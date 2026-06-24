// src/pages/children/ChildrenExportPage.tsx
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/contexts/OrgContext";

type Tab = "export" | "documents" | "reports";

interface DocRow {
  id: string; center: string; doc_type: string; doc_name: string;
  category: string; scope: string; level: string; required: boolean;
  title: string; period_start: string; period_end: string;
  valid_from: string; valid_until: string; status: string;
  storage_path: string; notes: string; uploaded_at: string;
}

const MONTHS = ["January","February","March","April","May","June",
                 "July","August","September","October","November","December"];

// ─── CSV helpers ─────────────────────────────────────────────────────────────
function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headers = Object.keys(rows[0]);
  return [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))].join("\n");
}

function triggerDownload(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click(); URL.revokeObjectURL(url);
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ChildrenExportPage() {
  const { org, currentCenter } = useOrg();
  const orgId    = org?.id ?? "";
  const centerId = currentCenter?.id ?? "";

  const now = new Date();
  const [tab,    setTab]    = useState<Tab>("export");
  const [year,   setYear]   = useState(now.getFullYear());
  const [month,  setMonth]  = useState(now.getMonth() + 1);

  // ── Export tab state ────────────────────────────────────────────────────────
  const [downloading, setDownloading] = useState<string | null>(null);

  async function exportCSV(view: string, label: string) {
    setDownloading(view);
    const { data, error } = await supabase.schema("menumaker")
      .from(view as any).select("*");
    setDownloading(null);
    if (error || !data?.length) { alert(error?.message ?? "No rows"); return; }
    triggerDownload(toCSV(data as Record<string, unknown>[]),
      `${label}_${year}-${String(month).padStart(2,"0")}.csv`);
  }

  // ── Documents tab state ─────────────────────────────────────────────────────
  const [docs,          setDocs]         = useState<DocRow[]>([]);
  const [docsLoading,   setDocsLoading]  = useState(false);
  const [docFilter,     setDocFilter]    = useState("");
  const [openingDoc,    setOpeningDoc]   = useState<string | null>(null);

  const loadDocs = useCallback(async () => {
    if (!orgId) return;
    setDocsLoading(true);
    const { data } = await supabase.schema("menumaker")
      .from("v_documents_export").select("*").order("doc_type").order("doc_name");
    setDocsLoading(false);
    if (data) setDocs(data as DocRow[]);
  }, [orgId]);

  useEffect(() => { if (tab === "documents") loadDocs(); }, [tab, loadDocs]);

  async function openDoc(storagePath: string, id: string) {
    if (!storagePath) return;
    setOpeningDoc(id);
    const { data } = await supabase.storage.from("center-docs")
      .createSignedUrl(storagePath, 3600);
    setOpeningDoc(null);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else alert("Could not generate download link");
  }

  const filteredDocs = docs.filter(d =>
    !docFilter ||
    d.doc_name?.toLowerCase().includes(docFilter.toLowerCase()) ||
    d.doc_type?.toLowerCase().includes(docFilter.toLowerCase()) ||
    d.category?.toLowerCase().includes(docFilter.toLowerCase())
  );

  // ── Reports tab state ───────────────────────────────────────────────────────
  const [reportType,    setReportType]   = useState<"claim"|"costs">("claim");
  const [reportData,    setReportData]   = useState<Record<string, unknown> | null>(null);
  const [reportLoading, setReportLoading]= useState(false);
  const [reportError,   setReportError]  = useState<string | null>(null);

  async function runReport() {
    setReportLoading(true); setReportError(null); setReportData(null);
    const p_month = `${year}-${String(month).padStart(2,"0")}-01`;
    let data: Record<string, unknown> | null = null;
    let error: { message: string } | null = null;
    if (reportType === "claim") {
      ({ data, error } = await supabase.schema("menumaker")
        .rpc("compute_monthly_claim", { p_center_id: centerId, p_month }) as any);
    } else {
      ({ data, error } = await supabase.schema("menumaker")
        .rpc("compute_monthly_costs", { p_org_id: orgId, p_month }) as any);
    }
    setReportLoading(false);
    if (error) { setReportError((error as any).message); return; }
    setReportData(data as Record<string, unknown>);
  }

  return (
    <div style={{ padding: "1.5rem", fontFamily: "Calibri,Arial,sans-serif", maxWidth: 960 }}>
      <h2 style={{ margin: "0 0 1rem", fontSize: "1.1rem", fontWeight: 700, color: "#0f4c35" }}>
        📤 Children — Export &amp; Documents
      </h2>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "2px solid #0f4c35", marginBottom: "1.25rem" }}>
        {([["export","📥 Export CSV"],["documents","📁 Documents"],["reports","📊 Reports"]] as [Tab,string][]).map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: ".5rem 1.2rem", border: "none", fontFamily: "inherit", fontSize: ".88rem",
            fontWeight: 600, cursor: "pointer", borderRadius: "8px 8px 0 0",
            background: tab === t ? "#0f4c35" : "#f4f7f4",
            color:      tab === t ? "#fff"    : "#555",
          }}>{l}</button>
        ))}
      </div>

      {/* ── Export CSV tab ─────────────────────────────────────────────────── */}
      {tab === "export" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: "1.25rem" }}>
            <span style={{ fontSize: ".85rem", color: "#555" }}>Filename suffix:</span>
            <select value={month} onChange={e => setMonth(+e.target.value)} style={SEL}>
              {MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
            </select>
            <select value={year} onChange={e => setYear(+e.target.value)} style={SEL}>
              {[2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: "1rem" }}>
            {([
              ["v_children_export",  "children",  "👶 Children",   "Full child records — demographics, household, medical, guardians"],
              ["v_roster_export",    "roster",    "📋 Roster",     "CACFP attendance roster — FRP status, age groups, classroom links"],
              ["v_documents_export", "documents", "📄 Document list","Compliance documents index — types, validity dates, status"],
            ] as [string,string,string,string][]).map(([view, label, title, desc]) => (
              <div key={view} style={{
                border: "1px solid #c0d8c0", borderRadius: 10, padding: "1rem 1.25rem",
                background: "#f9fdf9", display: "flex", flexDirection: "column", gap: ".5rem",
              }}>
                <div style={{ fontWeight: 700, color: "#0f4c35", fontSize: ".95rem" }}>{title}</div>
                <div style={{ fontSize: ".78rem", color: "#666", flex: 1 }}>{desc}</div>
                <button
                  onClick={() => exportCSV(view, label)}
                  disabled={downloading === view}
                  style={{ ...BTN_PRI, marginTop: ".25rem", width: "100%", textAlign: "center" }}
                >
                  {downloading === view ? "Fetching…" : "⬇ Download CSV"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Documents tab ──────────────────────────────────────────────────── */}
      {tab === "documents" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: ".75rem" }}>
            <input
              value={docFilter} onChange={e => setDocFilter(e.target.value)}
              placeholder="Filter by name, type, category…"
              style={{ ...SEL, flex: 1, maxWidth: 320 }}
            />
            <button onClick={loadDocs} style={BTN_SEC}>↺ Refresh</button>
            <button
              onClick={() => exportCSV("v_documents_export", "documents")}
              disabled={downloading === "v_documents_export"}
              style={BTN_SEC}
            >⬇ Export CSV</button>
            <span style={{ fontSize: ".78rem", color: "#888" }}>{filteredDocs.length} rows</span>
          </div>

          {docsLoading ? (
            <div style={{ color: "#888", padding: "2rem", textAlign: "center" }}>Loading…</div>
          ) : filteredDocs.length === 0 ? (
            <div style={{ color: "#888", padding: "2rem", textAlign: "center" }}>No documents found</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".82rem" }}>
                <thead>
                  <tr style={{ background: "#d6e4f0" }}>
                    {["Type","Name","Category","Status","Valid until","Required",""].map(h => (
                      <th key={h} style={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.map((d, i) => (
                    <tr key={d.id} style={{ background: i % 2 === 0 ? "#fff" : "#f9f9f9" }}>
                      <td style={TD}>{d.doc_type || "—"}</td>
                      <td style={TD}>
                        <div style={{ fontWeight: 600 }}>{d.doc_name || d.title || "—"}</div>
                        {d.notes && <div style={{ fontSize: ".72rem", color: "#888" }}>{d.notes}</div>}
                      </td>
                      <td style={TD}>{d.category || "—"}</td>
                      <td style={{ ...TD, fontWeight: 600,
                        color: d.status === "active" ? "#0f4c35" : d.status === "expired" ? "#dc3545" : "#856404" }}>
                        {d.status || "—"}
                      </td>
                      <td style={TD}>{d.valid_until || "—"}</td>
                      <td style={{ ...TD, textAlign: "center" }}>{d.required ? "✓" : ""}</td>
                      <td style={{ ...TD, textAlign: "center" }}>
                        {d.storage_path ? (
                          <button
                            onClick={() => openDoc(d.storage_path, d.id)}
                            disabled={openingDoc === d.id}
                            style={{ ...BTN_PRI, padding: ".2rem .55rem", fontSize: ".75rem" }}
                          >
                            {openingDoc === d.id ? "…" : "⬇ Open"}
                          </button>
                        ) : (
                          <span style={{ color: "#ccc", fontSize: ".72rem" }}>no file</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Reports tab ────────────────────────────────────────────────────── */}
      {tab === "reports" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 0, border: "1.5px solid #0f4c35", borderRadius: 8, overflow: "hidden" }}>
              {([["claim","📋 Claim"],["costs","💰 Costs"]] as ["claim"|"costs",string][]).map(([t,l]) => (
                <button key={t} onClick={() => { setReportType(t); setReportData(null); }} style={{
                  padding: ".35rem .9rem", border: "none", fontFamily: "inherit", fontSize: ".82rem",
                  fontWeight: 600, cursor: "pointer",
                  background: reportType === t ? "#0f4c35" : "#fff",
                  color:      reportType === t ? "#fff"    : "#0f4c35",
                }}>{l}</button>
              ))}
            </div>
            <select value={month} onChange={e => setMonth(+e.target.value)} style={SEL}>
              {MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
            </select>
            <select value={year} onChange={e => setYear(+e.target.value)} style={SEL}>
              {[2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={runReport} disabled={reportLoading || !centerId} style={BTN_PRI}>
              {reportLoading ? "Computing…" : "▶ Run"}
            </button>
            {reportData && (
              <button onClick={() => window.print()} style={BTN_SEC}>🖨 Print / PDF</button>
            )}
          </div>

          {reportError && (
            <div style={{ padding: ".5rem .75rem", background: "#fee", border: "1px solid #dc3545",
              borderRadius: 6, fontSize: ".82rem", color: "#dc3545", marginBottom: ".75rem" }}>
              ❌ {reportError}
            </div>
          )}

          {reportData && (
            <div id="report-output">
              <div style={{ background: "#1a5276", color: "#fff", textAlign: "center",
                fontWeight: "bold", fontSize: "13pt", padding: "6px 0", marginBottom: 8 }}>
                {reportType === "claim" ? "CACFP Monthly Claim" : "Monthly Costs"} — {MONTHS[month-1]} {year}
              </div>
              <ReportRenderer data={reportData} />
            </div>
          )}
        </div>
      )}

      <style>{`@media print{body>*:not(#report-output){display:none}#report-output{border:none}}`}</style>
    </div>
  );
}

// ─── Generic JSON report renderer ─────────────────────────────────────────────
function ReportRenderer({ data }: { data: Record<string, unknown> }) {
  return (
    <div style={{ fontSize: ".88rem" }}>
      {Object.entries(data).map(([key, val]) => {
        const label = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        if (Array.isArray(val)) return <ArraySection key={key} label={label} rows={val} />;
        if (val !== null && typeof val === "object") return <ObjectSection key={key} label={label} obj={val as Record<string, unknown>} />;
        return (
          <div key={key} style={{ display: "grid", gridTemplateColumns: "220px 1fr",
            borderBottom: "1px solid #eee", padding: "3px 6px" }}>
            <span style={{ color: "#555", fontWeight: 600 }}>{label}</span>
            <span style={{ fontWeight: typeof val === "number" ? 700 : 400 }}>
              {typeof val === "number" && key.includes("amount") || key.includes("total") || key.includes("rate")
                ? `$${Number(val).toFixed(2)}` : String(val ?? "—")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ObjectSection({ label, obj }: { label: string; obj: Record<string, unknown> }) {
  return (
    <div style={{ marginBottom: ".75rem" }}>
      <div style={{ fontWeight: 700, color: "#1a5276", background: "#eaf2fb",
        padding: "3px 8px", borderTop: "1px solid #c0d8c0" }}>{label}</div>
      {Object.entries(obj).map(([k, v]) => {
        const l = k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        if (Array.isArray(v)) return <ArraySection key={k} label={l} rows={v} />;
        return (
          <div key={k} style={{ display: "grid", gridTemplateColumns: "220px 1fr",
            borderBottom: "1px solid #f0f0f0", padding: "2px 8px" }}>
            <span style={{ color: "#666" }}>{l}</span>
            <span style={{ fontWeight: typeof v === "number" ? 600 : 400 }}>
              {typeof v === "number" ? (Number.isInteger(v) ? v : `$${Number(v).toFixed(2)}`) : String(v ?? "—")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ArraySection({ label, rows }: { label: string; rows: unknown[] }) {
  if (!rows.length) return null;
  const isObj = rows.length > 0 && typeof rows[0] === "object" && rows[0] !== null;
  if (!isObj) return (
    <div style={{ padding: "4px 8px", borderBottom: "1px solid #eee" }}>
      <span style={{ color: "#555", fontWeight: 600 }}>{label}: </span>
      <span>{(rows as unknown[]).join(", ")}</span>
    </div>
  );
  const cols = Object.keys(rows[0] as Record<string, unknown>);
  return (
    <div style={{ marginBottom: "1rem" }}>
      <div style={{ fontWeight: 700, color: "#1a5276", background: "#eaf2fb",
        padding: "3px 8px", borderTop: "1px solid #c0d8c0" }}>{label}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".82rem" }}>
        <thead>
          <tr style={{ background: "#d6e4f0" }}>
            {cols.map(c => <th key={c} style={TH}>{c.replace(/_/g, " ")}</th>)}
          </tr>
        </thead>
        <tbody>
          {(rows as Record<string, unknown>[]).map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9f9f9" }}>
              {cols.map(c => (
                <td key={c} style={{ ...TD, textAlign: typeof row[c] === "number" ? "right" : "left" }}>
                  {typeof row[c] === "number"
                    ? (Number.isInteger(row[c]) ? row[c] as number : `$${Number(row[c]).toFixed(2)}`)
                    : String(row[c] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const SEL: React.CSSProperties = { padding: ".3rem .6rem", borderRadius: 7, border: "1.5px solid #c0d8c0", fontSize: ".82rem", fontFamily: "inherit", background: "#fff" };
const TH:  React.CSSProperties = { border: "1px solid #aaa", padding: "3px 8px", textAlign: "left", fontWeight: "bold", whiteSpace: "nowrap" };
const TD:  React.CSSProperties = { border: "1px solid #ddd", padding: "3px 8px" };
const BTN_PRI: React.CSSProperties = { padding: ".4rem .9rem", borderRadius: 8, border: "none", background: "#0f4c35", color: "#fff", fontWeight: 600, fontSize: ".82rem", cursor: "pointer", fontFamily: "inherit" };
const BTN_SEC: React.CSSProperties = { padding: ".4rem .9rem", borderRadius: 8, border: "1.5px solid #0f4c35", background: "#fff", color: "#0f4c35", fontWeight: 600, fontSize: ".82rem", cursor: "pointer", fontFamily: "inherit" };
