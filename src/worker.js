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
// Lernraum: "Texte" button next to Buch / Dialoge (one Google Drive folder per level).
const TEXTE_FOLDERS = {
  "A1.1": "10xnUwxxPuT53aBxElVnuc4DBydMuvFMP",
  "A1.2": "1tXhSxNYwMvz7gI7_3fADMcNGgMAk3I6n",
  "A2.1": "1kT6SzGBtEGLMVk22tN0KGF5Z3q77rEfM",
  "A2.2": "1Z1rlPlbCJF6nlC5piiuT_udDE7YyQMJO",
  "B1.1": "1hIv7XhuSw_HzVkihFMEe-7Q0kPtE-c3o",
  "B1.2": "1dXBGJ1mtdD-GfUTg2Eoj_434irrX00aL",
  "B2.1": "141ZxEOG4lENrlVj8OrxKn4ueP7S82DN1",
  "B2.2": "11WEGl8CE15Z-y754cgue9ewiJxAQekaU",
};
const TEXTE_SCRIPT = `<script>(function(){var F=${JSON.stringify(TEXTE_FOLDERS)};
function add(){document.querySelectorAll(".mats").forEach(function(m){if(m.querySelector(".mat-texte"))return;var s=m.querySelector(".mat small");if(!s)return;var k=(s.textContent.match(/zum\\s+(\\S+)/)||[])[1];if(!k||!F[k])return;var a=document.createElement("a");a.className="mat mat-texte";a.href="https://drive.google.com/drive/folders/"+F[k];a.target="_blank";a.rel="noopener";a.innerHTML="<b>Texte</b><small>Lesetexte zum "+k+"</small>";m.appendChild(a);});}
function go(){var r=document.getElementById("app")||document.body;add();new MutationObserver(add).observe(r,{childList:true,subtree:true});}
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
    return new HTMLRewriter().on("body", {
      element(el) { el.append(TEXTE_SCRIPT, { html: true }); },
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
