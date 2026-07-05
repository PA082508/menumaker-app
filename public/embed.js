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

    // Build the iframe src. The form shim reads these: embed=1 (embed mode →
    // hide toolbar, no own writes), v (version), host (parent origin to validate
    // + target), center (scope), registry (so the shim can read
    // allowedParentOrigins from the same single source).
    var src = formUrl
      + (formUrl.indexOf('?') === -1 ? '?' : '&')
      + 'embed=1'
      + '&v=' + encodeURIComponent(version)
      + '&host=' + encodeURIComponent(location.origin)
      + '&registry=' + encodeURIComponent(registryUrl)
      + (center ? '&center=' + encodeURIComponent(center) : '');

    container.innerHTML = '';
    var iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.title = 'Play Academy enrollment form';
    iframe.setAttribute('loading', 'lazy');
    // Least privilege: scripts + forms; same-origin so the form keeps its own
    // origin (needed to call its backend). NOT allow-top-navigation.
    iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin allow-popups');
    iframe.style.cssText = 'width:100%;border:0;display:block;min-height:520px;background:transparent';
    container.appendChild(iframe);

    var ready = false;
    var timer = setTimeout(function () {
      if (!ready) showFallback(formUrl, 'Open the enrollment form ↗');
    }, READY_TIMEOUT_MS);
    iframe.onerror = function () { clearTimeout(timer); showFallback(formUrl); };

    // Origin-checked message bridge. Accept ONLY our iframe's window AND the
    // form's exact origin. Everything else is ignored.
    function onMessage(ev) {
      if (ev.source !== iframe.contentWindow) return;
      if (ev.origin !== formOrigin) return;
      var msg = ev.data;
      if (!msg || msg[MARK] !== true || msg.ns !== NS) return;
      switch (msg.type) {
        case 'ready':
          ready = true; clearTimeout(timer);
          // Hand the form its host context, targeted to the form's origin only.
          iframe.contentWindow.postMessage(
            { __paEmbed: true, ns: NS, type: 'host', host: location.origin, center: center, version: version },
            formOrigin
          );
          break;
        case 'resize':
          if (typeof msg.height === 'number' && msg.height > 0) {
            iframe.style.height = Math.ceil(msg.height) + 'px';
          }
          break;
        // 'submitted' etc. handled in phase 2.
      }
    }
    window.addEventListener('message', onMessage, false);
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
