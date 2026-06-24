// src/pages/export/CustomExportPage.tsx
//
// Custom Export (Feature E)
// ─────────────────────────────────────────────────────────────────────────────
// A self-contained screen that lets a user build a custom CSV export for one of
// three targets: Children, Roster, or Documents.
//
// Flow:
//   1. Pick a target via the segmented control.
//   2. Field definitions are loaded from menumaker.export_fields (filtered by
//      `target`). Fields are rendered as checkboxes grouped by their `group_name`
//      column. Pre-checked according to `default_selected` (or all if none flagged).
//   3. "Download CSV" queries the matching export view (v_<target>_export),
//      scoped to the current org, selecting only the chosen field keys, and
//      downloads a timestamped CSV.
//   4. For the `documents` target, results are also shown in a table with a
//      per-row "Open file" button that resolves a signed URL from the
//      `center-docs` storage bucket. `storage_path` is always selected for
//      documents so the download button works even when the column is unchecked.
//
// Conventions: inline styles, 'DM Sans' font, primary green #0f4c35.
// CSV/signed-URL helpers and style constants are recreated locally (mirrors the
// patterns in ChildrenExportPage.tsx) rather than imported.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/contexts/OrgContext";

type Target = "children" | "roster" | "documents";

const TARGETS: [Target, string][] = [
  ["children",  "👶 Children"],
  ["roster",    "📋 Roster"],
  ["documents", "📄 Documents"],
];

