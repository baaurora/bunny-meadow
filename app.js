/* Bunny Meadow — app logic: state, sync, gamification, screens.
   Plain vanilla JS, no build step. Depends on config.js, data.js, bunnies.js. */
(function () {
  "use strict";
  const PLAN = window.PLAN;
  const B = window.BUNNIES;
  const CFG = window.CONFIG;

  // ---------- tiny helpers ----------
  const $ = (s, r) => (r || document).querySelector(s);
  const view = $("#view");
  // lettuce = the in-app currency (earned by logging; spent to feed bunnies or buy toys/accessories)
  const cloverIco = '<svg viewBox="0 0 24 24" width="15" height="15" style="vertical-align:-3px"><path d="M12 22c-5.5-1.2-9-5.4-9-10 0-1.4 1.4-2.2 2.6-1.4.1-2.3 2.4-3.4 3.9-2.2C10.2 4.3 13.8 4.3 15 6.6c1.5-1.2 3.8-.1 3.9 2.2C20.1 8 21.5 8.8 21.5 10.2c0 4.4-3.4 8.6-9.5 11.8z" fill="#8fce5a" stroke="#5a9a34" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 21c0-5 .3-8 1.2-11M12 21c0-4-.6-6-2-8.4" fill="none" stroke="#5a9a34" stroke-width="1.1" stroke-linecap="round"/></svg>';
  const closeIco = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const gearIco = '<svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align:-2px" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M22 12h-3M5 12H2M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M18.4 18.4l-2.1-2.1M7.7 7.7L5.6 5.6"/></svg>';
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const dayIndex = Object.fromEntries(PLAN.days.map((d, i) => [d.date, i]));
  const dayByISO = (iso) => PLAN.days[dayIndex[iso]];
  const START = PLAN.days[0].date;
  const RACE = PLAN.days[PLAN.days.length - 1].date;

  function localTodayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  // Real "today" clamped into the plan window; falls back to start before the plan begins.
  function planToday() {
    const t = localTodayISO();
    if (t < START) return START;
    if (t > RACE) return RACE;
    return dayIndex[t] != null ? t : START;
  }
  function fmtDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  }
  const RUN_TYPES = ["Long Run", "Workout", "Easy Run", "Race"];
  const MOODS = [
    { e: "😄", label: "Great" }, { e: "🙂", label: "Good" }, { e: "😐", label: "Okay" },
    { e: "😴", label: "Tired" }, { e: "😞", label: "Low" },
  ];

  // ---------- state ----------
  const LS_STATE = "bunnymeadow.state.v1";
  const LS_PW = "bunnymeadow.pw";
  let PW = null;
  let awardQueue = [];
  let viewISO = planToday();
  let route = "today";
  let viewMeal = null; // meal name when viewing a meal detail page
  let toastTimer = null;

  // Which bottom-nav tab lights up for a given route (sub-pages map to a parent).
  const NAV_FOR = { today: "today", plan: "plan", food: "food", meal: "food", meadow: "meadow", dex: "dex" };
  let planTab = "workouts"; // Plan page slide-bar: workouts | trends | marathon

  function go(r, opts) {
    if (r === "meadow" && route !== "meadow") meadowSeed = (meadowSeed + 1) % 997;
    route = r;
    if (opts && opts.meal) viewMeal = opts.meal;
    renderNav();
    render();
    window.scrollTo(0, 0);
  }

  function freshState() {
    return {
      version: 2, updatedAt: 0, days: {}, collection: {},
      clovers: 0, streak: { current: 0, best: 0 },
      milestones: { longestLongRun: 0, phases: {} },
      accessories: [], // unlocked accessory ids
      toys: [],        // owned toy ids
      mode: "easy",    // "easy" | "hard"
      workouts: {},    // iso -> [{type, minutes, kcal}]
      strava: null,    // connection placeholder (null until wired up)
    };
  }
  function migrate(s) {
    const f = freshState();
    return Object.assign(f, s, {
      streak: Object.assign(f.streak, s.streak || {}),
      milestones: Object.assign(f.milestones, s.milestones || {}),
      days: s.days || {}, collection: s.collection || {},
      accessories: s.accessories || [], toys: s.toys || [],
      mode: s.mode || "easy", workouts: s.workouts || {}, strava: s.strava || null,
    });
  }
  function equipped(id) { return (S.collection[id] && S.collection[id].room && S.collection[id].room.accessory) || null; }
  function ownsAcc(accId) { return S.accessories.indexOf(accId) !== -1; }
  function ownsToy(id) { return S.toys.indexOf(id) !== -1; }

  // ---------- feeding / hunger (Hard mode) ----------
  const FEED_COST = 3;              // lettuce to feed one bunny
  const HUNGRY_DAYS = 7;            // content for the first week after feeding
  const WANDER_DAYS = 14;          // unfed this long -> wanders off (Hard mode only)
  function daysBetween(a, b) { return Math.round((isoToNum(b) - isoToNum(a))); }
  // days since a bunny last ate (falls back to when you first met it)
  function daysHungry(id) {
    const c = S.collection[id]; if (!c) return 0;
    const since = c.lastFed || c.first;
    return Math.max(0, daysBetween(since, planToday()));
  }
  function hungerState(id) {
    if (S.mode !== "hard") return "content";
    const d = daysHungry(id);
    if (d < HUNGRY_DAYS) return "content";
    if (d < WANDER_DAYS) return "hungry";
    return "wandered";
  }
  function activeBunnies() {
    // in Hard mode, bunnies that wandered off are not in the meadow
    return Object.keys(S.collection).filter((id) => B.byId[id] && hungerState(id) !== "wandered");
  }
  function feed(id) {
    const c = S.collection[id]; if (!c) return false;
    if (S.clovers < FEED_COST) return false;
    S.clovers -= FEED_COST;
    c.lastFed = planToday();
    touch();
    return true;
  }
  function feedAll() {
    const hungry = Object.keys(S.collection).filter((id) => B.byId[id] && hungerState(id) !== "content");
    let fed = 0;
    for (const id of hungry) { if (S.clovers < FEED_COST) break; feed(id); fed++; }
    if (fed) toast("Fed " + fed + " " + (fed === 1 ? "bunny" : "bunnies") + " 🥬");
    else toast("Not enough lettuce yet");
    render();
  }
  let S = (() => {
    try { const j = JSON.parse(localStorage.getItem(LS_STATE)); return j ? migrate(j) : freshState(); }
    catch (e) { return freshState(); }
  })();

  function dayState(iso) {
    if (!S.days[iso]) S.days[iso] = { checks: {}, granted: {}, flags: {}, log: {} };
    const d = S.days[iso];
    d.checks = d.checks || {}; d.granted = d.granted || {}; d.flags = d.flags || {}; d.log = d.log || {};
    return d;
  }
  function saveLocal() { try { localStorage.setItem(LS_STATE, JSON.stringify(S)); } catch (e) {} }
  function touch() { S.updatedAt = Date.now(); saveLocal(); scheduleSync(); }

  // ---------- sync ----------
  let syncTimer = null, syncOk = null;
  function setSync(ok) { syncOk = ok; const el = $("#syncdot"); if (el) el.className = "sync-dot" + (ok ? " on" : ""); }
  function scheduleSync() { if (!CFG.FUNCTION_URL || !PW) return; clearTimeout(syncTimer); syncTimer = setTimeout(syncSave, 800); }
  async function syncSave() {
    if (!CFG.FUNCTION_URL || !PW) return;
    try {
      const r = await fetch(CFG.FUNCTION_URL, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: PW, op: "save", state: S }),
      });
      setSync(r.ok);
    } catch (e) { setSync(false); }
  }
  async function syncLoad(pw) {
    if (!CFG.FUNCTION_URL) return { ok: true, local: true };
    try {
      const r = await fetch(CFG.FUNCTION_URL, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: pw, op: "load" }),
      });
      if (r.status === 401) return { ok: false, auth: true };
      if (!r.ok) return { ok: false, net: true };
      const j = await r.json();
      return { ok: true, state: j.state };
    } catch (e) { return { ok: false, net: true }; }
  }

  // ---------- gamification ----------
  // Self-logged daily habits (not a prescribed plan). She checks off what she did.
  function itemsFor() {
    return [
      { key: "movement", emoji: "🏃", label: "Moved my body", sub: "Run, walk, strength, yoga - anything counts" },
      { key: "breakfast", emoji: "🍳", label: "Breakfast", sub: "Ate a good breakfast" },
      { key: "lunch", emoji: "🥗", label: "Lunch", sub: "Ate a nourishing lunch" },
      { key: "dinner", emoji: "🍽️", label: "Dinner", sub: "Ate a satisfying dinner" },
      { key: "snacks", emoji: "🍎", label: "Snacks", sub: "Snacks and treats" },
      { key: "water", emoji: "💧", label: "Hydration", sub: "Drank plenty of water" },
      { key: "log", emoji: "📓", label: "Daily check-in", sub: "Weight, BP, sleep, mood", optional: true },
    ];
  }
  function pickBunny(rarity, preferNew) {
    const pool = B.byRarity(rarity);
    const undisc = pool.filter((b) => !S.collection[b.id]);
    if (preferNew && undisc.length && Math.random() < 0.7)
      return undisc[Math.floor(Math.random() * undisc.length)];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function grant(bunny, iso) {
    const isNew = !S.collection[bunny.id];
    if (isNew) S.collection[bunny.id] = { first: iso, count: 0, lastFed: iso };
    S.collection[bunny.id].count++;
    S.collection[bunny.id].lastFed = iso; // a visit also tops them up
    awardQueue.push({ bunny, isNew });
  }
  function trailingStreak(iso) {
    let i = dayIndex[iso], n = 0;
    while (i >= 0 && S.days[PLAN.days[i].date] && S.days[PLAN.days[i].date].flags.full) { n++; i--; }
    return n;
  }
  function recomputeStreak() {
    let best = 0, cur = 0;
    for (const d of PLAN.days) {
      if (S.days[d.date] && S.days[d.date].flags.full) { cur++; best = Math.max(best, cur); } else cur = 0;
    }
    S.streak.best = Math.max(S.streak.best || 0, best);
    S.streak.current = trailingStreak(planToday());
  }

  function toggleCheck(iso, item) {
    const ds = dayState(iso);
    const now = !ds.checks[item.key];
    ds.checks[item.key] = now;
    if (now && !ds.granted[item.key]) {
      ds.granted[item.key] = true;
      S.clovers += 2;
      const tier = item.key === "log" ? "uncommon" : (Math.random() < 0.18 ? "uncommon" : "common");
      grant(pickBunny(tier, true), iso);
    }
    evaluateDay(iso);
    recomputeStreak();
    touch();
    render();
    flushAwards();
  }

  function evaluateDay(iso) {
    const ds = dayState(iso);
    const required = itemsFor().filter((i) => !i.optional);
    const allMeals = ["breakfast", "lunch", "dinner", "snacks"].every((k) => ds.checks[k]);
    const fullDay = required.every((i) => ds.checks[i.key]);

    if (allMeals && !ds.flags.meals) { ds.flags.meals = true; S.clovers += 5; grant(pickBunny("uncommon", true), iso); }
    if (fullDay && !ds.flags.full) {
      ds.flags.full = true; S.clovers += 15;
      grant(pickBunny("rare", true), iso);
      const st = trailingStreak(iso);
      if (st > 0 && st % 7 === 0 && !ds.flags.streak) {
        ds.flags.streak = true;
        // weekly streaks build toward the rarest bunnies
        grant(pickBunny(st % 28 === 0 ? "legendary" : "epic", true), iso);
      }
    }
  }

  // ---------- award modal ----------
  function flushAwards() {
    if (!awardQueue.length) { $("#modal-root").innerHTML = ""; return; }
    const { bunny, isNew } = awardQueue[0];
    const rar = B.RARITY[bunny.rarity];
    const more = awardQueue.length - 1;
    const msg = isNew
      ? "hopped into your meadow for the first time!"
      : "came back to say hi 🍀";
    $("#modal-root").innerHTML = `
      <div class="modal-scrim" id="award-scrim">
        <div class="award">
          <div class="spark">✧ ✦ ✧</div>
          <div class="art">${B.render(bunny, 150)}</div>
          ${isNew ? '<div class="newtag">NEW BUNNY</div>' : ""}
          <h2>${esc(bunny.breed)}</h2>
          <div class="rar" style="background:${rar.color}33;color:${shade(rar.color)}">${rar.label}</div>
          <p class="msg">A ${esc(bunny.breed)} bunny ${msg}</p>
          <button class="btn" id="award-ok">${more ? "Next 🐇" : "Yay! 🌸"}</button>
          ${more ? `<div class="queue">+${more} more waiting</div>` : ""}
        </div>
      </div>`;
    const close = () => { awardQueue.shift(); flushAwards(); };
    $("#award-ok").onclick = close;
    $("#award-scrim").onclick = (e) => { if (e.target.id === "award-scrim") close(); };
  }
  function shade(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgb(${(r * 0.55) | 0},${(g * 0.55) | 0},${(b * 0.55) | 0})`;
  }
  function toast(msg) {
    $("#toast-root").innerHTML = `<div class="toast">${esc(msg)}</div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($("#toast-root").innerHTML = ""), 1900);
  }

  // ---------- charts ----------
  function lineChart(opts) {
    const w = 320, h = opts.height || 130, pad = { l: 30, r: 10, t: 10, b: 18 };
    const xMin = opts.xMin, xMax = opts.xMax, yMin = opts.yMin, yMax = opts.yMax;
    const sx = (x) => pad.l + (xMax === xMin ? 0 : (x - xMin) / (xMax - xMin)) * (w - pad.l - pad.r);
    const sy = (y) => pad.t + (1 - (y - yMin) / (yMax - yMin || 1)) * (h - pad.t - pad.b);
    let out = `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">`;
    (opts.refLines || []).forEach((rl) => {
      const y = sy(rl.y);
      out += `<line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" stroke="${rl.color}" stroke-width="1.4" stroke-dasharray="4 4" opacity="0.7"/>`;
      out += `<text x="${w - pad.r}" y="${y - 3}" font-size="8" fill="${rl.color}" text-anchor="end">${esc(rl.label)}</text>`;
    });
    // y ticks
    [yMin, (yMin + yMax) / 2, yMax].forEach((yv) => {
      out += `<text x="4" y="${sy(yv) + 3}" font-size="8" fill="#b6acc0">${Math.round(yv)}</text>`;
    });
    (opts.series || []).forEach((s) => {
      if (!s.points.length) return;
      const pts = s.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ");
      out += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
      s.points.forEach((p) => { out += `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="2.6" fill="${s.color}"/>`; });
    });
    out += `</svg>`;
    return out;
  }
  const isoToNum = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };

  // ---------- screens ----------
  const SCREENS = {};

  SCREENS.today = function () {
    const ds = dayState(viewISO);
    const items = itemsFor();
    const required = items.filter((i) => !i.optional);
    const doneReq = required.filter((i) => ds.checks[i.key]).length;
    const pct = Math.round((doneReq / required.length) * 100);
    const idx = dayIndex[viewISO];
    const isToday = viewISO === planToday();
    const todaysBunnies = todaysAwardStrip(viewISO);
    const note = (ds.log && ds.log.movementNote) || "";

    // steady daily nutrition aims from her lab work (not tied to a training day)
    const aimMap = { "Protein target": "Protein", "Fiber target": "Fiber", "Sodium target": "Sodium", "Potassium target": "Potassium", "Saturated fat target": "Sat fat" };
    const aims = (PLAN.targetsInfo || []).filter((t) => aimMap[t.label]).map((t) => ({ k: aimMap[t.label], v: t.value }));

    return `
      <div class="hero">
        <div class="date">${isToday ? "Today · " : ""}${esc(fmtDate(viewISO))}</div>
        <div class="training">How did today go?</div>
        <div class="encourage">${esc(encourage(pct))}</div>
        <div class="daynav">
          <button ${idx === 0 ? "disabled style=opacity:.3" : ""} data-day="prev">‹</button>
          <button class="today-btn" data-day="today">Jump to today</button>
          <button ${idx === PLAN.days.length - 1 ? "disabled style=opacity:.3" : ""} data-day="next">›</button>
        </div>
      </div>

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
          <h2>Today's meadow list</h2>
          <span class="muted tiny">${doneReq}/${required.length} done</span>
        </div>
        <div class="progressbar"><span style="width:${pct}%"></span></div>
        <p class="tiny muted" style="margin:2px 0 12px">Check off what you actually did. A bunny hops in for every one.</p>
        <div class="checklist">
          ${items.map((it) => `
            <button class="check ${ds.checks[it.key] ? "done" : ""} ${it.optional ? "optional" : ""}" data-check="${it.key}">
              <span class="box">${ds.checks[it.key] ? "✓" : ""}</span>
              <span class="emoji">${it.emoji}</span>
              <span class="txt"><span class="label">${esc(it.label)}</span><span class="sub">${esc((it.key === "movement" && note) ? note : it.sub || "")}</span></span>
            </button>`).join("")}
        </div>
      </div>

      <div class="card">
        <h2>What did you do today?</h2>
        <p class="tiny muted" style="margin:2px 0 8px">Jot your workout or anything worth remembering. Optional.</p>
        <textarea id="activity-note" class="activity-note" rows="2" placeholder="e.g. 6 mile easy run, felt strong">${esc(note)}</textarea>
      </div>

      ${todaysBunnies}

      <div class="card">
        <h2>Daily nutrition aims</h2>
        <p class="tiny muted" style="margin:2px 0 8px">Gentle guardrails from your lab work, not rules. These stay the same every day.</p>
        <div class="macros">
          ${aims.map((a) => `<div class="macro"><div class="v" style="font-size:.82rem">${esc(a.v)}</div><div class="k">${esc(a.k)}</div></div>`).join("")}
        </div>
      </div>

      <button class="btn ghost" data-open-log="1" style="margin-bottom:8px">Log weight, BP and mood</button>
    `;
  };

  function encourage(pct) {
    if (pct >= 100) return "Every box checked. What a lovely day. 🌸";
    if (pct === 0) return "A fresh day. Log the first thing you did. 🐇";
    if (pct >= 60) return "So close. A couple more and the day is complete. 🌿";
    return "One check at a time. Little bunnies are waiting. 🐇";
  }
  function todaysAwardStrip(iso) {
    const ds = dayState(iso);
    const ids = Object.keys(S.collection).filter((id) => S.collection[id].first === iso);
    if (!ids.length && !Object.keys(ds.checks).some((k) => ds.checks[k])) return "";
    const shown = ids.slice(-8);
    return `
      <div class="card tint-lav">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <h2>New friends today</h2>
          <span class="muted tiny">${ids.length ? ids.length + " discovered" : "keep checking!"}</span>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;min-height:60px;align-items:center">
          ${shown.length ? shown.map((id) => `<div class="strip-bunny" data-bunny="${id}" style="width:58px" title="${esc(B.byId[id].breed)}">${B.render(B.byId[id], 58, { accessory: equipped(id) })}</div>`).join("")
            : '<span class="muted tiny">Check something off to meet a bunny</span>'}
        </div>
      </div>`;
  }

  // Deterministic scatter positions so bunnies sit "on the grass" without overlapping too much.
  // Vary each meadow bunny's pose (sitting / laying / asleep) - stable per render,
  // different across bunnies, and it reshuffles a bit each time the meadow opens.
  let meadowSeed = 0;
  function meadowPose(id, i) {
    const b = B.byId[id]; const n = (b && b.poses) || 1;
    let h = meadowSeed + i * 7;
    for (let k = 0; k < id.length; k++) h = (h * 31 + id.charCodeAt(k)) >>> 0;
    return h % n;
  }
  function meadowSpots(n) {
    const spots = [];
    const cols = 3;
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols);
      const inRow = i % cols;
      const jitterX = ((i * 37) % 11) - 5;
      const jitterY = ((i * 53) % 9) - 4;
      const left = 14 + inRow * 30 + (row % 2 ? 8 : 0) + jitterX;
      const bottom = 6 + row * 20 + jitterY;
      spots.push({ left, bottom, delay: ((i * 1.37) % 6).toFixed(2) });
    }
    return spots;
  }

  SCREENS.meadow = function () {
    const ids = activeBunnies().sort((a, b) => (S.collection[b].count) - (S.collection[a].count));
    const bunnies = ids.map((id) => B.byId[id]).filter(Boolean);
    const spots = meadowSpots(bunnies.length);
    const ownedToys = (S.toys || []).filter((t) => B.TOY_BY_ID[t]);
    const toySpots = [{ left: 8, bottom: 4 }, { left: 84, bottom: 8 }, { left: 46, bottom: 2 }, { left: 22, bottom: 22 }, { left: 70, bottom: 24 }, { left: 90, bottom: 40 }];
    const hungry = S.mode === "hard" ? ids.filter((id) => hungerState(id) === "hungry").length : 0;
    const canFeedAll = hungry > 0 && S.clovers >= FEED_COST;
    return `
      <div class="meadow-scene">
        <div class="meadow-hud">
          <button class="hud-count" data-settings="1">${B.CATALOG.filter((b)=>S.collection[b.id]).length}/${B.CATALOG.length} ${gearIco}</button>
          <button class="hud-shop" data-shop="1">${cloverIco} ${S.clovers} · Shop</button>
        </div>
        <div class="sky"><span class="cloud c1"></span><span class="cloud c2"></span><span class="sun"></span></div>
        <div class="hills"></div>
        <div class="grass-field">
          ${ownedToys.map((t, i) => { const s = toySpots[i % toySpots.length]; return `<div class="meadow-toy" style="left:${s.left}%;bottom:${s.bottom}%">${B.toySwatch(t, 56)}</div>`; }).join("")}
          ${bunnies.length ? bunnies.map((b, i) => `
            <div class="hopper" data-bunny="${b.id}" style="left:${spots[i].left}%;bottom:${spots[i].bottom}%;animation-delay:${spots[i].delay}s;z-index:${100 - Math.round(spots[i].bottom)}">
              <div class="bunny-shadow"></div>
              ${S.mode === "hard" && hungerState(b.id) === "hungry" ? '<div class="hungry-tag">hungry</div>' : ""}
              <div class="hop">${B.render(b, 76, { accessory: equipped(b.id), pose: meadowPose(b.id, i) })}</div>
            </div>`).join("")
            : `<div class="meadow-empty">Your meadow is quiet.<br/>Log your day and bunnies will hop in.</div>`}
          <span class="tuft t1"></span><span class="tuft t2"></span><span class="tuft t3"></span><span class="tuft t4"></span>
          <span class="flower f1"></span><span class="flower f2"></span><span class="flower f3"></span>
        </div>
        ${hungry ? `<button class="feed-all ${canFeedAll ? "" : "off"}" data-feedall="1">Feed ${hungry} hungry ${hungry === 1 ? "bunny" : "bunnies"} · ${cloverIco}${hungry * FEED_COST}</button>` : ""}
        <div class="meadow-tip">Tap a bunny to visit their room</div>
      </div>
    `;
  };

  SCREENS.dex = function () {
    const order = ["legendary", "epic", "rare", "uncommon", "common"];
    const sorted = [...B.CATALOG].sort((a, b) => order.indexOf(a.rarity) - order.indexOf(b.rarity));
    const owned = B.CATALOG.filter((b) => S.collection[b.id]).length;
    return `
      <div class="hero">
        <h1>Bunnydex</h1>
        <div class="muted">${owned} of ${B.CATALOG.length} breeds discovered</div>
        <div class="rarity-legend" style="justify-content:center">
          ${order.slice().reverse().map((r) => `<span style="background:${B.RARITY[r].color}55;color:${shade(B.RARITY[r].color)}">${B.RARITY[r].label}</span>`).join("")}
        </div>
      </div>
      <div class="dexgrid">
        ${sorted.map((b) => {
          const have = S.collection[b.id];
          const rar = B.RARITY[b.rarity];
          const wandered = have && hungerState(b.id) === "wandered";
          return `<div class="dexcell ${have ? "" : "locked"} ${wandered ? "wandered" : ""}" ${have ? `data-bunny="${b.id}"` : ""}>
            ${have && have.count > 1 ? `<span class="count">×${have.count}</span>` : ""}
            ${wandered ? '<span class="wandtag">wandered</span>' : ""}
            <div class="art">${B.render(b, 78, { accessory: have ? equipped(b.id) : null })}</div>
            <div class="nm">${have ? esc(b.breed) : "???"}</div>
            <div class="rar" style="background:${rar.color}44;color:${shade(rar.color)}">${rar.label}</div>
          </div>`;
        }).join("")}
      </div>
    `;
  };

  // ---- Trends (a Plan sub-tab) ----
  function trendsContent() {
    const logged = PLAN.days.map((d) => ({ iso: d.date, ...(S.days[d.date] && S.days[d.date].log || {}) }));
    const wpts = logged.filter((l) => l.weight).map((l) => ({ x: isoToNum(l.iso), y: +l.weight }));
    const curW = wpts.length ? wpts[wpts.length - 1].y : PLAN.meta.startWeightLb;
    const toGoal = (curW - PLAN.meta.goalWeightLb).toFixed(1);

    const todayIdx = dayIndex[planToday()];
    const elapsed = PLAN.days.slice(0, todayIdx + 1);
    const fullDays = elapsed.filter((d) => S.days[d.date] && S.days[d.date].flags.full).length;
    const completion = elapsed.length ? Math.round((fullDays / elapsed.length) * 100) : 0;
    const ownedCount = activeBunnies().length;

    // weekly minutes moved (from her own workout log)
    const weekMinutes = {};
    Object.keys(S.workouts || {}).forEach((iso) => {
      const wk = (dayByISO(iso) || {}).week; if (!wk) return;
      weekMinutes[wk] = (weekMinutes[wk] || 0) + (S.workouts[iso] || []).reduce((a, w) => a + (w.minutes || 0), 0);
    });
    const weeks = PLAN.rollup.map((wk) => ({ week: wk.week, phase: wk.phase, minutes: Math.round(weekMinutes[wk.week] || 0) }));
    const maxMin = Math.max(120, ...weeks.map((w) => w.minutes));

    const xMin = isoToNum(START), xMax = isoToNum(RACE);
    const weightChart = wpts.length
      ? lineChart({
          series: [{ points: wpts, color: "#c8b6ef" }],
          xMin, xMax,
          yMin: Math.min(PLAN.meta.goalWeightLb - 3, ...wpts.map((p) => p.y)),
          yMax: Math.max(PLAN.meta.startWeightLb + 2, ...wpts.map((p) => p.y)),
          refLines: [
            { y: PLAN.meta.goalWeightLb, label: "goal " + PLAN.meta.goalWeightLb, color: "#7cc6a2" },
            { y: PLAN.meta.startWeightLb, label: "start", color: "#f4b8c9" },
          ],
        })
      : `<p class="muted tiny center" style="padding:24px 0">Log your weight (Today - Daily check-in) to see the trend toward ${PLAN.meta.goalWeightLb} lb.</p>`;

    return `
      <div class="statgrid">
        <div class="stat"><div class="big">${curW}</div><div class="lbl">current weight (lb)</div></div>
        <div class="stat"><div class="big">${toGoal > 0 ? toGoal : 0}</div><div class="lbl">lb to goal (${PLAN.meta.goalWeightLb})</div></div>
        <div class="stat"><div class="big">${completion}%</div><div class="lbl">days fully logged</div></div>
        <div class="stat"><div class="big">${S.streak.current}</div><div class="lbl">day streak (best ${S.streak.best})</div></div>
      </div>
      <div class="card"><h2>Weight</h2>${weightChart}</div>
      <div class="card">
        <h2>Weekly movement</h2>
        <p class="tiny muted" style="margin:2px 0 8px">Minutes you logged as workouts each week.</p>
        ${weeks.filter((w) => w.minutes > 0).length ? weeks.map((wk) => `<div class="calweek">
            <span class="wk">Wk ${wk.week} · ${wk.phase}</span>
            <div class="progressbar" style="flex:1;margin:0"><span style="width:${clamp(Math.round(wk.minutes / maxMin * 100), 0, 100)}%"></span></div>
            <span class="tiny muted" style="flex:0 0 60px;text-align:right">${wk.minutes} min</span>
          </div>`).join("")
          : '<p class="muted tiny center" style="padding:16px 0">Record workouts on the Workouts tab to fill this in.</p>'}
      </div>
      <div class="card">
        <h2>Collection</h2>
        <div class="statgrid">
          <div class="stat"><div class="big">🐰 ${ownedCount}</div><div class="lbl">of ${B.CATALOG.length} bunnies</div></div>
          <div class="stat"><div class="big">${cloverIco} ${S.clovers}</div><div class="lbl">lettuce earned</div></div>
        </div>
      </div>
    `;
  }

  const chevron = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  const backArrow = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>';

  SCREENS.food = function () {
    const mealFilter = SCREENS.food._filter || "All";
    const q = (SCREENS.food._q || "").toLowerCase();
    const types = ["All", "Breakfast", "Lunch", "Dinner", "Snack", "Fuel"];
    const meals = PLAN.meals.filter((m) =>
      (mealFilter === "All" || m.type === mealFilter) &&
      (!q || m.name.toLowerCase().includes(q) || (m.why || "").toLowerCase().includes(q)));

    return `
      <div class="hero"><h1>Food</h1><div class="muted">Meal ideas from the coaching plan. Tap one for its recipe.</div></div>
      <input class="searchbar" id="meal-search" placeholder="Search meals..." value="${esc(SCREENS.food._q || "")}" />
      <div class="filterrow">${types.map((t) => `<button class="mfilter ${t === mealFilter ? "on" : ""}" data-mf="${t}">${t}</button>`).join("")}</div>
      <div class="meal-list">
        ${meals.map((m) => `
          <button class="meal-card" data-meal="${esc(m.name)}">
            <div class="meal-card-main">
              <div class="meal-card-top"><b>${esc(m.name)}</b><span class="typebadge type-${(m.type || "").toLowerCase()}">${esc(m.type)}</span></div>
              <div class="tiny muted">${m.cal} cal · ${m.protein}g protein · ${m.carbs}g carbs · ${m.fiber}g fiber</div>
              <div class="tiny meal-why">${esc(m.why || "")}</div>
            </div>
            <span class="meal-chev">${chevron}</span>
          </button>`).join("") || '<p class="muted tiny center" style="padding:20px">No meals match.</p>'}
      </div>
    `;
  };

  SCREENS.meal = function () {
    const m = PLAN.meals.find((x) => x.name === viewMeal);
    if (!m) return `<div class="hero"><h1>Meal</h1></div><button class="btn ghost" data-go="food">Back to Food</button>`;
    const r = (window.MEALS || {})[m.name];
    const nut = [
      ["cal", m.cal], ["protein", m.protein + "g"], ["carbs", m.carbs + "g"], ["fiber", m.fiber + "g"],
      ["fat", m.fat + "g"], ["sodium", m.sodium + "mg"], ["potassium", m.potassium], ["sat fat", m.satFat + "g"],
    ];
    return `
      <button class="backbtn" data-go="food">${backArrow} Food</button>
      <div class="hero" style="padding-top:2px">
        <span class="typebadge type-${(m.type || "").toLowerCase()}" style="margin-bottom:6px;display:inline-block">${esc(m.type)}</span>
        <h1>${esc(m.name)}</h1>
        <div class="muted" style="max-width:340px;margin:6px auto 0">${esc(m.why || "")}</div>
      </div>
      <div class="card">
        <h2>Nutrition</h2>
        <div class="macros">${nut.slice(0, 4).map(([k, v]) => `<div class="macro"><div class="v">${v}</div><div class="k">${k}</div></div>`).join("")}</div>
        <div class="macros" style="margin-top:8px">${nut.slice(4).map(([k, v]) => `<div class="macro"><div class="v">${v}</div><div class="k">${k}</div></div>`).join("")}</div>
      </div>
      ${r ? `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <h2>Ingredients</h2>
            <span class="tiny muted">${esc(r.servings || "1 serving")}${r.prepMin ? " · " + r.prepMin + " min" : ""}</span>
          </div>
          <ul class="ingredients">
            ${r.ingredients.map((i) => `<li><span class="amt">${esc(i.amount)}</span> ${esc(i.item)}</li>`).join("")}
          </ul>
        </div>
        <div class="card">
          <h2>Make it</h2>
          <ol class="steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
          ${r.makeAhead ? `<div class="makeahead"><b>Make ahead.</b> ${esc(r.makeAhead)}</div>` : ""}
        </div>
      ` : `<div class="card"><p class="muted tiny center" style="padding:16px">Recipe details are being prepared. The nutrition targets above come straight from the plan.</p></div>`}
    `;
  };

  SCREENS.plan = function () {
    const tabs = [["workouts", "Workouts"], ["trends", "Trends"], ["marathon", "Marathon"]];
    const body = planTab === "trends" ? trendsContent()
      : planTab === "marathon" ? marathonContent()
      : workoutsContent();
    return `
      <div class="hero" style="padding-bottom:0"><h1>Progress</h1></div>
      <div class="segbar">${tabs.map(([k, label]) => `<button class="seg ${planTab === k ? "on" : ""}" data-plantab="${k}">${label}</button>`).join("")}</div>
      ${body}
    `;
  };

  // ---- Workouts tab: record what you did + estimate calories burned ----
  const WORKOUTS = [
    { type: "Run", met: 9.8, ico: "🏃" }, { type: "Walk", met: 3.5, ico: "🚶" },
    { type: "Strength", met: 5.0, ico: "🏋️" }, { type: "Yoga", met: 3.0, ico: "🧘" },
    { type: "Cycling", met: 7.5, ico: "🚴" }, { type: "Swim", met: 8.0, ico: "🏊" }, { type: "Other", met: 5.0, ico: "✨" },
  ];
  // kcal ~= MET * 3.5 * kg / 200 * minutes  (kg from current weight, default start weight)
  function estKcal(met, minutes) {
    const lb = latestWeightLb();
    const kg = lb / 2.20462;
    return Math.round(met * 3.5 * kg / 200 * minutes);
  }
  function latestWeightLb() {
    for (let i = dayIndex[planToday()]; i >= 0; i--) {
      const l = S.days[PLAN.days[i].date] && S.days[PLAN.days[i].date].log;
      if (l && l.weight) return +l.weight;
    }
    return PLAN.meta.startWeightLb;
  }
  function workoutsContent() {
    const iso = planToday();
    const todays = (S.workouts && S.workouts[iso]) || [];
    const todayKcal = todays.reduce((a, w) => a + (w.kcal || 0), 0);
    const stravaOn = !!(S.strava && S.strava.connected);
    return `
      <div class="card tint-lav">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <div><b>Runs from Strava</b><div class="tiny muted">${stravaOn ? "Connected. Your runs log automatically." : "Connect once and your runs log themselves."}</div></div>
          <button class="btn small ${stravaOn ? "ghost" : ""}" data-strava="1" style="width:auto">${stravaOn ? "Connected" : "Connect Strava"}</button>
        </div>
      </div>

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <h2>Record a workout</h2>
          <span class="tiny muted">${esc(fmtDate(iso))}</span>
        </div>
        <p class="tiny muted" style="margin:2px 0 8px">Log walks, strength, yoga and cross-training here. Runs come from Strava.</p>
        <div class="wo-types">${WORKOUTS.map((w, i) => `<button class="wo-type ${i === 0 ? "sel" : ""}" data-wotype="${w.type}" data-met="${w.met}">${w.ico} ${w.type}</button>`).join("")}</div>
        <div class="field" style="margin-top:8px"><label>Minutes</label><input id="wo-min" type="number" inputmode="numeric" placeholder="e.g. 45" /></div>
        <div class="wo-est tiny muted" id="wo-est">Estimated burn appears here.</div>
        <button class="btn" id="wo-add" style="margin-top:8px">Add workout <span class="tiny" style="opacity:.85">(+2 ${cloverIco})</span></button>
      </div>

      ${todays.length ? `<div class="card">
        <div style="display:flex;justify-content:space-between;align-items:baseline"><h2>Today's workouts</h2><span class="tiny muted">${todayKcal} kcal</span></div>
        ${todays.map((w, i) => `<div class="meal-row"><span class="when">${esc(w.type)}</span><span class="what">${w.minutes} min · ~${w.kcal} kcal <button class="wo-del" data-wodel="${i}" aria-label="remove">✕</button></span></div>`).join("")}
      </div>` : ""}

      <p class="tiny muted center" style="margin:6px 0">Calorie burn is a rough estimate from your weight, activity, and time. Not exact.</p>
    `;
  }

  function marathonContent() {
    const curWeek = (dayByISO(planToday()) || {}).week;
    return `
      <div class="card tint-lav">
        <p class="tiny" style="margin:0">The optional marathon coaching plan built from the workbook. Borrow from it freely. Your own log lives on the <b>Today</b> and <b>Workouts</b> tabs.</p>
      </div>
      <div class="card">
        <h2>Training calendar</h2>
        <p class="tiny muted" style="margin:2px 0 10px">Numbers are planned miles for each day. A green outline marks a day you completed. Tap a day to open it.</p>
        <div class="phase-key">${["Base", "Build", "Peak", "Taper", "Race Week"].map((p) => `<span class="chip" style="background:${phaseColor(p)}">${p}</span>`).join("")}</div>
        ${PLAN.rollup.map((wk) => {
          const wdays = PLAN.days.filter((d) => d.week === wk.week);
          return `<div class="calweek ${wk.week === curWeek ? "thisweek" : ""}">
            <span class="wk">Wk ${wk.week}<br/><span class="tiny">${esc(wk.phase)}</span></span>
            <div class="days">${wdays.map((d) => {
              const full = S.days[d.date] && S.days[d.date].flags.full;
              return `<div class="calday" data-jump="${d.date}" title="${esc(fmtDate(d.date))}: ${esc(d.training)} ${d.miles || ""}" style="background:${phaseColor(d.phase)};${full ? "outline:2px solid #7cc6a2;outline-offset:-2px" : ""}">${d.miles || (d.training === "Rest" ? "·" : "×")}</div>`;
            }).join("")}</div>
            <span class="tiny muted" style="flex:0 0 44px;text-align:right">${wk.plannedMiles} mi</span>
          </div>`;
        }).join("")}
      </div>
      <div class="card">
        <h2>Fueling guide</h2>
        ${PLAN.fuelGuide.map((f) => `<div class="meal-row"><span class="when">${esc(f.timing)}</span><span class="what"><b>${esc(f.scenario)}</b>. ${esc(f.what)}<br/><span class="tiny muted">${esc(f.goal)}</span></span></div>`).join("")}
      </div>
      <div class="card">
        <h2>Suggested weekly grocery</h2>
        <p class="tiny muted" style="margin:2px 0 6px">A shopping starting point, not a rule. This week is week ${curWeek}.</p>
        ${PLAN.grocery.map((g) => `
          <details ${g.week === curWeek ? "open" : ""} class="grocery-wk">
            <summary>Week ${g.week} · ${esc(g.dates)}</summary>
            <div class="tiny" style="padding:6px 0">
              <div><b>Produce.</b> ${esc(g.produce)}</div>
              <div><b>Proteins.</b> ${esc(g.proteins)}</div>
              <div><b>Carbs.</b> ${esc(g.carbs)}</div>
              <div><b>Fats.</b> ${esc(g.fats)}</div>
              <div><b>Pantry.</b> ${esc(g.pantry)}</div>
              <div class="muted" style="margin-top:3px">${esc(g.notes)}</div>
            </div>
          </details>`).join("")}
      </div>
      <div class="card">
        <h2>Sources</h2>
        <p class="tiny muted">DASH and Mediterranean pattern with marathon carb periodization. Guidance drawn from:</p>
        ${PLAN.sources.map((s) => `<div class="tiny" style="padding:5px 0"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.note || s.url)}</a></div>`).join("")}
        <p class="tiny muted" style="margin-top:8px">This is not medical advice. Check individual targets with a clinician.</p>
      </div>
    `;
  }
  function phaseColor(phase) {
    return { "Base": "#dcf2e6", "Build": "#ddeefa", "Peak": "#fbe2e8", "Taper": "#fdf1cf", "Race Week": "#e7defb" }[phase] || "#eee";
  }

  // ---------- log modal ----------
  function openLog(iso) {
    iso = iso || viewISO;
    const ds = dayState(iso);
    const L = ds.log || {};
    $("#modal-root").innerHTML = `
      <div class="modal-scrim" id="log-scrim">
        <div class="award" style="max-width:360px;text-align:left;max-height:86vh;overflow:auto">
          <h2 style="text-align:center">Check-in · ${esc(fmtDate(iso))}</h2>
          <div class="grid2">
            <div class="field"><label>Weight (lb)</label><input id="lg-weight" type="number" inputmode="decimal" value="${L.weight ?? ""}"></div>
            <div class="field"><label>Body fat %</label><input id="lg-bf" type="number" inputmode="decimal" value="${L.bodyfat ?? ""}"></div>
            <div class="field"><label>Sleep (hrs)</label><input id="lg-sleep" type="number" inputmode="decimal" value="${L.sleep ?? ""}"></div>
            <div class="field"><label>Calories eaten</label><input id="lg-cal" type="number" inputmode="numeric" value="${L.actualCal ?? ""}"></div>
          </div>
          <div class="field"><label>Mood</label>
            <div class="moodrow">${MOODS.map((m, i) => `<button type="button" class="mood ${L.mood === i ? "sel" : ""}" data-mood="${i}" title="${m.label}">${m.e}</button>`).join("")}</div>
          </div>
          <div class="field"><label>Notes</label><textarea id="lg-notes" rows="2" placeholder="How did today feel?">${esc(L.notes || "")}</textarea></div>
          <button class="btn" id="lg-save">Save check-in 🌸</button>
          <button class="btn ghost" id="lg-cancel" style="margin-top:8px">Cancel</button>
        </div>
      </div>`;
    let mood = L.mood;
    $("#modal-root").querySelectorAll(".mood").forEach((b) => b.onclick = () => {
      mood = +b.dataset.mood;
      $("#modal-root").querySelectorAll(".mood").forEach((x) => x.classList.remove("sel"));
      b.classList.add("sel");
    });
    $("#lg-cancel").onclick = () => ($("#modal-root").innerHTML = "");
    $("#log-scrim").onclick = (e) => { if (e.target.id === "log-scrim") $("#modal-root").innerHTML = ""; };
    $("#lg-save").onclick = () => {
      const num = (id) => { const v = $("#" + id).value.trim(); return v === "" ? undefined : +v; };
      ds.log = Object.assign({}, ds.log, {
        weight: num("lg-weight"), bodyfat: num("lg-bf"),
        sleep: num("lg-sleep"), actualCal: num("lg-cal"), mood, notes: $("#lg-notes").value.trim() || undefined,
      });
      const hasAny = ["weight", "bodyfat", "sleep", "actualCal", "mood", "notes"].some((k) => ds.log[k] !== undefined);
      $("#modal-root").innerHTML = "";
      if (hasAny && !ds.checks.log) { const it = { key: "log" }; toggleCheck(iso, it); }
      else { touch(); render(); }
      toast("Check-in saved 🌸");
    };
  }

  // ---------- workouts ----------
  function addWorkout(type, met, minutes) {
    const iso = planToday();
    S.workouts[iso] = S.workouts[iso] || [];
    S.workouts[iso].push({ type, minutes, kcal: estKcal(met, minutes) });
    S.clovers += 2; // logging a workout earns lettuce
    // a logged workout also satisfies the "moved my body" habit for today
    const ds = dayState(iso);
    if (!ds.checks.movement) { toggleCheck(iso, { key: "movement" }); }
    else { touch(); render(); }
    toast("Workout logged");
  }
  function connectStrava() {
    // Real Strava needs a small server-side token exchange (not wired yet).
    $("#modal-root").innerHTML = `
      <div class="modal-scrim" id="sv-scrim"><div class="award" style="text-align:left">
        <h2 style="text-align:center">Connect Strava</h2>
        <p class="msg" style="text-align:center">Automatic run tracking is almost ready. It needs a small one-time setup on the backend before it can turn on.</p>
        <p class="tiny muted">Once it is live: link Strava once, and every run you record on your watch or phone flows straight into Bunny Meadow - no manual logging. Garmin works too (Garmin syncs to Strava).</p>
        <button class="btn" id="sv-ok" style="margin-top:12px">Got it</button>
      </div></div>`;
    $("#sv-ok").onclick = () => ($("#modal-root").innerHTML = "");
    $("#sv-scrim").onclick = (e) => { if (e.target.id === "sv-scrim") $("#modal-root").innerHTML = ""; };
  }

  // ---------- settings (game mode) ----------
  function openSettings() {
    const hard = S.mode === "hard";
    $("#modal-root").innerHTML = `
      <div class="modal-scrim" id="set-scrim"><div class="award" style="text-align:left;max-width:340px">
        <button class="room-close" id="set-close">${closeIco}</button>
        <h2 style="text-align:center;margin-bottom:2px">Settings</h2>
        <p class="tiny muted center" style="margin-bottom:12px">Choose how the game plays.</p>
        <div class="mode-opt ${!hard ? "sel" : ""}" data-mode="easy">
          <div class="mode-h">🌿 Easy <span class="tiny muted">relaxed</span></div>
          <div class="tiny muted">Bunnies stay forever. No feeding needed. Lettuce is just for fun (toys and accessories).</div>
        </div>
        <div class="mode-opt ${hard ? "sel" : ""}" data-mode="hard">
          <div class="mode-h">🥕 Hard <span class="tiny muted">bunny keeper</span></div>
          <div class="tiny muted">Feed every bunny at least once a week (costs lettuce, which you earn by logging). Neglected bunnies get hungry and wander off - but come back when you feed them.</div>
        </div>
        <div class="mode-line"><span class="tiny muted">Game mode</span><b class="tiny">${hard ? "Hard" : "Easy"}</b></div>
        <button class="btn ghost" id="set-done" style="margin-top:6px">Done</button>
      </div></div>`;
    const rerender = () => openSettings();
    $("#set-close").onclick = () => { $("#modal-root").innerHTML = ""; render(); };
    $("#set-done").onclick = () => { $("#modal-root").innerHTML = ""; render(); };
    $("#set-scrim").onclick = (e) => { if (e.target.id === "set-scrim") { $("#modal-root").innerHTML = ""; render(); } };
    $("#modal-root").querySelectorAll("[data-mode]").forEach((el) => el.onclick = () => {
      S.mode = el.dataset.mode; touch(); rerender();
    });
  }

  // ---------- bunny room (equip accessories) ----------
  function openRoom(id) {
    const b = B.byId[id]; if (!b) return;
    const have = S.collection[id];
    if (!have) return;
    if (!have.room) have.room = { accessory: null };
    const rar = B.RARITY[b.rarity];
    const cur = have.room.accessory;
    const ownedAccs = B.ACCESSORIES.filter((a) => ownsAcc(a.id));
    render(); // keep meadow/dex fresh underneath
    $("#modal-root").innerHTML = `
      <div class="modal-scrim" id="room-scrim">
        <div class="room-card">
          <button class="room-close" id="room-close" aria-label="Close">${closeIco}</button>
          <div class="room-scene">
            <div class="room-bunny">${B.render(b, 150, { accessory: cur })}</div>
          </div>
          <div class="room-info">
            <h2>${esc(b.breed)}</h2>
            <div class="rar" style="background:${rar.color}33;color:${shade(rar.color)}">${rar.label}</div>
            <span class="tiny muted">${b.nick ? esc(b.nick) + " · " : ""}visited ${have.count} time${have.count === 1 ? "" : "s"}</span>
            ${S.mode === "hard" ? `<div class="hunger-line">${hungerBadge(id)} <button class="btn small" data-feed="${id}" ${S.clovers < FEED_COST ? "disabled style=opacity:.5" : ""}>Feed ${cloverIco}${FEED_COST}</button></div>` : ""}
          </div>
          <div class="room-tray">
            <div class="tray-head"><b>Dress up ${esc(b.breed)}</b><button class="btn small ghost" data-shop="1">${cloverIco} ${S.clovers} · Shop</button></div>
            <div class="tray-items">
              <button class="tray-item ${!cur ? "sel" : ""}" data-equip="">None</button>
              ${ownedAccs.length ? ownedAccs.map((a) => `<button class="tray-item ${cur === a.id ? "sel" : ""}" data-equip="${a.id}"><span class="tray-art">${accPreview(a.id)}</span>${esc(a.name)}</button>`).join("")
                : '<span class="tiny muted" style="padding:8px">No accessories yet. Tap Shop to unlock some with lettuce.</span>'}
            </div>
          </div>
        </div>
      </div>`;
    const rerender = () => openRoom(id);
    $("#room-close").onclick = () => ($("#modal-root").innerHTML = "");
    $("#room-scrim").onclick = (e) => { if (e.target.id === "room-scrim") $("#modal-root").innerHTML = ""; };
    $("#modal-root").querySelectorAll("[data-equip]").forEach((el) => el.onclick = () => {
      have.room.accessory = el.dataset.equip || null;
      touch(); rerender();
    });
    const fb = $("#modal-root").querySelector("[data-feed]");
    if (fb) fb.onclick = () => { if (feed(id)) { toast("Fed " + b.breed + " 🥬"); rerender(); } };
    const sh = $("#modal-root").querySelector("[data-shop]");
    if (sh) sh.onclick = () => openShop(id, "accessories");
  }
  function hungerBadge(id) {
    const st = hungerState(id);
    if (st === "hungry") return '<span class="hbadge hungry">Hungry</span>';
    if (st === "wandered") return '<span class="hbadge gone">Wandered off</span>';
    return '<span class="hbadge ok">Content 🥬</span>';
  }

  // ---------- shop: toys + accessories, bought with lettuce ----------
  let shopTab = "accessories";
  function openShop(returnId, tab) {
    if (tab) shopTab = tab;
    const isToys = shopTab === "toys";
    const items = isToys ? B.TOYS : B.ACCESSORIES;
    const owned = (id) => isToys ? ownsToy(id) : ownsAcc(id);
    const swatch = (id) => isToys ? `<svg viewBox="0 0 100 100" width="42" height="42">${B.toySwatch(id, 0).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg>` : accPreview(id);
    $("#modal-root").innerHTML = `
      <div class="modal-scrim" id="shop-scrim">
        <div class="room-card">
          <button class="room-close" id="shop-close" aria-label="Close">${closeIco}</button>
          <div class="shop-head">
            <h2>Shop</h2>
            <span class="clovers">${cloverIco} ${S.clovers}</span>
          </div>
          <div class="segbar" style="margin:0 14px 4px">
            <button class="seg ${!isToys ? "on" : ""}" data-shoptab="accessories">Accessories</button>
            <button class="seg ${isToys ? "on" : ""}" data-shoptab="toys">Toys</button>
          </div>
          <p class="tiny muted center" style="margin:2px 14px 8px">Earn lettuce by logging your day. ${isToys ? "Toys decorate your meadow." : "Accessories can be worn by any bunny."}</p>
          <div class="shop-grid">
            ${items.map((a) => {
              const has = owned(a.id);
              const canBuy = !has && S.clovers >= a.cost;
              return `<div class="shop-item ${has ? "owned" : ""}">
                <div class="shop-art">${swatch(a.id)}</div>
                <div class="shop-nm">${esc(a.name)}</div>
                ${has ? '<span class="shop-owned">Owned</span>'
                  : `<button class="shop-buy ${canBuy ? "" : "off"}" data-buy="${a.id}">${cloverIco} ${a.cost}</button>`}
              </div>`;
            }).join("")}
          </div>
          ${returnId ? '<button class="btn ghost" id="shop-back" style="margin:10px 14px 0;width:calc(100% - 28px)">Back to room</button>' : ""}
        </div>
      </div>`;
    $("#shop-close").onclick = () => { $("#modal-root").innerHTML = ""; render(); };
    $("#shop-scrim").onclick = (e) => { if (e.target.id === "shop-scrim") { $("#modal-root").innerHTML = ""; render(); } };
    const back = $("#shop-back"); if (back) back.onclick = () => openRoom(returnId);
    $("#modal-root").querySelectorAll("[data-shoptab]").forEach((el) => el.onclick = () => openShop(returnId, el.dataset.shoptab));
    $("#modal-root").querySelectorAll("[data-buy]").forEach((el) => el.onclick = () => {
      const id = el.dataset.buy;
      const a = isToys ? B.TOY_BY_ID[id] : B.ACC_BY_ID[id];
      if (!a || owned(id) || S.clovers < a.cost) { if (S.clovers < a.cost) toast("Not enough lettuce yet"); return; }
      S.clovers -= a.cost; (isToys ? S.toys : S.accessories).push(id); touch();
      toast(`Got ${a.name}`);
      openShop(returnId);
    });
  }
  // preview chip: a neutral bunny wearing the accessory
  const PREVIEW_BUNNY = B.byId["biscuit"];
  function accPreview(accId) {
    return B.render(PREVIEW_BUNNY, 48, { accessory: accId });
  }

  // ---------- render + bindings ----------
  function render() {
    $("#clovers").innerHTML = cloverIco + " " + S.clovers;
    view.innerHTML = SCREENS[route]();
    bindScreen();
  }
  function renderNav() {
    const active = NAV_FOR[route] || route;
    document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.route === active));
    document.body.dataset.route = route;
  }
  function bindScreen() {
    // checklist
    view.querySelectorAll("[data-check]").forEach((el) => el.onclick = () => {
      const key = el.dataset.check;
      if (key === "log") { openLog(viewISO); return; }
      const item = itemsFor().find((i) => i.key === key);
      toggleCheck(viewISO, item);
    });
    // free-text activity note (saved without a re-render so focus stays)
    const an = view.querySelector("#activity-note");
    if (an) an.oninput = () => { const ds = dayState(viewISO); ds.log = ds.log || {}; ds.log.movementNote = an.value; touch(); };
    // day nav
    view.querySelectorAll("[data-day]").forEach((el) => el.onclick = () => {
      const dir = el.dataset.day, idx = dayIndex[viewISO];
      if (dir === "prev" && idx > 0) viewISO = PLAN.days[idx - 1].date;
      else if (dir === "next" && idx < PLAN.days.length - 1) viewISO = PLAN.days[idx + 1].date;
      else if (dir === "today") viewISO = planToday();
      render();
    });
    // open log
    const ol = view.querySelector("[data-open-log]"); if (ol) ol.onclick = () => openLog(viewISO);
    // bunny tap -> open its room
    view.querySelectorAll("[data-bunny]").forEach((el) => { if (el.dataset.bunny) el.onclick = () => openRoom(el.dataset.bunny); });
    // shop button (meadow HUD)
    view.querySelectorAll("[data-shop]").forEach((el) => el.onclick = () => openShop(null));
    // simple route jumps (back buttons, week chip -> plan, etc.)
    view.querySelectorAll("[data-go]").forEach((el) => el.onclick = () => go(el.dataset.go));
    // meal card -> detail page
    view.querySelectorAll("[data-meal]").forEach((el) => el.onclick = () => go("meal", { meal: el.dataset.meal }));
    // calendar day -> jump to that day on Today
    view.querySelectorAll("[data-jump]").forEach((el) => el.onclick = () => { viewISO = el.dataset.jump; go("today"); });
    // meals search + filter
    const ms = view.querySelector("#meal-search");
    if (ms) ms.oninput = () => { SCREENS.food._q = ms.value; const pos = ms.selectionStart; render(); const n = view.querySelector("#meal-search"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
    view.querySelectorAll(".mfilter").forEach((b) => b.onclick = () => { SCREENS.food._filter = b.dataset.mf; render(); });
    // Plan slide-bar tabs
    view.querySelectorAll("[data-plantab]").forEach((b) => b.onclick = () => { planTab = b.dataset.plantab; render(); });
    // settings + feed-all (meadow)
    view.querySelectorAll("[data-settings]").forEach((b) => b.onclick = openSettings);
    view.querySelectorAll("[data-feedall]").forEach((b) => b.onclick = feedAll);
    // Strava connect
    view.querySelectorAll("[data-strava]").forEach((b) => b.onclick = connectStrava);
    // workout recorder
    let woType = "Run", woMet = 9.8;
    view.querySelectorAll("[data-wotype]").forEach((b) => b.onclick = () => {
      woType = b.dataset.wotype; woMet = +b.dataset.met;
      view.querySelectorAll(".wo-type").forEach((x) => x.classList.remove("sel"));
      b.classList.add("sel");
      updateWoEst();
    });
    const woMin = view.querySelector("#wo-min");
    function updateWoEst() {
      const est = view.querySelector("#wo-est"); if (!est) return;
      const m = +(woMin && woMin.value);
      est.innerHTML = m > 0 ? `Estimated burn: <b>~${estKcal(woMet, m)} kcal</b>` : "Estimated burn appears here.";
    }
    if (woMin) woMin.oninput = updateWoEst;
    const woAdd = view.querySelector("#wo-add");
    if (woAdd) woAdd.onclick = () => {
      const m = Math.round(+(woMin && woMin.value));
      if (!m || m <= 0) { toast("Add how many minutes"); return; }
      addWorkout(woType, woMet, m);
    };
    view.querySelectorAll("[data-wodel]").forEach((el) => el.onclick = () => {
      const iso = planToday(); (S.workouts[iso] || []).splice(+el.dataset.wodel, 1); touch(); render();
    });
  }

  // ---------- auth / boot ----------
  function enterApp() {
    $("#lock").classList.add("hide");
    $("#app").classList.remove("hide");
    $("#nav").classList.remove("hide");
    $("#brand-bunny").innerHTML = B.render(B.byId["biscuit"], 30);
    recomputeStreak();
    render();
  }
  function lock() {
    localStorage.removeItem(LS_PW); PW = null;
    $("#app").classList.add("hide"); $("#nav").classList.add("hide");
    $("#lock").classList.remove("hide"); $("#lock-input").value = "";
  }

  async function unlock(pw, fromStored) {
    const errEl = $("#lock-err");
    const res = await syncLoad(pw);
    if (res.auth) { if (fromStored) { localStorage.removeItem(LS_PW); } errEl.textContent = "Hmm, that password doesn't match. 🐇"; return; }
    if (res.state && (res.state.updatedAt || 0) >= (S.updatedAt || 0)) { S = migrate(res.state); saveLocal(); }
    else if (res.ok && CFG.FUNCTION_URL) { scheduleSync(); } // local newer -> push after boot
    // local-only fallback
    if (!CFG.FUNCTION_URL && pw !== CFG.DEV_PASSWORD) { errEl.textContent = "Hmm, that password doesn't match. 🐇"; return; }
    PW = pw; localStorage.setItem(LS_PW, pw);
    setSync(res.ok && !res.net ? true : null);
    enterApp();
  }

  function boot() {
    document.querySelectorAll("#nav button").forEach((b) => b.onclick = () => go(b.dataset.route));
    const sb = $("#settingsbtn"); if (sb) sb.onclick = openSettings;
    // No password: open straight into the app (local-only mode).
    if (!CFG.REQUIRE_PASSWORD && !CFG.FUNCTION_URL) {
      enterApp();
      return;
    }
    $("#lock-art").innerHTML = B.sleeping(150);
    $("#lock-form").onsubmit = (e) => { e.preventDefault(); const v = $("#lock-input").value.trim(); if (v) unlock(v, false); };
    const lb = $("#lockbtn"); if (lb) lb.onclick = lock;
    const stored = localStorage.getItem(LS_PW);
    if (stored) unlock(stored, true);
  }
  boot();
})();
