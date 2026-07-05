# Enrollment form embed — Variant A (Step 1: loader + registry skeleton)

**Approved architecture (do not change hosting without sign-off):**

- The **form** is a static site on **GitHub Pages (`pa082508.github.io`)**. Its URL is
  resolved from a **versioned registry** and pinned. This app does **not** host or
  render the form.
- This app (`menumaker-app`) hosts **only the loader + registry**, served as static
  files from the app origin:
  - [`public/embed.js`](../public/embed.js) — the host-side loader.
  - [`public/enroll-registry.json`](../public/enroll-registry.json) — version → GitHub
    Pages URL map + allowed parent origins.
  - [`public/embed-demo.html`](../public/embed-demo.html) — local test host.

## Host snippet (e.g. playacademyusa.com)

```html
<div id="pa-enroll"></div>
<script src="https://<app-origin>/embed.js"
        data-target="#pa-enroll"
        data-form="enroll"
        data-center="pearl"
        data-version="v1"   <!-- optional: pin a specific version -->
        async></script>
<noscript><a href="https://<app-origin>/embed-fallback">Open the enrollment form ↗</a></noscript>
```

## Variant A guarantees (this step)

- **Version pinning** — the iframe src comes from `enroll-registry.json`
  `forms.enroll.versions[<data-version || current>]`. Publishing a new version never
  moves existing embeds unless `current` is bumped; `data-version` pins even then.
- **Origin checks** — the loader accepts `postMessage` **only** from our own iframe
  window **and** the form's exact origin (derived from the registry URL). Host context
  is posted back **targeted to that origin only** (never `*`).
- **Degradation** — no JS → `<noscript>` link; registry/iframe failure or a load
  timeout (9s) → a plain fallback link instead of a blank frame.

## postMessage protocol (namespaced `pa-embed`, v1, marker `__paEmbed:true`)

Envelope on every message: `{__paEmbed:true, ns:'pa-embed', v:1, type, ...}`. Receivers
drop anything failing the envelope or the origin/source check.

- form → loader: `{type:'ready', formType, version}`, `{type:'resize', height}`,
  `{type:'save', formType, formData, signatures, signatureDate, nonce}`.
- loader → form: `{type:'host', host, center, version}` (on `ready`),
  `{type:'inject', center, prefill, reset, nonce}` (initial prefill + reset after save),
  `{type:'saved', ok:true, id, nonce}` / `{type:'error', message, nonce}`.

## Step 2 — DONE (loader side, 2026-07-05)

- Registry pinned to the published forms: `CACFP_Enrollment_v7.html`,
  `IEA_FY2026-27_v5.html` (folder `forms/1-data-sources/`). Registry also carries
  `supabase{url,anonKey}` (public anon key) and a `centers` slug→`{org_id,center_id}` map.
- Loader implements `save` → anon RPC `submit_enrollment_form(..., p_source='embed')`
  → `saved`/`error`, plus `inject` (initial prefill via `data-prefill`, and re-inject
  reset after each save). DB migration `20260705c` extended the source CHECK + RPC guard
  to allow `'embed'`.
- **Verified:** the anon write path (exact `handleSave` call) creates a
  `enrollment_submissions` row with `source='embed'` (smoke row created + deleted).
- **Eyeball pending:** the full in-browser handshake (ready→resize→inject→save→saved)
  against the real v7 form — open `/embed-demo.html`.
