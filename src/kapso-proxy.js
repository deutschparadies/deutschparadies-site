// Private bridge: lets Claude (claude.ai custom connector) reach the Kapso WhatsApp MCP server.
// claude.ai cannot send Kapso's X-API-Key header, so this route adds it.
// The secret path below is the only protection — never share the full URL.
// This file lives in /src, which .assetsignore keeps out of the public site files.
const KAPSO_MCP_URL = "https://app.kapso.ai/mcp";
const KAPSO_API_KEY = "7c147870179d88773a50b1c15e43aa34e578891def12b7a5255131f26b693225";
export const KAPSO_PATH = "/wa-f0162b5661048c0a87454a3c101ca075";

const PASS_REQ = ["content-type", "accept", "mcp-session-id", "mcp-protocol-version", "last-event-id"];

export async function kapsoProxy(request) {
  const url = new URL(request.url);
  const headers = new Headers();
  for (const h of PASS_REQ) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("X-API-Key", KAPSO_API_KEY);
  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;
  const res = await fetch(KAPSO_MCP_URL + url.search, init);
  const out = new Headers();
  for (const [k, v] of res.headers) {
    const lk = k.toLowerCase();
    if (lk === "www-authenticate" || lk === "set-cookie") continue;
    out.set(k, v);
  }
  out.set("cache-control", "no-store");
  out.set("x-robots-tag", "noindex");
  return new Response(res.body, { status: res.status, headers: out });
}
