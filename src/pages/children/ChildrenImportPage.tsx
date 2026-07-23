// src/pages/children/ChildrenImportPage.tsx
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/contexts/OrgContext";
import BackBar from "@/components/BackBar";
import AddChildRouterModal from "./AddChildRouter";

interface TargetField {
  field_key: string; label: string; datatype: string;
  required: boolean; dest_table: string; sort_order: number;
}
interface Template {
  id: string; name: string;
  mapping: Record<string, string>; // csv_col → field_key
  is_default: boolean;
}
interface ImportRun {
  id: string; filename: string; status: string;
  total_rows: number; loaded: number; skipped: number;
  summary: { errors?: { row: number; reason: string }[] } | null;
  created_at: string;
}

type Step = "upload" | "map" | "preview" | "result";
type Tab  = "import" | "history";

const DEST_TABLES = ["child", "child_medical", "household"] as const;

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (c === ',' && !inQ) { row.push(cur); cur = ""; }
      else cur += c;
    }
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

export default function ChildrenImportPage() {
  const { org, currentCenter, isOrgAdmin } = useOrg();
  const orgId = org?.id ?? "";
  const navigate = useNavigate();

  // ── TEMPORARY (until Nikolay's cancel) ──────────────────────────────────────
  // The search-first "Add Child" router (with "Manual entry — no scan") is still in the
  // app, but its trigger was removed when ➕ Add Child became the enrollment-packet panel,
  // so the fast minimal entry (name/DOB/classroom/Date In/FRP/days+meals → meal grid) was
  // unreachable. Re-expose it here on Import so directors can quick-enter children until
  // e-forms land. To retire: delete this block, its button, and the modal mount below.
  const [showRouter, setShowRouter] = useState(false);
  const [quickUser, setQuickUser] = useState<{ id: string; name: string } | null>(null);
  const [quickRooms, setQuickRooms] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (u) setQuickUser({ id: u.id, name: (u.user_metadata?.full_name as string) || u.email?.split("@")[0] || "Director" });
    });
  }, []);
  useEffect(() => {
    if (!currentCenter?.id) { setQuickRooms([]); return; }
    supabase.schema("menumaker").from("classrooms").select("id,name,is_roster").eq("center_id", currentCenter.id)
      .then(({ data }) => setQuickRooms((data ?? []).filter((c: any) => c.is_roster !== false).map((c: any) => ({ id: c.id, name: c.name }))));
  }, [currentCenter?.id]);

  const [tab,  setTab]  = useState<Tab>("import");
  const [step, setStep] = useState<Step>("upload");

  const [fields,    setFields]    = useState<TargetField[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [runs,      setRuns]      = useState<ImportRun[]>([]);

  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows,    setCsvRows]    = useState<string[][]>([]);
  const [filename,   setFilename]   = useState("");
  const [mapping,    setMapping]    = useState<Record<string, string>>({});
  const [activeTplId, setActiveTplId] = useState<string | null>(null);
  const [saveAsTpl,  setSaveAsTpl]  = useState(false);
  const [tplName,    setTplName]    = useState("");

  const [running,   setRunning]  = useState(false);
  const [result,    setResult]   = useState<{
    run_id: string; total: number; loaded: number; skipped: number;
    review: { row: number; reason: string; data: Record<string, string> }[];
  } | null>(null);
  const [runError,  setRunError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.schema("menumaker").from("import_target_fields")
      .select("*").eq("target", "children").order("sort_order")
      .then(({ data }) => { if (data) setFields(data as TargetField[]); });
    if (orgId) {
      supabase.schema("menumaker").from("import_templates")
        .select("*").eq("target", "children").order("name")
        .then(({ data }) => { if (data) setTemplates(data as Template[]); });
    }
  }, [orgId]);

  useEffect(() => {
    if (tab !== "history" || !orgId) return;
    supabase.schema("menumaker").from("import_runs")
      .select("*").eq("org_id", orgId).eq("target", "children")
      .order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => { if (data) setRuns(data as ImportRun[]); });
  }, [tab, orgId]);

  function handleFile(file: File) {
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseCSV(e.target?.result as string);
      if (parsed.length < 2) return;
      const hdrs = parsed[0];
      setCsvHeaders(hdrs);
      setCsvRows(parsed.slice(1));
      // Auto-map by exact label or field_key match
      const auto: Record<string, string> = {};
      for (const h of hdrs) {
        const lc = h.toLowerCase();
        const hit = fields.find(f =>
          f.field_key === lc.replace(/\s+/g, "_") ||
          f.label.toLowerCase() === lc
        );
        if (hit) auto[h] = hit.field_key;
      }
      setMapping(auto);
      setStep("map");
    };
    reader.readAsText(file);
  }

  function applyTemplate(t: Template) {
    setMapping({ ...t.mapping });
    setActiveTplId(t.id);
  }

  async function runImport() {
    setRunning(true); setRunError(null);
    let templateId = activeTplId;
    if (saveAsTpl && tplName.trim()) {
      const { data: saved } = await supabase.schema("menumaker").from("import_templates")
        .insert({ org_id: orgId, target: "children", name: tplName.trim(), mapping, is_default: false })
        .select("id").single();
      if (saved) {
        templateId = saved.id;
        setTemplates(ts => [...ts, { id: saved.id, name: tplName.trim(), mapping, is_default: false }]);
      }
    }
    // Convert string[][] → [{sourceCol: value}] for the RPC
    const parsedRows = csvRows.map(row =>
      Object.fromEntries(csvHeaders.map((h, i) => [h, row[i] ?? ""]))
    );
    const { data, error } = await supabase.schema("menumaker").rpc("import_children_run", {
      p_org_id:      orgId,
      p_rows:        parsedRows,
      p_mapping:     mapping,
      p_template_id: templateId ?? null,
      p_filename:    filename,
    });
    setRunning(false);
    if (error) { setRunError(error.message); return; }
    setResult(data);
    setStep("result");
  }

  function reset() {
    setStep("upload"); setCsvHeaders([]); setCsvRows([]); setFilename("");
    setMapping({}); setResult(null); setRunError(null);
    setSaveAsTpl(false); setTplName(""); setActiveTplId(null);
  }

  const mappedValues    = new Set(Object.values(mapping).filter(Boolean));
  const missingRequired = fields.filter(f => f.required && !mappedValues.has(f.field_key));
  const mappedPairs     = Object.entries(mapping).filter(([, fk]) => fk);

  const STEPS: Step[] = ["upload", "map", "preview", "result"];
  const STEP_LABELS   = ["Upload", "Map columns", "Preview", "Done"];

  return (
    <div style={{ padding: "1.5rem", fontFamily: "Calibri,Arial,sans-serif", maxWidth: 920 }}>
      <div style={{ margin: "-1.5rem -1.5rem 1.25rem" }}>
        <BackBar to="/children" label="Children" />
      </div>

      {/* TEMPORARY (until Nikolay's cancel): quick manual child-entry, resurrected here while
          ➕ Add Child opens the enrollment-packet panel. Remove with its state/effects above. */}
      {currentCenter && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 220, fontSize: 13, color: "#92400e", lineHeight: 1.5 }}>
            <b>Quick add a child (no scan)</b> — enter the essentials (name, birthday, classroom, Date&nbsp;In, FRP, days&nbsp;&amp;&nbsp;meals) so the child lands on the meal grid. Temporary, until online forms go live.
          </div>
          <button onClick={() => setShowRouter(true)}
            style={{ padding: "10px 16px", borderRadius: 9, background: "#0f4c35", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            ⚡ Quick add a child
          </button>
        </div>
      )}
      {showRouter && currentCenter && quickUser && (
        <AddChildRouterModal
          centerId={currentCenter.id}
          orgId={orgId}
          classrooms={quickRooms}
          reviewerId={quickUser.id}
          reviewerName={quickUser.name}
          isOrgAdmin={isOrgAdmin}
          onClose={() => setShowRouter(false)}
          onReactivated={() => setShowRouter(false)}
          onNewEnrollment={() => { setShowRouter(false); navigate("/enrollment-inbox"); }}
          onScan={() => { setShowRouter(false); navigate("/enrollment-inbox"); }}
          onRawInsert={() => { setShowRouter(false); navigate("/children"); }}
        />
      )}
      <h2 style={{ margin: "0 0 1rem", fontSize: "1.1rem", fontWeight: 700, color: "#0f4c35" }}>
        👶 Import Children
      </h2>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "2px solid #0f4c35", marginBottom: "1rem" }}>
        {(["import", "history"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: ".5rem 1.25rem", border: "none", fontFamily: "inherit", fontSize: ".88rem",
            fontWeight: 600, cursor: "pointer", borderRadius: "8px 8px 0 0",
            background: tab === t ? "#0f4c35" : "#f4f7f4",
            color:      tab === t ? "#fff"    : "#555",
          }}>
            {t === "import" ? "📥 New Import" : "📋 History"}
          </button>
        ))}
      </div>

      {/* ── Import tab ── */}
      {tab === "import" && (
        <div>
          {/* Step indicator */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: "1.5rem" }}>
            {STEPS.map((s, i) => (
              <div key={s} style={{ display: "flex", alignItems: "center" }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%", display: "flex",
                  alignItems: "center", justifyContent: "center", fontSize: ".78rem", fontWeight: 700,
                  background: step === s ? "#0f4c35" : STEPS.indexOf(step) > i ? "#7ee8b0" : "#e0e0e0",
                  color: step === s ? "#fff" : "#333",
                }}>{i + 1}</div>
                <span style={{ margin: "0 .4rem", fontSize: ".82rem",
                  color: step === s ? "#0f4c35" : "#999", fontWeight: step === s ? 700 : 400 }}>
                  {STEP_LABELS[i]}
                </span>
                {i < 3 && <span style={{ color: "#ccc", marginRight: ".4rem" }}>›</span>}
              </div>
            ))}
          </div>

          {/* Step 1 — Upload */}
          {step === "upload" && (
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              style={{
                border: "2px dashed #c0d8c0", borderRadius: 12, padding: "3.5rem 2rem",
                textAlign: "center", cursor: "pointer", background: "#f9fdf9",
              }}
            >
              <div style={{ fontSize: "2.5rem", marginBottom: ".5rem" }}>📂</div>
              <div style={{ fontWeight: 700, color: "#0f4c35", fontSize: "1rem", marginBottom: ".25rem" }}>
                Drop CSV here or click to browse
              </div>
              <div style={{ fontSize: ".78rem", color: "#888" }}>First row must be column headers</div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          )}

          {/* Step 2 — Map columns */}
          {step === "map" && (
            <div>
              {/* Template bar */}
              {templates.length > 0 && (
                <div style={{ marginBottom: ".75rem", display: "flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap" }}>
                  <span style={{ fontSize: ".8rem", color: "#555", fontWeight: 600 }}>Apply template:</span>
                  {templates.map(t => (
                    <button key={t.id} onClick={() => applyTemplate(t)} style={{
                      padding: ".2rem .55rem", borderRadius: 6, fontFamily: "inherit", fontSize: ".78rem",
                      cursor: "pointer", fontWeight: activeTplId === t.id ? 700 : 400,
                      border: `1.5px solid ${activeTplId === t.id ? "#0f4c35" : "#c0d8c0"}`,
                      background: activeTplId === t.id ? "#e8f4e8" : "#fff", color: "#0f4c35",
                    }}>{t.is_default ? "⭐ " : ""}{t.name}</button>
                  ))}
                </div>
              )}

              <div style={{ fontSize: ".78rem", color: "#888", marginBottom: ".5rem" }}>
                {filename} · {csvHeaders.length} columns · {csvRows.length} rows
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".85rem" }}>
                <thead>
                  <tr style={{ background: "#d6e4f0" }}>
                    <th style={TH}>CSV column</th>
                    <th style={TH}>→ Destination field</th>
                    <th style={{ ...TH, color: "#888", fontWeight: 400 }}>Sample value</th>
                  </tr>
                </thead>
                <tbody>
                  {csvHeaders.map((h, ci) => (
                    <tr key={h} style={{ background: ci % 2 === 0 ? "#fff" : "#f9f9f9" }}>
                      <td style={TD}>{h}</td>
                      <td style={TD}>
                        <select
                          value={mapping[h] || ""}
                          onChange={e => {
                            const v = e.target.value;
                            setMapping(m => v ? { ...m, [h]: v } : Object.fromEntries(Object.entries(m).filter(([k]) => k !== h)));
                          }}
                          style={{ width: "100%", padding: "2px 4px", border: "1px solid #ccc", borderRadius: 4, fontFamily: "inherit", fontSize: ".82rem" }}
                        >
                          <option value="">— skip —</option>
                          {DEST_TABLES.map(tbl => (
                            <optgroup key={tbl} label={tbl.replace(/_/g, " ")}>
                              {fields.filter(f => f.dest_table === tbl).map(f => (
                                <option key={f.field_key} value={f.field_key}>
                                  {f.label}{f.required ? " *" : ""}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                      <td style={{ ...TD, color: "#888", fontSize: ".78rem" }}>{csvRows[0]?.[ci] ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {missingRequired.length > 0 && (
                <div style={{ margin: ".75rem 0", padding: ".5rem .75rem", background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 6, fontSize: ".8rem", color: "#856404" }}>
                  ⚠️ Required not mapped: {missingRequired.map(f => f.label).join(", ")}
                </div>
              )}

              {/* Save-as-template */}
              <div style={{ marginTop: ".75rem", display: "flex", alignItems: "center", gap: ".75rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: ".35rem", fontSize: ".82rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={saveAsTpl} onChange={e => setSaveAsTpl(e.target.checked)} />
                  Save mapping as template
                </label>
                {saveAsTpl && (
                  <input value={tplName} onChange={e => setTplName(e.target.value)}
                    placeholder="Template name"
                    style={{ padding: "2px 6px", border: "1px solid #ccc", borderRadius: 4, fontFamily: "inherit", fontSize: ".82rem", width: 160 }} />
                )}
              </div>

              <div style={{ marginTop: "1rem", display: "flex", gap: ".5rem" }}>
                <button onClick={reset} style={BTN_SEC}>← Back</button>
                <button onClick={() => setStep("preview")} disabled={missingRequired.length > 0} style={BTN_PRI}>
                  Preview →
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — Preview */}
          {step === "preview" && (
            <div>
              <div style={{ fontSize: ".82rem", color: "#666", marginBottom: ".5rem" }}>
                First {Math.min(5, csvRows.length)} of {csvRows.length} rows — {mappedPairs.length} fields mapped
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", fontSize: ".8rem" }}>
                  <thead>
                    <tr style={{ background: "#d6e4f0" }}>
                      {mappedPairs.map(([h, fk]) => (
                        <th key={h} style={TH}>
                          <div>{fields.find(f => f.field_key === fk)?.label ?? fk}</div>
                          <div style={{ fontWeight: 400, color: "#888", fontSize: ".7rem" }}>{h}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.slice(0, 5).map((row, ri) => (
                      <tr key={ri} style={{ background: ri % 2 === 0 ? "#fff" : "#f9f9f9" }}>
                        {mappedPairs.map(([h]) => (
                          <td key={h} style={TD}>{row[csvHeaders.indexOf(h)] ?? ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {runError && (
                <div style={{ margin: ".75rem 0", padding: ".5rem .75rem", background: "#fee", border: "1px solid #dc3545", borderRadius: 6, fontSize: ".8rem", color: "#dc3545" }}>
                  ❌ {runError}
                </div>
              )}

              <div style={{ marginTop: "1rem", display: "flex", gap: ".5rem" }}>
                <button onClick={() => setStep("map")} style={BTN_SEC}>← Back</button>
                <button onClick={runImport} disabled={running} style={BTN_PRI}>
                  {running ? "Importing…" : `▶ Import ${csvRows.length} rows`}
                </button>
              </div>
            </div>
          )}

          {/* Step 4 — Result */}
          {step === "result" && result && (
            <div>
              <div style={{ textAlign: "center", padding: "2rem 1rem 1.5rem" }}>
                <div style={{ fontSize: "3rem", marginBottom: ".5rem" }}>✅</div>
                <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#0f4c35", marginBottom: "1.25rem" }}>
                  Import complete
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: "3rem", marginBottom: "1.5rem" }}>
                  <div>
                    <div style={{ fontSize: "2.5rem", fontWeight: 700, color: "#0f4c35" }}>{result.loaded}</div>
                    <div style={{ fontSize: ".85rem", color: "#666" }}>loaded</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "2.5rem", fontWeight: 700, color: result.skipped > 0 ? "#856404" : "#ccc" }}>
                      {result.skipped}
                    </div>
                    <div style={{ fontSize: ".85rem", color: "#666" }}>skipped</div>
                  </div>
                </div>
              </div>

              {/* Review panel */}
              {result.review.length > 0 && (
                <div style={{ border: "1px solid #ffc107", borderRadius: 8, overflow: "hidden", marginBottom: "1.25rem" }}>
                  <div style={{ background: "#fff3cd", padding: ".5rem .75rem", fontWeight: 600, fontSize: ".85rem", color: "#856404" }}>
                    ⚠️ {result.review.length} row{result.review.length !== 1 ? "s" : ""} skipped — review required
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".78rem" }}>
                    <thead>
                      <tr style={{ background: "#fef9e7" }}>
                        <th style={{ ...TH, width: 60 }}>Row</th>
                        <th style={TH}>Reason</th>
                        <th style={TH}>Source data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.review.map((r, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fffdf0", verticalAlign: "top" }}>
                          <td style={{ ...TD, textAlign: "center", color: "#856404", fontWeight: 600 }}>{r.row}</td>
                          <td style={{ ...TD, color: "#856404" }}>{r.reason}</td>
                          <td style={{ ...TD, color: "#555", fontFamily: "monospace", fontSize: ".72rem" }}>
                            {Object.entries(r.data).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                            {Object.keys(r.data).length > 4 && " …"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ display: "flex", gap: ".5rem", justifyContent: "center" }}>
                <button onClick={reset} style={BTN_PRI}>Import another file</button>
                <button onClick={() => setTab("history")} style={BTN_SEC}>View history</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── History tab ── */}
      {tab === "history" && (
        <div>
          {runs.length === 0 ? (
            <div style={{ color: "#888", fontSize: ".9rem", padding: "3rem", textAlign: "center" }}>
              No imports yet
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".85rem" }}>
              <thead>
                <tr style={{ background: "#d6e4f0" }}>
                  {["Date", "File", "Status", "Total", "Loaded", "Skipped", "Errors"].map(h => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 === 0 ? "#fff" : "#f9f9f9", verticalAlign: "top" }}>
                    <td style={TD}>{new Date(r.created_at).toLocaleString()}</td>
                    <td style={TD}>{r.filename || "—"}</td>
                    <td style={{ ...TD, fontWeight: 600,
                      color: r.status === "done" ? "#0f4c35" : r.status === "running" ? "#856404" : "#dc3545" }}>
                      {r.status}
                    </td>
                    <td style={{ ...TD, textAlign: "center" }}>{r.total_rows}</td>
                    <td style={{ ...TD, textAlign: "center", fontWeight: 600, color: "#0f4c35" }}>{r.loaded}</td>
                    <td style={{ ...TD, textAlign: "center", fontWeight: 600,
                      color: (r.skipped || 0) > 0 ? "#856404" : "#aaa" }}>{r.skipped || 0}</td>
                    <td style={TD}>
                      {(r.summary?.errors?.length ?? 0) > 0 && (
                        <details style={{ fontSize: ".75rem" }}>
                          <summary style={{ cursor: "pointer", color: "#856404" }}>
                            {r.summary!.errors!.length} error{r.summary!.errors!.length !== 1 ? "s" : ""}
                          </summary>
                          <ul style={{ margin: "4px 0 0 12px", padding: 0, color: "#555", listStyle: "disc" }}>
                            {r.summary!.errors!.slice(0, 10).map((e, j) => (
                              <li key={j}>Row {e.row}: {e.reason}</li>
                            ))}
                            {r.summary!.errors!.length > 10 && (
                              <li style={{ color: "#888" }}>…and {r.summary!.errors!.length - 10} more</li>
                            )}
                          </ul>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

const TH: React.CSSProperties = { border: "1px solid #aaa", padding: "3px 8px", textAlign: "left", fontWeight: "bold", whiteSpace: "nowrap" };
const TD: React.CSSProperties = { border: "1px solid #ddd", padding: "3px 8px" };
const BTN_PRI: React.CSSProperties = { padding: ".4rem .9rem", borderRadius: 8, border: "none", background: "#0f4c35", color: "#fff", fontWeight: 600, fontSize: ".82rem", cursor: "pointer", fontFamily: "inherit" };
const BTN_SEC: React.CSSProperties = { padding: ".4rem .9rem", borderRadius: 8, border: "1.5px solid #0f4c35", background: "#fff", color: "#0f4c35", fontWeight: 600, fontSize: ".82rem", cursor: "pointer", fontFamily: "inherit" };
