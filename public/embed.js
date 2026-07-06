/*
 * Play Academy — enrollment form embed loader (Variant A skeleton).
 *
 * WHAT THIS IS: the host-side loader ONLY. The form itself is a static site on
 * GitHub Pages (pa082508.github.io); its URL is resolved from a versioned
 * registry and pinned. This app hosts just this loader + the registry — it does
 * NOT render the form.
 *
 * HOST SITE USAGE (e.g. playacademyusa.com):
 *   <div id="pa-enroll"></div>
 *   <script src="https://<app-origin>/embed.js"
 *           data-target="#pa-enroll"
 *           data-form="enroll"
 *           data-center="pearl"
 *           data-version="v1"            <!-- optional: pin a version -->
 *           async></script>
 *   <noscript><a href="https://<app-origin>/embed-fallback">Open the enrollment form</a></noscript>
 *
 * SECURITY (Variant A):
 *   - Version pinning: the iframe src is resolved from enroll-registry.json.
 *     Adding a new version never moves existing embeds unless `current` is bumped
 *     (and data-version pins even against that).
 *   - Origin checks: postMessage is accepted ONLY from the form's exact origin
 *     (derived from the registry URL) AND only from our own iframe's window.
 *   - Degradation: no JS → <noscript> link; registry/iframe failure or a load
 *     timeout → a plain fallback link is shown instead of a blank frame.
 */
