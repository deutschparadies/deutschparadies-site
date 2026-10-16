/* Meta Pixel with cookie consent (GDPR) — Deutschparadies */
(function () {
  var PIXEL_ID = "1036213252810904";
  var KEY = "dp_consent";

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function loadPixel() {
    if (window.fbq) return;
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    fbq("init", PIXEL_ID);
    fbq("track", "PageView");
  }

  // WhatsApp clicks -> "Contact" event (only after consent).
  // The phone opens WhatsApp instantly and the page dies before the event is sent,
  // so we send the event first and open WhatsApp a moment later.
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href*="wa.me"], a[href*="whatsapp"]');
    if (!a || !window.fbq) return;
    fbq("track", "Contact");
    // New tab: this page stays open, the event gets sent normally.
    if (a.target === "_blank" || ev.defaultPrevented || ev.button > 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
    var href = a.href;
    ev.preventDefault();
    setTimeout(function () { window.location.href = href; }, 400);
  }, true);

  function banner() {
    var d = document.createElement("div");
    d.id = "dp-consent";
    d.setAttribute("role", "dialog");
    d.setAttribute("aria-label", "Cookie-uri");
    d.style.cssText = "position:fixed;left:8px;right:8px;bottom:8px;z-index:9999;max-width:520px;margin:0 auto;background:rgba(23,50,38,.96);color:#fff;border-radius:12px;padding:10px 12px;font:13px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.2);display:flex;align-items:center;gap:10px";
    d.innerHTML = '<span style="flex:1">Folosim cookie-uri Meta ca să măsurăm reclamele. ' +
      '<a href="/confidentialitate.html" style="color:#e3a72e">Detalii</a></span>' +
      '<button id="dp-no" style="border:1px solid rgba(255,255,255,.45);border-radius:100px;padding:7px 12px;background:transparent;color:#fff;font:inherit;font-weight:600;cursor:pointer">Refuz</button>' +
      '<button id="dp-yes" style="border:0;border-radius:100px;padding:8px 16px;background:#e3a72e;color:#17231d;font:inherit;font-weight:700;cursor:pointer">Accept</button>';
    document.body.appendChild(d);
    document.getElementById("dp-yes").onclick = function () { set("yes"); d.remove(); loadPixel(); };
    document.getElementById("dp-no").onclick = function () { set("no"); d.remove(); };
  }

  var c = get();
  if (c === "yes") loadPixel();
  else if (c !== "no") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", banner);
    else banner();
  }
})();
