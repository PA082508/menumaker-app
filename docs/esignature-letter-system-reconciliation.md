# Letter ↔ System Reconciliation — e-signature / enrollment integrity

**Rebuilt in-repo:** 2026-07-25 · **Owner:** Nikolay · Companion to
[`esignature-system-description.md`](./esignature-system-description.md)

> **What this is.** The sent letter to the state (AS SENT 2026-07) describes an e-signature
> and enrollment-record system. This table isolates the **four points where the letter runs
> ahead of what the system did at the time of the сверка**, and records how each is closed.
> Three closed with small platform build-outs; the fourth closes with an honest wording.
>
> The **«letter»** column paraphrases the claim as surfaced by the reconciliation — the
> verbatim letter text is the AS-SENT reference copy (held: bytes not yet in repo as
> `docs/regulatory/letter-2026-07-odew-sent.md`). Nothing here quotes the letter directly.

## The four points

| # | Point | «letter» (claim) | System at сверка | Closure | Status |
|---|-------|------------------|------------------|---------|--------|
| 1 | **Server timestamp** | the record carries a trusted server-side timestamp of signing | seal trigger present, but no signature-specific server seal moment distinct from the client `signature_date` | added `sealed_at` — server `now()` in the function, frozen by the seal trigger; `signature_date` kept as the client-entered, sealed value (distinction named honestly, §7) | ✅ **Implemented** — prod 2026-07-25 |
| 2 | **Consent** | explicit e-signature consent is recorded on the record | `esign_consent_at` column + write-path exist; nothing emits the consent signal yet | platform-side capture wired (function + `embed.js`); parent-facing consent checkbox that emits the signal = storefront follow-up | 🟡 **Planned** — platform-side wired; form-side emission by **2026-09-15** |
| 3 | **Form version** | each record is pinned to the exact form version signed | version frozen at the storefront, but not written onto the record | `form_version` written at submit — `embed.js` sends the resolved registry version; manual entries marked `manual_entry` | ✅ **Implemented for new submissions** — from 2026-07-25 |
| 4 | **Meal gate** | the system gates enrollment on meal eligibility | advisory only — meal profile derived/displayed against the roster; no attendance-anchored enforcement | **honest wording**, not a code change: *"meal counts are advisory against the active roster today; a hard attendance-anchored gate launches with the GatePulse rollout"* | ✅ **Reworded** (description §4) — enforcement **Planned** with GatePulse |

## Evidence (2026-07-25)

- §1 `sealed_at`: migration `20260725_signature_server_sealed_at.sql` applied to prod;
  read-back R1–R4 green (column nullable; RPC 11-arg/DEFINER/anon+auth; fresh submit
  `sealed_at` non-null ≈ `created_at`; update of `sealed_at` on a sealed row **blocked**).
- §3/§2 wiring: `embed.js` + `AddChildRouter` merged to `main` and deployed (Vercel);
  deployed `embed.js` confirmed carrying `p_source:'online'`, `p_form_version`,
  `p_esign_consent`, `p_signature_sample_id`.
- Path smoke (self-abort, no residue): submit `source='online'`, `form_version='v7'`,
  consent=true → row carried `source=online · form_version=v7 · consent_set · sealed_at set
  · hash_len=64`.
- Also fixed en route: `embed.js` `p_source 'embed'→'online'` — the embedded form's
  submissions were being rejected by the function's source check (old v9 bug); they now file
  correctly as `online`.

## Checklist — DUE 2026-09-15

- [ ] **Storefront consent checkbox** on the parent form (form-kit, external repo
  `pa082508.github.io`) rendering an e-signature consent control.
- [ ] **Form-kit emits `esignConsent: true`** in its `save` postMessage → `embed.js` already
  forwards it as `p_esign_consent`. Coordinated **kit-bust**: bump `?v=<N>` in all includes
  in the same commit.
- [ ] Read-back: a real storefront submission shows `esign_consent_at` populated → flip
  consent **Planned → Implemented** in the description (§9) and this table (#2).
- [ ] (Related, on word) `submit_public_form` gets the same seal as `submit_enrollment_form`.
- [ ] **Live storefront сверка by Nikolay** on the same entry point closes #3 (and #2 once
  form-side ships) — headless verification alone is necessary but not sufficient.

## Held (not blockers to the above)

- **AS-SENT letter reference copy** — `docs/regulatory/letter-2026-07-odew-sent.md` not yet
  created: the letter/overview bytes have not arrived (appendix came empty twice). The
  «letter» column above is reconstructed from the four сверка points, not from the letter
  text.
