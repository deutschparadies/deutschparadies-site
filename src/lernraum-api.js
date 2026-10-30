// Lernraum API: student accounts, sessions, progress sync, homework, results, teacher console,
// and a protected Google Drive proxy (Buch / Dialoge / Texte are shown inside the app only).
// Storage: Cloudflare KV (env.APPKV).
//   students            -> { [id]: {id,name,user,lv,salt,it,hash,active,created,quiz} }
//   settings            -> { legacyOff: bool }
//   sess:<tok>          -> {k:"s",sid} | {k:"l"} | "1" (old shared-password session)
//   tsess:<tok>         -> "1" (teacher session)
//   prog:<sid>          -> {ts, S}
//   hw:<sid>:<id>       -> homework item
//   res:<sid>           -> [results]
//   fail:<ip>           -> failed login counter (15 min)
//   drv:<folderId>      -> cached folder listing (10 min)

const SESSION_TTL = 60 * 60 * 24 * 30; // students stay logged in for 30 days
const TEACHER_TTL = 60 * 60 * 12;
const IT = 20000;
const ALNUM = "abcdefghjkmnpqrstuvwxyz23456789";

function hex(bytes) { return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(""); }
function rand(n) { return hex(crypto.getRandomValues(new Uint8Array(n))); }
function randPw(len = 8) {
  const b = crypto.getRandomValues(new Uint8Array(len));
  return [...b].map((x) => ALNUM[x % ALNUM.length]).join("");
}
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
function slug(name) {
  return String(name).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 24) || "schueler";
}
const LEVELS = ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2", "B2.1", "B2.2"];
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function getStudents(env) { return (await env.APPKV.get("students", "json")) || {}; }
async function putStudents(env, s) { await env.APPKV.put("students", JSON.stringify(s)); }
async function getSettings(env) { return (await env.APPKV.get("settings", "json")) || {}; }
function pub(st) { return { id: st.id, name: st.name, user: st.user, lv: st.lv, active: st.active !== false, created: st.created, quiz: st.quiz || null }; }

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
  if (!s) return null;
  if (s.k === "l") {
    const set = await getSettings(env);
    if (set.legacyOff) return null;
    return s;
  }
  if (s.k === "s") {
    const st = (await getStudents(env))[s.sid];
    if (!st || st.active === false) return null;
    s.st = st;
    return s;
  }
  return null;
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

  // ---------- login (student account, or old shared password) ----------
  if (p === "login" || p === "session") {
    if (M !== "POST") return json({ error: "method" }, 405);
    if (await tooManyFails(request, env)) return json({ error: "wait" }, 429);
    const b = await body(request);
    const pw = b && typeof b.pw === "string" ? b.pw : "";
    const user = b && typeof b.user === "string" ? b.user.trim().toLowerCase() : "";
    if (!pw || pw.length > 200 || user.length > 60) return json({ error: "bad" }, 400);
    let val = null, me = null;
    if (user) {
      const all = await getStudents(env);
      const st = Object.values(all).find((s) => s.user === user);
      if (st && st.active !== false && (await deps.pbkdf2Hex(pw, st.salt, st.it || IT)) === st.hash) {
        val = { k: "s", sid: st.id }; me = { kind: "student", ...pub(st) };
      }
    } else {
      const set = await getSettings(env);
      if (set.legacyOff) return json({ error: "legacy_off" }, 403);
      const acc = await deps.currentAccess(request, env);
      if (acc && (await deps.sha256Hex(acc.salt + pw)) === acc.hash) { val = { k: "l" }; me = { kind: "legacy" }; }
    }
    if (!val) { await addFail(request, env); return json({ error: "wrong" }, 403); }
    const tok = await newSession(env, val);
    return json({ ok: true, me }, 200, { "set-cookie": cookie("dp_s", tok, SESSION_TTL) });
  }
  if (p === "logout") {
    const s = await sessionOf(request, env);
    if (s) await env.APPKV.delete("sess:" + s.tok);
    return json({ ok: true }, 200, { "set-cookie": cookie("dp_s", "x", 0) });
  }
  if (p === "me") {
    const s = await validSession(request, env);
    if (!s) return json({ error: "login" }, 401);
    if (s.k === "l") return json({ kind: "legacy" });
    return json({ kind: "student", ...pub(s.st) });
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
    const all = await getStudents(env);
    if (p === "t/students" && M === "GET") {
      return json({ students: Object.values(all).map(pub).sort((a, b) => a.name.localeCompare(b.name)) });
    }
    if (p === "t/students" && M === "POST") {
      const b = (await body(request)) || {};
      const a = b.action;
      if (a === "create") {
        const name = str(b.name, 60);
        const lv = LEVELS.includes(b.lv) ? b.lv : "A1.1";
        if (!name) return json({ error: "name" }, 400);
        if (Object.keys(all).length >= 500) return json({ error: "full" }, 400);
        let base = slug(name), user = base, i = 2;
        const used = new Set(Object.values(all).map((s) => s.user));
        while (used.has(user)) user = base + i++;
        const pw = randPw(8), salt = rand(16), id = rand(8);
        all[id] = { id, name, user, lv, salt, it: IT, hash: await deps.pbkdf2Hex(pw, salt, IT), active: true, created: Date.now(), quiz: null };
        await putStudents(env, all);
        return json({ ok: true, student: pub(all[id]), pw });
      }
      const st = all[b.id];
      if (!st) return json({ error: "notfound" }, 404);
      if (a === "reset") {
        const pw = randPw(8); st.salt = rand(16); st.it = IT; st.hash = await deps.pbkdf2Hex(pw, st.salt, IT);
        await putStudents(env, all);
        return json({ ok: true, student: pub(st), pw });
      }
      if (a === "update") {
        if (typeof b.name === "string" && b.name.trim()) st.name = str(b.name, 60);
        if (LEVELS.includes(b.lv)) st.lv = b.lv;
        if (typeof b.active === "boolean") st.active = b.active;
        if (b.quiz === null) st.quiz = null;
        else if (b.quiz && typeof b.quiz.lesson === "string" && b.quiz.lesson.length < 20) st.quiz = { lesson: b.quiz.lesson, at: Date.now() };
        await putStudents(env, all);
        return json({ ok: true, student: pub(st) });
      }
      if (a === "delete") {
        delete all[b.id];
        await putStudents(env, all);
        return json({ ok: true });
      }
      return json({ error: "action" }, 400);
    }
    if (p === "t/quiz" && M === "POST") {
      // assign the same pre-lesson quiz to several students at once
      const b = (await body(request)) || {};
      const ids = Array.isArray(b.ids) ? b.ids : [];
      const lesson = b.lesson === null ? null : str(b.lesson, 20);
      ids.forEach((id) => { if (all[id]) all[id].quiz = lesson ? { lesson, at: Date.now() } : null; });
      await putStudents(env, all);
      return json({ ok: true });
    }
    if (p === "t/hw" && M === "GET") {
      const u = new URL(request.url);
      const sid = u.searchParams.get("sid") || "";
      const prefix = "hw:" + (sid && /^[a-f0-9]{16}$/.test(sid) ? sid + ":" : "");
      const keys = await listAll(env, prefix, 300);
      const items = [];
      for (const k of keys) {
        const it = await env.APPKV.get(k, "json");
        if (it) { const { img, ...rest } = it; rest.hasImg = !!img; items.push(rest); }
      }
      items.sort((a, b) => b.ts - a.ts);
      return json({ items });
    }
    if (p === "t/hw" && M === "POST") {
      const b = (await body(request)) || {};
      if (typeof b.id !== "string" || !/^[a-f0-9]{16}:[a-z0-9]+$/.test(b.id)) return json({ error: "bad" }, 400);
      const key = "hw:" + b.id;
      const it = await env.APPKV.get(key, "json");
      if (!it) return json({ error: "notfound" }, 404);
      const crit = {};
      ["I", "II", "III"].forEach((c) => { if (b.fb && ["A", "B", "C", "D"].includes(b.fb.crit && b.fb.crit[c])) crit[c] = b.fb.crit[c]; });
      it.fb = { text: str(b.fb && b.fb.text, 8000), note: str(b.fb && b.fb.note, 3000), crit, ts: Date.now() };
      it.status = "korrigiert";
      await env.APPKV.put(key, JSON.stringify(it));
      return json({ ok: true });
    }
    if (p === "t/hwimg" && M === "GET") {
      const id = new URL(request.url).searchParams.get("id") || "";
      if (!/^[a-f0-9]{16}:[a-z0-9]+$/.test(id)) return json({ error: "bad" }, 400);
      const it = await env.APPKV.get("hw:" + id, "json");
      return json({ img: (it && it.img) || null });
    }
    if (p === "t/results" && M === "GET") {
      const out = {};
      for (const id of Object.keys(all)) out[id] = ((await env.APPKV.get("res:" + id, "json")) || []).slice(-60);
      return json({ results: out });
    }
    if (p === "t/progress" && M === "GET") {
      const sid = new URL(request.url).searchParams.get("sid") || "";
      const pr = all[sid] ? await env.APPKV.get("prog:" + sid, "json") : null;
      return json({ progress: pr });
    }
    if (p === "t/settings") {
      if (M === "POST") {
        const b = (await body(request)) || {};
        const set = await getSettings(env);
        if (typeof b.legacyOff === "boolean") set.legacyOff = b.legacyOff;
        await env.APPKV.put("settings", JSON.stringify(set));
        return json({ ok: true, settings: set });
      }
      return json({ settings: await getSettings(env) });
    }
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

  // student-only features
  if (s.k !== "s") return json({ error: "account" }, 403);
  const sid = s.st.id;

  if (p === "progress") {
    if (M === "GET") return json({ progress: await env.APPKV.get("prog:" + sid, "json") });
    if (M === "PUT" || M === "POST") {
      const raw = await request.text();
      if (raw.length > 400000) return json({ error: "big" }, 413);
      let b; try { b = JSON.parse(raw); } catch (e) { return json({ error: "bad" }, 400); }
      if (!b || typeof b.S !== "object") return json({ error: "bad" }, 400);
      await env.APPKV.put("prog:" + sid, JSON.stringify({ ts: Date.now(), S: b.S }));
      return json({ ok: true });
    }
  }
  if (p === "hw" && M === "GET") {
    const keys = await listAll(env, "hw:" + sid + ":", 60);
    const items = [];
    for (const k of keys) { const it = await env.APPKV.get(k, "json"); if (it) { const { img, ...rest } = it; rest.hasImg = !!img; items.push(rest); } }
    items.sort((a, b) => b.ts - a.ts);
    return json({ items });
  }
  if (p === "hw" && M === "POST") {
    const raw = await request.text();
    if (raw.length > 1500000) return json({ error: "big" }, 413);
    let b; try { b = JSON.parse(raw); } catch (e) { return json({ error: "bad" }, 400); }
    const title = str(b.title, 120), text = str(b.text, 8000);
    const img = typeof b.img === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.img) && b.img.length < 1400000 ? b.img : null;
    if (!title || (!text && !img)) return json({ error: "empty" }, 400);
    const existing = await listAll(env, "hw:" + sid + ":", 500);
    if (existing.length >= 200) return json({ error: "full" }, 400);
    const id = sid + ":" + Date.now().toString(36);
    await env.APPKV.put("hw:" + id, JSON.stringify({ id, sid, name: s.st.name, lv: s.st.lv, title, text, img, ts: Date.now(), status: "neu", fb: null }));
    return json({ ok: true, id });
  }
  if (p === "hwimg" && M === "GET") {
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!id.startsWith(sid + ":")) return json({ error: "bad" }, 403);
    const it = await env.APPKV.get("hw:" + id, "json");
    return json({ img: (it && it.img) || null });
  }
  if (p === "result" && M === "POST") {
    const b = (await body(request)) || {};
    const type = ["quiz", "telc", "final", "rp"].includes(b.type) ? b.type : null;
    if (!type) return json({ error: "bad" }, 400);
    const item = { type, ts: Date.now(), ref: str(b.ref, 40), score: +b.score || 0, total: +b.total || 0, pass: !!b.pass, info: str(b.info, 400) };
    const list = (await env.APPKV.get("res:" + sid, "json")) || [];
    list.push(item);
    await env.APPKV.put("res:" + sid, JSON.stringify(list.slice(-300)));
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
