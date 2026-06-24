// src/pages/dispatch/DispatchPage.tsx
// ──────────────────────────────────────────────────────────────────────────────
// Dispatch screen — Feature F
//
// Self-contained page for admins / office managers. On open it:
//   1. refreshes action items   (rpc: refresh_action_items)
//   2. builds dispatch drafts   (rpc: build_dispatch)
//   3. loads the resulting draft rows (dispatch_drafts where status = 'draft')
//
// Each draft becomes an editable card. The office manager can:
//   • edit the body text in-place
//   • jump to the relevant form ("Fill" chips → /forms/* routes)
//   • polish the text with Claude ("Generate text" → dispatch-compose edge fn)
//   • Approve  (status → 'approved', stores body_approved + approver + timestamp)
//   • Mark handled (status → 'handled' — office sends it manually; no auto-send)
//
// Approved / handled cards drop out of the list locally. No real email is sent
// from this screen — sending is done manually by the office per spec.
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/hooks/useAuth";

// Claude "Generate text" relies on the `dispatch-compose` edge function, which
// is not deployed yet — keep the button hidden until it ships.
// TODO: confirm `dispatch-compose` edge function name, then flip this to true.
const DISPATCH_COMPOSE_ENABLED = false;

// ─── Types ──────────────────────────────────────────────────────────────────
interface DispatchDraft {
  id: string;
  recipient_role: string | null;
  recipient_email: string | null;
  subject: string | null;
  body_draft: string | null;
  body_approved: string | null;
  attach_form_codes: string[] | null;
  status: string | null;
  // select('*') brings extra columns — tolerated.
  [key: string]: unknown;
}

// ─── Form-code map: code → { label, route } ──────────────────────────────────
const FORM_MAP: Record<string, { label: string; route: string }> = {
  ieg_application:         { label: "IEA application",               route: "/forms/iea" },
  special_diet_statement:  { label: "Medical / special diet form",   route: "/forms/medical" },
  enrollment_form:         { label: "Enrollment form",               route: "/forms/enrollment" },
};

function formLabel(code: string): string {
  return FORM_MAP[code]?.label ?? code;
}

