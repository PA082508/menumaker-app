// src/pages/documents/DocumentsPage.tsx
// MenuMaker · Documents (D) — compliance document upload & registry.
//
// Anchor: claim_packet_manifest (what is needed vs. on-hand per period).
// Flow per spec:
//   upload  -> storage.from('center-docs').upload(`${org_id}/${center_id|"sponsor"}/${doc_type_code}/${filename}`)
//   register-> rpc('register_document', {...})
//   then    -> rpc('refresh_action_items', { p_org_id })
//   list    -> from('v_documents_export') ; view -> storage.createSignedUrl ; delete -> invoke('delete-document')
//
// org_id always comes from app context (useOrg) — never hardcoded; first path
// segment must be org_id for storage RLS.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/contexts/OrgContext";
import { FormQrModal } from "@/components/FormQrModal";
import { loadFormsRegistry, type RegistryForm } from "@/lib/childReadmission";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DocType {
  code: string;
  label?: string | null;
  name?: string | null;
  category?: string | null;
  scope?: string | null;       // 'center' | 'sponsor' | ...
  level?: string | null;
  is_required?: boolean | null;
  [k: string]: unknown;
}

interface DocRow {
  id: string;
  doc_type?: string;
  doc_name?: string;
  title?: string;
  category?: string;
  scope?: string;
  level?: string;
  required?: boolean;
  status?: string;
  period_start?: string;
  period_end?: string;
  valid_from?: string;
  valid_until?: string;
  storage_path?: string;
  notes?: string;
  uploaded_at?: string;
  [k: string]: unknown;
}

interface ManifestRow {
  [k: string]: unknown;
}

interface RosterChild {
  id: string;
  child_name: string;
}

type Scope = "center" | "sponsor";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const safeFileName = (name: string) =>
  name.replace(/\s+/g, "_").replace(/[^\w.\-]+/g, "");

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB
const ACCEPT_EXTS = ["pdf", "jpg", "jpeg", "png", "webp"];
const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,.webp";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function validateUploadFile(f: File): string | null {
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ACCEPT_EXTS.includes(ext)) return "Unsupported file type. Use PDF, JPG, JPEG, PNG, or WEBP.";
  if (f.size > MAX_UPLOAD_BYTES) return "File is too large — maximum 20 MB.";
  return null;
}

const typeLabel = (t: DocType) => t.label || t.name || t.code;

const titleCase = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const STATUS_COLOR: Record<string, string> = {
  active: "#0f4c35",
  ok: "#0f4c35",
  valid: "#0f4c35",
  expired: "#dc3545",
  missing: "#dc3545",
  expiring: "#b8860b",
  pending: "#856404",
};

function statusColor(s?: string) {
  if (!s) return "#666";
  return STATUS_COLOR[s.toLowerCase()] ?? "#856404";
}