(function () {
  'use strict';

  var MARK = '__paEmbed';           // message marker so we ignore unrelated postMessages
  var NS = 'pa-embed';
  var READY_TIMEOUT_MS = 9000;      // no "ready" within this → show fallback

  // The <script> tag that loaded us (currentScript is set while this runs).
  var self = document.currentScript;
  if (!self) {
    // Fallback: last script whose src ends with embed.js
    var ss = document.getElementsByTagName('script');
    for (var i = ss.length - 1; i >= 0; i--) {
      if (ss[i].src && /embed\.js(\?|$)/.test(ss[i].src)) { self = ss[i]; break; }
    }
  }
  if (!self) return;

  var appOrigin = new URL(self.src, location.href).origin;
  var d = self.dataset || {};
  var formKey = d.form || 'enroll';
  var pinnedVersion = d.version || '';            // optional host pin
  var center = d.center || '';
  var registryUrl = d.registry || (appOrigin + '/enroll-registry.json');
  var prefill = null;                              // optional data-prefill='{...}' → inject
  try { if (d.prefill) prefill = JSON.parse(d.prefill); } catch (e) { prefill = null; }

  // Resolve the mount container: data-target selector, else insert after the script.
  function resolveContainer() {
    if (d.target) {
      var el = document.querySelector(d.target);
      if (el) return el;
    }
    var box = document.createElement('div');
    self.parentNode.insertBefore(box, self.nextSibling);
    return box;
  }
  var container = resolveContainer();

  function showFallback(url, msg) {
    container.innerHTML = '';
    var a = document.createElement('a');
    a.href = url || (appOrigin + '/embed-fallback');
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = msg || 'Open the enrollment form ↗';
    a.style.cssText = 'display:inline-block;padding:10px 16px;border:1px solid #0f4c35;border-radius:8px;color:#0f4c35;text-decoration:none;font-family:sans-serif;font-size:14px';
    container.appendChild(a);
  }

  function boot(registry) {
    var form = registry && registry.forms && registry.forms[formKey];
    if (!form) return showFallback(null, 'Enrollment form unavailable ↗');

    var version = pinnedVersion || form.current;
    var formUrl = form.versions && form.versions[version];
    if (!formUrl) return showFallback(form.fallbackUrl, 'Enrollment form unavailable ↗');

    var formOrigin;
    try { formOrigin = new URL(formUrl).origin; }
    catch (e) { return showFallback(form.fallbackUrl); }

    // Resolve the center SLUG the form's <select> understands (pearl/alpha/ridge),
    // even when the in-app host passed a center_id uuid. A <select> silently drops
    // an unknown value → without this the form's CENTER NAME never fills.
    var centersMap = registry.centers || {};
    var centerSlug = center;
    if (center && !centersMap[center]) {
      for (var sk in centersMap) {
        if (centersMap[sk] && centersMap[sk].center_id === center) { centerSlug = sk; break; }
      }
    }

    // Build the iframe src. The form shim reads these: embed=1 (embed mode →
    // hide toolbar, no own writes), v (version), host (parent origin to validate
    // + target), center (slug scope), registry (so the shim can read
    // allowedParentOrigins from the same single source).
    var src = formUrl
      + (formUrl.indexOf('?') === -1 ? '?' : '&')
      + 'embed=1'
      + '&v=' + encodeURIComponent(version)
      + '&host=' + encodeURIComponent(location.origin)
      + '&registry=' + encodeURIComponent(registryUrl)
      + (centerSlug ? '&center=' + encodeURIComponent(centerSlug) : '');

    container.innerHTML = '';
    var iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.title = 'Play Academy enrollment form';
    iframe.setAttribute('loading', 'lazy');
    // Least privilege: scripts + forms; same-origin so the form keeps its own
    // origin (needed to call its backend). NOT allow-top-navigation.
    iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin allow-popups');
    iframe.style.cssText = 'border:0;display:block;background:transparent';
    container.appendChild(iframe);

    // The forms are fixed-width paper replicas (enrollment ≈ 1275px). Render at
    // natural width and scale to fit the container, so the whole form is visible
    // with no right-side clipping and no horizontal scroll. FORM_W is overridable
    // via data-formwidth; contentH tracks the form's reported height.
    var FORM_W = parseInt(d.formwidth, 10) || 1275;
    var contentH = 560;
    function fit() {
      var cw = container.clientWidth || FORM_W;
      var scale = Math.min(1, cw / FORM_W);
      iframe.style.width = FORM_W + 'px';
      iframe.style.height = contentH + 'px';
      iframe.style.transformOrigin = 'top left';
      iframe.style.transform = 'scale(' + scale + ')';
      container.style.height = Math.ceil(contentH * scale) + 'px';
      container.style.overflowX = 'hidden';
    }
    fit();
    window.addEventListener('resize', fit);

    // Config for the embed-mode write path (all from the single registry source).
    var sb = registry.supabase || null;
    // Resolve center by slug (pearl) OR by center_id (uuid) — the in-app host
    // passes a uuid, external snippets pass a slug.
    var centerCfg = (center && centersMap[center]) || null;
    if (!centerCfg && center) {
      for (var ck in centersMap) {
        if (centersMap[ck] && centersMap[ck].center_id === center) { centerCfg = centersMap[ck]; break; }
      }
    }
    var submissionType = form.submissionType || 'cacfp_enrollment';

    function genNonce() { return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2); }
    // All outbound messages carry the pa-embed v1 envelope and target formOrigin only.
    function postToForm(type, extra) {
      var m = { __paEmbed: true, ns: NS, v: 1, type: type };
      if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) m[k] = extra[k];
      if (iframe.contentWindow) iframe.contentWindow.postMessage(m, formOrigin);
    }
    // Notify the host modal so its footer can show saving / saved / error.
    function hostEvent(name, detail) {
      try { window.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); } catch (e) {}
    }

    // save (embed mode): the form does NOT write; it hands us form_data and we
    // persist via the anon RPC submit_enrollment_form (p_source='embed').
    function handleSave(msg) {
      var nonce = msg.nonce;
      function fail(message) { hostEvent('pa-embed:error', { message: message }); return postToForm('error', { nonce: nonce, message: message }); }
      if (!sb || !sb.url || !sb.anonKey) return fail('embed backend not configured');
      if (!centerCfg) return fail('unknown center "' + center + '"');
      var body = {
        p_org: centerCfg.org_id, p_center: centerCfg.center_id,
        p_submission_type: msg.formType || submissionType,
        p_form_data: msg.formData || {},
        p_signatures: msg.signatures || {},
        p_signature_date: msg.signatureDate || null,
        p_source: 'embed'
      };
      fetch(sb.url + '/rest/v1/rpc/submit_enrollment_form', {
        method: 'POST', credentials: 'omit',
        headers: {
          'apikey': sb.anonKey, 'Authorization': 'Bearer ' + sb.anonKey,
          'Content-Type': 'application/json', 'Content-Profile': 'menumaker', 'Accept': 'application/json'
        },
        body: JSON.stringify(body)
      })
        .then(function (r) { return r.text().then(function (t) { return { ok: r.ok, status: r.status, text: t }; }); })
        .then(function (res) {
          if (!res.ok) return fail('save failed (' + res.status + ')');
          var id; try { id = JSON.parse(res.text); } catch (e) { id = res.text; }
          postToForm('saved', { nonce: nonce, ok: true, id: id });
          // Notify the host page (footer shows "saved"; Inbox refreshes its list).
          hostEvent('pa-embed:saved', { id: id, center: center });
          // Re-inject: reset the form for the next submission (keep the center).
          postToForm('inject', { nonce: genNonce(), center: centerSlug, prefill: null, reset: true });
        })
        .catch(function () { fail('network error'); });
    }

    var ready = false;
    var timer = setTimeout(function () {
      if (!ready) showFallback(formUrl, 'Open the enrollment form ↗');
    }, READY_TIMEOUT_MS);
    iframe.onerror = function () { clearTimeout(timer); showFallback(formUrl); };

    // Origin-checked message bridge. Accept ONLY our iframe's window AND the
    // form's exact origin AND the pa-embed v1 envelope. Everything else ignored.
    function onMessage(ev) {
      if (ev.source !== iframe.contentWindow) return;
      if (ev.origin !== formOrigin) return;
      var msg = ev.data;
      if (!msg || msg[MARK] !== true || msg.ns !== NS || msg.v !== 1) return;
      switch (msg.type) {
        case 'ready':
          ready = true; clearTimeout(timer);
          // Hand the form its host context (targeted to formOrigin only).
          postToForm('host', { host: location.origin, center: centerSlug, version: version });
          // Optional initial prefill / configuration.
          if (prefill) postToForm('inject', { nonce: genNonce(), center: centerSlug, prefill: prefill, reset: false });
          break;
        case 'resize':
          if (typeof msg.height === 'number' && msg.height > 0) {
            contentH = Math.ceil(msg.height);
            fit();
          }
          break;
        case 'save':
          handleSave(msg);
          break;
        case 'saveerror':
          // Form-side validation failed on a host-driven submit.
          hostEvent('pa-embed:error', { message: msg.message || 'Please complete the form' });
          break;
        // unknown types are ignored (forward-compat)
      }
    }
    window.addEventListener('message', onMessage, false);

    // Host-driven submit: the modal footer dispatches pa-embed:submit (scoped to
    // this mount via detail.target) → tell the form to run its own save_(), since
    // its toolbar/submit button is hidden in embed mode.
    window.addEventListener('pa-embed:submit', function (ev) {
      if (ev && ev.detail && ev.detail.target && ev.detail.target !== container.id) return;
      if (!iframe.contentWindow) return;
      postToForm('submit', { nonce: genNonce() });
    }, false);
  }

  // Fetch the registry, then boot. Any failure → graceful fallback link.
  try {
    fetch(registryUrl, { credentials: 'omit', cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('registry ' + r.status); return r.json(); })
      .then(boot)
      .catch(function () { showFallback(null, 'Open the enrollment form ↗'); });
  } catch (e) {
    showFallback(null, 'Open the enrollment form ↗');
  }
})();
