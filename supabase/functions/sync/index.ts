// Bunny Meadow — password-gated sync edge function.
//
// The browser only ever knows this function's URL. The Supabase service-role
// key stays here (auto-injected by the platform) and never reaches the client.
// The shared password is checked server-side against public.app_config, so a
// simple "one password you both know" is enforced for real — not just hidden
// in front-end code.
//
// Body: { password: string, op: "load" | "save", state?: object }
//   load -> { state }         (401 if the password is wrong)
//   save -> { ok: true }

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ROW_ID = "sister";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

// length-constant string compare
function safeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const enc = new TextEncoder();
  const ab = enc.encode(a), bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });

async function expectedPassword(): Promise<string> {
  const r = await rest("app_config?key=eq.shared_password&select=value");
  const rows = await r.json();
  return rows?.[0]?.value ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let body: { password?: string; op?: string; state?: unknown };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const expected = await expectedPassword();
  if (!expected || !safeEqual(body.password || "", expected)) {
    // Small delay to discourage rapid guessing.
    await new Promise((r) => setTimeout(r, 400));
    return json({ error: "unauthorized" }, 401);
  }

  if (body.op === "load") {
    const r = await rest(`tracker?id=eq.${ROW_ID}&select=state`);
    const rows = await r.json();
    return json({ state: rows?.[0]?.state ?? null });
  }

  if (body.op === "save") {
    const r = await rest(`tracker?on_conflict=id`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ id: ROW_ID, state: body.state ?? {}, updated_at: new Date().toISOString() }]),
    });
    if (!r.ok) return json({ error: "save failed", detail: await r.text() }, 500);
    return json({ ok: true });
  }

  return json({ error: "unknown op" }, 400);
});
