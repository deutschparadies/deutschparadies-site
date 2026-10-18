import { onRequest as favicon } from "../functions/favicon.png.js";
import { onRequest as appleTouchIcon } from "../functions/apple-touch-icon.png.js";
import { leadBox, contactCardInner } from "./lead-html.js";

const IMAGES = {
  "/favicon.png": favicon,
  "/apple-touch-icon.png": appleTouchIcon,
};

// Share image for the home page (Facebook / WhatsApp preview), hosted on Cloudinary
const OG_IMAGE_URL = "https://res.cloudinary.com/huqvafro/image/upload/deutschparadies/share-home.jpg";

// Homepage title + description shown in Google search results (and link previews).
// Overrides the <title>/<meta> in index.html.
const HOME_TITLE = "Cursuri și meditații germană online | Grupe de max. 4 | Deutschparadies";
const HOME_DESC = "Cursuri de germană live online, A1–C1, în grupe de maximum 4 cursanți. Pregătire telc. Scrie-ne pe WhatsApp!";

// ---- Lernraum (student app) at /app/ ----
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
// Teacher (admin) password: only this can change the student password. Stored in KV "admin"; this is the initial value.
const ADMIN_DEFAULT = {"salt": "46dd4eace911f4687eeea4bb34ecfdc4", "it": 20000, "hash": "272bf63bc77d896c9b6214c75f73c50bb6ef9e7d4bc9edf28e108361837c8eb6"};
async function pbkdf2Hex(pw, salt, it) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: it }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function currentAdmin(env) {
  const stored = env.APPKV ? await env.APPKV.get("admin", "json") : null;
  return stored && stored.hash ? stored : ADMIN_DEFAULT;
}
async function currentAccess(request, env) {
  const stored = env.APPKV ? await env.APPKV.get("access", "json") : null;
  if (stored && stored.hash) return stored;
  const res = await env.ASSETS.fetch(new Request(new URL("/app/access.json", request.url)));
  return res.ok ? await res.json() : null;
}
// Lernraum: "Texte" button next to Buch / Dialoge (one Google Drive folder per level: [Buch, Dialoge, Texte]).
const LERN_FOLDERS = {
  "A1.1": ["1VHCji-yC88Dlrl_yx4ACwAYE3jzMPQaB", "1H0FpU0GLr0ksVK-r2VR50Ub519rpQNJp", "10xnUwxxPuT53aBxElVnuc4DBydMuvFMP"],
  "A1.2": ["1KaKGmt1w2NkgV-FdCSuV2W2LtKwG2p8W", "1liUk12JO2w8IzyJWGGK6yBb0LOWLbUIa", "1tXhSxNYwMvz7gI7_3fADMcNGgMAk3I6n"],
  "A2.1": ["1QeQ1X30V6DTLopdoHsvn9UjCvnesJqco", "1rfmjjOeIj4BfIXviP6xc6mYbbrBpydmm", "1kT6SzGBtEGLMVk22tN0KGF5Z3q77rEfM"],
  "A2.2": ["1S0J1MFtmWnqBILqnhLhiRGFHZ9mjGlhl", "1RZwperIRZzo0vTZqKMN2eK4H8Y4IOIv-", "1Z1rlPlbCJF6nlC5piiuT_udDE7YyQMJO"],
  "B1.1": ["1L3G0rDte0EVszz6GYPW9--fhaiWm0mwO", "1u1pKJvLgV3yCjmbeNXJOAJkc7gau-EW-", "1hIv7XhuSw_HzVkihFMEe-7Q0kPtE-c3o"],
  "B1.2": ["1CKZpAyMawCbT5o6OMARCSk86sG9coM9d", "1EgjCnfZomq7DP78v6H0KE-Oi3LUIubcH", "1dXBGJ1mtdD-GfUTg2Eoj_434irrX00aL"],
  "B2.1": ["1WgIO1w8O-3l1J9Sz-9lCqm_e2O-_cmlI", "1jSkgHe3EqOC0VmPQuBxD3SFNp9vycmuk", "141ZxEOG4lENrlVj8OrxKn4ueP7S82DN1"],
  "B2.2": ["1NDqe13FWldTnl3Gf9ZWX_pAcdSH2HYBB", "1xc-a0KxNUgP0LPILk4UzOgTM5QsmENSW", "11WEGl8CE15Z-y754cgue9ewiJxAQekaU"],
};
const TEXTE_SCRIPT = `<style>.mats{display:grid;grid-template-columns:1fr 1fr;gap:8px}.mat{display:flex;flex-direction:column;gap:2px;text-decoration:none;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:var(--r,14px);padding:14px}.mat b{font-family:var(--display);font-size:1.05rem}.mat b::after{content:" \\2197";color:var(--gold)}.mat small{color:var(--muted)}</style>
<script>(function(){var F=${JSON.stringify(LERN_FOLDERS)},D="https://drive.google.com/drive/folders/";
function link(cls,href,t,s){var a=document.createElement("a");a.className="mat "+cls;a.href=href;a.target="_blank";a.rel="noopener";a.innerHTML="<b>"+t+"</b><small>"+s+"</small>";return a}
function add(){var app=document.getElementById("app");if(!app)return;
 var hs=[].slice.call(app.querySelectorAll(".section-h h2")),h=null;for(var i=0;i<hs.length;i++){if(/^[AB][12]\\.[12]$/.test(hs[i].textContent.trim())){h=hs[i];break}}var lv=h&&h.textContent.trim();
 var m=app.querySelector(".mats");
 if(m){if(m.querySelector(".mat-texte"))return;var s=m.querySelector(".mat small");var k=s&&(s.textContent.match(/zum\\s+(\\S+)/)||[])[1];k=k||lv;if(!F[k])return;m.appendChild(link("mat-texte",D+F[k][2],"Texte","Lesetexte zum "+k));return}
 if(!lv||!F[lv])return;var box=h.closest(".section-h").parentElement;var ls=box.querySelectorAll(".list");if(!ls.length)return;
 var sh=document.createElement("div");sh.className="section-h";sh.innerHTML="<h2>Materialien</h2>";
 var g=document.createElement("div");g.className="mats";
 g.appendChild(link("","https://drive.google.com/drive/folders/"+F[lv][0],"Buch","PDF zum "+lv));
 g.appendChild(link("",D+F[lv][1],"Dialoge","Dialoge zum "+lv));
 g.appendChild(link("mat-texte",D+F[lv][2],"Texte","Lesetexte zum "+lv));
 ls[ls.length-1].after(sh,g);}
function go(){var r=document.getElementById("app")||document.body;add();new MutationObserver(function(){add()}).observe(r,{childList:true,subtree:true});}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",go);else go();})();</script>`;

