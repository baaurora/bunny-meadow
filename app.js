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
  const cloverIco = '<svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align:-2px" fill="#6cbf8a"><path d="M12 13c-1.2-2.3-4.6-2.6-4.6.2 0 1.7 1.7 2.3 3 2.1-1 .9-1.2 2.7.4 3.2 1.3.4 2-1 2.2-2.3.2 1.3.9 2.7 2.2 2.3 1.6-.5 1.4-2.3.4-3.2 1.3.2 3-.4 3-2.1 0-2.8-3.4-2.5-4.6-.2.5-1.3.2-3.6-1.6-3.6s-2.1 2.3-1.6 3.6z"/></svg>';
  const closeIco = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
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
  const NAV_FOR = { today: "today", meals: "meals", meal: "meals", plan: "today", meadow: "meadow", dex: "dex", trends: "trends" };

  function go(r, opts) {
    route = r;
    if (opts && opts.meal) viewMeal = opts.meal;
    renderNav();
    render();
    window.scrollTo(0, 0);
  }

  function freshState() {
    return {
      version: 1, updatedAt: 0, days: {}, collection: {},
      clovers: 0, streak: { current: 0, best: 0 },
      milestones: { longestLongRun: 0, phases: {} },
      accessories: [], // unlocked accessory ids
    };
  }
  function migrate(s) {
    const f = freshState();
    return Object.assign(f, s, {
      streak: Object.assign(f.streak, s.streak || {}),
      milestones: Object.assign(f.milestones, s.milestones || {}),
      days: s.days || {}, collection: s.collection || {},
      accessories: s.accessories || [],
    });
  }
  function equipped(id) { return (S.collection[id] && S.collection[id].room && S.collection[id].room.accessory) || null; }
  function ownsAcc(accId) { return S.accessories.indexOf(accId) !== -1; }
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
  function itemsFor(day) {
    const runDay = day.miles > 0 || RUN_TYPES.includes(day.training);
    const items = [
      { key: "movement", emoji: "🏃", label: "Movement", sub: day.training + (day.miles ? ` · ${day.miles} mi` : "") },
      { key: "breakfast", emoji: "🍳", label: "Breakfast", sub: day.meals.breakfast },
      { key: "lunch", emoji: "🥗", label: "Lunch", sub: day.meals.lunch },
      { key: "dinner", emoji: "🍽️", label: "Dinner", sub: day.meals.dinner },
      { key: "snacks", emoji: "🍎", label: "Snacks", sub: [day.meals.snack1, day.meals.snack2].filter(Boolean).join(" · ") },
    ];
    if (runDay) items.push({ key: "fuel", emoji: "⛽", label: "Run fuel", sub: fuelSub(day) });
    items.push({ key: "log", emoji: "📓", label: "Daily check-in", sub: "Weight, BP, sleep, mood", optional: true });
    return items;
  }
  function fuelSub(day) {
    const f = day.fuel || {};
    if (day.training === "Long Run" || day.training === "Race")
      return `Pre: ${f.pre} · During: ${f.during} · Post: ${f.post}`;
    return `Pre: ${f.pre} · Post: ${f.post}`;
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
    if (isNew) S.collection[bunny.id] = { first: iso, count: 0 };
    S.collection[bunny.id].count++;
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
      const tier = item.key === "log" ? "uncommon" : (item.key === "movement" && RUN_TYPES.includes(dayByISO(iso).training) ? (Math.random() < 0.4 ? "uncommon" : "common") : (Math.random() < 0.18 ? "uncommon" : "common"));
      grant(pickBunny(tier, true), iso);
    }
    evaluateDay(iso);
    recomputeStreak();
    touch();
    render();
    flushAwards();
  }

  function evaluateDay(iso) {
    const day = dayByISO(iso); if (!day) return;
    const ds = dayState(iso);
    const items = itemsFor(day);
    const required = items.filter((i) => !i.optional);
    const allMeals = ["breakfast", "lunch", "dinner", "snacks"].every((k) => ds.checks[k]);
    const fullDay = required.every((i) => ds.checks[i.key]);

    if (allMeals && !ds.flags.meals) { ds.flags.meals = true; S.clovers += 5; grant(pickBunny("uncommon", true), iso); }
    if (fullDay && !ds.flags.full) {
      ds.flags.full = true; S.clovers += 15;
      grant(pickBunny("rare", true), iso);
      if (day.training === "Long Run" && day.miles > (S.milestones.longestLongRun || 0)) {
        S.milestones.longestLongRun = day.miles; grant(pickBunny("epic", true), iso);
      }
      if (day.training === "Race") { grant(pickBunny("legendary", true), iso); grant(pickBunny("epic", true), iso); }
      const st = trailingStreak(iso);
      if (st > 0 && st % 7 === 0 && !ds.flags.streak) { ds.flags.streak = true; grant(pickBunny("epic", true), iso); }
      // phase complete?
      const phaseDays = PLAN.days.filter((d) => d.phase === day.phase);
      const done = phaseDays.every((d) => S.days[d.date] && S.days[d.date].flags.full);
      if (done && !S.milestones.phases[day.phase]) { S.milestones.phases[day.phase] = true; grant(pickBunny("epic", true), iso); }
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
    const day = dayByISO(viewISO);
    const ds = dayState(viewISO);
    const items = itemsFor(day);
    const required = items.filter((i) => !i.optional);
    const doneReq = required.filter((i) => ds.checks[i.key]).length;
    const pct = Math.round((doneReq / required.length) * 100);
    const phaseCls = "phase-" + day.phase.replace(/\s/g, "");
    const idx = dayIndex[viewISO];
    const todaysBunnies = todaysAwardStrip(viewISO);
    const t = day.targets;

    return `
      <div class="hero">
        <div class="date">${esc(fmtDate(viewISO))} · <button class="weeklink" data-go="plan">Week ${day.week} of ${PLAN.meta.totalWeeks}</button></div>
        <div class="phasepill ${phaseCls}">${esc(day.phase)}</div>
        <div class="training">${trainingEmoji(day)} ${esc(day.training)}${day.miles ? ` · ${day.miles} mi` : ""}</div>
        <div class="encourage">${esc(encourage(day, pct))}</div>
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
        <p class="tiny muted" style="margin:2px 0 12px">${esc(day.notes || "")}</p>
        <div class="checklist">
          ${items.map((it) => `
            <button class="check ${ds.checks[it.key] ? "done" : ""} ${it.optional ? "optional" : ""}" data-check="${it.key}">
              <span class="box">${ds.checks[it.key] ? "✓" : ""}</span>
              <span class="emoji">${it.emoji}</span>
              <span class="txt"><span class="label">${esc(it.label)}</span><span class="sub">${esc(it.sub || "")}</span></span>
            </button>`).join("")}
        </div>
      </div>

      ${todaysBunnies}

      <div class="card">
        <h2>Fuel targets</h2>
        <p class="tiny muted" style="margin:2px 0 8px">From your plan. A gentle guide, not a rule. If energy, sleep, or mood dip, eat toward the higher end. 💛</p>
        <div class="macros">
          <div class="macro"><div class="v">${t.cal}</div><div class="k">cal</div></div>
          <div class="macro"><div class="v">${t.protein}g</div><div class="k">protein</div></div>
          <div class="macro"><div class="v">${t.carb}g</div><div class="k">carbs</div></div>
          <div class="macro"><div class="v">${t.fiber}g</div><div class="k">fiber</div></div>
        </div>
        <div class="macros" style="margin-top:8px">
          <div class="macro"><div class="v">${t.fat}g</div><div class="k">fat</div></div>
          <div class="macro"><div class="v">≤${t.sodiumMax}</div><div class="k">sodium</div></div>
          <div class="macro"><div class="v">${t.potassium}</div><div class="k">potassium</div></div>
          <div class="macro"><div class="v">≤${t.satFatMax}g</div><div class="k">sat fat</div></div>
        </div>
      </div>

      <div class="card">
        <h2>Meals for today</h2>
        <p class="tiny muted" style="margin:0 0 6px">Tap a meal to see its recipe.</p>
        ${mealRowHTML("Breakfast", day.meals.breakfast)}
        ${mealRowHTML("Lunch", day.meals.lunch)}
        ${mealRowHTML("Dinner", day.meals.dinner)}
        ${mealRowHTML("Snack", day.meals.snack1)}
        ${mealRowHTML("Snack", day.meals.snack2)}
        ${(day.miles > 0 || RUN_TYPES.includes(day.training)) ? `<div class="meal-row"><span class="when">Run fuel</span><span class="what">${esc(fuelSub(day))}</span></div>` : ""}
      </div>

      <button class="btn ghost" data-open-log="1" style="margin-bottom:8px">Log weight, BP and mood</button>
    `;
  };

  const MEAL_NAMES = new Set(PLAN.meals.map((m) => m.name));
  function mealRowHTML(when, name) {
    if (!name) return "";
    const clickable = MEAL_NAMES.has(name);
    return `<div class="meal-row ${clickable ? "meal-row-link" : ""}" ${clickable ? `data-meal="${esc(name)}"` : ""}>
      <span class="when">${esc(when)}</span>
      <span class="what">${esc(name)}${clickable ? ` <span class="meal-chev inline">${chevron}</span>` : ""}</span>
    </div>`;
  }

  function trainingEmoji(day) {
    return { "Long Run": "🏃‍♀️", "Race": "🏅", "Workout": "⚡", "Easy Run": "🌤️", "Strength": "💪", "Rest": "🌙", "Recovery": "🧘" }[day.training] || "🏃";
  }
  function encourage(day, pct) {
    if (pct === 100) return "Every box checked — what a lovely day. 🌸";
    if (day.training === "Race") return "It's race day. Trust your training and your practiced fuel. You've got this. 🏅";
    if (day.training === "Long Run") return "Long run day — fuel well, keep it easy, and enjoy the miles. 💛";
    if (day.training === "Rest" || day.training === "Recovery") return "A gentle day. Rest is part of getting stronger. 🌙";
    if (day.training === "Strength") return "Strength keeps you injury-free. Protein-forward today. 💪";
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
    const owned = Object.keys(S.collection);
    const bunnies = owned
      .sort((a, b) => (S.collection[b].count) - (S.collection[a].count))
      .map((id) => B.byId[id]).filter(Boolean);
    const spots = meadowSpots(bunnies.length);
    return `
      <div class="meadow-scene">
        <div class="meadow-hud">
          <div class="hud-count">${owned.length} friend${owned.length === 1 ? "" : "s"} · ${owned.length}/${B.CATALOG.length}</div>
          <button class="hud-shop" data-shop="1"><span class="clover-ico">${cloverIco}</span> ${S.clovers} · Shop</button>
        </div>
        <div class="sky"><span class="cloud c1"></span><span class="cloud c2"></span><span class="sun"></span></div>
        <div class="hills"></div>
        <div class="grass-field">
          ${bunnies.length ? bunnies.map((b, i) => `
            <div class="hopper" data-bunny="${b.id}" style="left:${spots[i].left}%;bottom:${spots[i].bottom}%;animation-delay:${spots[i].delay}s;z-index:${100 - Math.round(spots[i].bottom)}">
              <div class="bunny-shadow"></div>
              <div class="hop">${B.render(b, 76, { accessory: equipped(b.id) })}</div>
            </div>`).join("")
            : `<div class="meadow-empty">Your meadow is quiet.<br/>Check off your day and bunnies will hop in.</div>`}
          <span class="tuft t1"></span><span class="tuft t2"></span><span class="tuft t3"></span><span class="tuft t4"></span>
          <span class="flower f1"></span><span class="flower f2"></span><span class="flower f3"></span>
        </div>
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
          return `<div class="dexcell ${have ? "" : "locked"}" ${have ? `data-bunny="${b.id}"` : ""}>
            ${have && have.count > 1 ? `<span class="count">×${have.count}</span>` : ""}
            <div class="art">${B.render(b, 78, { accessory: have ? equipped(b.id) : null })}</div>
            <div class="nm">${have ? esc(b.breed) : "???"}</div>
            <div class="rar" style="background:${rar.color}44;color:${shade(rar.color)}">${rar.label}</div>
          </div>`;
        }).join("")}
      </div>
    `;
  };

  SCREENS.trends = function () {
    const logged = PLAN.days.map((d) => ({ iso: d.date, ...(S.days[d.date] && S.days[d.date].log || {}) }));
    const wpts = logged.filter((l) => l.weight).map((l) => ({ x: isoToNum(l.iso), y: +l.weight }));
    const sysPts = logged.filter((l) => l.bpSys).map((l) => ({ x: isoToNum(l.iso), y: +l.bpSys }));
    const diaPts = logged.filter((l) => l.bpDia).map((l) => ({ x: isoToNum(l.iso), y: +l.bpDia }));

    const curW = wpts.length ? wpts[wpts.length - 1].y : PLAN.meta.startWeightLb;
    const toGoal = (curW - PLAN.meta.goalWeightLb).toFixed(1);

    // adherence
    const todayIdx = dayIndex[planToday()];
    const elapsed = PLAN.days.slice(0, todayIdx + 1);
    const fullDays = elapsed.filter((d) => S.days[d.date] && S.days[d.date].flags.full).length;
    const completion = elapsed.length ? Math.round((fullDays / elapsed.length) * 100) : 0;
    const ownedCount = Object.keys(S.collection).length;

    // weekly miles
    const weeks = PLAN.rollup.map((wk) => {
      const wdays = PLAN.days.filter((d) => d.week === wk.week);
      const doneMiles = wdays.reduce((a, d) => a + (S.days[d.date] && S.days[d.date].checks.movement ? (d.miles || 0) : 0), 0);
      return { week: wk.week, phase: wk.phase, planned: wk.plannedMiles, done: Math.round(doneMiles * 10) / 10 };
    });

    const xMin = isoToNum(START), xMax = isoToNum(RACE);
    const weightChart = wpts.length
      ? lineChart({
          series: [{ points: wpts, color: "#c8b6ef" }],
          xMin, xMax,
          yMin: Math.min(PLAN.meta.goalWeightLb - 3, ...wpts.map((p) => p.y)) ,
          yMax: Math.max(PLAN.meta.startWeightLb + 2, ...wpts.map((p) => p.y)),
          refLines: [
            { y: PLAN.meta.goalWeightLb, label: "goal " + PLAN.meta.goalWeightLb, color: "#7cc6a2" },
            { y: PLAN.meta.startWeightLb, label: "start", color: "#f4b8c9" },
          ],
        })
      : `<p class="muted tiny center" style="padding:24px 0">Log your weight to see the trend toward ${PLAN.meta.goalWeightLb} lb 🌿</p>`;

    const bpChart = sysPts.length
      ? lineChart({
          series: [{ points: sysPts, color: "#f4b8c9" }, { points: diaPts, color: "#a9d4f0" }],
          xMin, xMax, yMin: 55, yMax: 145,
          refLines: [{ y: 120, label: "120", color: "#f4d98a" }, { y: 80, label: "80", color: "#a9dcc0" }],
        })
      : `<p class="muted tiny center" style="padding:24px 0">Log a blood pressure reading to chart it here.</p>`;

    return `
      <div class="hero"><h1>Trends</h1><div class="muted">Gentle progress, week by week.</div></div>

      <div class="statgrid">
        <div class="stat"><div class="big">${curW}</div><div class="lbl">current weight (lb)</div></div>
        <div class="stat"><div class="big">${toGoal > 0 ? toGoal : 0}</div><div class="lbl">lb to goal (${PLAN.meta.goalWeightLb})</div></div>
        <div class="stat"><div class="big">${completion}%</div><div class="lbl">days fully complete</div></div>
        <div class="stat"><div class="big">🔥 ${S.streak.current}</div><div class="lbl">day streak (best ${S.streak.best})</div></div>
      </div>

      <div class="card">
        <h2>Weight</h2>
        ${weightChart}
      </div>

      <div class="card">
        <h2>Blood pressure</h2>
        ${bpChart}
        <div class="chart-legend"><span><b style="background:#f4b8c9"></b>Systolic</span><span><b style="background:#a9d4f0"></b>Diastolic</span></div>
      </div>

      <div class="card">
        <h2>Weekly miles</h2>
        ${weeks.map((wk) => {
          const p = wk.planned || 1;
          const w = clamp(Math.round((wk.done / p) * 100), 0, 100);
          return `<div class="calweek">
            <span class="wk">Wk ${wk.week} · ${wk.phase}</span>
            <div class="progressbar" style="flex:1;margin:0"><span style="width:${w}%"></span></div>
            <span class="tiny muted" style="flex:0 0 70px;text-align:right">${wk.done}/${wk.planned} mi</span>
          </div>`;
        }).join("")}
      </div>

      <div class="card">
        <h2>Collection</h2>
        <div class="statgrid">
          <div class="stat"><div class="big">🐰 ${ownedCount}</div><div class="lbl">of ${B.CATALOG.length} bunnies</div></div>
          <div class="stat"><div class="big">🍀 ${S.clovers}</div><div class="lbl">clovers earned</div></div>
        </div>
      </div>
    `;
  };

  const chevron = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  const backArrow = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>';

  SCREENS.meals = function () {
    const mealFilter = SCREENS.meals._filter || "All";
    const q = (SCREENS.meals._q || "").toLowerCase();
    const types = ["All", "Breakfast", "Lunch", "Dinner", "Snack", "Fuel"];
    const meals = PLAN.meals.filter((m) =>
      (mealFilter === "All" || m.type === mealFilter) &&
      (!q || m.name.toLowerCase().includes(q) || (m.why || "").toLowerCase().includes(q)));

    return `
      <div class="hero"><h1>Meals</h1><div class="muted">Tap a meal for its recipe and ingredients.</div></div>
      <input class="searchbar" id="meal-search" placeholder="Search meals..." value="${esc(SCREENS.meals._q || "")}" />
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
    if (!m) return `<div class="hero"><h1>Meal</h1></div><button class="btn ghost" data-go="meals">Back to meals</button>`;
    const r = (window.MEALS || {})[m.name];
    const nut = [
      ["cal", m.cal], ["protein", m.protein + "g"], ["carbs", m.carbs + "g"], ["fiber", m.fiber + "g"],
      ["fat", m.fat + "g"], ["sodium", m.sodium + "mg"], ["potassium", m.potassium], ["sat fat", m.satFat + "g"],
    ];
    return `
      <button class="backbtn" data-go="meals">${backArrow} Meals</button>
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
    const curWeek = (dayByISO(planToday()) || {}).week;
    return `
      <button class="backbtn" data-go="today">${backArrow} Today</button>
      <div class="hero" style="padding-top:2px"><h1>18-week plan</h1><div class="muted">${fmtDate(START)} to ${fmtDate(RACE)} · race day is week ${PLAN.meta.totalWeeks}</div></div>

      <div class="card">
        <h2>Training calendar</h2>
        <p class="tiny muted" style="margin:2px 0 10px">Numbers are planned miles. A green outline means that day is fully checked off. Tap the week label to jump there.</p>
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
        <h2>Weekly grocery</h2>
        <p class="tiny muted" style="margin:2px 0 6px">This week is week ${curWeek}.</p>
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
        <p class="tiny muted">This plan follows a DASH and Mediterranean pattern with marathon carb periodization. Guidance drawn from:</p>
        ${PLAN.sources.map((s) => `<div class="tiny" style="padding:5px 0"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.note || s.url)}</a></div>`).join("")}
        <p class="tiny muted" style="margin-top:8px">This is not medical advice. Check individual targets with a clinician.</p>
      </div>
    `;
  };
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
            <div class="field"><label>BP systolic</label><input id="lg-sys" type="number" inputmode="numeric" value="${L.bpSys ?? ""}"></div>
            <div class="field"><label>BP diastolic</label><input id="lg-dia" type="number" inputmode="numeric" value="${L.bpDia ?? ""}"></div>
            <div class="field"><label>Sleep (hrs)</label><input id="lg-sleep" type="number" inputmode="decimal" value="${L.sleep ?? ""}"></div>
            <div class="field"><label>Actual calories</label><input id="lg-cal" type="number" inputmode="numeric" value="${L.actualCal ?? ""}"></div>
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
      ds.log = {
        weight: num("lg-weight"), bodyfat: num("lg-bf"), bpSys: num("lg-sys"), bpDia: num("lg-dia"),
        sleep: num("lg-sleep"), actualCal: num("lg-cal"), mood, notes: $("#lg-notes").value.trim() || undefined,
      };
      const hasAny = Object.values(ds.log).some((v) => v !== undefined);
      $("#modal-root").innerHTML = "";
      if (hasAny && !ds.checks.log) { const it = { key: "log" }; toggleCheck(iso, it); }
      else { touch(); render(); }
      toast("Check-in saved 🌸");
    };
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
            <span class="tiny muted">Visited ${have.count} time${have.count === 1 ? "" : "s"}</span>
          </div>
          <div class="room-tray">
            <div class="tray-head"><b>Dress up ${esc(b.breed)}</b><button class="btn small ghost" data-shop="1">${cloverIco} ${S.clovers} · Shop</button></div>
            <div class="tray-items">
              <button class="tray-item ${!cur ? "sel" : ""}" data-equip="">None</button>
              ${ownedAccs.length ? ownedAccs.map((a) => `<button class="tray-item ${cur === a.id ? "sel" : ""}" data-equip="${a.id}"><span class="tray-art">${accPreview(a.id)}</span>${esc(a.name)}</button>`).join("")
                : '<span class="tiny muted" style="padding:8px">No accessories yet. Tap Shop to unlock some with clovers.</span>'}
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
    const sh = $("#modal-root").querySelector("[data-shop]");
    if (sh) sh.onclick = () => openShop(id);
  }

  // ---------- accessory shop ----------
  function openShop(returnId) {
    $("#modal-root").innerHTML = `
      <div class="modal-scrim" id="shop-scrim">
        <div class="room-card">
          <button class="room-close" id="shop-close" aria-label="Close">${closeIco}</button>
          <div class="shop-head">
            <h2>Accessory Shop</h2>
            <span class="clovers">${cloverIco} ${S.clovers}</span>
          </div>
          <p class="tiny muted center" style="margin-bottom:8px">Earn clovers by checking off your day. Unlocked accessories can be worn by any bunny.</p>
          <div class="shop-grid">
            ${B.ACCESSORIES.map((a) => {
              const owned = ownsAcc(a.id);
              const canBuy = !owned && S.clovers >= a.cost;
              return `<div class="shop-item ${owned ? "owned" : ""}">
                <div class="shop-art">${accPreview(a.id)}</div>
                <div class="shop-nm">${esc(a.name)}</div>
                ${owned ? '<span class="shop-owned">Unlocked</span>'
                  : `<button class="shop-buy ${canBuy ? "" : "off"}" data-buy="${a.id}">${cloverIco} ${a.cost}</button>`}
              </div>`;
            }).join("")}
          </div>
          ${returnId ? '<button class="btn ghost" id="shop-back" style="margin-top:10px">Back to room</button>' : ""}
        </div>
      </div>`;
    $("#shop-close").onclick = () => { $("#modal-root").innerHTML = ""; render(); };
    $("#shop-scrim").onclick = (e) => { if (e.target.id === "shop-scrim") { $("#modal-root").innerHTML = ""; render(); } };
    const back = $("#shop-back"); if (back) back.onclick = () => openRoom(returnId);
    $("#modal-root").querySelectorAll("[data-buy]").forEach((el) => el.onclick = () => {
      const a = B.ACC_BY_ID[el.dataset.buy];
      if (!a || ownsAcc(a.id) || S.clovers < a.cost) { if (S.clovers < a.cost) toast("Not enough clovers yet"); return; }
      S.clovers -= a.cost; S.accessories.push(a.id); touch();
      toast(`Unlocked ${a.name}`);
      openShop(returnId);
    });
  }
  // preview chip: a neutral bunny wearing the accessory
  const PREVIEW_BUNNY = B.byId["holland-lop"];
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
      const day = dayByISO(viewISO);
      const item = itemsFor(day).find((i) => i.key === key);
      if (key === "log") { openLog(viewISO); return; }
      toggleCheck(viewISO, item);
    });
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
    if (ms) ms.oninput = () => { SCREENS.meals._q = ms.value; const pos = ms.selectionStart; render(); const n = view.querySelector("#meal-search"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
    view.querySelectorAll(".mfilter").forEach((b) => b.onclick = () => { SCREENS.meals._filter = b.dataset.mf; render(); });
  }

  // ---------- auth / boot ----------
  function enterApp() {
    $("#lock").classList.add("hide");
    $("#app").classList.remove("hide");
    $("#nav").classList.remove("hide");
    $("#brand-bunny").innerHTML = B.render(B.byId["holland-lop"], 30);
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
    // No password: open straight into the app (local-only mode).
    if (!CFG.REQUIRE_PASSWORD && !CFG.FUNCTION_URL) {
      const lb = $("#lockbtn"); if (lb) lb.style.display = "none";
      enterApp();
      return;
    }
    $("#lock-art").innerHTML = B.sleeping(150);
    $("#lock-form").onsubmit = (e) => { e.preventDefault(); const v = $("#lock-input").value.trim(); if (v) unlock(v, false); };
    $("#lockbtn").onclick = lock;
    const stored = localStorage.getItem(LS_PW);
    if (stored) unlock(stored, true);
  }
  boot();
})();