// ─── Main page ──────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const { org, centers, currentCenter } = useOrg();
  const orgId = org?.id ?? "";

  const [docTypes, setDocTypes] = useState<DocType[]>([]);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [manifest, setManifest] = useState<ManifestRow[]>([]);
  const [roster, setRoster] = useState<RosterChild[]>([]);

  const [loadingTypes, setLoadingTypes] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [loadingManifest, setLoadingManifest] = useState(false);

  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  // ── Reference data ────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoadingTypes(true);
      const { data } = await supabase
        .schema("menumaker")
        .from("document_types")
        .select("*")
        .order("code");
      setDocTypes((data ?? []) as DocType[]);
      setLoadingTypes(false);
    })();
  }, []);

  // ── Roster (optional, for per-child docs) — admin/office context ────────────
  useEffect(() => {
    if (!currentCenter?.id) return;
    (async () => {
      const { data } = await supabase
        .schema("menumaker")
        .from("roster")
        .select("id,child_name")
        .eq("center_id", currentCenter.id)
        .eq("is_active", true)
        .order("child_name");
      setRoster((data ?? []) as RosterChild[]);
    })();
  }, [currentCenter?.id]);

  // ── Documents list ──────────────────────────────────────────────────────────
  const loadDocs = useCallback(async () => {
    if (!orgId) return;
    setLoadingDocs(true);
    const { data } = await supabase
      .schema("menumaker")
      .from("v_documents_export")
      .select("*")
      .order("uploaded_at", { ascending: false });
    setDocs((data ?? []) as DocRow[]);
    setLoadingDocs(false);
  }, [orgId]);

  // ── Claim packet manifest (anchor) ──────────────────────────────────────────
  const loadManifest = useCallback(async () => {
    if (!orgId) return;
    setLoadingManifest(true);
    const { data } = await supabase
      .schema("menumaker")
      .from("claim_packet_manifest")
      .select("*");
    setManifest((data ?? []) as ManifestRow[]);
    setLoadingManifest(false);
  }, [orgId]);

  useEffect(() => {
    loadDocs();
    loadManifest();
  }, [loadDocs, loadManifest]);

  const refreshAll = useCallback(async () => {
    await (supabase.schema("menumaker").rpc as any)("refresh_action_items", {
      p_org_id: orgId,
    });
    await Promise.all([loadDocs(), loadManifest()]);
  }, [orgId, loadDocs, loadManifest]);

  const filteredDocs = useMemo(
    () =>
      docs.filter(
        (d) =>
          !filter ||
          [d.doc_type, d.doc_name, d.title, d.category, d.status]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(filter.toLowerCase()))
      ),
    [docs, filter]
  );

  // ── View a stored document via signed URL ────────────────────────────────────
  async function openDoc(d: DocRow) {
    if (!d.storage_path) return;
    setOpeningId(d.id);
    const { data } = await supabase.storage
      .from("center-docs")
      .createSignedUrl(d.storage_path, 3600);
    setOpeningId(null);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else alert("Could not generate a download link");
  }

  // ── Delete via edge function ─────────────────────────────────────────────────
  async function deleteDoc(d: DocRow) {
    if (!confirm(`Delete "${d.doc_name || d.title || d.doc_type}"? This cannot be undone.`))
      return;
    setDeletingId(d.id);
    const { error } = await supabase.functions.invoke("delete-document", {
      body: { document_id: d.id },
    });
    setDeletingId(null);
    if (error) {
      alert(`Delete failed: ${error.message}`);
      return;
    }
    await refreshAll();
  }

  return (
    <div style={page}>
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap"
        rel="stylesheet"
      />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: "#0a3320" }}>
            Documents
          </div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
            {org?.name ?? "—"} · compliance packet & registry
          </div>
        </div>
        <button onClick={refreshAll} style={BTN_SEC}>↺ Refresh</button>
      </div>

      {/* Anchor: Claim packet manifest */}
      <ManifestPanel
        rows={manifest}
        loading={loadingManifest}
      />

      {/* Upload / register */}
      <UploadCard
        orgId={orgId}
        centers={centers}
        defaultCenterId={currentCenter?.id ?? ""}
        docTypes={docTypes}
        loadingTypes={loadingTypes}
        roster={roster}
        onRegistered={refreshAll}
      />

      {/* Registry list */}
      <div style={card}>
        <div style={cardHeader}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>📄</span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Registered documents</span>
            <span style={{ fontSize: 11, color: "#888" }}>{filteredDocs.length}</span>
          </span>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            style={{ ...input, width: 220 }}
          />
        </div>

        {loadingDocs ? (
          <div style={empty}>Loading…</div>
        ) : filteredDocs.length === 0 ? (
          <div style={empty}>
            No documents registered yet — this is the first entry for {org?.name ?? "this org"}.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr style={{ background: "#f4f7f4" }}>
                  {["Type", "Name", "Category", "Status", "Valid until", "Req", ""].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredDocs.map((d, i) => (
                  <tr key={d.id} style={{ background: i % 2 ? "#fafdfa" : "#fff" }}>
                    <td style={td}>{d.doc_type || "—"}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{d.doc_name || d.title || "—"}</div>
                      {d.notes && <div style={{ fontSize: 11, color: "#888" }}>{d.notes}</div>}
                    </td>
                    <td style={td}>{d.category || "—"}</td>
                    <td style={{ ...td, fontWeight: 600, color: statusColor(d.status) }}>
                      {d.status || "—"}
                    </td>
                    <td style={td}>{d.valid_until || "—"}</td>
                    <td style={{ ...td, textAlign: "center" }}>{d.required ? "✓" : ""}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {d.storage_path && (
                        <button
                          onClick={() => openDoc(d)}
                          disabled={openingId === d.id}
                          style={{ ...BTN_PRI, padding: "3px 9px", fontSize: 12, marginRight: 6 }}
                        >
                          {openingId === d.id ? "…" : "Open"}
                        </button>
                      )}
                      <button
                        onClick={() => deleteDoc(d)}
                        disabled={deletingId === d.id}
                        style={{ ...BTN_DANGER, padding: "3px 9px", fontSize: 12 }}
                      >
                        {deletingId === d.id ? "…" : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Doc-Hub Form Library (Stage 3a — read side, from the registry) */}
      <FormLibraryCard />
    </div>
  );
}

// ─── Form Library (Doc-Hub, Stage 3a) ────────────────────────────────────────────
// Read side of the forms registry: every current parent/physician form, grouped
// by requiring org, with signer + intake-mode badges and a preview (iframe of the
// current version). Send-a-bundle (multi-select) is Stage 3b — not here yet.

const INTAKE_LABEL: Record<string, string> = { paper_scan: 'Paper + scan', online: 'Online' };

function FormLibraryCard() {
  const { centers, currentCenter } = useOrg();
  const [forms, setForms] = useState<RegistryForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<RegistryForm | null>(null);
  const [qrForm, setQrForm] = useState<{ formKey: string; title: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadFormsRegistry()
      .then((r) => { if (!cancelled) setForms(Object.values(r)); })
      .catch(() => { if (!cancelled) setForms([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const groups = useMemo(() => {
    const m = new Map<string, RegistryForm[]>();
    for (const f of forms) {
      const k = f.requiringOrg || 'Other';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(f);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [forms]);

  const currentUrl = (f: RegistryForm): string | null =>
    (f as any).versions?.[(f as any).current] ?? f.fallbackUrl ?? null;

  const chip = (text: string, bg: string, fg: string) => (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: bg, color: fg, whiteSpace: 'nowrap' }}>{text}</span>
  );

  return (
    <div style={card}>
      <div style={cardHeader}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>📚</span>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Form Library</span>
          <span style={{ fontSize: 11, color: '#888' }}>{forms.length}</span>
        </span>
      </div>

      {loading ? (
        <div style={empty}>Loading…</div>
      ) : forms.length === 0 ? (
        <div style={empty}>Form registry unavailable.</div>
      ) : (
        <div style={{ padding: '4px 16px 16px' }}>
          {groups.map(([org, list]) => (
            <div key={org} style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#0f4c35', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>{org}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {list.map((f) => (
                  <div key={f.slug} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid #eef2ee', borderRadius: 10, background: '#fff' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.title} {(f as any).current && <span style={{ color: '#9ca3af', fontWeight: 400 }}>· {(f as any).current}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                        {chip(f.signer === 'physician' ? '🩺 Physician' : '👤 Parent', '#f0f4f8', '#334155')}
                        {chip((f as any).badge || INTAKE_LABEL[f.intakeMode] || f.intakeMode, '#f0fff4', '#0f4c35')}
                      </div>
                    </div>
                    <button onClick={() => setPreview(f)} disabled={!currentUrl(f)}
                      style={{ ...BTN_SEC, padding: '5px 12px', fontSize: 12, opacity: currentUrl(f) ? 1 : 0.5 }}>
                      Preview
                    </button>
                    {/* Per-form QR — storefront only= card, center-scoped (picker if no active center). */}
                    {currentUrl(f) && (
                      <button onClick={() => setQrForm({ formKey: f.slug, title: f.title })} title="Share this form as a QR"
                        style={{ ...BTN_SEC, padding: '5px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span aria-hidden>▦</span> QR
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {preview && currentUrl(preview) && (
        <div onClick={() => setPreview(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 820, height: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', fontFamily: "'DM Sans', sans-serif" }}>
            <div style={{ background: '#0f4c35', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, color: '#fff', fontWeight: 700, fontSize: 15 }}>{preview.title} {(preview as any).current ? `· ${(preview as any).current}` : ''}</div>
              <a href={currentUrl(preview)!} target="_blank" rel="noreferrer" style={{ color: '#7ee8b0', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>Open ↗</a>
              <button onClick={() => setPreview(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 17 }}>×</button>
            </div>
            <iframe title={preview.title} src={currentUrl(preview)!} style={{ flex: 1, border: 'none', width: '100%' }} />
          </div>
        </div>
      )}

      {qrForm && <FormQrModal formKey={qrForm.formKey} title={qrForm.title} centers={centers} presetSlug={currentCenter?.slug} onClose={() => setQrForm(null)} />}
    </div>
  );
}

// ─── Manifest panel (anchor) ─────────────────────────────────────────────────────

function ManifestPanel({ rows, loading }: { rows: ManifestRow[]; loading: boolean }) {
  const cols = rows.length ? Object.keys(rows[0]) : [];
  return (
    <div style={card}>
      <div style={cardHeader}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>📋</span>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Claim packet — needed vs. on hand</span>
        </span>
      </div>
      {loading ? (
        <div style={empty}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={empty}>No manifest rows for this org / period.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr style={{ background: "#f4f7f4" }}>
                {cols.map((c) => (
                  <th key={c} style={th}>{titleCase(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ background: i % 2 ? "#fafdfa" : "#fff" }}>
                  {cols.map((c) => {
                    const v = r[c];
                    const isStatus = /status|state/i.test(c);
                    return (
                      <td
                        key={c}
                        style={{
                          ...td,
                          fontWeight: isStatus ? 600 : 400,
                          color: isStatus ? statusColor(String(v)) : "#1a2e1a",
                        }}
                      >
                        {v === null || v === undefined || v === "" ? "—" : String(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Upload + register card ───────────────────────────────────────────────────────

function UploadCard({
  orgId,
  centers,
  defaultCenterId,
  docTypes,
  loadingTypes,
  roster,
  onRegistered,
}: {
  orgId: string;
  centers: { id: string; name: string }[];
  defaultCenterId: string;
  docTypes: DocType[];
  loadingTypes: boolean;
  roster: RosterChild[];
  onRegistered: () => Promise<void>;
}) {
  const [scope, setScope] = useState<Scope>("center");
  const [centerId, setCenterId] = useState(defaultCenterId);
  const [docType, setDocType] = useState("");
  const [title, setTitle] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [rosterId, setRosterId] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function acceptFile(f: File | null) {
    if (!f) return;
    const err = validateUploadFile(f);
    if (err) { setFileError(err); setFile(null); return; }
    setFileError(null);
    setFile(f);
  }

  function clearFile() {
    setFile(null);
    setFileError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  useEffect(() => {
    if (!centerId && defaultCenterId) setCenterId(defaultCenterId);
  }, [defaultCenterId]); // eslint-disable-line react-hooks/exhaustive-deps

  function reset() {
    setTitle(""); setPeriodStart(""); setPeriodEnd("");
    setValidFrom(""); setValidUntil(""); setNotes(""); setRosterId("");
    clearFile();
  }

  const canSubmit = !!orgId && !!docType && !!file && (scope === "sponsor" || !!centerId);

  async function submit() {
    if (!canSubmit || !file) return;
    setBusy(true);
    setMsg(null);
    try {
      const segment = scope === "sponsor" ? "sponsor" : centerId;
      const path = `${orgId}/${segment}/${docType}/${Date.now()}_${safeFileName(file.name)}`;

      const { error: upErr } = await supabase.storage
        .from("center-docs")
        .upload(path, file, { upsert: false });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

      const { error: regErr } = await (supabase.schema("menumaker").rpc as any)(
        "register_document",
        {
          p_org_id: orgId,
          p_doc_type: docType,
          p_storage_path: path,
          p_center_id: scope === "sponsor" ? null : centerId,
          p_title: title || null,
          p_period_start: periodStart || null,
          p_period_end: periodEnd || null,
          p_valid_from: validFrom || null,
          p_valid_until: validUntil || null,
          p_notes: notes || null,
          p_roster_id: rosterId || null,
        }
      );
      if (regErr) throw new Error(`Register failed: ${regErr.message}`);

      await onRegistered(); // refresh_action_items + reload lists
      setMsg({ kind: "ok", text: "✓ Document uploaded & registered" });
      reset();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={card}>
      <div style={cardHeader}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>⬆️</span>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Upload a document</span>
        </span>
      </div>

      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Scope toggle */}
        <div style={{ display: "flex", gap: 8 }}>
          {(["center", "sponsor"] as Scope[]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              style={{
                ...seg,
                background: scope === s ? "#0f4c35" : "#fff",
                color: scope === s ? "#fff" : "#0f4c35",
              }}
            >
              {s === "center" ? "🏫 Center-level" : "🏢 Sponsor-level"}
            </button>
          ))}
        </div>

        <div style={grid}>
          {scope === "center" && (
            <Field label="Center *">
              <select value={centerId} onChange={(e) => setCenterId(e.target.value)} style={input}>
                <option value="">— select —</option>
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Document type *">
            <select value={docType} onChange={(e) => setDocType(e.target.value)} style={input} disabled={loadingTypes}>
              <option value="">{loadingTypes ? "Loading…" : "— select —"}</option>
              {docTypes.map((t) => (
                <option key={t.code} value={t.code}>
                  {typeLabel(t)}{t.is_required ? " *" : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={input} placeholder="optional" />
          </Field>

          {roster.length > 0 && (
            <Field label="Child (per-child docs)">
              <select value={rosterId} onChange={(e) => setRosterId(e.target.value)} style={input}>
                <option value="">— none —</option>
                {roster.map((r) => (
                  <option key={r.id} value={r.id}>{r.child_name}</option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Period start">
            <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} style={input} />
          </Field>
          <Field label="Period end">
            <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} style={input} />
          </Field>
          <Field label="Valid from">
            <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} style={input} />
          </Field>
          <Field label="Valid until">
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} style={input} />
          </Field>
        </div>

        <Field label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...input, resize: "vertical" }} />
        </Field>

        {/* File drop zone */}
        <div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); acceptFile(e.dataTransfer.files?.[0] ?? null); }}
            style={{
              border: `2px dashed ${dragOver ? "#0f4c35" : fileError ? "#dc3545" : "#c8d8c8"}`,
              borderRadius: 12,
              background: dragOver ? "#eef6ef" : "#fafdfa",
              padding: "26px 20px",
              textAlign: "center",
              transition: "border-color .12s, background .12s",
            }}
          >
            {file ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 22 }}>📄</span>
                <span style={{ fontWeight: 600 }}>{file.name}</span>
                <span style={{ fontSize: 12, color: "#888" }}>{formatBytes(file.size)}</span>
                <button
                  type="button"
                  onClick={clearFile}
                  title="Remove file"
                  style={{ width: 26, height: 26, borderRadius: "50%", border: "1.5px solid #c0d8c0", background: "#fff", color: "#888", cursor: "pointer", lineHeight: 1 }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 30 }}>⬆️</span>
                <div style={{ fontWeight: 600, color: "#0f4c35" }}>Drag and drop your file here</div>
                <div style={{ fontSize: 12, color: "#888" }}>PDF, JPG, JPEG, PNG, WEBP · up to 20 MB</div>
                <button type="button" style={{ ...BTN_SEC, marginTop: 4 }} onClick={() => fileRef.current?.click()}>
                  Choose from files
                </button>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT_ATTR}
              style={{ display: "none" }}
              onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {fileError && (
            <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: "#dc3545" }}>{fileError}</div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={submit} disabled={!canSubmit || busy} style={{ ...BTN_PRI, opacity: !canSubmit || busy ? 0.5 : 1 }}>
            {busy ? "Uploading…" : "Upload & register"}
          </button>
          {msg && (
            <span style={{ fontSize: 13, fontWeight: 600, color: msg.kind === "ok" ? "#0f4c35" : "#dc3545" }}>
              {msg.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Small UI helpers ────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#555" }}>{label}</span>
      {children}
    </label>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────────

const page: React.CSSProperties = {
  padding: "24px 32px",
  fontFamily: "'DM Sans', sans-serif",
  background: "#f4f6f4",
  minHeight: "100vh",
  color: "#1a2e1a",
};
const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e8ece9",
  borderRadius: 14,
  boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  marginBottom: 20,
  overflow: "hidden",
};
const cardHeader: React.CSSProperties = {
  padding: "14px 20px",
  borderBottom: "1px solid #f0f0f0",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};
const empty: React.CSSProperties = { padding: "24px 20px", color: "#aaa", fontSize: 13, textAlign: "center" };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14 };
const input: React.CSSProperties = {
  padding: "7px 10px", borderRadius: 7, border: "1.5px solid #e0e0e0",
  fontSize: 13, fontFamily: "inherit", outline: "none", background: "#fff", width: "100%", boxSizing: "border-box",
};
const seg: React.CSSProperties = {
  padding: "7px 14px", borderRadius: 8, border: "1.5px solid #0f4c35",
  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th: React.CSSProperties = { textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", borderBottom: "1px solid #e8ece9" };
const td: React.CSSProperties = { padding: "8px 12px", borderBottom: "1px solid #f0f3f0", verticalAlign: "top" };
const BTN_PRI: React.CSSProperties = { padding: "8px 18px", borderRadius: 8, border: "none", background: "#0f4c35", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" };
const BTN_SEC: React.CSSProperties = { padding: "7px 14px", borderRadius: 8, border: "1.5px solid #0f4c35", background: "#fff", color: "#0f4c35", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" };
const BTN_DANGER: React.CSSProperties = { padding: "7px 14px", borderRadius: 8, border: "1.5px solid #dc3545", background: "#fff", color: "#dc3545", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" };