async function appRoute(request, env, path) {
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
  if (path === "/app/access.json") {
    const acc = await currentAccess(request, env);
    return acc ? json(acc) : json({ error: "missing" }, 500);
  }
  if (path === "/app/api/password") {
    if (request.method !== "POST") return json({ error: "method" }, 405);
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: "bad" }, 400); }
    if (!body || typeof body.admin !== "string" || body.admin.length > 200) return json({ error: "bad" }, 400);
    const adm = await currentAdmin(env);
    if ((await pbkdf2Hex(body.admin, adm.salt, adm.it)) !== adm.hash) return json({ error: "wrong" }, 403);
    const acc = await currentAccess(request, env);
    if (!acc) return json({ error: "missing" }, 500);
    let out = acc;
    if (typeof body.next === "string" && body.next.length) {
      if (body.next.length < 6 || body.next.length > 100) return json({ error: "short" }, 400);
      out = { v: (acc.v || 1) + 1, salt: acc.salt, hash: await sha256Hex(acc.salt + body.next) };
      await env.APPKV.put("access", JSON.stringify(out));
    }
    if (typeof body.newAdmin === "string" && body.newAdmin.length) {
      if (body.newAdmin.length < 6 || body.newAdmin.length > 100) return json({ error: "short" }, 400);
      const salt = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
      await env.APPKV.put("admin", JSON.stringify({ salt, it: ADMIN_DEFAULT.it, hash: await pbkdf2Hex(body.newAdmin, salt, ADMIN_DEFAULT.it) }));
    }
    return json(out);
  }
  const res = await env.ASSETS.fetch(request);
  const out = new Response(res.body, res);
  out.headers.set("x-robots-tag", "noindex");
  if ((out.headers.get("content-type") || "").includes("text/html")) {
    out.headers.set("cache-control", "no-cache");
    return new HTMLRewriter().onDocument({
      end(end) { end.append(TEXTE_SCRIPT, { html: true }); },
    }).transform(out);
  }
  return out;
}

async function ogImage() {
  const res = await fetch(OG_IMAGE_URL);
  return new Response(res.body, {
    status: res.status,
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "public, max-age=86400",
    },
  });
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === "/app" ) return Response.redirect(new URL("/app/", request.url).toString(), 301);
    if (path.startsWith("/app/")) return appRoute(request, env, path);
    if (path === "/og-image.jpg") return ogImage();
    const image = IMAGES[path];
    if (image) return image();
    const res = await env.ASSETS.fetch(request);
    const type = res.headers.get("content-type") || "";
    if (!type.includes("text/html")) return res;
    const isHome = path === "/" || path === "/index.html" || path === "/index";
    const m = path.match(/^\/cursuri\/([abc][12])-([12])(\.html)?\/?$/i);
    const course = m ? `${m[1].toUpperCase()}.${m[2]}` : "";
    const hasForm = isHome || !!course;
    let rw = new HTMLRewriter().on("head", {
      element(el) {
        // Meta Pixel (loads only after cookie consent) on every page
        el.append('<script src="/px.js" defer></script>', { html: true });
        if (hasForm) el.append('<link rel="stylesheet" href="/lead.css">', { html: true });
      },
    });
    if (isHome) {
      rw = rw
        .on("head > title", {
          element(el) {
            el.setInnerContent(HOME_TITLE);
          },
        })
        .on('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]', {
          element(el) {
            el.setAttribute("content", HOME_DESC);
          },
        })
        .on('meta[property="og:title"], meta[name="twitter:title"]', {
          element(el) {
            el.setAttribute("content", HOME_TITLE);
          },
        })
        .on("section.hero-simple", {
          element(el) {
            el.after(`<div class="lead-top">${leadBox("", "h3").replace('id="inscriere"', 'id="inscriere-sus"')}</div>`, { html: true });
          },
        })
        .on("#contact .contact-card", {
          element(el) {
            el.setAttribute("id", "inscriere");
            el.setInnerContent(contactCardInner(), { html: true });
          },
        });
    }
    if (course) {
      rw = rw.on("main", {
        element(el) {
          el.append(leadBox(course, "h2"), { html: true });
        },
      });
    }
    if (hasForm) {
      rw = rw.on("body", {
        element(el) {
          el.append('<script src="/lead.js" defer></script>', { html: true });
        },
      });
    }
    return rw.transform(res);
  },
};
