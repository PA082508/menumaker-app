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

## postMessage protocol (namespaced `pa-embed`, marker `__paEmbed:true`)

- form → loader: `{type:'ready'}`, `{type:'resize', height}` (more in phase 2).
- loader → form: `{type:'host', host, center, version}` (sent once, on `ready`).

## TODO before go-live (Step 2 = form content)

- **Set the real GitHub Pages URL** in `enroll-registry.json` (currently
  `PLACEHOLDER-forms-repo` — repo/path TBD by Nikolay).
- Build the form on GitHub Pages: implement the `ready`/`resize` handshake, validate
  `host` against `allowedParentOrigins`, and submit via the `submit_enrollment_form`
  RPC (anon). Then wire `submitted`/`navigate` messages in the loader.
