// Lernraum API: shared-password sessions, homework, results, teacher console,
// and a protected Google Drive proxy (Buch / Dialoge / Texte are shown inside the app only).
// Storage: Cloudflare KV (env.APPKV).
//   settings            -> { quiz: { [level]: {lesson, at} } }
//   sess:<tok>          -> {k:"l"} | "1" (shared course password)
//   tsess:<tok>         -> "1" (teacher session)
//   hw:<id>             -> homework item (name typed by the student)
//   res:all             -> [results with name]
//   fail:<ip>           -> failed login counter (15 min)
//   drv:<folderId>      -> cached folder listing (10 min)

const SESSION_TTL = 60 * 60 * 24 * 30; // students stay logged in for 30 days
const TEACHER_TTL = 60 * 60 * 12;

function hex(bytes) { return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(""); }
function rand(n) { return hex(crypto.getRandomValues(new Uint8Array(n))); }
function readCookie(request, name) {
  const c = request.headers.get("cookie") || "";
  const m = c.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : "";
}
function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status, headers: Object.assign({ "content-type": "application/json", "cache-control": "no-store" }, extra),
  });
}
function cookie(name, val, maxAge) {
  return `${name}=${val}; Max-Age=${maxAge}; Path=/app; HttpOnly; Secure; SameSite=Strict`;
}
async function body(request) { try { return await request.json(); } catch (e) { return null; } }
const LEVELS = ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2", "B2.1", "B2.2"];
const HWID = /^[a-z0-9]{6,12}-[a-f0-9]{8}$/;
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function getSettings(env) { return (await env.APPKV.get("settings", "json")) || {}; }

// ---- sessions ----
export async function sessionOf(request, env) {
  const tok = readCookie(request, "dp_s");
  if (!/^[a-f0-9]{64}$/.test(tok) || !env.APPKV) return null;
  const v = await env.APPKV.get("sess:" + tok);
  if (!v) return null;
  if (v === "1") return { k: "l", tok };
  try { const o = JSON.parse(v); o.tok = tok; return o; } catch (e) { return null; }
}
export async function validSession(request, env) {
  const s = await sessionOf(request, env);
  return s && (s.k === "l" || s.k === "s") ? s : null;
}
async function newSession(env, val) {
  const tok = rand(32);
  await env.APPKV.put("sess:" + tok, JSON.stringify(val), { expirationTtl: SESSION_TTL });
  return tok;
}
async function teacherOk(request, env) {
  const tok = readCookie(request, "dp_t");
  return /^[a-f0-9]{64}$/.test(tok) && (await env.APPKV.get("tsess:" + tok)) === "1";
}
async function tooManyFails(request, env) {
  const ip = request.headers.get("cf-connecting-ip") || "x";
  const n = +((await env.APPKV.get("fail:" + ip)) || 0);
  return n >= 10;
}
async function addFail(request, env) {
  const ip = request.headers.get("cf-connecting-ip") || "x";
  const n = +((await env.APPKV.get("fail:" + ip)) || 0);
  await env.APPKV.put("fail:" + ip, String(n + 1), { expirationTtl: 900 });
}

// ---- Google Drive proxy (public folders, listed through the embedded folder view) ----
function allowedRoots(folders) { const s = new Set(); Object.values(folders).forEach((a) => a.forEach((id) => s.add(id))); return s; }
function decodeHtml(s) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)));
}
export function parseFolderHtml(html) {
  const out = [];
  const re = /<div class="flip-entry" id="entry-([\w-]+)"[\s\S]*?<a href="([^"]+)"[\s\S]*?<div class="flip-entry-title">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = re.exec(html))) {
    const href = decodeHtml(m[2]);
    const isFolder = /\/folders\//.test(href);
    out.push({ id: m[1], name: decodeHtml(m[3]).trim(), folder: isFolder });
  }
  return out;
}
async function listFolder(env, id) {
  const cached = await env.APPKV.get("drv:" + id, "json");
  if (cached) return cached;
  const r = await fetch("https://drive.google.com/embeddedfolderview?id=" + encodeURIComponent(id) + "#list", {
    headers: { "user-agent": "Mozilla/5.0 (compatible; DeutschparadiesLernraum/1.0)" },
  });
  if (!r.ok) throw new Error("drive " + r.status);
  const items = parseFolderHtml(await r.text());
  await env.APPKV.put("drv:" + id, JSON.stringify(items), { expirationTtl: 600 });
  // remember sub folders as allowed
  for (const it of items) if (it.folder) await env.APPKV.put("drvok:" + it.id, "1", { expirationTtl: 86400 * 30 });
  return items;
}
async function folderAllowed(env, id, folders) {
  if (allowedRoots(folders).has(id)) return true;
  return (await env.APPKV.get("drvok:" + id)) === "1";
}