// Real columns in menumaker.export_fields:
//   field_key, label, group_name, sort_order, default_selected
interface ExportField {
  field_key: string;
  label?: string | null;
  group_name?: string | null;
  sort_order?: number | null;
  default_selected?: boolean | null;
}

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

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const FALLBACK_GROUP = "Fields";

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CustomExportPage() {
  const { org } = useOrg();
  const orgId = org?.id ?? "";

  const [target, setTarget] = useState<Target>("children");

  // Field definitions
  const [fields,  setFields]  = useState<ExportField[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Checked keys (Set for O(1) toggle)
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // Export / results state
  const [downloading, setDownloading] = useState(false);
  const [exportErr,   setExportErr]   = useState<string | null>(null);

  // Documents results table
  const [docRows,    setDocRows]    = useState<Record<string, unknown>[]>([]);
  const [docCols,    setDocCols]    = useState<string[]>([]);
  const [openingDoc, setOpeningDoc] = useState<string | null>(null);

  // ── Load field list whenever the target changes ─────────────────────────────
  const loadFields = useCallback(async (t: Target) => {
    setLoading(true);
    setLoadErr(null);
    setExportErr(null);
    setDocRows([]);
    setDocCols([]);
    const { data, error } = await supabase.schema("menumaker")
      .from("export_fields").select("*").eq("target", t);
    setLoading(false);

    if (error) { setLoadErr(error.message); setFields([]); setChecked(new Set()); return; }

    const rows = (data ?? []) as ExportField[];
    // Sort by sort_order (nulls last), then by label/field_key for stability.
    const sorted = [...rows].sort((a, b) => {
      const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return (a.label ?? a.field_key).localeCompare(b.label ?? b.field_key);
    });
    setFields(sorted);

    // Default selection: default_selected truthy → pre-check; else pre-check all.
    const anyDefault = sorted.some(f => !!f.default_selected);
    const init = new Set<string>(
      anyDefault ? sorted.filter(f => !!f.default_selected).map(f => f.field_key)
                 : sorted.map(f => f.field_key)
    );
    setChecked(init);
  }, []);

  useEffect(() => { loadFields(target); }, [target, loadFields]);

  // ── Group fields ────────────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const map = new Map<string, ExportField[]>();
    for (const f of fields) {
      const g = (f.group_name && f.group_name.trim()) || FALLBACK_GROUP;
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(f);
    }
    return Array.from(map.entries()); // [groupName, fields][]
  }, [fields]);

  // ── Checkbox helpers ────────────────────────────────────────────────────────
  function toggle(key: string) {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  function setGroup(groupFields: ExportField[], on: boolean) {
    setChecked(prev => {
      const next = new Set(prev);
      for (const f of groupFields) on ? next.add(f.field_key) : next.delete(f.field_key);
      return next;
    });
  }
  function setAll(on: boolean) {
    setChecked(on ? new Set(fields.map(f => f.field_key)) : new Set());
  }

  const chosenKeys = useMemo(
    () => fields.filter(f => checked.has(f.field_key)).map(f => f.field_key),
    [fields, checked]
  );

  // ── Export ──────────────────────────────────────────────────────────────────
  async function downloadCSV() {
    if (!chosenKeys.length || !orgId) return;
    setDownloading(true);
    setExportErr(null);
    setDocRows([]);
    setDocCols([]);

    // For documents, always include storage_path so per-row "Open file" works,
    // even if the user did not check that column.
    const selectKeys = [...chosenKeys];
    if (target === "documents" && !selectKeys.includes("storage_path")) {
      selectKeys.push("storage_path");
    }

    const view = `v_${target}_export`;
    const { data, error } = await supabase.schema("menumaker")
      .from(view as any)
      .select(selectKeys.join(","))
      .eq("org_id", orgId);

    setDownloading(false);

    if (error) { setExportErr(error.message); return; }

    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    if (!rows.length) { setExportErr("No rows to export for this org."); return; }

    if (target === "documents") {
      // Show results in a table; only display the user-chosen columns.
      setDocCols(chosenKeys);
      setDocRows(rows);
    }

    // CSV mirrors only the chosen columns (drop the auto-added storage_path
    // unless the user actually selected it).
    const csvRows = rows.map(r => {
      const out: Record<string, unknown> = {};
      for (const k of chosenKeys) out[k] = r[k];
      return out;
    });
    triggerDownload(toCSV(csvRows), `${target}_${todayStamp()}.csv`);
  }

  // ── Open a document via signed URL ──────────────────────────────────────────
  async function openDoc(storagePath: unknown, id: string) {
    const path = storagePath == null ? "" : String(storagePath);
    if (!path) return;
    setOpeningDoc(id);
    const { data } = await supabase.storage.from("center-docs").createSignedUrl(path, 3600);
    setOpeningDoc(null);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else alert("Could not generate download link");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "1.5rem", fontFamily: "'DM Sans', sans-serif", maxWidth: 960 }}>
      <h2 style={{ margin: "0 0 1rem", fontSize: "1.1rem", fontWeight: 700, color: "#0f4c35" }}>
        📤 Custom Export
      </h2>

      {/* Target segmented control */}
      <div style={{
        display: "inline-flex", border: "1.5px solid #0f4c35", borderRadius: 8,
        overflow: "hidden", marginBottom: "1.25rem",
      }}>
        {TARGETS.map(([t, l]) => (
          <button key={t} onClick={() => setTarget(t)} style={{
            padding: ".4rem 1.1rem", border: "none", fontFamily: "inherit", fontSize: ".85rem",
            fontWeight: 600, cursor: "pointer",
            background: target === t ? "#0f4c35" : "#fff",
            color:      target === t ? "#fff"    : "#0f4c35",
          }}>{l}</button>
        ))}
      </div>

      {/* Global actions */}
      <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <button onClick={() => setAll(true)}  style={BTN_SEC} disabled={loading || !fields.length}>Select all</button>
        <button onClick={() => setAll(false)} style={BTN_SEC} disabled={loading || !fields.length}>Clear</button>
        <span style={{ fontSize: ".78rem", color: "#888" }}>
          {chosenKeys.length} of {fields.length} fields selected
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={downloadCSV}
          disabled={downloading || !chosenKeys.length || !orgId}
          style={{ ...BTN_PRI, opacity: (!chosenKeys.length || !orgId) ? 0.5 : 1 }}
          title={!orgId ? "No organization selected" : !chosenKeys.length ? "Select at least one field" : undefined}
        >
          {downloading ? "Fetching…" : "⬇ Download CSV"}
        </button>
      </div>

      {exportErr && (
        <div style={{ padding: ".5rem .75rem", background: "#fee", border: "1px solid #dc3545",
          borderRadius: 6, fontSize: ".82rem", color: "#dc3545", marginBottom: ".75rem" }}>
          ❌ {exportErr}
        </div>
      )}

      {/* Field list */}
      {loading ? (
        <div style={{ color: "#888", padding: "2rem", textAlign: "center" }}>Loading fields…</div>
      ) : loadErr ? (
        <div style={{ padding: ".5rem .75rem", background: "#fee", border: "1px solid #dc3545",
          borderRadius: 6, fontSize: ".82rem", color: "#dc3545" }}>
          ❌ {loadErr}
        </div>
      ) : fields.length === 0 ? (
        <div style={{ color: "#888", padding: "2rem", textAlign: "center" }}>
          No exportable fields defined for “{target}”.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: "1rem" }}>
          {groups.map(([groupName, groupFields]) => {
            const allOn  = groupFields.every(f => checked.has(f.field_key));
            const someOn = groupFields.some(f => checked.has(f.field_key));
            return (
              <div key={groupName} style={{
                border: "1px solid #c0d8c0", borderRadius: 10, padding: "0.75rem 1rem",
                background: "#f9fdf9",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginBottom: ".5rem", borderBottom: "1px solid #d8e8d8", paddingBottom: ".4rem" }}>
                  <span style={{ fontWeight: 700, color: "#0f4c35", fontSize: ".9rem" }}>{groupName}</span>
                  <button
                    onClick={() => setGroup(groupFields, !allOn)}
                    style={{ ...LINK_BTN }}
                  >
                    {allOn ? "Clear" : "Select all"}
                  </button>
                </div>
                {/* indeterminate visual hint */}
                {someOn && !allOn && (
                  <div style={{ fontSize: ".68rem", color: "#999", marginBottom: ".25rem" }}>partial</div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
                  {groupFields.map(f => (
                    <label key={f.field_key} style={{
                      display: "flex", alignItems: "center", gap: ".5rem",
                      fontSize: ".82rem", color: "#333", cursor: "pointer",
                    }}>
                      <input
                        type="checkbox"
                        checked={checked.has(f.field_key)}
                        onChange={() => toggle(f.field_key)}
                        style={{ accentColor: "#0f4c35" }}
                      />
                      {f.label ?? f.field_key}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Documents results table */}
      {target === "documents" && docRows.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <div style={{ fontWeight: 700, color: "#0f4c35", fontSize: ".95rem", marginBottom: ".5rem" }}>
            📄 Document files ({docRows.length})
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".82rem" }}>
              <thead>
                <tr style={{ background: "#d6e4f0" }}>
                  {docCols.map(c => <th key={c} style={TH}>{c.replace(/_/g, " ")}</th>)}
                  <th style={TH}>File</th>
                </tr>
              </thead>
              <tbody>
                {docRows.map((row, i) => {
                  const rowId = String(row.id ?? row.storage_path ?? i);
                  const storagePath = row.storage_path;
                  return (
                    <tr key={rowId} style={{ background: i % 2 === 0 ? "#fff" : "#f9f9f9" }}>
                      {docCols.map(c => (
                        <td key={c} style={TD}>{row[c] == null || row[c] === "" ? "—" : String(row[c])}</td>
                      ))}
                      <td style={{ ...TD, textAlign: "center" }}>
                        {storagePath ? (
                          <button
                            onClick={() => openDoc(storagePath, rowId)}
                            disabled={openingDoc === rowId}
                            style={{ ...BTN_PRI, padding: ".2rem .55rem", fontSize: ".75rem" }}
                          >
                            {openingDoc === rowId ? "…" : "⬇ Open file"}
                          </button>
                        ) : (
                          <span style={{ color: "#ccc", fontSize: ".72rem" }}>no file</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const TH:  React.CSSProperties = { border: "1px solid #aaa", padding: "3px 8px", textAlign: "left", fontWeight: "bold", whiteSpace: "nowrap" };
const TD:  React.CSSProperties = { border: "1px solid #ddd", padding: "3px 8px" };
const BTN_PRI: React.CSSProperties = { padding: ".4rem .9rem", borderRadius: 8, border: "none", background: "#0f4c35", color: "#fff", fontWeight: 600, fontSize: ".82rem", cursor: "pointer", fontFamily: "inherit" };
const BTN_SEC: React.CSSProperties = { padding: ".4rem .9rem", borderRadius: 8, border: "1.5px solid #0f4c35", background: "#fff", color: "#0f4c35", fontWeight: 600, fontSize: ".82rem", cursor: "pointer", fontFamily: "inherit" };
const LINK_BTN: React.CSSProperties = { border: "none", background: "none", color: "#0f4c35", fontWeight: 600, fontSize: ".72rem", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", padding: 0 };
