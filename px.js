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

  // WhatsApp clicks -> "Contact" event (only after consent)
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href*="wa.me"], a[href*="whatsapp"]');
    if (a && window.fbq) fbq("track", "Contact");
  }, true);

  function banner() {
    var d = document.createElement("div");
    d.id = "dp-consent";
    d.setAttribute("role", "dialog");
    d.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;max-width:560px;margin:0 auto;background:#173226;color:#fff;border-radius:14px;padding:16px;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.25)";
    d.innerHTML = 'Folosim cookie-uri Meta (Facebook) ca să măsurăm eficiența reclamelor noastre. Ești de acord? ' +
      '<a href="/confidentialitate.html" style="color:#e3a72e">Detalii</a>' +
      '<div style="display:flex;gap:8px;margin-top:12px">' +
      '<button id="dp-yes" style="flex:1;border:0;border-radius:100px;padding:10px;background:#e3a72e;color:#17231d;font-weight:700;cursor:pointer">Accept</button>' +
      '<button id="dp-no" style="flex:1;border:1px solid rgba(255,255,255,.5);border-radius:100px;padding:10px;background:transparent;color:#fff;font-weight:700;cursor:pointer">Refuz</button></div>';
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
