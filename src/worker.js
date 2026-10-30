import { lernApi, validSession } from "./lernraum-api.js";
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
const HOME_TITLE = "Cursuri de germană București și online | Deutschparadies";
const HOME_DESC = "Cursuri de limba germană live în București și online, pentru toată România. Grupe de max. 4 cursanți, niveluri A1–C1 și pregătire telc. Scrie-ne pe WhatsApp!";

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
const SESSION_TTL = 60 * 60 * 12;
function readCookie(request, name) {
  const c = request.headers.get("cookie") || "";
  const m = c.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : "";
}
async function currentAccess(request, env) {
  const stored = env.APPKV ? await env.APPKV.get("access", "json") : null;
  if (stored && stored.hash) return stored;
  const res = await env.ASSETS.fetch(new Request(new URL("/app/access.json", request.url)));
  return res.ok ? await res.json() : null;
}
// Lernraum: "Texte" button next to Buch / Dialoge (one Google Drive folder per level: [Buch, Dialoge, Texte]).
// Audio folders (Schritte CDs / Lektion audios) — streamed only through the app
const AUDIO_FOLDERS = ["1pOXRMIHwzjkRwfwkeafbbcinGd6q-K21", "1Yj1LbmQEwuerk3VXWDUzwxxJjyQ4UGeY", "1A0zjRQiQpCaz5ruHb0fxJapcrc9tDcIx", "1QeL0hIi_j5jflLFzj9Bv7NfUF_S26E_u", "1W56h6LbvsrYqiu8d024G48hpQ1r0f0Uz", "1m815cDxRdOMLKxvtUAG3o7LcBW0TuuzQ", "1K8q-YJEnyJez5S0yFsPv1M2gPijgWnKK", "1luf59C_6kvPoI84a7gnAF3GkFgog_tAj", "1UCZx9EuekwTGuvZ1himfmG86wZB_sS4N", "1Kia0dpCL5OE5C9-A9vw5sRVDOm0v2ZBl", "1OCwJ-g99ik_CH-HYkhc8HE4d-NU0sacZ", "1_uAV8ymsBQ41iJSsbmELo00M5Ypn24vL", "1XCn8Z0P9G9rX6HCeqEQRNnoi8-9q2koR", "1_dVRmupt85OAAb-E2E95Ko2f90lAXd57", "1c1D3viSk-f_j2QxlgsV88mhH7f-CLOto", "17S96FSEMoG8vMZv3ayMwsVhVUA6NU_Mh", "17VVNfr2J0mRw9ppTt6c31gwUwxjfX4Ps"];
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
const TEXTE_SCRIPT = `<style>.mats{display:grid;grid-template-columns:1fr 1fr;gap:8px}.mat{display:flex;flex-direction:column;gap:2px;text-decoration:none;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:var(--r,14px);padding:14px}.mat b{font-family:var(--display);font-size:1.05rem}.mat b::after{content:" \\2197";color:var(--gold)}.mat small{color:var(--muted)}</style>`;

async function appRoute(request, env, path) {
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
  if (path.startsWith("/app/api/") && path !== "/app/api/videos" && path !== "/app/api/password") {
    const r = await lernApi(request, env, path, { pbkdf2Hex, sha256Hex, currentAccess, currentAdmin, folders: Object.assign({ _audio: AUDIO_FOLDERS }, LERN_FOLDERS) });
    if (r) return r;
  }
  if (path === "/app/access.json") {
    const acc = await currentAccess(request, env);
    return acc ? json(acc) : json({ error: "missing" }, 500);
  }
  if (path === "/app/api/videos") {
    const cur = (env.APPKV ? await env.APPKV.get("videos", "json") : null) || {};
    if (request.method === "GET") return json(cur);
    if (request.method !== "POST") return json({ error: "method" }, 405);
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: "bad" }, 400); }
    if (!body || typeof body.admin !== "string" || body.admin.length > 200) return json({ error: "bad" }, 400);
    const adm = await currentAdmin(env);
    if ((await pbkdf2Hex(body.admin, adm.salt, adm.it)) !== adm.hash) return json({ error: "wrong" }, 403);
    if (!Object.prototype.hasOwnProperty.call(LERN_FOLDERS, body.lv)) return json({ error: "bad" }, 400);
    const list = Array.isArray(cur[body.lv]) ? cur[body.lv] : [];
    if (body.add && typeof body.add === "object") {
      const t = String(body.add.t || "").trim().slice(0, 120);
      const u = String(body.add.u || "").trim();
      if (!t) return json({ error: "title" }, 400);
      let ok = false;
      try { ok = new URL(u).protocol === "https:"; } catch (e) {}
      if (!ok || u.length > 500 || /[\s"<>]/.test(u)) return json({ error: "url" }, 400);
      if (list.length >= 100) return json({ error: "full" }, 400);
      list.push({ t, u });
    } else if (body.del && typeof body.del === "object") {
      const i = body.del.i;
      if (!Number.isInteger(i) || !list[i] || list[i].u !== body.del.u) return json({ error: "bad" }, 400);
      list.splice(i, 1);
    } else return json({ error: "bad" }, 400);
    cur[body.lv] = list;
    await env.APPKV.put("videos", JSON.stringify(cur));
    return json({ videos: cur });
  }
  if (path.startsWith("/app/dialoge/")) {
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("method", { status: 405 });
    const ok = await validSession(request, env);
    if (!ok) return new Response("locked", { status: 401, headers: { "cache-control": "no-store" } });
    const file = await env.ASSETS.fetch(request);
    if (!file.ok) return new Response("not found", { status: 404, headers: { "cache-control": "no-store" } });
    return new Response(file.body, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "cache-control": "private, no-store",
        "content-disposition": "inline",
        "x-content-type-options": "nosniff",
        "x-robots-tag": "noindex",
      },
    });
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
    const url = new URL(request.url);
    const path = url.pathname;
    // www -> main domain (one canonical host)
    if (url.hostname === "www.deutschparadies.ro") {
      return Response.redirect("https://deutschparadies.ro" + path + url.search, 301);
    }
    // Old URLs still indexed by Google -> current pages
    const OLD = {
      "/curs-germana-a1": "/cursuri/a1-1",
      "/curs-germana-a1/": "/cursuri/a1-1",
      "/despre-noi": "/",
      "/despre-noi/": "/",
    };
    if (OLD[path]) return Response.redirect("https://deutschparadies.ro" + OLD[path], 301);
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
