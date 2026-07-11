/*
  Bunny Meadow - Strava connector (Cloudflare Worker)
  ---------------------------------------------------
  This tiny backend is the ONLY place the Strava client secret lives.
  It lets the app do a normal "Connect Strava" tap: the user authorizes on
  Strava, the Worker swaps the one-time code for tokens, stores them in KV,
  and hands the app a random link id it can use to pull runs later.

  Bindings it expects (see wrangler.toml + the deploy steps in README.md):
    - STRAVA_TOKENS      KV namespace (stores each athlete's tokens)
    - STRAVA_CLIENT_ID   secret (wrangler secret put STRAVA_CLIENT_ID)
    - STRAVA_CLIENT_SECRET secret (wrangler secret put STRAVA_CLIENT_SECRET)
    - APP_ORIGIN         optional var: the site allowed to receive the redirect,
                         e.g. https://baaurora.github.io

  Routes:
    GET /login?return=<appUrl>   -> bounce to Strava's consent screen
    GET /callback?code&state     -> exchange code, store tokens, return to app
    GET /activities?link=<id>&after=<unix>  -> recent activities as JSON (CORS)
    GET /disconnect?link=<id>    -> forget tokens + deauthorize
*/

const STRAVA_AUTH = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN = "https://www.strava.com/oauth/token";
const STRAVA_API = "https://www.strava.com/api/v3";

// hosts we are willing to redirect back to (prevents open-redirect abuse)
const ALLOWED_HOSTS = ["localhost", "127.0.0.1"];

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}
function json(data, origin, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, cors(origin)),
  });
}
function b64urlEncode(s) {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(escape(atob(s)));
}
function returnAllowed(urlStr, env) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return false;
    const allow = ALLOWED_HOSTS.slice();
    if (env.APP_ORIGIN) { try { allow.push(new URL(env.APP_ORIGIN).hostname); } catch (_) {} }
    return allow.includes(u.hostname) || u.hostname.endsWith("github.io");
  } catch (_) { return false; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "*";
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(origin) });

    // 1) Start the OAuth dance: send the user to Strava's consent screen.
    if (url.pathname === "/login") {
      const ret = url.searchParams.get("return") || env.APP_ORIGIN || "";
      if (!returnAllowed(ret, env)) return new Response("Return URL not allowed.", { status: 400 });
      const auth = new URL(STRAVA_AUTH);
      auth.searchParams.set("client_id", env.STRAVA_CLIENT_ID);
      auth.searchParams.set("redirect_uri", url.origin + "/callback");
      auth.searchParams.set("response_type", "code");
      auth.searchParams.set("approval_prompt", "auto");
      auth.searchParams.set("scope", "activity:read_all");
      auth.searchParams.set("state", b64urlEncode(ret));
      return Response.redirect(auth.toString(), 302);
    }

    // 2) Strava sends the user back here with a one-time code.
    if (url.pathname === "/callback") {
      let ret = env.APP_ORIGIN || "";
      try { ret = b64urlDecode(url.searchParams.get("state") || ""); } catch (_) {}
      if (!returnAllowed(ret, env)) ret = env.APP_ORIGIN || "";
      const err = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      if (err || !code) return Response.redirect(ret + (ret.includes("?") ? "&" : "?") + "strava_error=1", 302);
      try {
        const tok = await exchange(env, { grant_type: "authorization_code", code });
        const linkId = crypto.randomUUID();
        await env.STRAVA_TOKENS.put("link:" + linkId, JSON.stringify({
          access_token: tok.access_token,
          refresh_token: tok.refresh_token,
          expires_at: tok.expires_at,
          athlete_id: tok.athlete && tok.athlete.id,
          firstname: (tok.athlete && tok.athlete.firstname) || "",
        }));
        const first = encodeURIComponent((tok.athlete && tok.athlete.firstname) || "");
        return Response.redirect(ret + (ret.includes("?") ? "&" : "?") + "strava=" + linkId + "&athlete=" + first, 302);
      } catch (e) {
        return Response.redirect(ret + (ret.includes("?") ? "&" : "?") + "strava_error=1", 302);
      }
    }

    // 3) The app asks for recent activities. Refresh the token if it expired.
    if (url.pathname === "/activities") {
      const linkId = url.searchParams.get("link");
      const after = url.searchParams.get("after");
      if (!linkId) return json({ error: "missing link" }, origin, 400);
      const rec = await getTokens(env, linkId);
      if (!rec) return json({ error: "not linked" }, origin, 404);
      const q = new URL(STRAVA_API + "/athlete/activities");
      q.searchParams.set("per_page", "100");
      if (after) q.searchParams.set("after", after);
      const res = await fetch(q.toString(), { headers: { Authorization: "Bearer " + rec.access_token } });
      if (!res.ok) return json({ error: "strava " + res.status }, origin, 502);
      const acts = await res.json();
      const slim = (acts || []).map((a) => ({
        id: a.id, name: a.name, type: a.sport_type || a.type,
        distance: a.distance, moving_time: a.moving_time, elapsed_time: a.elapsed_time,
        start_date_local: a.start_date_local,
      }));
      return json({ athlete: rec.firstname, activities: slim }, origin);
    }

    // 4) Forget this link + tell Strava to revoke it.
    if (url.pathname === "/disconnect") {
      const linkId = url.searchParams.get("link");
      if (linkId) {
        const rec = await getTokens(env, linkId).catch(() => null);
        if (rec) {
          try { await fetch("https://www.strava.com/oauth/deauthorize", { method: "POST", headers: { Authorization: "Bearer " + rec.access_token } }); } catch (_) {}
        }
        await env.STRAVA_TOKENS.delete("link:" + linkId);
      }
      return json({ ok: true }, origin);
    }

    return new Response("Bunny Meadow Strava connector", { status: 200, headers: cors(origin) });
  },
};

// POST to Strava's token endpoint (used for both the first exchange and refreshes).
async function exchange(env, extra) {
  const body = new URLSearchParams(Object.assign({
    client_id: env.STRAVA_CLIENT_ID,
    client_secret: env.STRAVA_CLIENT_SECRET,
  }, extra));
  const res = await fetch(STRAVA_TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!res.ok) throw new Error("token " + res.status);
  return res.json();
}

// Load a link's tokens, refreshing (and re-saving) them if they are within 60s of expiry.
async function getTokens(env, linkId) {
  const raw = await env.STRAVA_TOKENS.get("link:" + linkId);
  if (!raw) return null;
  const rec = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  if (rec.expires_at && rec.expires_at - 60 <= now) {
    const tok = await exchange(env, { grant_type: "refresh_token", refresh_token: rec.refresh_token });
    rec.access_token = tok.access_token;
    rec.refresh_token = tok.refresh_token || rec.refresh_token;
    rec.expires_at = tok.expires_at;
    await env.STRAVA_TOKENS.put("link:" + linkId, JSON.stringify(rec));
  }
  return rec;
}
