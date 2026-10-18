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
async function currentAccess(request, env) {
  const stored = env.APPKV ? await env.APPKV.get("access", "json") : null;
  if (stored && stored.hash) return stored;
  const res = await env.ASSETS.fetch(new Request(new URL("/app/access.json", request.url)));
  return res.ok ? await res.json() : null;
}
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
    const acc = await currentAccess(request, env);
    if (!acc || !body || typeof body.current !== "string" || typeof body.next !== "string") return json({ error: "bad" }, 400);
    if ((await sha256Hex(acc.salt + body.current)) !== acc.hash) return json({ error: "wrong" }, 403);
    if (body.next.length < 6 || body.next.length > 100) return json({ error: "short" }, 400);
    const next = { v: (acc.v || 1) + 1, salt: acc.salt, hash: await sha256Hex(acc.salt + body.next) };
    await env.APPKV.put("access", JSON.stringify(next));
    return json(next);
  }
  const res = await env.ASSETS.fetch(request);
  const out = new Response(res.body, res);
  out.headers.set("x-robots-tag", "noindex");
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