// ---- main handler: returns a Response, or null when the path is not handled here ----
export async function lernApi(request, env, path, deps) {
  if (!path.startsWith("/app/api/")) return null;
  const p = path.slice("/app/api/".length);
  const M = request.method;
  if (!env.APPKV) return json({ error: "missing" }, 500);

  // ---------- login with the shared course password (unchanged) ----------
  if (p === "login" || p === "session") {
    if (M !== "POST") return json({ error: "method" }, 405);
    if (await tooManyFails(request, env)) return json({ error: "wait" }, 429);
    const b = await body(request);
    const pw = b && typeof b.pw === "string" ? b.pw : "";
    if (!pw || pw.length > 200) return json({ error: "bad" }, 400);
    const acc = await deps.currentAccess(request, env);
    if (!acc || (await deps.sha256Hex(acc.salt + pw)) !== acc.hash) { await addFail(request, env); return json({ error: "wrong" }, 403); }
    const tok = await newSession(env, { k: "l" });
    return json({ ok: true }, 200, { "set-cookie": cookie("dp_s", tok, SESSION_TTL) });
  }
  if (p === "logout") {
    const s = await sessionOf(request, env);
    if (s) await env.APPKV.delete("sess:" + s.tok);
    return json({ ok: true }, 200, { "set-cookie": cookie("dp_s", "x", 0) });
  }
  if (p === "me") {
    return (await validSession(request, env)) ? json({ ok: true }) : json({ error: "login" }, 401);
  }

  // ---------- teacher login ----------
  if (p === "t/login") {
    if (M !== "POST") return json({ error: "method" }, 405);
    if (await tooManyFails(request, env)) return json({ error: "wait" }, 429);
    const b = await body(request);
    if (!b || typeof b.admin !== "string" || b.admin.length > 200) return json({ error: "bad" }, 400);
    const adm = await deps.currentAdmin(env);
    if ((await deps.pbkdf2Hex(b.admin, adm.salt, adm.it)) !== adm.hash) { await addFail(request, env); return json({ error: "wrong" }, 403); }
    const tok = rand(32);
    await env.APPKV.put("tsess:" + tok, "1", { expirationTtl: TEACHER_TTL });
    return json({ ok: true }, 200, { "set-cookie": cookie("dp_t", tok, TEACHER_TTL) });
  }
  if (p === "t/logout") {
    const tok = readCookie(request, "dp_t");
    if (/^[a-f0-9]{64}$/.test(tok)) await env.APPKV.delete("tsess:" + tok);
    return json({ ok: true }, 200, { "set-cookie": cookie("dp_t", "x", 0) });
  }

  // ---------- teacher area ----------
  if (p.startsWith("t/")) {
    if (!(await teacherOk(request, env))) return json({ error: "teacher" }, 401);
    if (p === "t/quiz" && M === "POST") {
      const b = (await body(request)) || {};
      if (!LEVELS.includes(b.lv)) return json({ error: "bad" }, 400);
      const set = await getSettings(env);
      set.quiz = set.quiz || {};
      if (b.lesson === null) delete set.quiz[b.lv];
      else if (typeof b.lesson === "string" && b.lesson.length < 20) set.quiz[b.lv] = { lesson: b.lesson, at: Date.now() };
      await env.APPKV.put("settings", JSON.stringify(set));
      return json({ ok: true, quiz: set.quiz });
    }
    if (p === "t/hw" && M === "GET") {
      const keys = await listAll(env, "hw:", 300);
      const items = [];
      for (const k of keys) { const it = await env.APPKV.get(k, "json"); if (it) { const { img, tok, ...rest } = it; rest.hasImg = !!img; items.push(rest); } }
      items.sort((a, b) => b.ts - a.ts);
      return json({ items });
    }
    if (p === "t/hw" && M === "POST") {
      const b = (await body(request)) || {};
      if (typeof b.id !== "string" || !HWID.test(b.id)) return json({ error: "bad" }, 400);
      const it = await env.APPKV.get("hw:" + b.id, "json");
      if (!it) return json({ error: "notfound" }, 404);
      const crit = {};
      ["I", "II", "III"].forEach((c) => { if (b.fb && b.fb.crit && ["A", "B", "C", "D"].includes(b.fb.crit[c])) crit[c] = b.fb.crit[c]; });
      it.fb = { text: str(b.fb && b.fb.text, 8000), note: str(b.fb && b.fb.note, 3000), crit, ts: Date.now() };
      it.status = "korrigiert";
      await env.APPKV.put("hw:" + b.id, JSON.stringify(it));
      return json({ ok: true });
    }
    if (p === "t/hw" && M === "DELETE") {
      const id = new URL(request.url).searchParams.get("id") || "";
      if (!HWID.test(id)) return json({ error: "bad" }, 400);
      await env.APPKV.delete("hw:" + id);
      return json({ ok: true });
    }
    if (p === "t/hwimg" && M === "GET") {
      const id = new URL(request.url).searchParams.get("id") || "";
      if (!HWID.test(id)) return json({ error: "bad" }, 400);
      const it = await env.APPKV.get("hw:" + id, "json");
      return json({ img: (it && it.img) || null });
    }
    if (p === "t/results" && M === "GET") {
      return json({ results: (await env.APPKV.get("res:all", "json")) || [] });
    }
    if (p === "t/settings") return json({ settings: await getSettings(env) });
    return json({ error: "notfound" }, 404);
  }

  // ---------- everything below needs a logged-in student (or old shared password) ----------
  const s = await validSession(request, env);
  if (!s) return json({ error: "login" }, 401);

  if (p === "drive/list") {
    const f = new URL(request.url).searchParams.get("f") || "";
    if (!/^[\w-]{10,80}$/.test(f) || !(await folderAllowed(env, f, deps.folders))) return json({ error: "folder" }, 403);
    try { return json({ items: await listFolder(env, f) }); }
    catch (e) { return json({ error: "drive" }, 502); }
  }
  if (p === "drive/file") {
    const u = new URL(request.url);
    const f = u.searchParams.get("f") || "", id = u.searchParams.get("id") || "";
    if (!/^[\w-]{10,80}$/.test(f) || !/^[\w-]{10,80}$/.test(id) || !(await folderAllowed(env, f, deps.folders))) return new Response("folder", { status: 403 });
    let items;
    try { items = await listFolder(env, f); } catch (e) { return new Response("drive", { status: 502 }); }
    if (!items.some((x) => x.id === id && !x.folder)) return new Response("file", { status: 403 });
    const r = await fetch("https://drive.usercontent.google.com/download?id=" + encodeURIComponent(id) + "&export=download&confirm=t", {
      headers: { "user-agent": "Mozilla/5.0 (compatible; DeutschparadiesLernraum/1.0)" },
    });
    if (!r.ok) return new Response("drive", { status: 502 });
    return new Response(r.body, {
      status: 200,
      headers: { "content-type": r.headers.get("content-type") || "application/pdf", "cache-control": "private, no-store", "content-disposition": "inline", "x-content-type-options": "nosniff", "x-robots-tag": "noindex" },
    });
  }

  if (p === "quiz" && M === "GET") {
    return json({ quiz: (await getSettings(env)).quiz || {} });
  }
  if (p === "hw" && M === "GET") {
    // the device keeps "id.tok" pairs of its own submissions
    const mine = (new URL(request.url).searchParams.get("mine") || "").split(",").slice(0, 60);
    const items = [];
    for (const pair of mine) {
      const [id, tok] = pair.split(".");
      if (!HWID.test(id || "") || !/^[a-f0-9]{16}$/.test(tok || "")) continue;
      const it = await env.APPKV.get("hw:" + id, "json");
      if (it && it.tok === tok) { const { img, tok: t, ...rest } = it; rest.hasImg = !!img; items.push(rest); }
    }
    items.sort((a, b) => b.ts - a.ts);
    return json({ items });
  }
  if (p === "hw" && M === "POST") {
    const raw = await request.text();
    if (raw.length > 1500000) return json({ error: "big" }, 413);
    let b; try { b = JSON.parse(raw); } catch (e) { return json({ error: "bad" }, 400); }
    const name = str(b.name, 60), title = str(b.title, 120), text = str(b.text, 8000);
    const lv = LEVELS.includes(b.lv) ? b.lv : "";
    const img = typeof b.img === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.img) && b.img.length < 1400000 ? b.img : null;
    if (!name || !title || (!text && !img)) return json({ error: "empty" }, 400);
    const id = Date.now().toString(36) + "-" + rand(4), tok = rand(8);
    await env.APPKV.put("hw:" + id, JSON.stringify({ id, tok, name, lv, title, text, img, ts: Date.now(), status: "neu", fb: null }));
    return json({ ok: true, id, tok });
  }
  if (p === "hwimg" && M === "GET") {
    const u = new URL(request.url);
    const id = u.searchParams.get("id") || "", tok = u.searchParams.get("tok") || "";
    if (!HWID.test(id)) return json({ error: "bad" }, 400);
    const it = await env.APPKV.get("hw:" + id, "json");
    return json({ img: it && it.tok === tok ? it.img || null : null });
  }
  if (p === "result" && M === "POST") {
    const b = (await body(request)) || {};
    const type = ["quiz", "telc", "final", "rp"].includes(b.type) ? b.type : null;
    const name = str(b.name, 60);
    if (!type || !name) return json({ error: "bad" }, 400);
    const item = { type, name, ts: Date.now(), ref: str(b.ref, 40), score: +b.score || 0, total: +b.total || 0, pass: !!b.pass, info: str(b.info, 400) };
    const list = (await env.APPKV.get("res:all", "json")) || [];
    list.push(item);
    await env.APPKV.put("res:all", JSON.stringify(list.slice(-1500)));
    return json({ ok: true });
  }
  return json({ error: "notfound" }, 404);
}

async function listAll(env, prefix, max) {
  const keys = [];
  let cursor;
  do {
    const r = await env.APPKV.list({ prefix, cursor, limit: 1000 });
    r.keys.forEach((k) => keys.push(k.name));
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor && keys.length < 5000);
  return keys.slice(-max);
}