function formRoute(code: string): string | null {
  return FORM_MAP[code]?.route ?? null;
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function DispatchPage() {
  const { org } = useOrg();
  const orgId = org?.id;
  const { role } = useAuth();
  const navigate = useNavigate();

  const canAccess = role === "admin" || role === "office_manager";

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DispatchDraft[]>([]);

  // Per-draft working text (textarea value), keyed by draft id.
  const [bodyText, setBodyText] = useState<Record<string, string>>({});

  // Per-draft busy / error flags.
  const [genBusy, setGenBusy] = useState<Record<string, boolean>>({});
  const [genError, setGenError] = useState<Record<string, string>>({});
  const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({});

  // ── Build + load drafts ─────────────────────────────────────────────────────
  const buildAndLoad = useCallback(async () => {
    if (!orgId || !canAccess) return;
    setLoading(true);
    setLoadError(null);
    try {
      // 1. refresh action items
      const { error: e1 } = await (supabase.schema("menumaker").rpc as any)(
        "refresh_action_items",
        { p_org_id: orgId }
      );
      if (e1) throw new Error(e1.message);

      // 2. build dispatch drafts
      const { error: e2 } = await (supabase.schema("menumaker").rpc as any)(
        "build_dispatch",
        { p_org_id: orgId }
      );
      if (e2) throw new Error(e2.message);

      // 3. read the draft rows
      const { data, error: e3 } = await supabase
        .schema("menumaker")
        .from("dispatch_drafts")
        .select("*")
        .eq("status", "draft");
      if (e3) throw new Error(e3.message);

      const rows = (data ?? []) as DispatchDraft[];
      setDrafts(rows);
      // seed working text from body_draft
      const seed: Record<string, string> = {};
      rows.forEach((d) => { seed[d.id] = d.body_draft ?? ""; });
      setBodyText(seed);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [orgId, canAccess]);

  useEffect(() => { buildAndLoad(); }, [buildAndLoad]);

  // ── Generate text with Claude ───────────────────────────────────────────────
  async function generateText(draft: DispatchDraft) {
    setGenBusy((b) => ({ ...b, [draft.id]: true }));
    setGenError((e) => ({ ...e, [draft.id]: "" }));
    try {
      const codes = draft.attach_form_codes ?? [];
      const form_names = codes.map(formLabel);

      // Fetch last few APPROVED/handled bodies for the SAME recipient_role as examples.
      const { data: exData } = await supabase
        .schema("menumaker")
        .from("dispatch_drafts")
        .select("body_approved")
        .eq("recipient_role", draft.recipient_role ?? "")
        .in("status", ["approved", "handled"])
        .not("body_approved", "is", null)
        .order("approved_at", { ascending: false })
        .limit(3);

      const examples = (exData ?? [])
        .map((r: { body_approved: string | null }) => r.body_approved)
        .filter((t): t is string => !!t);

      // TODO: confirm edge function name for Claude text generation
      const { data, error } = await supabase.functions.invoke("dispatch-compose", {
        body: {
          body_draft: bodyText[draft.id] ?? draft.body_draft ?? "",
          form_names,
          examples,
        },
      });
      if (error) throw new Error(error.message);

      // Be defensive about the response shape.
      const text =
        (data && typeof data === "object" && "text" in data && (data as any).text) ||
        (data && typeof data === "object" && "body" in data && (data as any).body) ||
        (typeof data === "string" ? data : "") ||
        "";

      if (text) {
        setBodyText((b) => ({ ...b, [draft.id]: String(text) }));
      } else {
        throw new Error("Empty response from generator");
      }
    } catch (err: unknown) {
      setGenError((e) => ({
        ...e,
        [draft.id]: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setGenBusy((b) => ({ ...b, [draft.id]: false }));
    }
  }

  // ── Approve / Mark handled ──────────────────────────────────────────────────
  async function approveDraft(draft: DispatchDraft) {
    setActionBusy((b) => ({ ...b, [draft.id]: true }));
    try {
      const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
      const { error } = await supabase
        .schema("menumaker")
        .from("dispatch_drafts")
        .update({
          body_approved: bodyText[draft.id] ?? "",
          status: "approved",
          approved_by: uid,
          approved_at: new Date().toISOString(),
        })
        .eq("id", draft.id);
      if (error) throw new Error(error.message);
      setDrafts((ds) => ds.filter((d) => d.id !== draft.id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy((b) => ({ ...b, [draft.id]: false }));
    }
  }

  async function markHandled(draft: DispatchDraft) {
    setActionBusy((b) => ({ ...b, [draft.id]: true }));
    try {
      const { error } = await supabase
        .schema("menumaker")
        .from("dispatch_drafts")
        .update({ status: "handled" })
        .eq("id", draft.id);
      if (error) throw new Error(error.message);
      setDrafts((ds) => ds.filter((d) => d.id !== draft.id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy((b) => ({ ...b, [draft.id]: false }));
    }
  }

  // ── Access gate ─────────────────────────────────────────────────────────────
  if (!canAccess) {
    return (
      <div style={PAGE}>
        <div style={{ ...CARD, textAlign: "center", color: "#856404", background: "#fffbea" }}>
          <div style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: ".4rem" }}>
            Access restricted
          </div>
          <div style={{ fontSize: ".88rem", color: "#666" }}>
            This screen is only available to administrators and office managers.
          </div>
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={PAGE}>
      <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: "1.25rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "#0f4c35" }}>
          ✉️ Dispatch
        </h2>
        <span style={{ fontSize: ".82rem", color: "#888" }}>
          {loading ? "" : `${drafts.length} draft${drafts.length === 1 ? "" : "s"}`}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={buildAndLoad} disabled={loading} style={BTN_SEC}>
          {loading ? "…" : "↺ Refresh"}
        </button>
      </div>

      {loadError && (
        <div style={ERR_BOX}>⚠️ {loadError}</div>
      )}

      {loading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "#888" }}>
          <Spinner />
          <div style={{ marginTop: ".75rem", fontSize: ".88rem" }}>Building dispatch…</div>
        </div>
      ) : drafts.length === 0 ? (
        <div style={{ ...CARD, textAlign: "center", color: "#888", padding: "3rem 1rem" }}>
          No drafts to dispatch
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          {drafts.map((draft) => {
            const busyGen = !!genBusy[draft.id];
            const busyAct = !!actionBusy[draft.id];
            const gErr = genError[draft.id];
            const codes = draft.attach_form_codes ?? [];
            return (
              <div key={draft.id} style={CARD}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "baseline", gap: ".6rem", flexWrap: "wrap", marginBottom: ".5rem" }}>
                  <span style={{
                    fontSize: ".72rem", fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: ".03em", color: "#0a3320", background: "#7ee8b0",
                    padding: ".15rem .55rem", borderRadius: 999,
                  }}>
                    {draft.recipient_role ?? "—"}
                  </span>
                  <span style={{ fontSize: ".85rem", color: "#555" }}>
                    {draft.recipient_email ?? "(no email)"}
                  </span>
                </div>

                {/* Subject */}
                <div style={{ fontWeight: 700, color: "#0a3320", fontSize: "1rem", marginBottom: ".6rem" }}>
                  {draft.subject ?? "(no subject)"}
                </div>

                {/* Body editor */}
                <textarea
                  value={bodyText[draft.id] ?? ""}
                  onChange={(e) => setBodyText((b) => ({ ...b, [draft.id]: e.target.value }))}
                  rows={6}
                  style={{
                    width: "100%", boxSizing: "border-box", resize: "vertical",
                    padding: ".7rem .8rem", borderRadius: 10, border: "1px solid #e8ece9",
                    fontFamily: "'DM Sans', sans-serif", fontSize: ".9rem", lineHeight: 1.5,
                    color: "#1a2620", background: "#fafbfa",
                  }}
                />

                {/* Attachment chips */}
                {codes.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem", marginTop: ".7rem" }}>
                    {codes.map((code) => {
                      const route = formRoute(code);
                      const label = formLabel(code);
                      return (
                        <button
                          key={code}
                          onClick={() => route && navigate(route)}
                          disabled={!route}
                          title={route ? `Open ${label}` : "No form linked"}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: ".35rem",
                            padding: ".3rem .7rem", borderRadius: 999,
                            border: "1.5px solid " + (route ? "#0f4c35" : "#ccc"),
                            background: route ? "#fff" : "#f4f6f4",
                            color: route ? "#0f4c35" : "#999",
                            fontWeight: 600, fontSize: ".78rem",
                            cursor: route ? "pointer" : "default",
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          {route && <span>📝</span>}
                          {route ? `Fill: ${label}` : label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Generation error */}
                {gErr && (
                  <div style={{ ...ERR_BOX, marginTop: ".7rem", marginBottom: 0 }}>
                    ⚠️ {gErr}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", marginTop: ".9rem" }}>
                  {DISPATCH_COMPOSE_ENABLED && (
                    <button
                      onClick={() => generateText(draft)}
                      disabled={busyGen || busyAct}
                      style={BTN_SEC}
                    >
                      {busyGen ? "Generating…" : "✨ Generate text"}
                    </button>
                  )}
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={() => markHandled(draft)}
                    disabled={busyAct || busyGen}
                    style={BTN_SEC}
                  >
                    {busyAct ? "…" : "✓ Mark handled"}
                  </button>
                  <button
                    onClick={() => approveDraft(draft)}
                    disabled={busyAct || busyGen}
                    style={BTN_PRI}
                  >
                    {busyAct ? "Saving…" : "✅ Approve"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <>
      <div style={{
        display: "inline-block", width: 32, height: 32,
        border: "3px solid #e8ece9", borderTopColor: "#0f4c35", borderRadius: "50%",
        animation: "dispatch-spin 0.8s linear infinite",
      }} />
      <style>{`@keyframes dispatch-spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

// ─── Shared styles ──────────────────────────────────────────────────────────────
const PAGE: React.CSSProperties = {
  padding: "1.5rem",
  fontFamily: "'DM Sans', sans-serif",
  maxWidth: 820,
  margin: "0 auto",
  background: "#f4f6f4",
  minHeight: "100%",
};

const CARD: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e8ece9",
  borderRadius: 14,
  padding: "1.1rem 1.25rem",
};

const ERR_BOX: React.CSSProperties = {
  padding: ".55rem .8rem",
  background: "#fee",
  border: "1px solid #dc3545",
  borderRadius: 8,
  fontSize: ".82rem",
  color: "#b02a37",
  marginBottom: "1rem",
};

const BTN_PRI: React.CSSProperties = {
  padding: ".45rem 1rem", borderRadius: 9, border: "none",
  background: "#0f4c35", color: "#fff", fontWeight: 600, fontSize: ".84rem",
  cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
};

const BTN_SEC: React.CSSProperties = {
  padding: ".45rem 1rem", borderRadius: 9, border: "1.5px solid #0f4c35",
  background: "#fff", color: "#0f4c35", fontWeight: 600, fontSize: ".84rem",
  cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
};
