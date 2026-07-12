/* Bunny Meadow — app logic: state, sync, gamification, screens.
   Plain vanilla JS, no build step. Depends on config.js, data.js, bunnies.js. */
(function () {
  "use strict";
  const BASE_PLAN = window.PLAN;   // the built-in Bunny Meadow marathon plan
  let PLAN = BASE_PLAN;            // active plan (may be swapped for a user-uploaded one)
  const B = window.BUNNIES;
  const CFG = window.CONFIG;

  // ---------- tiny helpers ----------
  const $ = (s, r) => (r || document).querySelector(s);
  const view = $("#view");
  // lettuce = the in-app currency (earned by logging; spent to feed bunnies or buy toys/accessories)
  const cloverIco = '<svg viewBox="0 0 24 24" width="15" height="15" style="vertical-align:-3px"><path d="M12 22c-5.5-1.2-9-5.4-9-10 0-1.4 1.4-2.2 2.6-1.4.1-2.3 2.4-3.4 3.9-2.2C10.2 4.3 13.8 4.3 15 6.6c1.5-1.2 3.8-.1 3.9 2.2C20.1 8 21.5 8.8 21.5 10.2c0 4.4-3.4 8.6-9.5 11.8z" fill="#8fce5a" stroke="#5a9a34" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 21c0-5 .3-8 1.2-11M12 21c0-4-.6-6-2-8.4" fill="none" stroke="#5a9a34" stroke-width="1.1" stroke-linecap="round"/></svg>';
  const closeIco = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const gearIco = '<svg viewBox="0 0 24 24" width="15" height="15" style="vertical-align:-3px" fill="currentColor"><path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/></svg>';
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  let dayIndex = Object.fromEntries(PLAN.days.map((d, i) => [d.date, i]));
  const dayByISO = (iso) => PLAN.days[dayIndex[iso]];
  let START = PLAN.days[0].date;
  let RACE = PLAN.days[PLAN.days.length - 1].date;

  // Swap in a user-uploaded plan (S.customPlan) or fall back to the built-in one.
  // Keeps the built-in meal library, fueling, grocery and sources as generic references;
  // only the day-by-day schedule + date window come from the custom plan.
  function applyPlan() {
    const custom = (typeof S !== "undefined" && S && S.customPlan && S.customPlan.days && S.customPlan.days.length)
      ? S.customPlan : null;
    if (custom) {
      const weeksMap = {};
      custom.days.forEach((d) => { if (!weeksMap[d.week]) weeksMap[d.week] = { week: d.week, phase: d.phase || "Custom" }; });
      const rollup = Object.values(weeksMap).sort((a, b) => a.week - b.week);
      PLAN = Object.assign({}, BASE_PLAN, {
        meta: Object.assign({}, BASE_PLAN.meta, custom.meta || {}),
        days: custom.days, rollup,
      });
    } else {
      PLAN = BASE_PLAN;
    }
    dayIndex = Object.fromEntries(PLAN.days.map((d, i) => [d.date, i]));
    START = PLAN.days[0].date;
    RACE = PLAN.days[PLAN.days.length - 1].date;
    if (typeof viewISO !== "undefined") viewISO = planToday();
  }

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
  let planTab = "trends"; // Plan page slide-bar: trends | marathon

  function go(r, opts) {
    if (r === "meadow" && route !== "meadow") { meadowSeed = (meadowSeed + 1) % 997; wokeBunnies = new Set(); }
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
      meadowPos: {},   // bunny id -> {left, bottom} percent of the meadow world (dragged)
      userMeals: [],   // recipes the user added
      starterDone: false,
      customPlan: null, // a user-uploaded training plan ({meta, days}) that replaces the built-in schedule
      googleUser: null, // {sub, email, name} when signed in for cloud sync
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
      meadowPos: s.meadowPos || {}, userMeals: s.userMeals || [], starterDone: !!s.starterDone,
      customPlan: s.customPlan || null, googleUser: s.googleUser || null,
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
  applyPlan(); // activate a saved custom plan, if any, before the first render

  function dayState(iso) {
    if (!S.days[iso]) S.days[iso] = { checks: {}, granted: {}, flags: {}, log: {}, meals: {} };
    const d = S.days[iso];
    d.checks = d.checks || {}; d.granted = d.granted || {}; d.flags = d.flags || {}; d.log = d.log || {}; d.meals = d.meals || {};
    // meals were once stored as plain name strings; upgrade them to { name, cal } objects
    for (const k in d.meals) { const a = d.meals[k]; if (a && a.some((m) => typeof m === "string")) d.meals[k] = a.map((m) => (typeof m === "string" ? { name: m } : m)); }
    return d;
  }
  function saveLocal() { try { localStorage.setItem(LS_STATE, JSON.stringify(S)); } catch (e) {} }
  function touch() { S.updatedAt = Date.now(); saveLocal(); scheduleSync(); }

  // ---------- sync ----------
  let syncTimer = null, syncOk = null;
  function setSync(ok) { syncOk = ok; const el = $("#syncdot"); if (el) el.className = "sync-dot" + (ok ? " on" : ""); }
  function scheduleSync() { scheduleGoogleSync(); if (!CFG.FUNCTION_URL || !PW) return; clearTimeout(syncTimer); syncTimer = setTimeout(syncSave, 800); }
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

  // ---------- Google sign-in + cloud sync (optional; local-first without it) ----------
  const syncBase = () => (CFG.STRAVA_WORKER_URL || "").replace(/\/+$/, "");
  const googleEnabled = () => !!(CFG.GOOGLE_CLIENT_ID && syncBase());
  let googleIdToken = null;   // current ID token (ephemeral, ~1h)
  let gisLoading = null;      // promise while Google's script loads
  let googleSyncTimer = null;

  function loadGIS() {
    if (window.google && google.accounts && google.accounts.id) return Promise.resolve();
    if (gisLoading) return gisLoading;
    gisLoading = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.defer = true;
      s.onload = () => res(); s.onerror = () => rej(new Error("Could not load Google sign-in."));
      document.head.appendChild(s);
    });
    return gisLoading;
  }
  function decodeJwt(t) {
    try { return JSON.parse(decodeURIComponent(escape(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))))); }
    catch (_) { return null; }
  }
  async function gisInit() {
    await loadGIS();
    google.accounts.id.initialize({ client_id: CFG.GOOGLE_CLIENT_ID, auto_select: true, callback: onGoogleCredential });
  }
  async function renderGoogleButton(el) {
    if (!googleEnabled() || !el) return;
    try { await gisInit(); google.accounts.id.renderButton(el, { type: "standard", theme: "outline", size: "large", text: "signin_with", shape: "pill" }); }
    catch (e) { el.innerHTML = '<span class="tiny plan-err">Could not load Google sign-in.</span>'; }
  }
  // called by Google with a fresh ID token after sign-in (interactive or silent)
  async function onGoogleCredential(resp) {
    const t = resp && resp.credential; if (!t) return;
    googleIdToken = t;
    const p = decodeJwt(t) || {};
    const first = !(S.googleUser && S.googleUser.sub);
    S.googleUser = { sub: p.sub, email: p.email, name: p.name };
    saveLocal();
    if (first) toast("Signed in as " + (S.googleUser.email || "your account") + " 🌿");
    await syncPull(true); // adopt cloud state if it is newer, then push ours up
    syncPush();
    if ($("#app").classList.contains("hide")) enterApp();   // signed in from the launch screen
    else if ($("#set-scrim")) openSettings();               // from Settings
    else render();
  }
  // launch screen: sign in with Google before entering (the front door)
  function showGoogleLogin() {
    $("#app").classList.add("hide");
    $("#nav").classList.add("hide");
    const lock = $("#lock");
    lock.classList.remove("hide");
    lock.querySelector(".box").innerHTML = `
      <div id="lock-art"></div>
      <h1>Bunny Meadow</h1>
      <p>Sign in to save your meadow and keep it synced across your phone and laptop.</p>
      <div id="g-login-btn" style="display:flex;justify-content:center;margin:16px 0 8px"></div>
      <button class="linkbtn" id="g-skip">Continue without an account</button>
    `;
    $("#lock-art").innerHTML = B.sleeping(120);
    renderGoogleButton($("#g-login-btn"));
    $("#g-skip").onclick = () => enterApp();
  }
  // on app open, quietly refresh the token + pull any changes from another device
  async function silentSync() {
    if (!googleEnabled() || !(S.googleUser && S.googleUser.sub)) return;
    try { await gisInit(); google.accounts.id.prompt(); } catch (_) {}
  }
  async function syncPull(adopt) {
    if (!googleEnabled() || !googleIdToken) return;
    try {
      const r = await fetch(syncBase() + "/state", { headers: { Authorization: "Bearer " + googleIdToken } });
      if (!r.ok) return;
      const j = await r.json();
      if (adopt && j.state && (j.state.updatedAt || 0) > (S.updatedAt || 0)) {
        S = migrate(j.state); applyPlan(); saveLocal(); render();
        toast("Synced your meadow 🌿");
      }
    } catch (_) {}
  }
  function scheduleGoogleSync() {
    if (!googleEnabled() || !(S.googleUser && S.googleUser.sub)) return;
    clearTimeout(googleSyncTimer);
    googleSyncTimer = setTimeout(syncPush, 1200);
  }
  async function syncPush() {
    if (!googleEnabled() || !googleIdToken || !(S.googleUser && S.googleUser.sub)) return;
    try {
      const r = await fetch(syncBase() + "/state", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + googleIdToken },
        body: JSON.stringify({ state: S }),
      });
      if (r.status === 401) { googleIdToken = null; silentSync(); } // token expired -> refresh
    } catch (_) {}
  }
  function googleSignOut() {
    try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect(); } catch (_) {}
    S.googleUser = null; googleIdToken = null; saveLocal();
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
      { key: "log", emoji: "📓", label: "Daily check-in", sub: "Tap to log weight, sleep and mood", optional: true },
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
  // did she work out that day? (moved-my-body check, or a recorded workout)
  function didWorkout(iso) {
    const ds = S.days[iso];
    return !!(ds && ds.checks && ds.checks.movement) || !!(S.workouts[iso] && S.workouts[iso].length);
  }
  // consecutive workout days ending on iso
  function trailingWorkoutStreak(iso) {
    let i = dayIndex[iso], n = 0;
    while (i >= 0 && didWorkout(PLAN.days[i].date)) { n++; i--; }
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

  // lettuce earned each time she logs something for the day (bunnies are earned separately)
  function lettuceReward() { return 3 + Math.floor(Math.random() * 3); } // 3-5

  function toggleCheck(iso, item) {
    const ds = dayState(iso);
    const now = !ds.checks[item.key];
    ds.checks[item.key] = now;
    if (now && !ds.granted[item.key]) {
      ds.granted[item.key] = true;
      S.clovers += lettuceReward(); // logging a thing earns 3-5 lettuce, not a bunny
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

    // flags still track meals/full-day completion for the streak counter + calendar,
    // but they no longer grant bunnies. Bunnies come only from the opening 3 and
    // from every run of 3 workout days in a row (below).
    if (allMeals && !ds.flags.meals) ds.flags.meals = true;
    if (fullDay && !ds.flags.full) ds.flags.full = true;

    // every run of 3 workout days in a row earns a bunny (rarer as the streak grows)
    const wStreak = trailingWorkoutStreak(iso);
    if (didWorkout(iso) && wStreak > 0 && wStreak % 3 === 0 && !ds.flags["wstreak" + wStreak]) {
      ds.flags["wstreak" + wStreak] = true;
      grant(pickBunny(wStreak >= 9 ? "rare" : "uncommon", true), iso);
      toast(wStreak + " workouts in a row! A bunny hopped in 🥕");
    }
  }

  // the name to show for a collected bunny (custom name, else its default nick)
  function bunnyName(id) { const c = S.collection[id], b = B.byId[id]; return (c && c.name) || (b && b.nick) || (b && b.breed) || "Bunny"; }

  // confetti burst - a big celebratory moment
  function confetti(amount) {
    const layer = document.createElement("div");
    layer.className = "confetti-layer";
    const cols = ["#f7b8d0", "#c8b6ef", "#a9d4f0", "#ffd76a", "#bfe5c8", "#f4a9c0"];
    const n = amount || 60;
    let html = "";
    for (let i = 0; i < n; i++) {
      const l = (i * 97) % 100, c = cols[i % cols.length];
      const d = ((i * 53) % 60) / 100, dur = 1.4 + ((i * 31) % 90) / 100, sz = 6 + (i % 4) * 2;
      const rot = (i * 47) % 360;
      html += `<span style="left:${l}%;background:${c};width:${sz}px;height:${sz + 3}px;animation-delay:${d}s;animation-duration:${dur}s;transform:rotate(${rot}deg)"></span>`;
    }
    layer.innerHTML = html;
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 3200);
  }

  // ---------- award modal (with naming on unlock + confetti) ----------
  function flushAwards() {
    if (!awardQueue.length) { $("#modal-root").innerHTML = ""; return; }
    const { bunny, isNew } = awardQueue[0];
    const rar = B.RARITY[bunny.rarity];
    const more = awardQueue.length - 1;
    const legendary = bunny.rarity === "legendary";
    if (isNew) confetti(legendary ? 110 : rar.label === "Common" ? 40 : 70);
    const nm = bunnyName(bunny.id);
    $("#modal-root").innerHTML = `
      <div class="modal-scrim" id="award-scrim">
        <div class="award ${legendary ? "legendary" : ""}">
          <div class="spark">✧ ✦ ✧</div>
          <div class="art pop-in">${B.render(bunny, 150)}</div>
          ${isNew ? `<div class="newtag">${legendary ? "LEGENDARY BUNNY" : "NEW BUNNY"}</div>` : ""}
          ${isNew ? `<p class="msg" style="margin:10px 0 4px">A ${esc(bunny.breed)} hopped into your meadow! Give them a name.</p>
              <input id="award-name" class="name-input" value="${esc(nm)}" maxlength="16" />`
            : `<h2>${esc(nm)}</h2><div class="rar" style="background:${rar.color}33;color:${shade(rar.color)}">${rar.label}</div>
              <p class="msg">${esc(nm)} the ${esc(bunny.breed)} came back to say hi 🥬</p>`}
          <button class="btn" id="award-ok">${isNew ? "Welcome them 🌸" : (more ? "Next 🐇" : "Yay! 🌸")}</button>
          ${more ? `<div class="queue">+${more} more waiting</div>` : ""}
        </div>
      </div>`;
    const close = () => {
      const inp = $("#award-name");
      if (inp) { const v = inp.value.trim(); if (v) { S.collection[bunny.id].name = v; touch(); } }
      awardQueue.shift(); flushAwards();
      if (!awardQueue.length) render();
    };
    $("#award-ok").onclick = close;
    const inp = $("#award-name"); if (inp) inp.onkeydown = (e) => { if (e.key === "Enter") close(); };
    $("#award-scrim").onclick = (e) => { if (e.target.id === "award-scrim" && !$("#award-name")) close(); };
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
      out += `<text x="4" y="${sy(yv) + 3}" font-size="8" fill="#6b6178">${Math.round(yv)}</text>`;
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
        <p class="tiny muted" style="margin:2px 0 12px">Check off what you actually did. You earn lettuce for each one.</p>
        <div class="checklist">
          ${items.map((it) => {
            const isMeal = MEAL_SLOT_KEYS.includes(it.key);
            const isMove = it.key === "movement";
            const opens = isMeal || isMove; // rows that open an editor (show a chevron)
            const planned = (ds.meals && ds.meals[it.key]) || [];
            let sub, filled = false;
            if (isMove) {
              const w = (S.workouts && S.workouts[viewISO]) || [];
              if (w.length) { sub = w.map((x) => x.type + (x.minutes ? " " + x.minutes + "m" : "")).join(", "); filled = true; }
              else sub = "Tap to log a workout";
            } else if (isMeal && planned.length) {
              const c = slotCal(viewISO, it.key);
              sub = planned.map((m) => mealName(m)).join(", ") + (c > 0 ? " · " + c + " cal" : ""); filled = true;
            } else if (isMeal) sub = "Tap to add what you ate";
            else sub = it.sub || "";
            return `
            <button class="check ${ds.checks[it.key] ? "done" : ""} ${it.optional ? "optional" : ""}" data-check="${it.key}">
              <span class="box">${ds.checks[it.key] ? "✓" : ""}</span>
              <span class="emoji">${it.emoji}</span>
              <span class="txt"><span class="label">${esc(it.label)}</span><span class="sub ${filled ? "planned" : ""}">${esc(sub)}</span></span>
              ${opens ? `<span class="meal-chev">${chevron}</span>` : ""}
            </button>`;
          }).join("")}
        </div>
      </div>

      ${todaysBunnies}

      <div class="card">
        <h2>Daily nutrition aims</h2>
        <p class="tiny muted" style="margin:2px 0 8px">Gentle guardrails from your lab work, not rules. These stay the same every day.</p>
        <div class="macros">
          ${aims.map((a) => `<div class="macro"><div class="v" style="font-size:.82rem">${esc(a.v)}</div><div class="k">${esc(a.k)}</div></div>`).join("")}
        </div>
      </div>
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
          <span class="muted tiny">${ids.length ? ids.length + " discovered" : ""}</span>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;min-height:60px;align-items:center">
          ${shown.length ? shown.map((id) => `<div class="strip-bunny" data-bunny="${id}" style="width:58px" title="${esc(bunnyName(id))}">${B.render(B.byId[id], 58, { accessory: equipped(id) })}</div>`).join("")
            : '<span class="muted tiny">Do 3 workouts in a row to meet a new bunny 🥕</span>'}
        </div>
      </div>`;
  }

  // Deterministic scatter positions so bunnies sit "on the grass" without overlapping too much.
  // Vary each meadow bunny's pose (sitting / laying / asleep) - stable per render,
  // different across bunnies, and it reshuffles a bit each time the meadow opens.
  let meadowSeed = 0;
  let wokeBunnies = new Set(); // bunnies the user nudged awake during this night-time meadow visit
  // After 8pm (and before 6am) local time the meadow is night and bunnies sleep.
  function isNight() { const h = new Date().getHours(); return h >= 20 || h < 6; }
  // the "asleep" pose for a bunny: 2 (sleep) if it has one, else its calmest available pose
  function sleepPose(b) { const n = (b && b.poses) || 1; return n >= 3 ? 2 : n - 1; }
  function meadowPose(id, i) {
    const b = B.byId[id]; const n = (b && b.poses) || 1;
    let h = meadowSeed + i * 7;
    for (let k = 0; k < id.length; k++) h = (h * 31 + id.charCodeAt(k)) >>> 0;
    return h % n;
  }
  // default scatter across the WIDE world (percent), staggered so no rigid grid
  function defaultSpot(i, n) {
    const cols = Math.max(3, Math.ceil(n / 2.2));
    const row = i % 3, col = Math.floor(i / 3);
    const jx = ((i * 37) % 13) - 6, jy = ((i * 53) % 11) - 5;
    return { left: clamp(6 + col * (86 / Math.max(1, cols - 1)) + jx, 3, 94), bottom: clamp(8 + row * 24 + jy, 4, 74) };
  }
  function spotFor(id, i, n) {
    const p = S.meadowPos && S.meadowPos[id];
    return p && typeof p.left === "number" ? p : defaultSpot(i, n);
  }

  SCREENS.meadow = function () {
    const ids = activeBunnies().sort((a, b) => (S.collection[b].count) - (S.collection[a].count));
    const bunnies = ids.map((id) => B.byId[id]).filter(Boolean);
    const n = bunnies.length;
    const ownedToys = (S.toys || []).filter((t) => B.TOY_BY_ID[t]);
    const toySpots = [{ left: 6, bottom: 5 }, { left: 90, bottom: 8 }, { left: 40, bottom: 3 }, { left: 20, bottom: 46 }, { left: 66, bottom: 50 }, { left: 96, bottom: 40 }];
    const hungry = S.mode === "hard" ? ids.filter((id) => hungerState(id) === "hungry").length : 0;
    const canFeedAll = hungry > 0 && S.clovers >= FEED_COST;
    // world gets wider as you collect more, enabling horizontal scroll + room to roam
    const worldW = Math.max(120, 60 + n * 12); // percent of the scene width
    const night = isNight();
    return `
      <div class="meadow-scene${night ? " night" : ""}">
        <div class="meadow-hud">
          <button class="hud-count" data-settings="1">${B.CATALOG.filter((b) => S.collection[b.id]).length}/${B.CATALOG.length} ${gearIco}</button>
          <button class="hud-shop" data-shop="1">${cloverIco} ${S.clovers} · Shop</button>
        </div>
        <div class="meadow-scroll" id="meadow-scroll">
          <div class="meadow-world" id="meadow-world" style="width:${worldW}%">
            <div class="sky"><span class="cloud c1"></span><span class="cloud c2"></span><span class="sun"></span><span class="moon"></span><span class="stars"></span></div>
            <div class="hills"></div>
            <div class="grass-field">
              ${ownedToys.map((t, i) => { const s = toySpots[i % toySpots.length]; return `<div class="meadow-toy" style="left:${s.left}%;bottom:${s.bottom}%">${B.toySwatch(t, 56)}</div>`; }).join("")}
              ${n ? bunnies.map((b, i) => {
                const asleep = night && !wokeBunnies.has(b.id); // at night they sleep unless the user nudged them
                const pose = asleep ? sleepPose(b) : meadowPose(b.id, i);
                const sp = spotFor(b.id, i, n);
                const active = !night && pose === 0; // only sitting bunnies hop by day; night is calm
                const seed = hashId(b.id) + meadowSeed * 131 + i * 17;
                const dur = (4.5 + (seed % 550) / 100).toFixed(2);  // 4.5-10s cycle, different per bunny
                const delay = (-(seed % 800) / 100).toFixed(2);     // negative offset so they start out of phase
                return `<div class="hopper" data-bunny="${b.id}" style="left:${sp.left}%;bottom:${sp.bottom}%;z-index:${100 - Math.round(sp.bottom)}">
                  <div class="bunny-shadow ${active ? "" : "still"}"></div>
                  ${S.mode === "hard" && hungerState(b.id) === "hungry" ? '<div class="hungry-tag">hungry</div>' : ""}
                  <div class="hop ${active ? "hopping" : "still"}" style="${active ? `animation-duration:${dur}s;animation-delay:${delay}s` : ""}">${B.render(b, 76, { accessory: equipped(b.id), pose })}</div>
                </div>`;
              }).join("")
                : `<div class="meadow-empty">Your meadow is quiet.<br/>Log your day and bunnies will hop in.</div>`}
              <span class="tuft t1"></span><span class="tuft t2"></span><span class="tuft t3"></span><span class="tuft t4"></span>
              <span class="flower f1"></span><span class="flower f2"></span><span class="flower f3"></span>
            </div>
          </div>
        </div>
        ${hungry ? `<button class="feed-all ${canFeedAll ? "" : "off"}" data-feedall="1">Feed ${hungry} hungry ${hungry === 1 ? "bunny" : "bunnies"} · ${cloverIco}${hungry * FEED_COST}</button>` : ""}
        <div class="meadow-tip">Tap a bunny to visit · drag to move · swipe for more space</div>
      </div>
    `;
  };
  function hashId(id) { let h = 0; for (let k = 0; k < id.length; k++) h = (h * 31 + id.charCodeAt(k)) >>> 0; return h; }

  // Drag bunnies around the meadow; a tap (no drag) opens the room.
  function bindMeadowDrag() {
    const world = $("#meadow-world"); if (!world) return;
    view.querySelectorAll(".hopper").forEach((el) => {
      const id = el.dataset.bunny;
      let sx = null, sy = null, pid = null, dragging = false, moved = false, pos = null;
      el.style.touchAction = "none";
      // silently forget any in-progress gesture without treating it as a tap
      const reset = () => { el.classList.remove("dragging"); sx = null; pid = null; dragging = false; moved = false; pos = null; el.style.zIndex = ""; };
      el.onpointerdown = (e) => {
        if (e.button != null && e.button !== 0) return; // primary button / touch only
        sx = e.clientX; sy = e.clientY; pid = e.pointerId; dragging = false; moved = false; pos = null;
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
      };
      el.onpointermove = (e) => {
        if (sx == null) return;
        // a mouse move with no button held means the press already ended (stuck-gesture guard): never drag on hover
        if (e.pointerType === "mouse" && e.buttons === 0) { reset(); return; }
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (!dragging && Math.hypot(dx, dy) > 8) { dragging = true; el.classList.add("dragging"); }
        if (dragging) {
          moved = true;
          const r = world.getBoundingClientRect();
          const left = clamp((e.clientX - r.left) / r.width * 100, 2, 97);
          const bottom = clamp((r.bottom - e.clientY) / r.height * 100, 2, 84);
          el.style.left = left + "%"; el.style.bottom = bottom + "%"; el.style.zIndex = 300;
          pos = { left, bottom };
        }
      };
      const end = (e) => {
        if (sx == null) return;
        if (e && pid != null) { try { el.releasePointerCapture(pid); } catch (_) {} }
        el.classList.remove("dragging");
        const wasMoved = moved, savedPos = pos;
        sx = null; pid = null; dragging = false; moved = false; pos = null;
        if (wasMoved && savedPos) {
          el.style.zIndex = ""; S.meadowPos[id] = savedPos; touch();
          // at night, a nudged bunny wakes up (re-render so it sits up instead of sleeping)
          if (isNight() && !wokeBunnies.has(id)) { wokeBunnies.add(id); render(); }
        } else if (!wasMoved) { openRoom(id); }
      };
      el.onpointerup = end; el.onpointercancel = end;
      // safety net: if focus/visibility is lost mid-gesture, drop it
      el.onlostpointercapture = () => { if (!moved) reset(); };
    });
  }

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
            ${have ? `<div class="art">${B.render(b, 78, { accessory: equipped(b.id) })}</div>` : '<div class="dexq">?</div>'}
            <div class="nm">${have ? esc(bunnyName(b.id)) : "???"}</div>
            <div class="dexbreed tiny muted">${have ? esc(b.breed) : "undiscovered"}</div>
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

    // calories eaten over time (summed from the meals logged each day)
    const calPts = PLAN.days.map((d) => ({ x: isoToNum(d.date), y: mealCalTotal(d.date) })).filter((p) => p.y > 0);
    const avgCal = calPts.length ? Math.round(calPts.reduce((a, p) => a + p.y, 0) / calPts.length) : null;
    const calChart = calPts.length
      ? lineChart({
          series: [{ points: calPts, color: "#7cc6a2" }],
          xMin, xMax,
          yMin: Math.max(0, Math.min(...calPts.map((p) => p.y)) - 150),
          yMax: Math.max(...calPts.map((p) => p.y)) + 150,
        })
      : `<p class="muted tiny center" style="padding:22px 0">Log meals with calories on the Today list to see them here.</p>`;
    // mood + sleep from the check-ins
    const moods = logged.filter((l) => l.mood != null).slice(-14);
    const sleeps = logged.filter((l) => l.sleep).map((l) => +l.sleep);
    const avgSleep = sleeps.length ? (sleeps.reduce((a, b) => a + b, 0) / sleeps.length).toFixed(1) : null;

    return `
      <div class="statgrid">
        <div class="stat"><div class="big">${curW}</div><div class="lbl">current weight (lb)</div></div>
        <div class="stat"><div class="big">${toGoal > 0 ? toGoal : 0}</div><div class="lbl">lb to goal (${PLAN.meta.goalWeightLb})</div></div>
        <div class="stat"><div class="big">${completion}%</div><div class="lbl">days fully logged</div></div>
        <div class="stat"><div class="big">${S.streak.current}</div><div class="lbl">day streak (best ${S.streak.best})</div></div>
      </div>
      <div class="card"><h2>Weight</h2>${weightChart}</div>
      <div class="card">
        <h2>Calories eaten</h2>
        <p class="tiny muted" style="margin:2px 0 8px">${avgCal ? "Averaging about " + avgCal + " cal a day from the meals you log." : "Summed from the meals you log on Today."}</p>
        ${calChart}
      </div>
      <div class="card">
        <h2>Mood & sleep</h2>
        ${moods.length ? `<div class="moodtrail">${moods.map((l) => `<span title="${esc(fmtDate(l.iso))}">${MOODS[l.mood].e}</span>`).join("")}</div>` : '<p class="muted tiny center" style="padding:10px 0">Log your mood in the daily check-in to see it here.</p>'}
        ${avgSleep ? `<p class="tiny muted" style="margin-top:10px">Averaging <b>${avgSleep} hrs</b> of sleep on the nights you logged.</p>` : ""}
      </div>
      <div class="card">
        <h2>Weekly movement</h2>
        <p class="tiny muted" style="margin:2px 0 8px">Minutes you logged as activity each week.</p>
        ${weeks.filter((w) => w.minutes > 0).length ? weeks.map((wk) => `<div class="calweek">
            <span class="wk">Wk ${wk.week} · ${wk.phase}</span>
            <div class="progressbar" style="flex:1;margin:0"><span style="width:${clamp(Math.round(wk.minutes / maxMin * 100), 0, 100)}%"></span></div>
            <span class="tiny muted" style="flex:0 0 60px;text-align:right">${wk.minutes} min</span>
          </div>`).join("")
          : '<p class="muted tiny center" style="padding:16px 0">Log movement on the Today tab to fill this in.</p>'}
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

  function allMeals() {
    const mine = (S.userMeals || []).map((m) => Object.assign({}, m, { mine: true }));
    return mine.concat(PLAN.meals);
  }
  function mealByName(name) { return allMeals().find((m) => m.name === name); }

  // ---------- meals on today's list (each carries its calories) ----------
  // A planned meal is { name, cal }. Logging a meal into a slot marks that slot done
  // + earns lettuce once, and the day's calories are summed into the check-in below.
  const MEAL_SLOTS = [["breakfast", "Breakfast", "🍳"], ["lunch", "Lunch", "🥗"], ["dinner", "Dinner", "🍽️"], ["snacks", "Snack", "🍎"]];
  const MEAL_SLOT_KEYS = MEAL_SLOTS.map((s) => s[0]);
  function slotLabel(slot) { const s = MEAL_SLOTS.find((x) => x[0] === slot); return s ? s[1].toLowerCase() : slot; }
  const mealName = (m) => (typeof m === "string" ? m : (m && m.name)) || "";
  const mealCal = (m) => (m && typeof m === "object" && m.cal != null && m.cal !== "" && !isNaN(m.cal)) ? Number(m.cal) : null;
  function slotItems(iso, slot) { return dayState(iso).meals[slot] || []; }
  function slotCal(iso, slot) { return slotItems(iso, slot).reduce((s, m) => s + (mealCal(m) || 0), 0); }
  function mealCalTotal(iso) { return MEAL_SLOT_KEYS.reduce((s, k) => s + slotCal(iso, k), 0); }
  // keep the check-in's "calories eaten" in step with the meals logged for the day
  function syncMealCalories(iso) {
    const ds = dayState(iso), t = mealCalTotal(iso);
    ds.log = ds.log || {};
    if (t > 0) ds.log.actualCal = t; else delete ds.log.actualCal;
  }
  // adding/removing a meal keeps that slot's checkbox, lettuce and calories in sync
  function onMealsChanged(iso, slot) {
    const ds = dayState(iso), has = slotItems(iso, slot).length > 0;
    if (has && !ds.checks[slot]) {
      ds.checks[slot] = true;
      if (!ds.granted[slot]) { ds.granted[slot] = true; S.clovers += lettuceReward(); }
    } else if (!has && ds.checks[slot]) {
      ds.checks[slot] = false;
    }
    syncMealCalories(iso);
    evaluateDay(iso); recomputeStreak(); touch();
  }
  function addMealEntry(iso, slot, name, cal) {
    (dayState(iso).meals[slot] = dayState(iso).meals[slot] || []).push({ name: name, cal: (cal == null || isNaN(cal)) ? undefined : cal });
    onMealsChanged(iso, slot);
  }
  function removeMealEntry(iso, slot, idx) { (dayState(iso).meals[slot] || []).splice(idx, 1); onMealsChanged(iso, slot); }
  // which of today's slots a given recipe is already on
  function slotsForMeal(name) {
    const ds = dayState(planToday());
    return MEAL_SLOTS.filter(([k]) => (ds.meals[k] || []).some((m) => mealName(m) === name)).map(([, l]) => l);
  }
  // Food's "Add to today" toggles a menu recipe onto a slot, carrying its calories
  function toggleMealToday(name, slot) {
    const iso = planToday(), arr = dayState(iso).meals[slot] = dayState(iso).meals[slot] || [];
    const i = arr.findIndex((m) => mealName(m) === name);
    if (i >= 0) { arr.splice(i, 1); toast("Removed " + name + " from " + slotLabel(slot)); }
    else { const meal = mealByName(name); arr.push({ name: name, cal: meal && meal.cal != null ? meal.cal : undefined }); toast("Added " + name + " to " + slotLabel(slot) + " 🥕"); }
    onMealsChanged(iso, slot);
  }
  // sheet: pick which meal slot a Food recipe belongs to (tap a slot again to remove it)
  function openAddToToday(name) {
    const close = () => { $("#modal-root").innerHTML = ""; render(); };
    const draw = () => {
      const ds = dayState(planToday());
      $("#modal-root").innerHTML = `
        <div class="modal-scrim" id="a2t-scrim">
          <div class="sheet a2t">
            <h2 style="margin:0 0 2px">Add to today</h2>
            <p class="tiny muted" style="margin:0 0 14px">Which meal is <b>${esc(name)}</b>? Tap again to remove it.</p>
            <div class="a2t-slots">
              ${MEAL_SLOTS.map(([k, l, e]) => {
                const on = (ds.meals[k] || []).some((m) => mealName(m) === name);
                return `<button class="a2t-slot ${on ? "on" : ""}" data-slot="${k}"><span class="a2t-emoji">${e}</span>${l}${on ? " ✓" : ""}</button>`;
              }).join("")}
            </div>
            <button class="btn small ghost" id="a2t-done" style="margin-top:16px">Done</button>
          </div>
        </div>`;
      $("#a2t-scrim").onclick = (e) => { if (e.target.id === "a2t-scrim") close(); };
      $("#a2t-done").onclick = close;
      $("#modal-root").querySelectorAll(".a2t-slot").forEach((b) => b.onclick = () => { toggleMealToday(name, b.dataset.slot); draw(); });
    };
    draw();
  }
  // editor opened by tapping a meal row on Today: type a meal or pick from the food
  // menu (auto-fills its calories), add a calorie count, remove items, see the total
  function openMealSlot(slot, iso) {
    iso = iso || viewISO;
    const meta = MEAL_SLOTS.find((s) => s[0] === slot) || [slot, slot, "🍽️"];
    const menu = allMeals();
    const close = () => { $("#modal-root").innerHTML = ""; render(); };
    const draw = () => {
      const items = slotItems(iso, slot), total = slotCal(iso, slot);
      $("#modal-root").innerHTML = `
        <div class="modal-scrim" id="ms-scrim">
          <div class="sheet ms">
            <h2 style="margin:0 0 2px">${meta[2]} ${esc(meta[1])}</h2>
            <p class="tiny muted" style="margin:0 0 12px">What did you eat? Type it or pick from your food menu, then add the calories.</p>
            <div class="ms-list">
              ${items.length ? items.map((m, i) => `
                <div class="ms-item">
                  <span class="ms-name">${esc(mealName(m))}</span>
                  <span class="ms-cal">${mealCal(m) != null ? mealCal(m) + " cal" : "—"}</span>
                  <button class="ms-del" data-del="${i}" aria-label="Remove ${esc(mealName(m))}">✕</button>
                </div>`).join("") : `<p class="tiny muted center" style="padding:8px 0">Nothing logged yet.</p>`}
            </div>
            ${total > 0 ? `<div class="ms-total">Total <b>${total} cal</b></div>` : ""}
            <div class="ms-add">
              <input id="ms-name" class="ms-input" list="ms-menu" placeholder="Meal (type or pick)" autocomplete="off">
              <input id="ms-cal" class="ms-input ms-calin" type="number" inputmode="numeric" placeholder="cal">
              <button class="btn small" id="ms-add">Add</button>
            </div>
            <datalist id="ms-menu">${menu.map((m) => `<option value="${esc(m.name)}"${m.cal != null ? ` label="${m.cal} cal"` : ""}>`).join("")}</datalist>
            <button class="btn ghost small" id="ms-done" style="margin-top:14px">Done</button>
          </div>
        </div>`;
      const nameEl = $("#ms-name"), calEl = $("#ms-cal");
      $("#ms-scrim").onclick = (e) => { if (e.target.id === "ms-scrim") close(); };
      $("#ms-done").onclick = close;
      // picking / typing a menu meal auto-fills its calories (unless she already typed some)
      nameEl.oninput = () => {
        const hit = menu.find((m) => m.name.toLowerCase() === nameEl.value.trim().toLowerCase());
        if (hit && hit.cal != null && calEl.value.trim() === "") calEl.value = hit.cal;
      };
      const add = () => {
        const name = nameEl.value.trim();
        if (!name) { nameEl.focus(); return; }
        const c = calEl.value.trim();
        addMealEntry(iso, slot, name, c === "" ? undefined : +c);
        draw(); $("#ms-name").focus();
      };
      $("#ms-add").onclick = add;
      nameEl.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); calEl.value.trim() === "" ? calEl.focus() : add(); } };
      calEl.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } };
      $("#modal-root").querySelectorAll("[data-del]").forEach((b) => b.onclick = () => { removeMealEntry(iso, slot, +b.dataset.del); draw(); });
    };
    draw();
  }

  SCREENS.food = function () {
    const mealFilter = SCREENS.food._filter || "All";
    const q = (SCREENS.food._q || "").toLowerCase();
    const hasMine = (S.userMeals || []).length > 0;
    const types = ["All"].concat(hasMine ? ["Yours"] : [], ["Breakfast", "Lunch", "Dinner", "Snack", "Fuel"]);
    const meals = allMeals().filter((m) =>
      (mealFilter === "All" || (mealFilter === "Yours" ? m.mine : m.type === mealFilter)) &&
      (!q || m.name.toLowerCase().includes(q) || (m.why || "").toLowerCase().includes(q)));

    return `
      <div class="hero"><h1>Food</h1><div class="muted">Meal ideas from the plan, plus your own recipes.</div></div>
      <button class="btn ghost" data-recipe-new="1" style="margin-bottom:10px">+ Add your own recipe</button>
      <input class="searchbar" id="meal-search" placeholder="Search meals..." value="${esc(SCREENS.food._q || "")}" />
      <div class="filterrow">${types.map((t) => `<button class="mfilter ${t === mealFilter ? "on" : ""}" data-mf="${t}">${t}</button>`).join("")}</div>
      <div class="meal-list">
        ${meals.map((m) => `
          <div class="meal-row">
            <button class="meal-card" data-meal="${esc(m.name)}">
              <div class="meal-card-main">
                <div class="meal-card-top"><b>${esc(m.name)}</b>${m.mine ? '<span class="typebadge type-yours">Yours</span>' : ""}<span class="typebadge type-${(m.type || "").toLowerCase()}">${esc(m.type)}</span></div>
                ${m.cal != null ? `<div class="tiny muted">${m.cal} cal${m.protein != null ? ` · ${m.protein}g protein` : ""}${m.fiber != null ? ` · ${m.fiber}g fiber` : ""}</div>` : ""}
                <div class="tiny meal-why">${esc(m.why || (m.mine ? "Your recipe" : ""))}</div>
              </div>
              <span class="meal-chev">${chevron}</span>
            </button>
            <button class="a2t-btn" data-add="${esc(m.name)}" title="Add ${esc(m.name)} to today"><span class="a2t-plus">＋</span><span>Today</span></button>
          </div>`).join("") || '<p class="muted tiny center" style="padding:20px">No meals match.</p>'}
      </div>
    `;
  };

  SCREENS.meal = function () {
    const m = mealByName(viewMeal);
    if (!m) return `<div class="hero"><h1>Meal</h1></div><button class="btn ghost" data-go="food">Back to Food</button>`;
    const r = m.mine ? { ingredients: m.ingredients || [], steps: m.steps || [], servings: m.servings, makeAhead: m.makeAhead } : (window.MEALS || {})[m.name];
    const hasNut = m.cal != null;
    const nut = [
      ["cal", m.cal], ["protein", m.protein + "g"], ["carbs", m.carbs + "g"], ["fiber", m.fiber + "g"],
      ["fat", m.fat + "g"], ["sodium", m.sodium + "mg"], ["potassium", m.potassium], ["sat fat", m.satFat + "g"],
    ];
    return `
      <button class="backbtn" data-go="food">${backArrow} Food</button>
      <div class="hero" style="padding-top:2px">
        <span class="typebadge type-${(m.type || "").toLowerCase()}" style="margin-bottom:6px;display:inline-block">${esc(m.type)}</span>
        <h1>${esc(m.name)}</h1>
        <div class="muted" style="max-width:340px;margin:6px auto 0">${esc(m.why || (m.mine ? "Your recipe" : ""))}</div>
        ${m.mine ? `<div style="margin-top:8px"><button class="btn small ghost" data-recipe-edit="${esc(m.name)}">Edit</button> <button class="btn small ghost" data-recipe-del="${esc(m.name)}">Delete</button></div>` : ""}
      </div>
      <div style="text-align:center;margin:-4px 0 12px">
        <button class="btn small a2t-cta" data-add="${esc(m.name)}">🥕 Add to today</button>
        ${slotsForMeal(m.name).length ? `<div class="tiny muted" style="margin-top:7px">On today's list: ${esc(slotsForMeal(m.name).join(", "))}</div>` : ""}
      </div>
      ${hasNut ? `<div class="card">
        <h2>Nutrition</h2>
        <div class="macros">${nut.slice(0, 4).map(([k, v]) => `<div class="macro"><div class="v">${v}</div><div class="k">${k}</div></div>`).join("")}</div>
        <div class="macros" style="margin-top:8px">${nut.slice(4).map(([k, v]) => `<div class="macro"><div class="v">${v}</div><div class="k">${k}</div></div>`).join("")}</div>
      </div>` : ""}
      ${r && (r.ingredients.length || r.steps.length) ? `
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
    const tabs = [["trends", "Trends"], ["marathon", "Marathon"]];
    const body = planTab === "marathon" ? marathonContent() : trendsContent();
    return `
      <div class="hero" style="padding-bottom:0"><h1>Progress</h1></div>
      <div class="segbar">${tabs.map(([k, label]) => `<button class="seg ${planTab === k ? "on" : ""}" data-plantab="${k}">${label}</button>`).join("")}</div>
      ${body}
    `;
  };

  // ---- activity logging (the "Moved my body" editor on Today) ----
  const ACTIVITIES = ["Run", "Walk", "Strength", "Yoga", "Cycling", "Swim", "Hike", "Pilates", "Dance", "Rowing", "Other"];
  // adding/removing an activity keeps the movement check, lettuce and streak in sync
  function onWorkoutsChanged(iso) {
    const ds = dayState(iso), has = (S.workouts[iso] || []).length > 0;
    if (has && !ds.checks.movement) {
      ds.checks.movement = true;
      if (!ds.granted.movement) { ds.granted.movement = true; S.clovers += lettuceReward(); }
    } else if (!has && ds.checks.movement) {
      ds.checks.movement = false;
    }
    evaluateDay(iso); recomputeStreak(); touch();
  }
  function addWorkout(iso, type, minutes) {
    S.workouts[iso] = S.workouts[iso] || [];
    S.workouts[iso].push({ type: type, minutes: (minutes && minutes > 0) ? minutes : undefined });
    onWorkoutsChanged(iso);
  }
  function removeWorkout(iso, idx) { (S.workouts[iso] || []).splice(idx, 1); onWorkoutsChanged(iso); }
  // editor opened by tapping "Moved my body" on Today: log activities (type + optional
  // minutes) or connect Strava to auto-import runs. Everything about movement lives here.
  function openMovement(iso) {
    iso = iso || viewISO;
    const close = () => { $("#modal-root").innerHTML = ""; render(); };
    const draw = () => {
      const list = (S.workouts && S.workouts[iso]) || [];
      const stravaOn = !!(S.strava && S.strava.connected);
      $("#modal-root").innerHTML = `
        <div class="modal-scrim" id="mv-scrim">
          <div class="sheet ms">
            <h2 style="margin:0 0 2px">🏃 Moved my body</h2>
            <p class="tiny muted" style="margin:0 0 12px">What did you do? Type it or pick an activity, add minutes if you like.</p>
            <div class="ms-list">
              ${list.length ? list.map((w, i) => `
                <div class="ms-item">
                  <span class="ms-name">${esc(w.type || "Activity")}${w.miles ? ` · ${w.miles} mi` : ""}${w.stravaId ? ` <span class="ms-src">Strava</span>` : ""}</span>
                  <span class="ms-cal">${w.minutes ? w.minutes + " min" : "—"}</span>
                  <button class="ms-del" data-wdel="${i}" aria-label="Remove ${esc(w.type || "activity")}">✕</button>
                </div>`).join("") : `<p class="tiny muted center" style="padding:8px 0">Nothing logged yet.</p>`}
            </div>
            <div class="ms-add">
              <input id="mv-type" class="ms-input" list="mv-list" placeholder="Activity (type or pick)" autocomplete="off">
              <input id="mv-min" class="ms-input ms-calin" type="number" inputmode="numeric" placeholder="min">
              <button class="btn small" id="mv-add">Add</button>
            </div>
            <datalist id="mv-list">${ACTIVITIES.map((a) => `<option value="${a}">`).join("")}</datalist>
            <div class="mv-strava">
              <div class="tiny"><b>Strava</b><div class="muted">${stravaOn ? "Connected. Runs log automatically." : "Connect once and your runs log themselves."}</div></div>
              <button class="btn small ${stravaOn ? "ghost" : ""}" data-strava="1" style="width:auto">${stravaOn ? "Connected" : "Connect"}</button>
            </div>
            <button class="btn ghost small" id="mv-done" style="margin-top:12px">Done</button>
          </div>
        </div>`;
      const typeEl = $("#mv-type"), minEl = $("#mv-min");
      $("#mv-scrim").onclick = (e) => { if (e.target.id === "mv-scrim") close(); };
      $("#mv-done").onclick = close;
      const add = () => {
        const t = typeEl.value.trim(); if (!t) { typeEl.focus(); return; }
        const m = minEl.value.trim();
        addWorkout(iso, t, m === "" ? undefined : Math.round(+m));
        draw(); $("#mv-type").focus();
      };
      $("#mv-add").onclick = add;
      typeEl.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); minEl.value.trim() === "" ? minEl.focus() : add(); } };
      minEl.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } };
      $("#modal-root").querySelectorAll("[data-wdel]").forEach((b) => b.onclick = () => { removeWorkout(iso, +b.dataset.wdel); draw(); });
      $("#modal-root").querySelectorAll("[data-strava]").forEach((b) => b.onclick = connectStrava);
    };
    draw();
  }

  function marathonContent() {
    const curWeek = (dayByISO(planToday()) || {}).week;
    return `
      <div class="card tint-lav">
        <p style="margin:0;font-size:0.92rem">The optional marathon coaching plan built from the workbook. Follow it if you like, or just borrow ideas. Your own daily log lives on the <b>Today</b> tab.</p>
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
            <div class="field"><label>Calories eaten</label><div class="lg-cal-sum">${mealCalTotal(iso)}<span class="lg-cal-note"> from meals</span></div></div>
          </div>
          <p class="tiny muted" style="margin:-4px 0 8px">Calories add up from the meals you log on the Today list.</p>
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
        sleep: num("lg-sleep"), mood, notes: $("#lg-notes").value.trim() || undefined,
      });
      syncMealCalories(iso); // calories eaten come from the meals logged, not typed here
      const hasAny = ["weight", "bodyfat", "sleep", "mood", "notes"].some((k) => ds.log[k] !== undefined);
      $("#modal-root").innerHTML = "";
      if (hasAny && !ds.checks.log) { toggleCheck(iso, { key: "log" }); }
      else { touch(); render(); flushAwards(); }
      toast("Check-in saved 🌸");
    };
  }
  // most recent weight logged on a day before `iso`
  function lastWeightBefore(iso) {
    let i = (dayIndex[iso] ?? PLAN.days.length) - 1;
    for (; i >= 0; i--) {
      const l = S.days[PLAN.days[i].date] && S.days[PLAN.days[i].date].log;
      if (l && l.weight != null) return +l.weight;
    }
    return null;
  }

  // ---------- workouts ----------
  const stravaBase = () => (CFG.STRAVA_WORKER_URL || "").replace(/\/+$/, "");
  function connectStrava() {
    const base = stravaBase();
    // Backend not deployed yet: explain the one-time setup.
    if (!base) {
      $("#modal-root").innerHTML = `
        <div class="modal-scrim" id="sv-scrim"><div class="award" style="text-align:left">
          <h2 style="text-align:center">Connect Strava</h2>
          <p class="msg" style="text-align:center">Automatic run tracking needs a small one-time setup before it can turn on.</p>
          <p class="tiny muted">Once it is live you link Strava once, and every run from your watch or phone flows straight into Bunny Meadow. Garmin works too, since Garmin syncs to Strava. Setup steps are in the app's worker folder (worker/README).</p>
          <button class="btn" id="sv-ok" style="margin-top:12px">Got it</button>
        </div></div>`;
      $("#sv-ok").onclick = () => ($("#modal-root").innerHTML = "");
      $("#sv-scrim").onclick = (e) => { if (e.target.id === "sv-scrim") $("#modal-root").innerHTML = ""; };
      return;
    }
    // Already linked: offer a manual sync or disconnect.
    if (S.strava && S.strava.connected) {
      const who = S.strava.athlete ? esc(S.strava.athlete) + "'s Strava" : "Strava";
      $("#modal-root").innerHTML = `
        <div class="modal-scrim" id="sv-scrim"><div class="award" style="text-align:left">
          <button class="room-close" id="sv-close">${closeIco}</button>
          <h2 style="text-align:center">Strava connected</h2>
          <p class="msg" style="text-align:center">${who} is linked. New runs come in automatically when you open the app.</p>
          <button class="btn" id="sv-sync">Sync now</button>
          <button class="btn ghost small" id="sv-disc" style="margin-top:8px">Disconnect Strava</button>
        </div></div>`;
      const close = () => ($("#modal-root").innerHTML = "");
      $("#sv-close").onclick = close;
      $("#sv-scrim").onclick = (e) => { if (e.target.id === "sv-scrim") close(); };
      $("#sv-sync").onclick = () => { close(); syncStrava(true); };
      $("#sv-disc").onclick = () => { disconnectStrava(); close(); };
      return;
    }
    // Not linked yet: hand off to Strava's consent screen via the Worker.
    const ret = location.origin + location.pathname;
    location.href = base + "/login?return=" + encodeURIComponent(ret);
  }

  // Read the ?strava=... the Worker appends when it sends the user back after authorizing.
  function handleStravaReturn() {
    const p = new URLSearchParams(location.search);
    if (p.get("strava")) {
      S.strava = { connected: true, linkId: p.get("strava"), athlete: p.get("athlete") || "", lastSync: 0 };
      touch();
      history.replaceState(null, "", location.pathname);
      toast("Strava connected 🎉");
      setTimeout(() => syncStrava(true), 500);
      return true;
    }
    if (p.get("strava_error")) {
      history.replaceState(null, "", location.pathname);
      toast("Strava connection cancelled");
    }
    return false;
  }

  async function disconnectStrava() {
    const base = stravaBase(), link = S.strava && S.strava.linkId;
    S.strava = null; touch(); render();
    toast("Strava disconnected");
    if (base && link) { try { await fetch(base + "/disconnect?link=" + encodeURIComponent(link)); } catch (_) {} }
  }

  // Pull recent activities from the Worker and fold them into the workout log.
  let stravaSyncing = false;
  async function syncStrava(showToast) {
    const base = stravaBase();
    if (!base || !(S.strava && S.strava.connected) || stravaSyncing) return;
    stravaSyncing = true;
    try {
      // look back from the last sync (or the plan start) so we never miss a run
      const startTs = isoToNum(START) * 86400;
      const after = Math.max(0, (S.strava.lastSync ? S.strava.lastSync - 3 * 86400 : startTs - 86400));
      const res = await fetch(base + "/activities?link=" + encodeURIComponent(S.strava.linkId) + "&after=" + Math.floor(after));
      if (!res.ok) throw new Error("bad");
      const data = await res.json();
      const acts = (data && data.activities) || [];
      let added = 0;
      acts.forEach((a) => {
        const iso = (a.start_date_local || "").slice(0, 10);
        if (!iso || dayIndex[iso] == null) return; // only days inside the plan window
        S.workouts[iso] = S.workouts[iso] || [];
        if (S.workouts[iso].some((w) => w.stravaId === a.id)) return; // already imported
        const minutes = Math.round((a.moving_time || a.elapsed_time || 0) / 60);
        const miles = a.distance ? Math.round((a.distance / 1609.34) * 10) / 10 : 0;
        S.workouts[iso].push({ type: a.type || "Run", minutes, miles, stravaId: a.id, name: a.name || "" });
        onWorkoutsChanged(iso); // a synced run counts as moving that day + feeds the streak
        added++;
      });
      if (S.strava) S.strava.lastSync = Math.floor(Date.now() / 1000);
      touch(); recomputeStreak(); render();
      if (showToast) toast(added ? ("Synced " + added + " run" + (added === 1 ? "" : "s") + " from Strava 🏃") : "Strava is up to date");
    } catch (e) {
      if (showToast) toast("Couldn't reach Strava just now");
    } finally {
      stravaSyncing = false;
    }
  }

  // ---------- plan intake: read an uploaded .xlsx/.xls/.csv into {meta, days} ----------
  // SheetJS is ~950KB, so we only fetch it the moment someone imports an Excel file.
  function loadXLSX() {
    return new Promise((resolve, reject) => {
      if (window.XLSX) return resolve(window.XLSX);
      const s = document.createElement("script");
      s.src = "xlsx.full.min.js";
      s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error("The spreadsheet reader did not load.")));
      s.onerror = () => reject(new Error("Could not load the spreadsheet reader. Check your connection and try again."));
      document.head.appendChild(s);
    });
  }
  // Normalize a Date / Excel serial / string into yyyy-mm-dd (or null if it is not a date).
  function toISO(v) {
    if (v == null) return null;
    if (v instanceof Date && !isNaN(v)) {
      return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
    }
    // Excel stores dates as day-serials. Convert with SheetJS's own parser - it is timezone-free (no off-by-one).
    if (typeof v === "number") {
      if (v > 20000 && v < 80000 && window.XLSX && window.XLSX.SSF && window.XLSX.SSF.parse_date_code) {
        const p = window.XLSX.SSF.parse_date_code(v);
        if (p && p.y) return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
      }
      return null;
    }
    const s = String(v).trim();
    if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/);
    if (m) {
      let a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += 2000;
      let mo = a, da = b; if (a > 12 && b <= 12) { mo = b; da = a; } // dd/mm fallback
      if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
      return `${y}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
    }
    const d = new Date(s);
    if (!isNaN(d) && d.getFullYear() > 2000 && d.getFullYear() < 2100) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    return null;
  }
  // Forgiving CSV parser (handles quoted fields and embedded commas/newlines).
  function parseCSV(text) {
    const rows = []; let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c !== "\r") cur += c;
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  const weekdayOf = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long" }); };
  // Turn a grid of rows (first row = headers) into a {meta, days} plan.
  function buildPlanFromRows(rows, sourceName) {
    rows = (rows || []).filter((r) => r && r.some((c) => String(c).trim() !== ""));
    if (rows.length < 2) throw new Error("That file looks empty. It needs a header row and one row per day.");
    const header = rows[0].map((h) => String(h).trim().toLowerCase());
    const find = (...keys) => header.findIndex((h) => keys.some((k) => h.includes(k)));
    const ci = {
      date: find("date", "day of", "when"),
      week: find("week", "wk"),
      training: find("workout", "training", "activity", "session", "exercise", "run", "plan", "type"),
      miles: find("mile", "distance", "dist"),
      km: find("km", "kilomet"),
      notes: find("note", "description", "detail", "desc", "comment", "focus"),
      phase: find("phase", "block", "cycle"),
    };
    if (ci.date < 0) { // no "date" header: sniff for the column that mostly parses as dates
      let best = -1, bestN = 0;
      for (let c = 0; c < header.length; c++) { let n = 0; for (let r = 1; r < rows.length; r++) if (toISO(rows[r][c])) n++; if (n > bestN) { bestN = n; best = c; } }
      if (bestN >= Math.max(2, (rows.length - 1) * 0.5)) ci.date = best;
    }
    if (ci.date < 0) throw new Error("Could not find a date column. Add a column headed \"Date\" with one date per row.");
    const num = (v) => { const n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.]/g, "")); return isNaN(n) ? 0 : n; };
    let days = [];
    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      const iso = toISO(cells[ci.date]); if (!iso) continue;
      const miles = ci.miles >= 0 ? num(cells[ci.miles]) : (ci.km >= 0 ? num(cells[ci.km]) * 0.621371 : 0);
      days.push({
        date: iso,
        weekRaw: ci.week >= 0 ? parseInt(cells[ci.week], 10) : null,
        phase: ci.phase >= 0 ? String(cells[ci.phase] || "").trim() : "",
        training: ci.training >= 0 ? String(cells[ci.training] || "").trim() : "",
        miles: Math.round(miles * 10) / 10,
        notes: ci.notes >= 0 ? String(cells[ci.notes] || "").trim() : "",
      });
    }
    if (!days.length) throw new Error("No dated rows found. Each day needs a date in the date column.");
    days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const seen = new Set();
    days = days.filter((d) => (seen.has(d.date) ? false : (seen.add(d.date), true)));
    if (days.length > 500) days = days.slice(0, 500); // sanity cap
    const startNum = isoToNum(days[0].date);
    days.forEach((d) => {
      d.week = (d.weekRaw && d.weekRaw > 0) ? d.weekRaw : Math.floor((isoToNum(d.date) - startNum) / 7) + 1;
      d.weekday = weekdayOf(d.date);
      if (!d.training) d.training = "Training";
      delete d.weekRaw;
    });
    const meta = {
      title: "Your plan", source: sourceName,
      startDate: days[0].date, raceDate: days[days.length - 1].date,
      totalDays: days.length, totalWeeks: days[days.length - 1].week,
    };
    return { meta, days };
  }
  async function parsePlanFile(file) {
    const name = file.name || "plan";
    const ext = (name.split(".").pop() || "").toLowerCase();
    let rows;
    if (ext === "csv" || ext === "tsv" || ext === "txt") {
      rows = parseCSV(await file.text());
    } else if (ext === "xlsx" || ext === "xls" || ext === "xlsm" || ext === "ods") {
      const XLSX = await loadXLSX();
      // raw:true keeps date cells as day-serials so toISO() can convert them without timezone drift
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheetName = wb.SheetNames.find((n) => /plan|schedul|daily|calendar|training/i.test(n)) || wb.SheetNames[0];
      rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: "" });
    } else {
      throw new Error("Please upload a .xlsx, .xls, or .csv file. Word or PDF plans cannot be read automatically - export them to Excel or CSV first.");
    }
    return buildPlanFromRows(rows, name);
  }
  function planPreview(p) {
    const sample = p.days.slice(0, 3).map((d) => `<li>${esc(fmtDate(d.date))} - ${esc(d.training)}${d.miles ? ` · ${d.miles} mi` : ""}</li>`).join("");
    return `<div class="plan-preview"><b>Found ${p.days.length} days</b> <span class="tiny muted">(weeks 1-${p.meta.totalWeeks})</span>
      <div class="tiny muted">${esc(fmtDate(p.meta.startDate))} → ${esc(fmtDate(p.meta.raceDate))}</div>
      <ul class="tiny plan-sample">${sample}${p.days.length > 3 ? `<li class="muted">and ${p.days.length - 3} more...</li>` : ""}</ul></div>`;
  }

  // ---------- settings: game mode + rules + plan intake ----------
  function openSettings() {
    const hard = S.mode === "hard";
    const custom = S.customPlan;
    let pendingPlan = null;
    $("#modal-root").innerHTML = `
      <div class="modal-scrim" id="set-scrim"><div class="sheet set-sheet">
        <button class="room-close" id="set-close">${closeIco}</button>
        <h2 style="text-align:center;margin-bottom:12px">Settings</h2>

        <div class="set-sec">
          <div class="set-label">Game mode</div>
          <div class="mode-opt ${!hard ? "sel" : ""}" data-mode="easy">
            <div class="mode-h">🌿 Easy <span class="tiny muted">relaxed</span></div>
            <div class="tiny muted">Bunnies stay forever. No feeding needed. Lettuce is just for fun (toys and accessories).</div>
          </div>
          <div class="mode-opt ${hard ? "sel" : ""}" data-mode="hard">
            <div class="mode-h">🥕 Hard <span class="tiny muted">bunny keeper</span></div>
            <div class="tiny muted">Feed every bunny at least once a week (costs lettuce, which you earn by logging). Neglected bunnies get hungry and wander off, then come back when you feed them.</div>
          </div>
        </div>

        <div class="set-sec">
          <div class="set-label">How to play</div>
          <ul class="rules">
            <li>Check off what you actually did each day on the <b>Today</b> tab. Each thing you log earns you <b>3-5 lettuce</b>.</li>
            <li>You start with <b>3 bunnies</b>. New ones hop in when you do <b>3 workout days in a row</b>.</li>
            <li>Spend <b>lettuce</b> to feed bunnies or buy toys and accessories in the meadow <b>Shop</b> (top right of the meadow).</li>
            <li>Tap a bunny to open its room, rename it, and dress it up. Drag bunnies around the meadow to arrange them.</li>
            <li>The <b>Plan</b> tab holds your training schedule, meal ideas, and fueling. The <b>Food</b> tab is your recipe library where you can add your own.</li>
          </ul>
        </div>

        <div class="set-sec">
          <div class="set-label">Your training plan</div>
          <div class="tiny muted" style="margin-bottom:8px">Currently using: <b>${custom ? esc((custom.meta && custom.meta.source) || "your uploaded plan") : "the Bunny Meadow marathon plan"}</b>${custom ? ` <span class="muted">(${custom.days.length} days)</span>` : ""}.</div>
          <p class="tiny muted" style="margin-bottom:8px">Upload your own plan as <b>Excel</b> (.xlsx) or <b>CSV</b> with one row per day. Include a <b>Date</b> column, plus any of: Week, Workout, Miles, Notes.</p>
          <label class="file-btn" for="plan-file">📄 Choose a plan file</label>
          <input id="plan-file" type="file" accept=".xlsx,.xls,.xlsm,.csv,.tsv,.ods" style="display:none" />
          <div id="plan-status" style="margin-top:10px"></div>
          ${custom ? `<button class="btn ghost small" id="plan-reset" style="margin-top:10px">Reset to Bunny Meadow plan</button>` : ""}
        </div>

        ${googleEnabled() ? `<div class="set-sec">
          <div class="set-label">Account</div>
          ${S.googleUser && S.googleUser.sub
            ? `<div class="tiny muted" style="margin-bottom:8px">Signed in as <b>${esc(S.googleUser.email || S.googleUser.name || "your Google account")}</b>. Your meadow backs up and syncs across your devices automatically.</div>
               <button class="btn ghost small" id="g-signout">Sign out</button>`
            : `<p class="tiny muted" style="margin-bottom:10px">Sign in with Google to back up your meadow and sync it across your phone and laptop. Optional - the app works fine without it, and your data stays private to your account.</p>
               <div id="g-btn"></div>`}
        </div>` : ""}

        <button class="btn" id="set-done" style="margin-top:4px">Done</button>
      </div></div>`;
    const close = () => { $("#modal-root").innerHTML = ""; render(); };
    $("#set-close").onclick = close;
    $("#set-done").onclick = close;
    $("#set-scrim").onclick = (e) => { if (e.target.id === "set-scrim") close(); };
    $("#modal-root").querySelectorAll("[data-mode]").forEach((el) => el.onclick = () => {
      S.mode = el.dataset.mode; touch(); openSettings();
    });
    const resetBtn = $("#plan-reset");
    if (resetBtn) resetBtn.onclick = () => { S.customPlan = null; touch(); applyPlan(); openSettings(); toast("Back to the Bunny Meadow plan"); };
    // Account: render Google's sign-in button, or wire the sign-out
    const gBtn = $("#g-btn"); if (gBtn) renderGoogleButton(gBtn);
    const gOut = $("#g-signout"); if (gOut) gOut.onclick = () => { googleSignOut(); openSettings(); toast("Signed out"); };
    $("#plan-file").onchange = async (e) => {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      const status = $("#plan-status");
      status.innerHTML = `<span class="tiny muted">Reading ${esc(file.name)}...</span>`;
      try {
        pendingPlan = await parsePlanFile(file);
        status.innerHTML = planPreview(pendingPlan) + `<button class="btn" id="plan-apply" style="margin-top:8px">Use this plan</button>`;
        $("#plan-apply").onclick = () => {
          S.customPlan = { meta: pendingPlan.meta, days: pendingPlan.days };
          touch(); applyPlan();
          $("#modal-root").innerHTML = ""; toast("Plan imported 🌿"); planTab = "marathon"; go("plan");
        };
      } catch (err) {
        status.innerHTML = `<span class="tiny plan-err">${esc(err.message || "Could not read that file.")}</span>`;
      }
    };
  }

  // ---------- bunny room (equip accessories) ----------
  function openRoom(id) {
    const b = B.byId[id]; if (!b) return;
    const have = S.collection[id];
    if (!have) return;
    if (!have.room) have.room = { accessory: null };
    if (!have.room.theme) have.room.theme = "cozy";
    const rar = B.RARITY[b.rarity];
    const cur = have.room.accessory;
    const theme = have.room.theme;
    const ownedAccs = B.ACCESSORIES.filter((a) => ownsAcc(a.id));
    render(); // keep meadow/dex fresh underneath
    $("#modal-root").innerHTML = `
      <div class="modal-scrim" id="room-scrim">
        <div class="room-card">
          <button class="room-close" id="room-close" aria-label="Close">${closeIco}</button>
          <div class="room-scene bedroom theme-${theme}">
            ${bedroomDecor()}
            <div class="room-bunny">${B.render(b, 150, { accessory: cur })}</div>
          </div>
          <div class="theme-row">${ROOM_THEMES.map((t) => `<button class="theme-chip theme-${t.id} ${theme === t.id ? "sel" : ""}" data-theme="${t.id}" title="${t.name}"></button>`).join("")}</div>
          <div class="room-info">
            <button class="room-name" data-rename="${id}">${esc(bunnyName(id))} <span class="pencil">✎</span></button>
            <div class="rar" style="background:${rar.color}33;color:${shade(rar.color)}">${rar.label}</div>
            <span class="tiny muted">${esc(b.breed)} · visited ${have.count} time${have.count === 1 ? "" : "s"}</span>
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
    if (fb) fb.onclick = () => {
      if (feed(id)) { feedAnim($("#modal-root .room-bunny")); toast("Fed " + bunnyName(id) + " 🥬"); setTimeout(rerender, 650); }
    };
    const rn = $("#modal-root").querySelector("[data-rename]");
    if (rn) rn.onclick = () => openRename(id, rerender);
    $("#modal-root").querySelectorAll("[data-theme]").forEach((el) => el.onclick = () => { have.room.theme = el.dataset.theme; touch(); rerender(); });
    const sh = $("#modal-root").querySelector("[data-shop]");
    if (sh) sh.onclick = () => openShop(id, "accessories");
  }
  const ROOM_THEMES = [
    { id: "cozy", name: "Cozy" }, { id: "forest", name: "Forest" }, { id: "candy", name: "Candy" },
    { id: "sky", name: "Sky" }, { id: "night", name: "Night" },
  ];
  function bedroomDecor() {
    return `
      <div class="rm-window"><i></i><i></i></div>
      <div class="rm-frame"></div>
      <div class="rm-shelf"><span></span><span></span></div>
      <div class="rm-plant"><b class="pot"></b><b class="leaf a"></b><b class="leaf b"></b><b class="leaf c"></b></div>
      <div class="rm-lamp"><b class="head"></b></div>
      <div class="rm-rug"></div>
      <div class="rm-bed"><b class="pillow"></b></div>
    `;
  }
  function hungerBadge(id) {
    const st = hungerState(id);
    if (st === "hungry") return '<span class="hbadge hungry">Hungry</span>';
    if (st === "wandered") return '<span class="hbadge gone">Wandered off</span>';
    return '<span class="hbadge ok">Content 🥬</span>';
  }
  function openRename(id, cb) {
    const cur = bunnyName(id), b = B.byId[id];
    $("#modal-root").innerHTML = `
      <div class="modal-scrim" id="rn-scrim"><div class="award" style="max-width:300px">
        <div class="art" style="width:90px;height:90px;margin:0 auto">${B.render(b, 90)}</div>
        <h2 style="margin:8px 0 2px">Name your ${esc(b.breed)}</h2>
        <input id="rn-input" class="name-input" value="${esc(cur)}" maxlength="16" />
        <button class="btn" id="rn-save" style="margin-top:12px">Save</button>
      </div></div>`;
    const inp = $("#rn-input"); inp.focus(); inp.select();
    const save = () => { const v = inp.value.trim(); if (v) { (S.collection[id].name = v); touch(); } $("#modal-root").innerHTML = ""; if (cb) cb(); };
    $("#rn-save").onclick = save;
    inp.onkeydown = (e) => { if (e.key === "Enter") save(); };
    $("#rn-scrim").onclick = (e) => { if (e.target.id === "rn-scrim") { $("#modal-root").innerHTML = ""; if (cb) cb(); } };
  }

  // add or edit one of the user's own recipes
  function openRecipeForm(editName) {
    const existing = editName ? (S.userMeals || []).find((m) => m.name === editName) : null;
    const types = ["Breakfast", "Lunch", "Dinner", "Snack", "Fuel"];
    const curType = existing ? existing.type : "Breakfast";
    const ingLines = existing ? (existing.ingredients || []).map((i) => (i.amount ? i.amount + " " : "") + i.item).join("\n") : "";
    const stepLines = existing ? (existing.steps || []).join("\n") : "";
    $("#modal-root").innerHTML = `
      <div class="modal-scrim" id="rf-scrim"><div class="sheet">
        <h2 style="margin:2px 0 10px">${existing ? "Edit recipe" : "Add your own recipe"}</h2>
        <label class="fld"><span>Name</span>
          <input id="rf-name" class="name-input" style="text-align:left" maxlength="48" placeholder="Peanut butter toast" value="${esc(existing ? existing.name : "")}" /></label>
        <label class="fld"><span>Type</span>
          <select id="rf-type" class="rf-select">${types.map((t) => `<option ${t === curType ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label class="fld"><span>Ingredients <em class="tiny muted">one per line</em></span>
          <textarea id="rf-ing" class="rf-area" rows="5" placeholder="2 slices whole grain bread&#10;1 tbsp peanut butter&#10;1/2 banana, sliced">${esc(ingLines)}</textarea></label>
        <label class="fld"><span>Steps <em class="tiny muted">one per line</em></span>
          <textarea id="rf-steps" class="rf-area" rows="5" placeholder="Toast the bread&#10;Spread the peanut butter&#10;Top with banana">${esc(stepLines)}</textarea></label>
        <label class="fld"><span>Why you like it <em class="tiny muted">optional</em></span>
          <input id="rf-why" class="name-input" style="text-align:left" maxlength="90" placeholder="Quick pre-run fuel" value="${esc(existing ? (existing.why || "") : "")}" /></label>
        <div style="display:flex;gap:8px;margin-top:6px">
          <button class="btn ghost" id="rf-cancel" style="flex:1">Cancel</button>
          <button class="btn" id="rf-save" style="flex:2">Save recipe</button>
        </div>
      </div></div>`;
    const close = () => ($("#modal-root").innerHTML = "");
    $("#rf-cancel").onclick = close;
    $("#rf-scrim").onclick = (e) => { if (e.target.id === "rf-scrim") close(); };
    $("#rf-save").onclick = () => {
      const name = $("#rf-name").value.trim();
      if (!name) { $("#rf-name").focus(); return; }
      const ingredients = $("#rf-ing").value.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
        const mt = line.match(/^([\d/.\s]+(?:cups?|tbsp|tsp|oz|g|lb|ml|slices?|cloves?|cans?|scoops?|pieces?)?\.?)\s+(.+)$/i);
        return mt ? { amount: mt[1].trim(), item: mt[2].trim() } : { amount: "", item: line };
      });
      const steps = $("#rf-steps").value.split("\n").map((l) => l.trim()).filter(Boolean);
      const rec = { name, type: $("#rf-type").value, why: $("#rf-why").value.trim(), ingredients, steps, mine: true };
      S.userMeals = S.userMeals || [];
      if (existing) {
        const i = S.userMeals.findIndex((m) => m.name === editName);
        if (i >= 0) S.userMeals[i] = rec;
      } else if (S.userMeals.some((m) => m.name === name) || PLAN.meals.some((m) => m.name === name)) {
        rec.name = name + " (yours)";
        S.userMeals.push(rec);
      } else {
        S.userMeals.push(rec);
      }
      touch(); close(); toast(existing ? "Recipe updated" : "Recipe added"); viewMeal = rec.name; go("meal");
    };
    $("#rf-name").focus();
  }
  // a little "yum" burst over a bunny when fed
  function feedAnim(el) {
    if (!el) return;
    el.classList.remove("wiggle"); void el.offsetWidth; el.classList.add("wiggle");
    const burst = document.createElement("div");
    burst.className = "feed-burst";
    burst.innerHTML = "🥬💚🥬💚🥬".split("").map((c, i) => `<span style="left:${20 + i * 15}%;animation-delay:${i * 0.05}s">${c}</span>`).join("");
    el.appendChild(burst);
    setTimeout(() => burst.remove(), 1000);
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
      if (key === "movement") { openMovement(viewISO); return; } // movement opens the activity editor
      if (MEAL_SLOT_KEYS.includes(key)) { openMealSlot(key, viewISO); return; } // meals open an editor (name + calories)
      const item = itemsFor().find((i) => i.key === key);
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
    // bunny tap -> open its room (dex + today strip). Meadow hoppers use drag below.
    view.querySelectorAll("[data-bunny]:not(.hopper)").forEach((el) => { if (el.dataset.bunny) el.onclick = () => openRoom(el.dataset.bunny); });
    bindMeadowDrag();
    // shop button (meadow HUD)
    view.querySelectorAll("[data-shop]").forEach((el) => el.onclick = () => openShop(null));
    // simple route jumps (back buttons, week chip -> plan, etc.)
    view.querySelectorAll("[data-go]").forEach((el) => el.onclick = () => go(el.dataset.go));
    // meal card -> detail page
    view.querySelectorAll("[data-meal]").forEach((el) => el.onclick = () => go("meal", { meal: el.dataset.meal }));
    // "Add to today" -> pick a meal slot for this recipe
    view.querySelectorAll("[data-add]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); openAddToToday(el.dataset.add); });
    // recipes: add / edit / delete your own
    view.querySelectorAll("[data-recipe-new]").forEach((el) => el.onclick = () => openRecipeForm(null));
    view.querySelectorAll("[data-recipe-edit]").forEach((el) => el.onclick = () => openRecipeForm(el.dataset.recipeEdit));
    view.querySelectorAll("[data-recipe-del]").forEach((el) => el.onclick = () => {
      const name = el.dataset.recipeDel;
      S.userMeals = (S.userMeals || []).filter((x) => x.name !== name);
      touch(); toast("Recipe deleted"); go("food");
    });
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
  }

  // ---------- auth / boot ----------
  function enterApp() {
    $("#lock").classList.add("hide");
    $("#app").classList.remove("hide");
    $("#nav").classList.remove("hide");
    $("#brand-bunny").innerHTML = B.render(B.byId["biscuit"], 30);
    recomputeStreak();
    const justLinked = handleStravaReturn();
    render();
    if (S.googleUser && S.googleUser.sub) setTimeout(silentSync, 600); // pull any changes from another device
    if (!S.starterDone && Object.keys(S.collection).length === 0) setTimeout(openStarter, 350);
    // keep runs fresh: sync on open if linked (and we did not just do it on return)
    else if (!justLinked && S.strava && S.strava.connected) {
      const stale = !S.strava.lastSync || (Date.now() / 1000 - S.strava.lastSync) > 1800;
      if (stale) setTimeout(() => syncStrava(false), 800);
    }
  }
  // First-run: a big celebratory moment - open your first 3 bunnies
  function openStarter() {
    const pool = B.CATALOG.filter((b) => b.rarity === "common" || b.rarity === "uncommon");
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const picks = pool.slice(0, 3);
    $("#modal-root").innerHTML = `
      <div class="modal-scrim" id="st-scrim"><div class="award">
        <div class="spark">✧ ✦ ✧</div>
        <h2 style="margin-top:4px">Welcome to Bunny Meadow!</h2>
        <p class="msg">Your cozy meadow is ready. Open your first three bunnies to begin. Logging your days earns lettuce, and a workout streak brings new bunnies. 🌿</p>
        <div class="starter-gifts">🎁 🎁 🎁</div>
        <button class="btn" id="st-open">Open my bunnies!</button>
      </div></div>`;
    $("#st-open").onclick = () => {
      S.starterDone = true;
      picks.forEach((b) => grant(b, planToday()));
      touch();
      confetti(120);
      flushAwards();
    };
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
    if (res.state && (res.state.updatedAt || 0) >= (S.updatedAt || 0)) { S = migrate(res.state); applyPlan(); saveLocal(); }
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
    // Google sign-in is the front door: show it at launch unless already signed in.
    if (googleEnabled() && !(S.googleUser && S.googleUser.sub)) { showGoogleLogin(); return; }
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
