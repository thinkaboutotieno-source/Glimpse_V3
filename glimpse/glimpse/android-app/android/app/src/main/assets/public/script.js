/* ==========================================================
   Glimpse – an infinite, zoomable wall of photos, 30-second
   videos and quotes. Plain JavaScript, no dependencies.

   Storage:
   - When served by server.js, posts go to the server and every
     visitor sees the same wall.
   - Opened any other way (e.g. as a local file), posts are kept
     in this browser with IndexedDB so you can still try it out.
   ========================================================== */
(() => {
  "use strict";

  /* ---------------------------------------------------------
     1. SETTINGS
     --------------------------------------------------------- */
  const MAX_VIDEO_SECONDS = 30;
  const MAX_VIDEO_MB = 60;
  const MAX_PHOTO_MB = 25;          // before resizing in the browser
  const PHOTO_MAX_PX = 1800;        // long edge of the stored photo
  const THUMB_MAX_PX = 520;         // long edge of the wall thumbnail
  const QUOTE_MAX = 280;
  const POLL_MS = 20000;            // how often to check the server for new posts

  const THOUGHT_MAX = 500;

  // Reactions people can leave on thoughts (one per person per thought)
  const REACTIONS = [
    { id: "love",   emoji: "❤️", label: "Love" },
    { id: "hug",    emoji: "🤗", label: "Hug" },
    { id: "haha",   emoji: "😂", label: "Haha" },
    { id: "wow",    emoji: "😮", label: "Wow" },
    { id: "sad",    emoji: "😢", label: "Sad" },
    { id: "relate", emoji: "🙌", label: "Same here" },
  ];

  // Note colours for thoughts
  const TINTS = [
    { id: "cream", label: "Cream", color: "#fbf3d5" },
    { id: "mint",  label: "Mint",  color: "#d6f0e0" },
    { id: "sky",   label: "Sky",   color: "#d9e7fa" },
    { id: "blush", label: "Blush", color: "#fadde1" },
  ];

  const SAMPLE_THOUGHTS = [
    ["Moved to a new city three months ago. Today the guy at the coffee stand knew my order. Small thing, felt huge.", "Wanjiru", "mint", { love: 9, hug: 4, relate: 6 }],
    ["Does anyone else rehearse conversations in the shower that never end up happening?", "Anonymous", "cream", { haha: 14, relate: 21 }],
    ["Finished my first 10K this morning. A year ago I couldn't run to the bus stop.", "Otieno", "sky", { love: 12, wow: 5 }],
    ["Missing my grandmother's cooking today. Trying her recipe tonight and I'll probably get it wrong.", "Anonymous", "blush", { hug: 11, sad: 3, love: 7 }],
  ];

  // A question of the day, the same for everyone (rotates daily)
  const PROMPTS = [
    "What made you smile this week?", "What's a small thing you're grateful for today?", "What song is stuck in your head?",
    "Describe your perfect Sunday.", "What's the best advice you've ever been given?", "What are you looking forward to?",
    "What's something new you learned recently?", "Who made a difference to you this year?", "What does home smell like?",
    "What's your favourite place in your city?", "If today had a colour, what would it be?", "What would you tell your younger self?",
    "What's a dream you haven't told anyone?", "What's the kindest thing a stranger did for you?", "What are you proud of this month?",
    "What's your comfort food?", "Where would you go if you could leave tomorrow?", "What made you laugh out loud recently?",
    "What's a skill you'd love to learn?", "What does a good day look like for you?", "Which book or film changed how you see things?",
    "What's something you've changed your mind about?", "What tradition do you love?", "What's the view from your window right now?",
    "Who would you love to have dinner with?", "What's a sound that makes you happy?", "What's a goal you're working toward?",
    "What's the best thing about where you grew up?", "What are you letting go of?", "What tiny moment felt huge?",
    "What do you wish more people knew?", "What's your favourite way to rest?", "What's a risk you're glad you took?",
    "What's on your mind tonight?", "What season are you in, in life?", "What would make tomorrow great?",
    "What's something beautiful you saw today?", "What's a memory that always makes you smile?", "Who taught you something important?",
    "What do you do when you need courage?", "What's a promise you made to yourself?", "What's your favourite word, and why?",
    "What are you curious about lately?", "What would your theme song be?", "What's the best gift you've ever given?",
    "What did you used to believe as a child?", "What are you saying yes to this year?", "What's a place that feels like a hug?",
    "What's one thing you'd put in a time capsule?", "What's a question you'd ask the future?", "What's your secret talent?",
    "What did today teach you?", "Which moment would you relive?", "What's the bravest thing you've done?",
    "What do you love about your friends?", "What would you name a star?", "What makes your city special?",
    "What's something you made with your hands?", "What do you hope people say about you?", "What are you hopeful about?",
  ];
  // Where a post comes from: the city of the device's time zone (never GPS)
  const SOUTH_AMERICA = /^America\/(Argentina|Sao_Paulo|Buenos_Aires|Lima|Bogota|Santiago|Caracas|Montevideo|La_Paz|Asuncion|Guayaquil|Cayenne|Paramaribo|Guyana|Belem|Fortaleza|Recife|Manaus|Bahia|Cuiaba|Campo_Grande|Porto_Velho|Boa_Vista|Rio_Branco|Maceio|Araguaina|Santarem|Noronha|Punta_Arenas)/;
  function placeFromTz(tz) {
    tz = String(tz || "");
    if (tz.length > 64 || !/^[A-Za-z]+\/[A-Za-z0-9_\-+/]+$/.test(tz)) return null;
    const [area, ...rest] = tz.split("/");
    let region = { Africa: "Africa", Europe: "Europe", Asia: "Asia", Australia: "Oceania", Pacific: "Oceania", Antarctica: "Antarctica", Atlantic: "Europe", Indian: "Africa", Arctic: "Europe" }[area];
    if (area === "America") region = SOUTH_AMERICA.test(tz) ? "South America" : "North America";
    if (area === "Indian" && /Maldives|Chagos|Christmas|Cocos/.test(tz)) region = "Asia";
    if (area === "Atlantic" && /Bermuda/.test(tz)) region = "North America";
    if (area === "Atlantic" && /Stanley|South_Georgia/.test(tz)) region = "South America";
    if (area === "Atlantic" && /Cape_Verde|St_Helena/.test(tz)) region = "Africa";
    return region ? { region, city: rest[rest.length - 1].replace(/_/g, " ").slice(0, 40) } : null;
  }
  const MY_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (_) { return ""; } })();
  const MY_PLACE = placeFromTz(MY_TZ);

  const dayIndex = () => { const d = new Date(); return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 864e5); };
  const todayPrompt = () => ((dayIndex() % PROMPTS.length) + PROMPTS.length) % PROMPTS.length;

  const QUOTE_STYLES = [
    { id: "ink",   label: "Ink" },
    { id: "paper", label: "Paper" },
    { id: "sun",   label: "Sun" },
    { id: "bloom", label: "Bloom" },
  ];

  // Starter quotes for the browser-only preview (the server seeds its own copy).
  const SAMPLE_QUOTES = [
    ["We suffer more often in imagination than in reality.", "Seneca", "ink"],
    ["If you want to go fast, go alone. If you want to go far, go together.", "African proverb", "sun"],
    ["Do what you can, with what you have, where you are.", "Theodore Roosevelt", "paper"],
    ["Go confidently in the direction of your dreams.", "Henry David Thoreau", "bloom"],
    ["Nothing great was ever achieved without enthusiasm.", "Ralph Waldo Emerson", "sun"],
    ["Waste no more time arguing what a good person should be. Be one.", "Marcus Aurelius", "ink"],
    ["Little by little, one travels far.", "Proverb", "bloom"],
    ["Until the lion learns to write, tales of the hunt will glorify the hunter.", "African proverb", "paper"],
    ["The best way out is always through.", "Robert Frost", "ink"],
    ["Rest is not idleness.", "John Lubbock", "paper"],
    ["Simplicity is the ultimate sophistication.", "Attributed to Leonardo da Vinci", "sun"],
    ["Wherever you go, go with all your heart.", "Confucius", "bloom"],
  ];

  /* ---------------------------------------------------------
     2. HELPERS
     --------------------------------------------------------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const mod = (n, m) => ((n % m) + m) % m;
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const prefersReduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let calm = (() => { try { return JSON.parse(localStorage.getItem("glimpse:calm")) === true; } catch (_) { return false; } })();
  let reduceMotion = prefersReduced || calm;     // calm mode (in the theme menu) turns motion down too
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  // Always escape user content before putting it into HTML.
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const ls = {
    get(k, fallback) { try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch (_) { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  };

  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const fmtDur = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  function timeAgo(ts) {
    const sec = (ts - Date.now()) / 1000;
    const steps = [[60, "second"], [3600, "minute"], [86400, "hour"], [604800, "day"], [2629800, "week"], [31557600, "month"], [Infinity, "year"]];
    const div = [1, 60, 3600, 86400, 604800, 2629800, 31557600];
    for (let i = 0; i < steps.length; i++) {
      if (Math.abs(sec) < steps[i][0]) return rtf.format(Math.round(sec / div[i]), steps[i][1]);
    }
  }

  // Timestamps: compact ("3h ago"), full ("7 Oct 2026, 14:32") and futuristic ("2026.10.07 14:32")
  function shortAgo(ts) {
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
    const d = new Date(ts), sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString("en", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
  }
  function durationWords(ms) {
    const m = Math.max(1, Math.round(ms / 60000)), h = Math.round(ms / 3600000), d = Math.round(ms / 86400000);
    if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
    if (h < 48) return `${h} hour${h === 1 ? "" : "s"}`;
    return `${d} days`;
  }
  const fullDate = ts => new Date(ts).toLocaleString("en", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const pad2 = n => String(n).padStart(2, "0");
  function neoDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function stampHTML(p) {
    const ts = p.createdAt || Date.now();
    return `<time class="stamp" datetime="${new Date(ts).toISOString()}" data-ts="${ts}" title="${esc(fullDate(ts))}"><span class="stamp__rel">${shortAgo(ts)}</span><span class="stamp__abs">${neoDate(ts)}</span></time>`;
  }
  // Keep "5m ago" labels fresh
  setInterval(() => {
    document.querySelectorAll(".stamp[data-ts]").forEach(el => { el.firstChild.textContent = shortAgo(+el.dataset.ts); });
  }, 60000);

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2400);
  }

  /* ---------------------------------------------------------
     3. STORAGE
     Both stores expose: list(), create(data, onProgress),
     like(id, delta), remove(id, token)
     --------------------------------------------------------- */
  // Where the server lives. Empty = same site (the website). The Android app sets
  // this in config.js to your server's https address.
  const API = String(window.GLIMPSE_CONFIG?.apiBase || "").replace(/\/+$/, "");
  const IN_APP = !!window.Capacitor?.isNativePlatform?.();
  // Media links come back as "/uploads/…"; point them at the server when it's elsewhere
  const absolute = p => {
    if (!API) return p;
    for (const k of ["url", "thumb", "og"]) if (typeof p[k] === "string" && p[k].startsWith("/")) p[k] = API + p[k];
    return p;
  };
  // Which wall we're on: /w/<slug> on the website (remembered in the app). "" = the public wall.
  let WALL = (location.pathname.match(/^\/w\/([a-z0-9-]{2,24})\/?$/) || [])[1] || (IN_APP ? ls.get("glimpse:currentWall", "") : "");
  const wallQS = () => (WALL ? `?wall=${encodeURIComponent(WALL)}` : "");
  // Links people can share (the website address, even from inside the app)
  const SHARE_ORIGIN = API || (location.protocol.startsWith("http") ? location.origin : "");
  const jsonFetch = async (url, opts = {}, fallback = "Something went wrong. Try again.") => {
    const r = await fetch(url, opts);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || fallback);
    return body;
  };
  // Every server call says which device is asking (needed for friends-only posts)
  const devHeaders = (h = {}) => ({ ...h, "X-Device-Id": ls.get("glimpse:device", "") || "" });
  const postJSON = (url, data) => ({ method: "POST", headers: devHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(data) });

  const ServerStore = {
    mode: "server",
    async list() {
      const r = await fetch(`${API}/api/posts${wallQS()}`, { headers: devHeaders({ Accept: "application/json" }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't load the wall.");
      return (await r.json()).map(absolute);
    },
    async get(id) { return absolute(await jsonFetch(`${API}/api/posts/${encodeURIComponent(id)}`, { headers: devHeaders() }, "This post isn't available any more.")); },
    create(data, onProgress) {
      return new Promise((resolve, reject) => {
        const fd = new FormData();
        for (const k of ["type", "author", "caption", "text", "quoteBy", "style", "tint", "width", "height", "duration", "opensAt", "clipStart", "clipEnd", "peaks", "prompt", "audience", "tz", "night", "ink", "remixOf"]) {
          if (data[k] !== undefined && data[k] !== null) fd.append(k, data[k]);
        }
        fd.append("agreed", "1");
        fd.append("deviceId", deviceId);
        if (data.media) fd.append("media", data.media, data.mediaName || "media");
        if (data.thumb) fd.append("thumb", data.thumb, "thumb.jpg");
        if (data.og) fd.append("og", data.og, "og.jpg");
        if (WALL) fd.append("wall", WALL);
        const x = new XMLHttpRequest();
        x.open("POST", `${API}/api/posts`);
        x.setRequestHeader("X-Device-Id", deviceId);
        x.upload.onprogress = e => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
        x.onload = () => {
          let body = {};
          try { body = JSON.parse(x.responseText); } catch (_) {}
          if (x.status >= 200 && x.status < 300) { if (body.post) absolute(body.post); resolve(body); }
          else if (body.error) reject(new Error(body.error));
          else if (x.status === 413) reject(new Error("The server says this file is too large. If you host the site behind a proxy (e.g. nginx), raise its upload limit to at least 60 MB."));
          else if (x.status === 404 || x.status === 405) reject(new Error("The upload address wasn't found. Start the site with “npm start” and open the address it prints, rather than opening index.html directly."));
          else reject(new Error(`Upload failed (error ${x.status}). Try again.`));
        };
        x.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
        x.send(fd);
      });
    },
    async like(id, delta) {
      const r = await fetch(`${API}/api/posts/${encodeURIComponent(id)}/like`, {
        method: "POST", headers: devHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ delta }),
      });
      if (!r.ok) throw new Error("Couldn't save your like.");
      return (await r.json()).likes;
    },
    async react(id, add, remove) {
      const r = await fetch(`${API}/api/posts/${encodeURIComponent(id)}/react`, {
        method: "POST", headers: devHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ add, remove }),
      });
      if (!r.ok) throw new Error("Couldn't save your reaction.");
      return (await r.json()).reactions;
    },
    async report(id, reason, note) {
      const r = await fetch(`${API}/api/posts/${encodeURIComponent(id)}/report`, {
        method: "POST", headers: devHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ reason, note, deviceId }),
      });
      if (!r.ok) throw new Error("Couldn't send the report. Try again.");
    },
    async remove(id, token) {
      const headers = { "X-Delete-Token": token || "" };
      if (wallHostToken()) headers["X-Wall-Token"] = wallHostToken();
      const r = await fetch(`${API}/api/posts/${encodeURIComponent(id)}`, { method: "DELETE", headers });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't delete this post.");
    },
    // Replies on thoughts
    async replies(id) { return jsonFetch(`${API}/api/posts/${encodeURIComponent(id)}/replies`, { headers: devHeaders() }, "Couldn't load the replies."); },
    async addReply(id, text, author) {
      return jsonFetch(`${API}/api/posts/${encodeURIComponent(id)}/replies`, postJSON(null, { text, author, agreed: "1", deviceId }), "Couldn't send your reply.");
    },
    async removeReply(id, rid, token) {
      const headers = { "X-Delete-Token": token || "" };
      if (wallHostToken()) headers["X-Wall-Token"] = wallHostToken();
      const r = await fetch(`${API}/api/posts/${encodeURIComponent(id)}/replies/${encodeURIComponent(rid)}`, { method: "DELETE", headers });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't delete this reply.");
    },
    async reportReply(id, rid, reason, note) {
      await jsonFetch(`${API}/api/posts/${encodeURIComponent(id)}/replies/${encodeURIComponent(rid)}/report`, postJSON(null, { reason, note, deviceId }), "Couldn't send the report.");
    },
    // Private walls
    async wallInfo(slug) { return jsonFetch(`${API}/api/walls/${encodeURIComponent(slug)}`, {}, "That wall doesn't exist (check the link)."); },
    // The Void (deleted posts, for 30 days)
    async voidList() {
      return (await jsonFetch(`${API}/api/void`, { headers: devHeaders({ "X-Delete-Tokens": Object.values(state.tokens).join(",") }) }, "Couldn't open The Void.")).map(absolute);
    },
    async restore(id) {
      const r = await jsonFetch(`${API}/api/void/${encodeURIComponent(id)}/restore`, { method: "POST", headers: devHeaders({ "X-Delete-Tokens": Object.values(state.tokens).join(",") }) }, "Couldn't bring it back.");
      return absolute(r.post);
    },
    async erase(id) {
      const r = await fetch(`${API}/api/void/${encodeURIComponent(id)}`, { method: "DELETE", headers: devHeaders({ "X-Delete-Tokens": Object.values(state.tokens).join(",") }) });
      if (!r.ok) throw new Error("Couldn't erase it.");
    },
    // Channels, portals, comets, translation
    async channels() { return jsonFetch(`${API}/api/channels`, {}, "Couldn't load the channels."); },
    async createChannel(name, emoji, description, theme) { return jsonFetch(`${API}/api/channels`, postJSON(null, { name, emoji, description, theme, agreed: "1", deviceId }), "Couldn't create the channel."); },
    async portalKey(slug) { return jsonFetch(`${API}/api/walls/${encodeURIComponent(slug)}/portal-key`, { method: "POST", headers: devHeaders({ "X-Wall-Token": wallHostToken() || "" }) }, "Couldn't make a portal key."); },
    async openPortal(slug, to, key) { return jsonFetch(`${API}/api/walls/${encodeURIComponent(slug)}/portals`, { method: "POST", headers: devHeaders({ "Content-Type": "application/json", "X-Wall-Token": wallHostToken() || "" }), body: JSON.stringify({ to, key }) }, "Couldn't open the portal."); },
    async closePortal(slug, other) { const r = await fetch(`${API}/api/walls/${encodeURIComponent(slug)}/portals/${encodeURIComponent(other)}`, { method: "DELETE", headers: devHeaders({ "X-Wall-Token": wallHostToken() || "" }) }); if (!r.ok) throw new Error("Couldn't close the portal."); },
    async sendComet(text, replyTo) { return jsonFetch(`${API}/api/comets`, postJSON(null, { text, replyTo, tz: $("#placeToggle")?.checked === false ? "" : MY_TZ, agreed: "1" }), "Couldn't launch your comet."); },
    async reportComet(id) { return jsonFetch(`${API}/api/comets/${encodeURIComponent(id)}/report`, postJSON(null, {}), "Couldn't report it."); },
    async translate(text, target) { return jsonFetch(`${API}/api/translate`, postJSON(null, { text, target }), "Couldn't translate that."); },
    // Graffiti hour and badges
    async graffiti() { return jsonFetch(`${API}/api/graffiti${wallQS()}`, { headers: devHeaders() }, "Couldn't open the graffiti wall."); },
    async stroke(st) { return jsonFetch(`${API}/api/graffiti/stroke${wallQS()}`, postJSON(null, { ...st, deviceId }), "That stroke didn't make it."); },
    async setBadges(badges) { return jsonFetch(`${API}/api/me`, postJSON(null, { badges }), "Couldn't save your badges."); },
    // Friends
    async me() { return jsonFetch(`${API}/api/me`, { headers: devHeaders() }, "Couldn't load your friends."); },
    async setName(name) { return jsonFetch(`${API}/api/me`, postJSON(null, { name }), "Couldn't save your name."); },
    async friend(action, code, extra = {}) { return jsonFetch(`${API}/api/friends/${action}`, postJSON(null, { code, ...extra }), "Couldn't update your friends."); },
    async newInvite() { return jsonFetch(`${API}/api/friends-invite`, postJSON(null, {}), "Couldn't make an invite link."); },
    async inviteInfo(code, k) { return jsonFetch(`${API}/api/friends-invite/${encodeURIComponent(code)}?k=${encodeURIComponent(k)}`, {}, "This invite link has expired."); },
    async createWall(name, theme) { return jsonFetch(`${API}/api/walls`, postJSON(null, { name, theme, agreed: "1", deviceId }), "Couldn't create the wall."); },
  };

  const LocalStore = {
    mode: "local",
    db: null,
    mem: new Map(),      // fallback if IndexedDB is unavailable
    urls: new Map(),

    async open() {
      try {
        this.db = await new Promise((res, rej) => {
          const r = indexedDB.open("glimpse", 1);
          r.onupgradeneeded = () => r.result.createObjectStore("posts", { keyPath: "id" });
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
      } catch (_) { this.db = null; }
      if (!ls.get("glimpse:seeded", false) || (!this.db && !this.mem.size)) {
        const now = Date.now();
        for (const [i, [text, by, style]] of SAMPLE_QUOTES.entries()) {
          await this._put({ id: "sample-" + i, type: "quote", author: "Glimpse", text, quoteBy: by, style, likes: 3 + ((i * 7) % 20), createdAt: now - (i + 1) * 2.4 * 864e5 });
        }
        ls.set("glimpse:seeded", true);
      }
      if (!ls.get("glimpse:seeded-thoughts", false) || (!this.db && ![...this.mem.values()].some(p => p.type === "thought"))) {
        const now = Date.now();
        for (const [i, [text, author, tint, reactions]] of SAMPLE_THOUGHTS.entries()) {
          await this._put({ id: "sample-thought-" + i, type: "thought", author, text, tint, reactions, likes: 0, createdAt: now - [0.15, 1.6, 4, 11][i] * 864e5 });
        }
        ls.set("glimpse:seeded-thoughts", true);
      }
    },
    _req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
    _os(mode) { return this.db.transaction("posts", mode).objectStore("posts"); },
    async _put(p) { if (this.db) await this._req(this._os("readwrite").put(p)); else this.mem.set(p.id, p); },
    async _get(id) { return this.db ? this._req(this._os("readonly").get(id)) : this.mem.get(id); },
    async _all() { return this.db ? this._req(this._os("readonly").getAll()) : [...this.mem.values()]; },
    async _del(id) { if (this.db) await this._req(this._os("readwrite").delete(id)); else this.mem.delete(id); },
    _url(key, blob) { if (!this.urls.has(key)) this.urls.set(key, URL.createObjectURL(blob)); return this.urls.get(key); },
    _view(p) {
      const { mediaBlob, thumbBlob, ...v } = p;
      if (mediaBlob) v.url = this._url(p.id + ":m", mediaBlob);
      if (thumbBlob) v.thumb = this._url(p.id + ":t", thumbBlob);
      return sealView(v);
    },

    async list() {
      return (await this._all()).filter(p => !p.voidedAt).sort((a, b) => b.createdAt - a.createdAt).map(p => this._view(p));
    },
    async create(d, onProgress) {
      const p = {
        id: uid(), type: d.type, author: d.author || "Anonymous", caption: d.caption || "",
        text: d.text, quoteBy: d.quoteBy, style: d.style, tint: d.tint, opensAt: d.opensAt || undefined,
        reactions: d.type === "thought" ? {} : undefined,
        width: d.width, height: d.height, duration: d.duration,
        clip: d.clipEnd !== undefined ? [d.clipStart, d.clipEnd] : undefined,
        peaks: d.peaks ? JSON.parse(d.peaks) : undefined,
        prompt: d.prompt !== undefined ? Number(d.prompt) : undefined,
        ...(placeFromTz(d.tz) || {}),
        likes: 0, createdAt: Date.now(), mediaBlob: d.media, thumbBlob: d.thumb,
      };
      await this._put(p);
      onProgress?.(1);
      return { post: this._view(p), deleteToken: "local" };
    },
    async like(id, delta) {
      const p = await this._get(id);
      if (!p) return 0;
      p.likes = Math.max(0, (p.likes || 0) + delta);
      await this._put(p);
      return p.likes;
    },
    async react(id, add, remove) {
      const p = await this._get(id);
      if (!p) return {};
      p.reactions = p.reactions || {};
      if (remove) p.reactions[remove] = Math.max(0, (p.reactions[remove] || 0) - 1);
      if (add) p.reactions[add] = (p.reactions[add] || 0) + 1;
      await this._put(p);
      return p.reactions;
    },
    async report() { /* browser-only mode: nothing to send, the post is just hidden here */ },
    async get(id) { const p = await this._get(id); if (!p) throw new Error("This post isn't available any more."); return this._view(p); },
    async replies(id) { const p = await this._get(id); return (p?.replies || []).slice(); },
    async addReply(id, text, author) {
      const p = await this._get(id);
      const reply = { id: uid(), author: author || "Anonymous", text, createdAt: Date.now() };
      p.replies = [...(p.replies || []), reply];
      p.replyCount = p.replies.length;
      await this._put(p);
      return { reply, deleteToken: "local" };
    },
    async removeReply(id, rid) {
      const p = await this._get(id);
      p.replies = (p.replies || []).filter(r => r.id !== rid);
      p.replyCount = p.replies.length;
      await this._put(p);
    },
    async reportReply() {},
    async wallInfo() { throw new Error("Private walls need the server. Run Glimpse with “npm start”."); },
    async createWall() { throw new Error("Private walls need the server. Run Glimpse with “npm start”."); },
    async remove(id) {                                    // into The Void, not gone yet
      const p = await this._get(id);
      if (p) { p.voidedAt = Date.now(); await this._put(p); }
    },
    async voidList() {
      const all = await this._all(), cutoff = Date.now() - 30 * 864e5;
      for (const p of all.filter(p => p.voidedAt && p.voidedAt < cutoff)) await this.erase(p.id);
      return all.filter(p => p.voidedAt && p.voidedAt >= cutoff).sort((a, b) => b.voidedAt - a.voidedAt)
        .map(p => ({ ...this._view({ ...p, opensAt: undefined }), voidedAt: p.voidedAt, erasesAt: p.voidedAt + 30 * 864e5 }));
    },
    async restore(id) { const p = await this._get(id); delete p.voidedAt; await this._put(p); return this._view(p); },
    async erase(id) {
      await this._del(id);
      for (const k of [id + ":m", id + ":t"]) {
        if (this.urls.has(k)) { URL.revokeObjectURL(this.urls.get(k)); this.urls.delete(k); }
      }
    },
  };

  async function pickStore() {
    if (API || location.protocol.startsWith("http")) {
      try {
        const r = await fetch(`${API}/api/posts`, { headers: { Accept: "application/json" } });
        if (r.ok && (r.headers.get("content-type") || "").includes("json")) return ServerStore;
      } catch (_) {}
    }
    await LocalStore.open();
    return LocalStore;
  }

  /* ---------------------------------------------------------
     4. STATE
     --------------------------------------------------------- */
  let store = null;
  const state = {
    posts: [],
    type: "all",
    query: "",
    when: "all",          // "all" | "past" | "new"
    until: null,          // timeline slider: only show posts made before this moment
    cutoff: 0,            // the line between past and new
    tokens: ls.get("glimpse:tokens", {}),   // delete tokens for posts made in this browser
    liked: new Set(ls.get("glimpse:liked", [])),
    reacted: ls.get("glimpse:reacted", {}),  // postId -> reaction id chosen in this browser
    hiddenIds: new Set(ls.get("glimpse:hiddenPosts", [])),   // posts this person reported
    blocked: new Set(ls.get("glimpse:blocked", [])),         // people this person blocked
  };
  const postById = id => state.posts.find(p => p.id === id);

  /* ---------------------------------------------------------
     5. CARD MARKUP
     --------------------------------------------------------- */
  function quoteSize(text) {
    const n = text.length;
    return n < 40 ? "xl" : n < 90 ? "l" : n < 170 ? "m" : "s";
  }
  function quoteHTML(p) {
    const style = QUOTE_STYLES.some(s => s.id === p.style) ? p.style : "ink";
    const by = p.quoteBy || p.author;
    return `<div class="quote quote--${style} quote--${quoteSize(p.text || "")}">
      <blockquote>${esc(p.text)}</blockquote>
      <div class="quote__foot">${by ? `<cite>${esc(by)}</cite>` : "<span></span>"}${stampHTML(p)}</div>
    </div>`;
  }
  // Thoughts: a personal note with the poster's initial and a reaction summary
  const hashOf = str => [...String(str)].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 7);
  const initialOf = name => (!name || name === "Anonymous") ? "?" : [...name.trim()][0].toUpperCase();
  function reactSummary(p) {
    const r = p.reactions || {};
    const total = REACTIONS.reduce((n, x) => n + (r[x.id] || 0), 0);
    if (!total) return `<span class="thought__hint">React</span>`;
    const top = REACTIONS.filter(x => r[x.id] > 0).sort((a, b) => r[b.id] - r[a.id]).slice(0, 3);
    return `<span class="thought__emoji">${top.map(x => x.emoji).join("")}</span><span>${total}</span>`;
  }
  function thoughtHTML(p) {
    const tint = TINTS.some(t => t.id === p.tint) ? p.tint : "cream";
    const n = (p.text || "").length;
    const size = n < 70 ? "xl" : n < 160 ? "l" : n < 300 ? "m" : "s";
    const name = p.author || "Anonymous";
    const h = hashOf(p.id || name);
    const tilt = ((h % 7) - 3) * 0.6;          // a slight, stable tilt per note
    return `<div class="thought thought--${tint} thought--${size}" style="--tilt:${tilt}deg">
      <span class="thought__pin" aria-hidden="true"></span>
      <div class="thought__who"><span class="avatar" style="--hue:${hashOf(name) % 360}">${esc(initialOf(name))}</span><strong>${esc(name)}</strong>${stampHTML(p)}</div>
      ${Number.isInteger(p.prompt) && PROMPTS[p.prompt] ? `<p class="thought__prompt">↳ ${esc(PROMPTS[p.prompt])}</p>` : ""}
      ${p.ink ? `<img class="thought__ink" src="${inkImage(p.id, p.ink.strokes, 400, 400)}" alt="${esc(p.text || "A handwritten note")}">` : `<p class="thought__text">${esc(p.text)}</p>`}
      <div class="thought__reacts">${reactSummary(p)}${p.replyCount ? `<span class="thought__replies">💬 ${p.replyCount}</span>` : ""}</div>
    </div>`;
  }
  // Voice notes: a waveform you can see from across the wall
  function wavePeaks(p, n = 40) {
    const src = Array.isArray(p.peaks) && p.peaks.length ? p.peaks : Array.from({ length: n }, (_, i) => 0.3 + 0.5 * Math.abs(Math.sin(i * 0.7 + hashOf(p.id || "") % 7)));
    return Array.from({ length: n }, (_, i) => Math.max(0.06, src[Math.floor((i / n) * src.length)] || 0));
  }
  function voiceHTML(p) {
    const hue = hashOf(p.author || p.id || "") % 360;
    return `<div class="voice" style="--vh:${hue}">
      <div class="voice__top"><span class="voice__mic" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/></svg></span><span class="voice__dur">${fmtDur(p.duration || 0)}</span></div>
      <div class="voice__wave" aria-hidden="true">${wavePeaks(p).map(v => `<i style="--v:${v.toFixed(2)}"></i>`).join("")}</div>
      ${p.caption ? `<p class="voice__caption">${esc(p.caption)}</p>` : ""}
      <p class="voice__by">${esc(p.author || "Anonymous")} · ${stampHTML(p)}</p>
    </div>`;
  }
  const clipLength = p => (p.clip ? p.clip[1] - p.clip[0] : p.duration || 0);

  function cardHTML(p) {
    if (p.sealed) return capsuleHTML(p);
    if (p.type === "thought") return thoughtHTML(p);
    if (p.type === "quote") return quoteHTML(p);
    if (p.type === "voice") return voiceHTML(p);
    if (p.type === "mural") return `<div class="mural"><img src="${inkImage(p.id, p.strokes, 480, 300, { bg: "#0b0b14", neon: true })}" alt="A graffiti mural painted together by ${p.artists || "many"} people"><p class="mural__by">🎨 Graffiti hour · ${p.artists || "many"} artist${p.artists === 1 ? "" : "s"} · ${stampHTML(p)}</p></div>`;
    const badge = p.type === "video"
      ? `<span class="card__badge"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5z"/></svg>${fmtDur(clipLength(p))}</span>` : "";
    const caption = p.caption
      ? `<span class="card__caption"><strong>${esc(p.caption)}</strong><span>${esc(p.author)} · ${stampHTML(p)}</span></span>`
      : `<span class="card__caption card__caption--slim"><span>${esc(p.author)} · ${stampHTML(p)}</span></span>`;
    return `<img class="card__img" src="${esc(p.thumb)}" alt="" draggable="false" decoding="async">${badge}${caption}`;
  }
  // Museum-style wall label, shown in the gallery theme
  const QUOTE_MEDIUM = { ink: "Ink on paper", paper: "Letterpress", sun: "Screen print", bloom: "Risograph" };
  const isNova = p => p.supernovaUntil > Date.now();
  const cardContent = p => cardHTML(p) + placardHTML(p)
    + (isNova(p) ? `<span class="card__nova" aria-hidden="true"></span>` : "")
    + (p.night ? `<span class="card__night" title="After dark only" aria-hidden="true">🌙</span>` : "")
    + `<span class="card__glare" aria-hidden="true"></span>`
    + (p.audience === "friends" ? `<span class="card__friends" title="Friends only" aria-hidden="true">👥</span>` : "")
    + (p.wall && p.wall !== WALL && p.wallName ? `<span class="card__portal" title="Through a portal from ${esc(p.wallName)}" aria-hidden="true">🌀</span>` : "")
    + (p.type === "thought" && p.replyCount ? `<span class="moons" aria-hidden="true">${Array.from({ length: Math.min(5, p.replyCount) }, (_, i) => `<i style="--i:${i}"></i>`).join("")}</span>` : "");
  function placardHTML(p) {
    if (p.type === "thought" && !p.sealed) return "";       // notes are pinned straight to the wall
    const year = new Date(p.createdAt).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
    if (p.sealed) {
      return `<span class="placard" aria-hidden="true">
        <strong>${esc(p.author)}</strong>
        <em>Time capsule</em>, sealed ${year}
        <span>Opens ${fullDate(p.opensAt)}</span>
      </span>`;
    }
    if (p.type === "quote") {
      return `<span class="placard" aria-hidden="true">
        <strong>${esc(p.quoteBy || p.author)}</strong>
        <em>Quotation</em>, ${year}
        <span>${QUOTE_MEDIUM[p.style] || "Ink on paper"}${p.quoteBy ? ` · Shared by ${esc(p.author)}` : ""}</span>
      </span>`;
    }
    const medium = p.type === "video" ? `Moving image, ${fmtDur(clipLength(p))}` : p.type === "voice" ? `Sound recording, ${fmtDur(p.duration || 0)}` : "Photograph";
    return `<span class="placard" aria-hidden="true">
      <strong>${esc(p.author)}</strong>
      <em>${esc(p.caption || "Untitled")}</em>, ${year}
      <span>${medium}</span>
    </span>`;
  }

  function aspect(p) {
    if (p.sealed) return 1.2;
    if (p.type === "quote") return 1.15;
    if (p.type === "voice") return p.caption ? 1.05 : 0.9;
    if (p.type === "mural") return 0.72;
    if (p.type === "thought" && p.ink) return 1.12;
    if (p.type === "thought") { const n = (p.text || "").length; return n < 120 ? 0.85 : n < 260 ? 1.05 : 1.3; }
    if (p.width && p.height) return clamp(p.height / p.width, 0.62, 1.6);
    return 1.25;
  }
  function label(p) {
    if (p.sealed) return `Time capsule from ${p.author}, opens ${fullDate(p.opensAt)}`;
    if (p.type === "mural") return `Graffiti mural painted together by ${p.artists || "many"} people`;
    if (p.type === "thought" && p.ink) return `Handwritten thought by ${p.author}${p.text ? `: ${p.text}` : ""}`;
    if (p.type === "thought") return `Thought by ${p.author}: ${p.text}`;
    if (p.type === "quote") return `Quote: ${p.text}${p.quoteBy ? `, ${p.quoteBy}` : ""}`;
    if (p.audience === "friends" && !p._labelled) return label({ ...p, _labelled: true }) + " (friends only)";
    if (p.type === "voice") return `Voice note by ${p.author}, ${fmtDur(p.duration || 0)}${p.caption ? `: ${p.caption}` : ""}`;
    return `${p.type === "video" ? "Video" : "Photo"} by ${p.author}${p.caption ? `: ${p.caption}` : ""}`;
  }

  /* ---------------------------------------------------------
     6. THE WALL + INFINITE ZOOM
     Each card has a spot on a repeating tile and a depth between
     0 (far) and 1 (near). Zooming shifts every depth together and
     wraps it, so cards fly past you and come back far away.
     --------------------------------------------------------- */
  const canvas = $("#canvas");
  const world = $("#world");
  let cards = [];
  let tile = { w: 0, h: 0 };
  let vw = innerWidth, vh = innerHeight;
  let BASE = 200, UNIT = 105;

  const S_MIN = 0.35, S_MAX = 4;
  const LOG_RANGE = Math.log(S_MAX / S_MIN);
  const depthScale = de => S_MIN * Math.exp(de * LOG_RANGE);
  const ZOOM_STEP = 0.12;
  const cam = { x: 0, y: 0, vx: 0, vy: 0, z: 0, tz: 0, ax: 0, ay: 0, focus: null };
  let fx = null;   // the effect currently playing (see section 11)

  function buildWall(isFirst) {
    vw = innerWidth; vh = innerHeight;
    const small = vw < 700;
    BASE = small ? 150 : 200;
    UNIT = small ? 78 : 105;
    const cell = small ? 160 : 230;
    tile.w = Math.ceil((vw + 300) / 0.42 / cell) * cell;
    tile.h = Math.ceil((vh + 300) / 0.42 / cell) * cell;
    const cols = tile.w / cell, rows = tile.h / cell;

    world.innerHTML = "";
    cards = [];
    $("#empty").hidden = state.posts.length > 0;
    if (!state.posts.length) return;

    const rand = mulberry32(2026);
    let deck = [];
    const draw = () => {
      if (!deck.length) deck = state.posts.slice().sort(() => rand() - 0.5);
      return deck.pop();
    };

    const frag = document.createDocumentFragment();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const post = draw();
        const card = {
          post, ar: aspect(post), d0: rand(), seed: rand(), spin: rand() * 2 - 1,
          x: c * cell + rand() * cell * 0.7,
          y: r * cell + rand() * cell * 0.7,
          el: document.createElement("button"),
        };
        const el = card.el;
        el.className = `card card--${post.sealed ? "sealed" : post.type}` + (isFirst && !reduceMotion ? " intro" : "") + (isNova(post) ? " card--nova" : "");
        el.type = "button";
        el.tabIndex = -1;
        el.dataset.id = post.id;
        el.setAttribute("aria-label", label(post));
        el.style.setProperty("--w", BASE + "px");
        el.style.setProperty("--ar", card.ar.toFixed(3));
        el.style.setProperty("--delay", (rand() * 1.1).toFixed(2) + "s");
        el.innerHTML = `<div class="card__inner">${cardContent(post)}</div>`;
        if (el.classList.contains("intro")) {
          el.addEventListener("animationend", () => el.classList.remove("intro"), { once: true });
        }
        cards.push(card);
        frag.appendChild(el);
      }
    }
    world.appendChild(frag);
    applyFilter();
    render(true);
    timelineSetup();
  }

  // Re-draw the cards for one post (e.g. after reactions change)
  function refreshCards(id) {
    const p = postById(id);
    if (!p) return;
    for (const c of cards) {
      if (c.post.id !== id) continue;
      c.post = p;
      c.el.querySelector(".card__inner").innerHTML = cardContent(p);
      c.el.classList.toggle("card--nova", isNova(p));
    }
  }

  function render(force) {
    const cx = vw / 2, cy = vh / 2;
    for (const c of cards) {
      const de = mod(c.d0 + cam.z, 1);
      const s = depthScale(de);
      const u = mod(c.x - cam.x, tile.w) - tile.w / 2;
      const v = mod(c.y - cam.y, tile.h) - tile.h / 2;
      const w = UNIT * s, h = w * c.ar;
      const sx = cx + u * s - w / 2;
      const sy = cy + v * s - h / 2;
      const alpha = (0.3 + 0.7 * smooth(0, 0.7, de)) * smooth(0.02, 0.16, de) * (1 - smooth(0.8, 0.97, de));
      c.de = de; c.s = s; c.w = w; c.h = h; c.sx = sx; c.sy = sy;

      // While an effect plays, it moves each card away from its resting spot
      if (fx) {
        const m = fx.E.card(fx, c, fx.t, sx + w / 2, sy + h / 2);
        const a = alpha * m.a;
        const mw = w * m.s * (m.stretch || 1);
        const vis = a > 0.01 && m.s > 0.002 && m.x > -mw && m.x < vw + mw && m.y > -mw && m.y < vh + mw;
        if (vis !== c.visible) { c.visible = vis; c.el.style.visibility = vis ? "visible" : "hidden"; }
        if (!vis) continue;
        let tr = `translate3d(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px, 0)`;
        if (m.stretch && m.stretch !== 1) {
          tr += ` rotate(${m.phi.toFixed(3)}rad) scale(${m.stretch.toFixed(3)}, ${(1 / Math.sqrt(m.stretch)).toFixed(3)}) rotate(${(-m.phi).toFixed(3)}rad)`;
        }
        if (m.rot) tr += ` rotate(${m.rot.toFixed(3)}rad)`;
        tr += ` scale(${((w / BASE) * m.s).toFixed(4)}) translate(-50%, -50%)`;
        c.el.style.transform = tr;
        c.el.style.opacity = a.toFixed(3);
        const zi = Math.round(de * 1000);
        if (zi !== c.zi) { c.zi = zi; c.el.style.zIndex = zi; }
        continue;
      }

      const visible = alpha > 0.01 && sx > -w && sx < vw && sy > -h && sy < vh;
      if (visible !== c.visible || force) {
        c.visible = visible;
        c.el.style.visibility = visible ? "visible" : "hidden";
      }
      if (!visible) continue;
      c.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) scale(${(w / BASE).toFixed(4)})`;
      c.el.style.opacity = alpha.toFixed(3);
      const zi = Math.round(de * 1000);
      if (zi !== c.zi) { c.zi = zi; c.el.style.zIndex = zi; }
      const tab = de > 0.5 && de < 0.8 ? 0 : -1;
      if (tab !== c.tab) { c.tab = tab; c.el.tabIndex = tab; }
    }
    if (state.gravity && !fx) applyGravity();
  }

  function applyZoom(dz, ax, ay) {
    if (!dz) return;
    const k = Math.exp(dz * LOG_RANGE);
    cam.x += (ax - vw / 2) * (1 - 1 / k);
    cam.y += (ay - vh / 2) * (1 - 1 / k);
    cam.z += dz;
  }
  function zoomBy(dz, ax = vw / 2, ay = vh / 2) {
    if (ax !== cam.ax || ay !== cam.ay) {
      applyZoom(cam.tz - cam.z, cam.ax, cam.ay);
      cam.ax = ax; cam.ay = ay;
    }
    cam.tz += dz;
  }

  function tick() {
    let moved = false;
    const dzLeft = cam.tz - cam.z;
    if (Math.abs(dzLeft) > 0.0002) {
      applyZoom(reduceMotion ? dzLeft : dzLeft * 0.14, cam.ax, cam.ay);
      moved = true;
    }
    if (cam.focus) {
      const c = cam.focus;
      const ox = c.sx + c.w / 2 - vw / 2, oy = c.sy + c.h / 2 - vh / 2;
      const k = reduceMotion ? 1 : 0.1;
      cam.x += (ox / c.s) * k; cam.y += (oy / c.s) * k;
      if (Math.hypot(ox, oy) < 1 && Math.abs(cam.tz - cam.z) < 0.001) cam.focus = null;
      moved = true;
    } else if (!dragging && (Math.abs(cam.vx) > 0.05 || Math.abs(cam.vy) > 0.05)) {
      cam.x += cam.vx; cam.y += cam.vy;
      cam.vx *= 0.93; cam.vy *= 0.93;
      moved = true;
    }
    if (fx) {
      const now = performance.now();
      fx.t = (now - fx.start) / fx.dur;
      fx.dt = Math.min(0.05, (now - fx.last) / 1000);
      fx.last = now;
      if (fx.E.mid && !fx.midDone && fx.t >= fx.E.midAt) { fx.midDone = true; fx.E.mid(fx); }
      if (fx && fx.t >= 1) endFx();
      else { drawFx(); moved = true; }
    }
    if (state.gravity && !reduceMotion) moved = true;       // orbits keep turning
    if (moved) render();
    requestAnimationFrame(tick);
  }

  // Zoom + pan so the nearest card matching `test` sits mid-screen at a readable size
  function glideTo(test, { instant = false } = {}) {
    applyZoom(cam.tz - cam.z, cam.ax, cam.ay);
    cam.tz = cam.z;
    render();
    let best = null, bestDist = Infinity;
    for (const c of cards) {
      if (!test(c) || c.de < 0.2 || c.de > 0.8) continue;
      const dist = Math.hypot(c.sx + c.w / 2 - vw / 2, c.sy + c.h / 2 - vh / 2);
      if (dist < bestDist) { bestDist = dist; best = c; }
    }
    if (!best) return;
    cam.vx = cam.vy = 0;
    cam.ax = vw / 2; cam.ay = vh / 2;
    if (instant) {
      // Jump straight there (used behind an effect, which then reveals the spot)
      applyZoom(0.66 - best.de, vw / 2, vh / 2);
      cam.tz = cam.z;
      render();
      cam.x += (best.sx + best.w / 2 - vw / 2) / best.s;
      cam.y += (best.sy + best.h / 2 - vh / 2) / best.s;
      cam.focus = null;
      render(true);
      return;
    }
    cam.tz = cam.z + (0.66 - best.de);
    cam.focus = best;
  }

  /* ----- Pointer: drag (one pointer), pinch-zoom (two) ----- */
  let dragging = false, pointerDown = false, downCard = null;
  let last = { x: 0, y: 0, t: 0 }, start = { x: 0, y: 0 };
  const pointers = new Map();
  let pinch = null;
  const pinchInfo = () => {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  canvas.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture?.(e.pointerId);
    cam.focus = null;
    if (pointers.size === 2) {
      pinch = pinchInfo();
      dragging = true; downCard = null;
      canvas.classList.add("dragging");
      cam.vx = cam.vy = 0;
      return;
    }
    pointerDown = true;
    downCard = e.target.closest(".card");
    start = { x: e.clientX, y: e.clientY };
    last = { x: e.clientX, y: e.clientY, t: performance.now() };
    cam.vx = cam.vy = 0;
  });

  window.addEventListener("pointermove", e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const now = pinchInfo();
      const dz = Math.log(now.dist / pinch.dist) / LOG_RANGE;
      cam.x -= now.mx - pinch.mx; cam.y -= now.my - pinch.my;
      cam.tz += dz; applyZoom(dz, now.mx, now.my);
      cam.ax = now.mx; cam.ay = now.my;
      pinch = now;
      render();
      return;
    }
    if (!pointerDown) return;
    const dx = e.clientX - last.x, dy = e.clientY - last.y;
    if (!dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) {
      dragging = true;
      canvas.classList.add("dragging");
      stopHoverVideo();
    }
    if (dragging) {
      cam.x -= dx; cam.y -= dy;
      const now = performance.now(), dt = Math.max(1, now - last.t);
      cam.vx = (-dx / dt) * 16; cam.vy = (-dy / dt) * 16;
      render();
    }
    last = { x: e.clientX, y: e.clientY, t: performance.now() };
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pinch) {
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 1) {
        const p = [...pointers.values()][0];
        last = { x: p.x, y: p.y, t: performance.now() };
        return;
      }
    }
    if (pointers.size > 0) return;
    if (!pointerDown && !dragging) return;
    pointerDown = false;
    if (dragging) {
      dragging = false;
      canvas.classList.remove("dragging");
      if (performance.now() - last.t > 80) cam.vx = cam.vy = 0;
    } else if (downCard && e.type === "pointerup") {
      openViewer(downCard.dataset.id, downCard);
    } else if (e.type === "pointerup" && !downCard) {
      sceneTap(e.clientX, e.clientY);
    }
    downCard = null;
  }
  window.addEventListener("pointerup", endPointer);
  window.addEventListener("pointercancel", endPointer);

  world.addEventListener("keydown", e => {
    const card = e.target.closest(".card");
    if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openViewer(card.dataset.id, card); }
  });

  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    cam.focus = null;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vh : 1;
    const dx = e.deltaX * unit, dy = e.deltaY * unit;
    if (!e.ctrlKey && Math.abs(dx) > Math.abs(dy)) { cam.x += dx; cam.vx = 0; render(); return; }
    zoomBy(clamp(-dy * (e.ctrlKey ? 0.01 : 0.0012), -0.3, 0.3), e.clientX, e.clientY);
  }, { passive: false });

  const anyModalOpen = () => !$("#viewer").hidden || !$("#composer").hidden;
  window.addEventListener("keydown", e => {
    if (e.target.matches("input, textarea") || anyModalOpen()) return;
    const step = 14;
    if (e.key === "ArrowLeft")  cam.vx -= step;
    if (e.key === "ArrowRight") cam.vx += step;
    if (e.key === "ArrowUp")    cam.vy -= step;
    if (e.key === "ArrowDown")  cam.vy += step;
    if (e.key === "+" || e.key === "=") zoomBy(ZOOM_STEP);
    if (e.key === "-" || e.key === "_") zoomBy(-ZOOM_STEP);
  });
  $("#zoomIn").addEventListener("click", () => zoomBy(ZOOM_STEP * 1.5));
  $("#zoomOut").addEventListener("click", () => zoomBy(-ZOOM_STEP * 1.5));

  let resizeT;
  window.addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => buildWall(false), 150); });

  /* ----- Videos play (muted) while you hover them ----- */
  let hoverVideo = null;
  function stopHoverVideo() { hoverVideo?.remove(); hoverVideo = null; }
  world.addEventListener("pointerover", e => {
    if (e.pointerType !== "mouse" || dragging) return;
    const el = e.target.closest(".card--video");
    if (!el || el.querySelector("video")) return;
    const p = postById(el.dataset.id);
    if (!p?.url) return;
    stopHoverVideo();
    const v = document.createElement("video");
    Object.assign(v, { src: p.url, muted: true, loop: true, playsInline: true, autoplay: true, className: "card__video" });
    v.setAttribute("aria-hidden", "true");
    applyClip(v, p);
    el.querySelector(".card__inner").appendChild(v);
    v.play().catch(() => {});
    hoverVideo = v;
  });
  world.addEventListener("pointerout", e => {
    const el = e.target.closest(".card--video");
    if (el && !el.contains(e.relatedTarget)) stopHoverVideo();
  });

  /* ---------------------------------------------------------
     7. SEARCH + FILTERS
     --------------------------------------------------------- */
  const input = $("#searchInput");
  const status = $("#searchStatus");

  // Past = before the cutoff, New = after it. The cutoff is 24 hours ago, or the
  // middle of the wall's history if that would leave one side nearly empty.
  function computeCutoff() {
    const DAY = 864e5, now = Date.now();
    const when = state.when;
    state.when = "all";                                  // look at the type/search matches, ignoring time
    const pool = state.posts.filter(matches);
    state.when = when;
    const ts = (pool.length >= 2 ? pool : state.posts).map(p => p.createdAt).sort((a, b) => a - b);
    let cut = now - DAY;
    const older = ts.filter(x => x < cut).length;
    const need = Math.min(3, Math.floor(ts.length / 2));
    if (older < need || ts.length - older < need) cut = ts.length ? (ts[Math.floor((ts.length - 1) / 2)] + ts[Math.floor(ts.length / 2)]) / 2 + 1 : now;
    return cut;
  }

  function matches(p) {
    if (state.type !== "all" && p.type !== state.type) return false;
    if (state.until && p.createdAt > state.until) return false;
    if (state.friendsOnly && !(p.audience === "friends" || state.friendIds.has(p.authorId))) return false;
    if (state.place && (p.region !== state.place.region || (state.place.city && p.city !== state.place.city))) return false;
    if (state.onlyAuthor && p.authorId !== state.onlyAuthor.id) return false;
    if (state.prompt !== null && state.prompt !== undefined && p.prompt !== state.prompt) return false;
    if (state.when === "past" && p.createdAt >= state.cutoff) return false;
    if (state.when === "new" && p.createdAt < state.cutoff) return false;
    const q = state.query.trim().toLowerCase();
    if (!q) return true;
    const hay = `${p.caption || ""} ${p.text || ""} ${p.quoteBy || ""} ${p.author || ""}`.toLowerCase();
    return q.split(/\s+/).every(w => hay.includes(w));
  }

  function applyFilter() {
    if (state.when !== "all") state.cutoff = computeCutoff();
    const active = state.type !== "all" || state.query.trim() || state.when !== "all" || state.until || state.prompt !== null || state.friendsOnly || state.onlyAuthor || state.place;
    const hits = new Set();
    for (const c of cards) {
      const hit = matches(c.post);
      c.el.classList.toggle("is-dim", !!active && !hit);
      if (hit) hits.add(c.post.id);
    }
    if (!active) { status.innerHTML = ""; return hits; }
    const n = state.posts.filter(matches).length;
    const what = state.type === "all" ? "post" : state.type;
    const span = durationWords(Date.now() - state.cutoff);
    let when = state.when === "past" ? ` older than ${span}` : state.when === "new" ? ` from the last ${span}` : "";
    if (state.place) when += ` from ${esc(state.place.city ? `${state.place.city}, ${state.place.region}` : state.place.region)}`;
    if (state.onlyAuthor) when += ` by ${esc(state.onlyAuthor.name || "your friend")}`;
    else if (state.friendsOnly) when += " from you and your friends";
    if (state.until) when += ` posted before ${new Date(state.until).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}`;
    status.innerHTML = (n
      ? `${n} ${what}${n > 1 ? "s" : ""}${when}${state.query.trim() ? ` matching “${esc(state.query.trim())}”` : ""}.`
      : `Nothing matches yet. Try another word or show all posts.`) + `<button type="button" id="clearSearch">Show all</button>`;
    return hits;
  }

  /* ----- Time travel: Past → Noir, New → Neo Tokyo, Now → back to your theme ----- */
  const TIME_THEMES = { past: "noir", new: "neotokyo" };
  const currentTheme = () => document.documentElement.dataset.theme;

  function setWhen(when) {
    const prev = state.when;
    if (when === "all") resetTimeline();
    state.when = when;
    $$("#timeChips .chip").forEach(ch => ch.setAttribute("aria-pressed", String(ch.dataset.when === when)));
    const cur = currentTheme();
    // "Now" lands in a random theme: never Noir or Neo Tokyo, and never the one you're in
    const randomTheme = () => {
      const options = Object.keys(THEMES).filter(k => !Object.values(TIME_THEMES).includes(k) && k !== cur && k !== "andromeda");
      return options[Math.floor(Math.random() * options.length)];
    };
    const target = when === "all" ? randomTheme() : TIME_THEMES[when];
    const hits = applyFilter();
    const land = instant => { if (when !== "all" && hits.size) glideTo(c => !c.el.classList.contains("is-dim"), { instant }); };
    if (target === cur) { if (prev !== when) land(false); return; }
    const year = new Date().getFullYear();
    const years = when === "past" ? [year, 1947] : when === "new" ? [year, 2087]
      : cur === "noir" ? [1947, year] : cur === "neotokyo" ? [2087, year] : null;
    travelTo(target, { years, after: () => land(true) });
  }
  $("#timeChips").addEventListener("click", e => {
    const b = e.target.closest(".chip");
    if (b) setWhen(b.dataset.when);
  });

  // Which effect each filter plays
  const FILTER_FX = { all: ["fireworks", "all"], photo: ["fireworks", "photo"], thought: ["fireworks", "thought"], quote: ["wormhole"], video: ["blackhole"], voice: ["soundwave"] };

  function setFilter({ type = state.type, query = state.query } = {}, { effect = false } = {}) {
    state.type = type; state.query = query;
    input.value = query;
    $$("#chips .chip").forEach(ch => ch.setAttribute("aria-pressed", String(ch.dataset.type === type)));
    const hits = applyFilter();
    const play = effect && !reduceMotion && cards.length;
    if ((type !== "all" || query.trim()) && hits.size) glideTo(c => !c.el.classList.contains("is-dim"), { instant: play });
    if (play) startFx(...FILTER_FX[type]);
  }

  // Plain-language search: "old photos", "latest thoughts about running", "new videos"…
  const PAST_RE = /\b(past|old|older|oldest|earlier|yesterday|history|vintage|throwback|before|last (week|month|year))\b/gi;
  const NEW_RE = /\b(new|newer|newest|latest|recent|recently|today|fresh|now)\b/gi;
  const TYPE_RE = { photo: /\b(photos?|pictures?|pics?|images?)\b/gi, video: /\b(videos?|clips?)\b/gi, voice: /\b(voice notes?|voices?|audio|recordings?|voicenotes?)\b/gi, quote: /\b(quotes?)\b/gi, thought: /\b(thoughts?|notes?)\b/gi };
  const FILLER_RE = /\b(show|me|find|the|from|of|any|all|some|posts?|about|with|by|and|a|an)\b/gi;
  function parseSearch(text) {
    let rest = text, when = null, type = null;
    if (PAST_RE.test(rest)) when = "past";
    else if (NEW_RE.test(rest)) when = "new";
    for (const [t, re] of Object.entries(TYPE_RE)) { re.lastIndex = 0; if (re.test(rest)) { type = t; break; } }
    for (const re of [PAST_RE, NEW_RE, ...Object.values(TYPE_RE)]) { re.lastIndex = 0; rest = rest.replace(re, " "); }
    PAST_RE.lastIndex = NEW_RE.lastIndex = 0;
    const leftover = rest.replace(FILLER_RE, " ").replace(/\s+/g, " ").trim();
    return { when, type, query: when || type ? leftover : text.trim() };
  }
  $("#searchForm").addEventListener("submit", e => {
    e.preventDefault();
    const typed = input.value;
    const { when, type, query } = parseSearch(typed);
    setFilter({ query, type: type || state.type });
    input.value = typed;
    if (when) setWhen(when);
  });
  input.addEventListener("input", () => { if (!input.value) setFilter({ query: "" }); });
  status.addEventListener("click", e => {
    if (e.target.id !== "clearSearch") return;
    resetTimeline();
    state.friendsOnly = false; state.onlyAuthor = null; state.place = null;
    $("#friendsOnlyToggle").checked = false;
    if (state.prompt !== null) { state.prompt = null; $("#qSee").setAttribute("aria-pressed", "false"); $("#qSee").textContent = "See answers"; }
    setFilter({ type: "all", query: "" });
    if (state.when !== "all") setWhen("all");
  });
  $("#chips").addEventListener("click", e => {
    const b = e.target.closest(".chip");
    if (b) setFilter({ type: b.dataset.type }, { effect: true });
  });
  $("#discoverToggle").addEventListener("click", e => {
    const collapsed = $("#discover").classList.toggle("collapsed");
    e.currentTarget.setAttribute("aria-expanded", String(!collapsed));
  });

  /* ---------------------------------------------------------
     8. VIEWER
     --------------------------------------------------------- */
  const viewer = $("#viewer");
  let viewing = null, returnFocus = null;

  // Long videos play only their chosen 30-second clip
  function applyClip(v, p) {
    if (!v || !p.clip) return;
    const [a, b] = p.clip;
    v.addEventListener("loadedmetadata", () => { v.currentTime = a; }, { once: true });
    v.addEventListener("timeupdate", () => { if (v.currentTime >= b || v.currentTime < a - 0.5) v.currentTime = a; });
  }

  // Voice note player: play button, a waveform you can tap to seek, and the time
  function voicePlayerHTML(p) {
    return `<div class="vplayer" style="--vh:${hashOf(p.author || p.id || "") % 360}">
      <button class="vplayer__play" type="button" aria-label="Play voice note">
        <svg class="i-play" viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5z"/></svg>
        <svg class="i-pause" viewBox="0 0 24 24"><path d="M8 5h3v14H8zM13 5h3v14h-3z"/></svg>
      </button>
      <div class="vplayer__wave" role="slider" tabindex="0" aria-label="Position in the voice note" aria-valuemin="0" aria-valuemax="${Math.round(p.duration || 0)}" aria-valuenow="0">${wavePeaks(p, 64).map(v => `<i style="--v:${v.toFixed(2)}"></i>`).join("")}</div>
      <span class="vplayer__time">0:00 / ${fmtDur(p.duration || 0)}</span>
      <audio src="${esc(p.url)}" preload="auto"></audio>
    </div>`;
  }
  function bindVoicePlayer(root, p, autoplay = true) {
    const a = root.querySelector("audio"), btn = root.querySelector(".vplayer__play"), wave = root.querySelector(".vplayer__wave");
    const bars = [...wave.children], time = root.querySelector(".vplayer__time");
    const total = () => (isFinite(a.duration) && a.duration) || p.duration || 0;
    const sync = () => {
      const f = total() ? a.currentTime / total() : 0;
      bars.forEach((b, i) => b.classList.toggle("on", i / bars.length < f));
      time.textContent = `${fmtDur(a.currentTime)} / ${fmtDur(total())}`;
      wave.setAttribute("aria-valuenow", String(Math.round(a.currentTime)));
      root.classList.toggle("playing", !a.paused);
      btn.setAttribute("aria-label", a.paused ? "Play voice note" : "Pause voice note");
    };
    btn.addEventListener("click", () => (a.paused ? a.play().catch(() => {}) : a.pause()));
    ["timeupdate", "play", "pause"].forEach(ev => a.addEventListener(ev, sync));
    a.addEventListener("ended", () => { a.currentTime = 0; sync(); });
    wave.addEventListener("pointerdown", e => { const r = wave.getBoundingClientRect(); a.currentTime = clamp((e.clientX - r.left) / r.width, 0, 1) * total(); sync(); });
    wave.addEventListener("keydown", e => {
      if (e.key === "ArrowRight") a.currentTime = Math.min(total(), a.currentTime + 2);
      else if (e.key === "ArrowLeft") a.currentTime = Math.max(0, a.currentTime - 2);
      else if (e.key === " " || e.key === "Enter") { e.preventDefault(); btn.click(); }
      sync();
    });
    if (autoplay) a.play().catch(() => {});
  }

  function openViewer(id, fromEl) {
    const p = postById(id);
    if (!p) return;
    viewing = p;
    returnFocus = fromEl || document.activeElement;
    stopHoverVideo();

    if (p.sealed) {                                     // a sealed time capsule: only the countdown
      const media = $("#vMedia");
      media.className = "viewer__media viewer__media--quote";
      media.innerHTML = `<div class="viewer__capsule">${capsuleHTML(p, true)}</div>`;
      $("#vAuthor").textContent = p.author || "Anonymous";
      $("#vTime").textContent = `Sealed ${fullDate(p.createdAt)}`;
      $("#vCaption").textContent = `Opens ${fullDate(p.opensAt)}. Nobody can see what's inside until then.`;
      $("#vLike").hidden = true;
      $("#vReacts").hidden = true;
      $(".viewer__bar").classList.remove("viewer__bar--thought");
      $("#vDelete").hidden = !state.tokens[p.id] && !wallHostToken();
      $("#vReport").hidden = true;                       // nothing to see yet; block still works
      $("#vBlock").hidden = !!state.tokens[p.id];
      $("#vShare").hidden = !SHARE_ORIGIN || store.mode !== "server";
      $("#vReplies").hidden = true;
      viewer.hidden = false;
      $(".modal__close", viewer).focus();
      return;
    }

    const media = $("#vMedia");
    media.className = "viewer__media" + (p.type === "quote" || p.type === "thought" ? " viewer__media--quote" : "");
    if (p.type === "photo") {
      media.innerHTML = `<img src="${esc(p.url)}" alt="${esc(p.caption || `Photo by ${p.author}`)}">`;
    } else if (p.type === "video") {
      media.innerHTML = `<video src="${esc(p.url)}" poster="${esc(p.thumb)}" controls autoplay playsinline loop></video>`;
      applyClip(media.querySelector("video"), p);
    } else if (p.type === "voice") {
      media.classList.add("viewer__media--quote");
      media.innerHTML = voicePlayerHTML(p);
      bindVoicePlayer(media.querySelector(".vplayer"), p);
    } else if (p.type === "mural") {
      media.innerHTML = `<img class="viewer__mural" src="${inkImage(p.id, p.strokes, 1280, 800, { bg: "#0b0b14", neon: true })}" alt="${esc(label(p))}">`;
    } else if (p.type === "thought") {
      media.innerHTML = `<div class="viewer__thought">${thoughtHTML(p)}</div>`;
    } else {
      media.innerHTML = `<div class="viewer__quote">${quoteHTML(p)}</div>`;
    }
    $("#vAuthor").textContent = p.author || "Anonymous";
    $("#vTime").textContent = `${p.audience === "friends" ? "👥 Friends only · " : ""}${p.city ? `📍 ${p.city}, ${p.region} · ` : ""}${timeAgo(p.createdAt)} · ${fullDate(p.createdAt)}`;
    $("#vTime").title = new Date(p.createdAt).toString();
    $("#vCaption").textContent = p.type === "quote" ? (p.quoteBy ? `Shared by ${p.author}` : "")
      : p.type === "thought" ? (Number.isInteger(p.prompt) && PROMPTS[p.prompt] ? `Answering: ${PROMPTS[p.prompt]}` : "") : (p.caption || "");
    const isThought = p.type === "thought";
    $("#vLike").hidden = isThought;
    $("#vReacts").hidden = !isThought;
    $(".viewer__bar").classList.toggle("viewer__bar--thought", isThought);
    if (isThought) renderReacts(); else renderLike();
    $("#vDelete").hidden = !state.tokens[p.id] && !wallHostToken();
    $("#vDelete").textContent = state.tokens[p.id] ? "Delete" : "Remove";
    $("#vReport").hidden = $("#vBlock").hidden = !!state.tokens[p.id];   // not on your own posts
    $("#vShare").hidden = !SHARE_ORIGIN || store.mode !== "server" || p.audience === "friends";
    setupTranslate(p);
    $("#vRemix").hidden = !(p.type === "video" || p.type === "voice") || store.mode !== "server";
    media.classList.remove("viewer__media--remix");
    if (p.remixOf) showRemix(p, media);
    loadReplies(p);
    viewer.hidden = false;
    $(".modal__close", viewer).focus();
  }

  function closeViewer() {
    viewer.hidden = true;
    $("#vMedia").innerHTML = "";        // stops video playback
    $("#vReplyList").innerHTML = "";
    viewing = null;
    if (/^\/p\//.test(location.pathname)) history.replaceState(null, "", WALL ? `/w/${WALL}` : "/");
    returnFocus?.focus?.({ preventScroll: true });
  }

  function renderLike() {
    const liked = state.liked.has(viewing.id);
    const btn = $("#vLike");
    btn.setAttribute("aria-pressed", String(liked));
    btn.setAttribute("aria-label", liked ? "Unlike" : "Like");
    $("#vLikes").textContent = viewing.likes || 0;
  }

  $("#vLike").addEventListener("click", async () => {
    const p = viewing;
    const delta = state.liked.has(p.id) ? -1 : 1;
    delta > 0 ? state.liked.add(p.id) : state.liked.delete(p.id);
    p.likes = Math.max(0, (p.likes || 0) + delta);      // optimistic update
    ls.set("glimpse:liked", [...state.liked]);
    renderLike();
    if (delta > 0) { const b = $("#vLike"); b.classList.remove("pulse"); void b.offsetWidth; b.classList.add("pulse"); }
    try {
      p.likes = await store.like(p.id, delta);
      if (viewing === p) renderLike();
    } catch (err) { toast(err.message); }
  });

  /* ----- Reactions on thoughts ----- */
  function renderReacts(focusId) {
    const p = viewing, box = $("#vReacts");
    const mine = state.reacted[p.id];
    box.innerHTML = REACTIONS.map(r => {
      const n = (p.reactions || {})[r.id] || 0;
      return `<button type="button" class="react" data-r="${r.id}" aria-pressed="${mine === r.id}" aria-label="${r.label}, ${n}" title="${r.label}">
        <span class="react__e" aria-hidden="true">${r.emoji}</span><span class="react__n" aria-hidden="true">${n || ""}</span>
      </button>`;
    }).join("");
    if (focusId) box.querySelector(`[data-r="${focusId}"]`)?.focus();
  }

  $("#vReacts").addEventListener("click", async e => {
    const b = e.target.closest(".react");
    if (!b) return;
    const p = viewing, id = b.dataset.r;
    const prev = state.reacted[p.id] || null;
    const add = prev === id ? null : id;       // tapping your reaction again removes it
    const remove = prev;
    const hadFocus = $("#vReacts").contains(document.activeElement);

    // Update right away, then confirm with the server
    p.reactions = { ...(p.reactions || {}) };
    if (remove) p.reactions[remove] = Math.max(0, (p.reactions[remove] || 0) - 1);
    if (add) p.reactions[add] = (p.reactions[add] || 0) + 1;
    if (add) state.reacted[p.id] = add; else delete state.reacted[p.id];
    ls.set("glimpse:reacted", state.reacted);
    renderReacts(hadFocus ? id : null);
    if (add) $(`#vReacts [data-r="${add}"]`)?.classList.add("pop");
    refreshCards(p.id);

    try {
      p.reactions = await store.react(p.id, add, remove);
      if (viewing === p) renderReacts(hadFocus ? id : null);
      refreshCards(p.id);
    } catch (err) { toast(err.message); }
  });

  $("#vDelete").addEventListener("click", async () => {
    const p = viewing, mine = !!state.tokens[p.id];
    const ask = mine ? "Send this post to The Void? The Devourer will feast on it, but you can bring it back from The Void for 30 days."
      : "Remove this post from your wall for everyone? This can't be undone.";
    if (!confirm(ask)) return;
    try { await store.remove(p.id, state.tokens[p.id]); }
    catch (err) { toast(err.message); return; }
    closeViewer();
    p._devouring = true;                                  // keep it on screen until it's eaten
    const done = () => {
      state.posts = state.posts.filter(x => x.id !== p.id);
      if (!state.posts.length) buildWall(false);
      else { cards.filter(c => c.post.id === p.id).forEach(c => setCardPost(c, state.posts[Math.floor(Math.random() * state.posts.length)], false)); applyFilter(); render(true); }
      timelineSetup();
      toast(mine ? "The Devourer has feasted. Your post is in The Void (Discover → The Void) for 30 days." : "Post removed");
    };
    if (reduceMotion || !cards.length) done();
    else { glideTo(c => c.post.id === p.id, { instant: true }); startFx("devourer", null, { postId: p.id, onEnd: done }); }
  });

  viewer.addEventListener("click", e => { if (e.target.closest("[data-close]")) closeViewer(); });

  /* ---------------------------------------------------------
     9. COMPOSER
     --------------------------------------------------------- */
  const composer = $("#composer");
  const form = $("#composeForm");
  const fileInput = $("#fileInput");
  const drop = $("#drop");
  const preview = $("#dropPreview");
  const postBtn = $("#postBtn");
  const errorEl = $("#formError");
  const quoteText = $("#quoteText");
  const quoteBy = $("#quoteBy");
  const authorName = $("#authorName");
  const thoughtText = $("#thoughtText");
  let kind = "photo", prepared = null, quoteStyle = "ink", thoughtTint = "cream", busy = false;
  let photoFilter = "none", voicePrepared = null;

  // Note colour swatches for thoughts
  $("#tintRow").innerHTML = TINTS.map((t, i) => `
    <label class="swatch" title="${t.label}">
      <input type="radio" name="tint" value="${t.id}" ${i === 0 ? "checked" : ""} aria-label="${t.label}">
      <span aria-hidden="true" style="background:${t.color}"></span>
    </label>`).join("");
  $("#tintRow").addEventListener("change", e => { thoughtTint = e.target.value; updateThoughtPreview(); });
  function updateThoughtPreview() {
    $("#thoughtPreview").innerHTML = thoughtHTML({
      id: "preview", text: thoughtText.value.trim() || "What's on your mind?",
      author: authorName.value.trim() || "Anonymous", tint: thoughtTint, reactions: {},
    });
    $("#thoughtCount").textContent = `${thoughtText.value.length} / ${THOUGHT_MAX}`;
  }

  // Style swatches
  $("#styleRow").innerHTML = QUOTE_STYLES.map((s, i) => `
    <label class="swatch swatch--${s.id}" title="${s.label}">
      <input type="radio" name="qstyle" value="${s.id}" ${i === 0 ? "checked" : ""} aria-label="${s.label}">
      <span aria-hidden="true">Aa</span>
    </label>`).join("");
  $("#styleRow").addEventListener("change", e => { quoteStyle = e.target.value; updateQuotePreview(); });

  function openComposer() {
    setupAudience();
    $("#placeOpt").hidden = !MY_PLACE;
    if (MY_PLACE) { $("#placeName").textContent = `${MY_PLACE.city}, ${MY_PLACE.region}`; $("#placeToggle").checked = ls.get("glimpse:sharePlace", true); }
    authorName.value = ls.get("glimpse:name", "");
    setKind(kind);
    composer.hidden = false;
    $(".seg [aria-selected='true']").focus();
  }
  function closeComposer() {
    if (busy) return;
    composer.hidden = true;
    clearFile();
    form.reset();
    quoteStyle = "ink";
    thoughtTint = "cream";
    $("#capsuleWhen").hidden = true;
    stopRecording();
    clearVoice();
    ink.strokes = []; paintInk(); setInk(false);
    remixOf = null; $("#remixNote").hidden = true;
    $("#nightToggle").checked = false;
    $("#promptToggle").checked = false;
    labelPostBtn();
    errorEl.textContent = "";
    updateQuotePreview();
    updateThoughtPreview();
  }

  function setKind(k) {
    kind = k;
    $$(".seg button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.kind === k)));
    const isMedia = k === "photo" || k === "video";
    $("#mediaPane").hidden = !isMedia;
    $("#quotePane").hidden = k !== "quote";
    $("#thoughtPane").hidden = k !== "thought";
    $("#voicePane").hidden = k !== "voice";
    if (k !== "voice") stopRecording();
    if (isMedia) {
      fileInput.accept = k === "photo" ? "image/*" : "video/mp4,video/webm,video/quicktime,video/*";
      $("#dropTitle").textContent = k === "photo" ? "Choose a photo" : "Choose a video";
      $("#dropSub").textContent = k === "photo"
        ? "or drop it here. JPG, PNG or WebP."
        : `or drop it here. Up to ${MAX_VIDEO_MB} MB; longer videos are trimmed to ${MAX_VIDEO_SECONDS} seconds.`;
      if (prepared && prepared.kind !== k) clearFile();
    }
    errorEl.textContent = "";
    updatePostBtn();
  }
  $(".seg").addEventListener("click", e => { const b = e.target.closest("button[data-kind]"); if (b) setKind(b.dataset.kind); });

  function clearFile() {
    if (prepared?.previewUrl) URL.revokeObjectURL(prepared.previewUrl);
    prepared?.source?.close?.();
    prepared = null;
    photoFilter = "none";
    $("#filters").hidden = true;
    $("#trim").hidden = true;
    preview.innerHTML = "";
    drop.classList.remove("has-file");
    fileInput.value = "";
    updatePostBtn();
  }

  function updatePostBtn() {
    const ok = kind === "quote" ? quoteText.value.trim().length >= 2
      : kind === "thought" ? (ink.on ? ink.strokes.length > 0 : thoughtText.value.trim().length >= 2)
      : kind === "voice" ? !!voicePrepared
      : !!prepared;
    postBtn.disabled = !ok || busy;
  }

  // Wait for one of two events, with a timeout
  function once(el, okEvt, badEvt, ms = 15000) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => { cleanup(); rej(new Error("timeout")); }, ms);
      const ok = () => { cleanup(); res(); };
      const bad = () => { cleanup(); rej(new Error(badEvt)); };
      const cleanup = () => { clearTimeout(t); el.removeEventListener(okEvt, ok); if (badEvt) el.removeEventListener(badEvt, bad); };
      el.addEventListener(okEvt, ok, { once: true });
      if (badEvt) el.addEventListener(badEvt, bad, { once: true });
    });
  }

  function toJpeg(src, maxPx, quality, pixelFilter = null) {
    const sw = src.videoWidth || src.naturalWidth || src.width;
    const sh = src.videoHeight || src.naturalHeight || src.height;
    const k = Math.min(1, maxPx / Math.max(sw, sh));
    const w = Math.round(sw * k), h = Math.round(sh * k);
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);    // flatten transparent PNGs
    ctx.drawImage(src, 0, 0, w, h);
    if (pixelFilter) { const img = ctx.getImageData(0, 0, w, h); pixelFilter(img.data, w, h); ctx.putImageData(img, 0, 0); }
    return new Promise((res, rej) => cv.toBlob(b => (b ? res({ blob: b, w, h }) : rej(new Error("encode"))), "image/jpeg", quality));
  }

  // Some phones and browsers leave file.type empty, so fall back to the file extension.
  const PHOTO_EXT = /\.(jpe?g|png|webp|gif|avif|heic|heif|bmp)$/i;
  const VIDEO_TYPES = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", "3gp": "video/3gpp", mkv: "video/x-matroska" };
  function fileKind(file) {
    if (file.type.startsWith("image/") || (!file.type && PHOTO_EXT.test(file.name))) return "photo";
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (file.type.startsWith("video/") || VIDEO_TYPES[ext]) return "video";
    return null;
  }
  function videoType(file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    return VIDEO_TYPES[ext] || (file.type.startsWith("video/") ? file.type : "video/mp4");
  }

  // Decode a photo, trying the fast path first and a plain <img> as a fallback (older Safari)
  async function decodePhoto(file) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (_) {}
    try { return await createImageBitmap(file); } catch (_) {}
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  async function preparePhoto(file) {
    if (fileKind(file) !== "photo") throw new Error("That file isn't a photo. Choose a JPG, PNG or WebP image.");
    if (file.size > MAX_PHOTO_MB * 1e6) throw new Error(`That photo is ${Math.round(file.size / 1e6)} MB. Choose one under ${MAX_PHOTO_MB} MB.`);
    let src;
    try {
      src = await decodePhoto(file);
    } catch (_) {
      const heic = /\.(heic|heif)$/i.test(file.name) || /hei[cf]/i.test(file.type);
      throw new Error(heic
        ? "This browser can't open iPhone HEIC photos. Open the site in Safari, or on the iPhone go to Settings › Camera › Formats and choose Most Compatible."
        : "Your browser can't open this photo format. Try a JPG or PNG instead.");
    }
    const full = await toJpeg(src, PHOTO_MAX_PX, 0.86);
    const thumb = await toJpeg(src, THUMB_MAX_PX, 0.8);
    return {
      kind: "photo", media: full.blob, mediaName: "photo.jpg", thumb: thumb.blob, source: src,
      width: full.w, height: full.h, previewUrl: URL.createObjectURL(thumb.blob),
    };
  }

  async function prepareVideo(file) {
    if (fileKind(file) !== "video") throw new Error("That file isn't a video. Choose an MP4, WebM or MOV clip.");
    if (file.size > MAX_VIDEO_MB * 1e6) throw new Error(`That video is ${Math.round(file.size / 1e6)} MB. Videos can be up to ${MAX_VIDEO_MB} MB.`);
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    try {
      await once(v, "loadeddata", "error");
      let d = v.duration;
      if (!isFinite(d)) {                         // some WebM files don't report length up front
        v.currentTime = 1e7;
        await once(v, "seeked");
        d = v.duration;
      }
      if (!(d > 0)) throw new Error("length");
      const long = d > MAX_VIDEO_SECONDS + 0.5;          // long videos: you choose a 30-second clip
      v.currentTime = Math.min(1, d / 3);
      await once(v, "seeked");
      const thumb = await toJpeg(v, THUMB_MAX_PX, 0.8);
      return {
        kind: "video", media: new File([file], file.name || "video.mp4", { type: videoType(file) }),
        mediaName: file.name || "video.mp4", thumb: thumb.blob, probe: v,
        width: v.videoWidth, height: v.videoHeight, duration: Math.round(d * 100) / 100, previewUrl: url,
        clip: long ? [0, MAX_VIDEO_SECONDS] : null,
      };
    } catch (err) {
      URL.revokeObjectURL(url);
      if (err.message.includes("seconds")) throw err;
      throw new Error("This browser can't play this video, so it can't be checked or posted. iPhone videos often use HEVC: open the site in Safari, or on the iPhone go to Settings › Camera › Formats and choose Most Compatible. MP4 (H.264) works everywhere.");
    }
  }

  async function takeFile(file) {
    if (!file) return;
    clearFile();
    errorEl.textContent = "";
    drop.classList.add("busy");
    try {
      const fk = fileKind(file);
      if (!fk) throw new Error("That file type isn't supported. Choose a photo (JPG, PNG, WebP) or a video (MP4, MOV, WebM).");
      if (fk !== kind) setKind(fk);
      prepared = kind === "video" ? await prepareVideo(file) : await preparePhoto(file);
      preview.innerHTML = prepared.kind === "video"
        ? `<video src="${prepared.previewUrl}" muted autoplay loop playsinline></video><span class="meta">${fmtDur(prepared.clip ? MAX_VIDEO_SECONDS : prepared.duration)}</span>`
        : `<img src="${prepared.previewUrl}" alt="Selected photo">`;
      drop.classList.add("has-file");
      if (prepared.kind === "video" && prepared.clip) setupTrim();
      if (prepared.kind === "photo") setupFilters();
    } catch (err) {
      errorEl.textContent = err.message;
      fileInput.value = "";
    } finally {
      drop.classList.remove("busy");
      updatePostBtn();
    }
  }

  fileInput.addEventListener("change", () => takeFile(fileInput.files[0]));
  ["dragenter", "dragover"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(t => drop.addEventListener(t, () => drop.classList.remove("over")));
  drop.addEventListener("drop", e => { e.preventDefault(); takeFile(e.dataTransfer.files[0]); });

  function updateQuotePreview() {
    const text = quoteText.value.trim() || "Your words here.";
    $("#quotePreview").innerHTML = quoteHTML({ text, quoteBy: quoteBy.value.trim(), author: authorName.value.trim(), style: quoteStyle });
    $("#quoteCount").textContent = `${quoteText.value.length} / ${QUOTE_MAX}`;
  }
  [quoteText, quoteBy, authorName, thoughtText].forEach(el => el.addEventListener("input", () => { updateQuotePreview(); updateThoughtPreview(); updatePostBtn(); }));
  updateQuotePreview();
  updateThoughtPreview();

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (postBtn.disabled) return;
    const author = authorName.value.trim();
    ls.set("glimpse:name", author);
    const data = { type: kind, author: author || "Anonymous" };
    const sealing = $("#capsuleToggle").checked;
    const forFriends = !$("#audience").hidden && audience === "friends";
    if (MY_PLACE && $("#placeToggle").checked) data.tz = MY_TZ;
    if ($("#nightToggle").checked) data.night = "1";
    if (remixOf && (kind === "video" || kind === "voice")) data.remixOf = remixOf.id;
    ls.set("glimpse:sharePlace", $("#placeToggle").checked);
    if (forFriends) data.audience = "friends";
    if (sealing) {
      const opensAt = new Date($("#capsuleDate").value).getTime();
      if (!(opensAt > Date.now() + 60 * 1000)) { errorEl.textContent = "Pick an opening time at least a minute from now."; return; }
      data.opensAt = opensAt;
    }
    if (kind === "quote") {
      Object.assign(data, { text: quoteText.value.trim().slice(0, QUOTE_MAX), quoteBy: quoteBy.value.trim(), style: quoteStyle });
    } else if (kind === "thought") {
      Object.assign(data, { text: thoughtText.value.trim().slice(0, ink.on ? 140 : THOUGHT_MAX), tint: thoughtTint });
      if (ink.on && ink.strokes.length) data.ink = JSON.stringify({ strokes: ink.strokes });
      if ($("#promptToggle").checked) data.prompt = todayPrompt();
    } else if (kind === "voice") {
      Object.assign(data, {
        caption: $("#voiceCaption").value.trim(), media: voicePrepared.media, mediaName: voicePrepared.mediaName,
        duration: voicePrepared.duration, peaks: JSON.stringify(voicePrepared.peaks),
      });
    } else {
      Object.assign(data, {
        caption: $("#caption").value.trim(),
        media: prepared.media, mediaName: prepared.mediaName, thumb: prepared.thumb,
        width: prepared.width, height: prepared.height, duration: prepared.duration,
      });
    }

    busy = true; updatePostBtn();
    errorEl.textContent = "";
    postBtn.textContent = "Preparing…";
    try {
      // Photo filter: re-render the full photo and its thumbnail with it
      if (kind === "photo" && photoFilter !== "none" && prepared.source) {
        const fn = filterFn(photoFilter);
        data.media = (await toJpeg(prepared.source, PHOTO_MAX_PX, 0.86, fn)).blob;
        data.thumb = (await toJpeg(prepared.source, THUMB_MAX_PX, 0.8, fn)).blob;
      }
      // Long video: send the chosen clip, with a thumbnail from inside it
      if (kind === "video" && prepared.clip) {
        const [a, b] = prepared.clip;
        Object.assign(data, { clipStart: a.toFixed(2), clipEnd: b.toFixed(2) });
        const target = a + Math.min(1, (b - a) / 3);
        if (Math.abs(prepared.probe.currentTime - target) > 0.05) { prepared.probe.currentTime = target; await once(prepared.probe, "seeked", "error", 5000); }
        data.thumb = (await toJpeg(prepared.probe, THUMB_MAX_PX, 0.8)).blob;
      }
      // A 1200×630 picture for link previews (WhatsApp, X, Facebook…)
      if (store.mode === "server" && !forFriends) data.og = await makeOgImage(data).catch(() => null);
    } catch (err) { console.warn("Preparing extras failed:", err); }
    const bar = $("#uploadBar");
    const textOnly = kind === "quote" || kind === "thought";   // voice notes upload a file, so they show progress
    bar.hidden = textOnly;
    bar.style.setProperty("--p", "0%");
    postBtn.textContent = sealing ? "Sealing…" : textOnly ? "Posting…" : "Uploading…";

    try {
      const { post, deleteToken } = await store.create(data, p => bar.style.setProperty("--p", Math.round(p * 100) + "%"));
      state.tokens[post.id] = deleteToken;
      ls.set("glimpse:tokens", state.tokens);
      // the live stream may have delivered it already
      if (!state.posts.some(x => x.id === post.id)) state.posts.unshift(post);
      busy = false;
      closeComposer();
      if (state.type !== "all" && state.type !== post.type) setFilter({ type: "all" });
      timelineSetup();
      buildWall(false);
      glideTo(c => c.post.id === post.id);
      if (sealing) { toast(`Time capsule sealed until ${fullDate(data.opensAt)}`); Sound.sfx("seal"); }
      else toast(forFriends ? "Shared with your friends 👥" : "Posted to the wall");
      Badges.award("first-post");
      if (kind === "voice") Badges.award("voice");
      if (data.ink) Badges.award("ink");
      if (data.night) Badges.award("night");
      if (data.remixOf) Badges.award("remix");
    } catch (err) {
      console.error("Post failed:", err);
      errorEl.textContent = err.message || "Couldn't post. Try again.";
    } finally {
      busy = false;
      bar.hidden = true;
      labelPostBtn();
      updatePostBtn();
    }
  });

  composer.addEventListener("click", e => { if (e.target.closest("[data-close]")) closeComposer(); });
  document.addEventListener("click", e => {
    if (e.target.closest("[data-open-composer]")) { if (rulesAccepted()) openComposer(); else openRules(openComposer); }
    if (e.target.closest("[data-open-rules]")) openRules();
  });

  window.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (!$("#report").hidden) closeReport();
    else if (!$("#rules").hidden) closeRules();
    else if (!$("#graffiti").hidden) { $("#graffiti").hidden = true; graffiti.open = false; }
    else if (!$("#story").hidden) { $("#story").hidden = true; cancelAnimationFrame(story.raf); }
    else if (!$("#songs").hidden) $("#songs").hidden = true;
    else if (!$("#sky").hidden) closeSky();
    else if (!$("#cometIn").hidden) $("#cometIn").hidden = true;
    else if (!$("#cometSend").hidden) $("#cometSend").hidden = true;
    else if (!$("#earth").hidden) { $("#earth").hidden = true; earth.open = false; }
    else if (!$("#channels").hidden) $("#channels").hidden = true;
    else if (!$("#void").hidden) $("#void").hidden = true;
    else if (!$("#stars").hidden) $("#stars").hidden = true;
    else if (!$("#inviteModal").hidden) $("#inviteModal").hidden = true;
    else if (!$("#friends").hidden) closeFriends();
    else if (!$("#wallShare").hidden) $("#wallShare").hidden = true;
    else if (!$("#wallCreate").hidden) $("#wallCreate").hidden = true;
    else if (!viewer.hidden) closeViewer();
    else if (!composer.hidden) closeComposer();
  });

  /* ---------------------------------------------------------
     11. EFFECTS
     Each effect has:
       card(fx, card, t, restX, restY) → where that card is drawn at
         time t (0→1): { x, y, s(scale), a(alpha), rot, stretch, phi }
       draw(fx, ctx, t, dt) → paints sparks, rings, the black hole…
         on the #fx canvas above the wall.
     --------------------------------------------------------- */
  const fxCanvas = $("#fx");
  const fxCtx = fxCanvas.getContext("2d");
  let fxDpr = 1;
  const TAU = Math.PI * 2;
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const ease = {
    inCubic: t => t * t * t,
    outCubic: t => 1 - Math.pow(1 - t, 3),
    outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outBack: t => { const k = 1.6; return 1 + (k + 1) * Math.pow(t - 1, 3) + k * Math.pow(t - 1, 2); },
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const polar = (fx, x, y) => { const dx = x - fx.cx, dy = y - fx.cy; return { r: Math.hypot(dx, dy), th: Math.atan2(dy, dx) }; };
  const fromPolar = (fx, r, th) => ({ x: fx.cx + Math.cos(th) * r, y: fx.cy + Math.sin(th) * r });

  function sizeFx() {
    fxDpr = Math.min(devicePixelRatio || 1, 1.5);
    fxCanvas.width = Math.round(innerWidth * fxDpr);
    fxCanvas.height = Math.round(innerHeight * fxDpr);
  }

  function startFx(name, variant, opts = {}) {
    if (reduceMotion || !cards.length) return;
    endFx();
    sizeFx();
    const E = EFFECTS[name];
    const now = performance.now();
    fx = { name, variant, E, opts, start: now, last: now, t: 0, dt: 0, dur: E.dur, cx: vw / 2, cy: vh / 2, maxR: Math.hypot(vw, vh) / 2, parts: [] };
    Sound.sfx(name, opts);
    E.init?.(fx);
    canvas.classList.add("fx-running");
    render(true);
  }

  function endFx() {
    if (!fx) return;
    if (fx.E.mid && !fx.midDone) { fx.midDone = true; fx.E.mid(fx); }   // e.g. still switch the theme if skipped
    fx.E.end?.(fx);
    fx = null;
    fxCtx.setTransform(1, 0, 0, 1, 0, 0);
    fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    canvas.classList.remove("fx-running");
    canvas.style.transform = "";
    render(true);
  }

  function drawFx() {
    const ctx = fxCtx;
    ctx.setTransform(fxDpr, 0, 0, fxDpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, vw, vh);
    fx.E.draw(fx, ctx, fx.t, fx.dt);
  }

  // A soft glowing dot
  function glow(ctx, x, y, r, color, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color.replace("ALPHA", alpha));
    g.addColorStop(1, color.replace("ALPHA", 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Shared spark physics: drag, gravity, fading streaks
  function stepSparks(fx, ctx, dt, gravity = 260) {
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    const keep = [];
    for (const p of fx.parts) {
      p.life -= dt;
      if (p.life <= 0) continue;
      const px = p.x, py = p.y;
      p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt;
      p.vy += gravity * p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const f = p.life / p.max;
      let a = Math.min(1, f * 1.4);
      if (f < 0.45) a *= 0.55 + 0.45 * Math.random();       // glitter as it dies
      ctx.strokeStyle = `hsla(${p.h}, ${p.sat}%, ${p.l}%, ${a})`;
      ctx.lineWidth = p.w * (0.4 + f * 0.8);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(p.x, p.y); ctx.stroke();
      keep.push(p);
    }
    fx.parts = keep;
  }

  const FIREWORK_HUES = {
    all:     [0, 35, 55, 140, 190, 265, 310],
    photo:   [40, 18, 350, 195, 280],
    thought: [48, 150, 205, 340],           // the note colours, glowing
    capsule: [44, 50, 270, 285, 190],       // gold and violet, like the capsules
  };

  const EFFECTS = {
    /* ---- 1. FIREWORKS: a rocket rises, bursts, and the cards are flung out with the sparks ---- */
    fireworks: {
      dur: 2600,
      init(fx) {
        const { cx, cy } = fx;
        fx.hues = FIREWORK_HUES[fx.variant] || FIREWORK_HUES.all;
        fx.burstAt = 0.17;
        fx.bursts = [
          { t: 0.17, x: cx, y: cy, n: 300, speed: 560, main: true },
          { t: 0.36, x: cx - vw * 0.27, y: cy - vh * 0.2, n: 120, speed: 330 },
          { t: 0.45, x: cx + vw * 0.28, y: cy - vh * 0.12, n: 120, speed: 330 },
          { t: 0.55, x: cx + vw * 0.06, y: cy + vh * 0.22, n: 100, speed: 300 },
          { t: 0.63, x: cx - vw * 0.12, y: cy - vh * 0.3, n: 90, speed: 280 },
        ];
        fx.flashes = [];
      },
      draw(fx, ctx, t, dt) {
        const { cx, cy } = fx;
        // Night falls for a moment
        const dark = seg(t, 0, 0.12) * (1 - seg(t, 0.5, 1));
        ctx.fillStyle = `rgba(4, 5, 18, ${0.72 * dark})`;
        ctx.fillRect(0, 0, vw, vh);

        // Rocket
        if (t < fx.burstAt) {
          const k = ease.outCubic(seg(t, 0, fx.burstAt));
          const y = vh + 20 - (vh + 20 - cy) * k;
          const x = cx + Math.sin(k * 9) * 4;
          for (let i = 0; i < 3; i++) {
            fx.parts.push({ x, y, vx: rnd(-40, 40), vy: rnd(60, 160), drag: 2, g: 0.6, life: rnd(0.25, 0.5), max: 0.5, h: 40, sat: 100, l: 70, w: 2 });
          }
          ctx.globalCompositeOperation = "lighter";
          glow(ctx, x, y, 26, "hsla(45, 100%, 85%, ALPHA)", 0.95);
        }

        // Bursts
        for (const b of fx.bursts) {
          if (b.done || t < b.t) continue;
          b.done = true;
          const hue = fx.hues[Math.floor(Math.random() * fx.hues.length)];
          for (let i = 0; i < b.n; i++) {
            const ang = (i / b.n) * TAU + rnd(-0.04, 0.04);
            const sp = b.speed * (b.main ? rnd(0.35, 1.05) : rnd(0.55, 1));
            const h = Math.random() < 0.7 ? hue : fx.hues[Math.floor(Math.random() * fx.hues.length)];
            const life = rnd(1.0, b.main ? 1.9 : 1.4);
            fx.parts.push({ x: b.x, y: b.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, drag: 1.7, g: 1, life, max: life, h, sat: 100, l: rnd(60, 80), w: b.main ? 2.6 : 2 });
          }
          if (b.main) {                                   // golden willow trails
            for (let i = 0; i < 90; i++) {
              const ang = rnd(0, TAU), sp = rnd(80, 260), life = rnd(1.6, 2.4);
              fx.parts.push({ x: b.x, y: b.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, drag: 1.2, g: 0.55, life, max: life, h: 42, sat: 90, l: 72, w: 1.4 });
            }
          }
          fx.flashes.push({ x: b.x, y: b.y, t0: t, r: b.main ? 340 : 170 });
        }

        // Flashes
        ctx.globalCompositeOperation = "lighter";
        for (const f of fx.flashes) {
          const k = seg(t, f.t0, f.t0 + 0.12);
          if (k >= 1) continue;
          glow(ctx, f.x, f.y, f.r * (0.4 + k), "hsla(50, 100%, 92%, ALPHA)", 0.9 * (1 - k));
        }
        stepSparks(fx, ctx, dt);
      },
      card(fx, c, t, bx, by) {
        const bt = fx.burstAt + c.seed * 0.06;
        if (t < bt) return { x: fx.cx, y: fx.cy, s: 0, a: 0 };
        const p = ease.outExpo(seg(t, bt, bt + 0.6));
        const droop = Math.sin(p * Math.PI) * 50 * c.seed;  // a little fall, like sparks
        return {
          x: fx.cx + (bx - fx.cx) * p,
          y: fx.cy + (by - fx.cy) * p + droop,
          s: 0.15 + 0.85 * ease.outBack(seg(t, bt, bt + 0.55)),
          rot: (1 - p) * c.spin * Math.PI * 2.4,
          a: seg(t, bt, bt + 0.1),
        };
      },
    },

    /* ---- 2. WORMHOLE: cards spiral into a tunnel of light and come out the other side ---- */
    wormhole: {
      dur: 2700,
      init(fx) {
        for (let i = 0; i < 260; i++) fx.parts.push({ ang: rnd(0, TAU), z: Math.random(), sp: rnd(0.6, 1.4), h: rnd(180, 320) });
      },
      draw(fx, ctx, t, dt) {
        const { cx, cy, maxR } = fx;
        const env = seg(t, 0, 0.16) * (1 - seg(t, 0.72, 1));
        const swirl = t * 5;

        // Darken toward the throat
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
        g.addColorStop(0, `rgba(3, 0, 14, ${0.92 * env})`);
        g.addColorStop(1, `rgba(3, 0, 14, ${0.5 * env})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, vw, vh);

        ctx.globalCompositeOperation = "lighter";
        // Rings rushing toward you
        const N = 30;
        for (let i = 0; i < N; i++) {
          const z = mod(i / N + t * 1.7, 1);
          const r = 4 + Math.pow(z, 2.6) * maxR * 1.25;
          const wob = (1 - z) * 34;
          const hue = 190 + ((z * 140 + t * 160) % 150);      // cyan → violet → magenta
          ctx.strokeStyle = `hsla(${hue}, 95%, 66%, ${env * z * (1 - z) * 3.2})`;
          ctx.lineWidth = 0.6 + z * 6;
          ctx.beginPath();
          ctx.ellipse(cx + Math.cos(swirl + z * 5) * wob, cy + Math.sin(swirl + z * 5) * wob, r, r * 0.9, swirl * 0.4 + z * 3, 0, TAU);
          ctx.stroke();
        }
        // Spiral arms
        ctx.lineWidth = 2;
        for (let a = 0; a < 6; a++) {
          ctx.strokeStyle = `hsla(${200 + a * 22}, 100%, 70%, ${0.32 * env})`;
          ctx.beginPath();
          for (let r = 4; r < maxR; r += 10) {
            const th = (a / 6) * TAU + r * 0.011 + swirl;
            const x = cx + Math.cos(th) * r, y = cy + Math.sin(th) * r * 0.9;
            r === 4 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        // Streaks flying out of the throat
        ctx.lineCap = "round";
        for (const p of fx.parts) {
          const z0 = p.z;
          p.z += dt * 0.9 * p.sp;
          if (p.z > 1) { p.z -= 1; continue; }
          const r0 = Math.pow(z0, 2.4) * maxR * 1.3, r1 = Math.pow(p.z, 2.4) * maxR * 1.3;
          const th = p.ang + swirl * 0.25;
          ctx.strokeStyle = `hsla(${p.h}, 100%, 75%, ${env * p.z})`;
          ctx.lineWidth = 0.5 + p.z * 2.5;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(th) * r0, cy + Math.sin(th) * r0);
          ctx.lineTo(cx + Math.cos(th) * r1, cy + Math.sin(th) * r1);
          ctx.stroke();
        }
        // The bright throat
        const pulse = 1 + Math.sin(t * 30) * 0.08;
        glow(ctx, cx, cy, 120 * env * pulse, "hsla(195, 100%, 85%, ALPHA)", 0.9);
        glow(ctx, cx, cy, 40 * env, "hsla(0, 0%, 100%, ALPHA)", 1);
      },
      card(fx, c, t, bx, by) {
        const { r, th } = polar(fx, bx, by);
        if (t < 0.44) {                                   // pulled in
          const q = ease.inCubic(seg(t, 0.02 + (1 - c.seed) * 0.06, 0.44));
          const p = fromPolar(fx, r * (1 - q), th + q * 3);
          return { ...p, s: 1 - q * 0.94, a: 1 - seg(q, 0.75, 1), rot: q * 3 };
        }
        const k = ease.outCubic(seg(t, 0.48 + c.seed * 0.14, 0.95));   // pushed out
        const p = fromPolar(fx, r * k, th - (1 - k) * 3.4);
        return { ...p, s: 0.04 + 0.96 * k, a: seg(k, 0, 0.25), rot: -(1 - k) * 3.4 };
      },
    },

    /* ---- 3. BLACK HOLE: everything (panels too) is stretched and swallowed, then blasted back ---- */
    blackhole: {
      dur: 3000,
      init(fx) {
        fx.R = Math.min(vw, vh) * 0.085;
        for (let i = 0; i < 420; i++) {
          fx.parts.push({ r: rnd(0.3, 1.05) * fx.maxR, th: rnd(0, TAU), h: rnd(18, 48), l: rnd(60, 92) });
        }
        // Pull the interface into the hole too
        fx.anims = [];
        for (const el of [$(".topbar"), $("#discover"), $(".zoom"), $("#notice")]) {
          if (!el || el.hidden || !el.getClientRects().length) continue;
          const rc = el.getBoundingClientRect();
          const dx = fx.cx - (rc.left + rc.width / 2), dy = fx.cy - (rc.top + rc.height / 2);
          fx.anims.push(el.animate([
            { transform: "none", opacity: 1, offset: 0, easing: "cubic-bezier(.6, 0, .95, .45)" },
            { transform: `translate(${dx}px, ${dy}px) rotate(600deg) scale(.02)`, opacity: 0, offset: 0.48 },
            { transform: `translate(${dx}px, ${dy}px) scale(.02)`, opacity: 0, offset: 0.62, easing: "cubic-bezier(.16, 1, .3, 1)" },
            { transform: "none", opacity: 1, offset: 1 },
          ], { duration: fx.dur }));
        }
      },
      end(fx) { fx.anims?.forEach(a => a.cancel()); },
      draw(fx, ctx, t, dt) {
        const { cx, cy, maxR } = fx;
        const grow = ease.outCubic(seg(t, 0, 0.18));
        const collapse = ease.inCubic(seg(t, 0.48, 0.58));
        const R = fx.R * grow * (1 - collapse);
        const dark = seg(t, 0, 0.18) * (1 - seg(t, 0.6, 0.8));
        const sucking = t < 0.52;

        // Gravity darkens space around the hole
        const g = ctx.createRadialGradient(cx, cy, R, cx, cy, maxR);
        g.addColorStop(0, `rgba(0, 0, 0, ${0.92 * dark})`);
        g.addColorStop(0.35, `rgba(4, 2, 10, ${0.7 * dark})`);
        g.addColorStop(1, `rgba(8, 4, 16, ${0.45 * dark})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, vw, vh);

        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        // Debris spiralling in (then flung out after the collapse)
        for (const p of fx.parts) {
          const r0 = p.r, th0 = p.th;
          const n = p.r / maxR;
          if (sucking) {
            p.th += dt * (2.6 / (n + 0.06));
            p.r -= dt * (90 + 1400 * Math.pow(1 - Math.min(1, n), 2)) * grow;
            if (p.r < R * 1.05) { p.r = rnd(0.8, 1.1) * maxR; p.th = rnd(0, TAU); continue; }
          } else if (t > 0.58) {
            p.r += dt * (900 + p.l * 8);
            p.th += dt * 1.2;
          } else continue;
          const a = (sucking ? Math.min(1, (1 - n) * 1.8) : 1 - seg(t, 0.6, 0.95)) * 0.9;
          ctx.strokeStyle = `hsla(${p.h}, 100%, ${p.l}%, ${a})`;
          ctx.lineWidth = 1.2 + (1 - Math.min(1, n)) * 2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(th0) * r0, cy + Math.sin(th0) * r0 * 0.75);
          ctx.lineTo(cx + Math.cos(p.th) * p.r, cy + Math.sin(p.th) * p.r * 0.75);
          ctx.stroke();
        }

        if (R > 0.5) {
          const spin = t * 22;
          const disk = (from, to) => {     // accretion disk, tilted, hottest on the inside
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(1, 0.3);
            for (let k = 0; k < 16; k++) {
              const rr = R * (1.35 + k * 0.13);
              for (let s2 = 0; s2 < 36; s2++) {
                const a0 = (s2 / 36) * TAU;
                if (a0 < from || a0 > to) continue;
                const beam = 0.55 + 0.45 * Math.cos(a0 + spin * 0.15);      // one side brighter
                ctx.strokeStyle = `hsla(${38 - k * 1.6}, 100%, ${88 - k * 3.2}%, ${(0.5 - k * 0.026) * beam * grow})`;
                ctx.lineWidth = R * 0.16;
                ctx.beginPath();
                ctx.arc(0, 0, rr, a0 + spin * (0.1 + 0.4 / (k + 1)), a0 + spin * (0.1 + 0.4 / (k + 1)) + TAU / 36 + 0.02);
                ctx.stroke();
              }
            }
            ctx.restore();
          };
          disk(Math.PI, TAU);                              // far half (behind)
          // Light bent over the top of the hole
          ctx.save();
          ctx.translate(cx, cy);
          ctx.scale(1, 0.62);
          ctx.strokeStyle = `hsla(36, 100%, 75%, ${0.55 * grow})`;
          ctx.lineWidth = R * 0.22;
          ctx.beginPath(); ctx.arc(0, 0, R * 1.45, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
          ctx.restore();
          // Event horizon
          ctx.globalCompositeOperation = "source-over";
          ctx.fillStyle = "#000";
          ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
          ctx.globalCompositeOperation = "lighter";
          disk(0, Math.PI);                                // near half (in front)
          // Photon ring
          ctx.strokeStyle = `hsla(40, 100%, 90%, ${0.85 * grow})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(cx, cy, R * 1.04, 0, TAU); ctx.stroke();
        }

        // Collapse: flash and shockwave
        if (t > 0.55) {
          const k = seg(t, 0.56, 0.86);
          if (k < 1) {
            ctx.globalCompositeOperation = "lighter";
            ctx.strokeStyle = `hsla(${195 + k * 85}, 100%, ${92 - k * 20}%, ${1 - k})`;
            ctx.lineWidth = 34 * (1 - k) + 2;
            ctx.beginPath(); ctx.arc(cx, cy, k * maxR * 1.15, 0, TAU); ctx.stroke();
          }
          const f = 1 - seg(t, 0.56, 0.68);
          if (f > 0) {
            ctx.globalCompositeOperation = "source-over";
            ctx.fillStyle = `rgba(255, 252, 240, ${0.75 * f})`;
            ctx.fillRect(0, 0, vw, vh);
          }
        }

        // Shake the wall as it collapses
        const sh = t > 0.52 && t < 0.74 ? 12 * (1 - seg(t, 0.52, 0.74)) : 0;
        canvas.style.transform = sh ? `translate(${rnd(-sh, sh).toFixed(1)}px, ${rnd(-sh, sh).toFixed(1)}px)` : "";
      },
      card(fx, c, t, bx, by) {
        const { r, th } = polar(fx, bx, by);
        if (t < 0.5) {                                    // swallowed, faster and faster
          const q = Math.pow(seg(t, c.seed * 0.14, 0.5), 2.3);
          const th2 = th + q * q * 7;
          const p = fromPolar(fx, r * (1 - q), th2);
          return { ...p, s: 1 - Math.pow(q, 0.8) * 0.96, a: 1 - seg(q, 0.85, 1), rot: q * q * 7, stretch: 1 + 4.5 * q, phi: th2 };
        }
        if (t < 0.6) return { x: fx.cx, y: fx.cy, s: 0, a: 0 };
        const k = ease.outExpo(seg(t, 0.6 + c.seed * 0.06, 0.96));   // blasted back out
        const th2 = th - (1 - k) * 2.2;
        const p = fromPolar(fx, r * k, th2);
        return { ...p, s: k, a: seg(k, 0, 0.2), rot: -(1 - k) * 2.2, stretch: 1 + (1 - k) * 2.5, phi: th2 };
      },
    },
  };

  /* ---- 4. SOUND WAVE (Voice): rings pulse out like sound, and the wall bounces as each wave passes ---- */
  EFFECTS.soundwave = {
    dur: 2600,
    init(fx) { fx.hue = 190 + Math.random() * 120; },
    draw(fx, ctx, t) {
      const { cx, cy, maxR } = fx;
      const env = seg(t, 0, 0.12) * (1 - seg(t, 0.75, 1));
      ctx.fillStyle = `rgba(6, 4, 22, ${0.6 * env})`;
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalCompositeOperation = "lighter";
      // Expanding rings, one per beat
      for (let i = 0; i < 6; i++) {
        const k = seg(t, i * 0.11, i * 0.11 + 0.55);
        if (k <= 0 || k >= 1) continue;
        ctx.strokeStyle = `hsla(${fx.hue + i * 18}, 100%, 70%, ${(1 - k) * env})`;
        ctx.lineWidth = 10 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(cx, cy, k * maxR * 1.1, 0, TAU); ctx.stroke();
      }
      // A big equaliser in the middle
      const bars = 32, bw = Math.min(vw, 900) / bars;
      for (let i = 0; i < bars; i++) {
        const x = cx - (bars / 2 - i) * bw;
        const h = (0.25 + 0.75 * Math.abs(Math.sin(t * 18 + i * 0.7) * Math.sin(t * 7 + i * 0.3))) * vh * 0.28 * env;
        ctx.fillStyle = `hsla(${fx.hue + i * 4}, 100%, 65%, ${0.55 * env})`;
        ctx.fillRect(x + 2, cy - h / 2, bw - 4, h);
      }
      glow(ctx, cx, cy, 90 * env, `hsla(${fx.hue}, 100%, 80%, ALPHA)`, 0.8);
    },
    card(fx, c, t, bx, by) {
      const { r, th } = polar(fx, bx, by);
      // Each wave reaches a card at a moment that depends on its distance
      let push = 0;
      for (let i = 0; i < 6; i++) {
        const arrive = i * 0.11 + (r / (fx.maxR * 1.1)) * 0.55;
        const k = (t - arrive) / 0.12;
        if (k > 0 && k < 1) push += Math.sin(k * Math.PI) * (1 - i * 0.12);
      }
      const p = fromPolar(fx, r + push * 38, th);
      return { ...p, s: 1 + push * 0.12, a: 1 };
    },
  };

  /* ---- 6. THE DEVOURER (deleting a post): an original cosmic being that feasts on it ---- */
  EFFECTS.devourer = {
    dur: 3800,
    init(fx) {
      // aim the maw at the post being eaten (its biggest card on screen)
      const mine = cards.filter(c => c.post.id === fx.opts.postId && c.visible).sort((a, b) => b.w - a.w)[0];
      fx.mx = mine ? mine.sx + mine.w / 2 : vw / 2;
      fx.my = mine ? mine.sy + mine.h / 2 : vh / 2;
      fx.R = Math.min(vw, vh) * 0.2;
      // the body: drifting clouds of dark nebula around and above the maw
      fx.blobs = Array.from({ length: 46 }, () => {
        const a = rnd(Math.PI * 0.95, Math.PI * 2.05), r = rnd(0.2, 1.25);
        return { ox: Math.cos(a) * r * vw * 0.5, oy: Math.sin(a) * r * vh * 0.55 - vh * 0.05, R: rnd(0.12, 0.3) * Math.max(vw, vh), ph: rnd(0, TAU), hue: rnd(255, 290) };
      });
      // constellation veins across the body
      fx.nodes = Array.from({ length: 22 }, () => ({ ox: rnd(-0.48, 0.48) * vw, oy: rnd(-0.55, -0.08) * vh, ph: rnd(0, TAU) }));
      fx.eyes = Array.from({ length: 7 }, (_, i) => { const a = Math.PI * (1.18 + (i / 6) * 0.64); return { a, s: i === 3 ? 1.3 : 0.75 + Math.random() * 0.35, blink: rnd(0, 1) }; });
      fx.crumbs = [];
    },
    end(fx) { fx.opts.onEnd?.(); },
    draw(fx, ctx, t, dt) {
      const { mx, my, R } = fx;
      const rise = ease.outCubic(seg(t, 0, 0.22)), leave = ease.inCubic(seg(t, 0.84, 1));
      const open = ease.outBack(seg(t, 0.16, 0.36)) * (1 - ease.inCubic(seg(t, 0.74, 0.8)));
      const chomp = seg(t, 0.78, 0.84) * (1 - seg(t, 0.84, 0.92));
      const bodyA = rise * (1 - leave), lift = (1 - rise) * vh * 0.4 + leave * vh * 0.5;
      // darkness falls
      ctx.fillStyle = `rgba(3, 0, 10, ${0.82 * bodyA})`;
      ctx.fillRect(0, 0, vw, vh);
      // the body
      for (const b of fx.blobs) {
        const x = mx + b.ox + Math.sin(t * 3 + b.ph) * 14, y = my + b.oy - lift + Math.cos(t * 2.4 + b.ph) * 10, r = b.R * (0.92 + 0.08 * Math.sin(t * 4 + b.ph));
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `hsla(${b.hue}, 60%, 10%, ${0.75 * bodyA})`); g.addColorStop(0.6, `hsla(${b.hue}, 70%, 14%, ${0.35 * bodyA})`); g.addColorStop(1, "hsla(270, 60%, 8%, 0)");
        ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = "lighter";
      // a faint violet glow through the nebula, so its vast shape reads against the dark
      for (const b of fx.blobs) {
        const x = mx + b.ox + Math.sin(t * 3 + b.ph) * 14, y = my + b.oy - lift + Math.cos(t * 2.4 + b.ph) * 10;
        glow(ctx, x, y, b.R * 0.7, `hsla(${b.hue + 10}, 90%, 55%, ALPHA)`, 0.07 * bodyA);
      }
      // glowing veins: a constellation inside it
      ctx.lineWidth = 1.2;
      for (let i = 0; i < fx.nodes.length; i++) {
        const n = fx.nodes[i], m = fx.nodes[(i * 7 + 3) % fx.nodes.length];
        const a = (0.25 + 0.2 * Math.sin(t * 5 + n.ph)) * bodyA;
        ctx.strokeStyle = `hsla(${200 + i * 6}, 100%, 70%, ${a})`;
        ctx.beginPath(); ctx.moveTo(mx + n.ox, my + n.oy - lift); ctx.lineTo(mx + m.ox, my + m.oy - lift); ctx.stroke();
        glow(ctx, mx + n.ox, my + n.oy - lift, 6, "hsla(200, 100%, 85%, ALPHA)", a * 2);
      }
      // a crown of pale eyes above the maw, opening one by one
      for (const [i, e] of fx.eyes.entries()) {
        const ex = mx + Math.cos(e.a) * R * 2.1, ey = my + Math.sin(e.a) * R * 1.7 - lift;
        const lid = seg(t, 0.1 + i * 0.03, 0.24 + i * 0.03) * (1 - seg(t, 0.86, 0.95)) * (Math.sin(t * 9 + e.blink * 20) > 0.97 ? 0.1 : 1);
        if (lid < 0.02) continue;
        const ew = R * 0.2 * e.s, eh = ew * 0.45 * lid;
        glow(ctx, ex, ey, ew * 2.2, "hsla(275, 100%, 80%, ALPHA)", 0.45 * bodyA);
        ctx.fillStyle = document.documentElement.classList.contains("season-halloween") ? `rgba(255, 150, 40, ${0.95 * bodyA})` : `rgba(240, 225, 255, ${0.95 * bodyA})`;
        ctx.beginPath(); ctx.ellipse(ex, ey, ew, eh, 0, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = `rgba(10, 0, 20, ${bodyA})`;                               // slit pupil, watching the post
        const look = Math.atan2(my - ey, mx - ex);
        ctx.beginPath(); ctx.ellipse(ex + Math.cos(look) * ew * 0.25, ey + Math.sin(look) * eh * 0.2, ew * 0.12, eh * 0.9, 0, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = "lighter";
      }
      // the maw: a vortex ringed with teeth of light
      const r = R * open;
      if (r > 2) {
        ctx.globalCompositeOperation = "source-over";
        const vg = ctx.createRadialGradient(mx, my, 0, mx, my, r);
        vg.addColorStop(0, "rgba(0, 0, 0, 1)"); vg.addColorStop(0.7, "rgba(18, 0, 34, .96)"); vg.addColorStop(1, "rgba(60, 10, 90, .9)");
        ctx.fillStyle = vg; ctx.beginPath(); ctx.arc(mx, my, r, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = "lighter";
        for (let a = 0; a < 5; a++) {                                                // swirling arms inside
          ctx.strokeStyle = `hsla(${270 + a * 12}, 100%, 65%, ${0.35 * bodyA})`; ctx.lineWidth = 2;
          ctx.beginPath();
          for (let k = 0; k <= 30; k++) { const q = k / 30, th = (a / 5) * TAU + q * 4 - t * 9, rr = r * (1 - q); k ? ctx.lineTo(mx + Math.cos(th) * rr, my + Math.sin(th) * rr) : ctx.moveTo(mx + Math.cos(th) * rr, my + Math.sin(th) * rr); }
          ctx.stroke();
        }
        const N = 30, spin = t * 0.8;
        ctx.fillStyle = `hsla(285, 100%, 88%, ${0.9 * bodyA})`;
        for (let i = 0; i < N; i++) {                                                // teeth
          const a = spin + (i / N) * TAU, w = TAU / N * 0.42, len = r * (i % 2 ? 0.26 : 0.38);
          ctx.beginPath();
          ctx.moveTo(mx + Math.cos(a - w) * r, my + Math.sin(a - w) * r);
          ctx.lineTo(mx + Math.cos(a) * (r - len), my + Math.sin(a) * (r - len));
          ctx.lineTo(mx + Math.cos(a + w) * r, my + Math.sin(a + w) * r);
          ctx.fill();
        }
        ctx.strokeStyle = `hsla(280, 100%, 80%, ${0.8 * bodyA})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(mx, my, r, 0, TAU); ctx.stroke();
      }
      // the post crumbles into glowing dust that spirals into the maw
      if (t > 0.36 && t < 0.78) {
        for (let i = 0; i < 6; i++) fx.crumbs.push({ a: rnd(0, TAU), d: rnd(0.6, 1.6) * R, life: rnd(0.5, 0.9), max: 0.9, hue: rnd(30, 60) });
      }
      fx.crumbs = fx.crumbs.filter(c => {
        c.life -= dt; c.d *= 1 - dt * 2.4; c.a += dt * (4 + R / Math.max(8, c.d));
        if (c.life <= 0 || c.d < 3) return false;
        ctx.fillStyle = `hsla(${c.hue}, 100%, 80%, ${Math.min(1, c.life * 2)})`;
        ctx.fillRect(mx + Math.cos(c.a) * c.d, my + Math.sin(c.a) * c.d, 2.5, 2.5);
        return true;
      });
      // CHOMP
      if (chomp > 0) { glow(ctx, mx, my, R * 2.5, "hsla(285, 100%, 92%, ALPHA)", chomp); }
      ctx.globalCompositeOperation = "source-over";
      const sh = t > 0.76 && t < 0.92 ? 10 * (1 - seg(t, 0.76, 0.92)) : t < 0.24 ? 3 * rise : 0;
      canvas.style.transform = sh ? `translate(${rnd(-sh, sh).toFixed(1)}px, ${rnd(-sh, sh).toFixed(1)}px)` : "";
    },
    card(fx, c, t, bx, by) {
      if (c.post.id === fx.opts.postId) {                                             // the meal
        if (t < 0.34) { const q = seg(t, 0.12, 0.34); return { x: bx + rnd(-2, 2) * q, y: by + rnd(-2, 2) * q, s: 1, a: 1, rot: Math.sin(t * 40) * 0.03 * q }; }
        const k = ease.inCubic(seg(t, 0.34, 0.74));
        const ang = Math.atan2(by - fx.my, bx - fx.mx) + k * 6, r = Math.hypot(bx - fx.mx, by - fx.my) * (1 - k);
        return { x: fx.mx + Math.cos(ang) * r, y: fx.my + Math.sin(ang) * r, s: 1 - k * 0.97, a: t < 0.76 ? 1 - seg(k, 0.85, 1) : 0, rot: k * 7, stretch: 1 + k * 2, phi: ang };
      }
      // everything else feels the pull, then settles
      const pull = (seg(t, 0.15, 0.4) * (1 - seg(t, 0.8, 1))) * 0.07;
      return { x: bx + (fx.mx - bx) * pull, y: by + (fx.my - by) * pull, s: 1 - pull, a: 1 };
    },
  };

  // Escape skips an effect that is playing
  window.addEventListener("keydown", e => { if (fx && e.key === "Escape") endFx(); });

  /* ---------------------------------------------------------
     12. UNIVERSE THEME
     A live background: the Milky Way and nebulae far behind, and a
     3D field of stars and spiral galaxies you fly through when you
     zoom. Moving the wall moves space (near stars faster), and fast
     moves stretch the stars into warp streaks.
     --------------------------------------------------------- */
  const Space = {
    cv: $("#space"),
    ctx: null, w: 0, h: 0, dpr: 1,
    stars: [], galaxies: [], milky: null,
    running: false, raf: 0, t0: performance.now(),

    gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; },

    // A spiral galaxy, drawn once into a small canvas
    makeGalaxy(hueCore, hueArm, arms, size = 256) {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const g = c.getContext("2d");
      const m = size / 2;
      g.globalCompositeOperation = "lighter";
      const halo = g.createRadialGradient(m, m, 0, m, m, m);
      halo.addColorStop(0, `hsla(${hueArm}, 70%, 70%, .22)`);
      halo.addColorStop(1, "hsla(0, 0%, 0%, 0)");
      g.fillStyle = halo; g.fillRect(0, 0, size, size);
      for (let i = 0; i < 3200; i++) {
        const arm = i % arms;
        const t = Math.pow(Math.random(), 0.75);
        const r = t * m * 0.92;
        const ang = (arm / arms) * TAU + t * 5.2 + this.gauss() * 0.42 * (1 - t * 0.4);
        const x = m + Math.cos(ang) * r + this.gauss() * 5;
        const y = m + Math.sin(ang) * r + this.gauss() * 5;
        const hue = t < 0.35 ? hueCore : hueArm;
        g.fillStyle = `hsla(${hue}, 80%, ${62 + Math.random() * 30}%, ${0.1 + Math.random() * 0.3})`;
        const s = Math.random() < 0.04 ? 2.2 : 1.1;
        g.fillRect(x, y, s, s);
      }
      const core = g.createRadialGradient(m, m, 0, m, m, m * 0.24);
      core.addColorStop(0, "rgba(255, 250, 235, 1)");
      core.addColorStop(0.35, `hsla(${hueCore}, 90%, 78%, .55)`);
      core.addColorStop(1, "hsla(0, 0%, 0%, 0)");
      g.fillStyle = core; g.fillRect(0, 0, size, size);
      return c;
    },

    // The Milky Way band with dust lanes and nebulae, drawn once per screen size
    makeMilkyWay(D) {
      const c = document.createElement("canvas");
      c.width = c.height = D;
      const g = c.getContext("2d");
      g.translate(D / 2, D / 2);
      g.rotate(-0.42);
      const bandY = x => Math.sin(x * 0.0035) * D * 0.04;
      g.globalCompositeOperation = "lighter";
      // glowing clouds along the band
      for (let i = 0; i < 160; i++) {
        const x = (Math.random() - 0.5) * D;
        const y = bandY(x) + this.gauss() * D * 0.05;
        const r = D * (0.03 + Math.random() * 0.09);
        const hue = [265, 285, 220, 200, 30, 330][i % 6];
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `hsla(${hue}, 70%, ${55 + Math.random() * 20}%, ${0.05 + Math.random() * 0.06})`);
        gr.addColorStop(1, "hsla(0, 0%, 0%, 0)");
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // dense star dust in the band
      for (let i = 0; i < 9000; i++) {
        const x = (Math.random() - 0.5) * D;
        const y = bandY(x) + this.gauss() * D * 0.07;
        g.fillStyle = `hsla(${Math.random() < 0.5 ? 220 : 40}, 60%, 90%, ${0.2 + Math.random() * 0.6})`;
        const s = Math.random() < 0.05 ? 1.6 : 0.8;
        g.fillRect(x, y, s, s);
      }
      // dark dust lanes
      g.globalCompositeOperation = "destination-out";
      for (let i = 0; i < 70; i++) {
        const x = (Math.random() - 0.5) * D;
        const y = bandY(x) + this.gauss() * D * 0.015;
        const r = D * (0.015 + Math.random() * 0.035);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, "rgba(0,0,0,.35)");
        gr.addColorStop(1, "rgba(0,0,0,0)");
        g.save(); g.translate(x, y); g.scale(2.4, 0.6);
        g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2);
        g.restore();
      }
      // a few nebulae away from the band
      g.globalCompositeOperation = "lighter";
      for (const [nx, ny, hue] of [[-0.3, -0.24, 330], [0.28, 0.22, 175], [0.12, -0.3, 285], [-0.2, 0.3, 20]]) {
        for (let j = 0; j < 14; j++) {
          const x = nx * D + this.gauss() * D * 0.05, y = ny * D + this.gauss() * D * 0.05;
          const r = D * (0.03 + Math.random() * 0.06);
          const gr = g.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, `hsla(${hue + this.gauss() * 20}, 85%, 60%, ${0.05 + Math.random() * 0.05})`);
          gr.addColorStop(1, "hsla(0,0%,0%,0)");
          g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
        }
      }
      // scattered background stars
      g.setTransform(1, 0, 0, 1, 0, 0);
      for (let i = 0; i < 2500; i++) {
        g.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.5})`;
        g.fillRect(Math.random() * D, Math.random() * D, 0.8, 0.8);
      }
      return c;
    },

    resize() {
      this.dpr = Math.min(devicePixelRatio || 1, 1.5);
      this.w = innerWidth; this.h = innerHeight;
      this.cv.width = Math.round(this.w * this.dpr);
      this.cv.height = Math.round(this.h * this.dpr);
      this.ctx = this.cv.getContext("2d");
      this.milky = this.makeMilkyWay(Math.ceil(Math.hypot(this.w, this.h) * 1.12));
      const n = clamp(Math.round((this.w * this.h) / 1700), 380, 1100);
      this.stars = Array.from({ length: n }, () => ({
        x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random(),
        hue: Math.random() < 0.7 ? 220 : Math.random() < 0.5 ? 40 : 0,
        size: Math.random() < 0.06 ? 2.2 : 1.1, tw: Math.random() * TAU, px: null, py: null,
      }));
      if (!this.galaxies.length) {
        const kinds = [[45, 215, 2], [30, 25, 3], [200, 260, 2], [330, 290, 4], [50, 190, 2], [15, 340, 3], [190, 200, 2]];
        this.galaxies = kinds.map(([a, b, arms]) => ({
          img: this.makeGalaxy(a, b, arms), x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random(),
          rot: Math.random() * TAU, tilt: 0.35 + Math.random() * 0.55, spin: (Math.random() < 0.5 ? -1 : 1) * 0.02,
        }));
      }
    },

    frame() {
      if (!this.running) return;
      const { ctx, w, h } = this;
      const time = (performance.now() - this.t0) / 1000;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const bg = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.7);
      bg.addColorStop(0, "#0b0c26"); bg.addColorStop(0.6, "#05051a"); bg.addColorStop(1, "#010108");
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

      // Milky Way: turns very slowly, nudged a little by panning
      const D = this.milky.width;
      ctx.save();
      ctx.translate(w / 2 + Math.tanh(-cam.x / 4000) * 60, h / 2 + Math.tanh(-cam.y / 4000) * 60);
      ctx.rotate(time * 0.004);
      ctx.globalAlpha = 0.95;
      ctx.drawImage(this.milky, -D / 2, -D / 2);
      ctx.restore();
      ctx.globalAlpha = 1;

      // 3D field: depth follows the wall's zoom, and drifts slowly forward on its own
      const cx = w / 2, cy = h / 2, span = Math.max(w, h) * 1.3;
      const zShift = cam.z * 0.6 + time * 0.006;
      const panX = cam.x * 0.18, panY = cam.y * 0.18;
      const project = (o, size) => {
        const z = 0.04 + mod(o.z - zShift, 1) * 0.96;          // 1 = far, 0.04 = right in front of you
        const wx = mod(o.x * span - panX * (1 - z * 0.7), span * 2) - span;
        const wy = mod(o.y * span - panY * (1 - z * 0.7), span * 2) - span;
        return { x: cx + (wx / z) * 0.5, y: cy + (wy / z) * 0.5, z, s: size / z };
      };

      ctx.globalCompositeOperation = "lighter";
      for (const g of this.galaxies) {
        const p = project(g, 1);
        const size = 42 * p.s;
        const a = smooth(1, 0.75, p.z) * smooth(0.04, 0.2, p.z);   // fade in from afar, out as it passes
        if (a < 0.01 || size < 4 || p.x < -size || p.x > w + size || p.y < -size || p.y > h + size) continue;
        ctx.save();
        ctx.globalAlpha = a * 0.85;
        ctx.translate(p.x, p.y);
        ctx.rotate(g.rot + time * g.spin);
        ctx.scale(1, g.tilt);
        ctx.drawImage(g.img, -size / 2, -size / 2, size, size);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      if (document.documentElement.dataset.theme === "universe") Eggs.paintConstellations(ctx, w, h, time);

      // Supernovas from taps: a flash, a ring and a fading glow
      if (this.novas?.length) {
        ctx.globalCompositeOperation = "lighter";
        this.novas = this.novas.filter(n => {
          const age = (performance.now() - n.t) / 1000;
          if (age > 2.2) return false;
          const k = age / 2.2;
          glow(ctx, n.x, n.y, 30 + k * 220, "hsla(45, 100%, 85%, ALPHA)", 0.9 * (1 - k));
          ctx.strokeStyle = `hsla(${200 + k * 100}, 100%, 80%, ${1 - k})`; ctx.lineWidth = 3 * (1 - k) + 0.5;
          ctx.beginPath(); ctx.arc(n.x, n.y, k * 260, 0, TAU); ctx.stroke();
          return true;
        });
      }
      ctx.lineCap = "round";
      for (const s of this.stars) {
        const p = project(s, s.size);
        const tw = 0.7 + 0.3 * Math.sin(time * 2.2 + s.tw);
        const a = Math.min(1, (1 - p.z) * 1.6) * tw;
        const r = Math.min(3.2, p.s * 0.55);
        const moved = s.px !== null ? Math.hypot(p.x - s.px, p.y - s.py) : 0;
        if (moved > 1.5 && moved < 260) {                       // warp streak
          ctx.strokeStyle = `hsla(${s.hue}, 70%, 88%, ${a})`;
          ctx.lineWidth = r;
          ctx.beginPath(); ctx.moveTo(s.px, s.py); ctx.lineTo(p.x, p.y); ctx.stroke();
        } else {
          ctx.fillStyle = `hsla(${s.hue}, 70%, 88%, ${a})`;
          ctx.fillRect(p.x - r / 2, p.y - r / 2, r, r);
          if (r > 2) { ctx.fillStyle = `hsla(${s.hue}, 80%, 80%, ${a * 0.15})`; ctx.fillRect(p.x - r * 2, p.y - r * 2, r * 4, r * 4); }
        }
        s.px = p.x; s.py = p.y;
      }
      if (!calm) this.raf = requestAnimationFrame(() => this.frame());
    },

    start() {
      if (this.running) return;
      if (!this.ctx || this.w !== innerWidth || this.h !== innerHeight) this.resize();
      this.running = true;
      this.cv.hidden = false;
      this.frame();
    },
    stop() {
      if (!this.running) return;
      this.running = false;
      cancelAnimationFrame(this.raf);
      this.cv.hidden = true;
    },
    tap(x, y) { (this.novas = this.novas || []).push({ x, y, t: performance.now() }); Sound.sfx("nova"); if (calm) this.frame(); },
  };
  let spaceResizeT;
  window.addEventListener("resize", () => {
    clearTimeout(spaceResizeT);
    spaceResizeT = setTimeout(() => { if (Space.running) Space.resize(); }, 200);
  });

  /* ---------------------------------------------------------
     13. AMAZON THEME
     A rainforest at night. Back canvas (#space): sky, moonbeams,
     three layers of jungle silhouettes, mist, fireflies, glowing
     frogs on branches. Front canvas (#sceneFront, above the posts):
     swaying leaves in the corners, frogs sitting on them, and the
     nearest fireflies.
     --------------------------------------------------------- */
  const Jungle = {
    cv: $("#space"), front: $("#sceneFront"), fringeEl: $("#fringe"),
    ctx: null, fctx: null, w: 0, h: 0, dpr: 1, TW: 0,
    far: null, mid: null, near: null,
    perches: [], flies: [], frogs: [], fringe: [], sprites: new Map(),
    running: false, raf: 0, t0: performance.now(), mouse: { x: -9999, y: -9999 },

    // Soft glow, cached per colour
    sprite(hue, light = 60) {
      const key = hue + ":" + light;
      if (this.sprites.has(key)) return this.sprites.get(key);
      const S = 64, c = document.createElement("canvas");
      c.width = c.height = S;
      const g = c.getContext("2d");
      const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      gr.addColorStop(0, `hsla(${hue}, 100%, ${Math.min(96, light + 32)}%, 1)`);
      gr.addColorStop(0.16, `hsla(${hue}, 100%, ${light}%, .75)`);
      gr.addColorStop(0.45, `hsla(${hue}, 100%, ${light}%, .16)`);
      gr.addColorStop(1, `hsla(${hue}, 100%, ${light}%, 0)`);
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
      this.sprites.set(key, c);
      return c;
    },

    // A palm or fern frond, drawn once. Pivot at (0, py).
    makeFrond(len, color, { leaflets = 30, droop = 0.35, leafLen = 0.3, leafW = 0.05 } = {}) {
      const W = Math.ceil(len * 1.08), H = Math.ceil(len * (0.75 + droop)), py = Math.round(len * 0.36);
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const g = c.getContext("2d");
      const pt = t => ({ x: t * len, y: py + droop * len * t * t });
      g.strokeStyle = color; g.fillStyle = color; g.lineCap = "round";
      g.lineWidth = Math.max(2, len * 0.014);
      g.beginPath(); g.moveTo(0, py);
      for (let t = 0; t <= 1.001; t += 0.05) { const p = pt(t); g.lineTo(p.x, p.y); }
      g.stroke();
      for (let i = 1; i <= leaflets; i++) {
        const t = i / (leaflets + 1);
        const p = pt(t), q = pt(t + 0.01);
        const ang = Math.atan2(q.y - p.y, q.x - p.x);
        const L = len * leafLen * (1 - t * 0.55) * (0.85 + Math.random() * 0.3);
        for (const side of [-1, 1]) {
          const a = ang + side * (0.75 + t * 0.35);
          const ex = p.x + Math.cos(a) * L, ey = p.y + Math.sin(a) * L + L * 0.25;
          const nx = Math.cos(a + Math.PI / 2) * L * leafW * 2.2, ny = Math.sin(a + Math.PI / 2) * L * leafW * 2.2;
          g.beginPath();
          g.moveTo(p.x, p.y);
          g.quadraticCurveTo((p.x + ex) / 2 + nx, (p.y + ey) / 2 + ny, ex, ey);
          g.quadraticCurveTo((p.x + ex) / 2 - nx, (p.y + ey) / 2 - ny, p.x, p.y);
          g.fill();
        }
      }
      return { img: c, px: 0, py };
    },

    // A split-leaf monstera, pivot at the bottom of its stem
    makeMonstera(size, color) {
      const W = Math.ceil(size * 1.2), H = Math.ceil(size * 1.5);
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const g = c.getContext("2d");
      const cx = W / 2, cy = size * 0.62;
      g.fillStyle = color; g.strokeStyle = color;
      g.lineWidth = size * 0.035; g.lineCap = "round";
      g.beginPath(); g.moveTo(cx, H - 2); g.quadraticCurveTo(cx + size * 0.08, cy + size * 0.5, cx, cy + size * 0.2); g.stroke();
      g.beginPath();
      g.moveTo(cx, cy - size * 0.32);
      g.bezierCurveTo(cx + size * 0.62, cy - size * 0.62, cx + size * 0.66, cy + size * 0.42, cx, cy + size * 0.5);
      g.bezierCurveTo(cx - size * 0.66, cy + size * 0.42, cx - size * 0.62, cy - size * 0.62, cx, cy - size * 0.32);
      g.fill();
      g.globalCompositeOperation = "destination-out";
      for (let i = 0; i < 9; i++) {                       // the slits
        const side = i % 2 ? 1 : -1;
        const a = -Math.PI / 2 + side * (0.45 + Math.floor(i / 2) * 0.32);
        g.lineWidth = size * 0.035;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * size * 0.3, cy + Math.sin(a) * size * 0.3);
        g.lineTo(cx + Math.cos(a) * size * 0.75, cy + Math.sin(a) * size * 0.75);
        g.stroke();
      }
      for (let i = 0; i < 4; i++) {                       // the holes
        const a = -Math.PI / 2 + (i - 1.5) * 0.7;
        g.beginPath(); g.ellipse(cx + Math.cos(a) * size * 0.2, cy + Math.sin(a) * size * 0.2, size * 0.035, size * 0.06, a, 0, TAU); g.fill();
      }
      return { img: c, px: cx, py: H - 2, top: { x: 0, y: -(H - 2 - (cy - size * 0.3)) } };
    },

    // A horizontally tileable layer
    layer(shapes) {
      const c = document.createElement("canvas");
      c.width = this.TW; c.height = this.h;
      const g = c.getContext("2d");
      for (const dx of [-this.TW, 0, this.TW]) { g.save(); g.translate(dx, 0); shapes.forEach(fn => fn(g)); g.restore(); }
      return c;
    },

    buildForest() {
      const { TW, h } = this;
      // Far: misty canopy line with a few giant emergent trees
      const far = [];
      for (let x = -40; x < TW + 40; x += 24) {
        const y = h * 0.44 + Math.sin(x * 0.006) * h * 0.04 + rnd(-h * 0.025, h * 0.025), r = rnd(26, 58);
        far.push(g => { g.fillStyle = "#08201a"; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.fillRect(x - r, y, r * 2, h - y); });
      }
      for (let i = 0; i < 4; i++) {
        const x = rnd(0, TW), top = h * rnd(0.18, 0.28), cw = rnd(90, 150);
        far.push(g => {
          g.fillStyle = "#08201a";
          g.fillRect(x - 5, top, 10, h);
          g.beginPath(); g.ellipse(x, top, cw, cw * 0.32, 0, 0, TAU); g.fill();
          g.beginPath(); g.ellipse(x - cw * 0.5, top + 12, cw * 0.55, cw * 0.25, 0, 0, TAU); g.fill();
          g.beginPath(); g.ellipse(x + cw * 0.5, top + 10, cw * 0.55, cw * 0.25, 0, 0, TAU); g.fill();
        });
      }
      this.far = this.layer(far);

      // Mid: trunks, a canopy ceiling and hanging vines
      const mid = [];
      const col = "#04140e";
      for (let i = 0; i < Math.ceil(TW / 170); i++) {
        const x = rnd(0, TW), w = rnd(14, 38), lean = rnd(-30, 30);
        mid.push(g => {
          g.fillStyle = col;
          g.beginPath(); g.moveTo(x - w / 2, h); g.quadraticCurveTo(x + lean, h * 0.5, x - w * 0.35 + lean, -10);
          g.lineTo(x + w * 0.35 + lean, -10); g.quadraticCurveTo(x + lean + w, h * 0.5, x + w / 2, h); g.fill();
          g.beginPath(); g.moveTo(x - w * 2.2, h); g.quadraticCurveTo(x - w * 0.4, h * 0.86, x, h * 0.8); g.quadraticCurveTo(x + w * 0.4, h * 0.86, x + w * 2.2, h); g.fill();
        });
      }
      for (let x = -40; x < TW + 40; x += 30) {
        const y = rnd(-30, h * 0.12), r = rnd(30, 70);
        mid.push(g => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.fillRect(x - r, -10, r * 2, y + 10); });
      }
      for (let i = 0; i < Math.ceil(TW / 60); i++) {
        const x = rnd(0, TW), len = h * rnd(0.25, 0.62), sway = rnd(-40, 40), lw = rnd(1.5, 3.5);
        const leaves = Array.from({ length: Math.floor(len / 26) }, (_, k) => ({ t: (k + 1) / (len / 26 + 1), s: Math.random() < 0.5 ? -1 : 1 }));
        mid.push(g => {
          g.strokeStyle = col; g.fillStyle = col; g.lineWidth = lw;
          g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + sway, len * 0.6, x + sway * 0.4, len); g.stroke();
          for (const l of leaves) {
            const t = l.t, px = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * (x + sway) + t * t * (x + sway * 0.4), py = 2 * (1 - t) * t * len * 0.6 + t * t * len;
            g.beginPath(); g.ellipse(px + l.s * 6, py, 7, 3, l.s * 0.6, 0, TAU); g.fill();
          }
        });
      }
      this.mid = this.layer(mid);

      // Near: branches (where frogs sit), ground, ferns and big leaves
      const near = [], ncol = "#020b07";
      this.perches = [];
      const branches = Math.max(3, Math.round(TW / 520));
      for (let i = 0; i < branches; i++) {
        const x0 = (i / branches) * TW + rnd(-60, 60), len = rnd(260, 460), y0 = h * rnd(0.56, 0.84);
        const x1 = x0 + len, y1 = y0 + rnd(-70, 40), cxp = (x0 + x1) / 2, cyp = Math.min(y0, y1) - rnd(20, 70), lw = rnd(9, 15);
        near.push(g => {
          g.strokeStyle = ncol; g.lineWidth = lw; g.lineCap = "round";
          g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cxp, cyp, x1, y1); g.stroke();
          g.lineWidth = lw * 0.45;
          g.beginPath(); g.moveTo(x0 + len * 0.6, (y0 + cyp) / 2 + 10); g.quadraticCurveTo(x0 + len * 0.7, cyp - 50, x0 + len * 0.85, cyp - 70); g.stroke();
        });
        for (let t = 0.12; t < 0.92; t += 0.11) {
          const px = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cxp + t * t * x1;
          const py = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cyp + t * t * y1 - lw / 2 + 1;
          this.perches.push({ x: mod(px, TW), y: py });
        }
      }
      for (let x = -40; x < TW + 40; x += 22) {
        const y = h * 0.93 + rnd(-h * 0.03, h * 0.02), r = rnd(22, 46);
        near.push(g => { g.fillStyle = ncol; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.fillRect(x - r, y, r * 2, h); });
      }
      for (let i = 0; i < Math.ceil(TW / 140); i++) {
        const f = this.makeFrond(rnd(90, 170), ncol, { leaflets: 22, droop: 0.5, leafLen: 0.22 });
        const x = rnd(0, TW), y = h * rnd(0.88, 0.97), rot = rnd(-2.6, -0.5);
        near.push(g => { g.save(); g.translate(x, y); g.rotate(rot); g.drawImage(f.img, -f.px, -f.py); g.restore(); });
      }
      this.near = this.layer(near);
    },

    // Sky, moon glow, moonbeams and a mist puff, drawn once per screen size
    buildSky() {
      const { w, h } = this;
      const mk = (cw, ch) => { const c = document.createElement("canvas"); c.width = cw; c.height = ch; return [c, c.getContext("2d")]; };
      const [sky, g] = mk(w, h);
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#020906"); grad.addColorStop(0.45, "#05170f"); grad.addColorStop(1, "#010503");
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      const moon = g.createRadialGradient(w * 0.22, -h * 0.05, 0, w * 0.22, -h * 0.05, h * 0.85);
      moon.addColorStop(0, "rgba(170, 255, 215, .13)"); moon.addColorStop(1, "rgba(170, 255, 215, 0)");
      g.fillStyle = moon; g.fillRect(0, 0, w, h);
      this.skyImg = sky;

      const b = g;                                       // moonbeams baked into the sky
      for (let i = 0; i < 4; i++) {
        const x = w * (0.08 + i * 0.17), bw = 40 + i * 18;
        const beam = b.createLinearGradient(0, 0, 0, h);
        beam.addColorStop(0, "rgba(200, 255, 230, .06)"); beam.addColorStop(1, "rgba(200, 255, 230, 0)");
        b.fillStyle = beam;
        b.beginPath(); b.moveTo(x, 0); b.lineTo(x + bw, 0); b.lineTo(x + bw + h * 0.45, h); b.lineTo(x + h * 0.3, h); b.fill();
      }

      const M = 256;
      const [mist, m] = mk(M, M);
      const mg = m.createRadialGradient(M / 2, M / 2, 0, M / 2, M / 2, M / 2);
      mg.addColorStop(0, "rgba(150, 230, 195, 1)"); mg.addColorStop(1, "rgba(150, 230, 195, 0)");
      m.fillStyle = mg; m.fillRect(0, 0, M, M);
      this.mistImg = mist;
    },

    // Corner leaves are page elements swaying with CSS (cheap for the browser to animate)
    buildFringe() {
      const { w, h } = this, S = Math.min(w, h);
      const dark = "#010a06";
      const frond = (len, o) => this.makeFrond(len, dark, o);
      const box = this.fringeEl;
      box.innerHTML = "";
      box.dataset.owner = "amazon";
      const add = (el, ax, ay, rot, flip = 1, sway = 0.025) => {
        const holder = document.createElement("div");
        holder.className = "fringe__leaf";
        holder.style.transform = `translate(${ax}px, ${ay}px) scale(${flip}, 1) rotate(${rot}rad)`;
        const swayer = document.createElement("div");
        swayer.className = "fringe__sway";
        swayer.style.setProperty("--amp", sway + "rad");
        swayer.style.animationDuration = rnd(5, 8).toFixed(2) + "s";
        swayer.style.animationDelay = (-Math.random() * 8).toFixed(2) + "s";
        el.img.style.left = -el.px + "px";
        el.img.style.top = -el.py + "px";
        swayer.appendChild(el.img);
        holder.appendChild(swayer);
        box.appendChild(holder);
        return { ...el, swayer, rot };
      };
      add(frond(S * 0.58, { droop: 0.32 }), -20, h + 30, -1.05);
      add(frond(S * 0.48, { droop: 0.4 }), -30, h + 20, -0.55);
      add(frond(S * 0.5, { droop: 0.28 }), w + 20, h + 30, -1.1, -1);
      add(frond(S * 0.5, { droop: 0.45 }), w + 30, -20, 0.85, -1, 0.02);
      add(frond(S * 0.42, { droop: 0.6, leafLen: 0.22 }), -20, -25, 0.55, 1, 0.02);
      const leafL = add(this.makeMonstera(S * 0.26, dark), S * 0.17, h + 12, -0.18, 1, 0.035);
      const leafR = add(this.makeMonstera(S * 0.22, dark), w - S * 0.2, h + 12, 0.22, 1, 0.035);
      return [leafL, leafR];
    },

    // A frog sitting on a corner leaf gets its own small canvas inside that leaf
    seatFrog(frog, leaf) {
      const box = Math.ceil(frog.size * 8);
      const c = document.createElement("canvas");
      c.className = "fringe__frog";
      c.width = Math.round(box * this.dpr); c.height = Math.round(box * this.dpr);
      c.style.width = c.style.height = box + "px";
      c.style.left = leaf.top.x - box / 2 + "px";
      c.style.top = leaf.top.y + 2 - box / 2 - frog.size * 0.4 + "px";
      c.style.transform = `rotate(${-leaf.rot * 0.8}rad)`;
      leaf.swayer.appendChild(c);
      frog.canvas = c; frog.box = box;
      frog.ctx = c.getContext("2d");
    },

    makeFrog(hue, size, place) {
      return {
        hue, size, ...place, dir: Math.random() < 0.5 ? -1 : 1,
        phase: Math.random() * TAU, croak: rnd(0.6, 1.2),
        spots: Array.from({ length: 6 }, () => ({ x: rnd(-0.45, 0.4), y: rnd(-0.6, -0.2), r: rnd(0.05, 0.1) })),
        blinkAt: rnd(1, 6), nextHop: rnd(6, 14), hop: null,
      };
    },

    resize() {
      this.dpr = Math.min(devicePixelRatio || 1, 1.5);
      this.w = innerWidth; this.h = innerHeight;
      this.TW = Math.ceil(this.w * 1.6);
      for (const cv of [this.cv, this.front]) {
        cv.width = Math.round(this.w * this.dpr);
        cv.height = Math.round(this.h * this.dpr);
      }
      this.ctx = this.cv.getContext("2d");
      this.fctx = this.front.getContext("2d");
      this.buildForest();
      this.buildSky();
      const [leafL, leafR] = this.buildFringe();

      const HUES = [192, 205, 28, 300, 135, 52, 170];
      const n = clamp(Math.round(this.TW / 360), 4, 8);
      const picks = this.perches.slice().sort(() => Math.random() - 0.5).slice(0, n);
      this.frogs = picks.map((p, i) => this.makeFrog(HUES[i % HUES.length], rnd(20, 28), { perch: p, x: p.x, y: p.y }));
      const fs = Math.min(this.w, this.h) * 0.045;
      this.frontFrogs = [
        this.makeFrog(195, clamp(fs, 18, 34), {}),
        this.makeFrog(25, clamp(fs * 0.85, 16, 30), {}),
      ];
      this.seatFrog(this.frontFrogs[0], leafL);
      this.seatFrog(this.frontFrogs[1], leafR);

      const count = clamp(Math.round((this.w * this.h) / 9000), 60, 170);
      this.flies = Array.from({ length: count }, () => ({
        x: rnd(0, this.TW), y: rnd(0.06, 0.96) * this.h, d0: Math.random(),
        ax: rnd(20, 70), ay: rnd(12, 40), f1: rnd(0.15, 0.4), f2: rnd(0.2, 0.5), p1: rnd(0, TAU), p2: rnd(0, TAU),
        period: rnd(2.2, 5.5), ph: Math.random(), hue: rnd(66, 92), drift: rnd(-10, 10),
      }));
    },

    drawFrog(g, f, t) {
      const s = f.size, hue = f.hue;
      let croak = Math.pow(Math.max(0, Math.sin(t * f.croak * 2 + f.phase)), 8);
      if (f.forceCroak > t) croak = Math.max(croak, Math.pow(Math.sin((f.forceCroak - t) * 9), 2));
      if (this.choir && t - this.choir.t < 7.5 && t >= this.choir.t) {        // the frog choir: they sing in turn, then all together
        const beat = Math.floor((t - this.choir.t) * 4), me = this.frogs.indexOf(f);
        if (beat % this.frogs.length === me % this.frogs.length || beat % 8 === 7 || beat >= 28) croak = Math.max(croak, 1 - ((t - this.choir.t) * 4 % 1));
      }
      const glowA = 0.75 + 0.2 * Math.sin(t * 1.3 + f.phase) + croak * 0.45;
      g.save();
      g.scale(f.dir, 1);
      // glow halo
      g.globalCompositeOperation = "lighter";
      const R = s * 3.8 * (1 + croak * 0.25);
      g.globalAlpha = Math.min(1, glowA);
      g.drawImage(this.sprite(hue, 55), -R, -s * 0.45 - R, R * 2, R * 2);
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";

      const body = `hsl(${hue}, 95%, 54%)`, deep = `hsl(${hue}, 85%, 24%)`, pale = `hsl(${hue}, 100%, 82%)`;
      const ell = (x, y, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); g.fill(); };
      const hopK = f.hop ? Math.sin(Math.PI * f.hop.k) : 0;
      g.rotate(-hopK * 0.35);

      g.fillStyle = deep;
      if (hopK > 0.1) {                                  // legs stretched mid-hop
        g.strokeStyle = deep; g.lineWidth = s * 0.14; g.lineCap = "round";
        g.beginPath(); g.moveTo(-s * 0.4, -s * 0.3); g.lineTo(-s * 1.05, -s * 0.05 + hopK * s * 0.2); g.stroke();
      } else {
        ell(-s * 0.46, -s * 0.16, s * 0.42, s * 0.19, -0.25);
      }
      g.fillStyle = body;
      ell(0, -s * 0.38, s * 0.62, s * 0.35, -0.15);
      ell(s * 0.5, -s * 0.5, s * 0.32, s * 0.25, 0.1);
      ell(-s * 0.36, -s * 0.27, s * 0.3, s * 0.18, -0.55);
      g.strokeStyle = body; g.lineWidth = s * 0.1; g.lineCap = "round";
      g.beginPath(); g.moveTo(s * 0.42, -s * 0.3); g.lineTo(s * 0.55, -s * 0.02); g.lineTo(s * 0.72, 0); g.stroke();
      // dart-frog spots
      g.fillStyle = deep; g.globalAlpha = 0.7;
      for (const sp of f.spots) ell(sp.x * s, sp.y * s, sp.r * s, sp.r * s * 0.8);
      g.globalAlpha = 1;
      // throat puffing as it croaks
      if (croak > 0.02) {
        g.fillStyle = `hsla(${hue}, 100%, 88%, ${0.45 + croak * 0.45})`;
        ell(s * 0.6, -s * 0.26, s * 0.2 * (0.35 + croak), s * 0.16 * (0.35 + croak));
      }
      // eyes (they blink now and then)
      const blinking = mod(t - f.blinkAt, 5.5) < 0.14;
      for (const [ex, ey, shade] of [[s * 0.44, -s * 0.74, 0.75], [s * 0.62, -s * 0.72, 1]]) {
        g.fillStyle = pale; g.globalAlpha = shade;
        ell(ex, ey, s * 0.13, blinking ? s * 0.025 : s * 0.13);
        if (!blinking) {
          g.fillStyle = "#03110a"; ell(ex + s * 0.02, ey, s * 0.075, s * 0.09);
          g.fillStyle = "#fff"; ell(ex + s * 0.05, ey - s * 0.04, s * 0.025, s * 0.025);
        }
      }
      g.globalAlpha = 1;
      g.restore();
    },

    // Frogs on branches occasionally hop to a nearby perch
    updateFrog(f, t, dt) {
      if (!f.perch) return;
      if (f.hop) {
        f.hop.k += dt / f.hop.dur;
        const k = Math.min(1, f.hop.k);
        f.x = f.hop.fx + (f.hop.tx - f.hop.fx) * k;
        f.y = f.hop.fy + (f.hop.ty - f.hop.fy) * k - Math.sin(Math.PI * k) * f.size * 4;
        if (f.hop.k >= 1) { f.perch = f.hop.to; f.x = f.perch.x; f.y = f.perch.y; f.hop = null; f.nextHop = t + rnd(7, 16); }
      } else if (t > f.nextHop) {
        const options = this.perches.filter(p => p !== f.perch && Math.abs(p.x - f.perch.x) < 240 && Math.abs(p.x - f.perch.x) > 30 && Math.abs(p.y - f.perch.y) < 120);
        if (options.length) {
          const to = options[Math.floor(Math.random() * options.length)];
          f.dir = to.x > f.perch.x ? 1 : -1;
          f.hop = { to, fx: f.x, fy: f.y, tx: to.x, ty: to.y, k: 0, dur: 0.55 };
        } else f.nextHop = t + 5;
      }
    },

    frame() {
      if (!this.running) return;
      const { ctx, fctx, w, h, TW } = this;
      const now = performance.now();
      const t = (now - this.t0) / 1000;
      const dt = Math.min(0.05, (now - (this.lastT || now)) / 1000);
      this.lastT = now;
      for (const c of [ctx, fctx]) c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      // Slow device? Quietly lighten the scene once (fewer fireflies, no mist)
      if (!this.lite) {
        this.slow = dt > 0.03 ? (this.slow || 0) + 1 : Math.max(0, (this.slow || 0) - 2);
        if (this.slow > 90) { this.lite = true; this.flies = this.flies.filter((_, i) => i % 2 === 0); }
      }

      // Sky, moonlight and moonbeams (pre-drawn)
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(this.skyImg, 0, 0, w, h);

      const oy = k => Math.tanh(-cam.y / 5000) * 40 * k;
      // Draw only the slice of a wrapping layer that's on screen
      const drawLayer = (img, par) => {
        const x0 = -mod(cam.x * par, TW), y = oy(par * 6);
        const sx = -x0, first = Math.min(w, TW - sx);
        ctx.drawImage(img, sx, 0, first, h, 0, y, first, h);
        if (first < w) ctx.drawImage(img, 0, 0, w - first, h, first, y, w - first, h);
        return x0;
      };
      const mist = (y, a, speed) => {
        ctx.globalAlpha = a;
        for (let i = 0; i < 3; i++) {
          const x = mod(t * speed + i * w * 0.55 - cam.x * 0.05, w * 1.65) - w * 0.3;
          ctx.drawImage(this.mistImg, x - w * 0.4, y - w * 0.07, w * 0.8, w * 0.14);
        }
        ctx.globalAlpha = 1;
      };

      drawLayer(this.far, 0.03);
      if (!this.lite) mist(h * 0.5, 0.07, 6);
      drawLayer(this.mid, 0.08);

      // Fireflies, sorted into three depths (zoom in to fly into the swarm)
      const behind = [], among = [], front = [];
      for (const f of this.flies) {
        const d = mod(f.d0 + cam.z * 0.5, 1);
        (d < 0.45 ? behind : d < 0.75 ? among : front).push([f, d]);
      }
      const flies = list => { ctx.globalCompositeOperation = "lighter"; for (const [f, d] of list) this.drawFly(ctx, f, d, t); };
      flies(behind);
      if (!this.lite) mist(h * 0.78, 0.06, -4);
      const nx0 = drawLayer(this.near, 0.16);

      // Frogs on the branches
      ctx.globalCompositeOperation = "source-over";
      for (const f of this.frogs) {
        this.updateFrog(f, t, dt);
        let sx = mod(f.x + nx0, TW);
        if (sx > w + 60) sx -= TW;
        if (sx < -60 || sx > w + 60) continue;
        f.sx = sx; f.sy = f.y + oy(0.96);
        ctx.save(); ctx.translate(sx, f.y + oy(0.96)); this.drawFrog(ctx, f, t); ctx.restore();
      }
      flies(among);

      // Front: corner leaves drift a touch with the wall; their frogs and the nearest fireflies
      const px = Math.tanh(-cam.x / 6000) * 18, pyy = Math.tanh(-cam.y / 6000) * 14;
      this.fringeEl.style.transform = `translate(${px.toFixed(1)}px, ${pyy.toFixed(1)}px)`;
      for (const fr of this.frontFrogs) {
        const g = fr.ctx;
        g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        g.clearRect(0, 0, fr.box, fr.box);
        g.translate(fr.box / 2, fr.box / 2 + fr.size * 0.4);
        this.drawFrog(g, fr, t);
      }
      fctx.clearRect(0, 0, w, h);
      fctx.globalCompositeOperation = "lighter";
      for (const [f, d] of front) this.drawFly(fctx, f, d, t);

      if (!calm) this.raf = requestAnimationFrame(() => this.frame());
    },

    drawFly(g, f, d, t) {
      const { w, h, TW } = this;
      const par = 0.04 + d * 0.42;
      let x = mod(f.x + Math.sin(t * f.f1 + f.p1) * f.ax + t * f.drift - cam.x * par, TW) - (TW - w) / 2;
      let y = mod(f.y + Math.sin(t * f.f2 + f.p2) * f.ay - Math.tanh(cam.y / 4000) * 60 * d, h * 1.08) - h * 0.04;
      if (this.burst && t - this.burst.t < 2.2) {          // a tap scatters nearby fireflies and makes them flash
        const bx = x - this.burst.x, by = y - this.burst.y, bd = Math.hypot(bx, by), age = t - this.burst.t;
        if (bd < 260 && bd > 0.1) { const k = (1 - bd / 260) * ease.outCubic(Math.min(1, age / 0.6)) * (1 - smooth(1.2, 2.2, age)) * 140; x += (bx / bd) * k; y += (by / bd) * k; f.flash = t + 0.6; }
      }
      const dx = x - this.mouse.x, dy = y - this.mouse.y, dist = Math.hypot(dx, dy);
      if (dist < 150 && dist > 0.1) {                     // they swerve away from the cursor
        const push = (1 - dist / 150) * 55 * (0.4 + d);
        x += (dx / dist) * push; y += (dy / dist) * push;
      }
      if (x < -40 || x > w + 40) return;
      const blink = f.flash > t ? 1 : Math.pow(Math.max(0, Math.sin((t / f.period + f.ph) * TAU)), 3);
      const light = 0.1 + 0.9 * blink;
      const fade = smooth(0, 0.12, d) * (1 - smooth(0.9, 1, d));
      const size = 1 + d * 5.5;
      const R = size * 6 * (0.5 + light * 0.7);
      g.globalAlpha = Math.min(1, light * fade);
      g.drawImage(this.sprite(Math.round(f.hue), 62), x - R, y - R, R * 2, R * 2);
      g.globalAlpha = Math.min(1, (0.35 + light) * fade);
      g.fillStyle = `hsl(${f.hue}, 100%, 88%)`;
      g.beginPath(); g.arc(x, y, size * 0.45, 0, TAU); g.fill();
      g.globalAlpha = 1;
    },

    tap(x, y) {
      const t = (performance.now() - this.t0) / 1000;
      const frog = this.frogs.find(f => f.sx !== undefined && Math.hypot(f.sx - x, f.sy - f.size * 0.4 - y) < Math.max(44, f.size * 2.2));
      if (frog) {
        frog.forceCroak = t + 0.9;
        if (!frog.hop) frog.nextHop = t + 0.5;
        Sound.sfx("croak");
        Eggs.bump("frog");
      } else {
        this.burst = { x, y, t };
        Sound.sfx("sparkle");
      }
      if (calm) this.frame();
    },
    start() {
      if (this.running) return;
      if (!this.ctx || this.w !== innerWidth || this.h !== innerHeight || this.fringeEl.dataset.owner !== "amazon"
          || this.front.width !== Math.round(this.w * this.dpr)) this.resize();
      this.running = true;
      this.cv.hidden = false; this.front.hidden = false; this.fringeEl.hidden = false;
      this.lastT = performance.now();
      this.frame();
    },
    stop() {
      if (!this.running) return;
      this.running = false;
      cancelAnimationFrame(this.raf);
      this.cv.hidden = true; this.front.hidden = true; this.fringeEl.hidden = true;
      this.fctx?.clearRect(0, 0, this.front.width, this.front.height);
    },
  };
  window.addEventListener("pointermove", e => { Jungle.mouse.x = e.clientX; Jungle.mouse.y = e.clientY; }, { passive: true });
  document.addEventListener("pointerleave", () => { Jungle.mouse.x = Jungle.mouse.y = -9999; });
  let jungleResizeT;
  window.addEventListener("resize", () => {
    clearTimeout(jungleResizeT);
    jungleResizeT = setTimeout(() => { if (Jungle.running) Jungle.resize(); }, 200);
  });

  /* ---------------------------------------------------------
     14. MORE ANIMATED THEMES
     A small scene kit (canvases, loop, resizing, slow-device
     fallback) and five themes built with it:
     Deep Ocean · Aurora · Sakura Dusk · Neon City · Sahara Night
     --------------------------------------------------------- */
  const pointer = Jungle.mouse;
  const mkCanvas = (cw, ch) => {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(cw)); c.height = Math.max(1, Math.ceil(ch));
    return [c, c.getContext("2d")];
  };
  // A horizontally repeating layer (drawn 3× so shapes crossing the edge wrap)
  function tileLayer(TW, h, shapes) {
    const [c, g] = mkCanvas(TW, h);
    for (const dx of [-TW, 0, TW]) { g.save(); g.translate(dx, 0); shapes.forEach(fn => fn(g)); g.restore(); }
    return c;
  }
  // Draw the on-screen slice of a repeating layer; returns its x offset
  function drawWrapped(ctx, img, par, w, y = 0) {
    const TW = img.width, H = img.height;
    const x0 = -mod(cam.x * par, TW), sx = -x0, first = Math.min(w, TW - sx);
    ctx.drawImage(img, sx, 0, first, H, 0, y, first, H);
    if (first < w) ctx.drawImage(img, 0, 0, w - first, H, first, y, w - first, H);
    return x0;
  }
  const wrapX = (x, TW, w) => { let s = mod(x, TW); if (s > w + 120) s -= TW; return s; };
  // Smooth ridge line that repeats exactly every TW pixels
  function periodicRidge(TW, base, amps) {
    const ks = amps.map(([k, a]) => [k, a, rnd(0, TAU)]);
    return x => base + ks.reduce((s, [k, a, ph]) => s + Math.sin((TAU * k * x) / TW + ph) * a, 0);
  }
  // Swaying corner decoration (page element, animated by CSS)
  function fringeItem(box, el, ax, ay, rot, flip = 1, sway = 0.025) {
    const holder = document.createElement("div");
    holder.className = "fringe__leaf";
    holder.style.transform = `translate(${ax}px, ${ay}px) scale(${flip}, 1) rotate(${rot}rad)`;
    const swayer = document.createElement("div");
    swayer.className = "fringe__sway";
    swayer.style.setProperty("--amp", sway + "rad");
    swayer.style.animationDuration = rnd(5, 8).toFixed(2) + "s";
    swayer.style.animationDelay = (-Math.random() * 8).toFixed(2) + "s";
    el.img.style.left = -el.px + "px"; el.img.style.top = -el.py + "px";
    swayer.appendChild(el.img); holder.appendChild(swayer); box.appendChild(holder);
    return swayer;
  }
  // An occasional shooting star
  function shootingStar(st, ctx, t, dt, w, maxY) {
    if (!st.s) {
      if (st.next === undefined) st.next = t + rnd(2, 6);
      if (t < st.next) return;
      const a = rnd(0.25, 0.6), sp = rnd(650, 950), dir = Math.random() < 0.5 ? -1 : 1;
      st.s = { x: rnd(w * 0.15, w * 0.85), y: rnd(0, maxY * 0.45), vx: Math.cos(a) * sp * dir, vy: Math.sin(a) * sp, life: 0.8 };
    }
    const s = st.s;
    s.life -= dt;
    if (s.life <= 0) { st.s = null; st.next = t + rnd(3, 9); return; }
    s.x += s.vx * dt; s.y += s.vy * dt;
    const tx = s.x - s.vx * 0.13, ty = s.y - s.vy * 0.13;
    const gr = ctx.createLinearGradient(s.x, s.y, tx, ty);
    gr.addColorStop(0, `rgba(255, 255, 255, ${Math.min(1, s.life * 1.6)})`);
    gr.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = gr; ctx.lineWidth = 2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tx, ty); ctx.stroke();
  }

  function makeScene(name, def) {
    const sc = {
      name, cv: $("#space"), front: $("#sceneFront"), fringeEl: $("#fringe"),
      ctx: null, fctx: null, w: 0, h: 0, dpr: 1, running: false, raf: 0,
      t0: performance.now(), lastT: 0, lite: false, slow: 0, sizedFor: "",
      resize() {
        this.dpr = Math.min(devicePixelRatio || 1, 1.5);
        this.w = innerWidth; this.h = innerHeight;
        for (const cv of def.front ? [this.cv, this.front] : [this.cv]) {
          cv.width = Math.round(this.w * this.dpr); cv.height = Math.round(this.h * this.dpr);
        }
        this.ctx = this.cv.getContext("2d");
        this.fctx = this.front.getContext("2d");
        if (def.fringe) { this.fringeEl.innerHTML = ""; this.fringeEl.dataset.owner = name; }
        def.build.call(this);
        this.sizedFor = `${this.w}x${this.h}`;
      },
      frame() {
        if (!this.running) return;
        const now = performance.now();
        const t = (now - this.t0) / 1000;
        const dt = Math.min(0.05, (now - (this.lastT || now)) / 1000);
        this.lastT = now;
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.ctx.globalCompositeOperation = "source-over"; this.ctx.globalAlpha = 1;
        if (def.front) {
          this.fctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
          this.fctx.clearRect(0, 0, this.w, this.h);
          this.fctx.globalCompositeOperation = "source-over"; this.fctx.globalAlpha = 1;
        }
        if (!this.lite) {                                   // slow device? lighten once
          this.slow = dt > 0.03 ? this.slow + 1 : Math.max(0, this.slow - 2);
          if (this.slow > 90) { this.lite = true; def.lite?.call(this); }
        }
        def.draw.call(this, t, dt);
        if (!calm) this.raf = requestAnimationFrame(() => this.frame());
      },
      start() {
        if (this.running) return;
        const stale = this.sizedFor !== `${innerWidth}x${innerHeight}`;
        if (stale || (def.fringe && this.fringeEl.dataset.owner !== name)) this.resize();
        else if (def.front && this.front.width !== Math.round(this.w * this.dpr)) this.resize();
        this.running = true;
        this.cv.hidden = false;
        if (def.front) this.front.hidden = false;
        if (def.fringe) this.fringeEl.hidden = false;
        this.lastT = performance.now();
        def.enter?.call(this, (performance.now() - this.t0) / 1000);
        this.frame();
      },
      tap(x, y) { def.tap?.call(this, x, y, (performance.now() - this.t0) / 1000); },
      stop() {
        if (!this.running) return;
        this.running = false;
        cancelAnimationFrame(this.raf);
        this.cv.hidden = true;
        if (def.front) { this.fctx.clearRect(0, 0, this.front.width, this.front.height); this.front.hidden = true; }
        if (def.fringe) this.fringeEl.hidden = true;
      },
    };
    let rt;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (sc.running) sc.resize(); }, 200); });
    return sc;
  }

  /* ===== DEEP OCEAN: glowing jellyfish, plankton that sparkles when disturbed, kelp, light from above ===== */
  function drawJelly(ctx, j, t, w, h) {
    const d = mod(j.d0 + cam.z * 0.4, 1);
    const fade = smooth(0, 0.15, d) * (1 - smooth(0.85, 1, d));
    if (fade < 0.02) return;
    const k = 0.35 + d * 1.5, par = 0.05 + d * 0.35;
    const x0 = mod(j.x * w * 1.4 + Math.sin(t * 0.2 + j.ph) * 40 - cam.x * par, w * 1.4) - w * 0.2;
    const y0 = mod(j.y * h * 1.6 - t * 14 * j.sp * (0.5 + d) - cam.y * par * 0.4, h * 1.6) - h * 0.3;
    const R = 30 * j.size * k;
    let x = x0, y = y0, c = Math.pow(Math.max(0, Math.sin(t * 2.2 * j.sp + j.ph)), 2);   // the bell pulses
    if (j.dash) {                                           // tapped: it jets away, then drifts back
      const age = t - j.dash.t, d = 190 * ease.outCubic(Math.min(1, age / 1.4)) * (1 - smooth(4, 9, age));
      x += Math.cos(j.dash.ang) * d; y += Math.sin(j.dash.ang) * d;
      if (age < 1.4) c = Math.max(c, Math.pow(Math.sin(age * 9), 2));
      if (age > 9) j.dash = null;
    }
    j.sx = x; j.sy = y; j.R = R;
    if (x < -R * 3 || x > w + R * 3 || y < -R * 4 || y > h + R * 2) return;
    const bw = R * (1 - c * 0.18), bh = R * 0.85 * (1 + c * 0.16);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.5 * fade;
    const G = R * 4.2;
    ctx.drawImage(Jungle.sprite(j.hue, 60), x - G, y - G * 0.7, G * 2, G * 2);
    ctx.globalAlpha = fade;
    ctx.lineCap = "round";
    ctx.strokeStyle = `hsla(${j.hue}, 100%, 78%, .35)`;
    ctx.lineWidth = Math.max(0.6, 1.1 * k);
    for (let n = 0; n < 7; n++) {                            // trailing tentacles
      const x0 = x + (n / 6 - 0.5) * bw * 1.7, L = R * (2.4 + (n % 3) * 0.5);
      ctx.beginPath(); ctx.moveTo(x0, y);
      for (let s = 1; s <= 10; s++) { const f = s / 10; ctx.lineTo(x0 + Math.sin(t * 2 + n * 1.3 - f * 4) * R * 0.22 * f, y + f * L * (1 - c * 0.12)); }
      ctx.stroke();
    }
    ctx.strokeStyle = `hsla(${j.hue}, 100%, 85%, .45)`;
    ctx.lineWidth = Math.max(1, 3 * k);
    for (const side of [-1, 1]) {                            // frilly oral arms
      ctx.beginPath(); ctx.moveTo(x + side * bw * 0.15, y);
      for (let s = 1; s <= 8; s++) { const f = s / 8; ctx.lineTo(x + side * bw * 0.15 + Math.sin(t * 1.6 + side + f * 5) * R * 0.25 * f, y + f * R * 1.5); }
      ctx.stroke();
    }
    const gr = ctx.createRadialGradient(x, y - bh * 0.6, 0, x, y - bh * 0.3, bw * 1.1);
    gr.addColorStop(0, `hsla(${j.hue}, 100%, 90%, .7)`);
    gr.addColorStop(0.6, `hsla(${j.hue}, 95%, 65%, .28)`);
    gr.addColorStop(1, `hsla(${j.hue}, 90%, 55%, .08)`);
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.ellipse(x, y, bw, bh, 0, Math.PI, TAU);
    for (let s = 0; s <= 8; s++) { const f = s / 8; ctx.lineTo(x + bw - f * bw * 2, y + Math.sin(f * Math.PI * 8) * R * 0.06 + R * 0.05); }
    ctx.fill();
    ctx.strokeStyle = `hsla(${j.hue}, 100%, 88%, .65)`;
    ctx.lineWidth = Math.max(0.8, 1.4 * k);
    ctx.beginPath(); ctx.ellipse(x, y, bw, bh, 0, Math.PI, TAU); ctx.stroke();
    ctx.fillStyle = `hsla(${j.hue}, 100%, 92%, .5)`;
    for (let n = 0; n < 4; n++) {
      const a = Math.PI + ((n + 0.5) / 4) * Math.PI;
      ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * bw * 0.42, y + Math.sin(a) * bh * 0.42, bw * 0.12, bh * 0.1, a, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ===== Deep-sea creatures for the Deep Ocean: an anglerfish and friends ===== */
  function makeDeep(w, h, lite) {
    const S = clamp(Math.min(w, h) / 800, 0.6, 1.3);
    return {
      S,
      angler: { x: w * 0.3, y: h * 0.74, dir: 1, ph: rnd(0, TAU), snap: null },
      school: Array.from({ length: lite ? 12 : 24 }, (_, i) => ({ i, x: w * 0.6 + rnd(-60, 60), y: h * 0.42 + rnd(-40, 40), vx: 0, vy: 0, ph: rnd(0, TAU), gone: 0 })),
      leadPh: rnd(0, TAU),
      vampire: { ph: rnd(0, TAU), flip: null, cloud: [] },
      dumbo: { ph: rnd(0, TAU) },
      comb: { ph: rnd(0, TAU) },
      siph: { ph: rnd(0, TAU) },
      gulper: { next: 6, start: -1, y: rnd(0.55, 0.68) },
      hatchet: Array.from({ length: 5 }, () => ({ x: Math.random(), y: rnd(0.22, 0.6), ph: rnd(0, TAU), sp: rnd(8, 18), dir: Math.random() < 0.5 ? -1 : 1 })),
    };
  }
  // Where the slow drifters are right now
  const deepPos = {
    vampire: (D, t, w, h) => ({ x: w * (0.76 + 0.08 * Math.sin(t * 0.06 + D.vampire.ph)), y: h * (0.3 + 0.06 * Math.sin(t * 0.09 + D.vampire.ph)) }),
    dumbo: (D, t, w, h) => ({ x: w * (0.14 + 0.05 * Math.sin(t * 0.05 + D.dumbo.ph)), y: h * (0.5 + 0.12 * Math.sin(t * 0.17 + D.dumbo.ph)) }),
    comb: (D, t, w, h) => ({ x: w * (0.55 + 0.1 * Math.sin(t * 0.04 + D.comb.ph)), y: h * (0.18 + 0.04 * Math.sin(t * 0.12 + D.comb.ph)) }),
  };
  function stepDeep(D, t, dt, w, h) {
    const A = D.angler, S = D.S;
    // The anglerfish drifts toward a pointer that comes near its patch of the deep, otherwise it wanders
    const near = Math.hypot(pointer.x - A.x, pointer.y - A.y) < 320 * S && pointer.y > h * 0.4;
    const tx = near ? pointer.x - A.dir * 80 * S : w * (0.5 + 0.36 * Math.sin(t * 0.045 + A.ph));
    const vx = clamp((tx - A.x) * 0.4, -38 * S, 38 * S);
    A.x += vx * dt; A.y = h * 0.74 + Math.sin(t * 0.5 + A.ph) * 10 * S;
    if (Math.abs(vx) > 4 * S) A.dir = vx > 0 ? 1 : -1;
    A.lure = { x: A.x + A.dir * 92 * S, y: A.y - 74 * S + Math.sin(t * 2.1) * 6 * S };
    // The lanternfish school follows a wandering leader and scatters from your pointer (and the angler's jaws)
    const lx = w * (0.5 + 0.34 * Math.sin(t * 0.07 + D.leadPh)), ly = h * (0.42 + 0.14 * Math.sin(t * 0.11 + D.leadPh));
    for (const f of D.school) {
      if (f.gone > t) continue;
      const a = f.i * 2.4, r = (14 + f.i * 3) * S, gx = lx + Math.cos(a + t * 0.3) * r, gy = ly + Math.sin(a + t * 0.3) * r * 0.6;
      f.vx += (gx - f.x) * 1.6 * dt; f.vy += (gy - f.y) * 1.6 * dt;
      const pd = Math.hypot(f.x - pointer.x, f.y - pointer.y);
      if (pd < 120 && pd > 0.1) { f.vx += ((f.x - pointer.x) / pd) * 900 * dt; f.vy += ((f.y - pointer.y) / pd) * 900 * dt; }
      f.vx *= 1 - dt * 1.8; f.vy *= 1 - dt * 1.8;
      f.x += f.vx * dt; f.y += f.vy * dt;
    }
    if (!D.gulper.start || D.gulper.start < 0) { if (t > D.gulper.next) { D.gulper.start = t; D.gulper.y = rnd(0.55, 0.68); } }
    else if (t - D.gulper.start > 16) { D.gulper.start = -1; D.gulper.next = t + rnd(18, 32); }
  }
  function drawDeep(ctx, D, t, w, h) {
    const S = D.S;
    // --- the comb jelly: a clear oval rippling with rainbow light ---
    { const p = deepPos.comb(D, t, w, h), rx = 22 * S, ry = 34 * S;
      ctx.strokeStyle = "rgba(200, 230, 255, .25)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, 0, 0, TAU); ctx.stroke();
      ctx.globalCompositeOperation = "lighter";
      for (let row = 0; row < 8; row++) {
        const ox = Math.cos((row / 8) * TAU) * rx * 0.85;
        if (Math.sin((row / 8) * TAU) < -0.2) continue;                     // only the rows facing us
        for (let k = 0; k < 9; k++) {
          const fy = -0.8 + k * 0.2, y = p.y + fy * ry, x = p.x + ox * Math.sqrt(1 - fy * fy);
          ctx.fillStyle = `hsla(${(t * 220 + k * 34 + row * 45) % 360}, 100%, 65%, ${0.55 + 0.35 * Math.sin(t * 8 - k)})`;
          ctx.fillRect(x - 1.5, y - 1, 3, 2);
        }
      }
      ctx.globalCompositeOperation = "source-over"; }
    // --- a siphonophore: a long drifting string of glowing beads ---
    { const k = ((t * 0.012 + D.siph.ph) % 1.4) - 0.2, n = 36;
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < n; i++) {
        const f = i / n, x = w * (k + f * 0.38), y = h * (0.12 + f * 0.24) + Math.sin(t * 0.8 + f * 9) * 14 * S;
        if (x < -20 || x > w + 20) continue;
        glow(ctx, x, y, (i % 3 ? 5 : 8) * S, `hsla(${i % 2 ? 195 : 265}, 100%, 72%, ALPHA)`, 0.8);
        if (i % 4 === 0) { ctx.strokeStyle = "rgba(160, 200, 255, .22)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.sin(t + i) * 8, y + 30 * S, x + Math.sin(t * 1.3 + i) * 12, y + 60 * S); ctx.stroke(); }
      }
      ctx.globalCompositeOperation = "source-over"; }
    // --- hatchetfish: little silver fish with glowing bellies ---
    for (const f of D.hatchet) {
      const x = mod(f.x * w * 1.2 + f.dir * t * f.sp, w * 1.2) - w * 0.1, y = f.y * h + Math.sin(t * 0.8 + f.ph) * 8, s = 9 * S;
      ctx.save(); ctx.translate(x, y); ctx.scale(f.dir, 1);
      const gr = ctx.createLinearGradient(0, -s, 0, s); gr.addColorStop(0, "#9fb4c8"); gr.addColorStop(1, "#40566b");
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(s * 1.2, -s * 0.2); ctx.lineTo(-s * 0.6, -s * 0.8); ctx.lineTo(-s * 0.9, 0); ctx.lineTo(-s * 0.6, s * 1.1); ctx.lineTo(s * 0.9, s * 0.5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-s * 0.9, 0); ctx.lineTo(-s * 1.5, -s * 0.4); ctx.lineTo(-s * 1.5, s * 0.4); ctx.fill();
      ctx.globalCompositeOperation = "lighter";
      for (let k = 0; k < 5; k++) glow(ctx, -s * 0.4 + k * s * 0.3, s * 0.85 - k * s * 0.08, 2.5 * S, "hsla(200, 100%, 70%, ALPHA)", 0.9);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#cfe8ff"; ctx.beginPath(); ctx.arc(s * 0.6, -s * 0.15, s * 0.22, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // --- dumbo octopus: flapping its ear fins ---
    { const p = deepPos.dumbo(D, t, w, h), s = 26 * S, flap = Math.sin(t * 3.4 + D.dumbo.ph) * 0.5;
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.fillStyle = "#e9a2b6";
      for (const side of [-1, 1]) { ctx.save(); ctx.translate(side * s * 0.62, -s * 0.35); ctx.rotate(side * (0.5 + flap)); ctx.beginPath(); ctx.ellipse(side * s * 0.25, 0, s * 0.34, s * 0.18, 0, 0, TAU); ctx.fill(); ctx.restore(); }
      const body = ctx.createRadialGradient(-s * 0.2, -s * 0.5, s * 0.1, 0, -s * 0.2, s);
      body.addColorStop(0, "#ffd3de"); body.addColorStop(1, "#c46d88");
      ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, -s * 0.3, s * 0.62, s * 0.7, 0, Math.PI, 0); ctx.lineTo(s * 0.62, s * 0.05);
      for (let k = 0; k <= 8; k++) { const x = s * 0.62 - (k / 8) * s * 1.24, y = s * (0.2 + 0.25 * (k % 2) + 0.05 * Math.sin(t * 2 + k)); ctx.lineTo(x, y); }   // webbed arms
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#241018"; for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * s * 0.22, -s * 0.18, s * 0.09, 0, TAU); ctx.fill(); }
      ctx.restore(); }
    // --- vampire squid: glowing blue eyes, a webbed cloak; tap it and it turns inside out ---
    { const V = D.vampire, p = deepPos.vampire(D, t, w, h), s = 30 * S;
      V.x = p.x; V.y = p.y;
      const flip = V.flip ? Math.sin(Math.min(1, (t - V.flip) / 3) * Math.PI) : 0;
      if (V.flip && t - V.flip > 3) V.flip = null;
      ctx.save(); ctx.translate(p.x, p.y);
      const fl = Math.sin(t * 2.5 + V.ph) * 0.3;
      ctx.fillStyle = "#5a0f1d";
      for (const side of [-1, 1]) { ctx.save(); ctx.translate(side * s * 0.3, -s * 0.95); ctx.rotate(side * (0.6 + fl)); ctx.beginPath(); ctx.ellipse(side * s * 0.2, 0, s * 0.26, s * 0.13, 0, 0, TAU); ctx.fill(); ctx.restore(); }
      const mantle = ctx.createLinearGradient(0, -s * 1.1, 0, s * 0.3); mantle.addColorStop(0, "#8c1d2f"); mantle.addColorStop(1, "#3a0812");
      ctx.fillStyle = mantle; ctx.beginPath(); ctx.ellipse(0, -s * 0.45, s * 0.36, s * 0.65, 0, 0, TAU); ctx.fill();
      // the cloak: hangs below, or flips up over the body when startled
      const up = flip, reach = s * (1.3 - up * 2.3);
      ctx.fillStyle = up > 0.3 ? "#1d0408" : "rgba(70, 8, 22, .92)";
      ctx.beginPath(); ctx.moveTo(-s * 0.35, -s * 0.05);
      for (let k = 0; k <= 8; k++) { const a = Math.PI * (k / 8), x = -Math.cos(a) * s * (0.9 + up * 0.2) , y = reach * (0.75 + 0.25 * (k % 2)) + Math.sin(t * 2 + k) * 4; ctx.lineTo(x, y); }
      ctx.lineTo(s * 0.35, -s * 0.05); ctx.closePath(); ctx.fill();
      if (up > 0.3) { ctx.fillStyle = "#2a0710"; for (let k = 0; k < 12; k++) { const x = -s * 0.7 + (k % 6) * s * 0.28, y = reach * 0.4 + Math.floor(k / 6) * s * 0.3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s * 0.08, y - s * 0.2); ctx.lineTo(x + s * 0.16, y); ctx.fill(); } }   // the spiny inside
      ctx.globalCompositeOperation = "lighter";
      for (const side of [-1, 1]) glow(ctx, side * s * 0.18, -s * 0.15, 7 * S, "hsla(200, 100%, 70%, ALPHA)", 1);
      ctx.globalCompositeOperation = "source-over";
      ctx.restore();
      // its cloud of glowing blue mucus
      ctx.globalCompositeOperation = "lighter";
      V.cloud = V.cloud.filter(c => { c.life -= 1 / 60; c.x += c.vx / 60; c.y += c.vy / 60; c.vx *= 0.97; c.vy *= 0.97; if (c.life <= 0) return false; glow(ctx, c.x, c.y, c.r, "hsla(195, 100%, 65%, ALPHA)", Math.min(0.9, c.life)); return true; });
      ctx.globalCompositeOperation = "source-over"; }
    // --- the gulper eel: an enormous mouth and a glowing tail tip ---
    if (D.gulper.start >= 0) {
      const k = (t - D.gulper.start) / 16, hx = -w * 0.25 + k * w * 1.5, hy = h * D.gulper.y, gape = 0.5 + 0.5 * Math.sin(t * 1.4);
      ctx.strokeStyle = "#0d0f17"; ctx.lineCap = "round";
      let px = hx, py = hy;
      for (let i = 1; i <= 34; i++) {
        const x = hx - i * 9 * S, y = hy + Math.sin(t * 3 - i * 0.35) * (4 + i * 0.5) * S;
        ctx.lineWidth = Math.max(1.5, (9 - i * 0.22) * S); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke(); px = x; py = y;
      }
      ctx.globalCompositeOperation = "lighter"; glow(ctx, px, py, 9 * S, "hsla(345, 100%, 65%, ALPHA)", 0.6 + 0.4 * Math.sin(t * 6)); ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#0d0f17"; ctx.beginPath(); ctx.moveTo(hx - 10 * S, hy - 4 * S);
      ctx.lineTo(hx + 34 * S, hy - (8 + gape * 18) * S); ctx.quadraticCurveTo(hx + 20 * S, hy, hx + 34 * S, hy + (8 + gape * 22) * S); ctx.lineTo(hx - 10 * S, hy + 5 * S); ctx.fill();   // the pelican-like mouth
      ctx.fillStyle = "#cfe8ff"; ctx.beginPath(); ctx.arc(hx - 2 * S, hy - 5 * S, 1.6 * S, 0, TAU); ctx.fill();
    }
    // --- the lanternfish school ---
    for (const f of D.school) {
      if (f.gone > t) continue;
      const a = Math.atan2(f.vy, f.vx || 0.01), s = 7 * S;
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(a);
      ctx.fillStyle = "#1b2a3a"; ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.38, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-s * 0.9, 0); ctx.lineTo(-s * 1.5, -s * 0.4); ctx.lineTo(-s * 1.5, s * 0.4); ctx.fill();
      ctx.globalCompositeOperation = "lighter";
      for (let k = 0; k < 4; k++) glow(ctx, -s * 0.5 + k * s * 0.35, s * 0.25, 2.2 * S, "hsla(190, 100%, 72%, ALPHA)", 0.9);
      ctx.globalCompositeOperation = "source-over";
      ctx.restore();
    }
    // --- the anglerfish ---
    { const A = D.angler, s = 60 * S, dir = A.dir;
      const snap = A.snap ? (t - A.snap) : 99, open = snap < 0.6 ? (snap < 0.15 ? snap / 0.15 : 1 - (snap - 0.15) / 0.45) : 0;
      const mouth = 0.12 + 0.06 * Math.sin(t * 0.9 + A.ph) + open * 0.75;
      // the light pool from its lure
      ctx.globalCompositeOperation = "lighter";
      const pulse = 0.75 + 0.25 * Math.sin(t * 3.2) + (Math.hypot(pointer.x - A.lure.x, pointer.y - A.lure.y) < 200 ? 0.35 : 0);
      glow(ctx, A.lure.x, A.lure.y, 170 * S * pulse, "hsla(170, 100%, 60%, ALPHA)", 0.16);
      ctx.globalCompositeOperation = "source-over";
      ctx.save(); ctx.translate(A.x, A.y); ctx.scale(dir, 1);
      ctx.fillStyle = "#14101a";                                            // tail and fins
      ctx.beginPath(); ctx.moveTo(-s * 0.85, 0); ctx.lineTo(-s * 1.35, -s * 0.35 + Math.sin(t * 2) * 4); ctx.lineTo(-s * 1.3, s * 0.4 + Math.sin(t * 2) * 4); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-s * 0.1, s * 0.35); ctx.lineTo(-s * 0.45, s * 0.75); ctx.lineTo(s * 0.05, s * 0.5); ctx.fill();
      const body = ctx.createRadialGradient(-s * 0.1, -s * 0.3, s * 0.1, 0, 0, s);
      body.addColorStop(0, "#3a3040"); body.addColorStop(1, "#0e0b12");
      ctx.fillStyle = body; ctx.beginPath();                                // a lumpy body
      for (let k = 0; k <= 40; k++) { const a = (k / 40) * TAU, r = 1 + 0.06 * Math.sin(a * 7 + A.ph); const x = Math.cos(a) * s * 0.9 * r, y = Math.sin(a) * s * 0.62 * r; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.fill();
      // the mouth: a dark gap lined with needle teeth
      const mx = s * 0.55, my = s * 0.12, mw = s * 0.48, mh = s * (0.08 + mouth * 0.42);
      ctx.fillStyle = "#040006"; ctx.beginPath(); ctx.ellipse(mx, my, mw, mh, -0.1, 0, TAU); ctx.fill();
      ctx.fillStyle = "#ece6d4";
      for (let k = 0; k < 9; k++) {
        const x = mx - mw * 0.8 + k * (mw * 1.6 / 8), top = my - mh * Math.sqrt(Math.max(0, 1 - ((x - mx) / mw) ** 2)), bot = my + mh * Math.sqrt(Math.max(0, 1 - ((x - mx) / mw) ** 2));
        const L = s * (0.1 + (k % 2) * 0.07);
        ctx.beginPath(); ctx.moveTo(x - 2 * S, top); ctx.lineTo(x, top + L); ctx.lineTo(x + 2 * S, top); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - 2 * S, bot); ctx.lineTo(x + 1, bot - L * 0.9); ctx.lineTo(x + 2 * S, bot); ctx.fill();
      }
      ctx.globalCompositeOperation = "lighter"; glow(ctx, s * 0.32, -s * 0.3, 5 * S, "hsla(140, 80%, 70%, ALPHA)", 0.9); ctx.globalCompositeOperation = "source-over";   // a pale eye
      // the stalk and its glowing lure
      const lx = (A.lure.x - A.x) * dir, ly = A.lure.y - A.y;
      ctx.strokeStyle = "#3a2e44"; ctx.lineWidth = 2.6 * S; ctx.beginPath(); ctx.moveTo(s * 0.15, -s * 0.55); ctx.quadraticCurveTo(s * 0.3, -s * 1.5, lx, ly); ctx.stroke();
      ctx.restore();
      ctx.globalCompositeOperation = "lighter";
      glow(ctx, A.lure.x, A.lure.y, 26 * S * pulse, "hsla(175, 100%, 70%, ALPHA)", 0.95);
      ctx.fillStyle = "#eaffff"; ctx.beginPath(); ctx.arc(A.lure.x, A.lure.y, 4.5 * S, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = "source-over"; }
  }
  // Taps: the anglerfish snaps, the vampire squid turns inside out
  function tapDeep(D, x, y, t) {
    const A = D.angler, S = D.S;
    if (Math.hypot(x - A.x, y - A.y) < 150 * S || Math.hypot(x - A.lure.x, y - A.lure.y) < 70 * S) {
      A.snap = t;
      const mouthX = A.x + A.dir * 34 * S;
      for (const f of D.school) if (f.gone <= t && Math.hypot(f.x - mouthX, f.y - A.y) < 170 * S) { f.gone = t + 8; f.x = rnd(0, innerWidth); f.y = innerHeight * 0.3; }
      Sound.sfx("anglerSnap");
      return true;
    }
    const V = D.vampire;
    if (V.x !== undefined && Math.hypot(x - V.x, y - V.y) < 70 * S) {
      V.flip = t;
      V.cloud.push(...Array.from({ length: 40 }, () => { const a = rnd(0, TAU), sp = rnd(20, 90); return { x: V.x, y: V.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: rnd(3, 9) * S, life: rnd(1.5, 3) }; }));
      Sound.sfx("inkPuff");
      return true;
    }
    return false;
  }

  const Ocean = makeScene("ocean", {
    build() {
      const { w, h } = this;
      const [bg, g] = mkCanvas(w, h);
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "#06324a"); gr.addColorStop(0.35, "#03203a"); gr.addColorStop(1, "#010810");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const sun = g.createRadialGradient(w * 0.5, -h * 0.15, 0, w * 0.5, -h * 0.15, h * 0.9);
      sun.addColorStop(0, "rgba(140, 230, 255, .28)"); sun.addColorStop(1, "rgba(140, 230, 255, 0)");
      g.fillStyle = sun; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < 7; i++) {                            // light shafts from the surface
        const x = w * (0.08 + i * 0.13) + rnd(-30, 30), bw = rnd(30, 90), sk = rnd(-0.25, 0.25) * h;
        const lg = g.createLinearGradient(0, 0, 0, h * 0.8);
        lg.addColorStop(0, "rgba(150, 230, 255, .09)"); lg.addColorStop(1, "rgba(150, 230, 255, 0)");
        g.fillStyle = lg;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + bw, 0); g.lineTo(x + bw * 2 + sk, h * 0.8); g.lineTo(x + sk, h * 0.8); g.fill();
      }
      this.bg = bg;
      this.TW = Math.ceil(w * 1.6);
      const shapes = [];
      for (let x = -40; x < this.TW + 40; x += 28) {
        const y = h * 0.91 + Math.sin(x * 0.01) * h * 0.03 + rnd(-10, 10), r = rnd(24, 60);
        shapes.push(c => { c.fillStyle = "#010a12"; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.fillRect(x - r, y, r * 2, h); });
      }
      for (let i = 0; i < Math.ceil(this.TW / 150); i++) {      // fan corals
        const x = rnd(0, this.TW), y = h * rnd(0.87, 0.93), s = rnd(30, 70), lean = rnd(-0.3, 0.3);
        shapes.push(c => {
          c.strokeStyle = "#021320"; c.lineCap = "round";
          const br = (x0, y0, a, len, dep) => {
            if (dep > 4) return;
            const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
            c.lineWidth = Math.max(1, 4 - dep);
            c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
            br(x1, y1, a - 0.42, len * 0.72, dep + 1); br(x1, y1, a + 0.42, len * 0.72, dep + 1);
          };
          br(x, y, -Math.PI / 2 + lean, s * 0.45, 0);
        });
      }
      this.bed = tileLayer(this.TW, h, shapes);
      this.kelp = Array.from({ length: Math.ceil(this.TW / 110) }, () => ({ x: rnd(0, this.TW), hgt: h * rnd(0.35, 0.72), ph: rnd(0, TAU), wd: rnd(5, 9) }));
      const hues = [320, 190, 270, 175, 300, 210];
      this.jellies = Array.from({ length: clamp(Math.round(w / 190), 5, 10) }, (_, i) => ({ x: Math.random(), y: Math.random(), d0: Math.random(), hue: hues[i % hues.length], ph: rnd(0, TAU), size: rnd(0.8, 1.2), sp: rnd(0.6, 1) }));
      this.plankton = Array.from({ length: clamp(Math.round((w * h) / 5000), 150, 320) }, () => ({ x: Math.random(), y: Math.random(), d0: Math.random(), lit: 0, ph: rnd(0, TAU), hue: Math.round(rnd(165, 200)) }));
      this.bubbles = Array.from({ length: 26 }, () => ({ x: Math.random(), y: Math.random(), r: rnd(1.5, 5), sp: rnd(30, 80), ph: rnd(0, TAU) }));
      this.deep = makeDeep(w, h, false);
    },
    lite() { this.plankton = this.plankton.filter((_, i) => i % 2 === 0); this.deep.school.length = 12; },
    tap(x, y, t) {
      if (tapDeep(this.deep, x, y, t)) return;
      const j = this.jellies.find(j => j.sx !== undefined && Math.hypot(j.sx - x, j.sy - j.R * 0.3 - y) < Math.max(40, j.R * 1.6));
      if (j) { j.dash = { t, ang: Math.atan2(j.sy - y, j.sx - x) + rnd(-0.4, 0.4) }; Eggs.bump("jelly"); }
      this.glow = { x, y, t };
      this.extra = (this.extra || []).concat(Array.from({ length: 14 }, () => ({ x: x + rnd(-14, 14), y: y + rnd(-8, 8), vy: rnd(60, 160), r: rnd(2, 6), life: rnd(1.2, 2.4), ph: rnd(0, TAU) })));
      Sound.sfx("bubbles");
    },
    draw(t, dt) {
      const { ctx, w, h, TW } = this;
      ctx.drawImage(this.bg, 0, 0, w, h);
      // Kelp swaying in the current
      const kx0 = -mod(cam.x * 0.14, TW);
      ctx.lineCap = "round";
      for (const k of this.kelp) {
        const bx = wrapX(k.x + kx0, TW, w);
        if (bx < -80 || bx > w + 80) continue;
        ctx.strokeStyle = "#03283c"; ctx.fillStyle = "#03283c";
        let px = bx, py = h;
        for (let i = 1; i <= 14; i++) {
          const f = i / 14;
          const nx = bx + Math.sin(t * 0.8 + k.ph + i * 0.35) * i * 2.4, ny = h - f * k.hgt;
          ctx.lineWidth = k.wd * (1 - f * 0.6);
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke();
          if (i % 2 === 0) { ctx.beginPath(); ctx.ellipse(nx + (i % 4 ? 7 : -7), ny, 9, 3.5, i % 4 ? 0.5 : -0.5, 0, TAU); ctx.fill(); }
          px = nx; py = ny;
        }
      }
      // Plankton light up when your cursor passes or the wall moves
      const stir = Math.min(1, Math.hypot(cam.vx, cam.vy) / 25);
      ctx.globalCompositeOperation = "lighter";
      for (const p of this.plankton) {
        const d = mod(p.d0 + cam.z * 0.5, 1), par = 0.05 + d * 0.4;
        const x = mod(p.x * w * 1.3 + Math.sin(t * 0.3 + p.ph) * 12 - cam.x * par, w * 1.3) - w * 0.15;
        const y = mod(p.y * h * 1.2 - t * 6 * (0.3 + d) - cam.y * par * 0.5 + Math.cos(t * 0.4 + p.ph) * 8, h * 1.2) - h * 0.1;
        const dist = Math.hypot(x - pointer.x, y - pointer.y);
        if (dist < 130) p.lit = Math.max(p.lit, 1 - dist / 130);
        if (this.glow && t - this.glow.t < 0.8) {             // a tap sends a wave of light outward
          const gd = Math.hypot(x - this.glow.x, y - this.glow.y), front = (t - this.glow.t) * 420;
          if (Math.abs(gd - front) < 60) p.lit = 1;
        }
        p.lit = Math.max(p.lit * (1 - dt * 0.9), stir * 0.6);
        const sz = 0.6 + d * 2.2, fade = smooth(0, 0.1, d);
        if (p.lit > 0.12) {
          const R = sz * 8 * p.lit;
          ctx.globalAlpha = p.lit * 0.9 * fade;
          ctx.drawImage(Jungle.sprite(p.hue, 62), x - R, y - R, R * 2, R * 2);
        }
        ctx.globalAlpha = (0.15 + p.lit * 0.85) * fade;
        ctx.fillStyle = `hsl(${p.hue}, 100%, 82%)`;
        ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      }
      ctx.globalAlpha = 1;
      for (const j of this.jellies) drawJelly(ctx, j, t, w, h);
      ctx.globalCompositeOperation = "source-over";
      // the creatures of the deep
      const ddt = Math.min(0.05, Math.max(0, t - (this.deepLast ?? t))); this.deepLast = t;
      if (!calm) stepDeep(this.deep, t, ddt, w, h);
      else if (!this.deep.angler.lure) stepDeep(this.deep, t, 0, w, h);
      drawDeep(ctx, this.deep, t, w, h);
      drawWrapped(ctx, this.bed, 0.18, w);
      // A whale passing by, singing (the Ocean's secret)
      if (this.whale) {
        const age = t - this.whale.t, dur = 16;
        if (age > dur) this.whale = null;
        else {
          const L = Math.min(w, h) * 0.75, x = w + L * 0.3 - (age / dur) * (w + L * 1.6), y = h * 0.52 + Math.sin(age * 0.5) * h * 0.04;
          const a = Math.min(1, age / 2, (dur - age) / 2), H2 = L * 0.2, fl = Math.sin(age * 1.6) * 0.35;
          ctx.save(); ctx.translate(x, y); ctx.globalAlpha = a * 0.92;
          const bg = ctx.createLinearGradient(0, -H2, 0, H2);
          bg.addColorStop(0, "#2a6d9e"); bg.addColorStop(0.55, "#174a73"); bg.addColorStop(1, "#0d3254");
          ctx.fillStyle = bg;
          ctx.beginPath(); ctx.moveTo(0, 0);
          ctx.bezierCurveTo(L * 0.05, -H2 * 0.9, L * 0.45, -H2 * 0.95, L * 0.86, -H2 * 0.12);
          ctx.lineTo(L * 0.86, H2 * 0.1);
          ctx.bezierCurveTo(L * 0.5, H2 * 0.9, L * 0.12, H2 * 0.85, 0, 0); ctx.fill();
          ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = "rgba(110, 230, 255, .55)"; ctx.lineWidth = 3; ctx.shadowColor = "#5ce1ff"; ctx.shadowBlur = 18; ctx.stroke(); ctx.restore();   // glowing outline
          ctx.save(); ctx.translate(L * 0.86, 0); ctx.rotate(fl);                   // tail flukes
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * 0.08, -H2 * 0.4, L * 0.17, -H2 * 0.75); ctx.quadraticCurveTo(L * 0.1, -H2 * 0.15, L * 0.07, 0);
          ctx.quadraticCurveTo(L * 0.1, H2 * 0.15, L * 0.17, H2 * 0.75); ctx.quadraticCurveTo(L * 0.08, H2 * 0.4, 0, 0); ctx.fill(); ctx.restore();
          ctx.beginPath(); ctx.moveTo(L * 0.28, H2 * 0.45); ctx.quadraticCurveTo(L * 0.3, H2 * 1.3 + Math.sin(age) * 10, L * 0.42, H2 * 1.1); ctx.quadraticCurveTo(L * 0.36, H2 * 0.8, L * 0.34, H2 * 0.5); ctx.fill();   // fin
          ctx.strokeStyle = "rgba(120, 200, 255, .25)"; ctx.lineWidth = 1.2;                // throat grooves
          for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(L * 0.03, H2 * (0.12 + k * 0.08)); ctx.quadraticCurveTo(L * 0.2, H2 * (0.4 + k * 0.08), L * 0.42, H2 * (0.45 + k * 0.06)); ctx.stroke(); }
          ctx.globalCompositeOperation = "lighter";
          for (let k = 0; k < 34; k++) {                                              // bioluminescent spots
            const fx0 = (k * 0.618) % 1, px0 = L * (0.06 + fx0 * 0.76), py0 = Math.sin(k * 2.3) * H2 * 0.55 * Math.sin(Math.PI * (0.1 + fx0 * 0.8));
            glow(ctx, px0, py0, 12 + 5 * Math.sin(t * 3 + k), "hsla(185, 100%, 72%, ALPHA)", 0.95);
          }
          glow(ctx, L * 0.1, -H2 * 0.15, 16, "hsla(190, 100%, 88%, ALPHA)", 1);           // its eye
          ctx.restore();
          ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
        }
      }
      // Bubbles released by taps
      if (this.extra?.length) {
        ctx.strokeStyle = "rgba(200, 245, 255, .7)"; ctx.lineWidth = 1.2;
        this.extra = this.extra.filter(b => {
          b.life -= dt; b.y -= b.vy * dt; b.x += Math.sin(t * 6 + b.ph) * 0.6;
          if (b.life <= 0) return false;
          ctx.globalAlpha = Math.min(1, b.life);
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
          return true;
        });
        ctx.globalAlpha = 1;
      }
      // Rising bubbles
      ctx.strokeStyle = "rgba(180, 240, 255, .35)"; ctx.lineWidth = 1;
      for (const b of this.bubbles) {
        const x = mod(b.x * w + Math.sin(t * 2 + b.ph) * 6 - cam.x * 0.2, w), y = mod(b.y * h - t * b.sp, h * 1.1);
        ctx.beginPath(); ctx.arc(x, y, b.r, 0, TAU); ctx.stroke();
      }
    },
  });

  /* ===== AURORA: northern lights rippling over snowy mountains, gentle snowfall ===== */
  function mountainLayer(TW, h, { base, hMin, hMax, color, snow, trees }) {
    const pts = [[0, base - rnd(0, hMin * 0.3)]];
    let x = 0;
    while (x < TW - 240) {
      x += rnd(70, 150); pts.push([x, base - rnd(hMin, hMax)]);
      x += rnd(70, 150); pts.push([Math.min(x, TW - 60), base - rnd(0, hMin * 0.35)]);
    }
    pts.push([TW, pts[0][1]]);
    const ridgeY = px => {
      for (let i = 1; i < pts.length; i++) if (pts[i][0] >= px) { const [ax, ay] = pts[i - 1], [bx, by] = pts[i]; return ay + ((by - ay) * (px - ax)) / (bx - ax || 1); }
      return pts[0][1];
    };
    const treeList = [];
    if (trees) for (let tx = 4; tx < TW; tx += rnd(7, 16)) treeList.push([tx, rnd(14, 34)]);
    return tileLayer(TW, h, [g => {
      g.fillStyle = color;
      g.beginPath(); g.moveTo(0, h);
      for (const [px, py] of pts) g.lineTo(px, py);
      g.lineTo(TW, h); g.closePath(); g.fill();
      if (snow) {
        g.fillStyle = snow;
        for (let i = 1; i < pts.length - 1; i += 2) {
          const [px, py] = pts[i], [lx, ly] = pts[i - 1], [rx, ry] = pts[i + 1], k = 0.32;
          const ax = px + (lx - px) * k, ay = py + (ly - py) * k, bx = px + (rx - px) * k, by = py + (ry - py) * k;
          g.beginPath(); g.moveTo(ax, ay); g.lineTo(px, py); g.lineTo(bx, by);
          for (let s = 6; s >= 0; s--) { const f = s / 6; g.lineTo(ax + (bx - ax) * f, ay + (by - ay) * f + (s % 2 ? 9 : -3)); }
          g.closePath(); g.fill();
        }
      }
      if (trees) {
        g.fillStyle = color;
        for (const [tx, th] of treeList) {
          const ty = ridgeY(tx) + 4;
          for (let k = 0; k < 3; k++) {
            const tw = th * (0.45 - k * 0.1), y0 = ty - th * (k * 0.28);
            g.beginPath(); g.moveTo(tx - tw, y0); g.lineTo(tx, y0 - th * 0.5); g.lineTo(tx + tw, y0); g.fill();
          }
        }
      }
    }]);
  }

  const Aurora = makeScene("aurora", {
    front: true,
    build() {
      const { w, h } = this;
      const [sky, g] = mkCanvas(w, h);
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "#01040f"); gr.addColorStop(0.55, "#061633"); gr.addColorStop(0.78, "#12305a"); gr.addColorStop(1, "#0a1a33");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 700; i++) {
        g.fillStyle = `rgba(255, 255, 255, ${rnd(0.15, 0.8)})`;
        const s = Math.random() < 0.06 ? 1.6 : 0.9;
        g.fillRect(rnd(0, w), rnd(0, h * 0.75), s, s);
      }
      this.sky = sky;
      this.twinkle = Array.from({ length: 90 }, () => ({ x: rnd(0, w), y: rnd(0, h * 0.7), ph: rnd(0, TAU), sp: rnd(1, 3) }));
      // Aurora colour strips: bright at the base, fading up into violet
      const strip = (c0, c1, c2) => {
        const [c, s] = mkCanvas(2, 256);
        const lg = s.createLinearGradient(0, 256, 0, 0);
        lg.addColorStop(0, c0); lg.addColorStop(0.12, c1); lg.addColorStop(0.55, c2); lg.addColorStop(1, "rgba(0,0,0,0)");
        s.fillStyle = lg; s.fillRect(0, 0, 2, 256);
        return c;
      };
      this.ribbons = [
        { img: strip("rgba(190,255,220,.9)", "rgba(60,255,160,.7)", "rgba(120,80,255,.18)"), base: 0.28, amp: 0.07, ph: rnd(0, TAU), ph2: rnd(0, TAU), hgt: 0.3 },
        { img: strip("rgba(170,255,240,.8)", "rgba(40,220,200,.55)", "rgba(80,120,255,.15)"), base: 0.2, amp: 0.05, ph: rnd(0, TAU), ph2: rnd(0, TAU), hgt: 0.24 },
        { img: strip("rgba(255,190,240,.7)", "rgba(200,90,255,.45)", "rgba(80,60,200,.12)"), base: 0.36, amp: 0.06, ph: rnd(0, TAU), ph2: rnd(0, TAU), hgt: 0.2 },
      ];
      this.TW = Math.ceil(w * 1.6);
      this.far = mountainLayer(this.TW, h, { base: h * 0.74, hMin: h * 0.12, hMax: h * 0.3, color: "#0a1830", snow: "rgba(190, 210, 240, .6)" });
      this.mid = mountainLayer(this.TW, h, { base: h * 0.84, hMin: h * 0.08, hMax: h * 0.22, color: "#060f22", snow: "rgba(215, 228, 250, .8)" });
      this.near = mountainLayer(this.TW, h, { base: h * 0.95, hMin: h * 0.02, hMax: h * 0.08, color: "#02060e", trees: true });
      this.flakes = Array.from({ length: clamp(Math.round((w * h) / 7000), 90, 220) }, () => ({ x: Math.random(), y: Math.random(), d0: Math.random(), ph: rnd(0, TAU), sp: rnd(0.7, 1.3) }));
      this.shoot = {};
    },
    lite() { this.flakes = this.flakes.filter((_, i) => i % 2 === 0); },
    tap() { this.shoot.next = 0; this.shoot.s = null; Sound.sfx("sparkle"); },
    draw(t, dt) {
      const { ctx, fctx, w, h } = this;
      ctx.drawImage(this.sky, 0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const s of this.twinkle) {
        ctx.globalAlpha = 0.3 + 0.7 * Math.pow(Math.max(0, Math.sin(t * s.sp + s.ph)), 3);
        ctx.fillStyle = "#fff"; ctx.fillRect(s.x, s.y, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
      shootingStar(this.shoot, ctx, t, dt, w, h * 0.5);
      // The aurora: columns of light that ripple and shimmer
      const step = this.lite ? 10 : 6, pan = Math.tanh(-cam.x / 6000) * 80;
      ctx.globalCompositeOperation = "lighter";
      for (const r of this.ribbons) {
        const breathe = 0.65 + 0.35 * Math.sin(t * 0.25 + r.ph);
        for (let x = -20; x < w + 20; x += step) {
          const X = x - pan;
          const y = h * r.base + Math.sin(X * 0.0035 + t * 0.15 + r.ph) * h * r.amp + Math.sin(X * 0.011 - t * 0.33 + r.ph2) * h * r.amp * 0.4;
          const H = h * r.hgt * (0.55 + 0.45 * Math.sin(X * 0.021 + t * 0.9 + r.ph2));
          const edge = smooth(-20, w * 0.15, x) * (1 - smooth(w * 0.85, w + 20, x));
          ctx.globalAlpha = (0.35 + 0.3 * Math.sin(X * 0.05 + t * 1.7 + r.ph)) * breathe * edge;
          ctx.drawImage(r.img, x, y - H, step + 1, H);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      drawWrapped(ctx, this.far, 0.02, w);
      drawWrapped(ctx, this.mid, 0.06, w);
      drawWrapped(ctx, this.near, 0.13, w);
      // Snow (the nearest flakes fall in front of the posts)
      for (const f of this.flakes) {
        const d = mod(f.d0 + cam.z * 0.5, 1), par = 0.05 + d * 0.4;
        const x = mod(f.x * w * 1.2 + Math.sin(t * 0.6 * f.sp + f.ph) * 30 - cam.x * par, w * 1.2) - w * 0.1;
        const y = mod(f.y * h * 1.2 + t * (18 + d * 55) * f.sp - cam.y * par * 0.4, h * 1.2) - h * 0.1;
        const sz = 0.8 + d * 3.4, a = (0.35 + d * 0.6) * smooth(0, 0.12, d) * (1 - smooth(0.92, 1, d));
        const g = d > 0.8 ? fctx : ctx;
        g.globalAlpha = a; g.fillStyle = "#eef4ff";
        g.beginPath(); g.arc(x, y, sz, 0, TAU); g.fill();
      }
      ctx.globalAlpha = 1; fctx.globalAlpha = 1;
    },
  });

  /* ===== SAKURA DUSK: cherry blossoms swirling past paper lanterns at sunset ===== */
  function makeBlossomBranch(S) {
    const [c, g] = mkCanvas(S * 1.15, S * 0.85);
    const py = S * 0.1, blossoms = [];
    const br = (x, y, a, len, wd, dep) => {
      const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len;
      g.strokeStyle = "#2a1420"; g.lineWidth = wd; g.lineCap = "round";
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo((x + x1) / 2 + rnd(-8, 8), (y + y1) / 2 + rnd(-8, 8), x1, y1); g.stroke();
      if (dep > 0) blossoms.push([x1, y1, 1 + dep * 0.15], [(x + x1) / 2, (y + y1) / 2, 0.8]);
      if (dep < 5 && wd > 1.2) {
        br(x1, y1, a + rnd(0.2, 0.6), len * rnd(0.6, 0.8), wd * 0.68, dep + 1);
        br(x1, y1, a - rnd(0.1, 0.5), len * rnd(0.6, 0.8), wd * 0.68, dep + 1);
      }
    };
    br(0, py, 0.35, S * 0.3, S * 0.035, 0);
    for (const [x, y, k] of blossoms) {
      for (let i = 0; i < 8; i++) {
        const bx = x + rnd(-14, 14) * k, by = y + rnd(-12, 12) * k, r = rnd(3, 6.5);
        g.fillStyle = `hsl(${rnd(330, 352)}, ${rnd(60, 82)}%, ${rnd(78, 90)}%)`;
        g.beginPath(); g.arc(bx, by, r, 0, TAU); g.fill();
        g.fillStyle = "hsla(340, 80%, 58%, .6)";
        g.beginPath(); g.arc(bx, by, r * 0.3, 0, TAU); g.fill();
      }
    }
    return { img: c, px: 0, py };
  }

  const Sakura = makeScene("sakura", {
    front: true, fringe: true,
    build() {
      const { w, h } = this;
      const hz = h * 0.74;
      const [sky, g] = mkCanvas(w, h);
      const gr = g.createLinearGradient(0, 0, 0, hz);
      gr.addColorStop(0, "#2a1a4a"); gr.addColorStop(0.42, "#6b3a78"); gr.addColorStop(0.75, "#e0708a"); gr.addColorStop(0.92, "#ffb27a"); gr.addColorStop(1, "#ffd59e");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const sunX = w * 0.62, sunR = h * 0.11;
      const glow = g.createRadialGradient(sunX, hz, 0, sunX, hz, h * 0.6);
      glow.addColorStop(0, "rgba(255, 210, 150, .55)"); glow.addColorStop(1, "rgba(255, 210, 150, 0)");
      g.fillStyle = glow; g.fillRect(0, 0, w, h);
      g.fillStyle = "#ffe6b8"; g.beginPath(); g.arc(sunX, hz - sunR * 0.25, sunR, 0, TAU); g.fill();
      for (let i = 0; i < 9; i++) {                                // sunset clouds
        const cx = rnd(0, w), cy = rnd(h * 0.12, h * 0.55), cw = rnd(w * 0.08, w * 0.25);
        g.fillStyle = `rgba(255, ${Math.round(rnd(150, 200))}, ${Math.round(rnd(170, 200))}, ${rnd(0.12, 0.28)})`;
        g.beginPath(); g.ellipse(cx, cy, cw, cw * 0.06, 0, 0, TAU); g.fill();
      }
      this.sky = sky;
      this.TW = Math.ceil(w * 1.6);
      const TW = this.TW;
      // Far: a snow-capped volcano
      const fx = TW * 0.3, fw = w * 0.42, fh = h * 0.3;
      this.far = tileLayer(TW, h, [c => {
        c.fillStyle = "#4a2a5e";
        c.beginPath(); c.moveTo(fx - fw, hz + 4); c.quadraticCurveTo(fx - fw * 0.25, hz - fh * 0.6, fx - fw * 0.09, hz - fh);
        c.lineTo(fx + fw * 0.09, hz - fh); c.quadraticCurveTo(fx + fw * 0.25, hz - fh * 0.6, fx + fw, hz + 4); c.fill();
        c.fillStyle = "#f2c6d6";
        c.beginPath(); c.moveTo(fx - fw * 0.09, hz - fh); c.lineTo(fx + fw * 0.09, hz - fh); c.lineTo(fx + fw * 0.2, hz - fh * 0.72);
        for (let s = 6; s >= 0; s--) c.lineTo(fx - fw * 0.2 + (fw * 0.4 * s) / 6, hz - fh * 0.72 + (s % 2 ? 8 : -2));
        c.fill();
        c.fillStyle = "#3a1f45"; c.fillRect(0, hz, TW, h - hz);
      }]);
      // Mid: hills and a pagoda
      const ridge = periodicRidge(TW, hz + h * 0.04, [[2, h * 0.025], [5, h * 0.012]]);
      const px = TW * 0.72, pBase = ridge(TW * 0.72);
      this.mid = tileLayer(TW, h, [c => {
        c.fillStyle = "#2c1638";
        c.beginPath(); c.moveTo(0, h); for (let x = 0; x <= TW; x += 8) c.lineTo(x, ridge(x)); c.lineTo(TW, h); c.fill();
        for (let k = 0; k < 5; k++) {
          const y = pBase - 12 - k * 22, rw = 46 - k * 6;
          c.fillRect(px - rw * 0.32, y - 6, rw * 0.64, 22);
          c.beginPath(); c.moveTo(px - rw, y + 2); c.quadraticCurveTo(px - rw * 0.5, y - 2, px - rw * 0.3, y - 10);
          c.lineTo(px + rw * 0.3, y - 10); c.quadraticCurveTo(px + rw * 0.5, y - 2, px + rw, y + 2); c.fill();
        }
        c.fillRect(px - 1.5, pBase - 145, 3, 30);
      }]);
      // Near: dark hills with round blossom trees
      const ridge2 = periodicRidge(TW, h * 0.9, [[3, h * 0.03], [7, h * 0.012]]);
      const trees = Array.from({ length: Math.ceil(TW / 120) }, () => [rnd(0, TW), rnd(26, 52)]);
      this.near = tileLayer(TW, h, [c => {
        c.fillStyle = "#1a0d24";
        c.beginPath(); c.moveTo(0, h); for (let x = 0; x <= TW; x += 8) c.lineTo(x, ridge2(x)); c.lineTo(TW, h); c.fill();
        for (const [tx, r] of trees) {
          const ty = ridge2(tx);
          c.fillStyle = "#1a0d24"; c.fillRect(tx - 3, ty - r, 6, r);
          c.fillStyle = "#3a1838";
          for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(tx + Math.cos(k * 1.3) * r * 0.55, ty - r - Math.abs(Math.sin(k * 1.7)) * r * 0.5, r * 0.55, 0, TAU); c.fill(); }
        }
      }]);
      // Blossom branches reaching in from the top corners
      const S = Math.min(w, h) * 0.95;
      fringeItem(this.fringeEl, makeBlossomBranch(S), -10, -S * 0.04, 0.12, 1, 0.02);
      fringeItem(this.fringeEl, makeBlossomBranch(S * 0.85), w + 10, -S * 0.02, 0.18, -1, 0.02);
      this.petals = Array.from({ length: clamp(Math.round((w * h) / 9000), 80, 180) }, () => ({ x: Math.random(), y: Math.random(), d0: Math.random(), rot: rnd(0, TAU), spin: rnd(0, TAU), sp: rnd(1.5, 3.5), hue: rnd(335, 352) }));
      this.lanterns = Array.from({ length: 7 }, () => ({ x: Math.random(), y: Math.random(), d: rnd(0.25, 1), ph: rnd(0, TAU), sp: rnd(6, 14) }));
    },
    lite() { this.petals = this.petals.filter((_, i) => i % 2 === 0); },
    tap(x, y, t) { this.gust = { x, y, t }; Sound.sfx("petals"); },
    draw(t) {
      const { ctx, fctx, w, h } = this;
      ctx.drawImage(this.sky, 0, 0, w, h);
      drawWrapped(ctx, this.far, 0.02, w);
      // Sky lanterns drifting up
      for (const L of this.lanterns) {
        const par = 0.03 + L.d * 0.15;
        const x = mod(L.x * w * 1.3 + Math.sin(t * 0.3 + L.ph) * 18 - cam.x * par, w * 1.3) - w * 0.15;
        const y = mod(L.y * h * 1.3 - t * L.sp * L.d, h * 1.3) - h * 0.1;
        const s = 7 + L.d * 12, flick = 0.85 + 0.15 * Math.sin(t * 9 + L.ph);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.85 * flick;
        ctx.drawImage(Jungle.sprite(32, 58), x - s * 4, y - s * 4, s * 8, s * 8);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        const lg = ctx.createLinearGradient(0, y - s, 0, y + s);
        lg.addColorStop(0, "#ffe2b0"); lg.addColorStop(1, "#ff9a3c");
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.moveTo(x - s * 0.55, y - s * 0.8); ctx.lineTo(x + s * 0.55, y - s * 0.8); ctx.lineTo(x + s * 0.45, y + s * 0.6); ctx.lineTo(x - s * 0.45, y + s * 0.6); ctx.fill();
        ctx.fillStyle = "rgba(120, 40, 20, .5)"; ctx.fillRect(x - s * 0.55, y - s * 0.86, s * 1.1, s * 0.12);
      }
      if (this.festival) {                                     // the Lantern Festival (Sakura's secret)
        const F = this.festival, age = t - F.t;
        if (age > 28) this.festival = null;
        else {
          const night = Math.min(1, age / 3, (28 - age) / 3);
          ctx.fillStyle = `rgba(14, 6, 40, ${0.5 * night})`; ctx.fillRect(0, 0, w, h);
          for (const L of F.lanterns) {
            const k = age - L.delay; if (k < 0) continue;
            const x = L.x * w + Math.sin(t * 0.4 + L.ph) * 24, y = h + 30 - k * L.sp, s = L.s;
            if (y < -40) continue;
            ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.8 * night;
            ctx.drawImage(Jungle.sprite(32, 58), x - s * 4, y - s * 4, s * 8, s * 8);
            ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = night;
            ctx.fillStyle = "#ffcf8a";
            ctx.beginPath(); ctx.moveTo(x - s * 0.55, y - s * 0.8); ctx.lineTo(x + s * 0.55, y - s * 0.8); ctx.lineTo(x + s * 0.45, y + s * 0.6); ctx.lineTo(x - s * 0.45, y + s * 0.6); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }
      drawWrapped(ctx, this.mid, 0.06, w);
      drawWrapped(ctx, this.near, 0.14, w);
      // Petals tumbling on the breeze (nearest ones over the posts)
      for (const p of this.petals) {
        const d = mod(p.d0 + cam.z * 0.5, 1), par = 0.05 + d * 0.4;
        let x = mod(p.x * w * 1.3 + t * (20 + d * 45) + Math.sin(t * 0.9 + p.spin) * 25 - cam.x * par, w * 1.3) - w * 0.15;
        let y = mod(p.y * h * 1.2 + t * (14 + d * 40) - cam.y * par * 0.4, h * 1.2) - h * 0.1;
        if (this.gust && t - this.gust.t < 3) {
          const gx = x - this.gust.x, gy = y - this.gust.y, gd = Math.hypot(gx, gy), age = t - this.gust.t;
          if (gd < 300 && gd > 0.1) { const k = (1 - gd / 300) * ease.outCubic(Math.min(1, age / 0.7)) * (1 - smooth(1.5, 3, age)) * 180; const a = Math.atan2(gy, gx) + age * 1.2; x += Math.cos(a) * k; y += Math.sin(a) * k; }
        }
        const s = 2.5 + d * 8, a = (0.55 + d * 0.45) * smooth(0, 0.1, d) * (1 - smooth(0.93, 1, d));
        const g = d > 0.78 ? fctx : ctx;
        g.save();
        g.translate(x, y); g.rotate(p.rot + t * 0.6);
        g.scale(Math.cos(t * p.sp + p.spin), 1);                 // flipping in the air
        g.globalAlpha = a;
        g.fillStyle = `hsl(${p.hue}, 85%, 86%)`;
        g.beginPath(); g.moveTo(0, -s);
        g.bezierCurveTo(s * 0.9, -s * 0.6, s * 0.7, s * 0.7, 0, s);
        g.bezierCurveTo(-s * 0.7, s * 0.7, -s * 0.9, -s * 0.6, 0, -s);
        g.fill();
        g.restore();
      }
    },
  });

  /* ===== NEON CITY: synthwave grid, striped sunset, glowing skyline, rain and flying cars ===== */
  function skyline(TW, h, hz, { hMin, hMax, color, wins, density, glow }) {
    const list = [];
    let x = 0;
    while (x < TW) {
      const bw = rnd(28, 90), bh = rnd(hMin, hMax), bx = x;
      x += bw + rnd(0, 8);
      const winList = [];
      if (wins) for (let wy = hz - bh + 8; wy < hz - 6; wy += 9) for (let wx = bx + 5; wx < bx + bw - 6; wx += 8) if (Math.random() < density) winList.push([wx, wy, wins[Math.floor(Math.random() * wins.length)]]);
      const ant = Math.random() < 0.25 ? rnd(10, 40) : 0;
      const sign = glow && Math.random() < 0.3 ? wins[Math.floor(Math.random() * wins.length)] : null;
      list.push({ bx, bw, bh, winList, ant, sign });
    }
    return tileLayer(TW, h, [g => {
      for (const b of list) {
        g.fillStyle = color;
        g.fillRect(b.bx, hz - b.bh, b.bw, b.bh + 2);
        if (b.ant) g.fillRect(b.bx + b.bw / 2 - 1, hz - b.bh - b.ant, 2, b.ant);
        if (glow) { g.shadowBlur = 6; }
        for (const [wx, wy, wc] of b.winList) { g.fillStyle = wc; g.shadowColor = wc; g.fillRect(wx, wy, 4, 3); }
        if (b.sign) { g.shadowColor = b.sign; g.shadowBlur = 14; g.fillStyle = b.sign; g.fillRect(b.bx + 3, hz - b.bh + 12, 3, b.bh * 0.35); }
        g.shadowBlur = 0;
      }
    }]);
  }

  const Neon = makeScene("neon", {
    front: true,
    build() {
      const { w, h } = this;
      const hz = (this.hz = h * 0.62);
      const [sky, g] = mkCanvas(w, h);
      const gr = g.createLinearGradient(0, 0, 0, hz);
      gr.addColorStop(0, "#0b0221"); gr.addColorStop(0.55, "#2b0a4a"); gr.addColorStop(0.85, "#7a1a6e"); gr.addColorStop(1, "#ff3d81");
      g.fillStyle = gr; g.fillRect(0, 0, w, hz);
      for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${rnd(0.2, 0.8)})`; g.fillRect(rnd(0, w), rnd(0, hz * 0.6), 1, 1); }
      const R = h * 0.2;                                             // the striped sun
      const [sun, sg] = mkCanvas(R * 2, R * 2);
      const sgr = sg.createLinearGradient(0, 0, 0, R * 2);
      sgr.addColorStop(0, "#ffe45c"); sgr.addColorStop(0.5, "#ff8a3d"); sgr.addColorStop(1, "#ff2e88");
      sg.fillStyle = sgr; sg.beginPath(); sg.arc(R, R, R, 0, TAU); sg.fill();
      sg.globalCompositeOperation = "destination-out";
      for (let i = 0; i < 9; i++) sg.fillRect(0, R * 0.95 + i * R * 0.12, R * 2, 2 + i * 1.7);
      const sglow = g.createRadialGradient(w / 2, hz - R * 0.4, R * 0.5, w / 2, hz - R * 0.4, R * 2.6);
      sglow.addColorStop(0, "rgba(255, 80, 160, .45)"); sglow.addColorStop(1, "rgba(255, 80, 160, 0)");
      g.fillStyle = sglow; g.fillRect(0, 0, w, hz);
      g.drawImage(sun, w / 2 - R, hz - R * 1.4);
      const floor = g.createLinearGradient(0, hz, 0, h);
      floor.addColorStop(0, "#2a0638"); floor.addColorStop(1, "#07010f");
      g.fillStyle = floor; g.fillRect(0, hz, w, h - hz);
      const hg = g.createLinearGradient(0, hz - 8, 0, hz + 30);
      hg.addColorStop(0, "rgba(255, 60, 180, 0)"); hg.addColorStop(0.3, "rgba(255, 90, 200, .7)"); hg.addColorStop(1, "rgba(255, 60, 180, 0)");
      g.fillStyle = hg; g.fillRect(0, hz - 8, w, 38);
      this.sky = sky;
      this.TW = Math.ceil(w * 1.6);
      this.far = skyline(this.TW, h, hz + 1, { hMin: h * 0.06, hMax: h * 0.22, color: "#1a0a35", wins: ["rgba(255,120,220,.45)", "rgba(120,220,255,.4)"], density: 0.12 });
      this.near = skyline(this.TW, h, hz + 2, { hMin: h * 0.08, hMax: h * 0.34, color: "#0a0418", wins: ["#30f3ff", "#ff3df2", "#ffe066", "#7c5cff"], density: 0.22, glow: true });
      this.rain = Array.from({ length: clamp(Math.round((w * h) / 5500), 120, 260) }, () => ({ x: Math.random(), y: Math.random(), d0: Math.random() }));
      this.cars = Array.from({ length: 5 }, (_, i) => ({ y: rnd(0.12, 0.45), sp: rnd(90, 230) * (i % 2 ? 1 : -1), x0: rnd(0, 1), hue: [190, 320, 50, 280, 175][i] }));
    },
    lite() { this.rain = this.rain.filter((_, i) => i % 2 === 0); },
    draw(t) {
      // Turbo Mode (Neon City's secret): the whole city runs at 4× for a while
      const real = t; this.tw = (this.tw ?? t) + (real - (this.tlast ?? t)) * ((this.turboUntil || 0) > performance.now() ? 4 : 1); this.tlast = real; t = this.tw;
      const { ctx, fctx, w, h, hz } = this;
      ctx.drawImage(this.sky, 0, 0, w, h);
      // Flying cars with light trails
      ctx.globalCompositeOperation = "lighter";
      for (const c of this.cars) {
        const x = mod(c.x0 * (w + 400) + t * c.sp - cam.x * 0.08, w + 400) - 200, y = c.y * h;
        const tail = -Math.sign(c.sp) * 130;
        const lg = ctx.createLinearGradient(x, y, x + tail, y);
        lg.addColorStop(0, `hsla(${c.hue}, 100%, 70%, .9)`); lg.addColorStop(1, `hsla(${c.hue}, 100%, 60%, 0)`);
        ctx.strokeStyle = lg; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + tail, y); ctx.stroke();
        ctx.drawImage(Jungle.sprite(c.hue, 65), x - 14, y - 14, 28, 28);
      }
      ctx.globalCompositeOperation = "source-over";
      drawWrapped(ctx, this.far, 0.03, w);
      drawWrapped(ctx, this.near, 0.08, w);
      // The grid floor: rushes toward you (faster when you zoom), slides when you pan
      ctx.globalCompositeOperation = "lighter";
      const fh = h - hz, speed = t * 0.35 + cam.z * 1.2 + cam.y * 0.0006;
      const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
      for (let i = 0; i < 22; i++) {
        const z = mod(i / 22 + speed, 1), y = hz + fh * Math.pow(z, 2.6);
        ctx.strokeStyle = `rgba(255, 60, 200, ${z * 0.3})`; ctx.lineWidth = 1 + z * 6; line(0, y, w, y);
        ctx.strokeStyle = `rgba(255, 140, 235, ${z * 0.9})`; ctx.lineWidth = 0.5 + z * 1.5; line(0, y, w, y);
      }
      const spacing = w / 8, shift = -mod(cam.x * 0.9, spacing), vpx = w / 2;
      for (let k = -12; k <= 12; k++) {
        const xb = vpx + (k * spacing + shift) * 2.4, xt = vpx + (xb - vpx) * 0.035;
        ctx.strokeStyle = "rgba(60, 220, 255, .22)"; ctx.lineWidth = 4; line(xt, hz, xb, h);
        ctx.strokeStyle = "rgba(140, 240, 255, .75)"; ctx.lineWidth = 1; line(xt, hz, xb, h);
      }
      ctx.globalCompositeOperation = "source-over";
      // Rain (the nearest streaks fall in front of the posts)
      ctx.lineCap = "round"; fctx.lineCap = "round";
      for (const r of this.rain) {
        const d = mod(r.d0 + cam.z * 0.5, 1), par = 0.05 + d * 0.4, sp = 500 + d * 900;
        const x = mod(r.x * w * 1.2 - t * sp * 0.22 - cam.x * par, w * 1.2) - w * 0.1;
        const y = mod(r.y * h * 1.2 + t * sp, h * 1.2) - h * 0.1;
        const len = 8 + d * 28, g = d > 0.82 ? fctx : ctx;
        g.strokeStyle = `rgba(180, 210, 255, ${(0.12 + d * 0.35) * (1 - smooth(0.95, 1, d))})`;
        g.lineWidth = 0.6 + d * 1.3;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + len * 0.22, y - len); g.stroke();
      }
    },
  });

  /* ===== SAHARA NIGHT: dunes under wheeling stars, a camel caravan, shooting stars, a campfire ===== */
  function camel(g, x, y, s, ph, rider) {
    g.lineCap = "round";
    g.lineWidth = s * 0.12;
    const sw = Math.sin(ph) * s * 0.25;
    for (const [lx, o] of [[-0.45, 1], [-0.3, -1], [0.35, -1], [0.5, 1]]) {
      g.beginPath(); g.moveTo(x + lx * s, y - s * 0.9); g.lineTo(x + lx * s + sw * o, y); g.stroke();
    }
    g.beginPath(); g.ellipse(x, y - s * 1.05, s * 0.7, s * 0.3, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(x - s * 0.05, y - s * 1.3, s * 0.35, s * 0.28, 0, Math.PI, TAU); g.fill();
    g.lineWidth = s * 0.16;
    g.beginPath(); g.moveTo(x + s * 0.6, y - s * 1.05); g.quadraticCurveTo(x + s * 0.95, y - s * 1.2, x + s * 0.95, y - s * 1.65); g.stroke();
    g.beginPath(); g.ellipse(x + s * 1.08, y - s * 1.68, s * 0.18, s * 0.09, 0.2, 0, TAU); g.fill();
    if (rider) {
      g.beginPath(); g.ellipse(x - s * 0.05, y - s * 1.62, s * 0.1, s * 0.22, 0, 0, TAU); g.fill();
      g.beginPath(); g.arc(x - s * 0.05, y - s * 1.9, s * 0.09, 0, TAU); g.fill();
    }
  }

  const Sahara = makeScene("sahara", {
    build() {
      const { w, h } = this;
      const [sky, g] = mkCanvas(w, h);
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "#070418"); gr.addColorStop(0.45, "#1b1240"); gr.addColorStop(0.62, "#3d2453"); gr.addColorStop(0.72, "#8c4a3e"); gr.addColorStop(0.78, "#c27a4a");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const mx = w * 0.58, my = h * 0.16, mr = Math.min(w, h) * 0.055;   // the moon
      const mg = g.createRadialGradient(mx, my, mr, mx, my, mr * 7);
      mg.addColorStop(0, "rgba(255, 240, 210, .3)"); mg.addColorStop(1, "rgba(255, 240, 210, 0)");
      g.fillStyle = mg; g.fillRect(0, 0, w, h);
      g.fillStyle = "#fff3d6"; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
      g.fillStyle = "rgba(200, 180, 150, .35)";
      for (const [cx, cy, cr] of [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.16], [-0.05, 0.35, 0.12], [0.3, -0.35, 0.1]]) { g.beginPath(); g.arc(mx + cx * mr, my + cy * mr, cr * mr, 0, TAU); g.fill(); }
      this.sky = sky;
      // Stars wheel slowly around the pole star
      this.pole = { x: w * 0.18, y: h * 0.08 };
      const maxR = Math.hypot(w, h);
      this.stars = Array.from({ length: clamp(Math.round((w * h) / 800), 700, 1800) }, () => ({ r: Math.sqrt(Math.random()) * maxR, a: rnd(0, TAU), s: Math.random() < 0.08 ? 2 : 1.2, b: rnd(0.35, 1), tw: rnd(0, TAU) }));
      this.TW = Math.ceil(w * 1.6);
      const TW = this.TW;
      const dune = (ridge, top, bottom, rim) => {
        let minY = h;
        for (let x = 0; x <= TW; x += 16) minY = Math.min(minY, ridge(x));
        return tileLayer(TW, h, [c => {
          const lg = c.createLinearGradient(0, minY, 0, h);
          lg.addColorStop(0, top); lg.addColorStop(1, bottom);
          c.fillStyle = lg;
          c.beginPath(); c.moveTo(0, h); for (let x = 0; x <= TW; x += 6) c.lineTo(x, ridge(x)); c.lineTo(TW, h); c.fill();
          c.strokeStyle = rim; c.lineWidth = 1.5;
          c.beginPath(); for (let x = 0; x <= TW; x += 6) x ? c.lineTo(x, ridge(x)) : c.moveTo(x, ridge(x)); c.stroke();
        }]);
      };
      this.r1 = periodicRidge(TW, h * 0.74, [[2, h * 0.03], [5, h * 0.015]]);
      this.r2 = periodicRidge(TW, h * 0.8, [[3, h * 0.035], [7, h * 0.012]]);
      this.r3 = periodicRidge(TW, h * 0.88, [[2, h * 0.04], [4, h * 0.02]]);
      this.d1 = dune(this.r1, "#6e4560", "#3d2440", "rgba(255, 220, 190, .25)");
      this.d2 = dune(this.r2, "#5a3449", "#2a1730", "rgba(255, 210, 170, .3)");
      this.d3 = dune(this.r3, "#3a1f30", "#140912", "rgba(255, 200, 160, .22)");
      this.caravan = [0, 1, 2, 3, 4].map(i => ({ off: i * 34, rider: i === 0 || i === 2 }));
      this.fireX = TW * 0.16;
      this.embers = [];
      this.shoot = {};
    },
    lite() { this.stars = this.stars.filter((_, i) => i % 2 === 0); },
    tap(x, y) {
      if (this.caravanHits?.some(c => Math.hypot(c.x - x, c.y - y) < 24)) { CamelRun.start(); return; }   // 🐫 shh…
      this.shoot.next = 0; this.shoot.s = null; Sound.sfx("sparkle");
    },
    draw(t, dt) {
      const { ctx, w, h, TW } = this;
      ctx.drawImage(this.sky, 0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      const rot = t * 0.012, { x: px, y: py } = this.pole;
      for (const s of this.stars) {
        const a = s.a + rot, x = px + Math.cos(a) * s.r, y = py + Math.sin(a) * s.r;
        if (x < 0 || x > w || y < 0 || y > h * 0.8) continue;
        ctx.globalAlpha = s.b * (0.75 + 0.25 * Math.sin(t * 2 + s.tw));
        ctx.fillStyle = "#fff8ec"; ctx.fillRect(x, y, s.s, s.s);
      }
      ctx.globalAlpha = 1;
      shootingStar(this.shoot, ctx, t, dt, w, h * 0.6);
      ctx.globalCompositeOperation = "source-over";
      const x1 = drawWrapped(ctx, this.d1, 0.03, w);
      // The caravan walking along the far dune
      ctx.fillStyle = "#3b2238"; ctx.strokeStyle = "#3b2238";
      const head = mod(t * 11, TW);
      this.caravanHits = [];
      for (const c of this.caravan) {
        const lx = mod(head - c.off, TW), sx = wrapX(lx + x1, TW, w);
        if (sx < -40 || sx > w + 40) continue;
        this.caravanHits.push({ x: sx, y: this.r1(lx) - 8 });
        camel(ctx, sx, this.r1(lx) + 1, 11, t * 3.2 + c.off, c.rider);
      }
      drawWrapped(ctx, this.d2, 0.07, w);
      const x3 = drawWrapped(ctx, this.d3, 0.13, w);
      // Campfire on the near dune, with rising embers
      const fx = wrapX(this.fireX + x3, TW, w), fy = this.r3(this.fireX) + 2;
      const flick = 0.82 + 0.12 * Math.sin(t * 13) + 0.08 * Math.sin(t * 7.3);
      if (fx > -200 && fx < w + 200) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.85;
        const G = 130 * flick;
        ctx.drawImage(Jungle.sprite(28, 55), fx - G, fy - G * 0.8, G * 2, G * 2);
        ctx.globalAlpha = 1;
        for (const [c, k, sp] of [["#ff4d1a", 1, 9], ["#ff8a2b", 0.75, 11], ["#ffd27a", 0.45, 14]]) {
          const fh = 26 * k * flick, fw = 9 * k;
          ctx.fillStyle = c;
          ctx.beginPath(); ctx.moveTo(fx - fw, fy);
          ctx.quadraticCurveTo(fx - fw * 0.8, fy - fh * 0.6, fx + Math.sin(t * sp) * 3, fy - fh);
          ctx.quadraticCurveTo(fx + fw * 0.8, fy - fh * 0.6, fx + fw, fy); ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#1a0a08";
        ctx.save(); ctx.translate(fx, fy); ctx.rotate(0.25); ctx.fillRect(-14, -2, 28, 4); ctx.rotate(-0.5); ctx.fillRect(-14, -2, 28, 4); ctx.restore();
      }
      if (this.embers.length < (this.lite ? 30 : 70)) this.embers.push({ ox: rnd(-6, 6), oy: -10, vx: rnd(-12, 12), vy: rnd(-70, -35), life: rnd(1.2, 2.6), max: 2.6, ph: rnd(0, TAU) });
      ctx.globalCompositeOperation = "lighter";
      this.embers = this.embers.filter(e => {
        e.life -= dt; e.ox += (e.vx + Math.sin(t * 3 + e.ph) * 10) * dt; e.oy += e.vy * dt;
        if (e.life <= 0) return false;
        ctx.globalAlpha = Math.min(1, e.life / 1.2);
        ctx.fillStyle = e.life > 1.5 ? "#ffd27a" : "#ff7a2b";
        ctx.fillRect(fx + e.ox, fy + e.oy, 1.8, 1.8);
        return true;
      });
      ctx.globalAlpha = 1;
    },
  });

  /* ===== WARP DRIVE: a starship cockpit, forever at warp speed ===== */
  function makePlanet(size, hueA, hueB, ringed) {
    const S = size * (ringed ? 2.4 : 1.2), [c, g] = mkCanvas(S, S), m = S / 2, r = size / 2;
    const body = g.createRadialGradient(m - r * 0.35, m - r * 0.35, r * 0.1, m, m, r);
    body.addColorStop(0, `hsl(${hueA}, 70%, 72%)`); body.addColorStop(0.55, `hsl(${hueB}, 60%, 42%)`); body.addColorStop(1, `hsl(${hueB}, 60%, 10%)`);
    if (ringed) {                                     // back half of the rings
      g.save(); g.translate(m, m); g.rotate(-0.35); g.scale(1, 0.28);
      g.strokeStyle = `hsla(${hueA}, 60%, 75%, .55)`; g.lineWidth = r * 0.22;
      g.beginPath(); g.arc(0, 0, r * 1.75, Math.PI, TAU); g.stroke(); g.restore();
    }
    g.fillStyle = body; g.beginPath(); g.arc(m, m, r, 0, TAU); g.fill();
    g.globalCompositeOperation = "source-atop";               // cloud bands
    for (let i = 0; i < 7; i++) { g.fillStyle = `hsla(${hueB + rnd(-20, 20)}, 50%, ${rnd(30, 70)}%, .18)`; g.fillRect(m - r, m - r + rnd(0, size), size, rnd(r * 0.05, r * 0.2)); }
    g.globalCompositeOperation = "source-over";
    const halo = g.createRadialGradient(m, m, r * 0.95, m, m, r * 1.15);
    halo.addColorStop(0, `hsla(${hueA}, 90%, 75%, .45)`); halo.addColorStop(1, "hsla(0, 0%, 0%, 0)");
    g.fillStyle = halo; g.beginPath(); g.arc(m, m, r * 1.15, 0, TAU); g.fill();
    if (ringed) {                                     // front half of the rings
      g.save(); g.translate(m, m); g.rotate(-0.35); g.scale(1, 0.28);
      g.strokeStyle = `hsla(${hueA}, 60%, 80%, .75)`; g.lineWidth = r * 0.22;
      g.beginPath(); g.arc(0, 0, r * 1.75, 0, Math.PI); g.stroke(); g.restore();
    }
    return c;
  }
  // The cockpit window frame and dashboard, drawn once (it sits over the wall's edges)
  function makeCockpit(w, h) {
    const [c, g] = mkCanvas(w, h), small = w < 700;
    const metal = (x0, y0, x1, y1) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, "#0c1220"); gr.addColorStop(0.5, "#04070e"); gr.addColorStop(1, "#090e1a"); return gr; };
    const edge = "rgba(110, 190, 255, .45)";
    const sw = small ? w * 0.05 : w * 0.035, topH = small ? h * 0.035 : h * 0.045, dash = small ? h * 0.07 : h * 0.1;
    // side pillars, leaning in toward the top
    for (const side of [0, 1]) {
      const x = side ? w : 0, dir = side ? -1 : 1;
      g.fillStyle = metal(x, 0, x + dir * sw * 2, 0);
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + dir * sw * 2.2, 0); g.lineTo(x + dir * sw, h); g.lineTo(x, h); g.fill();
      g.strokeStyle = edge; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x + dir * sw * 2.2, 0); g.lineTo(x + dir * sw, h); g.stroke();
    }
    // top beam
    g.fillStyle = metal(0, 0, 0, topH * 2);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, topH); g.quadraticCurveTo(w / 2, topH * 2.4, 0, topH); g.fill();
    g.strokeStyle = edge; g.beginPath(); g.moveTo(0, topH); g.quadraticCurveTo(w / 2, topH * 2.4, w, topH); g.stroke();
    // dashboard
    g.fillStyle = metal(0, h - dash, 0, h);
    g.beginPath(); g.moveTo(0, h); g.lineTo(0, h - dash * 0.55); g.quadraticCurveTo(w / 2, h - dash * 1.25, w, h - dash * 0.55); g.lineTo(w, h); g.fill();
    g.strokeStyle = edge; g.beginPath(); g.moveTo(0, h - dash * 0.55); g.quadraticCurveTo(w / 2, h - dash * 1.25, w, h - dash * 0.55); g.stroke();
    // dashboard lights
    const lights = ["#3cf", "#3cf", "#7f7", "#fc4", "#f55", "#3cf"];
    for (let i = 0; i < (small ? 10 : 22); i++) {
      const fx = (i + 0.5) / (small ? 10 : 22), x = fx * w;
      const yTop = h - dash * 0.55 - Math.sin(fx * Math.PI) * dash * 0.35;
      g.fillStyle = lights[i % lights.length]; g.shadowColor = g.fillStyle; g.shadowBlur = 8;
      g.fillRect(x - 5, yTop + dash * 0.25, 10, 3);
    }
    g.shadowBlur = 0;
    return c;
  }

  // ----- Destinations you arrive at after a wormhole (original alien cities) -----
  const DESTINATIONS = [
    { name: "ASTER HARBOR", skyTop: "#13306f", skyMid: "#4271c4", horizon: "#d6e6fb", sea: ["#3a78c8", "#0f3470"], land: ["#9fb4d6", "#2b3a5c"],
      sun: "255, 248, 225", planet: [222, 250], ring: "210, 225, 255", tower: [212, 22], haze: "214, 230, 251" },
    { name: "KEPLER DUSK", skyTop: "#1d1038", skyMid: "#74407a", horizon: "#f8b47c", sea: ["#8a5a8c", "#2a1640"], land: ["#d29a86", "#3a2440"],
      sun: "255, 205, 150", planet: [28, 12], ring: "255, 210, 170", tower: [285, 16], haze: "248, 180, 124" },
    { name: "NOVA MERIDIAN", skyTop: "#03202b", skyMid: "#0f5866", horizon: "#a6f2da", sea: ["#139089", "#043840"], land: ["#7fbcb0", "#173a44"],
      sun: "215, 255, 232", planet: [312, 332], ring: "255, 200, 240", tower: [186, 20], haze: "166, 242, 218" },
  ];
  // The view of a destination: sky layer (planet, moons, sun) and ground layer (land, sea, city)
  function makeDestination(w, h, D) {
    const hz = h * 0.46, vp = { x: w * 0.42, y: hz }, F = w * 0.55, G = (h - hz) * 1.12;
    const sunX = w * 0.8, sunY = h * 0.13;
    // ---- sky ----
    const [sky, g] = mkCanvas(w, h);
    let gr = g.createLinearGradient(0, 0, 0, hz);
    gr.addColorStop(0, D.skyTop); gr.addColorStop(0.62, D.skyMid); gr.addColorStop(1, D.horizon);
    g.fillStyle = gr; g.fillRect(0, 0, w, hz + 4);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${rnd(0.2, 0.7)})`; g.fillRect(rnd(0, w), rnd(0, hz * 0.4), 1.2, 1.2); }
    const sg = g.createRadialGradient(sunX, sunY, 0, sunX, sunY, h * 0.5);            // the sun's glow over the sky
    sg.addColorStop(0, `rgba(${D.sun}, .85)`); sg.addColorStop(0.08, `rgba(${D.sun}, .45)`); sg.addColorStop(1, `rgba(${D.sun}, 0)`);
    g.fillStyle = sg; g.fillRect(0, 0, w, hz + 4);
    // the giant ringed planet
    const PR = Math.min(w, h) * 0.27, px = w * 0.3, py = h * 0.17;
    const ring = (from, to) => {
      g.save(); g.translate(px, py); g.rotate(-0.3); g.scale(1, 0.22);
      for (let k = 0; k < 6; k++) { g.strokeStyle = `rgba(${D.ring}, ${0.18 + (k % 2) * 0.16})`; g.lineWidth = PR * 0.06; g.beginPath(); g.arc(0, 0, PR * (1.35 + k * 0.08), from, to); g.stroke(); }
      g.restore();
    };
    ring(Math.PI, TAU);
    g.save(); g.beginPath(); g.arc(px, py, PR, 0, TAU); g.clip();
    gr = g.createLinearGradient(px, py - PR, px, py + PR);
    gr.addColorStop(0, `hsl(${D.planet[0]}, 45%, 70%)`); gr.addColorStop(1, `hsl(${D.planet[1]}, 55%, 38%)`);
    g.fillStyle = gr; g.fillRect(px - PR, py - PR, PR * 2, PR * 2);
    for (let i = 0; i < 22; i++) {                                                       // cloud bands
      const y = py - PR + (i / 22) * PR * 2, amp = rnd(2, 8), hue = D.planet[i % 2];
      g.fillStyle = `hsla(${hue}, 50%, ${rnd(35, 78)}%, .28)`;
      g.beginPath(); g.moveTo(px - PR, y);
      for (let x = -PR; x <= PR; x += 12) g.lineTo(px + x, y + Math.sin(x * 0.03 + i) * amp);
      g.lineTo(px + PR, y + PR * 0.05); g.lineTo(px - PR, y + PR * 0.05); g.fill();
    }
    g.fillStyle = `hsla(${D.planet[1]}, 60%, 30%, .45)`;                                // a great storm
    g.beginPath(); g.ellipse(px + PR * 0.25, py + PR * 0.35, PR * 0.18, PR * 0.08, -0.1, 0, TAU); g.fill();
    gr = g.createLinearGradient(px + PR * 0.7, py - PR * 0.3, px - PR, py + PR * 0.5);  // night side, away from the sun
    gr.addColorStop(0, "rgba(0,0,15,0)"); gr.addColorStop(0.55, "rgba(0,0,20,.25)"); gr.addColorStop(1, "rgba(0,0,25,.8)");
    g.fillStyle = gr; g.fillRect(px - PR, py - PR, PR * 2, PR * 2);
    g.restore();
    g.strokeStyle = `rgba(${D.ring}, .35)`; g.lineWidth = PR * 0.035;                    // atmosphere rim
    g.beginPath(); g.arc(px, py, PR * 1.01, -1.3, 1.2); g.stroke();
    ring(0, Math.PI);
    const moon = (x, y, r, hue) => {
      const mg = g.createRadialGradient(x + r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      mg.addColorStop(0, `hsl(${hue}, 25%, 82%)`); mg.addColorStop(1, `hsl(${hue}, 30%, 22%)`);
      g.fillStyle = mg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    };
    moon(w * 0.09, h * 0.27, PR * 0.15, 40);
    moon(w * 0.6, h * 0.06, PR * 0.06, 210);
    gr = g.createLinearGradient(0, hz - h * 0.12, 0, hz + 2);                            // haze on the horizon
    gr.addColorStop(0, `rgba(${D.haze}, 0)`); gr.addColorStop(1, `rgba(${D.haze}, .9)`);
    g.fillStyle = gr; g.fillRect(0, hz - h * 0.12, w, h * 0.12 + 4);
    for (let i = 0; i < 9; i++) {                                                        // long thin clouds
      g.fillStyle = `rgba(255,255,255,${rnd(0.08, 0.2)})`;
      g.beginPath(); g.ellipse(rnd(0, w), hz - rnd(10, h * 0.16), rnd(w * 0.1, w * 0.3), rnd(2, 6), 0, 0, TAU); g.fill();
    }

    // ---- ground: land, the bay, the city (scales together as the ship drifts forward) ----
    const [ground, c] = mkCanvas(w, h);
    const shoreX = y => vp.x + 0.25 * F * (y - hz) / G;                                   // the waterfront runs to the horizon
    gr = c.createLinearGradient(0, hz, 0, h);
    gr.addColorStop(0, D.land[0]); gr.addColorStop(1, D.land[1]);
    c.fillStyle = gr; c.fillRect(0, hz, w, h - hz);
    c.beginPath(); c.moveTo(vp.x, hz); c.lineTo(w, hz); c.lineTo(w, h); c.lineTo(shoreX(h), h); c.closePath();
    gr = c.createLinearGradient(0, hz, 0, h);
    gr.addColorStop(0, D.sea[0]); gr.addColorStop(1, D.sea[1]);
    c.fillStyle = gr; c.fill();
    c.save(); c.clip();
    gr = c.createLinearGradient(0, hz, 0, h);                                             // the sun's path on the water
    gr.addColorStop(0, `rgba(${D.sun}, .75)`); gr.addColorStop(1, `rgba(${D.sun}, 0)`);
    c.fillStyle = gr;
    c.beginPath(); c.moveTo(sunX - 6, hz); c.lineTo(sunX + 6, hz); c.lineTo(sunX + w * 0.16, h); c.lineTo(sunX - w * 0.16, h); c.fill();
    c.restore();
    // far shore across the bay
    for (let i = 0; i < 70; i++) {
      const x = rnd(vp.x + w * 0.08, w), hh = rnd(2, 14) * (1 - (x - vp.x) / w * 0.3);
      c.fillStyle = `rgba(${D.haze}, ${rnd(0.45, 0.8)})`;
      c.fillRect(x, hz - hh, rnd(2, 7), hh + 1);
    }
    // avenue and waterfront promenade (lit)
    const lane = X => { c.beginPath(); c.moveTo(vp.x, hz); c.lineTo(vp.x + X * F / 1.12, hz + G / 1.12); };
    c.strokeStyle = "rgba(20, 24, 40, .55)"; c.lineWidth = 3; lane(-0.42); c.stroke(); lane(-0.3); c.stroke();
    c.strokeStyle = `rgba(${D.sun}, .5)`; c.lineWidth = 1.5; lane(0.22); c.stroke();
    // piers reaching into the bay
    for (let inv = 0.08; inv < 0.85; inv += 0.07) {
      const y = hz + G * inv, x = vp.x + 0.25 * F * inv, len = F * inv * 0.35;
      c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = Math.max(1, inv * 4);
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + len, y + len * 0.04); c.stroke();
      c.fillStyle = `rgba(${D.sun}, .9)`; c.fillRect(x + len - 2, y - 2, 3, 3);
    }
    // a street grid running to the horizon
    c.lineWidth = 1;
    for (const X of [-1.1, -2.2, -3.6, -5.4, -7.8]) {
      c.strokeStyle = `rgba(${D.sun}, .28)`;
      c.beginPath(); c.moveTo(vp.x, hz); c.lineTo(vp.x + X * F / 1.12, hz + G / 1.12); c.stroke();
    }
    for (let dd = 1.3; dd < 18; dd *= 1.28) {
      const y = hz + G / dd;
      c.strokeStyle = `rgba(${D.sun}, ${0.12 + 0.25 / dd})`;
      c.beginPath(); c.moveTo(0, y); c.lineTo(shoreX(y) - 4, y); c.stroke();
    }
    // green parks along the waterfront strip
    for (let i = 0; i < 90; i++) {
      const inv = 1 / (1.2 + Math.pow(Math.random(), 1.2) * 16), y = hz + G * inv, x = vp.x + rnd(-0.22, 0.2) * F * inv;
      c.fillStyle = `hsla(${rnd(95, 150)}, 40%, ${rnd(28, 45)}%, ${0.55 + inv * 0.4})`;
      c.beginPath(); c.ellipse(x, y, Math.max(1.5, F * inv * 0.05), Math.max(1, G * inv * 0.012), 0, 0, TAU); c.fill();
    }
    // the city, far to near: mostly mid-rise blocks, with skyscrapers rising out of them
    const items = [];
    for (let i = 0; i < 520; i++) {
      let x; do x = -rnd(0.55, 11); while (Math.abs(x + 0.36) < 0.12);
      const tall = Math.random() < 0.1;
      items.push({ d: 1.15 + Math.pow(Math.random(), 1.25) * 17, x, hgt: tall ? rnd(2.4, 5.5) : 0.25 + Math.pow(Math.random(), 2) * 1.6, wd: rnd(0.22, 0.6),
        spire: tall && Math.random() < 0.7, round: Math.random() < 0.15, bridge: tall && Math.random() < 0.4, l: rnd(-8, 10) });
    }
    for (let i = 0; i < 160; i++) {                               // denser blocks close to you
      let x; do x = -rnd(0.55, 6); while (Math.abs(x + 0.36) < 0.12);
      items.push({ d: rnd(1.15, 3.2), x, hgt: 0.2 + Math.pow(Math.random(), 2) * 1.2, wd: rnd(0.22, 0.55), spire: false, round: Math.random() < 0.15, bridge: false, l: rnd(-8, 10) });
    }
    for (let i = 0; i < 140; i++) {                               // low waterfront pavilions between the avenue and the bay
      items.push({ d: 1.2 + Math.pow(Math.random(), 1.3) * 16, x: rnd(-0.2, 0.16), hgt: rnd(0.08, 0.35), wd: rnd(0.12, 0.3), spire: false, round: Math.random() < 0.5, bridge: false, l: rnd(4, 16) });
    }
    items.sort((a, b) => b.d - a.d);
    const beacons = [];
    for (const it of items) {
      const inv = 1 / it.d, sx = vp.x + it.x * F * inv, by = hz + G * inv;
      const tw = it.wd * F * inv * 0.38, th = it.hgt * G * inv * 0.22, x0 = sx - tw / 2, y0 = by - th;
      if (x0 > w || sx + tw < 0) continue;
      const fog = Math.min(0.85, (it.d - 1.15) / 15 * 1.1);
      const L = 52 + it.l;
      gr = c.createLinearGradient(x0, 0, x0 + tw, 0);                     // the sunny side is on the right
      gr.addColorStop(0, `hsl(${D.tower[0]}, ${D.tower[1]}%, ${L - 22}%)`); gr.addColorStop(0.65, `hsl(${D.tower[0]}, ${D.tower[1]}%, ${L}%)`); gr.addColorStop(1, `hsl(${D.tower[0]}, ${D.tower[1] + 10}%, ${L + 22}%)`);
      c.fillStyle = gr;
      c.beginPath();
      if (it.round) { c.moveTo(x0, by); c.lineTo(x0, y0 + tw / 2); c.arc(sx, y0 + tw / 2, tw / 2, Math.PI, TAU); c.lineTo(x0 + tw, by); }
      else c.rect(x0, y0, tw, th);
      c.fill();
      if (tw > 9 && th > 26) {                                           // windows catching the light
        const step = Math.max(3, tw / 7);
        c.fillStyle = "rgba(255, 250, 230, .35)";
        for (let wy = y0 + step * 1.5; wy < by - step; wy += step * 1.3) for (let wx = x0 + step * 0.6; wx < x0 + tw - step * 0.6; wx += step) if (Math.random() < 0.5) c.fillRect(wx, wy, step * 0.45, step * 0.5);
      }
      if (it.spire) {
        c.fillStyle = `hsl(${D.tower[0]}, ${D.tower[1]}%, ${L + 8}%)`;
        c.beginPath(); c.moveTo(sx - tw * 0.18, y0 + 1); c.lineTo(sx, y0 - th * 0.45); c.lineTo(sx + tw * 0.18, y0 + 1); c.fill();
        beacons.push({ x: sx, y: y0 - th * 0.45, d: it.d, ph: rnd(0, TAU) });
      }
      if (fog > 0.02) { c.fillStyle = `rgba(${D.haze}, ${fog})`; c.fillRect(x0 - 1, y0 - (it.spire ? th * 0.45 : 0) - 1, tw + 2, th + (it.spire ? th * 0.45 : 0) + 2); }
      if (it.bridge && tw > 4) {                                         // sky bridge to a neighbour
        c.strokeStyle = `rgba(255, 255, 255, ${0.5 - fog * 0.4})`; c.lineWidth = Math.max(1, tw * 0.08);
        c.beginPath(); c.moveTo(x0 + tw, y0 + th * 0.35); c.lineTo(x0 + tw + tw * 1.6, y0 + th * 0.45); c.stroke();
      }
    }
    // a landing pad close by, with two ships parked on it
    const lx = w * 0.17, ly = h * 0.87, lr = Math.min(w, h) * 0.16;
    c.fillStyle = "rgba(30, 36, 56, .9)"; c.beginPath(); c.ellipse(lx, ly, lr, lr * 0.28, 0, 0, TAU); c.fill();
    c.strokeStyle = `rgba(${D.sun}, .8)`; c.lineWidth = 2; c.beginPath(); c.ellipse(lx, ly, lr * 0.82, lr * 0.22, 0, 0, TAU); c.stroke();
    for (const [dx, s] of [[-0.35, 1], [0.32, 0.8]]) {
      const x = lx + dx * lr, y = ly - lr * 0.03, k = lr * 0.22 * s;
      c.fillStyle = "#e9eef8"; c.beginPath(); c.moveTo(x, y - k * 0.5); c.lineTo(x + k * 1.1, y + k * 0.35); c.lineTo(x, y + k * 0.15); c.lineTo(x - k * 1.1, y + k * 0.35); c.fill();
      c.fillStyle = "#6fa8ff"; c.fillRect(x - k * 0.12, y - k * 0.2, k * 0.24, k * 0.18);
    }
    return { sky, ground, hz, vp, F, G, sunX, sunY, beacons, name: D.name, D };
  }

  const WARP_DEF = {
    fringe: true,
    build() {
      Object.assign(this, { setPhase: WARP_DEF.setPhase, newCraft: WARP_DEF.newCraft, drawCity: WARP_DEF.drawCity, drawEdge: WARP_DEF.drawEdge });
      const { w, h } = this;
      const [bg, g] = mkCanvas(w, h);
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2);
      gr.addColorStop(0, "#0a1030"); gr.addColorStop(0.5, "#050820"); gr.addColorStop(1, "#010108");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      this.bg = bg;
      const D = Math.ceil(Math.hypot(w, h) * 1.1), [neb, n] = mkCanvas(D, D);
      n.globalCompositeOperation = "lighter";
      for (let i = 0; i < 70; i++) {
        const a = rnd(0, TAU), rr = Math.pow(Math.random(), 0.7) * D * 0.42, x = D / 2 + Math.cos(a) * rr, y = D / 2 + Math.sin(a) * rr * 0.6;
        const R = D * rnd(0.04, 0.12), hue = [265, 220, 300, 190][i % 4];
        const ng = n.createRadialGradient(x, y, 0, x, y, R);
        ng.addColorStop(0, `hsla(${hue}, 80%, 55%, ${rnd(0.03, 0.08)})`); ng.addColorStop(1, "hsla(0,0%,0%,0)");
        n.fillStyle = ng; n.fillRect(x - R, y - R, R * 2, R * 2);
      }
      this.neb = neb;
      this.stars = Array.from({ length: clamp(Math.round((w * h) / 1400), 450, 1300) }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random(), px: null, py: null }));
      this.planets = [makePlanet(220, 30, 10, true), makePlanet(160, 190, 220, false), makePlanet(200, 300, 260, false), makePlanet(180, 120, 160, true)];
      const now = (performance.now() - this.t0) / 1000;
      this.planet = null; this.nextPlanet = now + 5;
      this.phase = { name: "cruise", t: now, until: now + 10 };   // cruise → worm → city → depart → cruise…
      this.speed = 0.35; this.lastZ = cam.z;
      this.destIndex = Math.floor(Math.random() * DESTINATIONS.length);
      this.dest = null; this.crafts = []; this.cars = []; this.glints = [];
      const box = this.fringeEl;
      const pit = makeCockpit(w, h);
      pit.className = "warp-cockpit";
      box.appendChild(pit);
      const hud = document.createElement("div");
      hud.className = "warp-hud";
      hud.innerHTML = `<span class="warp-hud__mode">WARP DRIVE</span><span class="warp-hud__speed">WARP 7.2</span>`;
      box.appendChild(hud);
      this.hudBox = hud;
      this.hudMode = hud.querySelector(".warp-hud__mode");
      this.hud = hud.querySelector(".warp-hud__speed");
      const ctl = document.createElement("div");              // the cockpit console (Warp Drive only)
      ctl.className = "warp-controls";
      ctl.setAttribute("role", "toolbar");
      ctl.setAttribute("aria-label", "Cockpit controls");
      ctl.innerHTML = [["universe", "🌌", "Universe"], ["andromeda", "🌀", "Andromeda"], ["aurora", "🌠", "Aurora"], ["stars", "✦", "Constellations"], ["channels", "🪐", "Channels"], ["void", "🕳", "The Void"]]
        .map(([id, icon, label]) => `<button type="button" class="cockpit-btn" data-cockpit="${id}"><span class="cockpit-btn__icon" aria-hidden="true">${icon}</span><span class="cockpit-btn__label">${label}</span></button>`).join("");
      box.appendChild(ctl);
    },
    lite() { this.stars = this.stars.filter((_, i) => i % 2 === 0); },
    enter(t) { if (this.phase.name === "cruise" && (this.phase.until < t || this.phase.until - t > 40)) this.phase.until = t + 10; if (this.nextPlanet < t) this.nextPlanet = t + 5; },
    tap(x, y, t) {
      if (this.phase.name === "city") {                                   // a ship takes off from where you tapped
        this.crafts.push({ x, y, tx: this.dest.vp.x + rnd(-80, 80), ty: this.dest.hz - rnd(20, 90), t, dur: rnd(3, 4.5), s: 1.4, launched: true });
        Sound.sfx("sparkle");
      } else { this.boost = { t, x, y }; Sound.sfx("warpTap"); }
    },
    setPhase(name, t, len) {
      this.phase = { name, t, until: t + len };
      if (name === "worm") {
        this.dest = makeDestination(this.w, this.h, DESTINATIONS[this.destIndex++ % DESTINATIONS.length]);   // built while you're in the tunnel
        Sound.sfx("warpBurst");
      }
      if (name === "city") {
        const { w, h } = this, d = this.dest;
        this.cars = Array.from({ length: 50 }, () => ({ lane: Math.random() < 0.5 ? -0.42 : -0.3, u: Math.random(), sp: rnd(0.05, 0.12) * (Math.random() < 0.5 ? 1 : -1), warm: Math.random() < 0.5 }));
        this.glints = Array.from({ length: 140 }, () => { const y = d.hz + Math.pow(Math.random(), 1.5) * (h - d.hz); const spread = 6 + (y - d.hz) / (h - d.hz) * w * 0.16; return { x: d.sunX + rnd(-spread, spread), y, ph: rnd(0, TAU), sp: rnd(2, 6) }; });
        this.crafts = Array.from({ length: 4 }, () => this.newCraft(t));
        Sound.sfx("warpArrive");
      }
      if (name === "depart") Sound.sfx("warpBurst");
    },
    newCraft(t) {
      const dir = Math.random() < 0.5 ? 1 : -1, y = rnd(0.12, 0.4) * this.h;
      return { x: dir > 0 ? -60 : this.w + 60, y, tx: dir > 0 ? this.w + 60 : -60, ty: y + rnd(-40, 40), t: t - rnd(0, 6), dur: rnd(7, 12), s: rnd(0.5, 1) };
    },
    draw(t, dt) {
      if (this.edge && this.drawEdge(t, dt)) return;
      const { ctx, w, h } = this, cx = w / 2, cy = h / 2;
      const P = this.phase, k = clamp((t - P.t) / (P.until - P.t), 0, 1);
      // ---- what happens next ----
      if (t >= P.until) {
        if (P.name === "cruise") this.setPhase("worm", t, 6);
        else if (P.name === "worm") this.setPhase("city", t, 26);
        else if (P.name === "city") this.setPhase("depart", t, 3);
        else this.setPhase("cruise", t, rnd(14, 22));
      }
      const name = this.phase.name, pk = clamp((t - this.phase.t) / (this.phase.until - this.phase.t), 0, 1);

      // ---- throttle ----
      const dz = Math.abs(cam.z - this.lastZ); this.lastZ = cam.z;
      const zoomPush = Math.min(4, dz / Math.max(dt, 0.008) * 1.6);
      const boostAge = this.boost ? t - this.boost.t : 99;
      const boost = boostAge < 2.2 ? Math.sin(Math.min(1, boostAge / 2.2) * Math.PI) * 5 : 0;
      let target = 0.35 + zoomPush + boost;
      let burst = 0;
      if (name === "worm") {
        burst = pk < 0.2 ? Math.sin((pk / 0.2) * Math.PI) : 0;          // the acceleration burst at the mouth
        target = pk < 0.2 ? 0.35 + burst * 14 : pk < 0.85 ? 5 : 1;
      }
      if (name === "city") target = 0.05;
      if (name === "depart") target = 0.2 + ease.inCubic(pk) * 6;
      this.speed += (target - this.speed) * Math.min(1, dt * (burst > 0 ? 8 : 3));
      const sp = this.speed;

      // ---- cockpit display ----
      if (t - (this.hudT || 0) > 0.2 && this.hud) {
        this.hudT = t;
        let mode = "WARP DRIVE", read = sp > 2.4 ? `BEYOND LIGHT · ${Math.round(sp * sp * 900).toLocaleString("en")} c` : `WARP ${(4 + sp * 9).toFixed(1)}`;
        if (name === "worm") mode = pk < 0.22 ? "ACCELERATION BURST ▲▲▲" : pk < 0.85 ? "WORMHOLE" : "EXITING WORMHOLE";
        if (name === "city") { mode = "ARRIVED"; read = this.dest?.name || ""; }
        if (name === "depart") mode = "ENGAGING WARP";
        this.hudMode.textContent = mode; this.hud.textContent = read;
        this.hudBox.classList.toggle("alert", name === "worm" && pk < 0.22);
      }

      // ---- space ----
      const cityA = name === "city" ? 1 : name === "depart" ? 1 - ease.inCubic(pk) : name === "worm" && pk > 0.88 ? 1 : 0;
      const starA = name === "city" ? 0 : name === "depart" ? pk : 1;
      if (cityA < 0.999) {                                  // space is hidden while you're at a destination
        ctx.drawImage(this.bg, 0, 0, w, h);
        const D = this.neb.width;
        ctx.save(); ctx.translate(cx + Math.tanh(-cam.x / 5000) * 40, cy + Math.tanh(-cam.y / 5000) * 40); ctx.rotate(t * 0.01);
        ctx.drawImage(this.neb, -D / 2, -D / 2); ctx.restore();
      }

      if (name === "cruise" && !this.planet && t > this.nextPlanet) {
        const a = rnd(0, TAU);
        this.planet = { img: this.planets[Math.floor(Math.random() * this.planets.length)], x: Math.cos(a) * rnd(0.25, 0.6), y: Math.sin(a) * rnd(0.2, 0.5), z: 1, spin: rnd(-0.1, 0.1) };
      }
      if (this.planet) {
        const Pl = this.planet;
        Pl.z -= dt * (0.05 + sp * 0.045);
        if (Pl.z <= 0.03 || name !== "cruise") { this.planet = null; this.nextPlanet = t + rnd(14, 26); }
        else {
          const kk = 1 / Pl.z, size = Pl.img.width * 0.18 * kk;
          ctx.globalAlpha = smooth(1, 0.8, Pl.z);
          ctx.save(); ctx.translate(cx + Pl.x * w * 0.5 * kk - cam.x * 0.02 * kk, cy + Pl.y * h * 0.5 * kk - cam.y * 0.02 * kk); ctx.rotate(Pl.spin * t);
          ctx.drawImage(Pl.img, -size / 2, -size / 2, size, size); ctx.restore();
          ctx.globalAlpha = 1;
        }
      }

      // ---- the destination city ----
      if (cityA > 0.01 && this.dest) this.drawCity(t, dt, cityA, name === "depart" ? pk : 0, name === "city" ? pk : 0);

      // ---- stars streaming past ----
      if (starA > 0.01) {
        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        const span = Math.max(w, h) * 0.9, panX = cam.x * 0.12, panY = cam.y * 0.12;
        for (const s of this.stars) {
          s.z -= dt * sp * 0.5;
          if (s.z <= 0.02) { s.z += 1; s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; s.px = null; continue; }
          const wx = mod(s.x * span - panX * (1 - s.z * 0.7), span * 2) - span, wy = mod(s.y * span - panY * (1 - s.z * 0.7), span * 2) - span;
          const x = cx + (wx / s.z) * 0.5, y = cy + (wy / s.z) * 0.5;
          if (s.px !== null && Math.hypot(x - s.px, y - s.py) < 600) {
            const near = 1 - s.z, edgeK = Math.min(1, Math.hypot(x - cx, y - cy) / Math.hypot(cx, cy));
            ctx.strokeStyle = `hsla(${215 - edgeK * 25 * Math.min(1, sp / 2)}, 90%, ${72 + near * 25}%, ${Math.min(1, near * 1.5) * starA})`;
            ctx.lineWidth = 0.5 + near * (2.2 + burst * 2);
            ctx.beginPath(); ctx.moveTo(s.px, s.py); ctx.lineTo(x, y); ctx.stroke();
          }
          s.px = x; s.py = y;
        }
        ctx.globalCompositeOperation = "source-over";
      }

      // ---- the wormhole: burst, tunnel, exit ----
      if (name === "worm") {
        ctx.globalCompositeOperation = "lighter";
        const maxR = Math.hypot(cx, cy);
        if (pk < 0.3) {                                                       // acceleration burst: a shockwave and a flash
          const q = pk / 0.3;
          ctx.strokeStyle = `rgba(190, 235, 255, ${1 - q})`; ctx.lineWidth = 26 * (1 - q) + 2;
          ctx.beginPath(); ctx.arc(cx, cy, q * maxR * 1.2, 0, TAU); ctx.stroke();
          glow(ctx, cx, cy, 80 + q * 500, "hsla(200, 100%, 88%, ALPHA)", 0.9 * (1 - q));
        }
        const env = seg(pk, 0.12, 0.3) * (1 - seg(pk, 0.8, 0.92)), spin = t * (6 + burst * 10);
        if (env > 0.01) for (const [col, off] of [["255, 70, 110", -6], ["70, 255, 170", 0], ["90, 150, 255", 6]]) {
          for (let i = 0; i < 18; i++) {
            const z = mod(i / 18 + t * 2.4, 1), R = 8 + Math.pow(z, 2.4) * maxR * 1.3;
            ctx.strokeStyle = `rgba(${col}, ${env * z * (1 - z) * 2.2})`;
            ctx.lineWidth = 1 + z * 4;
            ctx.beginPath();
            ctx.ellipse(cx + off * z + Math.cos(spin + z * 5) * 18 * (1 - z), cy + Math.sin(spin + z * 5) * 18 * (1 - z), R, R * 0.92, 0, 0, TAU);
            ctx.stroke();
          }
        }
        ctx.globalCompositeOperation = "source-over";
        const f = seg(pk, 0.82, 0.9) * (1 - seg(pk, 0.9, 1));                // bursting out into daylight
        if (f > 0) { ctx.fillStyle = `rgba(245, 250, 255, ${f})`; ctx.fillRect(0, 0, w, h); }
        // shake the cockpit during the burst (unless another effect is playing)
        if (!fx) canvas.style.transform = burst > 0.05 ? `translate(${rnd(-7, 7) * burst}px, ${rnd(-7, 7) * burst}px)` : "";
      } else if (!fx && canvas.style.transform) canvas.style.transform = "";

      if (boostAge < 1.2 && name !== "city") {
        ctx.globalCompositeOperation = "lighter";
        glow(ctx, this.boost.x, this.boost.y, 40 + (boostAge / 1.2) * 200, "hsla(200, 100%, 85%, ALPHA)", 0.7 * (1 - boostAge / 1.2));
        ctx.globalCompositeOperation = "source-over";
      }
      if (name !== "city") {
        ctx.globalCompositeOperation = "lighter";
        glow(ctx, cx, cy, 60 + sp * 30, "hsla(210, 100%, 85%, ALPHA)", Math.min(0.6, 0.15 + sp * 0.08) * starA);
        ctx.globalCompositeOperation = "source-over";
      }
    },
    // The edge of the universe (Warp Drive's secret): transwarp, then nothing at all, then home
    drawEdge(t, dt) {
      const { ctx, w, h } = this, cx = w / 2, cy = h / 2, age = t - this.edge.t;
      if (age > 14) { this.edge = null; this.hudBox?.classList.remove("alert"); return false; }
      const ramp = Math.min(1, age / 3), back = seg(age, 11, 14), voidA = seg(age, 3.2, 4.2) * (1 - back);
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
      const sp = age < 3.4 ? 0.4 + ramp * ramp * 30 : 0.3 + back * 2;
      const starA = age < 3.4 ? 1 : back;
      if (starA > 0.01) {
        ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
        const span = Math.max(w, h) * 0.9;
        for (const s of this.stars) {
          s.z -= dt * sp * 0.5;
          if (s.z <= 0.02) { s.z += 1; s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; s.px = null; continue; }
          const x = cx + (s.x * span / s.z) * 0.5, y = cy + (s.y * span / s.z) * 0.5;
          if (s.px !== null && Math.hypot(x - s.px, y - s.py) < 900) { ctx.strokeStyle = `hsla(${200 + ramp * 80}, 100%, 85%, ${Math.min(1, (1 - s.z) * 1.5) * starA})`; ctx.lineWidth = 0.6 + (1 - s.z) * 2.5; ctx.beginPath(); ctx.moveTo(s.px, s.py); ctx.lineTo(x, y); ctx.stroke(); }
          s.px = x; s.py = y;
        }
        ctx.globalCompositeOperation = "source-over";
      }
      const flash = seg(age, 2.9, 3.3) * (1 - seg(age, 3.3, 4));
      if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, w, h); }
      if (voidA > 0.01) {                                         // nothing here but a sign
        const L = (s0, s1) => seg(age, s0, s1) * voidA;
        ctx.textAlign = "center";
        ctx.fillStyle = `rgba(255, 255, 255, ${L(4.2, 5.2)})`; ctx.font = `700 ${Math.round(Math.min(w, h) * 0.045)}px ui-monospace, Menlo, Consolas, monospace`;
        ctx.fillText("THE EDGE OF THE UNIVERSE", cx, cy - 20);
        ctx.fillStyle = `rgba(190, 200, 220, ${L(5.4, 6.4)})`; ctx.font = "500 15px ui-monospace, Menlo, Consolas, monospace";
        ctx.fillText("Population: you.", cx, cy + 14);
        ctx.fillStyle = `rgba(190, 200, 220, ${L(6.8, 7.8)})`; ctx.fillText("Nothing beyond this point. Please turn around ↩", cx, cy + 40);
        if (Math.sin(t * 5) > 0) { ctx.fillStyle = `rgba(255, 60, 60, ${voidA})`; ctx.beginPath(); ctx.arc(cx, cy - 70, 4, 0, TAU); ctx.fill(); }
        ctx.textAlign = "left";
      }
      if (this.hud) {
        this.hudMode.textContent = age < 3.4 ? "TRANSWARP" : age < 11 ? "" : "RETURNING";
        this.hud.textContent = age < 3.4 ? `WARP ${(9 + ramp * 0.99).toFixed(2)}` : age < 11 ? "∞" : "WARP 7.2";
        this.hudBox.classList.toggle("alert", age < 3.4);
      }
      return true;
    },
    // The arrival view: sky, a city that slowly grows as the ship drifts in, traffic, ships, glittering water
    drawCity(t, dt, alpha, leave, stay) {
      const { ctx, w, h } = this, d = this.dest, vp = d.vp;
      ctx.globalAlpha = alpha;
      const lift = leave ? ease.inCubic(leave) : 0;
      ctx.drawImage(d.sky, 0, -lift * h * 0.15, w, h);
      // sun flare: rays and lens ghosts
      ctx.globalCompositeOperation = "lighter";
      const pulse = 0.9 + 0.1 * Math.sin(t * 2);
      glow(ctx, d.sunX, d.sunY, 70 * pulse, `rgba(${d.D.sun}, ALPHA)`, 1);
      ctx.strokeStyle = `rgba(${d.D.sun}, .35)`; ctx.lineWidth = 1.5;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + t * 0.05, L = (i % 2 ? 90 : 170) * pulse;
        ctx.beginPath(); ctx.moveTo(d.sunX + Math.cos(a) * 12, d.sunY + Math.sin(a) * 12); ctx.lineTo(d.sunX + Math.cos(a) * L, d.sunY + Math.sin(a) * L); ctx.stroke();
      }
      for (const [f, r, a] of [[0.35, 26, 0.1], [0.6, 12, 0.14], [0.85, 40, 0.06]]) {
        const gx = d.sunX + (w / 2 - d.sunX) * f * 2, gy = d.sunY + (h / 2 - d.sunY) * f * 2;
        ctx.fillStyle = `rgba(${d.D.sun}, ${a})`; ctx.beginPath(); ctx.arc(gx, gy, r, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      // the ground drifts toward you while you're here, and rushes past when you leave
      // (no rescaling while you stay: that keeps it smooth on phones; the city rushes past only as you leave)
      const s = 1 + lift * 3;
      const px = Math.round(Math.tanh(-cam.x / 4000) * 30);
      ctx.save();
      if (s !== 1) { ctx.translate(vp.x + px, vp.y); ctx.scale(s, s); ctx.translate(-vp.x, -vp.y); }
      else ctx.translate(px, 0);
      ctx.drawImage(d.ground, 0, 0, w, h);
      // traffic along the avenue (white headlights one way, red tail lights the other)
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (const car of this.cars) {
        car.u = mod(car.u + car.sp * dt, 1);
        const inv1 = 1 / 1.12 * (1 - car.u) + (1 / 18) * car.u, inv2 = 1 / 1.12 * (1 - car.u - 0.012 * Math.sign(car.sp)) + (1 / 18) * (car.u + 0.012 * Math.sign(car.sp));
        const x1 = vp.x + car.lane * d.F * inv1, y1 = vp.y + d.G * inv1, x2 = vp.x + car.lane * d.F * inv2, y2 = vp.y + d.G * inv2;
        ctx.strokeStyle = car.sp > 0 ? "rgba(255, 245, 220, .85)" : "rgba(255, 90, 80, .85)";
        ctx.lineWidth = Math.max(0.8, inv1 * 4);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      // glitter on the bay
      for (const gl of this.glints) {
        const a = Math.pow(Math.max(0, Math.sin(t * gl.sp + gl.ph)), 6);
        if (a < 0.05) continue;
        ctx.fillStyle = `rgba(255, 255, 255, ${a})`; ctx.fillRect(gl.x - 1, gl.y, 3, 1.5);
      }
      // beacons blinking on the spires
      for (const b of d.beacons) {
        if (Math.sin(t * 2.4 + b.ph) < 0.6) continue;
        ctx.fillStyle = `rgba(255, 70, 70, ${Math.min(1, 2.5 / b.d)})`; ctx.beginPath(); ctx.arc(b.x, b.y, Math.max(1, 3.2 / b.d * 2), 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.restore();
      // ships flying over the city
      for (let i = this.crafts.length - 1; i >= 0; i--) {
        const cr = this.crafts[i], q = (t - cr.t) / cr.dur;
        if (q >= 1) { if (cr.launched) this.crafts.splice(i, 1); else this.crafts[i] = this.newCraft(t); continue; }
        if (q < 0) continue;
        const x = cr.x + (cr.tx - cr.x) * q, y = cr.y + (cr.ty - cr.y) * q, sc = cr.launched ? cr.s * (1 - q * 0.85) : cr.s;
        const dir = Math.sign(cr.tx - cr.x) || 1, k = 14 * sc;
        ctx.fillStyle = "#eef3fb";
        ctx.beginPath(); ctx.moveTo(x + dir * k, y); ctx.lineTo(x - dir * k * 0.7, y - k * 0.32); ctx.lineTo(x - dir * k * 0.45, y); ctx.lineTo(x - dir * k * 0.7, y + k * 0.32); ctx.fill();
        ctx.globalCompositeOperation = "lighter";
        glow(ctx, x - dir * k * 0.75, y, k * 0.9, "hsla(195, 100%, 75%, ALPHA)", 0.9);
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.globalAlpha = 1;
    },
  };
  const Warp = makeScene("warp", WARP_DEF);

  /* ---------------------------------------------------------
     15. TIME TRAVEL TRANSITION + NOIR + NEO TOKYO
     --------------------------------------------------------- */
  const ROMAN = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];

  EFFECTS.timewarp = {
    dur: 2400,
    midAt: 0.5,                       // the theme switches under the flash
    init(fx) {
      fx.dir = fx.opts.dir || 1;
      fx.tint = fx.dir < 0 ? "255, 214, 150" : "120, 230, 255";     // amber into the past, cyan into the future
      for (let i = 0; i < 220; i++) fx.parts.push({ ang: rnd(0, TAU), z: Math.random(), sp: rnd(0.7, 1.4) });
    },
    mid(fx) { fx.opts.onMid?.(); },
    draw(fx, ctx, t, dt) {
      const { cx, cy, maxR, dir, tint } = fx;
      const env = seg(t, 0, 0.18) * (1 - seg(t, 0.78, 1));
      // Darkness tinted toward the era you're heading for
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      g.addColorStop(0, dir < 0 ? `rgba(30, 20, 8, ${0.9 * env})` : `rgba(2, 8, 26, ${0.9 * env})`);
      g.addColorStop(1, dir < 0 ? `rgba(12, 8, 4, ${0.7 * env})` : `rgba(1, 3, 12, ${0.7 * env})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);

      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      // Light streaks rushing past
      for (const p of fx.parts) {
        const z0 = p.z;
        p.z += dt * 1.1 * p.sp * (0.4 + env * 1.6);
        if (p.z > 1) { p.z -= 1; continue; }
        const r0 = Math.pow(z0, 2.2) * maxR * 1.2, r1 = Math.pow(p.z, 2.2) * maxR * 1.2;
        ctx.strokeStyle = `rgba(${tint}, ${env * p.z * 0.8})`;
        ctx.lineWidth = 0.6 + p.z * 2.4;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(p.ang) * r0, cy + Math.sin(p.ang) * r0); ctx.lineTo(cx + Math.cos(p.ang) * r1, cy + Math.sin(p.ang) * r1); ctx.stroke();
      }
      // Clock rings: you fall through them, then the new era's rings close in
      const zoom = t < 0.5 ? 0.55 + 2.6 * ease.inCubic(t / 0.5) : 3.15 - 2.6 * ease.outCubic((t - 0.5) / 0.5);
      const spin = dir * (t * t * 26);
      ctx.font = `600 ${Math.round(Math.min(vw, vh) * 0.03)}px ${getComputedStyle(document.body).fontFamily}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let i = 0; i < 4; i++) {
        const R = Math.min(vw, vh) * (0.14 + i * 0.12) * zoom;
        const a = env * (0.85 - i * 0.15);
        const rot = spin * (i % 2 ? -0.6 : 1) * (1 + i * 0.3);
        ctx.strokeStyle = `rgba(${tint}, ${a * 0.8})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
        for (let k = 0; k < 60; k++) {
          const ang = rot + (k / 60) * TAU, big = k % 5 === 0;
          const r0 = R * (big ? 0.9 : 0.95);
          ctx.lineWidth = big ? 2.5 : 1;
          ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0); ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R); ctx.stroke();
        }
        if (i === 1) {
          ctx.fillStyle = `rgba(${tint}, ${a})`;
          for (let k = 0; k < 12; k++) {
            const ang = rot + (k / 12) * TAU - Math.PI / 2;
            ctx.fillText(ROMAN[k], cx + Math.cos(ang) * R * 0.78, cy + Math.sin(ang) * R * 0.78);
          }
        }
      }
      // Clock hands spinning out of control
      const handA = dir * Math.pow(t, 2) * 70, R0 = Math.min(vw, vh) * 0.14 * zoom;
      ctx.strokeStyle = `rgba(${tint}, ${env})`;
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(handA / 12) * R0 * 0.55, cy + Math.sin(handA / 12) * R0 * 0.55); ctx.stroke();
      ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(handA) * R0 * 0.85, cy + Math.sin(handA) * R0 * 0.85); ctx.stroke();
      glow(ctx, cx, cy, 70 * env, `rgba(${tint}, ALPHA)`, 0.9);

      // Year counter rolling to the destination
      if (fx.opts.years) {
        const [y0, y1] = fx.opts.years;
        const k = ease.inCubic(seg(t, 0.1, 0.5));
        const yr = Math.round(y0 + (y1 - y0) * k);
        const a = seg(t, 0.06, 0.18) * (1 - seg(t, 0.8, 0.98));
        ctx.globalCompositeOperation = "source-over";
        ctx.font = `800 ${Math.round(Math.min(vw, vh) * 0.11)}px ${getComputedStyle(document.body).fontFamily}`;
        ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
        ctx.shadowColor = `rgba(${tint}, ${a})`; ctx.shadowBlur = 30;
        ctx.fillText(String(yr), cx, cy + Math.min(vw, vh) * 0.32);
        ctx.shadowBlur = 0;
      }
      // Flash that hides the switch
      const f = seg(t, 0.4, 0.5) * (1 - seg(t, 0.5, 0.66));
      if (f > 0) { ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = `rgba(${tint}, ${f * 0.95})`; ctx.fillRect(0, 0, vw, vh); }
      const sh = t > 0.42 && t < 0.6 ? 7 * (1 - Math.abs(t - 0.5) / 0.1) : 0;
      canvas.style.transform = sh > 0 ? `translate(${rnd(-sh, sh).toFixed(1)}px, ${rnd(-sh, sh).toFixed(1)}px)` : "";
    },
    card(fx, c, t, bx, by) {
      const { r, th } = polar(fx, bx, by);
      if (t < 0.5) {                                        // flung outward at warp speed
        const q = ease.inCubic(seg(t, c.seed * 0.08, 0.48));
        const p = fromPolar(fx, r * (1 + q * 2.4) + q * 120, th + fx.dir * q * 0.5);
        return { ...p, s: 1 + q * 0.7, a: 1 - seg(q, 0.55, 1), stretch: 1 + q * 3.5, phi: th, rot: fx.dir * q * 0.5 };
      }
      const k = ease.outCubic(seg(t, 0.52 + c.seed * 0.1, 0.96));   // the new era arrives
      const p = fromPolar(fx, r * k, th - fx.dir * (1 - k) * 0.8);
      return { ...p, s: 0.3 + 0.7 * k, a: seg(k, 0, 0.25), stretch: 1 + (1 - k) * 2.5, phi: th, rot: -fx.dir * (1 - k) * 0.8 };
    },
  };

  /* ===== NOIR: a black-and-white rainy city, venetian blinds, a street lamp, film grain ===== */
  const Noir = makeScene("noir", {
    front: true,
    build() {
      const { w, h } = this;
      const [bg, g] = mkCanvas(w, h);
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "#0d0d0d"); gr.addColorStop(0.6, "#1c1c1c"); gr.addColorStop(1, "#060606");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      this.bg = bg;
      this.TW = Math.ceil(w * 1.6);
      this.city = skyline(this.TW, h, h * 0.82, { hMin: h * 0.12, hMax: h * 0.42, color: "#121212", wins: ["rgba(235,235,225,.55)", "rgba(200,200,190,.35)"], density: 0.07 });
      // Street lamp and a figure in a hat beneath it (screen-fixed)
      this.lampX = w * 0.84; this.lampTop = h * 0.36;
      const [lamp, l] = mkCanvas(w, h);
      const lx = this.lampX, ly = this.lampTop;
      l.fillStyle = "#050505";
      l.fillRect(lx - 4, ly, 8, h - ly);
      l.fillRect(lx - 4, ly, 46, 6);
      l.beginPath(); l.moveTo(lx + 30, ly + 6); l.lineTo(lx + 52, ly + 6); l.lineTo(lx + 47, ly + 22); l.lineTo(lx + 35, ly + 22); l.fill();
      const mx = lx - 40, my = h - 4, s = Math.min(h * 0.11, 90);   // the man in the trench coat
      l.beginPath(); l.moveTo(mx - s * 0.28, my); l.lineTo(mx - s * 0.2, my - s * 0.9); l.lineTo(mx + s * 0.22, my - s * 0.9); l.lineTo(mx + s * 0.3, my); l.fill();
      l.beginPath(); l.ellipse(mx, my - s * 1.0, s * 0.12, s * 0.13, 0, 0, TAU); l.fill();
      l.beginPath(); l.ellipse(mx, my - s * 1.08, s * 0.24, s * 0.04, 0, 0, TAU); l.fill();
      l.fillRect(mx - s * 0.13, my - s * 1.24, s * 0.26, s * 0.15);
      this.lamp = lamp;
      // The pool of light under the lamp
      const [cone, c] = mkCanvas(w, h);
      const cg = c.createLinearGradient(0, ly + 20, 0, h);
      cg.addColorStop(0, "rgba(255, 255, 245, .32)"); cg.addColorStop(1, "rgba(255, 255, 245, .04)");
      c.fillStyle = cg;
      c.beginPath(); c.moveTo(lx + 36, ly + 20); c.lineTo(lx + 46, ly + 20); c.lineTo(lx + 41 + h * 0.32, h); c.lineTo(lx + 41 - h * 0.32, h); c.fill();
      const pg = c.createRadialGradient(lx + 41, h, 0, lx + 41, h, h * 0.35);
      pg.addColorStop(0, "rgba(255, 255, 245, .25)"); pg.addColorStop(1, "rgba(255, 255, 245, 0)");
      c.fillStyle = pg; c.fillRect(0, 0, w, h);
      glow(c, lx + 41, ly + 16, 60, "rgba(255, 255, 240, ALPHA)", 0.9);
      this.cone = cone;
      // Venetian-blind light: soft bright bars, drawn rotated and swept slowly
      const D = Math.ceil(Math.hypot(w, h) * 1.3);
      const [bl, b] = mkCanvas(D, D);
      for (let y = 0; y < D; y += 46) {
        const bar = b.createLinearGradient(0, y, 0, y + 26);
        bar.addColorStop(0, "rgba(255,255,255,0)"); bar.addColorStop(0.5, "rgba(255,255,255,.55)"); bar.addColorStop(1, "rgba(255,255,255,0)");
        b.fillStyle = bar; b.fillRect(0, y, D, 26);
      }
      const fade = b.createRadialGradient(D / 2, D / 2, 0, D / 2, D / 2, D / 2);
      fade.addColorStop(0, "rgba(0,0,0,0)"); fade.addColorStop(1, "rgba(0,0,0,1)");
      b.globalCompositeOperation = "destination-out"; b.fillStyle = fade; b.fillRect(0, 0, D, D);
      this.blinds = bl;
      // Film grain tiles
      this.grain = [0, 1, 2].map(() => {
        const [n, ng] = mkCanvas(160, 160);
        const img = ng.createImageData(160, 160);
        for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 40; }
        ng.putImageData(img, 0, 0);
        return n;
      });
      this.rain = Array.from({ length: clamp(Math.round((w * h) / 6000), 110, 240) }, () => ({ x: Math.random(), y: Math.random(), d0: Math.random() }));
      this.smoke = Array.from({ length: 5 }, (_, i) => ({ ph: i * 1.3, off: rnd(-6, 6) }));
      this.flash = 0; this.nextFlash = rnd(6, 12);
    },
    lite() { this.rain = this.rain.filter((_, i) => i % 2 === 0); },
    tap() { this.flash = 1; Sound.sfx("thunder"); },
    draw(t, dt) {
      const { ctx, fctx, w, h } = this;
      ctx.drawImage(this.bg, 0, 0, w, h);
      drawWrapped(ctx, this.city, 0.05, w);
      // Blinds of light sweep slowly, like headlights passing outside
      const D = this.blinds.width;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.1 + 0.05 * Math.sin(t * 0.4);
      ctx.translate(w * 0.45, h * 0.45); ctx.rotate(-0.42);
      ctx.drawImage(this.blinds, -D / 2, -D / 2 + mod(t * 14, 46));
      ctx.restore();
      // Lamp (flickers now and then) and its rain-filled light
      const flick = Math.random() < 0.015 ? 0.4 : 1;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = flick;
      ctx.drawImage(this.cone, 0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(this.lamp, 0, 0, w, h);
      // Cigarette smoke curling up from the figure
      const sx = this.lampX - 40 + 10, sy = h - Math.min(h * 0.11, 90) * 1.0;
      ctx.lineCap = "round";
      for (const p of this.smoke) {
        ctx.strokeStyle = "rgba(220, 220, 220, .07)"; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(sx, sy);
        for (let k = 1; k < 16; k++) ctx.lineTo(sx + Math.sin(t * 0.9 + p.ph + k * 0.45) * k * 1.8 + p.off, sy - k * 9);
        ctx.stroke();
      }
      // Rain: brighter where it crosses the lamp light
      const coneX = this.lampX + 41;
      for (const r of this.rain) {
        const d = mod(r.d0 + cam.z * 0.5, 1), par = 0.05 + d * 0.4, sp = 650 + d * 700;
        const x = mod(r.x * w * 1.2 - t * sp * 0.12 - cam.x * par, w * 1.2) - w * 0.1;
        const y = mod(r.y * h * 1.2 + t * sp, h * 1.2) - h * 0.1;
        const inLight = y > this.lampTop && Math.abs(x - coneX) < (y - this.lampTop) * 0.55;
        const len = 10 + d * 24, g = d > 0.85 ? fctx : ctx;
        g.strokeStyle = `rgba(230, 230, 230, ${(inLight ? 0.55 : 0.12) + d * 0.2})`;
        g.lineWidth = 0.6 + d;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + len * 0.12, y - len); g.stroke();
      }
      // Lightning, every so often
      if (t > this.nextFlash) { this.flash = 1; this.nextFlash = t + rnd(8, 16); }
      if (this.flash > 0) {
        fctx.fillStyle = `rgba(255, 255, 255, ${this.flash * (0.5 + 0.5 * Math.random()) * 0.5})`;
        fctx.fillRect(0, 0, w, h);
        this.flash = Math.max(0, this.flash - dt * 3);
      }
      // Projector flicker, grain and scratches over everything
      fctx.fillStyle = `rgba(0, 0, 0, ${Math.random() * 0.06})`; fctx.fillRect(0, 0, w, h);
      if (!this.lite) {
        fctx.globalAlpha = 0.55;
        fctx.fillStyle = fctx.createPattern(this.grain[Math.floor(t * 24) % 3], "repeat");
        fctx.save(); fctx.translate(rnd(0, 160), rnd(0, 160)); fctx.fillRect(-160, -160, w + 160, h + 160); fctx.restore();
        fctx.globalAlpha = 1;
      }
      if (Math.random() < 0.3) {
        fctx.strokeStyle = `rgba(255, 255, 255, ${rnd(0.08, 0.25)})`; fctx.lineWidth = 1;
        const x = rnd(0, w);
        fctx.beginPath(); fctx.moveTo(x, 0); fctx.lineTo(x + rnd(-6, 6), h); fctx.stroke();
      }
    },
  });

  /* ===== NEO TOKYO: neon kanji towers, holographic koi, a bullet train, a glowing torii ===== */
  const KANJI = ["東京", "未来", "夢", "光", "電気", "ネオン", "愛", "星空", "都", "桜", "侍", "龍", "ラーメン", "カフェ", "時間"];
  function neoTowers(TW, h, base, { color, hMin, hMax, signs, track }) {
    const list = [];
    let x = 0;
    const neon = ["#ff2bd6", "#00f0ff", "#ffe600", "#7cff4f", "#ff7a2b"];
    while (x < TW) {
      const bw = rnd(40, 110), bh = rnd(hMin, hMax), bx = x;
      x += bw + rnd(6, 26);
      const wins = [];
      for (let wy = base - bh + 10; wy < base - 8; wy += 7) for (let wx = bx + 4; wx < bx + bw - 4; wx += 6) if (Math.random() < 0.12) wins.push([wx, wy]);
      const sign = signs && Math.random() < 0.55 ? { text: KANJI[Math.floor(Math.random() * KANJI.length)], color: neon[Math.floor(Math.random() * neon.length)], side: Math.random() < 0.5 } : null;
      const strip = Math.random() < 0.4 ? neon[Math.floor(Math.random() * neon.length)] : null;
      list.push({ bx, bw, bh, wins, sign, strip, crown: Math.random() < 0.3 });
    }
    const trackY = track ? base - h * 0.16 : 0;
    return tileLayer(TW, h, [g => {
      for (const b of list) {
        g.fillStyle = color;
        g.fillRect(b.bx, base - b.bh, b.bw, b.bh + 4);
        if (b.crown) { g.beginPath(); g.moveTo(b.bx, base - b.bh); g.lineTo(b.bx + b.bw / 2, base - b.bh - b.bw * 0.4); g.lineTo(b.bx + b.bw, base - b.bh); g.fill(); }
        g.fillStyle = "rgba(160, 220, 255, .25)";
        for (const [wx, wy] of b.wins) g.fillRect(wx, wy, 3, 2);
        if (b.strip) { g.shadowColor = b.strip; g.shadowBlur = 10; g.fillStyle = b.strip; g.fillRect(b.bx, base - b.bh, b.bw, 2); g.shadowBlur = 0; }
        if (b.sign) {                                    // vertical neon sign
          const chars = [...b.sign.text], cs = 18, sx = b.side ? b.bx - 4 : b.bx + b.bw - 22, sy = base - b.bh + 18;
          g.fillStyle = "rgba(0, 0, 0, .7)"; g.fillRect(sx, sy, 26, chars.length * cs + 10);
          g.strokeStyle = b.sign.color; g.lineWidth = 1.5; g.shadowColor = b.sign.color; g.shadowBlur = 12;
          g.strokeRect(sx, sy, 26, chars.length * cs + 10);
          g.fillStyle = b.sign.color; g.font = `700 ${cs - 2}px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`; g.textAlign = "center"; g.textBaseline = "top";
          chars.forEach((ch, i) => g.fillText(ch, sx + 13, sy + 6 + i * cs));
          g.shadowBlur = 0;
        }
      }
      if (track) {                                        // elevated maglev track
        g.fillStyle = color;
        g.fillRect(0, trackY, TW, 8);
        for (let px = 20; px < TW; px += 140) g.fillRect(px, trackY + 8, 10, base - trackY);
        g.shadowColor = "#00f0ff"; g.shadowBlur = 8; g.fillStyle = "#00f0ff"; g.fillRect(0, trackY, TW, 1.5); g.shadowBlur = 0;
      }
    }]);
  }

  /* ===== Neon dragons for Neo Tokyo: four long, serpentine Eastern-style dragons (original designs),
          one for each element, each chasing a glowing pearl of its element through the sky ===== */
  const DRAGON_ELEMENTS = [
    { id: "fire", kanji: "火", core: "255, 220, 170", glow: "255, 70, 35", accent: "255, 170, 30" },
    { id: "water", kanji: "水", core: "205, 245, 255", glow: "0, 165, 255", accent: "70, 225, 255" },
    { id: "earth", kanji: "土", core: "225, 255, 205", glow: "40, 215, 110", accent: "255, 205, 70" },
    { id: "wind", kanji: "風", core: "255, 255, 255", glow: "175, 135, 255", accent: "215, 230, 255" },
  ];
  function makeDragons(w, h, lite) {
    const size = clamp(Math.min(w, h) * 0.028, 14, 30);
    return DRAGON_ELEMENTS.map((el, i) => {
      const x = w * (0.15 + i * 0.23), y = h * (0.18 + (i % 2) * 0.2);
      return {
        el, size, x, y, ang: i % 2 ? Math.PI : 0, ph: rnd(0, TAU), N: lite ? 30 : 40,
        trail: Array.from({ length: 60 }, (_, k) => ({ x: x - Math.cos(i % 2 ? Math.PI : 0) * k * size * 0.5, y })),
        orb: { cx: [0.27, 0.73, 0.3, 0.7][i], ax: rnd(0.16, 0.24), bx: rnd(0.05, 0.1), ay: rnd(0.08, 0.13), fx: rnd(0.05, 0.08), fy: rnd(0.09, 0.14), px: rnd(0, TAU), py: rnd(0, TAU), cy: [0.2, 0.24, 0.42, 0.46][i] },
        roar: null,
      };
    });
  }
  // The pearl each dragon chases: a slow, looping flight path across the sky
  const pearlAt = (d, t, w, h) => d.unite ? {                // the Four Gods: all four circle one great pearl
    x: w / 2 + Math.cos(d.unite.a + t * 0.9) * Math.min(w, h) * 0.28,
    y: h * 0.34 + Math.sin(d.unite.a + t * 0.9) * Math.min(w, h) * 0.16,
  } : ({
    x: w * (d.orb.cx + d.orb.ax * Math.sin(t * d.orb.fx * TAU + d.orb.px) + d.orb.bx * Math.sin(t * d.orb.fx * 2.7 * TAU + d.orb.py)),
    y: h * (d.orb.cy + d.orb.ay * Math.sin(t * d.orb.fy * TAU + d.orb.py)),
  });
  function stepDragon(d, t, dt, w, h) {
    const p = pearlAt(d, t + 1.2, w, h);                       // the pearl stays a little ahead
    const want = Math.atan2(p.y - d.y, p.x - d.x);
    let diff = ((want - d.ang + Math.PI * 3) % TAU) - Math.PI;
    d.ang += clamp(diff, -2.4 * dt, 2.4 * dt) + Math.sin(t * 2.6 + d.ph) * 0.9 * dt;   // steer, with a serpentine sway
    const roaring = d.roar && t - d.roar.t < 1.4;
    const speed = d.size * (roaring ? 3 : 7.5);
    d.x += Math.cos(d.ang) * speed * dt; d.y += Math.sin(d.ang) * speed * dt;
    // keep evenly spaced body points behind the head
    const sp = d.size * 0.5;
    let head = d.trail[0], dist = Math.hypot(d.x - head.x, d.y - head.y);
    while (dist >= sp) {
      const k = sp / dist;
      head = { x: head.x + (d.x - head.x) * k, y: head.y + (d.y - head.y) * k };
      d.trail.unshift(head);
      dist = Math.hypot(d.x - head.x, d.y - head.y);
    }
    if (d.trail.length > d.N + 4) d.trail.length = d.N + 4;
  }
  const rgba = (c, a) => `rgba(${c}, ${a})`;
  function neonPath(ctx, el, build, width = 1.6) {              // a soft halo, then a bright core line
    ctx.strokeStyle = rgba(el.glow, 0.28); ctx.lineWidth = width * 4.5; build(); ctx.stroke();
    ctx.strokeStyle = rgba(el.core, 0.95); ctx.lineWidth = width; build(); ctx.stroke();
  }
  function drawDragon(ctx, d, t, parts) {
    const { el, size } = d, pts = [{ x: d.x, y: d.y }, ...d.trail].slice(0, d.N);
    const N = pts.length;
    const radius = i => {                                      // thick behind the head, tapering to the tail
      const f = i / (N - 1);
      return size * (f < 0.12 ? 0.55 + f * 3 : 0.92 * Math.pow(1 - (f - 0.12) / 0.88, 1.15) + 0.07);
    };
    const L = [], R = [], dirs = [];
    for (let i = 0; i < N; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)];
      const ang = Math.atan2(a.y - b.y, a.x - b.x), r = radius(i);
      dirs.push(ang);
      L.push({ x: pts[i].x + Math.cos(ang - Math.PI / 2) * r, y: pts[i].y + Math.sin(ang - Math.PI / 2) * r });
      R.push({ x: pts[i].x + Math.cos(ang + Math.PI / 2) * r, y: pts[i].y + Math.sin(ang + Math.PI / 2) * r });
    }
    // body: a dark translucent fill with a neon outline
    ctx.fillStyle = rgba(el.glow, 0.13);
    ctx.beginPath(); L.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); for (let i = N - 1; i >= 0; i--) ctx.lineTo(R[i].x, R[i].y); ctx.closePath(); ctx.fill();
    neonPath(ctx, el, () => { ctx.beginPath(); L.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); }, 1.7);
    neonPath(ctx, el, () => { ctx.beginPath(); R.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); }, 1.7);
    // scales: chevrons down the back
    ctx.strokeStyle = rgba(el.accent, 0.55); ctx.lineWidth = 1.2;
    for (let i = 3; i < N - 3; i += 2) {
      const p = pts[i], a = dirs[i], r = radius(i) * 0.55;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(a + 2.4) * r, p.y + Math.sin(a + 2.4) * r);
      ctx.lineTo(p.x + Math.cos(a) * r * 0.35, p.y + Math.sin(a) * r * 0.35);
      ctx.lineTo(p.x + Math.cos(a - 2.4) * r, p.y + Math.sin(a - 2.4) * r);
      ctx.stroke();
    }
    // dorsal fins along the back: flames, waves, crystals or wisps
    for (let i = 4; i < N - 2; i += 3) {
      const b = L[i], a = dirs[i], r = radius(i), out = a - Math.PI / 2, back = a + Math.PI;
      const len = r * (el.id === "fire" ? 1 + 0.5 * Math.sin(t * 14 + i) : el.id === "earth" ? 1.15 : 0.95);
      const tip = { x: b.x + Math.cos(out) * len + Math.cos(back) * len * 0.7, y: b.y + Math.sin(out) * len + Math.sin(back) * len * 0.7 };
      neonPath(ctx, el, () => {
        ctx.beginPath(); ctx.moveTo(b.x, b.y);
        if (el.id === "earth") ctx.lineTo(tip.x, tip.y);
        else ctx.quadraticCurveTo(b.x + Math.cos(out) * len * (el.id === "wind" ? 1.3 : 0.9), b.y + Math.sin(out) * len * (el.id === "wind" ? 1.3 : 0.9) + (el.id === "water" ? Math.sin(t * 5 + i) * 4 : 0), tip.x, tip.y);
        ctx.lineTo(L[Math.min(N - 1, i + 1)].x, L[Math.min(N - 1, i + 1)].y);
      }, 1.1);
    }
    // four legs with three-clawed feet, paddling through the air
    for (const [k, li] of [[0, 0.2], [1, 0.27], [2, 0.55], [3, 0.62]].map(([k, f]) => [k, Math.round(f * (N - 1))])) {
      const base = R[li], a = dirs[li] + Math.PI / 2, swing = Math.sin(t * 5 + k * 1.6 + d.ph) * 0.5;
      const r = radius(li), knee = { x: base.x + Math.cos(a + swing) * r * 1.1, y: base.y + Math.sin(a + swing) * r * 1.1 };
      const foot = { x: knee.x + Math.cos(a + swing - 0.9) * r, y: knee.y + Math.sin(a + swing - 0.9) * r };
      neonPath(ctx, el, () => { ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(knee.x, knee.y); ctx.lineTo(foot.x, foot.y); }, 1.3);
      neonPath(ctx, el, () => { ctx.beginPath(); for (const c of [-0.6, 0, 0.6]) { ctx.moveTo(foot.x, foot.y); ctx.lineTo(foot.x + Math.cos(a + swing - 0.9 + c) * r * 0.45, foot.y + Math.sin(a + swing - 0.9 + c) * r * 0.45); } }, 1);
    }
    // a tail tuft
    const tl = pts[N - 1], ta = dirs[N - 1] + Math.PI;
    neonPath(ctx, el, () => { ctx.beginPath(); for (const s of [-0.5, 0, 0.5]) { ctx.moveTo(tl.x, tl.y); ctx.quadraticCurveTo(tl.x + Math.cos(ta + s) * size, tl.y + Math.sin(ta + s) * size + Math.sin(t * 6 + s) * 5, tl.x + Math.cos(ta + s * 1.4) * size * 1.7, tl.y + Math.sin(ta + s * 1.4) * size * 1.7); } }, 1.2);
    // the head (drawn in its own coordinates, facing +x)
    const ha = dirs[0], roar = d.roar && t - d.roar.t < 1.4 ? Math.sin(Math.min(1, (t - d.roar.t) / 1.4) * Math.PI) : 0;
    const jaw = 0.25 + 0.75 * roar + 0.12 * Math.sin(t * 3 + d.ph);
    const flipY = Math.cos(ha) < 0 ? -1 : 1;                   // keep the horns on top whichever way it flies
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(ha); ctx.scale(size / 26, (size / 26) * flipY);
    const lw = 1.6 / (size / 26);
    ctx.fillStyle = rgba(el.glow, 0.2);
    const skull = () => { ctx.beginPath(); ctx.moveTo(-8, -12); ctx.quadraticCurveTo(4, -17, 16, -12); ctx.lineTo(34, -7); ctx.quadraticCurveTo(42, -5, 41, 0); ctx.lineTo(16, 2); ctx.lineTo(-6, 6); };
    skull(); ctx.fill();
    neonPath(ctx, el, skull, lw);
    neonPath(ctx, el, () => { ctx.beginPath(); ctx.moveTo(16, 3); ctx.lineTo(36, 4 + jaw * 12); ctx.quadraticCurveTo(28, 10 + jaw * 12, 12, 12); ctx.lineTo(-6, 9); }, lw);   // lower jaw
    ctx.fillStyle = rgba(el.core, 0.95);
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(20 + k * 4.5, 2); ctx.lineTo(22 + k * 4.5, 6); ctx.lineTo(24 + k * 4.5, 2); ctx.fill(); }   // fangs
    ctx.fillStyle = rgba(el.accent, 1); ctx.beginPath(); ctx.ellipse(14, -7, 3.2, 2, -0.2, 0, TAU); ctx.fill();   // eye
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(14.6, -7.4, 0.9, 0, TAU); ctx.fill();
    neonPath(ctx, el, () => { ctx.beginPath(); ctx.moveTo(6, -15); ctx.quadraticCurveTo(-6, -30, -26, -34); ctx.moveTo(-6, -27); ctx.lineTo(-12, -40); ctx.moveTo(2, -14); ctx.quadraticCurveTo(-10, -24, -24, -24); }, lw * 0.9);   // antler horns
    neonPath(ctx, el, () => {                                  // long whiskers flowing back
      ctx.beginPath();
      for (const s of [-1, 1]) {
        ctx.moveTo(38, -2);
        ctx.bezierCurveTo(30, -20 * s - 4, 8, 22 * s + Math.sin(t * 4 + d.ph) * 10, -24, 14 * s + Math.sin(t * 3 + s) * 14);
        ctx.quadraticCurveTo(-38, 10 * s + Math.sin(t * 5) * 8, -50, 18 * s);
      }
    }, lw * 0.8);
    neonPath(ctx, el, () => { ctx.beginPath(); for (let k = 0; k < 5; k++) { const a = -2.2 - k * 0.25 + Math.sin(t * 7 + k) * 0.15; ctx.moveTo(-6, -6 + k * 3); ctx.quadraticCurveTo(-14, -6 + k * 3 + Math.sin(t * 6 + k) * 4, -6 + Math.cos(a) * 22, -6 + k * 3 - Math.sin(a) * 10); } }, lw * 0.8);   // mane
    ctx.restore();
    // breathing its element when it roars
    if (roar > 0.05 && d.roar) {
      const mx = d.x + Math.cos(ha) * size * 1.5, my = d.y + Math.sin(ha) * size * 1.5;
      for (let k = 0; k < 4; k++) {
        const a = Math.atan2(d.roar.y - my, d.roar.x - mx) + rnd(-0.25, 0.25), sp = rnd(220, 420);
        parts.push({ el, kind: "breath", x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.5, 0.9), max: 0.9, s: rnd(3, 7) });
      }
    }
  }
  function spawnElement(parts, d, t) {
    const { el } = d, pts = d.trail, i = Math.floor(Math.random() * Math.min(pts.length, d.N)), p = pts[i] || d;
    const base = { el, x: p.x + rnd(-6, 6), y: p.y + rnd(-6, 6), life: rnd(0.8, 1.6), max: 1.6, s: rnd(1.5, 3.5) };
    if (el.id === "fire") parts.push({ ...base, kind: "ember", vx: rnd(-15, 15), vy: rnd(-90, -40) });
    else if (el.id === "water") parts.push(Math.random() < 0.6 ? { ...base, kind: "drop", vx: rnd(-10, 10), vy: rnd(10, 40) } : { ...base, kind: "bubble", vx: rnd(-10, 10), vy: rnd(-40, -15), s: rnd(2, 5) });
    else if (el.id === "earth") parts.push({ ...base, kind: "shard", vx: rnd(-20, 20), vy: rnd(20, 70), rot: rnd(0, TAU), spin: rnd(-6, 6) });
    else parts.push({ ...base, kind: "gust", vx: rnd(-60, 60), vy: rnd(-20, 20), a: rnd(0, TAU), life: rnd(0.6, 1.2), max: 1.2 });
  }
  function drawElementParts(ctx, parts, dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.life -= dt;
      if (q.life <= 0) { parts.splice(i, 1); continue; }
      if (q.kind === "drop") q.vy += 160 * dt;
      if (q.kind === "breath") { q.vx *= 1 - dt * 1.5; q.vy *= 1 - dt * 1.5; if (q.el.id === "fire") q.vy -= 40 * dt; if (q.el.id === "water") q.vy += 120 * dt; }
      q.x += q.vx * dt; q.y += q.vy * dt;
      const a = Math.min(1, q.life / q.max * 1.6), el = q.el;
      if (q.kind === "ember" || (q.kind === "breath" && el.id === "fire")) {
        ctx.fillStyle = rgba(Math.random() < 0.5 ? el.accent : el.glow, a); ctx.beginPath(); ctx.arc(q.x, q.y, q.s * (q.kind === "breath" ? 1.6 : 1), 0, TAU); ctx.fill();
      } else if (q.kind === "drop") {
        ctx.fillStyle = rgba(el.core, a); ctx.beginPath(); ctx.ellipse(q.x, q.y, q.s * 0.7, q.s * 1.4, 0, 0, TAU); ctx.fill();
      } else if (q.kind === "bubble" || (q.kind === "breath" && el.id === "water")) {
        ctx.strokeStyle = rgba(el.accent, a); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(q.x, q.y, q.s, 0, TAU); ctx.stroke();
      } else if (q.kind === "shard" || (q.kind === "breath" && el.id === "earth")) {
        q.rot = (q.rot || 0) + (q.spin || 8) * dt;
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot);
        ctx.fillStyle = rgba(Math.sin(q.rot * 3) > 0.6 ? el.accent : el.glow, a);
        ctx.beginPath(); ctx.moveTo(0, -q.s * 1.6); ctx.lineTo(q.s, 0); ctx.lineTo(0, q.s * 1.6); ctx.lineTo(-q.s, 0); ctx.fill();
        ctx.restore();
      } else {                                                      // wind: curling gusts
        q.a = (q.a || 0) + dt * 4;
        ctx.strokeStyle = rgba(el.accent, a * 0.8); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.s * 4, q.a, q.a + 2.2); ctx.stroke();
      }
    }
  }

  const NeoTokyo = makeScene("neotokyo", {
    build() {
      const { w, h } = this;
      const [sky, g] = mkCanvas(w, h);
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "#050314"); gr.addColorStop(0.5, "#14062e"); gr.addColorStop(0.8, "#3a0d4a"); gr.addColorStop(1, "#120418");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${rnd(0.15, 0.6)})`; g.fillRect(rnd(0, w), rnd(0, h * 0.45), 1, 1); }
      // Holographic sun ring and a mountain outlined in light
      const sr = Math.min(w, h) * 0.2, sx = w * 0.32, sy = h * 0.4;
      g.strokeStyle = "rgba(255, 43, 160, .55)"; g.lineWidth = 3; g.shadowColor = "#ff2b9e"; g.shadowBlur = 24;
      g.beginPath(); g.arc(sx, sy, sr, 0, TAU); g.stroke();
      g.lineWidth = 1; g.beginPath(); g.arc(sx, sy, sr * 0.82, 0, TAU); g.stroke();
      g.shadowBlur = 0;
      const fx0 = w * 0.32, fy = h * 0.66, fw = w * 0.3, fh = h * 0.26;
      g.fillStyle = "#12062a";
      g.beginPath(); g.moveTo(fx0 - fw, fy); g.lineTo(fx0 - fw * 0.1, fy - fh); g.lineTo(fx0 + fw * 0.1, fy - fh); g.lineTo(fx0 + fw, fy); g.fill();
      g.strokeStyle = "rgba(0, 240, 255, .6)"; g.lineWidth = 1.5; g.shadowColor = "#00f0ff"; g.shadowBlur = 10;
      g.beginPath(); g.moveTo(fx0 - fw, fy); g.lineTo(fx0 - fw * 0.1, fy - fh); g.lineTo(fx0 + fw * 0.1, fy - fh); g.lineTo(fx0 + fw, fy); g.stroke();
      g.shadowBlur = 0;
      this.sky = sky;
      this.TW = Math.ceil(w * 1.6);
      this.base = h * 0.98;
      this.far = neoTowers(this.TW, h, h * 0.9, { color: "#0e0822", hMin: h * 0.25, hMax: h * 0.6, signs: false });
      this.near = neoTowers(this.TW, h, this.base, { color: "#06030f", hMin: h * 0.15, hMax: h * 0.48, signs: true, track: true });
      this.trackY = this.base - h * 0.16;
      // A glowing torii gate in the foreground
      const [tor, tg] = mkCanvas(w, h);
      const tw = Math.min(w, h) * 0.3, tx = w * 0.12, ty = h;
      tg.strokeStyle = "#ff3355"; tg.lineWidth = 3; tg.shadowColor = "#ff3355"; tg.shadowBlur = 18; tg.lineCap = "round";
      tg.fillStyle = "rgba(60, 0, 15, .85)";
      const post = (x) => { tg.fillRect(x - 6, ty - tw * 1.1, 12, tw * 1.1); tg.strokeRect(x - 6, ty - tw * 1.1, 12, tw * 1.1); };
      post(tx - tw * 0.35); post(tx + tw * 0.35);
      tg.beginPath(); tg.moveTo(tx - tw * 0.62, ty - tw * 1.12); tg.quadraticCurveTo(tx, ty - tw * 1.2, tx + tw * 0.62, ty - tw * 1.12);
      tg.lineTo(tx + tw * 0.6, ty - tw * 1.04); tg.quadraticCurveTo(tx, ty - tw * 1.11, tx - tw * 0.6, ty - tw * 1.04); tg.closePath(); tg.fill(); tg.stroke();
      tg.fillRect(tx - tw * 0.48, ty - tw * 0.92, tw * 0.96, 9); tg.strokeRect(tx - tw * 0.48, ty - tw * 0.92, tw * 0.96, 9);
      this.torii = tor;
      this.koi = [0, 1, 2].map(i => ({ hue: [190, 320, 40][i], cx: rnd(0.2, 0.8), cy: rnd(0.18, 0.45), rx: rnd(0.15, 0.3), ry: rnd(0.06, 0.12), sp: rnd(0.12, 0.2) * (i % 2 ? -1 : 1), ph: rnd(0, TAU), size: rnd(14, 22) }));
      this.drones = Array.from({ length: 14 }, () => ({ x: Math.random(), y: rnd(0.05, 0.55), ph: rnd(0, TAU), hue: Math.random() < 0.5 ? 190 : 320 }));
      this.petals = Array.from({ length: 50 }, () => ({ x: Math.random(), y: Math.random(), d: Math.random(), ph: rnd(0, TAU) }));
      this.train = { next: rnd(2, 5), start: -1 };
      this.dragons = makeDragons(w, h, false);
      this.dparts = [];
    },
    lite() { this.petals = this.petals.slice(0, 20); this.dragons.forEach(d => { d.N = 30; }); this.liteMode = true; },
    tap(x, y, t) {
      // near a dragon? it turns and breathes its element at your finger. Otherwise the koi come to you.
      const ox = Math.tanh(-cam.x / 5000) * 60, oy = Math.tanh(-cam.y / 5000) * 30;
      const d = this.dragons.map(d => ({ d, dist: Math.hypot(d.x + ox - x, d.y + oy - y) })).sort((a, b) => a.dist - b.dist)[0];
      if (d && d.dist < d.d.size * 6) { d.d.roar = { t, x: x - ox, y: y - oy }; Sound.sfx("dragon", { el: d.d.el.id }); Eggs.roar(d.d.el.id); }
      else { this.lure = { x, y, t }; Sound.sfx("sparkle"); }
    },
    draw(t) {
      const { ctx, w, h } = this;
      ctx.drawImage(this.sky, 0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      // Drones with blinking lights
      for (const d of this.drones) {
        const x = mod(d.x * w + t * 12 + Math.sin(t * 0.5 + d.ph) * 20 - cam.x * 0.04, w), y = d.y * h + Math.sin(t * 0.8 + d.ph) * 8;
        ctx.globalAlpha = Math.sin(t * 4 + d.ph) > 0.6 ? 1 : 0.3;
        ctx.drawImage(Jungle.sprite(d.hue, 65), x - 6, y - 6, 12, 12);
      }
      ctx.globalAlpha = 1;
      // Holographic koi swimming through the sky
      for (const k of this.koi) {
        const lw = this.lure ? smooth(0, 0.8, t - this.lure.t) * (1 - smooth(3, 6, t - this.lure.t)) : 0;
        const pos = s => {
          const a = (t - s) * k.sp * TAU * 0.25 + k.ph;
          const bx = k.cx * w + Math.cos(a) * k.rx * w - cam.x * 0.03, by = k.cy * h + Math.sin(a * 2) * k.ry * h;
          return lw ? [bx + (this.lure.x - bx) * 0.75 * lw, by + (this.lure.y - by) * 0.75 * lw] : [bx, by];
        };
        const flick = 0.75 + 0.25 * Math.sin(t * 23 + k.ph);
        const [hx, hy] = pos(0);
        ctx.globalAlpha = 0.5 * flick;
        ctx.drawImage(Jungle.sprite(k.hue, 60), hx - k.size * 3, hy - k.size * 3, k.size * 6, k.size * 6);
        for (let i = 11; i >= 0; i--) {
          const [x, y] = pos(i * 0.09);
          const r = k.size * (i < 3 ? 0.5 + i * 0.12 : 0.86 - (i - 3) * 0.08);
          ctx.globalAlpha = (0.55 - i * 0.03) * flick;
          ctx.fillStyle = `hsl(${k.hue + (i % 3 === 1 ? 30 : 0)}, 100%, ${i % 4 === 2 ? 85 : 62}%)`;
          ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, r * 0.55), 0, TAU); ctx.fill();
          if (i === 11) {                                  // flowing tail
            const [x2, y2] = pos(i * 0.09 + 0.12), ang = Math.atan2(y2 - y, x2 - x) + Math.sin(t * 6) * 0.4;
            ctx.beginPath(); ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(ang - 0.5) * k.size * 1.3, y + Math.sin(ang - 0.5) * k.size * 1.3);
            ctx.lineTo(x + Math.cos(ang + 0.5) * k.size * 1.3, y + Math.sin(ang + 0.5) * k.size * 1.3);
            ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      drawWrapped(ctx, this.far, 0.03, w);
      // Neon dragons of the four elements, weaving between the towers
      const ddt = Math.min(0.05, Math.max(0, t - (this.dLast ?? t))); this.dLast = t;
      ctx.save();
      ctx.translate(Math.tanh(-cam.x / 5000) * 60, Math.tanh(-cam.y / 5000) * 30);
      ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.textAlign = "center";
      const U = this.unite && t - this.unite.t < 13 ? this.unite : null;
      if (this.unite && !U) this.unite = null;
      this.dragons.forEach((d, i) => { d.unite = U ? { a: (i / 4) * TAU } : null; });
      for (const d of this.dragons) {
        if (!calm) stepDragon(d, t, ddt, w, h);
        const p = pearlAt(d, t + 1.2, w, h), pulse = 0.85 + 0.15 * Math.sin(t * 4 + d.ph);
        glow(ctx, p.x, p.y, d.size * 1.7 * pulse, `rgba(${d.el.glow}, ALPHA)`, 0.9);
        ctx.fillStyle = `rgba(${d.el.core}, .95)`; ctx.beginPath(); ctx.arc(p.x, p.y, d.size * 0.32, 0, TAU); ctx.fill();
        ctx.font = `700 ${Math.round(d.size * 0.85)}px "Noto Sans CJK JP", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", "Microsoft YaHei", sans-serif`;
        ctx.fillStyle = `rgba(${d.el.accent}, .95)`; ctx.fillText(d.el.kanji, p.x, p.y - d.size * 0.85);
        drawDragon(ctx, d, t, this.dparts);
        if (!calm && Math.random() < ddt * (this.liteMode ? 8 : 16)) spawnElement(this.dparts, d, t);
      }
      if (U) {                                                 // the great pearl of the four elements
        const age = t - U.t, cx = w / 2, cy = h * 0.34, k = Math.min(1, age / 2, (13 - age) / 1.5);
        DRAGON_ELEMENTS.forEach((el, i) => { const a = t * 1.4 + (i / 4) * TAU; glow(ctx, cx + Math.cos(a) * 18, cy + Math.sin(a) * 18, 70 * k, `rgba(${el.glow}, ALPHA)`, 0.7 * k); });
        glow(ctx, cx, cy, 40 * k, "rgba(255, 255, 255, ALPHA)", k);
        ctx.font = `800 ${Math.round(28 * k + 1)}px "Noto Sans CJK JP", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif`;
        ctx.fillStyle = `rgba(255, 255, 255, ${k})`; ctx.fillText("四神", cx, cy - 52 * k);
        if (age > 11.8 && !U.burst) { U.burst = true; for (const d of this.dragons) for (let n = 0; n < 40; n++) spawnElement(this.dparts, { ...d, trail: [{ x: cx + rnd(-60, 60), y: cy + rnd(-60, 60) }] }, t); }
      }
      drawElementParts(ctx, this.dparts, ddt);
      ctx.restore();
      ctx.globalCompositeOperation = "source-over"; ctx.textAlign = "left";
      drawWrapped(ctx, this.near, 0.08, w);
      // The bullet train glides past every few seconds
      const tr = this.train;
      if (tr.start < 0 && t > tr.next) tr.start = t;
      if (tr.start >= 0) {
        const k = (t - tr.start) / 2.4, len = w * 0.7;
        const x = -len + k * (w + len * 2), y = this.trackY - 18;
        ctx.globalCompositeOperation = "lighter";
        const lg = ctx.createLinearGradient(x - 220, 0, x, 0);
        lg.addColorStop(0, "rgba(0, 240, 255, 0)"); lg.addColorStop(1, "rgba(0, 240, 255, .5)");
        ctx.fillStyle = lg; ctx.fillRect(x - 220, y + 6, 220, 6);
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#e9f6ff";
        ctx.beginPath(); ctx.moveTo(x, y + 18); ctx.lineTo(x + len - 60, y + 18); ctx.quadraticCurveTo(x + len + 10, y + 18, x + len, y + 6);
        ctx.quadraticCurveTo(x + len - 40, y - 2, x + len - 90, y); ctx.lineTo(x, y); ctx.fill();
        ctx.fillStyle = "#0a1a3a"; ctx.fillRect(x + 10, y + 4, len - 120, 5);
        ctx.fillStyle = "#ff2bd6"; ctx.fillRect(x, y + 13, len - 70, 2);
        if (k > 1) { tr.start = -1; tr.next = t + rnd(6, 11); }
      }
      // Glowing torii and drifting neon petals
      ctx.drawImage(this.torii, 0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const p of this.petals) {
        const x = mod(p.x * w + t * (20 + p.d * 30) + Math.sin(t + p.ph) * 20 - cam.x * (0.05 + p.d * 0.2), w), y = mod(p.y * h + t * (12 + p.d * 25), h);
        ctx.globalAlpha = 0.5 + p.d * 0.5;
        ctx.drawImage(Jungle.sprite(330, 72), x - 5 - p.d * 4, y - 5 - p.d * 4, 10 + p.d * 8, 10 + p.d * 8);
      }
      ctx.globalAlpha = 1;
    },
  });

  /* ---------------------------------------------------------
     23. COCKPIT (Warp Drive only), CONSTELLATIONS, THE VOID
     --------------------------------------------------------- */
  // ----- Jumping the ship to another theme, and back -----
  const SHIP_DESTS = ["universe", "andromeda", "aurora"];
  const fromShip = () => { try { return sessionStorage.getItem("glimpse:fromShip") === "1"; } catch (_) { return false; } };
  const setFromShip = on => { try { on ? sessionStorage.setItem("glimpse:fromShip", "1") : sessionStorage.removeItem("glimpse:fromShip"); } catch (_) {} };
  function updateShipPill() {
    const t = document.documentElement.dataset.theme;
    $("#shipPill").hidden = !(t === "andromeda" || (fromShip() && SHIP_DESTS.includes(t)));
  }
  function jumpTo(theme, dest) {
    setFromShip(theme !== "warp");
    const go = () => { setTheme(theme); updateShipPill(); };
    if (reduceMotion || !cards.length) go();
    else startFx("hyperspace", null, { onMid: go, dest });
  }
  $("#shipPill").addEventListener("click", () => jumpTo("warp", "THE SHIP"));

  document.addEventListener("click", e => {
    const b = e.target.closest("[data-cockpit]");
    if (!b) return;
    const id = b.dataset.cockpit;
    if (SHIP_DESTS.includes(id)) jumpTo(id, THEMES[id].toUpperCase());
    if (id === "stars") openStars();
    if (id === "void") openVoid();
    if (id === "channels") openChannels();
  });
  document.addEventListener("click", e => { if (e.target.closest("[data-open-void]")) openVoid(); });

  // ----- Constellations: posts by part of the world -----
  const REGIONS = [
    { id: "North America", x: 18, y: 30 }, { id: "South America", x: 30, y: 72 }, { id: "Europe", x: 49, y: 22 },
    { id: "Africa", x: 52, y: 62 }, { id: "Asia", x: 75, y: 32 }, { id: "Oceania", x: 84, y: 75 }, { id: "Antarctica", x: 62, y: 91 },
  ];
  state.place = null;
  function openStars() {
    const groups = new Map(REGIONS.map(r => [r.id, new Map()]));
    for (const p of state.posts) if (p.region && groups.has(p.region)) groups.get(p.region).set(p.city, (groups.get(p.region).get(p.city) || 0) + 1);
    let lines = "", stars = "";
    for (const r of REGIONS) {
      const cities = [...groups.get(r.id).entries()].sort((a, b) => b[1] - a[1]).slice(0, 9);
      const total = cities.reduce((n, [, c]) => n + c, 0);
      const pts = cities.map(([city, n]) => {
        const hh = hashOf(city), a = ((hh % 360) * Math.PI) / 180, rad = 6 + (hh % 6);
        return { city, n, x: clamp(r.x + Math.cos(a) * rad * 0.8, 3, 97), y: clamp(r.y + Math.sin(a) * rad * 1.25, 6, 96) };
      });
      let prev = r;
      for (const pt of pts) { lines += `<line x1="${prev.x}" y1="${prev.y}" x2="${pt.x}" y2="${pt.y}"/>`; prev = pt; }
      const plural = n => `${n} post${n === 1 ? "" : "s"}`;
      stars += `<button type="button" class="star star--region${total ? "" : " star--dim"}" style="left:${r.x}%;top:${r.y}%" data-region="${esc(r.id)}" aria-label="${esc(r.id)}: ${total ? plural(total) : "no posts yet"}">
          <span class="star__icon" aria-hidden="true"></span><span class="star__label">${esc(r.id)}<small>${total ? plural(total) : "no posts yet"}</small></span></button>`;
      for (const pt of pts) {
        stars += `<button type="button" class="star star--city" style="left:${pt.x}%;top:${pt.y}%;--s:${Math.min(1.8, 0.8 + pt.n * 0.15).toFixed(2)}" data-region="${esc(r.id)}" data-city="${esc(pt.city)}" aria-label="${esc(pt.city)}, ${esc(r.id)}: ${plural(pt.n)}">
          <span class="star__icon" aria-hidden="true"></span><span class="star__label">${esc(pt.city)}<small>${plural(pt.n)}</small></span></button>`;
      }
    }
    $("#starSky").innerHTML = `<svg class="starmap__lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${stars}`;
    $("#stars").hidden = false;
  }
  function flyToPlace(place) {
    const go = () => { state.place = place; applyFilter(); glideTo(c => !c.el.classList.contains("is-dim"), { instant: true }); };
    if (reduceMotion || !cards.length) { state.place = place; applyFilter(); glideTo(c => !c.el.classList.contains("is-dim")); }
    else startFx("hyperspace", null, { onMid: go, dest: (place.city || place.region).toUpperCase() });
  }
  $("#starSky").addEventListener("click", e => {
    const b = e.target.closest(".star");
    if (!b) return;
    const place = { region: b.dataset.region, city: b.dataset.city || null };
    if (!state.posts.some(p => p.region === place.region && (!place.city || p.city === place.city))) { toast(`No posts from ${place.city || place.region} yet. Be the first!`); return; }
    $("#stars").hidden = true;
    flyToPlace(place);
  });
  $("#starsAll").addEventListener("click", () => { state.place = null; applyFilter(); $("#stars").hidden = true; });
  $("#stars").addEventListener("click", e => { if (e.target.closest("[data-close]")) $("#stars").hidden = true; });

  // ----- The Void -----
  async function openVoid() {
    const list = $("#voidList");
    $("#void").hidden = false;
    list.innerHTML = `<li class="voidlist__empty">Peering into the darkness…</li>`;
    try { renderVoid(await store.voidList()); }
    catch (err) { list.innerHTML = `<li class="voidlist__empty">${esc(err.message)}</li>`; }
  }
  function renderVoid(items) {
    $("#voidList").innerHTML = items.length ? items.map(p => {
      const days = Math.max(0, Math.ceil((p.erasesAt - Date.now()) / 864e5));
      const preview = p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : `<span>${esc((p.text || p.caption || "").slice(0, 70)) || (p.type === "voice" ? "🎙" : "…")}</span>`;
      return `<li class="voiditem" data-id="${esc(p.id)}">
        <div class="voiditem__thumb">${preview}</div>
        <div class="voiditem__info"><strong>${esc((TYPE_NAMES[p.type] || "a post").replace(/^a /, "A ").replace(/^an /, "An "))}${p.caption ? `: ${esc(p.caption.slice(0, 40))}` : ""}</strong>
          <span>Deleted ${esc(shortAgo(p.voidedAt))} · gone for good in ${days} day${days === 1 ? "" : "s"}</span></div>
        <div class="voiditem__actions">
          <button type="button" class="chip chip--solid" data-void-restore>Restore</button>
          <button type="button" class="text-btn" data-void-erase>Erase</button>
        </div>
      </li>`;
    }).join("") : `<li class="voidlist__empty">The Void is empty. Nothing here but darkness.</li>`;
  }
  $("#void").addEventListener("click", async e => {
    if (e.target.closest("[data-close]")) { $("#void").hidden = true; return; }
    const li = e.target.closest(".voiditem");
    if (!li) return;
    const id = li.dataset.id;
    if (e.target.closest("[data-void-restore]")) {
      try {
        const post = await store.restore(id);
        li.remove();
        $("#void").hidden = true;
        if (!state.posts.some(p => p.id === post.id)) { state.posts.unshift(post); if (!cards.length) buildWall(false); else injectPost(post); }
        timelineSetup();
        glideTo(c => c.post.id === post.id, { instant: !reduceMotion });
        if (!reduceMotion) startFx("fireworks", "capsule");
        toast("Back from The Void ✨");
        Badges.award("void");
      } catch (err) { toast(err.message); }
    }
    if (e.target.closest("[data-void-erase]")) {
      if (!confirm("Erase it forever? Not even The Void can bring it back after this.")) return;
      try {
        await store.erase(id);
        delete state.tokens[id]; ls.set("glimpse:tokens", state.tokens);
        li.remove();
        if (!$("#voidList .voiditem")) renderVoid([]);
        toast("Erased for good");
      } catch (err) { toast(err.message); }
    }
  });

  /* ===== ANDROMEDA (reached from the Warp Drive cockpit): our neighbouring spiral galaxy ===== */
  function makeAndromedaGalaxy(size) {
    const [c, g] = mkCanvas(size, size), m = size / 2;
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    g.globalCompositeOperation = "lighter";
    const halo = g.createRadialGradient(m, m, 0, m, m, m);
    halo.addColorStop(0, "rgba(255, 228, 190, .4)"); halo.addColorStop(0.3, "rgba(175, 165, 255, .12)"); halo.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.fillStyle = halo; g.fillRect(0, 0, size, size);
    for (let i = 0; i < 16000; i++) {
      const arm = i % 2, t = Math.pow(Math.random(), 0.6), r = t * m * 0.96;
      const ang = arm * Math.PI + t * 7.5 + gauss() * 0.32;
      const x = m + Math.cos(ang) * r + gauss() * 6, y = m + Math.sin(ang) * r + gauss() * 6;
      const pink = Math.random() < 0.03;
      const hue = pink ? 330 : t < 0.3 ? 42 : 42 + (t - 0.3) * 250;
      g.fillStyle = `hsla(${hue}, ${pink ? 90 : 70}%, ${pink ? 70 : 72 + Math.random() * 20}%, ${0.05 + Math.random() * (pink ? 0.6 : 0.25)})`;
      const s = pink ? 2.6 : Math.random() < 0.04 ? 2 : 1.1;
      g.fillRect(x, y, s, s);
    }
    const core = g.createRadialGradient(m, m, 0, m, m, m * 0.24);
    core.addColorStop(0, "rgba(255, 252, 240, 1)"); core.addColorStop(0.3, "rgba(255, 220, 160, .6)"); core.addColorStop(1, "rgba(255, 200, 140, 0)");
    g.fillStyle = core; g.fillRect(0, 0, size, size);
    g.globalCompositeOperation = "destination-out";                 // dark dust lanes along the arms
    for (const arm of [0, 1]) {
      g.strokeStyle = "rgba(0,0,0,.45)"; g.lineWidth = size * 0.014;
      g.beginPath();
      for (let t = 0.12; t <= 1; t += 0.01) { const ang = arm * Math.PI + t * 7.5 + 0.28, r = t * m * 0.94; const x = m + Math.cos(ang) * r, y = m + Math.sin(ang) * r; t === 0.12 ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke();
    }
    return c;
  }
  function makeBlobGalaxy(w, h, hue) {
    const [c, g] = mkCanvas(w, h), gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2);
    gr.addColorStop(0, `hsla(${hue}, 60%, 92%, .95)`); gr.addColorStop(0.35, `hsla(${hue}, 60%, 75%, .4)`); gr.addColorStop(1, "hsla(0,0%,0%,0)");
    g.save(); g.translate(w / 2, h / 2); g.scale(1, h / w); g.translate(-w / 2, -w / 2);
    g.fillStyle = gr; g.fillRect(0, 0, w, w); g.restore();
    return c;
  }
  const Andromeda = makeScene("andromeda", {
    build() {
      const { w, h } = this;
      const [bg, g] = mkCanvas(w, h);
      const gr = g.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.65);
      gr.addColorStop(0, "#120a2a"); gr.addColorStop(0.55, "#070418"); gr.addColorStop(1, "#010006");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.5})`; g.fillRect(Math.random() * w, Math.random() * h, 0.9, 0.9); }
      this.bg = bg;
      this.gal = makeAndromedaGalaxy(Math.round(clamp(Math.max(w, h) * 1.05, 700, 1500)));
      this.m32 = makeBlobGalaxy(90, 80, 40);
      this.m110 = makeBlobGalaxy(170, 70, 35);
      this.stars = Array.from({ length: clamp(Math.round((w * h) / 2600), 260, 700) }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random(), hue: Math.random() < 0.6 ? 220 : 40, tw: rnd(0, TAU), px: null, py: null }));
      this.bright = Array.from({ length: 9 }, () => ({ x: Math.random(), y: Math.random(), s: rnd(5, 12), ph: rnd(0, TAU), hue: Math.random() < 0.5 ? 210 : 30 }));
      this.births = [];
    },
    lite() { this.stars = this.stars.filter((_, i) => i % 2 === 0); },
    tap(x, y, t) { this.births.push({ x, y, t }); Sound.sfx("nova"); },
    draw(t, dt) {
      const { ctx, w, h } = this;
      ctx.drawImage(this.bg, 0, 0, w, h);
      const zoom = 1 + 0.35 * Math.tanh(cam.z * 0.3), px = Math.tanh(-cam.x / 5000) * 60, py = Math.tanh(-cam.y / 5000) * 40;
      const gx = w * 0.5 + px, gy = h * 0.46 + py, S = this.gal.width * zoom;
      this.core = { x: gx, y: gy };
      ctx.globalCompositeOperation = "lighter";
      ctx.save(); ctx.translate(gx, gy); ctx.rotate(-0.58); ctx.scale(1, 0.34); ctx.rotate(t * 0.006);
      ctx.drawImage(this.gal, -S / 2, -S / 2, S, S); ctx.restore();
      ctx.drawImage(this.m32, gx + S * 0.1 - 45 * zoom, gy + S * 0.02 - 40 * zoom, 90 * zoom, 80 * zoom);           // its little companions
      ctx.save(); ctx.translate(gx - S * 0.22, gy - S * 0.13); ctx.rotate(-0.9); ctx.drawImage(this.m110, -85 * zoom, -35 * zoom, 170 * zoom, 70 * zoom); ctx.restore();
      // foreground stars drifting past
      const cx = w / 2, cy = h / 2, span = Math.max(w, h) * 1.2, zShift = cam.z * 0.4 + t * 0.004;
      for (const s of this.stars) {
        const z = 0.05 + mod(s.z - zShift, 1) * 0.95;
        const x = cx + ((mod(s.x * span - cam.x * 0.15 * (1 - z * 0.7), span * 2) - span) / z) * 0.5, y = cy + ((mod(s.y * span - cam.y * 0.15 * (1 - z * 0.7), span * 2) - span) / z) * 0.5;
        const a = Math.min(1, (1 - z) * 1.5) * (0.7 + 0.3 * Math.sin(t * 2 + s.tw)), r = Math.min(3, 1.2 / z * 0.6);
        ctx.fillStyle = `hsla(${s.hue}, 70%, 88%, ${a})`; ctx.fillRect(x - r / 2, y - r / 2, r, r);
      }
      // a few bright stars with diffraction spikes
      for (const b of this.bright) {
        const x = b.x * w + px * 0.5, y = b.y * h + py * 0.5, k = 0.75 + 0.25 * Math.sin(t * 1.8 + b.ph);
        glow(ctx, x, y, b.s * 1.6 * k, `hsla(${b.hue}, 80%, 85%, ALPHA)`, 0.8);
        ctx.strokeStyle = `hsla(${b.hue}, 80%, 90%, ${0.5 * k})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - b.s * 2.5 * k, y); ctx.lineTo(x + b.s * 2.5 * k, y); ctx.moveTo(x, y - b.s * 2.5 * k); ctx.lineTo(x, y + b.s * 2.5 * k); ctx.stroke();
      }
      // star births from taps
      this.births = this.births.filter(bn => {
        const age = t - bn.t; if (age > 2.4) return false;
        const k = age / 2.4;
        glow(ctx, bn.x, bn.y, 20 + k * 160, "hsla(320, 100%, 80%, ALPHA)", 0.8 * (1 - k));
        ctx.strokeStyle = `hsla(${200 + k * 120}, 100%, 85%, ${1 - k})`; ctx.lineWidth = 2 * (1 - k) + 0.5;
        ctx.beginPath(); ctx.arc(bn.x, bn.y, k * 140, 0, TAU); ctx.stroke();
        return true;
      });
      ctx.globalCompositeOperation = "source-over";
    },
  });

  /* ---------------------------------------------------------
     24. WORLDS: channels, portals, comets, supernovas, gravity,
         Big Bang replay, the living Earth, sky view,
         translation and live weather
     --------------------------------------------------------- */
  const GEO = window.GLIMPSE_GEO || { cities: {}, land: null };
  // City name → [lat, lon], from the time zone database
  const CITY_COORDS = (() => { const m = {}; for (const [tz, c] of Object.entries(GEO.cities || {})) m[tz.split("/").pop().replace(/_/g, " ")] = c; return m; })();
  const MY_COORDS = (GEO.cities || {})[MY_TZ] || (MY_PLACE && CITY_COORDS[MY_PLACE.city]) || null;
  const DEG = Math.PI / 180;
  const needServer = () => { if (store?.mode !== "server") { toast("This needs the server. Run Glimpse with “npm start”."); return true; } return false; };

  // Explore row in Discover
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-explore]");
    if (!b) return;
    ({ channels: openChannels, earth: openEarth, sky: openSky, comet: () => openCometSend(), bigbang: startBigBang, gravity: toggleGravity, graffiti: openGraffiti, story: openStory })[b.dataset.explore]?.();
  });
  $("#bigBangBtn").addEventListener("click", startBigBang);

  // ===== Channels: a solar system of public channels =====
  let solar = null;
  async function openChannels() {
    if (needServer()) return;
    $("#channels").hidden = false;
    $("#channelList").innerHTML = `<li class="solar__empty">Charting the system…</li>`;
    const themes = Object.entries(THEMES).filter(([k]) => !["noir", "neotokyo", "andromeda"].includes(k));
    $("#channelThemes").innerHTML = themes.map(([k, n], i) => `<label class="theme-pick"><input type="radio" name="channelTheme" value="${k}" ${i === 3 ? "checked" : ""}><span>${esc(n)}</span></label>`).join("");
    let list = [];
    try { list = await store.channels(); } catch (err) { $("#channelList").innerHTML = `<li class="solar__empty">${esc(err.message)}</li>`; return; }
    $("#channelList").innerHTML = list.map(c => `<li><button type="button" class="channel" data-channel="${esc(c.slug)}">
        <span class="channel__emoji" aria-hidden="true">${esc(c.emoji)}</span>
        <span class="channel__info"><strong>#${esc(c.slug)}</strong><small>${esc(c.description || c.name)}</small></span>
        <span class="channel__stats">${c.here ? `<b>${c.here} here</b>` : ""}${c.today ? `${c.today} today` : `${c.posts} posts`}</span>
      </button></li>`).join("") || `<li class="solar__empty">No channels yet. Start the first one below.</li>`;
    startSolar(list);
  }
  function startSolar(list) {
    const cv = $("#solarCanvas"), dpr = Math.min(devicePixelRatio || 1, 2);
    const W = cv.clientWidth || 600, H = cv.clientHeight || 280;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext("2d");
    const score = c => c.today * 3 + c.here * 5 + c.posts * 0.1 + 1;
    const max = Math.max(...list.map(score), 1);
    const planets = list.map((c, i) => ({ c, r: i ? 9 + 14 * Math.sqrt(score(c) / max) : 26 + 10 * Math.sqrt(score(c) / max),
      orbit: i ? 0.15 + (i / Math.max(1, list.length - 1)) * 0.26 : 0, speed: i ? 0.35 / Math.sqrt(i) : 0, a: hashOf(c.slug) % 628 / 100, hue: hashOf(c.slug) % 360 }));
    solar = { planets, W, H, t0: performance.now(), hit: [] };
    cancelAnimationFrame(solar.raf);
    const frame = () => {
      if ($("#channels").hidden) return;
      const t = (performance.now() - solar.t0) / 1000, cx = W / 2, cy = H / 2;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "#03040f"; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + ((i * 37) % 60) / 100})`; g.fillRect((i * 97) % W, (i * 53) % H, 1, 1); }
      solar.hit = [];
      planets.forEach((p, i) => {
        const a = p.a + t * p.speed * (reduceMotion ? 0 : 1);
        const x = cx + Math.cos(a) * p.orbit * W, y = cy + Math.sin(a) * p.orbit * H * 0.9;
        if (i) { g.strokeStyle = "rgba(150, 180, 255, .12)"; g.beginPath(); g.ellipse(cx, cy, p.orbit * W, p.orbit * H * 0.9, 0, 0, TAU); g.stroke(); }
        const grd = g.createRadialGradient(x - p.r * 0.35, y - p.r * 0.35, p.r * 0.1, x, y, p.r);
        if (!i) { grd.addColorStop(0, "#fff7d6"); grd.addColorStop(0.5, "#ffc34d"); grd.addColorStop(1, "#ff7a1a"); }
        else { grd.addColorStop(0, `hsl(${p.hue}, 70%, 75%)`); grd.addColorStop(1, `hsl(${p.hue}, 60%, 25%)`); }
        if (!i) { g.globalCompositeOperation = "lighter"; glow(g, x, y, p.r * 3, "hsla(40, 100%, 70%, ALPHA)", 0.5 + 0.1 * Math.sin(t * 3)); g.globalCompositeOperation = "source-over"; }
        g.fillStyle = grd; g.beginPath(); g.arc(x, y, p.r, 0, TAU); g.fill();
        g.font = `${Math.round(p.r * 0.9)}px system-ui`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(p.c.emoji, x, y + 1);
        g.font = "600 11px system-ui"; g.fillStyle = "rgba(230, 240, 255, .9)"; g.fillText(`#${p.c.slug}`, x, y + p.r + 11);
        solar.hit.push({ x, y, r: p.r + 8, slug: p.c.slug });
      });
      solar.raf = requestAnimationFrame(frame);
    };
    frame();
  }
  $("#solarCanvas").addEventListener("click", e => {
    const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const p = solar?.hit.find(p => Math.hypot(p.x - x, p.y - y) < p.r);
    if (p) flyToChannel(p.slug);
  });
  $("#channelList").addEventListener("click", e => { const b = e.target.closest("[data-channel]"); if (b) flyToChannel(b.dataset.channel); });
  function flyToChannel(slug) {
    $("#channels").hidden = true;
    if (slug === WALL) return;
    if (reduceMotion || !cards.length) goWall(slug);
    else startFx("hyperspace", null, { dest: `#${slug.toUpperCase()}`, onMid: () => goWall(slug) });
  }
  $("#channelForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (!rulesAccepted()) { openRules(() => $("#channelForm").requestSubmit()); return; }
    try {
      const { wall, hostToken } = await store.createChannel($("#channelName").value, $("#channelEmoji").value, $("#channelDesc").value,
        $("#channelForm input[name=channelTheme]:checked")?.value || "universe");
      ls.set("glimpse:wallHosts", { ...wallHosts(), [wall.slug]: hostToken });
      rememberWall(wall.slug, `#${wall.slug}`, true);
      flyToChannel(wall.slug);
    } catch (err) { $("#channelError").textContent = err.message; }
  });
  $("#channels").addEventListener("click", e => { if (e.target.closest("[data-close]")) $("#channels").hidden = true; });

  // ===== Portals between walls (in the share panel, for hosts) =====
  async function renderPortals() {
    const box = $("#portalsBox");
    box.hidden = !WALL || !wallHostToken() || store?.mode !== "server";
    if (box.hidden) return;
    try {
      const info = await store.wallInfo(WALL);
      $("#portalList").innerHTML = (info.portals || []).map(p => `<li><span>🌀 ${esc(p.name)}</span><button type="button" class="text-btn" data-close-portal="${esc(p.slug)}">Close</button></li>`).join("")
        || `<li class="sheet__fine">No portals yet.</li>`;
    } catch (_) {}
  }
  $("#portalKeyBtn").addEventListener("click", async () => {
    try { $("#portalKey").textContent = (await store.portalKey(WALL)).key; }
    catch (err) { toast(err.message); }
  });
  $("#portalForm").addEventListener("submit", async e => {
    e.preventDefault();
    const link = $("#portalLink").value.trim(), slug = (link.match(/\/w\/([a-z0-9-]{2,24})/) || [])[1] || link.replace(/^#/, "");
    try {
      await store.openPortal(WALL, slug, $("#portalKeyIn").value);
      $("#portalLink").value = $("#portalKeyIn").value = "";
      toast("🌀 Portal open. Posts now flow both ways.");
      renderPortals(); reloadPosts();
    } catch (err) { toast(err.message); }
  });
  $("#portalList").addEventListener("click", async e => {
    const b = e.target.closest("[data-close-portal]");
    if (!b || !confirm("Close this portal?")) return;
    try { await store.closePortal(WALL, b.dataset.closePortal); renderPortals(); reloadPosts(); } catch (err) { toast(err.message); }
  });
  function onPortalEvent(d) { toast(`🌀 A portal opened to ${d.name}. Its posts will drift through.`); reloadPosts(); }

  // ===== Comets: messages in a bottle =====
  let cometReplyTo = null, incoming = null;
  function openCometSend(replyTo = null) {
    if (needServer()) return;
    const go = () => {
      cometReplyTo = replyTo;
      $("#cometTitle").textContent = replyTo ? "Reply to the comet" : "Send a comet";
      $("#cometIntro").textContent = replyTo ? "Your reply flies back across space to whoever sent it." : "Write a message and launch it into deep space. It crashes onto one random stranger's screen somewhere in the world, and if they reply, it comes back to you the same way.";
      $("#cometError").textContent = "";
      $("#cometSend").hidden = false;
      $("#cometText").focus();
    };
    if (rulesAccepted()) go(); else openRules(go);
  }
  $("#cometForm").addEventListener("submit", async e => {
    e.preventDefault();
    const text = $("#cometText").value.trim();
    if (text.length < 2) { $("#cometError").textContent = "Write something to send."; return; }
    try {
      const r = await store.sendComet(text, cometReplyTo);
      $("#cometSend").hidden = true; $("#cometText").value = "";
      launchComet(true);
      toast(r.delivered ? "☄️ Launched! It just crashed onto someone's screen." : "☄️ Launched! It'll find someone as soon as they come online.");
    } catch (err) { $("#cometError").textContent = err.message; }
  });
  $("#cometSend").addEventListener("click", e => { if (e.target.closest("[data-close]")) $("#cometSend").hidden = true; });
  // A comet streaking across the screen (outgoing: away from you; incoming: catch it!)
  function launchComet(outgoing, c = null) {
    if (reduceMotion && outgoing) return;
    const el = document.createElement("button");
    el.type = "button";
    el.className = "comet" + (outgoing ? " comet--out" : "");
    el.setAttribute("aria-label", outgoing ? "Your comet" : "A comet! Tap to catch it");
    el.innerHTML = `<span class="comet__head">☄️</span>`;
    document.body.appendChild(el);
    if (outgoing) { el.addEventListener("animationend", () => el.remove()); return; }
    Sound.sfx("sparkle");
    el.addEventListener("animationend", () => el.classList.add("comet--parked"), { once: true });
    el.addEventListener("click", () => { el.remove(); openCometIn(c); });
  }
  function openCometIn(c) {
    incoming = c;
    Badges.award("comet");
    $("#cometInTitle").textContent = c.reply ? "A reply came back across space" : "A comet crashed into your screen";
    $("#cometFrom").textContent = c.city ? `From someone in ${c.city}, ${c.region}` : "From somewhere out there";
    $("#cometInText").textContent = c.text;
    $("#cometIn").hidden = false;
  }
  $("#cometReply").addEventListener("click", () => { $("#cometIn").hidden = true; openCometSend(incoming.id); });
  $("#cometDrift").addEventListener("click", () => { $("#cometIn").hidden = true; });
  $("#cometReport").addEventListener("click", async () => {
    try { await store.reportComet(incoming.id); toast("Thanks. That comet has been reported."); } catch (err) { toast(err.message); }
    $("#cometIn").hidden = true;
  });
  $("#cometIn").addEventListener("click", e => { if (e.target.closest("[data-close]")) $("#cometIn").hidden = true; });

  // ===== Supernovas =====
  function onSupernova({ id, until }) {
    const p = postById(id);
    if (!p) return;
    Badges.award("supernova");
    p.supernovaUntil = until;
    refreshCards(id);
    computeSuns();
    const pill = $("#newPill");
    pill.textContent = `🌟 SUPERNOVA! ${p.author || "Someone"}'s ${(TYPE_NAMES[p.type] || "post").replace(/^an? /, "")} is blowing up. See it`;
    pill.dataset.live = id; pill.hidden = false;
    clearTimeout(livePillTimer); livePillTimer = setTimeout(() => { pill.hidden = true; }, 10000);
    if (!reduceMotion && !fx && cards.length) startFx("supernova", null, { postId: id });
  }
  EFFECTS.supernova = {
    dur: 2600,
    init(fx) {
      const c = cards.filter(c => c.post.id === fx.opts.postId && c.visible).sort((a, b) => b.w - a.w)[0];
      fx.sx = c ? c.sx + c.w / 2 : vw / 2; fx.sy = c ? c.sy + c.h / 2 : vh / 2;
      for (let i = 0; i < 260; i++) { const a = rnd(0, TAU), sp = rnd(200, 900); fx.parts.push({ x: fx.sx, y: fx.sy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 1.4, g: 0, life: rnd(0.8, 1.8), max: 1.8, h: rnd(30, 60), sat: 100, l: rnd(70, 90), w: 2.4 }); }
    },
    draw(fx, ctx, t, dt) {
      const k = seg(t, 0, 0.5);
      ctx.globalCompositeOperation = "lighter";
      glow(ctx, fx.sx, fx.sy, 60 + k * Math.max(vw, vh), "hsla(45, 100%, 85%, ALPHA)", 0.9 * (1 - k));
      for (const [i, hue] of [[0, 45], [1, 200], [2, 320]]) {
        const q = seg(t, i * 0.08, 0.6 + i * 0.08);
        if (q <= 0 || q >= 1) continue;
        ctx.strokeStyle = `hsla(${hue}, 100%, 75%, ${1 - q})`; ctx.lineWidth = 14 * (1 - q) + 1;
        ctx.beginPath(); ctx.arc(fx.sx, fx.sy, q * Math.hypot(vw, vh), 0, TAU); ctx.stroke();
      }
      stepSparks(fx, ctx, dt, 0);
    },
    card(fx, c, t, bx, by) {                      // the whole wall is shoved outward by the blast, then settles
      const d = Math.hypot(bx - fx.sx, by - fx.sy) || 1, wave = Math.max(0, 1 - Math.abs(t * 1.6 - d / Math.hypot(vw, vh)) * 4);
      return { x: bx + ((bx - fx.sx) / d) * wave * 40, y: by + ((by - fx.sy) / d) * wave * 40, s: c.post.id === fx.opts.postId ? 1 + 0.25 * Math.sin(Math.min(1, t * 2) * Math.PI) : 1, a: 1 };
    },
  };

  // ===== Gravity: popular posts become suns; nearby posts orbit them =====
  state.gravity = false;
  state.sunIds = new Set();
  let gravityT0 = 0;
  function postScore(p) {
    const r = Object.values(p.reactions || {}).reduce((a, b) => a + b, 0);
    return (p.likes || 0) + r + (p.replyCount || 0) * 2 + (isNova(p) ? 50 : 0);
  }
  const isSunCard = c => state.gravity && state.sunIds.has(c.post.id) && c.d0 > 0.75;   // only the copies on the front layers
  function computeSuns() {
    const ranked = state.posts.filter(p => !p.sealed).map(p => [p, postScore(p)]).filter(([, s]) => s >= 3).sort((a, b) => b[1] - a[1]).slice(0, 4);
    state.sunIds = new Set(ranked.map(([p]) => p.id));
    for (const c of cards) c.el.classList.toggle("card--sun", isSunCard(c));
  }
  function toggleGravity() {
    state.gravity = !state.gravity;
    gravityT0 = performance.now() / 1000;
    $("#gravityChip").setAttribute("aria-pressed", String(state.gravity));
    computeSuns();
    if (!state.gravity) render(true);
    toast(state.gravity ? (state.sunIds.size ? "🌀 Gravity on: the most-loved posts pull the others into orbit." : "🌀 Gravity on. Nothing is popular enough to pull yet: like something!") : "Gravity off");
  }
  function applyGravity() {
    const suns = cards.filter(c => c.visible && isSunCard(c));
    if (!suns.length) return;
    const time = performance.now() / 1000 - gravityT0, ramp = smooth(0, 2, time);
    for (const c of cards) {
      if (!c.visible || isSunCard(c)) continue;
      const cx = c.sx + c.w / 2, cy = c.sy + c.h / 2;
      let best = null, bd = Infinity;
      for (const s of suns) {
        const sx = s.sx + s.w / 2, sy = s.sy + s.h / 2, d = Math.hypot(cx - sx, cy - sy), reach = s.w * 3.4;
        if (d < reach && d < bd) { bd = d; best = { s, sx, sy, reach }; }
      }
      if (!best) continue;
      const k = (1 - bd / best.reach) * ramp;
      const ang = Math.atan2(cy - best.sy, cx - best.sx) + (reduceMotion ? 0 : time * (0.12 + k * 0.35) * (c.seed > 0.5 ? 1 : -1));
      const r = bd * (1 - 0.35 * k) + best.s.w * 0.55 * k;
      const nx = best.sx + Math.cos(ang) * r - c.w / 2, ny = best.sy + Math.sin(ang) * r - c.h / 2;
      c.el.style.transform = `translate3d(${nx.toFixed(1)}px, ${ny.toFixed(1)}px, 0) scale(${(c.w / BASE).toFixed(4)})`;
    }
  }
  setInterval(() => { if (state.gravity) computeSuns(); }, 10000);

  // ===== Big Bang: replay the wall's history from its first post =====
  function startBigBang() {
    if (!cards.length) { toast("Nothing to replay yet."); return; }
    if (reduceMotion) { toast("The Big Bang replay is paused in calm mode."); return; }
    startFx("bigbang");
  }
  EFFECTS.bigbang = {
    dur: 12000,
    init(fx) {
      const times = state.posts.map(p => p.createdAt);
      fx.t0 = Math.min(...times); fx.t1 = Math.max(...times, fx.t0 + 1);
      for (let i = 0; i < 400; i++) fx.parts.push({ a: rnd(0, TAU), r: rnd(0, 0.05), sp: rnd(0.2, 1), hue: rnd(180, 320) });
      Sound.sfx("bigbang");
    },
    appear(fx, p) { return 0.06 + ((p.createdAt - fx.t0) / (fx.t1 - fx.t0)) * 0.84; },
    draw(fx, ctx, t, dt) {
      const cx = vw / 2, cy = vh / 2, maxR = Math.hypot(vw, vh) / 2;
      const dark = 1 - seg(t, 0.92, 1);
      ctx.fillStyle = `rgba(2, 1, 10, ${0.88 * dark * (1 - seg(t, 0.05, 0.14) * 0.6)})`; ctx.fillRect(0, 0, vw, vh);   // lifts so the growing wall shows
      ctx.globalCompositeOperation = "lighter";
      if (t < 0.12) glow(ctx, cx, cy, 20 + seg(t, 0, 0.12) * maxR * 1.5, "hsla(45, 100%, 92%, ALPHA)", 1 - seg(t, 0.04, 0.12));
      for (const s of fx.parts) {                                  // the universe expanding
        s.r += dt * 0.12 * s.sp * (1 + (1 - t) * 3);
        const x = cx + Math.cos(s.a) * s.r * maxR, y = cy + Math.sin(s.a) * s.r * maxR;
        if (s.r > 1.2) { s.r = rnd(0, 0.05); continue; }
        ctx.fillStyle = `hsla(${s.hue}, 80%, 80%, ${Math.min(1, s.r * 3) * dark})`; ctx.fillRect(x, y, 1.6, 1.6);
      }
      ctx.globalCompositeOperation = "source-over";
      const when = fx.t0 + (fx.t1 - fx.t0) * clamp((t - 0.06) / 0.84, 0, 1);
      const a = seg(t, 0.04, 0.1) * dark;
      ctx.fillStyle = `rgba(255, 255, 255, ${a})`; ctx.textAlign = "center";
      ctx.font = `800 ${Math.round(Math.min(vw, vh) * 0.07)}px ${getComputedStyle(document.body).fontFamily}`;
      ctx.fillText(new Date(when).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" }), cx, vh - 130);
      ctx.font = `600 13px ${getComputedStyle(document.body).fontFamily}`;
      ctx.fillText(t < 0.06 ? "THE BIG BANG" : "THE WALL IS GROWING · Esc to skip", cx, vh - 104);
      ctx.textAlign = "left";
    },
    card(fx, c, t, bx, by) {
      const ta = EFFECTS.bigbang.appear(fx, c.post) + c.seed * 0.01;
      if (t < ta) return { x: vw / 2, y: vh / 2, s: 0, a: 0 };
      const k = ease.outBack(seg(t, ta, ta + 0.07));
      return { x: vw / 2 + (bx - vw / 2) * k, y: vh / 2 + (by - vh / 2) * k, s: 0.2 + 0.8 * Math.min(1, k), a: Math.min(1, seg(t, ta, ta + 0.02)) };
    },
  };

  // ===== The living Earth =====
  const earth = { open: false, lon: MY_COORDS ? -MY_COORDS[1] : 0, lat: 18, arcs: [], drag: null, sunrise: null };
  const landCells = (() => {
    const out = [];
    if (!GEO.land) return out;
    const raw = atob(GEO.land.bits), w = GEO.land.w, h = GEO.land.h;
    for (let i = 0; i < w * h; i++) if ((raw.charCodeAt(i >> 3) >> (i & 7)) & 1) {
      const lat = 90 - ((Math.floor(i / w) + 0.5) * 180) / h, lon = -180 + ((i % w + 0.5) * 360) / w;
      out.push([lat * DEG, lon * DEG]);
    }
    return out;
  })();
  function subsolar(date) {                                        // where the sun is overhead right now
    const day = (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 0)) / 864e5;
    const decl = -23.44 * Math.cos(TAU * (day + 10) / 365);
    const hours = date.getUTCHours() + date.getUTCMinutes() / 60;
    return [decl * DEG, (180 - hours * 15) * DEG];
  }
  function cityGroups() {
    const m = new Map();
    for (const p of state.posts) if (p.city && CITY_COORDS[p.city]) { const k = p.city; const g = m.get(k) || { city: p.city, region: p.region, n: 0, ll: CITY_COORDS[p.city] }; g.n++; m.set(k, g); }
    return [...m.values()];
  }
  function openEarth() {
    if (!landCells.length) { toast("The globe's map didn't load."); return; }
    $("#earth").hidden = false;
    earth.open = true;
    const groups = cityGroups();
    $("#earthInfo").textContent = groups.length ? `Posts from ${groups.length} cit${groups.length === 1 ? "y" : "ies"} light up the planet. When someone posts live, a beam arcs to you.` : "No places yet. Posts light up the planet as people share them.";
    const cv = $("#earthCanvas"), dpr = Math.min(devicePixelRatio || 1, 2), S = Math.min(cv.clientWidth || 420, 560);
    cv.width = cv.height = S * dpr;
    const g = cv.getContext("2d");
    let last = performance.now();
    const frame = now => {
      if (!earth.open || $("#earth").hidden) { earth.open = false; return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!earth.drag && !reduceMotion) earth.lon += dt * 6;
      let date = new Date();
      if (earth.sunrise) { const k = (now - earth.sunrise.t) / 12000; if (k >= 1) earth.sunrise = null; else date = new Date(earth.sunrise.from + k * 864e5); }
      drawEarth(g, S, dpr, date, now);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  function project(lat, lon, S) {                                  // orthographic projection with the current spin and tilt
    const l = lon + earth.lon * DEG, t = earth.lat * DEG;
    const x = Math.cos(lat) * Math.sin(l), y0 = Math.sin(lat), z0 = Math.cos(lat) * Math.cos(l);
    const y = y0 * Math.cos(t) - z0 * Math.sin(t), z = y0 * Math.sin(t) + z0 * Math.cos(t);
    const R = S * 0.42;
    return { x: S / 2 + x * R, y: S / 2 - y * R, z };
  }
  function drawEarth(g, S, dpr, date, now) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, S, S);
    const R = S * 0.42, [sLat, sLon] = subsolar(date);
    const halo = g.createRadialGradient(S / 2, S / 2, R * 0.9, S / 2, S / 2, R * 1.25);
    halo.addColorStop(0, "rgba(90, 170, 255, .45)"); halo.addColorStop(1, "rgba(90, 170, 255, 0)");
    g.fillStyle = halo; g.fillRect(0, 0, S, S);
    const sea = g.createRadialGradient(S / 2 - R * 0.3, S / 2 - R * 0.3, R * 0.1, S / 2, S / 2, R);
    sea.addColorStop(0, "#1b4a8a"); sea.addColorStop(1, "#06142e");
    g.fillStyle = sea; g.beginPath(); g.arc(S / 2, S / 2, R, 0, TAU); g.fill();
    const light = (lat, lon) => Math.sin(lat) * Math.sin(sLat) + Math.cos(lat) * Math.cos(sLat) * Math.cos(lon - sLon);
    for (const [lat, lon] of landCells) {
      const p = project(lat, lon, S);
      if (p.z <= 0) continue;
      const L = light(lat, lon);
      // the sunrise wave: a golden band where morning is arriving (sun just above the eastern horizon)
      const morning = Math.abs(L) < 0.09 && Math.sin(lon - sLon) < 0;
      g.fillStyle = morning ? "rgba(255, 200, 90, .95)" : L > 0 ? `rgba(120, 220, 160, ${0.45 + L * 0.5})` : "rgba(70, 90, 140, .55)";
      const s = 1.2 + p.z * 1.3;
      g.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    // night shadow
    g.save(); g.beginPath(); g.arc(S / 2, S / 2, R, 0, TAU); g.clip();
    const sp = project(sLat, sLon, S), dx = sp.x - S / 2, dy = sp.y - S / 2, len = Math.hypot(dx, dy) || 1;
    const shade = g.createLinearGradient(S / 2 + (dx / len) * R, S / 2 + (dy / len) * R, S / 2 - (dx / len) * R, S / 2 - (dy / len) * R);
    const front = sp.z > 0;
    shade.addColorStop(0, "rgba(0,0,20,0)"); shade.addColorStop(front ? 0.6 : 0.25, "rgba(0,0,20,0)"); shade.addColorStop(1, "rgba(0,0,25,.55)");
    g.fillStyle = shade; g.fillRect(0, 0, S, S);
    g.restore();
    // city lights where posts come from
    earth.hit = [];
    g.globalCompositeOperation = "lighter";
    for (const c of cityGroups()) {
      const p = project(c.ll[0] * DEG, c.ll[1] * DEG, S);
      if (p.z <= 0.05) continue;
      const r = 4 + Math.min(14, c.n * 2.5);
      glow(g, p.x, p.y, r * (1.6 + 0.2 * Math.sin(now / 300 + c.n)), "hsla(45, 100%, 75%, ALPHA)", 0.95);
      earth.hit.push({ x: p.x, y: p.y, r: r + 6, c });
    }
    drawNewYear(g, S, now);
    // beams arcing in from live posts
    earth.arcs = earth.arcs.filter(a => {
      const k = (now - a.t) / 2600;
      if (k > 1.3) return false;
      g.strokeStyle = `rgba(120, 220, 255, ${Math.min(1, 1.3 - k)})`; g.lineWidth = 2;
      g.beginPath();
      for (let i = 0; i <= 40 * Math.min(1, k); i++) {
        const f = i / 40, lat = a.from[0] + (a.to[0] - a.from[0]) * f, lon = a.from[1] + (a.to[1] - a.from[1]) * f;
        const p = project(lat * DEG, lon * DEG, S), lift = 1 + Math.sin(f * Math.PI) * 0.18;
        const x = S / 2 + (p.x - S / 2) * lift, y = S / 2 + (p.y - S / 2) * lift;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
      return true;
    });
    g.globalCompositeOperation = "source-over";
  }
  const earthCv = $("#earthCanvas");
  earthCv.addEventListener("pointerdown", e => { earth.drag = { x: e.clientX, y: e.clientY, lon: earth.lon, lat: earth.lat, moved: false }; earthCv.setPointerCapture(e.pointerId); });
  earthCv.addEventListener("pointermove", e => {
    if (!earth.drag) return;
    const dx = e.clientX - earth.drag.x, dy = e.clientY - earth.drag.y;
    if (Math.hypot(dx, dy) > 4) earth.drag.moved = true;
    earth.lon = earth.drag.lon + dx * 0.4; earth.lat = clamp(earth.drag.lat + dy * 0.3, -60, 70);
  });
  earthCv.addEventListener("pointerup", e => {
    const d = earth.drag; earth.drag = null;
    if (!d || d.moved) return;
    const r = earthCv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = earth.hit?.find(h => Math.hypot(h.x - x, h.y - y) < h.r);
    if (hit) { $("#earth").hidden = true; earth.open = false; flyToPlace({ region: hit.c.region, city: hit.c.city }); }
  });
  $("#sunriseBtn").addEventListener("click", () => { earth.sunrise = { t: performance.now(), from: Date.now() }; $("#earthInfo").textContent = "Watch the golden line: that's morning arriving, city by city, over the next 24 hours."; });
  $("#earth").addEventListener("click", e => { if (e.target.closest("[data-close]")) { $("#earth").hidden = true; earth.open = false; } });
  function earthArc(post) {
    if (!earth.open || !post.city || !CITY_COORDS[post.city] || !MY_COORDS) return;
    earth.arcs.push({ from: CITY_COORDS[post.city], to: MY_COORDS, t: performance.now() });
  }

  // ===== Sky view: posts hang in the real direction of where they were sent from =====
  const sky = { open: false, heading: 0, pitch: 20, motion: false, stream: null, drag: null, hit: [] };
  const bearing = (a, b) => {                                       // initial great-circle bearing, degrees
    const [la1, lo1, la2, lo2] = [a[0] * DEG, a[1] * DEG, b[0] * DEG, b[1] * DEG];
    const y = Math.sin(lo2 - lo1) * Math.cos(la2), x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(lo2 - lo1);
    return (Math.atan2(y, x) / DEG + 360) % 360;
  };
  const distanceKm = (a, b) => {
    const [la1, lo1, la2, lo2] = [a[0] * DEG, a[1] * DEG, b[0] * DEG, b[1] * DEG];
    return 6371 * 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
  };
  function openSky() {
    sky.open = true;
    $("#sky").hidden = false;
    $("#skyHint").textContent = MY_COORDS ? (matchMedia("(pointer: coarse)").matches ? "Tap “Use motion”, then hold your phone up to the sky." : "Drag to look around.") : "Couldn't tell where you are, so directions start from Greenwich.";
    const cv = $("#skyCanvas"), g = cv.getContext("2d");
    const frame = () => {
      if (!sky.open) return;
      const dpr = Math.min(devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight;
      if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawSky(g, W, H);
      requestAnimationFrame(frame);
    };
    frame();
  }
  function drawSky(g, W, H) {
    const fov = W > H ? 70 : 50, ppd = W / fov, me = MY_COORDS || [51.48, 0];
    const toScreen = (az, alt) => {
      let d = ((az - sky.heading + 540) % 360) - 180;
      return { x: W / 2 + d * ppd, y: H / 2 - (alt - sky.pitch) * ppd, on: Math.abs(d) < fov * 0.75 };
    };
    if (!sky.stream) {
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#02030f"); bg.addColorStop(1, "#0b1838");
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 260; i++) { const az = (i * 137.5) % 360, alt = ((i * 61) % 90) - 5, p = toScreen(az, alt); if (p.on) { g.fillStyle = `rgba(255,255,255,${0.3 + (i % 5) / 8})`; g.fillRect(p.x, p.y, 1.4, 1.4); } }
    } else g.clearRect(0, 0, W, H);
    // horizon and compass
    const hz = toScreen(sky.heading, 0).y;
    g.strokeStyle = "rgba(140, 200, 255, .5)"; g.lineWidth = 1; g.beginPath(); g.moveTo(0, hz); g.lineTo(W, hz); g.stroke();
    g.fillStyle = "rgba(180, 220, 255, .9)"; g.font = "700 14px system-ui"; g.textAlign = "center";
    for (const [az, n] of [[0, "N"], [45, "NE"], [90, "E"], [135, "SE"], [180, "S"], [225, "SW"], [270, "W"], [315, "NW"]]) { const p = toScreen(az, 0); if (p.on) g.fillText(n, p.x, hz + 20); }
    // one marker per city: further away = higher in the sky
    sky.hit = [];
    for (const c of cityGroups()) {
      const km = distanceKm(me, c.ll), az = bearing(me, c.ll), alt = 8 + Math.min(1, km / 20000) * 62;
      const p = toScreen(az, alt);
      if (!p.on) continue;
      const r = 22 + Math.min(18, c.n * 3);
      g.globalCompositeOperation = "lighter"; glow(g, p.x, p.y, r * 1.8, "hsla(45, 100%, 75%, ALPHA)", 0.6); g.globalCompositeOperation = "source-over";
      g.fillStyle = "rgba(10, 18, 40, .85)"; g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.fill();
      g.strokeStyle = "rgba(255, 220, 140, .9)"; g.lineWidth = 2; g.stroke();
      g.fillStyle = "#fff"; g.font = `700 ${Math.round(r * 0.7)}px system-ui`; g.fillText(String(c.n), p.x, p.y + r * 0.25);
      g.font = "600 12px system-ui"; g.fillStyle = "rgba(230, 240, 255, .95)";
      g.fillText(`${c.city} · ${km < 50 ? "right here" : `${Math.round(km).toLocaleString("en")} km`}`, p.x, p.y + r + 16);
      sky.hit.push({ x: p.x, y: p.y, r: r + 8, c });
    }
    g.textAlign = "left";
  }
  const skyCv = $("#skyCanvas");
  skyCv.addEventListener("pointerdown", e => { sky.drag = { x: e.clientX, y: e.clientY, h: sky.heading, p: sky.pitch, moved: false }; });
  skyCv.addEventListener("pointermove", e => {
    if (!sky.drag || sky.motion) return;
    const dx = e.clientX - sky.drag.x, dy = e.clientY - sky.drag.y;
    if (Math.hypot(dx, dy) > 4) sky.drag.moved = true;
    sky.heading = (sky.drag.h - dx * 0.12 + 360) % 360; sky.pitch = clamp(sky.drag.p + dy * 0.12, -10, 85);
  });
  skyCv.addEventListener("pointerup", e => {
    const d = sky.drag; sky.drag = null;
    if (d && d.moved) return;
    const hit = sky.hit.find(h => Math.hypot(h.x - e.clientX, h.y - e.clientY) < h.r);
    if (hit) { closeSky(); flyToPlace({ region: hit.c.region, city: hit.c.city }); }
  });
  function onOrient(e) {
    const heading = e.webkitCompassHeading ?? (e.absolute || e.type === "deviceorientationabsolute" ? (360 - (e.alpha || 0)) % 360 : null);
    if (heading !== null && heading !== undefined) sky.heading = heading;
    if (e.beta !== null) sky.pitch = clamp((e.beta || 0) - 90, -10, 85);
  }
  $("#skyMotion").addEventListener("click", async () => {
    try { if (typeof DeviceOrientationEvent !== "undefined" && DeviceOrientationEvent.requestPermission) { if ((await DeviceOrientationEvent.requestPermission()) !== "granted") throw 0; } }
    catch (_) { toast("Motion access wasn't allowed."); return; }
    sky.motion = true;
    window.addEventListener("deviceorientationabsolute", onOrient);
    window.addEventListener("deviceorientation", onOrient);
    $("#skyHint").textContent = "Point your phone around: posts hang in the direction of their city.";
  });
  $("#skyCamBtn").addEventListener("click", async () => {
    const v = $("#skyCam");
    if (sky.stream) { sky.stream.getTracks().forEach(t => t.stop()); sky.stream = null; v.hidden = true; return; }
    try { sky.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); v.srcObject = sky.stream; v.hidden = false; await v.play(); }
    catch (_) { toast("Couldn't open the camera."); }
  });
  function closeSky() {
    sky.open = false; $("#sky").hidden = true;
    if (sky.stream) { sky.stream.getTracks().forEach(t => t.stop()); sky.stream = null; $("#skyCam").hidden = true; }
    window.removeEventListener("deviceorientationabsolute", onOrient); window.removeEventListener("deviceorientation", onOrient); sky.motion = false;
  }
  $("#skyClose").addEventListener("click", closeSky);

  // ===== Translation (on-device where the browser can, otherwise your translation server) =====
  const MY_LANG = (navigator.language || "en").slice(0, 2);
  function setupTranslate(p) {
    const text = p.text || p.caption || "";
    $("#vTranslation").hidden = true;
    $("#vTranslate").hidden = !text || p.sealed || (store?.mode !== "server" && !("Translator" in window));
    $("#vTranslate").textContent = "🌐 Translate";
    $("#vTranslate").onclick = async () => {
      const box = $("#vTranslation");
      if (!box.hidden) { box.hidden = true; $("#vTranslate").textContent = "🌐 Translate"; return; }
      $("#vTranslate").textContent = "Translating…";
      try {
        let out = null;
        if ("Translator" in window && window.LanguageDetector) {               // Chrome's built-in, private, on-device (best effort)
          try {
            const det = await LanguageDetector.create(); const [{ detectedLanguage: from } = {}] = await det.detect(text);
            if (from && from !== MY_LANG) { const tr = await Translator.create({ sourceLanguage: from, targetLanguage: MY_LANG }); out = { text: await tr.translate(text), from }; }
          } catch (_) { /* no model on this device: ask the server instead */ }
        }
        if (!out) {
          if (store?.mode !== "server") throw new Error("Translation isn't available in this browser.");
          out = await store.translate(text, MY_LANG);
        }
        box.innerHTML = `${esc(out.text)}<small>Translated${out.from ? ` from ${esc(new Intl.DisplayNames([MY_LANG], { type: "language" }).of(out.from) || out.from)}` : ""}</small>`;
        box.hidden = false;
        $("#vTranslate").textContent = "Show original";
      } catch (err) { toast(err.message || "Couldn't translate that."); $("#vTranslate").textContent = "🌐 Translate"; }
    };
  }

  // ===== Live weather from your actual sky (Open-Meteo, free, no key) =====
  const weather = { on: ls.get("glimpse:weather", false), kind: null, day: true, parts: [], raf: 0, flash: 0 };
  const WEATHER_WORDS = { clear: "☀ Clear", clouds: "☁ Cloudy", fog: "🌫 Foggy", rain: "🌧 Rain", snow: "❄ Snow", storm: "⛈ Thunderstorm" };
  const kindOf = code => code === 0 ? "clear" : code <= 3 ? "clouds" : code <= 48 ? "fog" : code <= 67 || (code >= 80 && code <= 82) ? "rain" : code <= 77 || code === 85 || code === 86 ? "snow" : code >= 95 ? "storm" : "clouds";
  async function fetchWeather() {
    if (!weather.on) return;
    if (!MY_COORDS) { $("#weatherLine").textContent = "Couldn't tell where you are for the weather."; $("#weatherLine").hidden = false; return; }
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${MY_COORDS[0]}&longitude=${MY_COORDS[1]}&current=weather_code,is_day,temperature_2m`);
      const d = (await r.json()).current;
      weather.kind = kindOf(d.weather_code); weather.day = !!d.is_day;
      $("#weatherLine").textContent = `${WEATHER_WORDS[weather.kind]}${weather.day ? "" : " · night"} · ${Math.round(d.temperature_2m)}°C${MY_PLACE ? ` in ${MY_PLACE.city}` : ""}. Your wall is showing it.`;
      $("#weatherLine").hidden = false;
      startWeatherFx();
    } catch (_) { $("#weatherLine").textContent = "Couldn't reach the weather service."; $("#weatherLine").hidden = false; }
  }
  function setWeather(on) {
    weather.on = on; ls.set("glimpse:weather", on);
    $("#weatherToggle").setAttribute("aria-checked", String(on));
    if (on) fetchWeather();
    else { $("#weatherLine").hidden = true; $("#weatherFx").hidden = true; cancelAnimationFrame(weather.raf); weather.kind = null; }
  }
  $("#weatherToggle").addEventListener("click", e => { e.stopPropagation(); setWeather(!weather.on); });
  setInterval(fetchWeather, 20 * 60e3);
  function startWeatherFx() {
    const cv = $("#weatherFx"), g = cv.getContext("2d");
    const nightTint = !weather.day && ["light", "gallery", "sakura", "sahara", "dark"].includes(currentTheme());
    cv.hidden = !(weather.kind && weather.kind !== "clear" && weather.kind !== "clouds") && !nightTint;
    if (cv.hidden) return;
    cancelAnimationFrame(weather.raf);
    const n = weather.kind === "snow" ? 160 : weather.kind === "rain" || weather.kind === "storm" ? 260 : 0;
    weather.parts = Array.from({ length: n }, () => ({ x: Math.random(), y: Math.random(), z: rnd(0.4, 1) }));
    let last = performance.now();
    const frame = now => {
      if (!weather.on || cv.hidden) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const W = innerWidth, H = innerHeight;
      if (cv.width !== W) { cv.width = W; cv.height = H; }
      g.clearRect(0, 0, W, H);
      if (nightTint) { g.fillStyle = "rgba(8, 12, 40, .35)"; g.fillRect(0, 0, W, H); }
      if (weather.kind === "fog") { const fg = g.createLinearGradient(0, 0, 0, H); fg.addColorStop(0, "rgba(220,225,235,.05)"); fg.addColorStop(1, "rgba(220,225,235,.35)"); g.fillStyle = fg; g.fillRect(0, 0, W, H); }
      g.strokeStyle = "rgba(190, 210, 240, .45)"; g.fillStyle = "rgba(255,255,255,.85)"; g.lineWidth = 1;
      for (const p of weather.parts) {
        if (weather.kind === "snow") {
          p.y += dt * 0.05 * p.z; p.x += Math.sin(now / 900 + p.z * 10) * dt * 0.01;
          if (p.y > 1) p.y -= 1;
          g.beginPath(); g.arc(p.x * W, p.y * H, 1 + p.z * 2, 0, TAU); g.fill();
        } else {
          p.y += dt * 1.1 * p.z; p.x -= dt * 0.08 * p.z;
          if (p.y > 1) { p.y -= 1; p.x = Math.random() * 1.1; }
          g.beginPath(); g.moveTo(p.x * W, p.y * H); g.lineTo(p.x * W + 3, p.y * H - 16 * p.z); g.stroke();
        }
      }
      if (weather.kind === "storm") {
        if (Math.random() < 0.004) weather.flash = 1;
        if (weather.flash > 0) { g.fillStyle = `rgba(255,255,255,${weather.flash * 0.45})`; g.fillRect(0, 0, W, H); weather.flash = Math.max(0, weather.flash - dt * 3); }
      }
      if (!calm) weather.raf = requestAnimationFrame(frame);
    };
    weather.raf = requestAnimationFrame(frame);
  }
  $("#weatherToggle").setAttribute("aria-checked", String(weather.on));
  setTimeout(fetchWeather, 1500);

  // Animated themes ("scenes") share the background canvas
  const SCENES = { universe: Space, amazon: Jungle, ocean: Ocean, aurora: Aurora, sakura: Sakura, neon: Neon, sahara: Sahara, noir: Noir, neotokyo: NeoTokyo, warp: Warp, andromeda: Andromeda };

  /* ---------------------------------------------------------
     16. TIME CAPSULES
     Sealed posts show a glowing capsule and a countdown. The
     contents arrive only when it opens, then it bursts open.
     --------------------------------------------------------- */
  function sealView(p) {
    if (p.opensAt && p.opensAt > Date.now()) {
      return { id: p.id, type: p.type, author: p.author, createdAt: p.createdAt, opensAt: p.opensAt, sealed: true, likes: p.likes || 0, width: p.width, height: p.height };
    }
    return p;
  }
  function countdown(ts, long) {
    let s = Math.max(0, Math.floor((ts - Date.now()) / 1000));
    if (!s) return "opening…";
    const y = Math.floor(s / 31557600); s -= y * 31557600;
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60), sec = s - m * 60;
    if (y) return `${y}y ${d}d${long ? ` ${h}h` : ""}`;
    if (d) return `${d}d ${h}h${long ? ` ${m}m ${pad2(sec)}s` : ""}`;
    if (h) return `${h}h ${m}m${long ? ` ${pad2(sec)}s` : ""}`;
    return `${m}m ${pad2(sec)}s`;
  }
  const TYPE_NAMES = { photo: "a photo", video: "a video", voice: "a voice note", quote: "a quote", thought: "a thought" };
  function capsuleHTML(p, long = false) {
    return `<div class="capsule">
      <div class="capsule__orb"><svg class="capsule__lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="11" width="12" height="9" rx="2" fill="currentColor" stroke="none"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/></svg></div>
      <p class="capsule__label">Time capsule</p>
      <p class="capsule__count">Opens in <span data-opens="${p.opensAt}"${long ? " data-long" : ""}>${countdown(p.opensAt, long)}</span></p>
      <p class="capsule__by">${esc(TYPE_NAMES[p.type] || "a post")} from ${esc(p.author || "Anonymous")}</p>
    </div>`;
  }

  async function openCapsule(p) {
    let fresh;
    try { fresh = (await store.list()).find(x => x.id === p.id); } catch (_) { return; }
    if (!fresh || fresh.sealed) return;                // server clock may lag a moment; try again soon
    const i = state.posts.indexOf(p);
    if (i >= 0) state.posts[i] = fresh;
    const wasViewing = viewing && viewing.id === p.id;
    buildWall(false);
    if (wasViewing) openViewer(fresh.id);
    else if (!anyModalOpen() && !reduceMotion) {
      glideTo(c => c.post.id === fresh.id, { instant: true });
      startFx("fireworks", "capsule");
    }
    Sound.sfx("capsule");
    toast(`A time capsule from ${fresh.author || "someone"} just opened!`);
  }

  // Every second: tick the countdowns, and open any capsule whose time has come
  setInterval(() => {
    document.querySelectorAll("[data-opens]").forEach(el => { el.textContent = countdown(+el.dataset.opens, el.hasAttribute("data-long")); });
    const now = Date.now();
    for (const p of state.posts) {
      if (p.sealed && p.opensAt <= now && !(p._retry > now)) { p._retry = now + 6000; openCapsule(p); }
    }
  }, 1000);

  // Composer: "Seal as a time capsule"
  const capsuleToggle = $("#capsuleToggle"), capsuleDate = $("#capsuleDate");
  const toLocalInput = ts => { const d = new Date(ts); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  function labelPostBtn() { postBtn.textContent = capsuleToggle.checked ? "Seal time capsule" : "Post to the wall"; }
  capsuleToggle.addEventListener("change", () => {
    $("#capsuleWhen").hidden = !capsuleToggle.checked;
    capsuleDate.min = toLocalInput(Date.now() + 60 * 1000);
    if (capsuleToggle.checked && !capsuleDate.value) {
      const d = new Date(Date.now() + 7 * 864e5); d.setHours(9, 0, 0, 0);
      capsuleDate.value = toLocalInput(d);
    }
    labelPostBtn();
  });
  $("#capsuleQuick").addEventListener("click", e => {
    const b = e.target.closest("[data-in]");
    if (!b) return;
    let d;
    if (b.dataset.in === "newyear") d = new Date(new Date().getFullYear() + 1, 0, 1, 0, 0);
    else if (b.dataset.in === "minute") d = new Date(Date.now() + 70 * 1000);
    else { d = new Date(Date.now() + Number(b.dataset.in) * 864e5); d.setHours(9, 0, 0, 0); }
    capsuleDate.value = toLocalInput(d);
  });

  /* ---------------------------------------------------------
     17. TIMELINE SLIDER
     Drag back through the wall's history: newer posts fade away
     and the whole scene ages into sepia.
     --------------------------------------------------------- */
  const tlRange = $("#tlRange"), tlLabel = $("#tlLabel"), tlGhost = $("#tlGhost"), tlTicks = $("#tlTicks");
  const timeline = { min: Date.now() - 864e5 };
  const rootEl = document.documentElement;
  const tlDate = ts => new Date(ts).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });

  function timelineSetup() {
    if (!state.posts.length) return;
    timeline.min = Math.min(...state.posts.map(p => p.createdAt), Date.now() - 3600e3);
    const span = Date.now() - timeline.min;
    tlTicks.innerHTML = state.posts.map(p =>
      `<i style="left:${(((p.createdAt - timeline.min) / span) * 100).toFixed(2)}%"${p.sealed ? ' class="is-capsule"' : ""}></i>`).join("");
    $("#tlStart").textContent = new Date(timeline.min).toLocaleDateString("en", { day: "numeric", month: "short" });
  }
  function setAge(a) {
    rootEl.style.setProperty("--age", a.toFixed(3));
    rootEl.classList.toggle("aging", a > 0.005);
  }
  function resetTimeline() {
    tlRange.value = 1000;
    tlRange.style.setProperty("--pct", "100%");
    tlRange.setAttribute("aria-valuetext", "Now");
    state.until = null;
    tlLabel.textContent = "Now";
    tlGhost.classList.remove("show");
    setAge(0);
  }
  let lastTick = 0;
  tlRange.addEventListener("input", () => {
    const v = +tlRange.value / 1000;
    tlRange.style.setProperty("--pct", (v * 100).toFixed(1) + "%");
    if (v > 0.995) {
      state.until = null; tlLabel.textContent = "Now"; tlGhost.classList.remove("show"); setAge(0);
    } else {
      state.until = timeline.min + (Date.now() - timeline.min) * v;
      tlLabel.textContent = tlGhost.textContent = tlDate(state.until);
      tlGhost.classList.add("show");
      setAge(Math.min(1, (1 - v) * 1.15));
    }
    tlRange.setAttribute("aria-valuetext", tlLabel.textContent);
    if (performance.now() - lastTick > 70) { lastTick = performance.now(); Sound.sfx("tick"); }
    applyFilter();
  });
  tlRange.addEventListener("change", () => {
    tlGhost.classList.remove("show");
    if (state.until) glideTo(c => !c.el.classList.contains("is-dim"));
  });

  /* ---------------------------------------------------------
     18. AMBIENT SOUND
     Every theme has its own soundscape, made live with the Web
     Audio API (no audio files), plus sounds for the effects.
     Off until the visitor turns it on.
     --------------------------------------------------------- */
  const Sound = (() => {
    let ctx = null, master = null, white = null, brown = null, current = null, currentName = null;
    let ambient = null, ambientLevel = 1;
    let on = ls.get("glimpse:sound", false);
    const btn = $("#soundBtn");
    const hz = m => 440 * Math.pow(2, (m - 69) / 12);
    const pick = a => a[Math.floor(Math.random() * a.length)];

    function ensure() {
      if (ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp); comp.connect(ctx.destination);
      ambient = ctx.createGain(); ambient.gain.value = ambientLevel;   // the theme's soundscape (your song can fade it down)
      ambient.connect(master);
      const buf = kind => {
        const len = ctx.sampleRate * 4, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {
          const w = Math.random() * 2 - 1;
          if (kind === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
        }
        return b;
      };
      white = buf("white"); brown = buf("brown");
      return true;
    }
    const now = () => ctx.currentTime;
    const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const filter = (type, freq, Q = 0.7) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q; return f; };
    const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };
    function noiseSrc(kind) { const s = ctx.createBufferSource(); s.buffer = kind === "brown" ? brown : white; s.loop = true; s.start(now(), Math.random() * 3); return s; }
    function lfo(freq, depth, target) { const o = ctx.createOscillator(); o.frequency.value = freq; const g = gain(depth); o.connect(g); g.connect(target); o.start(); return o; }

    // One note with an envelope
    function note(dest, freq, { type = "sine", vol = 0.2, attack = 0.005, decay = 1.2, at = 0, glideTo = null, filterFreq = null } = {}) {
      const t = now() + at, o = ctx.createOscillator(), g = gain(0);
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + attack + decay * 0.9);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
      if (filterFreq) chain(o, filter("lowpass", filterFreq), g); else o.connect(g);
      g.connect(dest); o.start(t); o.stop(t + attack + decay + 0.05);
      o.onended = () => g.disconnect();
    }
    // A burst of noise (raindrops, crackles, whooshes, booms)
    function burst(dest, { vol = 0.3, decay = 0.2, type = "lowpass", freq = 1000, Q = 0.7, at = 0, sweepTo = null, attack = 0.002, kind = "white" } = {}) {
      const t = now() + at, s = ctx.createBufferSource();
      s.buffer = kind === "brown" ? brown : white;
      const f = filter(type, freq, Q), g = gain(0);
      if (sweepTo) { f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay); }
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
      chain(s, f, g, dest); s.start(t, Math.random() * 2); s.stop(t + attack + decay + 0.05);
      s.onended = () => g.disconnect();
    }
    function bell(dest, f, at = 0, vol = 0.08) {
      note(dest, f, { vol, decay: 2.6, at });
      note(dest, f * 2.76, { vol: vol * 0.5, decay: 1.6, at });
      note(dest, f * 5.4, { vol: vol * 0.25, decay: 0.9, at });
    }

    // A soundscape: a bus that fades in, timers for random events, and a stop() that fades out
    function scape(build) {
      const bus = gain(0), timers = new Set(), nodes = [];
      bus.connect(ambient);
      bus.gain.setValueAtTime(0, now()); bus.gain.linearRampToValueAtTime(1, now() + 2.5);
      const api = {
        bus, alive: true,
        keep(n) { nodes.push(n); return n; },
        every(min, max, fn) {
          const wait = () => {
            const id = setTimeout(() => { timers.delete(id); if (!api.alive) return; fn(); wait(); }, rnd(min, max) * 1000);
            timers.add(id);
          };
          wait();
        },
      };
      build(api);
      return {
        stop() {
          api.alive = false;
          timers.forEach(clearTimeout);
          const t = now();
          bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(bus.gain.value, t); bus.gain.linearRampToValueAtTime(0, t + 1.5);
          setTimeout(() => { nodes.forEach(n => { try { n.stop?.(); } catch (_) {} try { n.disconnect(); } catch (_) {} }); bus.disconnect(); }, 1700);
        },
      };
    }
    // Building blocks
    function bed(a, { kind = "white", type = "lowpass", freq = 800, Q = 0.7, vol = 0.1, swell = 0, swellRate = 0.1, sweep = 0, sweepRate = 0.05 } = {}) {
      const s = a.keep(noiseSrc(kind)), f = a.keep(filter(type, freq, Q)), g = a.keep(gain(vol));
      chain(s, f, g, a.bus);
      if (swell) a.keep(lfo(swellRate, vol * swell, g.gain));
      if (sweep) a.keep(lfo(sweepRate, sweep, f.frequency));
    }
    function pad(a, chords, { type = "sine", vol = 0.04, cutoff = 1200, every = [9, 14] } = {}) {
      const f = a.keep(filter("lowpass", cutoff)), g = a.keep(gain(vol));
      chain(f, g, a.bus);
      a.keep(lfo(0.06, cutoff * 0.3, f.frequency));
      const voices = chords[0].map(m => [-7, 7].map(dt => {
        const o = a.keep(ctx.createOscillator()); o.type = type; o.frequency.value = hz(m); o.detune.value = dt; o.connect(f); o.start(); return o;
      }));
      let ci = 0;
      if (chords.length > 1) a.every(every[0], every[1], () => {
        ci = (ci + 1) % chords.length;
        chords[ci].forEach((m, i) => voices[i].forEach(o => o.frequency.setTargetAtTime(hz(m), now(), 1.2)));
      });
    }
    function drone(a, freqs, { type = "sawtooth", vol = 0.03, cutoff = 300 } = {}) {
      const f = a.keep(filter("lowpass", cutoff)), g = a.keep(gain(vol));
      chain(f, g, a.bus);
      a.keep(lfo(0.05, cutoff * 0.4, f.frequency));
      freqs.forEach(fr => { const o = a.keep(ctx.createOscillator()); o.type = type; o.frequency.value = fr; o.connect(f); o.start(); });
    }
    const chirp = d => { const f = rnd(4200, 5200); for (let k = 0; k < 3; k++) note(d, f, { vol: 0.012, attack: 0.004, decay: 0.035, at: k * 0.06 }); };
    const croak = d => { const f0 = rnd(110, 210), n = 2 + Math.floor(Math.random() * 3); for (let k = 0; k < n; k++) note(d, f0, { type: "sawtooth", vol: 0.05, attack: 0.01, decay: 0.12, at: k * 0.17, filterFreq: 650, glideTo: f0 * 0.85 }); };
    const bubble = d => note(d, rnd(350, 600), { vol: 0.035, attack: 0.003, decay: 0.09, glideTo: rnd(1100, 1800) });
    const whale = d => note(d, rnd(190, 240), { vol: 0.035, attack: 0.9, decay: 3.2, glideTo: rnd(110, 140) });
    const crackle = (d, vol = 0.05) => burst(d, { type: "highpass", freq: 2500, decay: 0.012, vol: rnd(vol * 0.3, vol) });
    function sax(dest) {                              // a lonely, muted horn
      const blues = [58, 60, 63, 65, 66, 67, 70, 72];
      const o = ctx.createOscillator(), g = gain(0), vib = ctx.createOscillator(), vg = gain(5);
      o.type = "sawtooth"; vib.frequency.value = 5.2; vib.connect(vg); vg.connect(o.frequency);
      chain(o, filter("lowpass", 1500), filter("bandpass", 900, 1.1), g, dest);
      let t = now() + 0.05, m = pick(blues);
      const n = 3 + Math.floor(Math.random() * 3);
      o.frequency.setValueAtTime(hz(m), t);
      for (let i = 0; i < n; i++) {
        const d = rnd(0.35, 0.9);
        o.frequency.setTargetAtTime(hz(m), t, 0.05);
        g.gain.setTargetAtTime(0.16, t, 0.07); g.gain.setTargetAtTime(0.09, t + d * 0.6, 0.12);
        t += d;
        m = pick(blues.filter(x => Math.abs(x - m) <= 5 && x !== m));
      }
      g.gain.setTargetAtTime(0, t, 0.3);
      o.start(); vib.start(); o.stop(t + 1.6); vib.stop(t + 1.6);
      o.onended = () => g.disconnect();
    }
    const chords = list => list;

    const SCAPES = {
      light: a => { pad(a, chords([[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]]), { vol: 0.03, cutoff: 1500 }); a.every(4, 9, () => note(a.bus, hz(pick([72, 74, 76, 79, 81])), { vol: 0.025, decay: 2.6 })); },
      dark: a => { pad(a, chords([[45, 52, 57], [41, 48, 57], [43, 50, 55]]), { type: "triangle", vol: 0.035, cutoff: 700 }); bed(a, { kind: "brown", freq: 220, vol: 0.05 }); },
      gallery: a => {
        bed(a, { kind: "brown", freq: 320, vol: 0.05 });
        pad(a, chords([[60, 67, 76], [57, 64, 72], [62, 69, 74]]), { vol: 0.018, cutoff: 1800, every: [12, 18] });
        a.every(8, 16, () => { for (let k = 0; k < 4; k++) burst(a.bus, { kind: "brown", freq: 180, decay: 0.08, vol: 0.12, at: k * 0.55 }); });   // distant footsteps
      },
      universe: a => {
        drone(a, [55, 55.3, 82.5], { cutoff: 260, vol: 0.035 });
        pad(a, chords([[69, 76, 81], [67, 74, 79], [65, 72, 81]]), { vol: 0.02, cutoff: 2500 });
        a.every(1, 3.5, () => note(a.bus, rnd(1400, 3200), { vol: 0.012, decay: 1.6 }));
      },
      amazon: a => { bed(a, { kind: "brown", freq: 400, vol: 0.06 }); a.every(0.15, 0.6, () => chirp(a.bus)); a.every(1.2, 4, () => croak(a.bus)); },
      ocean: a => { bed(a, { kind: "brown", freq: 260, vol: 0.16, swell: 0.6, swellRate: 0.08 }); a.every(0.3, 1.6, () => bubble(a.bus)); a.every(14, 26, () => whale(a.bus)); },
      aurora: a => {
        bed(a, { type: "bandpass", freq: 600, Q: 1.4, vol: 0.06, sweep: 300, sweepRate: 0.07, swell: 0.5, swellRate: 0.05 });
        pad(a, chords([[64, 71, 76], [62, 69, 74], [60, 67, 76]]), { vol: 0.025, cutoff: 2600 });
        a.every(2, 5, () => note(a.bus, hz(pick([83, 86, 88, 91])), { vol: 0.012, decay: 2 }));
      },
      sakura: a => {
        bed(a, { type: "bandpass", freq: 500, Q: 0.8, vol: 0.03, sweep: 200, swell: 0.6, swellRate: 0.06 });
        const hira = [62, 63, 67, 69, 70, 74, 75, 79];        // a Japanese scale, for koto-like plucks
        a.every(0.8, 3, () => { note(a.bus, hz(pick(hira)), { type: "triangle", vol: 0.07, decay: 1.6, filterFreq: 2600 }); if (Math.random() < 0.3) note(a.bus, hz(pick(hira)), { type: "triangle", vol: 0.05, decay: 1.4, filterFreq: 2600, at: 0.18 }); });
        a.every(9, 16, () => [0, 0.12, 0.27].forEach(at => bell(a.bus, hz(pick([86, 88, 91, 93])), at, 0.025)));
      },
      neon: a => {
        bed(a, { type: "highpass", freq: 1200, vol: 0.05 });
        pad(a, chords([[45, 52, 57], [41, 48, 55], [43, 50, 57], [40, 47, 55]]), { type: "sawtooth", vol: 0.02, cutoff: 900, every: [7.7, 7.7] });
        const bass = [33, 33, 29, 31]; let i = 0;
        a.every(0.48, 0.48, () => note(a.bus, hz(bass[Math.floor(i++ / 16) % 4]), { type: "square", vol: 0.04, decay: 0.3, filterFreq: 320 }));
      },
      sahara: a => {
        bed(a, { type: "bandpass", freq: 420, Q: 0.8, vol: 0.06, sweep: 220, sweepRate: 0.05, swell: 0.6, swellRate: 0.07 });
        drone(a, [73.4, 110], { type: "sine", vol: 0.03, cutoff: 600 });
        a.every(0.04, 0.35, () => crackle(a.bus, 0.06));      // the campfire
        const scale = [62, 63, 66, 67, 69, 70, 72];
        a.every(4, 9, () => [0, 0.22, 0.44].forEach(at => note(a.bus, hz(pick(scale)), { type: "triangle", vol: 0.05, decay: 0.9, filterFreq: 1800, at })));
      },
      noir: a => {
        bed(a, { type: "bandpass", freq: 2500, Q: 0.5, vol: 0.08 });                       // rain
        bed(a, { kind: "brown", freq: 150, vol: 0.04 });
        a.every(0.03, 0.3, () => crackle(a.bus, 0.035));                                     // vinyl crackle
        a.every(7, 14, () => sax(a.bus));
      },
      andromeda: a => {
        drone(a, [43.65, 65.4], { type: "sine", vol: 0.05, cutoff: 400 });
        pad(a, [[62, 69, 74], [60, 67, 76], [57, 64, 72]], { vol: 0.022, cutoff: 2800, every: [10, 16] });   // a distant choir
        a.every(1.5, 4, () => note(a.bus, rnd(1600, 3400), { vol: 0.012, decay: 2 }));
      },
      warp: a => {
        drone(a, [41.2, 55, 82.4], { type: "sawtooth", vol: 0.035, cutoff: 240 });          // the engines
        bed(a, { kind: "brown", freq: 180, vol: 0.06, swell: 0.4, swellRate: 0.12 });
        a.every(7, 15, () => [0, 0.14].forEach((at, i) => note(a.bus, hz(i ? 88 : 81), { vol: 0.02, decay: 0.18, at })));   // cockpit beeps
        a.every(22, 34, () => burst(a.bus, { type: "bandpass", freq: 300, sweepTo: 4500, Q: 1.4, attack: 1.4, decay: 1.6, vol: 0.09 }));   // wormholes
      },
      neotokyo: a => {
        bed(a, { kind: "brown", freq: 160, vol: 0.07 });
        pad(a, chords([[57, 64, 69], [53, 60, 69], [55, 62, 67]]), { type: "sawtooth", vol: 0.018, cutoff: 1500 });
        const seq = [69, 72, 76, 79, 81, 79, 76, 72]; let i = 0;
        a.every(0.14, 0.14, () => note(a.bus, hz(seq[i++ % seq.length] + (Math.floor(i / 32) % 2 ? -2 : 0)), { type: "square", vol: 0.018, decay: 0.16, filterFreq: 2200 }));
        a.every(11, 20, () => burst(a.bus, { type: "bandpass", freq: 300, sweepTo: 2600, Q: 1.5, attack: 0.8, decay: 1.4, vol: 0.07 }));   // a train passing
        a.every(24, 40, () => { note(a.bus, 90, { type: "sawtooth", vol: 0.03, attack: 0.4, decay: 1.6, glideTo: 60, filterFreq: 420 }); note(a.bus, 135, { type: "sawtooth", vol: 0.015, attack: 0.5, decay: 1.4, glideTo: 90, filterFreq: 380 }); });   // a dragon calls far away
      },
    };

    // Sound effects for the visual effects
    const boom = (at, vol) => { burst(master, { kind: "brown", freq: 380, decay: 1.3, vol, at }); burst(master, { type: "highpass", freq: 1600, decay: 0.15, vol: vol * 0.35, at }); };
    const SFX = {
      fireworks() {
        note(master, 700, { vol: 0.03, attack: 0.05, decay: 0.4, glideTo: 2200 });
        boom(0.44, 0.5);
        [0.94, 1.17, 1.43, 1.64].forEach(at => boom(at, 0.2));
        for (let k = 0; k < 30; k++) burst(master, { type: "highpass", freq: 3000, decay: 0.02, vol: rnd(0.03, 0.09), at: rnd(0.6, 2.4) });
      },
      wormhole() {
        burst(master, { type: "bandpass", freq: 200, sweepTo: 4000, Q: 3, attack: 0.5, decay: 0.8, vol: 0.25 });
        burst(master, { type: "bandpass", freq: 4000, sweepTo: 220, Q: 3, attack: 0.3, decay: 1, vol: 0.2, at: 1.25 });
        note(master, 110, { vol: 0.06, attack: 0.6, decay: 1.8, glideTo: 880 });
      },
      blackhole() {
        note(master, 90, { type: "sawtooth", vol: 0.09, attack: 0.9, decay: 0.7, glideTo: 28, filterFreq: 300 });
        burst(master, { type: "bandpass", freq: 3000, sweepTo: 120, Q: 2, attack: 1.3, decay: 0.3, vol: 0.3 });
        boom(1.65, 0.8);
        note(master, 1200, { vol: 0.03, decay: 2.2, at: 1.7 });
      },
      timewarp(opts = {}) {
        const fwd = (opts.dir || 1) > 0;
        let t = 0, gap = 0.22;
        while (t < 1.15) { burst(master, { type: "highpass", freq: 3200, decay: 0.015, vol: 0.09, at: t }); t += gap; gap = Math.max(0.03, gap * 0.82); }
        burst(master, { type: "bandpass", freq: fwd ? 300 : 5000, sweepTo: fwd ? 5000 : 300, Q: 2, attack: 0.9, decay: 0.5, vol: 0.25 });
        bell(master, hz(fwd ? 84 : 60), 1.2, 0.1);
      },
      capsule() { [72, 76, 79, 84, 88].forEach((m, i) => note(master, hz(m), { type: "triangle", vol: 0.08, decay: 1.4, at: i * 0.09 })); },
      seal() { note(master, hz(55), { type: "triangle", vol: 0.12, decay: 0.5 }); burst(master, { type: "highpass", freq: 2000, decay: 0.06, vol: 0.15, at: 0.02 }); bell(master, hz(79), 0.15, 0.04); },
      tick() { burst(master, { type: "highpass", freq: 3800, decay: 0.012, vol: 0.06 }); },
      hyperspace() {
        note(master, 70, { type: "sawtooth", vol: 0.07, attack: 0.5, decay: 0.2, glideTo: 420, filterFreq: 900 });   // engines spool up
        boom(0.58, 0.55);                                                                                        // the jump
        burst(master, { type: "bandpass", freq: 400, sweepTo: 6000, Q: 1.5, attack: 0.9, decay: 0.9, vol: 0.22, at: 0.6 });  // the tunnel
        bell(master, hz(84), 2.35, 0.08); bell(master, hz(88), 2.45, 0.05);                                      // arrival
      },
      devourer() {
        const growl = (at, f) => { note(master, f, { type: "sawtooth", vol: 0.09, attack: 0.3, decay: 1.2, glideTo: f * 0.7, filterFreq: 260, at }); note(master, f * 1.5, { type: "sawtooth", vol: 0.04, attack: 0.3, decay: 1.1, glideTo: f, filterFreq: 220, at }); };
        burst(master, { kind: "brown", freq: 120, attack: 0.6, decay: 1.6, vol: 0.4 });       // it rises
        growl(0.3, 55); growl(1.4, 48);
        burst(master, { type: "bandpass", freq: 2000, sweepTo: 150, Q: 2, attack: 0.9, decay: 0.4, vol: 0.18, at: 1.4 });  // the pull
        for (let k = 0; k < 4; k++) burst(master, { type: "lowpass", freq: 900, decay: 0.08, vol: 0.35, at: 2.98 + k * 0.07 });  // CHOMP
        boom(3.0, 0.6);
        note(master, 180, { vol: 0.12, attack: 0.02, decay: 0.5, glideTo: 50, at: 3.25 });   // gulp
      },
      bigbang() {
        boom(0, 0.9);
        note(master, 40, { type: "sawtooth", vol: 0.06, attack: 2, decay: 9, glideTo: 220, filterFreq: 900 });
        [48, 55, 60, 64, 67].forEach((m, i) => note(master, hz(m), { type: "triangle", vol: 0.025, attack: 2.5, decay: 8, at: 1 + i * 0.4 }));   // a chord opens as the wall grows
      },
      camelJump() { note(master, hz(72), { type: "square", vol: 0.04, attack: 0.005, decay: 0.12, glideTo: hz(84), filterFreq: 3000 }); },
      camelKneel() { burst(master, { type: "lowpass", freq: 900, attack: 0.01, decay: 0.12, vol: 0.12 }); },
      camelPoint() { [84, 91].forEach((m, i) => note(master, hz(m), { type: "square", vol: 0.035, decay: 0.12, at: i * 0.09, filterFreq: 3500 })); },
      camelCharge() { note(master, 200, { type: "sawtooth", vol: 0.03, attack: 0.6, decay: 0.2, glideTo: 900, filterFreq: 2400 }); },
      camelLaser() { note(master, 1500, { type: "square", vol: 0.05, attack: 0.005, decay: 0.25, glideTo: 220, filterFreq: 4000 }); },
      camelAbduct() { for (let k = 0; k < 8; k++) note(master, 300 + k * 60, { type: "sine", vol: 0.05, attack: 0.02, decay: 0.2, at: k * 0.11, glideTo: 380 + k * 80 }); },
      planes() { burst(master, { type: "bandpass", freq: 1800, sweepTo: 600, Q: 2, attack: 0.05, decay: 0.5, vol: 0.12 }); [76, 81, 84, 88].forEach((m, i) => note(master, hz(m), { type: "triangle", vol: 0.04, decay: 0.4, at: 0.3 + i * 0.1 })); },
      boo() { note(master, 400, { type: "sine", vol: 0.08, attack: 0.05, decay: 0.8, glideTo: 220 }); [0, 0.12, 0.24].forEach(at => note(master, 900, { type: "triangle", vol: 0.03, decay: 0.1, at: 0.6 + at, glideTo: 1100 })); },
      alarm() { for (let k = 0; k < 6; k++) note(master, k % 2 ? 660 : 880, { type: "square", vol: 0.04, decay: 0.22, at: k * 0.25, filterFreq: 2500 }); },
      frogChoir() {
        const tune = [64, 67, 69, 67, 64, 62, 64, 60, 64, 67, 69, 72, 71, 67, 69, 64, 62, 64, 67, 69, 72, 74, 72, 69, 67, 64, 67, 72, 76, 72, 76, 79];
        tune.forEach((m, i) => { note(master, hz(m - 12), { type: "square", vol: 0.04, attack: 0.01, decay: 0.16, filterFreq: 1100, at: i * 0.25 }); note(master, hz(m - 12) * 1.5, { type: "sawtooth", vol: 0.015, decay: 0.12, filterFreq: 700, at: i * 0.25 }); });
      },
      whale() { [[220, 140, 0], [180, 260, 3.2], [240, 120, 6.5], [160, 230, 10]].forEach(([a, b, at]) => { note(master, a, { type: "sine", vol: 0.07, attack: 0.8, decay: 2.6, glideTo: b, at }); note(master, a * 2.01, { type: "sine", vol: 0.02, attack: 0.9, decay: 2.2, glideTo: b * 2, at }); }); },
      festival() { [67, 69, 72, 74, 76, 79, 81, 84].forEach((m, i) => note(master, hz(m), { type: "triangle", vol: 0.035, decay: 1.6, at: 0.3 + i * 0.45 })); },
      turbo() { const arp = [57, 64, 69, 72, 76, 72, 69, 64]; for (let k = 0; k < 24; k++) note(master, hz(arp[k % 8]), { type: "sawtooth", vol: 0.03, decay: 0.12, filterFreq: 2600, at: k * 0.11 }); [69, 72, 76].forEach(m => note(master, hz(m), { type: "sawtooth", vol: 0.025, attack: 0.05, decay: 1.6, filterFreq: 1800, at: 2.7 })); },
      jazz() { [[45, 0], [48, 0.3], [50, 0.6], [52, 0.9]].forEach(([m, at]) => note(master, hz(m), { type: "triangle", vol: 0.08, decay: 0.28, at })); [[64, 67, 71, 74]].forEach(ch => ch.forEach(m => note(master, hz(m), { type: "triangle", vol: 0.025, attack: 0.02, decay: 1.4, at: 1.2 }))); },
      fourGods() { [48, 55, 60, 64, 67, 72].forEach((m, i) => note(master, hz(m), { type: "sawtooth", vol: 0.025, attack: 1.5, decay: 6, filterFreq: 1400, at: i * 0.3 })); boom(11.8, 0.7); },
      static() { burst(master, { type: "highpass", freq: 2500, attack: 0.05, decay: 1.4, vol: 0.12 }); },
      beep() { note(master, 1320, { type: "square", vol: 0.012, decay: 0.03, filterFreq: 4000 }); },
      anglerSnap() { burst(master, { type: "lowpass", freq: 700, attack: 0.01, decay: 0.12, vol: 0.4 }); note(master, 160, { type: "sine", vol: 0.12, attack: 0.01, decay: 0.4, glideTo: 55, at: 0.08 }); for (let k = 0; k < 5; k++) setTimeout(() => bubble(master), 150 + k * 80); },
      inkPuff() { burst(master, { type: "bandpass", freq: 500, sweepTo: 1600, Q: 1, attack: 0.05, decay: 0.8, vol: 0.14 }); },
      dragon(o = {}) {
        note(master, 70, { type: "sawtooth", vol: 0.1, attack: 0.08, decay: 1.2, glideTo: 46, filterFreq: 380 });      // the roar
        note(master, 105, { type: "sawtooth", vol: 0.05, attack: 0.1, decay: 1, glideTo: 70, filterFreq: 300 });
        if (o.el === "fire") { burst(master, { type: "bandpass", freq: 900, sweepTo: 2600, Q: 0.8, attack: 0.1, decay: 1.1, vol: 0.2 }); for (let k = 0; k < 6; k++) burst(master, { type: "highpass", freq: 3000, decay: 0.03, vol: 0.08, at: 0.15 + k * 0.12 }); }
        if (o.el === "water") burst(master, { type: "bandpass", freq: 2400, sweepTo: 400, Q: 1.2, attack: 0.05, decay: 1.3, vol: 0.2 });
        if (o.el === "earth") { burst(master, { kind: "brown", freq: 200, attack: 0.05, decay: 1.6, vol: 0.45 }); boom(0.1, 0.4); }
        if (o.el === "wind") burst(master, { type: "bandpass", freq: 600, sweepTo: 3800, Q: 4, attack: 0.3, decay: 1.4, vol: 0.18 });
      },
      warpBurst() {
        boom(0, 0.7);
        note(master, 60, { type: "sawtooth", vol: 0.08, attack: 0.05, decay: 1.1, glideTo: 900, filterFreq: 1600 });
        burst(master, { type: "bandpass", freq: 300, sweepTo: 6000, Q: 1.2, attack: 0.4, decay: 1.2, vol: 0.2 });
      },
      warpArrive() {
        burst(master, { type: "bandpass", freq: 5000, sweepTo: 300, Q: 1, attack: 0.05, decay: 1.4, vol: 0.12 });
        [72, 79, 84, 88].forEach((m, i) => note(master, hz(m), { type: "triangle", vol: 0.06, decay: 1.8, at: 0.3 + i * 0.12 }));
      },
      warpTap() {
        note(master, 90, { type: "sawtooth", vol: 0.05, attack: 0.25, decay: 0.5, glideTo: 520, filterFreq: 1200 });
        burst(master, { type: "bandpass", freq: 600, sweepTo: 5000, Q: 1.3, attack: 0.3, decay: 0.8, vol: 0.14 });
      },
      soundwave() { for (let i = 0; i < 6; i++) note(master, hz(48 + [0, 7, 12, 7, 12, 19][i]), { type: "sine", vol: 0.07, attack: 0.01, decay: 0.5, at: i * 0.29 }); },
      arrive() { [79, 84].forEach((m, i) => note(master, hz(m), { type: "triangle", vol: 0.05, decay: 0.9, at: i * 0.08 })); },
      croak() { croak(master); },
      bubbles() { for (let k = 0; k < 7; k++) setTimeout(() => bubble(master), k * 70); },
      sparkle() { [88, 91, 95].forEach((m, i) => note(master, hz(m), { vol: 0.03, decay: 0.8, at: i * 0.06 })); },
      petals() { burst(master, { type: "bandpass", freq: 900, sweepTo: 2400, Q: 1, attack: 0.15, decay: 0.6, vol: 0.06 }); [86, 90].forEach((m, i) => note(master, hz(m), { type: "triangle", vol: 0.03, decay: 1.1, at: 0.1 + i * 0.12 })); },
      nova() { note(master, 220, { vol: 0.05, attack: 0.02, decay: 1.6, glideTo: 880 }); bell(master, hz(91), 0.05, 0.03); },
      thunder() { burst(master, { kind: "brown", freq: 300, decay: 2.4, vol: 0.5, attack: 0.05 }); burst(master, { type: "highpass", freq: 2000, decay: 0.25, vol: 0.15 }); },
    };

    function play(theme) {
      if (!on || !ctx) return;
      if (theme === currentName && current) return;
      current?.stop();
      currentName = theme;
      current = scape(SCAPES[theme] || SCAPES.light);
    }
    function sfx(name, opts) {
      try { buzz(name); } catch (_) {}
      if (!on || !ctx || ctx.state !== "running") return;
      SFX[name]?.(opts);
    }
    function updateBtn() {
      btn.setAttribute("aria-pressed", String(on));
      btn.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on");
      btn.classList.toggle("is-on", on);
    }
    function wake() {
      if (!ensure()) return false;
      ctx.resume();
      master.gain.setTargetAtTime(0.7, now(), 0.4);
      play(currentTheme());
      return true;
    }
    function setOn(v) {
      on = v;
      ls.set("glimpse:sound", v);
      updateBtn();
      if (v) { if (!wake()) { toast("Sound isn't supported in this browser."); on = false; updateBtn(); } }
      else if (ctx) {
        master.gain.setTargetAtTime(0, now(), 0.25);
        setTimeout(() => { if (!on) { current?.stop(); current = null; currentName = null; ctx.suspend(); } }, 1500);
      }
      listeners.forEach(fn => fn(on));
    }
    const listeners = [];
    function setAmbient(level) {                        // 0 = silence the theme's soundscape, 1 = full
      ambientLevel = level;
      if (ambient) ambient.gain.setTargetAtTime(level, now(), 0.8);
    }
    btn.addEventListener("click", () => setOn(!on));
    // Browsers only allow sound after a tap or key press, so resume on the first one
    const first = () => { if (on && (!ctx || ctx.state !== "running")) wake(); };
    window.addEventListener("pointerdown", first, { once: true });
    window.addEventListener("keydown", first, { once: true });
    updateBtn();
    return { play, sfx, setAmbient, isOn: () => on, enable: () => { if (!on) setOn(true); }, onToggle: fn => listeners.push(fn) };
  })();


  /* ---------------------------------------------------------
     25. YOUR THEME SONG: music from your own device, stored
         only on this device (IndexedDB), never uploaded
     --------------------------------------------------------- */
  const Songs = (() => {
    const DB = "glimpse-music", STORE = "songs", MAX_MB = 60;
    let db = null;
    const open = () => db ? Promise.resolve(db) : new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => { db = r.result; res(db); };
      r.onerror = () => rej(r.error);
    });
    const tx = async (mode, fn) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction(STORE, mode), q = fn(t.objectStore(STORE)); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); }); };
    const get = slot => tx("readonly", s => s.get(slot)).catch(() => null);
    const put = (slot, rec) => tx("readwrite", s => s.put(rec, slot));
    const del = slot => tx("readwrite", s => s.delete(slot));

    const audio = new Audio();
    audio.loop = true;
    audio.preload = "auto";
    let vol = ls.get("glimpse:songVol", 0.6), mix = ls.get("glimpse:songMix", false), playing = ls.get("glimpse:songOn", true);
    let loadedSlot = null, url = null, fadeT = 0;
    audio.volume = 0;

    const fadeTo = (target, ms, then) => {
      clearInterval(fadeT);
      const from = audio.volume, start = performance.now();
      fadeT = setInterval(() => {
        const k = Math.min(1, (performance.now() - start) / ms);
        audio.volume = from + (target - from) * k;
        if (k >= 1) { clearInterval(fadeT); then?.(); }
      }, 40);
    };
    // Which song belongs to this theme: its own, else the one for every theme
    async function songFor(theme) {
      const own = await get(`theme:${theme}`);
      if (own) return { slot: `theme:${theme}`, rec: own };
      const all = await get("all");
      return all ? { slot: "all", rec: all } : null;
    }
    async function update() {
      const pick = await songFor(currentTheme());
      const audible = pick && playing && Sound.isOn();
      if (!pick) { stop(); return; }
      if (pick.slot !== loadedSlot) {                     // a different song: fade out, swap, fade in
        const swap = () => {
          if (url) URL.revokeObjectURL(url);
          url = URL.createObjectURL(pick.rec.blob);
          audio.src = url; loadedSlot = pick.slot;
          if (audible) audio.play().then(() => fadeTo(vol, 1200)).catch(() => {});
        };
        if (!audio.paused && audio.volume > 0.02) fadeTo(0, 700, swap); else swap();
      } else if (audible && audio.paused) audio.play().then(() => fadeTo(vol, 900)).catch(() => {});
      else if (!audible && !audio.paused) fadeTo(0, 500, () => audio.pause());
      Sound.setAmbient(audible && !mix ? 0 : 1);
      renderNow(pick);
    }
    function stop() {
      if (!audio.paused) fadeTo(0, 500, () => audio.pause());
      loadedSlot = null;
      Sound.setAmbient(1);
      renderNow(null);
    }
    function renderNow(pick) {
      const now = $("#songNow");
      if (!now) return;
      now.textContent = !pick ? "Choose a song to start." : !Sound.isOn() ? `“${pick.rec.name}” (turn sound on to hear it)` : playing ? `Now playing “${pick.rec.name}”` : `Paused: “${pick.rec.name}”`;
      $("#songPlay").textContent = playing && pick && Sound.isOn() ? "❚❚ Pause" : "▶ Play";
    }
    async function renderPanel() {
      const theme = currentTheme(), name = THEMES[theme] || "this theme";
      $("#songs .songslot__theme").textContent = name;
      for (const el of $$("#songs .songslot")) {
        const slot = el.dataset.slot === "all" ? "all" : `theme:${theme}`, rec = await get(slot);
        el.querySelector(".songslot__name").textContent = rec ? `🎵 ${rec.name}` : el.dataset.slot === "all" ? "No song yet" : "No song yet: it plays the one above";
        el.querySelector(".songslot__remove").hidden = !rec;
        el.dataset.key = slot;
      }
      $("#songVol").value = vol; $("#songMix").checked = mix;
      renderNow(await songFor(theme));
    }
    $("#songBtn").addEventListener("click", () => { $("#themeMenu").hidden = true; $("#songs").hidden = false; renderPanel(); });
    $("#songs").addEventListener("click", async e => {
      if (e.target.closest("[data-close]")) { $("#songs").hidden = true; return; }
      const rm = e.target.closest(".songslot__remove");
      if (rm) { await del(rm.closest(".songslot").dataset.key); loadedSlot = null; await update(); renderPanel(); toast("Song removed"); }
    });
    $("#songs").addEventListener("change", async e => {
      const input = e.target.closest(".songslot input[type=file]");
      if (!input?.files[0]) return;
      const f = input.files[0];
      input.value = "";
      if (!/^audio\//.test(f.type) && !/\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba|webm)$/i.test(f.name)) { toast("That isn't an audio file."); return; }
      if (f.size > MAX_MB * 1e6) { toast(`That song is over ${MAX_MB} MB. Try a smaller file.`); return; }
      try {
        await put(input.closest(".songslot").dataset.key, { name: f.name.replace(/\.[^.]+$/, ""), blob: f, savedAt: Date.now() });
        playing = true; ls.set("glimpse:songOn", true);
        Sound.enable();                                  // a song needs sound on
        loadedSlot = null;
        await update(); renderPanel();
        toast("🎵 Your theme song is playing");
      } catch (_) { toast("Couldn't save that song on this device."); }
    });
    $("#songVol").addEventListener("input", e => { vol = Number(e.target.value); ls.set("glimpse:songVol", vol); if (!audio.paused) { clearInterval(fadeT); audio.volume = vol; } });
    $("#songMix").addEventListener("change", e => { mix = e.target.checked; ls.set("glimpse:songMix", mix); update(); });
    $("#songPlay").addEventListener("click", async () => {
      playing = !playing; ls.set("glimpse:songOn", playing);
      if (playing) Sound.enable();
      await update();
    });
    Sound.onToggle(() => update());
    new MutationObserver(() => update()).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    // browsers only start audio after a tap or key press
    const first = () => update();
    window.addEventListener("pointerdown", first, { once: true });
    window.addEventListener("keydown", first, { once: true });
    return { update, pause: () => { if (!audio.paused) audio.pause(); }, resume: () => update() };
  })();

  /* ---------------------------------------------------------
     26. SAHARA SECRET: CAMEL RUN
     Click a camel in the Sahara caravan (or type "camel") and
     run from the flying saucer: jump the obstacles, kneel under
     its lasers. One hit and your camel gets abducted.
     --------------------------------------------------------- */
  const CamelRun = (() => {
    const W = 600, H = 200, GROUND = 168, CAMEL_X = 120;
    const C = { sky1: "#120a26", sky2: "#3a1d3e", dune: "#2a1630", dune2: "#3d1f3b", sand: "#d8a96a", sandDark: "#a87a45", camel: "#f2d29b", camelDark: "#b9894d",
      ink: "#3b2238", cactus: "#5fbf6a", cactusDark: "#3c8a47", rock: "#8a7a72", bone: "#f4efe6", ufo: "#b8c4d6", ufoDark: "#6f7d96", glass: "#9fe8ff", alien: "#7dff8a", laser: "#ff3dd6", beam: "rgba(140, 255, 190, .32)", text: "#f8e6c4" };
    const cv = $("#camelCanvas"), g = cv.getContext("2d");
    let st = null, raf = 0, last = 0, open = false;
    const hi = () => ls.get("glimpse:camelHi", 0);
    const px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

    function fit() {
      const cssW = Math.min(innerWidth - 24, 960), k = Math.min(4, Math.max(1, (cssW / W) * (devicePixelRatio || 1)));
      cv.style.width = cssW + "px"; cv.style.height = (cssW * H) / W + "px";
      cv.width = Math.round(W * k); cv.height = Math.round(H * k);
      g.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
      g.imageSmoothingEnabled = false;
    }
    function reset() {
      st = { mode: "ready", t: 0, y: 0, vy: 0, duck: false, speed: 330, dist: 0, score: 0, obs: [], bolts: [], nextGap: 520, charge: 0, nextLaser: 6,
        ufo: { x: 34, y: 34 }, stars: Array.from({ length: 50 }, () => [Math.random() * W, Math.random() * 110, Math.random()]), pebbles: Array.from({ length: 26 }, () => [Math.random() * W, GROUND + 4 + Math.random() * 26]),
        flash: 0, abduct: 0, best: hi() };
    }
    function start() {
      if (open) return;
      open = true;
      $("#camelGame").hidden = false;
      SCENES.sahara?.stop();                                    // the desert behind can rest while you play
      fit(); reset();
      Eggs.mark("sahara");
      last = performance.now();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
      $("#camelJump").focus({ preventScroll: true });
    }
    function close() {
      open = false;
      $("#camelGame").hidden = true;
      cancelAnimationFrame(raf);
      if (document.documentElement.dataset.theme === "sahara") SCENES.sahara?.start();
    }
    // ----- controls -----
    function jump() {
      if (!st) return;
      if (st.mode === "paused") { st.mode = "run"; return; }
      if (st.mode === "ready" || st.mode === "over") { if (st.mode === "over" && st.abduct < 1.2) return; reset(); st.mode = "run"; Sound.sfx("camelJump"); return; }
      if (st.y === 0 && !st.duck) { st.vy = -640; Sound.sfx("camelJump"); }
    }
    const kneel = on => { if (st && st.mode === "run") { if (on && !st.duck) Sound.sfx("camelKneel"); st.duck = on; if (on && st.y < 0) st.vy = Math.max(st.vy, 700); } };
    window.addEventListener("keydown", e => {
      if (!open) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
      if (e.key === " " || e.key === "ArrowUp" || e.key === "w") { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) jump(); }
      if (e.key === "ArrowDown" || e.key === "s") { e.preventDefault(); e.stopImmediatePropagation(); kneel(true); }
    }, true);
    window.addEventListener("keyup", e => { if (open && (e.key === "ArrowDown" || e.key === "s")) kneel(false); }, true);
    cv.addEventListener("pointerdown", e => {
      const r = cv.getBoundingClientRect();
      if (e.clientY - r.top > r.height * 0.62 && st?.mode === "run") kneel(true); else jump();
    });
    window.addEventListener("pointerup", () => kneel(false));
    $("#camelJump").addEventListener("pointerdown", e => { e.preventDefault(); jump(); });
    $("#camelDuck").addEventListener("pointerdown", e => { e.preventDefault(); kneel(true); });
    $("#camelClose").addEventListener("click", close);
    addEventListener("resize", () => { if (open) fit(); });
    document.addEventListener("visibilitychange", () => { if (document.hidden && st?.mode === "run") st.mode = "paused"; });

    // ----- the world -----
    function spawn() {
      const r = Math.random(), x = W + 30;
      const pick = st.score < 120 ? r * 0.75 : r;
      let o;
      if (pick < 0.25) o = { kind: "cactus", x, w: 12, h: 30 };
      else if (pick < 0.42) o = { kind: "cactus", x, w: 16, h: 44 };
      else if (pick < 0.55) o = { kind: "cactus2", x, w: 34, h: 32 };
      else if (pick < 0.68) o = { kind: "rock", x, w: 28, h: 18 };
      else if (pick < 0.8) o = { kind: "skull", x, w: 20, h: 14 };
      else o = { kind: "weed", x, w: 22, h: 22, ph: 0 };
      st.obs.push(o);
    }
    function camelBoxes() {
      const y = GROUND + st.y;
      if (st.duck && st.y === 0) return [[CAMEL_X + 3, y - 22, 54, 22]];
      return [[CAMEL_X + 5, y - 42, 32, 40], [CAMEL_X + 38, y - 54, 16, 26]];
    }
    const hit = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
    function step(dt) {
      st.t += dt;
      if (st.mode !== "run") { if (st.mode === "over") st.abduct += dt; return; }
      st.speed = Math.min(900, st.speed + dt * 9);
      st.dist += st.speed * dt;
      for (const p of st.pebbles) p[0] = mod(p[0] - st.speed * dt, W);
      const before = Math.floor(st.score / 100);
      st.score += dt * st.speed * 0.025;
      if (Math.floor(st.score / 100) > before) { st.flash = 1; Sound.sfx("camelPoint"); }
      st.flash = Math.max(0, st.flash - dt * 2);
      // jumping
      st.vy += 2000 * dt; st.y = Math.min(0, st.y + st.vy * dt);
      if (st.y === 0) st.vy = 0;
      // obstacles
      st.nextGap -= st.speed * dt;
      if (st.nextGap <= 0) { spawn(); st.nextGap = rnd(1, 1.9) * (230 + st.speed * 0.45); }
      for (const o of st.obs) { o.x -= st.speed * dt * (o.kind === "weed" ? 1.25 : 1); if (o.kind === "weed") o.ph += dt * 9; }
      st.obs = st.obs.filter(o => o.x > -60);
      // the saucer charges up and fires a laser at head height (kneel!)
      st.nextLaser -= dt;
      if (st.score > 80 && st.nextLaser <= 0 && !st.charge && !st.obs.some(o => o.x > CAMEL_X - 40 && o.x < CAMEL_X + 240)) { st.charge = 0.001; Sound.sfx("camelCharge"); }
      if (st.charge) {
        st.charge += dt;
        if (st.charge > 0.75) { st.charge = 0; st.bolts.push({ x: st.ufo.x + 30, y: GROUND - 44 }); Sound.sfx("camelLaser"); st.nextLaser = rnd(3.5, 7) - Math.min(2, st.score / 600); }
      }
      for (const b of st.bolts) b.x += (520 + st.speed * 0.5) * dt;
      st.bolts = st.bolts.filter(b => b.x < W + 40);
      st.ufo.y = 34 + Math.sin(st.t * 2) * 6; st.ufo.x = 34 + Math.sin(st.t * 0.7) * 10;
      // collisions
      const boxes = camelBoxes();
      for (const o of st.obs) {
        const oy = o.kind === "weed" ? GROUND - o.h - Math.abs(Math.sin(o.ph * 0.35)) * 16 : GROUND - o.h;
        const ob = [o.x + 3, oy + 3, o.w - 6, o.h - 3];
        if (boxes.some(b => hit(b, ob))) return gameOver();
      }
      for (const b of st.bolts) if (boxes.some(c => hit(c, [b.x, b.y - 2, 34, 4]))) return gameOver();
    }
    function gameOver() {
      st.mode = "over"; st.abduct = 0;
      const s = Math.floor(st.score);
      if (s > hi()) ls.set("glimpse:camelHi", s);
      Sound.sfx("camelAbduct");
    }

    // ----- drawing (chunky pixels, desert night) -----
    function drawCamel(x, y, mode, t) {
      const run = mode === "run" && st.y === 0, f = Math.floor(t * 12) % 2;
      if (mode === "duck") {                                        // kneeling: low and long
        px(x + 2, y - 14, 40, 12, C.camel); px(x + 10, y - 22, 20, 8, C.camel); px(x + 14, y - 25, 12, 3, C.camel);
        px(x + 12, y - 20, 16, 3, "#c0392b");                            // saddle blanket
        px(x + 40, y - 14, 8, 6, C.camel); px(x + 46, y - 17, 14, 8, C.camel); px(x + 56, y - 15, 5, 4, C.camel);
        px(x + 51, y - 15, 2, 2, C.ink); px(x, y - 12, 3, 6, C.camelDark);
        px(x + 4, y - 3, 34, 3, C.camelDark);
        return;
      }
      const lift = (i) => (run ? ((i + f) % 2 ? 5 : 0) : mode === "jump" ? 6 : 0);
      for (const [i, lx] of [[0, 6], [1, 13], [1, 27], [0, 33]].map(([i, lx], k) => [k % 2, lx])) px(x + lx, y - 16, 4, 16 - lift(i), C.camelDark);
      px(x + 2, y - 30, 36, 15, C.camel);                                 // body
      px(x + 9, y - 39, 20, 9, C.camel); px(x + 13, y - 43, 12, 4, C.camel);   // hump
      px(x + 11, y - 35, 16, 3, "#c0392b"); px(x + 11, y - 32, 16, 2, "#f1c40f");
      px(x + 35, y - 33, 6, 8, C.camel); px(x + 38, y - 41, 6, 8, C.camel); px(x + 41, y - 49, 6, 8, C.camel);   // neck
      px(x + 41, y - 55, 14, 8, C.camel); px(x + 52, y - 52, 6, 5, C.camel);   // head and snout
      px(x + 42, y - 58, 3, 3, C.camelDark); px(x + 47, y - 53, 2, 2, C.ink);
      px(x - 1, y - 29, 3, 8, C.camelDark);                                // tail
    }
    function drawUfo(x, y, t, beam) {
      if (beam > 0) {                                                       // tractor beam
        g.fillStyle = C.beam;
        g.beginPath(); g.moveTo(x + 22, y + 10); g.lineTo(x + 42, y + 10); g.lineTo(x + 70 + beam * 10, GROUND); g.lineTo(x - 6 - beam * 10, GROUND); g.fill();
      }
      px(x + 18, y - 10, 26, 3, C.glass); px(x + 15, y - 7, 32, 5, C.glass);  // dome
      px(x + 27, y - 8, 7, 5, C.alien); px(x + 28, y - 7, 2, 2, C.ink); px(x + 31, y - 7, 2, 2, C.ink);   // the pilot
      px(x + 4, y - 2, 54, 6, C.ufo); px(x - 4, y + 4, 70, 4, C.ufoDark); px(x + 14, y + 8, 34, 3, C.ufo);
      for (let i = 0; i < 6; i++) px(x + 2 + i * 11, y + 5, 3, 2, ["#ff4d6d", "#ffd23f", "#5cff9d", "#3ddcff"][(i + Math.floor(t * 8)) % 4]);
      if (st.charge) { const k = st.charge / 0.75; g.fillStyle = `rgba(255, 61, 214, ${0.3 + k * 0.6})`; g.beginPath(); g.arc(x + 31, y + 10, 3 + k * 6, 0, TAU); g.fill(); px(x + 62, y - 16, 4, 10, C.laser); px(x + 62, y - 4, 4, 3, C.laser); }
    }
    function drawObstacle(o) {
      const y = GROUND;
      if (o.kind === "cactus") {
        px(o.x + o.w / 2 - 4, y - o.h, 8, o.h, C.cactus); px(o.x, y - o.h * 0.62, 4, 4, C.cactus); px(o.x, y - o.h * 0.62 - 8, 4, 8, C.cactus);
        px(o.x + o.w - 4, y - o.h * 0.45, 4, 4, C.cactus); px(o.x + o.w - 4, y - o.h * 0.45 - 8, 4, 8, C.cactus);
        for (let k = 6; k < o.h; k += 7) px(o.x + o.w / 2 - 1, y - k, 2, 2, C.cactusDark);
      } else if (o.kind === "cactus2") {
        drawObstacle({ kind: "cactus", x: o.x, w: 14, h: 30 }); drawObstacle({ kind: "cactus", x: o.x + 18, w: 14, h: 24 });
      } else if (o.kind === "rock") {
        px(o.x + 4, y - 18, 18, 6, C.rock); px(o.x, y - 12, 28, 12, C.rock); px(o.x + 6, y - 15, 6, 3, "#a59890");
      } else if (o.kind === "skull") {
        px(o.x + 4, y - 12, 12, 9, C.bone); px(o.x + 6, y - 3, 8, 3, C.bone); px(o.x, y - 15, 5, 3, C.bone); px(o.x + 15, y - 15, 5, 3, C.bone);
        px(o.x + 6, y - 9, 2, 2, C.ink); px(o.x + 12, y - 9, 2, 2, C.ink);
      } else {                                                              // tumbleweed, bouncing along
        const cy = y - o.h / 2 - Math.abs(Math.sin(o.ph * 0.35)) * 16;
        g.strokeStyle = C.sandDark; g.lineWidth = 2;
        g.beginPath(); g.arc(o.x + o.w / 2, cy, o.w / 2, 0, TAU); g.stroke();
        for (let k = 0; k < 3; k++) { const a = o.ph + k * 1.05; g.beginPath(); g.moveTo(o.x + o.w / 2 + Math.cos(a) * 10, cy + Math.sin(a) * 10); g.lineTo(o.x + o.w / 2 - Math.cos(a) * 10, cy - Math.sin(a) * 10); g.stroke(); }
      }
    }
    function draw() {
      const sky = g.createLinearGradient(0, 0, 0, GROUND);
      sky.addColorStop(0, C.sky1); sky.addColorStop(1, C.sky2);
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      for (const [x, y, k] of st.stars) px(x, y, 1, 1, `rgba(255,255,255,${0.35 + 0.5 * Math.abs(Math.sin(st.t * 2 + k * 9))})`);
      g.fillStyle = "#fdf3d0"; g.beginPath(); g.arc(510, 32, 11, 0, TAU); g.fill();         // crescent moon
      g.fillStyle = C.sky1; g.beginPath(); g.arc(516, 28, 10, 0, TAU); g.fill();
      // distant dunes rolling past
      const off = (st.dist * 0.15) % 200;
      g.fillStyle = C.dune;
      for (let x = -200; x < W + 200; x += 200) { g.beginPath(); g.moveTo(x - off, GROUND); g.quadraticCurveTo(x + 100 - off, GROUND - 46, x + 200 - off, GROUND); g.fill(); }
      px(0, GROUND, W, H - GROUND, C.sand);
      px(0, GROUND, W, 2, C.sandDark);
      for (const p of st.pebbles) px(p[0], p[1], 3, 2, C.sandDark);
      for (const o of st.obs) drawObstacle(o);
      for (const b of st.bolts) { px(b.x, b.y - 2, 34, 4, C.laser); px(b.x + 4, b.y - 1, 26, 2, "#ffd6f6"); }
      // the camel (rising into the saucer when abducted)
      const lift = st.mode === "over" ? Math.min(1, st.abduct / 1.2) : 0;
      const ufoX = st.mode === "over" ? st.ufo.x + (CAMEL_X - 5 - st.ufo.x) * Math.min(1, st.abduct / 0.5) : st.ufo.x;
      const ufoY = st.mode === "over" ? st.ufo.y + 10 : st.ufo.y;
      drawUfo(ufoX, ufoY, st.t, st.mode === "over" ? Math.min(1, st.abduct / 0.4) : 0);
      if (lift < 1) drawCamel(CAMEL_X, GROUND + st.y - lift * (GROUND - ufoY - 50), st.duck && st.y === 0 ? "duck" : st.y < 0 ? "jump" : st.mode === "run" ? "run" : "stand", st.t);
      // score
      g.font = "700 13px ui-monospace, Menlo, Consolas, monospace"; g.textAlign = "right";
      const pad = n => String(Math.floor(n)).padStart(5, "0");
      g.fillStyle = st.flash > 0 && Math.floor(st.t * 10) % 2 ? "#fff" : C.text;
      g.fillText(`HI ${pad(Math.max(st.best, hi()))}  ${pad(st.score)}`, W - 12, 20);
      g.textAlign = "center";
      if (st.mode === "ready") {
        g.font = "800 26px ui-monospace, Menlo, Consolas, monospace"; g.fillStyle = C.text; g.fillText("CAMEL RUN", W / 2, 70);
        g.font = "600 12px ui-monospace, Menlo, Consolas, monospace";
        g.fillText("The saucer is coming. Jump the obstacles, kneel under its lasers.", W / 2, 92);
        g.fillText(Math.floor(st.t * 2) % 2 ? "PRESS SPACE OR TAP TO RUN" : "", W / 2, 112);
      } else if (st.mode === "over" && st.abduct > 0.9) {
        g.font = "800 24px ui-monospace, Menlo, Consolas, monospace"; g.fillStyle = "#7dff8a"; g.fillText("ABDUCTED!", W / 2, 84);
        g.font = "600 12px ui-monospace, Menlo, Consolas, monospace"; g.fillStyle = C.text;
        g.fillText(Math.floor(st.score) >= st.best && st.score > 0 ? `New high score: ${Math.floor(st.score)}!` : `Score ${Math.floor(st.score)}`, W / 2, 104);
        if (st.abduct > 1.2) g.fillText("Space or tap to run again", W / 2, 122);
      } else if (st.mode === "paused") {
        g.font = "700 14px ui-monospace, Menlo, Consolas, monospace"; g.fillStyle = C.text; g.fillText("PAUSED · tap to carry on", W / 2, 90);
      }
      g.textAlign = "left";
    }
    function loop(now) {
      if (!open) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      step(dt);
      draw();
      raf = requestAnimationFrame(loop);
    }
    cv.addEventListener("pointerdown", () => { if (st?.mode === "paused") st.mode = "run"; }, true);
    // Secret trigger #2: type "camel" while in the Sahara
    let typed = "";
    window.addEventListener("keydown", e => {
      if (open || e.target.closest?.("input, textarea, [contenteditable]")) return;
      typed = (typed + (e.key.length === 1 ? e.key.toLowerCase() : "")).slice(-5);
      if (typed === "camel" && document.documentElement.dataset.theme === "sahara") { typed = ""; start(); }
    });
    return { start, close, isOpen: () => open };
  })();

  /* ---------------------------------------------------------
     27. EASTER EGGS: a secret in every theme
     --------------------------------------------------------- */
  const Eggs = (() => {
    const LIST = [
      { id: "light", theme: "light", name: "Paper Planes", hint: "Tap the blank paper three times. Or just say the word." },
      { id: "dark", theme: "dark", name: "Flashlight", hint: "Knock three times on the darkness." },
      { id: "gallery", theme: "gallery", name: "Night Watch", hint: "After closing time, tap the gallery wall three times." },
      { id: "universe", theme: "universe", name: "Your Constellation", hint: "Tap the sky twice, quickly." },
      { id: "amazon", theme: "amazon", name: "Frog Choir", hint: "Bother the frogs enough and they'll sing." },
      { id: "ocean", theme: "ocean", name: "Whale Song", hint: "Startle the jellyfish, again and again." },
      { id: "aurora", theme: "aurora", name: "Wish Upon a Star", hint: "Catch a falling star." },
      { id: "sakura", theme: "sakura", name: "Lantern Festival", hint: "Ask the sun to set. Three times." },
      { id: "sahara", theme: "sahara", name: "Camel Run", hint: "One of the caravan has somewhere to be." },
      { id: "neon", theme: "neon", name: "Turbo Mode", hint: "↑ ↑ ↓ ↓ … you know the rest." },
      { id: "noir", theme: "noir", name: "Case Closed", hint: "The man under the lamp knows something." },
      { id: "neotokyo", theme: "neotokyo", name: "The Four Gods", hint: "Wake every element." },
      { id: "warp", theme: "warp", name: "Edge of the Universe", hint: "Keep tapping the speedometer. Faster." },
      { id: "andromeda", theme: "andromeda", name: "First Contact", hint: "Knock on the galaxy's heart, three times." },
    ];
    const found = new Set(ls.get("glimpse:eggs", []));
    const theme = () => document.documentElement.dataset.theme;
    function mark(id) {
      const first = !found.has(id);
      found.add(id); ls.set("glimpse:eggs", [...found]);
      const e = LIST.find(x => x.id === id);
      if (first) toast(`🥚 Secret found: ${e.name} (${found.size} of ${LIST.length})`);
      Badges.award("secret");
      if (found.size >= LIST.length) Badges.award("secrets-all");
      renderLink();
    }
    function renderLink() {
      const a = $("#secretsLink");
      a.hidden = !found.size;
      a.textContent = `🥚 Secrets ${found.size}/${LIST.length}`;
    }
    function openList() {
      $("#secretsList").innerHTML = LIST.map(e => `<li class="${found.has(e.id) ? "is-found" : ""}">
        <span class="secret__theme">${esc(THEMES[e.theme] || e.theme)}</span>
        <strong>${found.has(e.id) ? esc(e.name) : "???"}</strong>
        <small>${esc(e.hint)}</small></li>`).join("");
      $("#secretsCount").textContent = `${found.size} of ${LIST.length} found`;
      $("#secrets").hidden = false;
    }
    document.addEventListener("click", e => { if (e.target.closest("#secretsLink")) openList(); });
    $("#secrets").addEventListener("click", e => { if (e.target.closest("[data-close]")) $("#secrets").hidden = true; });
    renderLink();

    // ----- counting taps -----
    const taps = [];
    const recent = (key, within, n) => { const now = performance.now(); taps.push({ key, t: now }); while (taps.length && now - taps[0].t > 20000) taps.shift(); return taps.filter(x => x.key === key && now - x.t < within).length >= n; };
    const clearTaps = key => { for (let i = taps.length - 1; i >= 0; i--) if (taps[i].key === key) taps.splice(i, 1); };
    let busy = false;
    const W = () => innerWidth, H = () => innerHeight;
    // Called for taps on empty wall space; returns true if a secret took the tap
    function tap(x, y) {
      if (busy) return true;
      const th = theme();
      if (["light", "dark", "gallery"].includes(th) && recent(th, 900, 3)) { clearTaps(th); ({ light: paperPlanes, dark: flashlight, gallery: nightWatch })[th](); return true; }
      if (th === "universe") {
        const last = taps.filter(t => t.key === "uni").pop();
        if (last && performance.now() - last.t < 380 && Math.hypot(last.x - x, last.y - y) < 40) { clearTaps("uni"); drawConstellation(); return true; }
        taps.push({ key: "uni", t: performance.now(), x, y });
      }
      if (th === "sakura") {
        const sr = H() * 0.11, sx = W() * 0.62, sy = H() * 0.74 - sr * 0.25;
        if (Math.hypot(x - sx, y - sy) < sr * 1.3) { if (recent("sun", 4000, 3)) { clearTaps("sun"); lanternFestival(); } else toast(["The sun dips a little lower…", "Lower still…"][Math.min(1, taps.filter(t => t.key === "sun").length - 1)] || "…"); return true; }
      }
      if (th === "noir") {
        const s = Math.min(H() * 0.11, 90), mx = W() * 0.84 - 40, my = H() - 4;
        if (x > mx - s * 0.45 && x < mx + s * 0.45 && y > my - s * 1.3 && y < my) { caseFile(); return true; }
      }
      if (th === "andromeda") {
        const c = SCENES.andromeda?.core;
        if (c && Math.hypot(x - c.x, y - c.y) < 70) { if (recent("core", 3500, 3)) { clearTaps("core"); firstContact(); } return true; }
      }
      if (th === "aurora") {
        const s = SCENES.aurora?.shoot?.s;
        if (s && Math.hypot(x - s.x, y - s.y) < 110) { wishUponAStar(); return true; }
      }
      return false;
    }
    // Scenes report things like "a frog was tapped"
    function bump(what) {
      if (what === "frog" && recent("frog", 12000, 5)) { clearTaps("frog"); mark("amazon"); SCENES.amazon.choir = { t: (performance.now() - SCENES.amazon.t0) / 1000 }; Sound.sfx("frogChoir"); toast("🐸 The frog choir sings for you"); }
      if (what === "jelly" && recent("jelly", 9000, 3)) { clearTaps("jelly"); whaleSong(); }
      if (what === "hud" && recent("hud", 3000, 5)) { clearTaps("hud"); edgeOfUniverse(); }
    }
    const roared = new Map();
    function roar(el) {
      roared.set(el, performance.now());
      for (const [k, t] of roared) if (performance.now() - t > 25000) roared.delete(k);
      if (roared.size === 4) { roared.clear(); fourGods(); }
    }
    // Typed secrets
    let typed = "";
    const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
    let keys = [];
    window.addEventListener("keydown", e => {
      if (e.target.closest?.("input, textarea, [contenteditable]") || CamelRun.isOpen()) return;
      keys = [...keys, e.key.length === 1 ? e.key.toLowerCase() : e.key].slice(-10);
      if (theme() === "neon" && KONAMI.every((k, i) => keys[i] === k)) { keys = []; turbo(); }
      typed = (typed + (e.key.length === 1 ? e.key.toLowerCase() : "")).slice(-6);
      if (theme() === "light" && typed.endsWith("paper")) { typed = ""; paperPlanes(); }
      if (theme() === "ocean" && typed.endsWith("whale")) { typed = ""; whaleSong(); }
    });
    const layer = $("#eggLayer");
    const banner = (html, cls = "", ms = 4000) => {
      const b = document.createElement("div");
      b.className = `egg-banner ${cls}`; b.innerHTML = html;
      layer.appendChild(b);
      if (ms) setTimeout(() => { b.classList.add("out"); setTimeout(() => b.remove(), 600); }, ms);
      return b;
    };

    // ===== ☀️ Light: Paper Planes =====
    function paperPlanes() {
      if (!cards.length || reduceMotion) return;
      mark("light");
      startFx("planes");
    }
    EFFECTS.planes = {
      dur: 6500,
      init(fx) { fx.pos = new Map(); Sound.sfx("planes"); },
      draw(fx, ctx) {
        ctx.lineCap = "round";
        for (const [, p] of fx.pos) {
          if (p.a < 0.05) continue;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.h); ctx.globalAlpha = p.a;
          const k = p.s;
          ctx.shadowColor = "rgba(0, 0, 0, .25)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 6;
          ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "rgba(40, 40, 60, .85)"; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(18 * k, 0); ctx.lineTo(-14 * k, -11 * k); ctx.lineTo(-8 * k, 0); ctx.lineTo(-14 * k, 9 * k); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.shadowColor = "transparent";
          ctx.fillStyle = "#c9cfdb"; ctx.beginPath(); ctx.moveTo(18 * k, 0); ctx.lineTo(-8 * k, 0); ctx.lineTo(-11 * k, 4 * k); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.setLineDash([3, 5]); ctx.strokeStyle = "rgba(120, 120, 140, .35)";
          ctx.beginPath(); ctx.moveTo(-14 * k, 0); ctx.lineTo(-60 * k, 0); ctx.stroke(); ctx.setLineDash([]);
          ctx.restore();
        }
      },
      card(fx, c, t, bx, by) {
        const fold = seg(t, 0.03, 0.12), land = ease.inOutCubic(seg(t, 0.82, 0.98));
        const ph = c.seed * TAU, r = 0.22 + c.seed * 0.18, sp = 0.9 + c.spin * 0.3;
        const fly = (t - 0.1) * 5 * sp + ph;
        let x = vw * (0.5 + r * Math.sin(fly)), y = vh * (0.45 + r * 0.6 * Math.sin(fly * 2 + c.seed));
        const hdg = Math.atan2(vh * r * 0.6 * 2 * Math.cos(fly * 2 + c.seed), vw * r * Math.cos(fly));
        if (t < 0.12) { x = bx + (x - bx) * ease.inCubic(fold); y = by + (y - by) * ease.inCubic(fold); }
        if (land > 0) { x += (bx - x) * land; y += (by - y) * land; }
        const onScreen = bx > -80 && bx < vw + 80 && by > -80 && by < vh + 80 && c.de > 0.3 && c.de < 0.92;   // nearer posts become planes
        const plane = onScreen && t > 0.06 && t < 0.97 ? 1 - seg(t, 0.92, 0.97) : 0;
        fx.pos.set(c, { x, y, h: hdg, a: plane * (0.75 + c.d0 * 0.25), s: 0.9 + c.d0 * 1.1 });
        const card = t < 0.1 ? 1 - fold : seg(t, 0.94, 1);
        return { x, y, s: 0.2 + 0.8 * card, a: card };
      },
    };

    // ===== 🌙 Dark: Flashlight =====
    function flashlight() {
      if (busy) return;
      busy = true; mark("dark");
      const ov = document.createElement("div");
      ov.className = "egg-dark";
      const ghost = document.createElement("div");
      ghost.className = "egg-ghost";
      ghost.innerHTML = `<svg viewBox="0 0 60 70" aria-hidden="true"><path d="M30 4C16 4 8 15 8 30v34l7-6 7 6 8-6 8 6 7-6 7 6V30C52 15 44 4 30 4Z" fill="#f4f6ff"/><circle cx="22" cy="28" r="4" fill="#1a1a2e"/><circle cx="38" cy="28" r="4" fill="#1a1a2e"/><ellipse cx="30" cy="40" rx="5" ry="6" fill="#1a1a2e"/></svg>`;
      let gx = rnd(0.15, 0.85) * W(), gy = rnd(0.2, 0.8) * H();
      ghost.style.left = gx + "px"; ghost.style.top = gy + "px";
      layer.append(ghost, ov);
      const msg = banner("🔦 Somebody's hiding in the dark. Find them!", "", 3500);
      const move = e => { ov.style.setProperty("--x", e.clientX + "px"); ov.style.setProperty("--y", e.clientY + "px"); };
      ov.addEventListener("pointermove", move); ov.addEventListener("pointerdown", move);
      ov.style.setProperty("--x", W() / 2 + "px"); ov.style.setProperty("--y", H() / 2 + "px");
      const drift = setInterval(() => { gx = clamp(gx + rnd(-60, 60), 40, W() - 40); gy = clamp(gy + rnd(-40, 40), 80, H() - 80); ghost.style.left = gx + "px"; ghost.style.top = gy + "px"; }, 2500);
      const end = (won) => {
        clearInterval(drift); clearTimeout(timer);
        ghost.classList.add(won ? "boo" : "gone");
        ov.classList.add("out");
        if (won) { Sound.sfx("boo"); banner("👻 Boo! You found me.", "", 3000); }
        else banner("The ghost slipped away… (knock three times to look again)", "", 3500);
        setTimeout(() => { ov.remove(); ghost.remove(); busy = false; }, 1400);
      };
      ov.addEventListener("click", e => { if (Math.hypot(e.clientX - gx, e.clientY - gy) < 55) end(true); });
      const timer = setTimeout(() => end(false), 30000);
    }

    // ===== 🖼 Gallery: Night Watch =====
    function nightWatch() {
      if (busy) return;
      busy = true; mark("gallery");
      const dim = document.createElement("div"); dim.className = "egg-dim";
      const thief = document.createElement("button");
      thief.type = "button"; thief.className = "egg-thief"; thief.setAttribute("aria-label", "Catch the thief!");
      thief.innerHTML = `<svg viewBox="0 0 90 100" aria-hidden="true">
        <rect x="46" y="18" width="40" height="32" rx="2" fill="#c9a24a" stroke="#7a5a12" stroke-width="3"/><rect x="51" y="23" width="30" height="22" fill="#4a7bb5"/><circle cx="60" cy="31" r="4" fill="#ffd56a"/><path d="M51 45l10-9 8 6 12-10v13z" fill="#2f6b3a"/>
        <circle cx="30" cy="22" r="12" fill="#f0c9a0"/><rect x="17" y="17" width="26" height="7" rx="3" fill="#1b1b1b"/><circle cx="25" cy="20" r="2" fill="#fff"/><circle cx="35" cy="20" r="2" fill="#fff"/>
        <path d="M18 14q12-12 24 0z" fill="#1b1b1b"/>
        <rect x="18" y="34" width="24" height="30" rx="6" fill="#1b1b1b"/><path d="M18 40h24M18 47h24M18 54h24" stroke="#eee" stroke-width="3"/>
        <path d="M40 40l10-6" stroke="#1b1b1b" stroke-width="6" stroke-linecap="round"/>
        <path d="M24 64l-6 26M36 64l8 26" stroke="#1b1b1b" stroke-width="7" stroke-linecap="round"/></svg>`;
      layer.append(dim, thief);
      banner("🌙 Closing time… but someone's still in the gallery. Catch them!", "", 3500);
      let done = false;
      const finish = caught => {
        if (done) return; done = true;
        if (caught) { dim.classList.add("alarm"); thief.classList.add("caught"); Sound.sfx("alarm"); banner("🚨 Caught red-handed! The painting is safe.", "", 3500); }
        else banner("He got away with it… (tap the wall three times to try again)", "", 3500);
        setTimeout(() => { dim.remove(); thief.remove(); busy = false; }, 2600);
      };
      thief.addEventListener("click", () => finish(true));
      thief.addEventListener("animationend", () => finish(false));
    }

    // ===== 🌌 Universe: Your Constellation =====
    const myStars = () => ls.get("glimpse:constellations", []);
    function drawConstellation() {
      if (busy) return;
      busy = true; mark("universe");
      const cv = document.createElement("canvas"); cv.className = "egg-canvas";
      const bar = banner(`✦ Tap the sky to place stars (up to 12). <button type="button" class="chip chip--solid" data-done>Name it</button> <button type="button" class="chip" data-cancel>Cancel</button>`, "egg-banner--tools", 0);
      layer.appendChild(cv);
      const g = cv.getContext("2d"), pts = [];
      const size = () => { cv.width = W(); cv.height = H(); paint(); };
      const paint = () => {
        g.clearRect(0, 0, cv.width, cv.height);
        g.strokeStyle = "rgba(170, 210, 255, .7)"; g.lineWidth = 1.5; g.setLineDash([4, 4]);
        g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x * W(), p.y * H()) : g.moveTo(p.x * W(), p.y * H()))); g.stroke(); g.setLineDash([]);
        for (const p of pts) { glow(g, p.x * W(), p.y * H(), 14, "hsla(210, 100%, 85%, ALPHA)", 0.9); g.fillStyle = "#fff"; g.beginPath(); g.arc(p.x * W(), p.y * H(), 2.6, 0, TAU); g.fill(); }
      };
      size(); addEventListener("resize", size);
      cv.addEventListener("pointerdown", e => { if (pts.length < 12) { pts.push({ x: e.clientX / W(), y: e.clientY / H() }); Sound.sfx("sparkle"); paint(); } });
      const close = () => { removeEventListener("resize", size); cv.remove(); bar.remove(); busy = false; };
      bar.addEventListener("click", e => {
        if (e.target.closest("[data-cancel]")) close();
        if (e.target.closest("[data-done]")) {
          if (pts.length < 2) { toast("Place at least two stars."); return; }
          const name = (prompt("Name your constellation:", "The Wanderer") || "").trim().slice(0, 30);
          if (!name) return;
          ls.set("glimpse:constellations", [...myStars(), { name, pts }].slice(-5));
          close();
          toast(`✦ “${name}” now shines in your Universe sky`);
        }
      });
    }
    // drawn by the Universe scene
    function paintConstellations(ctx, w, h, t) {
      for (const c of myStars()) {
        ctx.strokeStyle = "rgba(170, 210, 255, .35)"; ctx.lineWidth = 1;
        ctx.beginPath(); c.pts.forEach((p, i) => (i ? ctx.lineTo(p.x * w, p.y * h) : ctx.moveTo(p.x * w, p.y * h))); ctx.stroke();
        c.pts.forEach((p, i) => glow(ctx, p.x * w, p.y * h, 8 + Math.sin(t * 2 + i) * 2, "hsla(210, 100%, 88%, ALPHA)", 0.85));
        const top = c.pts.reduce((a, b) => (b.y < a.y ? b : a));
        ctx.fillStyle = "rgba(200, 225, 255, .75)"; ctx.font = "italic 600 13px Georgia, serif"; ctx.textAlign = "center";
        ctx.fillText(c.name, top.x * w, top.y * h - 14); ctx.textAlign = "left";
      }
    }

    // ===== 🐋 Ocean: Whale Song =====
    function whaleSong() {
      const sc = SCENES.ocean;
      if (!sc || sc.whale) return;
      mark("ocean");
      sc.whale = { t: (performance.now() - sc.t0) / 1000 };
      Sound.sfx("whale");
      toast("🐋 Something enormous is passing by…");
    }

    // ===== 🌠 Aurora: Wish Upon a Star =====
    function wishUponAStar() {
      if (busy) return;
      busy = true; mark("aurora");
      Sound.sfx("sparkle");
      $("#wishText").value = "";
      $("#wish").hidden = false;
      $("#wishText").focus();
    }
    $("#wishForm").addEventListener("submit", e => {
      e.preventDefault();
      const wish = $("#wishText").value.trim().slice(0, 60);
      $("#wish").hidden = true; busy = false;
      if (!wish) return;
      const el = document.createElement("div"); el.className = "egg-wish"; el.textContent = wish;
      layer.appendChild(el);
      Sound.sfx("nova");
      setTimeout(() => el.remove(), 9000);
    });
    $("#wish").addEventListener("click", e => { if (e.target.closest("[data-close]")) { $("#wish").hidden = true; busy = false; } });

    // ===== 🏮 Sakura: Lantern Festival =====
    function lanternFestival() {
      const sc = SCENES.sakura;
      if (!sc) return;
      mark("sakura");
      sc.festival = { t: (performance.now() - sc.t0) / 1000, lanterns: Array.from({ length: 110 }, (_, i) => ({ x: Math.random(), delay: Math.random() * 8, sp: rnd(30, 70), s: rnd(5, 13), ph: rnd(0, TAU) })) };
      Sound.sfx("festival");
      banner("🏮 Night falls, and the lantern festival begins", "", 4500);
    }

    // ===== 🕹 Neon City: Turbo Mode =====
    function turbo() {
      const sc = SCENES.neon;
      if (!sc) return;
      mark("neon");
      sc.turboUntil = performance.now() + 15000;
      document.documentElement.classList.add("turbo");
      banner(`<span class="egg-turbo">TURBO MODE</span>`, "egg-banner--big", 3500);
      Sound.sfx("turbo");
      setTimeout(() => document.documentElement.classList.remove("turbo"), 15000);
    }

    // ===== 🕵️ Noir: Case Closed =====
    function caseFile() {
      if (busy) return;
      busy = true; mark("noir");
      Sound.sfx("tick");
      const file = document.createElement("div"); file.className = "egg-case";
      file.innerHTML = `<p class="egg-case__stamp">CONFIDENTIAL</p><h3>Case No. 1947</h3>
        <p>"Somebody's been leaving notes on this wall at three in the morning, kid. They left <b>three fingerprints</b> behind. Find 'em before the trail goes cold."</p>
        <button type="button" class="chip chip--solid">Take the case</button>`;
      layer.appendChild(file);
      file.querySelector("button").addEventListener("click", () => {
        file.remove();
        const prints = Array.from({ length: 3 }, () => {
          const b = document.createElement("button");
          b.type = "button"; b.className = "egg-print"; b.setAttribute("aria-label", "A fingerprint");
          b.style.left = rnd(0.08, 0.88) * W() + "px"; b.style.top = rnd(0.18, 0.82) * H() + "px";
          b.style.transform = `rotate(${rnd(-40, 40)}deg)`;
          b.innerHTML = `<svg viewBox="0 0 40 50" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M20 4c-9 0-16 7-16 17v8"/><path d="M36 29v-8c0-10-7-17-16-17"/><path d="M20 10c-6 0-10 5-10 11v12c0 5 2 9 5 12"/><path d="M30 33V21c0-6-4-11-10-11"/><path d="M20 16c-3 0-4 2-4 5v14c0 4 2 7 4 9"/><path d="M24 44c1-3 1-6 1-9V21c0-3-2-5-5-5"/></g></svg>`;
          layer.appendChild(b);
          b.addEventListener("click", () => { b.classList.add("got"); Sound.sfx("tick"); if (prints.every(p => p.classList.contains("got"))) closeCase(true); });
          return b;
        });
        document.documentElement.classList.add("magnify");
        const left = banner("🔍 Find the 3 fingerprints. 45 seconds.", "", 0);
        const timer = setTimeout(() => closeCase(false), 45000);
        function closeCase(solved) {
          clearTimeout(timer); left.remove(); document.documentElement.classList.remove("magnify");
          prints.forEach(p => p.remove());
          const stamp = banner(solved ? `<span class="egg-stamp">CASE CLOSED</span>` : "The trail went cold. (The man under the lamp will still talk.)", solved ? "egg-banner--big" : "", 3500);
          if (solved) Sound.sfx("jazz");
          setTimeout(() => { busy = false; }, 600);
        }
      });
    }

    // ===== 🐉 Neo Tokyo: The Four Gods =====
    function fourGods() {
      const sc = SCENES.neotokyo;
      if (!sc) return;
      mark("neotokyo");
      sc.unite = { t: (performance.now() - sc.t0) / 1000 };
      Sound.sfx("fourGods");
      banner("🐉 The four elements unite", "", 4000);
    }

    // ===== 🚀 Warp Drive: Edge of the Universe =====
    function edgeOfUniverse() {
      const sc = SCENES.warp;
      if (!sc || sc.edge) return;
      mark("warp");
      sc.edge = { t: (performance.now() - sc.t0) / 1000 };
      Sound.sfx("warpBurst");
    }
    document.addEventListener("click", e => { if (e.target.closest(".warp-hud")) bump("hud"); });

    // ===== 🌀 Andromeda: First Contact =====
    const MESSAGES = [
      "GREETINGS, NEIGHBOUR. WE HAVE BEEN WATCHING YOUR WALL. WE LIKE THE CAT PHOTOS.",
      "IN FOUR BILLION YEARS OUR GALAXIES WILL MERGE. SAVE US A SEAT.",
      "WE ARE 2.5 MILLION LIGHT-YEARS AWAY. YOUR MESSAGE ARRIVED. REPLY EXPECTED IN 5 MILLION YEARS.",
      "WHO TAUGHT YOU TO MAKE SUCH BEAUTIFUL LITTLE LIGHTS? KEEP POSTING, EARTHLINGS.",
    ];
    function firstContact() {
      if (busy) return;
      busy = true; mark("andromeda");
      const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
      const box = document.createElement("div"); box.className = "egg-radio";
      box.innerHTML = `<p class="egg-radio__head">📡 INCOMING TRANSMISSION · ORIGIN: ANDROMEDA · 2.5 MILLION LIGHT-YEARS</p><canvas width="420" height="60"></canvas><p class="egg-radio__text"></p><button type="button" class="chip">Close channel</button>`;
      layer.appendChild(box);
      const cv = box.querySelector("canvas"), g = cv.getContext("2d"), out = box.querySelector(".egg-radio__text");
      let i = 0, alive = true;
      const wave = () => {
        if (!alive) return;
        g.clearRect(0, 0, 420, 60); g.strokeStyle = "#7dffb0"; g.lineWidth = 2; g.beginPath();
        const amp = i < msg.length ? 18 : 4;
        for (let x = 0; x <= 420; x += 4) { const y = 30 + Math.sin(x * 0.08 + performance.now() / 90) * amp * Math.sin(x * 0.013 + performance.now() / 400) + (Math.random() - 0.5) * amp * 0.5; x ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke(); requestAnimationFrame(wave);
      };
      wave();
      Sound.sfx("static");
      const type = setInterval(() => {
        out.textContent = msg.slice(0, ++i) + (i < msg.length ? "▌" : "");
        if (i % 2) Sound.sfx("beep");
        if (i >= msg.length) clearInterval(type);
      }, 70);
      box.querySelector("button").addEventListener("click", () => { alive = false; clearInterval(type); box.remove(); busy = false; });
    }

    return { tap, bump, roar, mark, paintConstellations, isBusy: () => busy };
  })();
  if (/[?&]debug\b/.test(location.search)) window.__glimpse = { Eggs, SCENES: () => SCENES };   // for automated tests only

  /* ---------------------------------------------------------
     28. TOGETHER & FEEL: handwriting, remixes, graffiti hour,
         the Story of the Day, living cards, spatial sound,
         haptics, night posts, badges, seasons, New Year
     --------------------------------------------------------- */

  // ===== Drawing strokes (handwriting, graffiti) =====
  const INK_COLORS = ["#1d1b19", "#2b59c3", "#c0392b", "#1e8449", "#7d3c98"];
  const SPRAY_COLORS = ["#ff3dd6", "#00e5ff", "#ffe14d", "#7dff5a", "#ff8a1f", "#b18cff", "#ffffff"];
  function strokePath(g, st, W, H, k = 1) {
    const p = st.p, X = i => (p[i] / 1000) * W, Y = i => (p[i + 1] / 1000) * H;
    g.strokeStyle = st.c; g.lineWidth = Math.max(1, (st.s / 400) * W * k); g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath(); g.moveTo(X(0), Y(0));
    if (p.length === 2) g.lineTo(X(0) + 0.1, Y(0));
    for (let i = 2; i < p.length - 2; i += 2) g.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 2)) / 2, (Y(i) + Y(i + 2)) / 2);
    if (p.length >= 4) g.lineTo(X(p.length - 2), Y(p.length - 2));
    g.stroke();
  }
  const inkCache = new Map();
  function inkImage(id, strokes, W, H, { bg = null, neon = false } = {}) {
    const key = `${id}:${W}:${strokes.length}`;
    if (inkCache.has(key)) return inkCache.get(key);
    const [c, g] = mkCanvas(W, H);
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, W, H); }
    for (const st of strokes) {
      if (neon) { g.save(); g.shadowColor = st.c; g.shadowBlur = 12; strokePath(g, st, W, H); g.restore(); }
      strokePath(g, st, W, H);
    }
    const url = c.toDataURL("image/png");
    inkCache.set(key, url);
    return url;
  }

  // ===== Handwritten thoughts =====
  const ink = { on: false, strokes: [], color: INK_COLORS[0], cur: null };
  const inkCv = $("#inkCanvas"), inkG = inkCv.getContext("2d");
  $("#inkColors").innerHTML = INK_COLORS.map((c, i) => `<button type="button" role="radio" aria-checked="${!i}" aria-label="Ink colour ${i + 1}" style="--c:${c}" data-ink="${c}"></button>`).join("");
  $("#inkColors").addEventListener("click", e => { const b = e.target.closest("[data-ink]"); if (!b) return; ink.color = b.dataset.ink; $$("#inkColors button").forEach(x => x.setAttribute("aria-checked", String(x === b))); });
  function paintInk() {
    inkG.clearRect(0, 0, 600, 600);
    for (const st of ink.strokes) strokePath(inkG, st, 600, 600);
    if (ink.cur) strokePath(inkG, ink.cur, 600, 600);
  }
  const inkPoint = e => { const r = inkCv.getBoundingClientRect(); return [clamp(Math.round(((e.clientX - r.left) / r.width) * 1000), 0, 1000), clamp(Math.round(((e.clientY - r.top) / r.height) * 1000), 0, 1000)]; };
  inkCv.addEventListener("pointerdown", e => { inkCv.setPointerCapture(e.pointerId); ink.cur = { c: ink.color, s: 8, p: inkPoint(e) }; paintInk(); });
  inkCv.addEventListener("pointermove", e => { if (!ink.cur || ink.cur.p.length >= 480) return; const [x, y] = inkPoint(e), p = ink.cur.p; if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) > 6) { p.push(x, y); paintInk(); } });
  const inkEnd = () => { if (!ink.cur) return; if (ink.cur.p.length >= 4 || ink.cur.p.length === 2) ink.strokes.push(ink.cur.p.length === 2 ? { ...ink.cur, p: [...ink.cur.p, ink.cur.p[0] + 2, ink.cur.p[1]] } : ink.cur); ink.cur = null; paintInk(); updatePostBtn(); };
  inkCv.addEventListener("pointerup", inkEnd); inkCv.addEventListener("pointercancel", inkEnd);
  $("#inkUndo").addEventListener("click", () => { ink.strokes.pop(); paintInk(); updatePostBtn(); });
  $("#inkClear").addEventListener("click", () => { ink.strokes = []; paintInk(); updatePostBtn(); });
  function setInk(on) {
    ink.on = on;
    $("#inkToggle").checked = on;
    $("#inkPad").hidden = !on;
    $("#thoughtLabel").textContent = on ? "Describe it (optional, read aloud by screen readers)" : "Your thought";
    $("#thoughtText").placeholder = on ? "e.g. a doodle of a sunrise" : "What's on your mind?";
    const tint = TINTS.find(t => t.id === thoughtTint);
    inkCv.style.background = tint ? `var(--tint-${tint.id}, #fbf3d5)` : "#fbf3d5";
    updatePostBtn();
  }
  $("#inkToggle").addEventListener("change", e => setInk(e.target.checked));

  // ===== Remixes: reply to a video or voice note with your own, played side by side =====
  let remixOf = null;
  $("#vRemix").addEventListener("click", () => {
    const p = viewing;
    if (!p) return;
    const go = () => {
      closeViewer();
      openComposer();
      remixOf = p;
      setKind(p.type === "voice" ? "voice" : "video");
      $("#remixWho").textContent = `${p.author || "someone"}'s ${p.type === "voice" ? "voice note" : "video"}`;
      $("#remixNote").hidden = false;
    };
    if (rulesAccepted()) go(); else openRules(go);
  });
  $("#remixCancel").addEventListener("click", () => { remixOf = null; $("#remixNote").hidden = true; });
  async function showRemix(p, media) {                   // in the viewer: the original beside the remix
    let orig = postById(p.remixOf);
    if (!orig) { try { orig = await store.get(p.remixOf); } catch (_) { return; } }
    if (viewing !== p) return;
    const box = document.createElement("div");
    box.className = "remix";
    box.innerHTML = `<div class="remix__side"><small>Original · ${esc(orig.author || "Anonymous")}</small>${orig.type === "voice" ? voicePlayerHTML(orig) : `<video src="${esc(orig.url)}" poster="${esc(orig.thumb || "")}" playsinline loop muted></video>`}</div>
      <div class="remix__side remix__side--mine"><small>Remix · ${esc(p.author || "Anonymous")}</small></div>`;
    const mine = media.firstElementChild;
    box.querySelector(".remix__side--mine").appendChild(mine);
    media.innerHTML = ""; media.appendChild(box);
    media.classList.add("viewer__media--remix");
    const ov = box.querySelector(".remix__side video"), oa = box.querySelector(".remix__side .vplayer audio");
    if (oa) bindVoicePlayer(box.querySelector(".remix__side .vplayer"), orig, false);
    const origEl = ov || oa, myEl = mine.querySelector?.("video, audio") || (mine.matches?.("video") ? mine : null);
    if (ov) applyClip(ov, orig);
    if (origEl && myEl) {                                 // they play and pause together
      if (oa) origEl.volume = 0.6; else origEl.muted = false;
      myEl.addEventListener("play", () => { origEl.currentTime = orig.clip ? orig.clip[0] : 0; origEl.play().catch(() => {}); });
      myEl.addEventListener("pause", () => origEl.pause());
      if (!myEl.paused) origEl.play().catch(() => {});
    }
  }

  // ===== Graffiti hour =====
  const graffiti = { open: false, cv: $("#graffitiCanvas"), color: SPRAY_COLORS[0], size: 10, cur: null, strokes: [], info: null, chipT: 0 };
  graffiti.g = graffiti.cv.getContext("2d");
  $("#graffitiColors").innerHTML = SPRAY_COLORS.map((c, i) => `<button type="button" role="radio" aria-checked="${!i}" aria-label="Colour ${i + 1}" style="--c:${c}" data-spray="${c}"></button>`).join("");
  $("#graffitiSizes").innerHTML = [5, 10, 20].map((s, i) => `<button type="button" role="radio" aria-checked="${i === 1}" aria-label="Brush ${["thin", "medium", "thick"][i]}" data-size="${s}"><i style="--s:${s / 2 + 3}px"></i></button>`).join("");
  $("#graffitiColors").addEventListener("click", e => { const b = e.target.closest("[data-spray]"); if (!b) return; graffiti.color = b.dataset.spray; $$("#graffitiColors button").forEach(x => x.setAttribute("aria-checked", String(x === b))); });
  $("#graffitiSizes").addEventListener("click", e => { const b = e.target.closest("[data-size]"); if (!b) return; graffiti.size = Number(b.dataset.size); $$("#graffitiSizes button").forEach(x => x.setAttribute("aria-checked", String(x === b))); });
  function board() {                                    // the 16:10 board, letterboxed to fit the screen
    const W = innerWidth, H = innerHeight - 70, bw = Math.min(W, H * 1.6), bh = bw / 1.6;
    return { x: (W - bw) / 2, y: (H - bh) / 2, w: bw, h: bh };
  }
  function paintGraffiti() {
    const { cv, g } = graffiti, b = board(), dpr = Math.min(devicePixelRatio || 1, 2);
    if (cv.width !== Math.round(innerWidth * dpr)) { cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    g.fillStyle = "#0b0b14"; g.fillRect(b.x, b.y, b.w, b.h);
    g.strokeStyle = "rgba(255,255,255,.08)"; g.lineWidth = 1;
    for (let x = 0; x <= 8; x++) { g.beginPath(); g.moveTo(b.x + (x / 8) * b.w, b.y); g.lineTo(b.x + (x / 8) * b.w, b.y + b.h); g.stroke(); }   // bricks
    for (let y = 0; y <= 5; y++) { g.beginPath(); g.moveTo(b.x, b.y + (y / 5) * b.h); g.lineTo(b.x + b.w, b.y + (y / 5) * b.h); g.stroke(); }
    g.save(); g.translate(b.x, b.y);
    for (const st of [...graffiti.strokes, ...(graffiti.cur ? [graffiti.cur] : [])]) { g.save(); g.shadowColor = st.c; g.shadowBlur = 10; strokePath(g, st, b.w, b.h); g.restore(); }
    g.restore();
  }
  async function openGraffiti() {
    if (needServer()) return;
    let info;
    try { info = await store.graffiti(); } catch (err) { toast(err.message); return; }
    graffiti.info = info;
    if (!info.open) {
      const at = new Date(info.startsAt);
      toast(`🎨 Graffiti hour opens at ${at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} your time (in ${fmtLeft(info.startsAt - Date.now())}). Come back and paint the wall with everyone!`);
      return;
    }
    graffiti.strokes = info.strokes; graffiti.open = true;
    $("#graffiti").hidden = false;
    paintGraffiti();
    updateGraffitiStatus();
  }
  const fmtLeft = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`; };
  function updateGraffitiStatus() {
    if (!graffiti.open || !graffiti.info) return;
    $("#graffitiStatus").textContent = `🎨 LIVE · ${fmtLeft(graffiti.info.endsAt - Date.now())} left · freezes into a mural`;
  }
  setInterval(updateGraffitiStatus, 20000);
  const gPoint = e => { const b = board(); return [clamp(Math.round(((e.clientX - b.x) / b.w) * 1000), 0, 1000), clamp(Math.round(((e.clientY - b.y) / b.h) * 1000), 0, 1000)]; };
  graffiti.cv.addEventListener("pointerdown", e => { graffiti.cv.setPointerCapture(e.pointerId); graffiti.cur = { c: graffiti.color, s: Math.round(graffiti.size * 400 / board().w * 2) || 4, p: gPoint(e) }; paintGraffiti(); });
  graffiti.cv.addEventListener("pointermove", e => {
    const cur = graffiti.cur; if (!cur) return;
    const [x, y] = gPoint(e), p = cur.p;
    if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) < 5) return;
    p.push(x, y); paintGraffiti();
    if (p.length >= 236) { sendStroke(cur); graffiti.cur = { ...cur, p: [x, y] }; }   // long strokes go in pieces
  });
  const gEnd = () => { if (graffiti.cur) { sendStroke(graffiti.cur); graffiti.cur = null; } };
  graffiti.cv.addEventListener("pointerup", gEnd); graffiti.cv.addEventListener("pointercancel", gEnd);
  async function sendStroke(st) {
    if (st.p.length === 2) st.p.push(st.p[0] + 2, st.p[1]);
    graffiti.strokes.push(st); paintGraffiti();
    Badges.award("graffiti");
    try { await store.stroke(st); } catch (err) { toast(err.message); }
  }
  function onStroke(st) { if (graffiti.open) { graffiti.strokes.push(st); paintGraffiti(); } }
  $("#graffitiClose").addEventListener("click", () => { graffiti.open = false; $("#graffiti").hidden = true; });
  addEventListener("resize", () => { if (graffiti.open) paintGraffiti(); });
  // the chip shows when it's live
  async function graffitiChip() {
    if (store?.mode !== "server") return;
    try {
      const info = await store.graffiti();
      $("#graffitiChip").classList.toggle("is-live", info.open);
      $("#graffitiChip").textContent = info.open ? "🎨 Graffiti · LIVE" : "🎨 Graffiti";
      if (info.open && !ls.get(`glimpse:graffitiToast:${new Date().toDateString()}`, false)) { ls.set(`glimpse:graffitiToast:${new Date().toDateString()}`, true); toast("🎨 Graffiti hour is LIVE: paint the wall with everyone (Discover → Graffiti)"); }
    } catch (_) {}
  }
  setTimeout(graffitiChip, 4000); setInterval(graffitiChip, 60000);

  // ===== The Story of the Day =====
  const story = { cv: $("#storyCanvas"), raf: 0, playing: false };
  story.g = story.cv.getContext("2d");
  const STORY_BG = [["#1b1040", "#5b2a86"], ["#062a3a", "#0f7a8a"], ["#2a0f1f", "#a3324e"], ["#10261a", "#2f8a4f"], ["#2b1a05", "#b8741a"], ["#0b1030", "#3949ab"]];
  function storyPosts() {
    const day = Date.now() - 864e5, score = p => postScore(p) + (p.type === "photo" || p.type === "video" ? 2 : 0);
    let list = state.posts.filter(p => !p.sealed && p.createdAt > day);
    if (list.length < 4) list = state.posts.filter(p => !p.sealed);
    return list.sort((a, b) => score(b) - score(a) || b.createdAt - a.createdAt).slice(0, 8);
  }
  async function loadImg(url) {
    if (!url) return null;
    return new Promise(res => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
  }
  async function prepareStory() {
    const posts = storyPosts();
    const imgs = await Promise.all(posts.map(p => p.type === "mural" ? loadImg(inkImage(p.id, p.strokes, 640, 400, { bg: "#0b0b14", neon: true }))
      : p.ink ? loadImg(inkImage(p.id, p.ink.strokes, 500, 500)) : loadImg(p.type === "photo" ? p.url : p.thumb)));
    return posts.map((p, i) => ({ p, img: imgs[i] }));
  }
  function wrapText(g, text, x, y, maxW, lh, maxLines) {
    const words = String(text).split(/\s+/); let line = "", n = 0;
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y + n * lh); line = w; if (++n >= maxLines - 1) { line = words.slice(words.indexOf(w)).join(" "); break; } }
      else line = t;
    }
    if (g.measureText(line).width > maxW) { while (line && g.measureText(line + "…").width > maxW) line = line.slice(0, -1); line += "…"; }
    g.fillText(line, x, y + n * lh);
  }
  function drawStory(g, scenes, t) {                     // t in seconds; 2.5s intro, 3s per post, 2.5s outro
    const W = 720, H = 1280, font = '"Bricolage Grotesque", system-ui, sans-serif';
    const n = scenes.length, total = 2.5 + n * 3 + 2.5, i = t < 2.5 ? -1 : Math.min(n, Math.floor((t - 2.5) / 3)), k = t < 2.5 ? t / 2.5 : ((t - 2.5) % 3) / 3;
    const [c1, c2] = STORY_BG[(i + 6) % STORY_BG.length];
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, c1); bg.addColorStop(1, c2);
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    for (let s = 0; s < 70; s++) { const x = (s * 97) % W, y = ((s * 53 + t * 40 * (1 + (s % 3))) % H); g.fillStyle = `rgba(255,255,255,${0.15 + (s % 5) / 12})`; g.fillRect(x, y, 2, 2); }
    g.textAlign = "center"; g.fillStyle = "#fff";
    if (i < 0) {
      g.font = `800 ${Math.round(96 + k * 10)}px ${font}`; g.globalAlpha = Math.min(1, k * 3); g.fillText("glimpse", W / 2, H * 0.42);
      g.font = `600 40px ${font}`; g.fillText("Today on the wall", W / 2, H * 0.5);
      g.font = `500 30px ${font}`; g.globalAlpha *= 0.8; g.fillText(new Date().toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" }), W / 2, H * 0.55);
      g.globalAlpha = 1;
    } else if (i >= n) {
      const q = (t - 2.5 - n * 3) / 2.5;
      g.globalAlpha = Math.min(1, q * 3);
      g.font = `800 92px ${font}`; g.fillText("glimpse", W / 2, H * 0.45);
      g.font = `600 34px ${font}`; g.fillText("Add your moment to the wall", W / 2, H * 0.52);
      if (SHARE_ORIGIN) { g.font = `500 28px ${font}`; g.globalAlpha *= 0.85; g.fillText(SHARE_ORIGIN.replace(/^https?:\/\//, ""), W / 2, H * 0.57); }
      g.globalAlpha = 1;
    } else {
      const { p, img } = scenes[i], appear = Math.min(1, k * 4), leave = 1 - Math.max(0, (k - 0.85) / 0.15);
      g.globalAlpha = appear * leave;
      const cw = W * 0.82, ch = p.type === "mural" ? cw / 1.6 : cw * (p.type === "quote" || p.type === "thought" || p.type === "voice" ? 1.05 : 1.2);
      const cx = (W - cw) / 2, cy = H * 0.44 - ch / 2 + (1 - appear) * 60;
      g.save(); g.shadowColor = "rgba(0,0,0,.45)"; g.shadowBlur = 40; g.fillStyle = p.type === "thought" ? "#fbf3d5" : p.type === "quote" ? "#141210" : "#000"; g.fillRect(cx, cy, cw, ch); g.restore();
      if (img) {                                          // slow push-in (Ken Burns)
        g.save(); g.beginPath(); g.rect(cx, cy, cw, ch); g.clip();
        const z = 1 + k * 0.08, s = Math.max(cw / img.width, ch / img.height) * z;
        g.drawImage(img, cx + (cw - img.width * s) / 2, cy + (ch - img.height * s) / 2, img.width * s, img.height * s);
        g.restore();
      } else if (p.type === "voice") {
        const peaks = wavePeaks(p, 32);
        g.fillStyle = "#7fe3ff";
        peaks.forEach((v, j) => { const bh = v * ch * 0.5 * (0.7 + 0.3 * Math.sin(t * 8 + j)); g.fillRect(cx + 40 + j * ((cw - 80) / 32), cy + ch / 2 - bh / 2, (cw - 80) / 32 - 6, bh); });
        g.font = `700 34px ${font}`; g.fillStyle = "#fff"; g.fillText("🎙 Voice note", W / 2, cy + 70);
      } else {
        g.fillStyle = p.type === "thought" ? "#2a2622" : "#f4efe6";
        g.font = p.type === "quote" ? `italic 600 46px Fraunces, Georgia, serif` : `700 46px ${font}`;
        wrapText(g, p.type === "quote" ? `“${p.text}”` : p.text || "", W / 2, cy + 110, cw - 90, 58, 9);
      }
      g.globalAlpha = appear * leave;
      g.fillStyle = "#fff"; g.font = `700 36px ${font}`;
      g.fillText(p.author || "Anonymous", W / 2, cy + ch + 70);
      const meta = [p.city ? `📍 ${p.city}` : "", p.likes ? `♥ ${p.likes}` : "", p.caption && p.type !== "voice" ? "" : ""].filter(Boolean).join("   ");
      g.font = `500 28px ${font}`; g.globalAlpha *= 0.85; g.fillText(meta, W / 2, cy + ch + 112);
      if (p.caption) { g.font = `600 32px ${font}`; g.globalAlpha = appear * leave; wrapText(g, p.caption, W / 2, cy + ch + 160, cw, 40, 2); }
      g.globalAlpha = 1;
      if (k < 0.12) {                                     // a warp-streak transition between posts
        const q = 1 - k / 0.12; g.strokeStyle = `rgba(255,255,255,${q * 0.7})`; g.lineWidth = 3;
        for (let s = 0; s < 40; s++) { const a = (s / 40) * TAU, r1 = 60 + (1 - q) * 300, r2 = r1 + 200 * q; g.beginPath(); g.moveTo(W / 2 + Math.cos(a) * r1, H / 2 + Math.sin(a) * r1); g.lineTo(W / 2 + Math.cos(a) * r2, H / 2 + Math.sin(a) * r2); g.stroke(); }
      }
    }
    g.textAlign = "left";
    return total;
  }
  function storySoundtrack(ac, dest, secs) {             // a little chord progression, made on the spot (no copyrighted music)
    const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], hzOf = m => 440 * Math.pow(2, (m - 69) / 12);
    const master = ac.createGain(); master.gain.value = 0.18; master.connect(dest);
    for (let b = 0; b * 2 < secs; b++) {
      const t0 = ac.currentTime + b * 2, ch = chords[b % 4];
      ch.forEach(m => { const o = ac.createOscillator(), gn = ac.createGain(); o.type = "triangle"; o.frequency.value = hzOf(m); gn.gain.setValueAtTime(0, t0); gn.gain.linearRampToValueAtTime(0.25, t0 + 0.3); gn.gain.linearRampToValueAtTime(0, t0 + 2); o.connect(gn); gn.connect(master); o.start(t0); o.stop(t0 + 2.05); });
      for (let n = 0; n < 4; n++) { const o = ac.createOscillator(), gn = ac.createGain(), tt = t0 + n * 0.5; o.type = "sine"; o.frequency.value = hzOf(ch[n % 3] + 12); gn.gain.setValueAtTime(0.2, tt); gn.gain.exponentialRampToValueAtTime(0.001, tt + 0.45); o.connect(gn); gn.connect(master); o.start(tt); o.stop(tt + 0.5); }
    }
  }
  let storyScenes = null;
  async function openStory() {
    $("#story").hidden = false;
    $("#storyDone").hidden = true; $("#storyStatus").textContent = "Gathering today's best moments…";
    storyScenes = await prepareStory();
    $("#storyStatus").textContent = storyScenes.length ? `${storyScenes.length} posts · about ${Math.round(5 + storyScenes.length * 3)} seconds` : "Nothing on the wall yet.";
    drawStory(story.g, storyScenes, 0.8);
  }
  function playStory(onFrame, onEnd) {
    cancelAnimationFrame(story.raf);
    const t0 = performance.now();
    const frame = () => {
      const t = (performance.now() - t0) / 1000, total = drawStory(story.g, storyScenes, t);
      onFrame?.(t, total);
      if (t < total && !$("#story").hidden) story.raf = requestAnimationFrame(frame); else onEnd?.();
    };
    frame();
  }
  $("#storyPreview").addEventListener("click", () => { if (storyScenes?.length) playStory(); });
  $("#storyRecord").addEventListener("click", async () => {
    if (!storyScenes?.length) return;
    if (!story.cv.captureStream || !window.MediaRecorder) { toast("This browser can't make videos. Try Chrome, Edge or Safari."); return; }
    const mime = ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find(m => MediaRecorder.isTypeSupported?.(m)) || "";
    const stream = story.cv.captureStream(30), total = 2.5 + storyScenes.length * 3 + 2.5;
    let ac = null;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); const dest = ac.createMediaStreamDestination(); storySoundtrack(ac, dest, total); dest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr)); } catch (_) {}
    let rec;
    try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4e6 } : undefined); }
    catch (_) { toast("Couldn't start recording in this browser."); return; }
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      ac?.close();
      const type = rec.mimeType || mime || "video/webm", blob = new Blob(chunks, { type }), ext = type.includes("mp4") ? "mp4" : "webm";
      const url = URL.createObjectURL(blob), a = $("#storyDownload");
      a.href = url; a.download = `glimpse-story-${new Date().toISOString().slice(0, 10)}.${ext}`;
      $("#storyDone").hidden = false;
      $("#storyStatus").textContent = `Your video is ready (${ext.toUpperCase()}, ${(blob.size / 1e6).toFixed(1)} MB).`;
      story.file = new File([blob], a.download, { type });
      Badges.award("story");
    };
    $("#storyRecord").disabled = true;
    rec.start(500);
    playStory(t => { $("#storyStatus").textContent = `● Recording… ${Math.ceil(total - t)}s`; }, () => { rec.stop(); $("#storyRecord").disabled = false; });
  });
  $("#storyShare").addEventListener("click", async () => {
    if (story.file && navigator.canShare?.({ files: [story.file] })) { try { await navigator.share({ files: [story.file], title: "Today on Glimpse" }); } catch (_) {} }
    else $("#storyDownload").click();
  });
  $("#story").addEventListener("click", e => { if (e.target.closest("[data-close]")) { $("#story").hidden = true; cancelAnimationFrame(story.raf); } });

  // ===== Living cards: tilt and shine =====
  let living = ls.get("glimpse:living", true);
  const setToggle = (id, on) => $(id).setAttribute("aria-checked", String(on));
  setToggle("#livingToggle", living);
  $("#livingToggle").addEventListener("click", e => { e.stopPropagation(); living = !living; ls.set("glimpse:living", living); setToggle("#livingToggle", living); if (!living) resetTilt(); else askMotion(); });
  let tilted = null;
  world.addEventListener("pointermove", e => {
    if (!living || reduceMotion || e.pointerType !== "mouse") return;
    const el = e.target.closest(".card");
    if (tilted && tilted !== el) { tilted.style.removeProperty("--rx"); tilted.style.removeProperty("--ry"); tilted.classList.remove("is-tilting"); }
    tilted = el;
    if (!el) return;
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-y * 14).toFixed(1)}deg`); el.style.setProperty("--ry", `${(x * 14).toFixed(1)}deg`);
    el.style.setProperty("--gx", `${((x + 0.5) * 100).toFixed(0)}%`); el.style.setProperty("--gy", `${((y + 0.5) * 100).toFixed(0)}%`);
    el.classList.add("is-tilting");
  });
  world.addEventListener("pointerleave", () => resetTilt());
  function resetTilt() { if (tilted) { tilted.style.removeProperty("--rx"); tilted.style.removeProperty("--ry"); tilted.classList.remove("is-tilting"); tilted = null; } document.documentElement.style.removeProperty("--tx"); document.documentElement.style.removeProperty("--ty"); }
  let motionAsked = false;
  function onTilt(e) {
    if (!living || reduceMotion || e.beta == null) return;
    const x = clamp((e.gamma || 0) / 30, -1, 1), y = clamp(((e.beta || 0) - 45) / 30, -1, 1);
    const root = document.documentElement.style;
    root.setProperty("--tx", `${(-y * 9).toFixed(1)}deg`); root.setProperty("--ty", `${(x * 9).toFixed(1)}deg`);
    root.setProperty("--gx", `${((x + 1) * 50).toFixed(0)}%`); root.setProperty("--gy", `${((y + 1) * 50).toFixed(0)}%`);
  }
  async function askMotion() {
    if (motionAsked || !matchMedia("(pointer: coarse)").matches) return;
    motionAsked = true;
    try { if (typeof DeviceOrientationEvent !== "undefined" && DeviceOrientationEvent.requestPermission) { if ((await DeviceOrientationEvent.requestPermission()) !== "granted") return; } } catch (_) { return; }
    window.addEventListener("deviceorientation", onTilt);
    document.documentElement.classList.add("gyro");
  }
  window.addEventListener("pointerdown", () => { if (living) askMotion(); }, { once: true });

  // ===== Spatial sound: the posts you fly past are the ones you hear =====
  let spatial = ls.get("glimpse:spatial", false);
  setToggle("#spatialToggle", spatial);
  const voices = new Map();                              // post id → { el, vol }
  $("#spatialToggle").addEventListener("click", e => {
    e.stopPropagation(); spatial = !spatial; ls.set("glimpse:spatial", spatial); setToggle("#spatialToggle", spatial);
    if (spatial) { Sound.enable(); toast("🎧 Fly toward a voice note or video to hear it"); } else hushAll();
  });
  function hushAll() { for (const v of voices.values()) { v.el.pause(); } voices.clear(); }
  setInterval(() => {
    if (!spatial || !Sound.isOn() || fx || !viewer.hidden || document.hidden) { if (voices.size && (!spatial || !Sound.isOn())) hushAll(); return; }
    const cx = innerWidth / 2, cy = innerHeight / 2, maxD = Math.hypot(cx, cy) * 0.6;
    const near = cards.filter(c => c.visible && c.de > 0.5 && (c.post.type === "voice" || c.post.type === "video") && !c.post.sealed)
      .map(c => ({ c, d: Math.hypot(c.sx + c.w / 2 - cx, c.sy + c.h / 2 - cy) })).filter(x => x.d < maxD).sort((a, b) => a.d - b.d).slice(0, 2);
    const keep = new Set();
    for (const { c, d } of near) {
      const p = c.post; keep.add(p.id);
      let v = voices.get(p.id);
      if (!v) {
        const el = new Audio(p.url); el.loop = true; el.volume = 0;
        if (p.clip) { el.currentTime = p.clip[0]; el.addEventListener("timeupdate", () => { if (el.currentTime >= p.clip[1]) el.currentTime = p.clip[0]; }); }
        el.play().catch(() => {});
        v = { el }; voices.set(p.id, v);
      }
      const target = Math.min(0.85, (1 - d / maxD) * (0.4 + c.de * 0.6));
      v.el.volume = clamp(v.el.volume + (target - v.el.volume) * 0.5, 0, 1);
    }
    for (const [id, v] of voices) if (!keep.has(id)) { v.el.volume = Math.max(0, v.el.volume - 0.25); if (v.el.volume <= 0.01) { v.el.pause(); voices.delete(id); } }
  }, 200);

  // ===== Haptics =====
  const canBuzz = typeof navigator.vibrate === "function";
  let haptics = ls.get("glimpse:haptics", true);
  $("#hapticsToggle").hidden = !canBuzz;
  setToggle("#hapticsToggle", haptics);
  $("#hapticsToggle").addEventListener("click", e => { e.stopPropagation(); haptics = !haptics; ls.set("glimpse:haptics", haptics); setToggle("#hapticsToggle", haptics); if (haptics) navigator.vibrate?.(30); });
  const BUZZ = {
    fireworks: [20, 40, 30, 40, 50], blackhole: [60, 30, 120], wormhole: [30, 30, 30], timewarp: [40, 60, 40], soundwave: [25, 60, 25, 60, 25],
    devourer: [30, 50, 30, 50, 30, 400, 260], dragon: [140, 40, 80], croak: [15, 30, 15], warpBurst: [120, 30, 80], hyperspace: [40, 100, 160],
    camelJump: [12], camelLaser: [30], camelAbduct: [90, 60, 90, 60, 240], supernova: [60, 40, 160], thunder: [180], alarm: [200, 100, 200, 100, 200],
    boo: [80, 50, 200], sparkle: [8], arrive: [12], seal: [20, 40, 60], capsule: [30, 30, 30, 30, 120], nova: [40, 40, 90], bigbang: [300],
  };
  function buzz(name) { if (haptics && canBuzz && !calm && BUZZ[name]) navigator.vibrate(BUZZ[name]); }

  // ===== Night posts =====
  function isNightHere(date = new Date()) {
    if (!MY_COORDS) { const hr = date.getHours(); return hr >= 19 || hr < 6; }
    const [dec, subLon] = subsolar(date), lat = MY_COORDS[0] * DEG, lon = MY_COORDS[1] * DEG;
    const elev = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(lon - subLon));
    return elev < -0.833 * DEG;
  }
  let nightNow = isNightHere();
  setInterval(() => { const n = isNightHere(); if (n !== nightNow) { nightNow = n; reloadPosts(); } }, 5 * 60e3);   // dusk or dawn: night posts appear or leave
  const nightHidden = p => p.night && !nightNow && !state.tokens[p.id];

  // ===== Badges =====
  const BADGE_INFO = {
    "first-post": ["✨", "First glimpse"], voice: ["🎙", "Found your voice"], comet: ["☄️", "Comet catcher"], supernova: ["🌟", "Saw a supernova"],
    friend: ["👥", "Made a friend"], secret: ["🥚", "Found a secret"], "secrets-all": ["🏆", "Found all 14 secrets"], graffiti: ["🎨", "Graffiti artist"],
    void: ["🕳", "Back from the Void"], night: ["🌙", "Night owl"], remix: ["🎤", "Remixer"], story: ["🎬", "Storyteller"], ink: ["✍️", "Handwriter"],
    explorer: ["🧭", "Explorer of 10 themes"], newyear: ["🎆", "Rang in the New Year"],
  };
  const Badges = (() => {
    const got = new Set(ls.get("glimpse:badges", []));
    function award(id) {
      if (got.has(id) || !BADGE_INFO[id]) return;
      got.add(id); ls.set("glimpse:badges", [...got]);
      setTimeout(() => toast(`🏅 New badge: ${BADGE_INFO[id][0]} ${BADGE_INFO[id][1]}`), 1200);
      if (store?.mode === "server") store.setBadges([...got]).catch(() => {});
      render();
    }
    function render() {
      $("#badgeCount").textContent = got.size ? `(${got.size} of ${Object.keys(BADGE_INFO).length})` : "";
      $("#myBadges").innerHTML = Object.entries(BADGE_INFO).map(([id, [e, name]]) => `<span class="badge-chip${got.has(id) ? " is-got" : ""}" title="${esc(got.has(id) ? name : "Not yet: " + name)}" aria-label="${esc(got.has(id) ? name : "Locked badge")}">${got.has(id) ? e : "·"}</span>`).join("");
    }
    render();
    const seenThemes = new Set(ls.get("glimpse:seenThemes", []));
    new MutationObserver(() => { const t = document.documentElement.dataset.theme; if (t && !seenThemes.has(t)) { seenThemes.add(t); ls.set("glimpse:seenThemes", [...seenThemes]); if (seenThemes.size >= 10) award("explorer"); } })
      .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return { award, has: id => got.has(id), list: () => [...got] };
  })();
  const badgeEmojis = ids => (ids || []).slice(0, 5).map(id => BADGE_INFO[id]?.[0] || "").join("");

  // ===== Seasons =====
  const SEASON_DATES = {                                 // dates that move every year (Eid can shift a day with the moon)
    diwali: ["2026-11-08", "2027-10-29", "2028-10-17", "2029-11-05", "2030-10-26"],
    lunar: ["2027-02-06", "2028-01-26", "2029-02-13", "2030-02-03"],
    eid: ["2027-03-10", "2027-05-16", "2028-02-27", "2028-05-05", "2029-02-15", "2029-04-24", "2030-02-05", "2030-04-13"],
  };
  function seasonFor(d = new Date()) {
    const q = new URLSearchParams(location.search).get("season");
    if (q) return q;
    const m = d.getMonth() + 1, day = d.getDate(), near = (list, before, after) => list.some(s => { const t = new Date(s + "T12:00:00"); return d >= new Date(t - before * 864e5) && d <= new Date(+t + after * 864e5); });
    if ((m === 12 && day === 31) || (m === 1 && day === 1)) return "newyear";
    if ((m === 10 && day >= 25) || (m === 11 && day === 1)) return "halloween";
    if (near(SEASON_DATES.diwali, 2, 2)) return "diwali";
    if (near(SEASON_DATES.lunar, 1, 7)) return "lunar";
    if (near(SEASON_DATES.eid, 1, 2)) return "eid";
    if (m === 12) return "winter";
    return null;
  }
  const SEASON_TEXT = { halloween: "🎃 Happy Halloween from Glimpse", winter: "❄️ Season's greetings from Glimpse", diwali: "🪔 Happy Diwali from Glimpse", lunar: "🏮 Happy Lunar New Year from Glimpse", eid: "🌙 Eid Mubarak from Glimpse", newyear: "🎆 Happy New Year's from Glimpse" };
  let seasonOn = ls.get("glimpse:seasons", true), season = null;
  setToggle("#seasonToggle", seasonOn);
  $("#seasonToggle").addEventListener("click", e => { e.stopPropagation(); seasonOn = !seasonOn; ls.set("glimpse:seasons", seasonOn); setToggle("#seasonToggle", seasonOn); applySeason(); });
  function applySeason() {
    const box = $("#season");
    const s = seasonOn ? seasonFor() : null;
    if (season) document.documentElement.classList.remove(`season-${season}`);
    season = s; box.innerHTML = "";
    if (!s) return;
    document.documentElement.classList.add(`season-${s}`);
    const SVG = {
      bat: `<svg viewBox="0 0 64 28"><path d="M32 10c3-6 6-6 6-6s-1 5 2 7c4-6 14-8 24-4-6 2-9 7-9 12-4-3-9-2-12 1-2-3-6-4-11-4s-9 1-11 4c-3-3-8-4-12-1 0-5-3-10-9-12 10-4 20-2 24 4 3-2 2-7 2-7s3 0 6 6z" fill="#130a1d"/></svg>`,
      pumpkin: `<svg viewBox="0 0 80 70"><path d="M40 12c-4-8 4-12 6-8" stroke="#3a5d1c" stroke-width="5" fill="none"/><ellipse cx="22" cy="42" rx="18" ry="24" fill="#e8741c"/><ellipse cx="58" cy="42" rx="18" ry="24" fill="#e8741c"/><ellipse cx="40" cy="42" rx="20" ry="26" fill="#f08a24"/><path d="M26 34l8 6h-10zM54 34l-8 6h10zM28 50q12 10 24 0l-4 6-4-3-4 4-4-4-4 3z" fill="#ffd34d"/></svg>`,
      diya: `<svg viewBox="0 0 60 50"><path d="M6 28h48q-4 16-24 16T6 28z" fill="#c2552d"/><path d="M6 28h48" stroke="#ffd36a" stroke-width="3"/><path class="flame" d="M30 26q-8-10 0-22 8 12 0 22z" fill="#ffcc33"/></svg>`,
      lantern: `<svg viewBox="0 0 50 90"><path d="M25 0v10" stroke="#a3000f" stroke-width="2"/><rect x="18" y="8" width="14" height="5" fill="#e0b13a"/><ellipse cx="25" cy="38" rx="22" ry="26" fill="#d71a1a"/><path d="M25 12v52M10 20q-4 18 0 36M40 20q4 18 0 36" stroke="#a3000f" stroke-width="2" fill="none"/><rect x="18" y="62" width="14" height="5" fill="#e0b13a"/><path d="M22 67v20M25 67v22M28 67v20" stroke="#e0b13a" stroke-width="2"/></svg>`,
      fanous: `<svg viewBox="0 0 50 90"><path d="M25 0v12" stroke="#d6b45a" stroke-width="2"/><path d="M15 12h20l6 14-6 40H15L9 26z" fill="#2a1d4a" stroke="#d6b45a" stroke-width="2"/><path d="M15 26h20v34H15z" fill="#ffd36a" opacity=".8"/><path d="M25 66l-6 12h12z" fill="#d6b45a"/></svg>`,
    };
    const add = (html, cls, style) => { const el = document.createElement("div"); el.className = cls; el.innerHTML = html; if (style) el.setAttribute("style", style); box.appendChild(el); };
    if (s === "halloween") {
      for (let i = 0; i < 5; i++) add(SVG.bat, "season__bat", `top:${8 + i * 13}%;animation-delay:${-i * 3.1}s;animation-duration:${14 + i * 3}s`);
      add(SVG.pumpkin, "season__pumpkin", "left:12px"); add(SVG.pumpkin, "season__pumpkin season__pumpkin--r", "right:12px");
    }
    if (s === "winter" || s === "newyear") {
      const n = 26; let bulbs = "";
      for (let i = 0; i < n; i++) { const x = (i + 0.5) * (100 / n), y = 10 + Math.sin(i * 0.9) * 6; bulbs += `<circle cx="${x}" cy="${y + 4}" r="1.2" class="bulb" style="--h:${(i * 47) % 360};animation-delay:${-i * 0.37}s"/>`; }
      add(`<svg viewBox="0 0 100 24" preserveAspectRatio="none"><path d="M0 10${Array.from({ length: n }, (_, i) => ` L${(i + 0.5) * (100 / n)} ${10 + Math.sin(i * 0.9) * 6}`).join("")} L100 10" stroke="#2b2b2b" stroke-width=".4" fill="none"/>${bulbs}</svg>`, "season__lights");
      for (let i = 0; i < 40; i++) add("", "season__flake", `left:${Math.random() * 100}%;animation-delay:${-Math.random() * 12}s;animation-duration:${8 + Math.random() * 8}s;--s:${2 + Math.random() * 4}px`);
    }
    if (s === "diwali") { for (let i = 0; i < 9; i++) add(SVG.diya, "season__diya", `left:${4 + i * 11.5}%;animation-delay:${-i * 0.3}s`); }
    if (s === "lunar") { for (let i = 0; i < 5; i++) add(SVG.lantern, "season__lantern", `left:${6 + i * 21}%;animation-delay:${-i * 0.8}s`); }
    if (s === "eid") { add(`<svg viewBox="0 0 80 80"><path d="M50 10a30 30 0 1 0 20 50A26 26 0 1 1 50 10z" fill="#ffe08a"/><path d="M62 22l3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1z" fill="#ffe08a"/></svg>`, "season__moon"); for (let i = 0; i < 4; i++) add(SVG.fanous, "season__lantern", `left:${8 + i * 26}%;animation-delay:${-i * 0.9}s`); }
    const key = `glimpse:seasonHi:${s}:${new Date().toDateString()}`;
    if (!ls.get(key, false)) { ls.set(key, true); setTimeout(() => toast(SEASON_TEXT[s] || ""), 2500); }
  }
  applySeason();
  setInterval(applySeason, 60 * 60e3);

  // ===== New Year: a countdown and fireworks at your midnight; the wave around the globe =====
  function newYearWatch() {
    const sim = Number(new URLSearchParams(location.search).get("newyear"));    // ?newyear=15 → midnight in 15 seconds (testing)
    const target = sim ? Date.now() + sim * 1000 : new Date(new Date().getFullYear() + 1, 0, 1).getTime();
    const left = target - Date.now();
    if (left > 3600e3 && !sim) { setTimeout(newYearWatch, Math.min(left - 3500e3, 6 * 3600e3)); return; }
    const box = $("#nyCountdown"), year = sim ? new Date().getFullYear() + 1 : new Date(target + 1000).getFullYear();
    const tick = setInterval(() => {
      const s = Math.ceil((target - Date.now()) / 1000);
      if (s <= 10 && s > 0) { box.hidden = false; box.textContent = s; box.classList.remove("pulse"); void box.offsetWidth; box.classList.add("pulse"); Sound.sfx("tick"); }
      if (s <= 0) {
        clearInterval(tick);
        box.innerHTML = `<span>Happy New Year</span><b>${year}</b>`; box.classList.add("happy");
        Badges.award("newyear");
        let n = 0; const boom = () => { if (!fx && cards.length && !reduceMotion) startFx("fireworks", "all"); if (++n < 3) setTimeout(boom, 2800); };
        boom();
        setTimeout(() => { box.hidden = true; box.classList.remove("happy"); }, 9000);
      }
    }, 250);
  }
  newYearWatch();
  // the wave on the globe (drawn by the Earth panel)
  const NY_CITIES = [["Auckland", 174.8], ["Sydney", 151.2], ["Tokyo", 139.7], ["Seoul", 127], ["Shanghai", 121.5], ["Kolkata", 88.4], ["Dubai", 55.3], ["Moscow", 37.6], ["Nairobi", 36.8], ["Cairo", 31.2], ["Berlin", 13.4], ["Lagos", 3.4], ["London", -0.1], ["São Paulo", -46.6], ["New York", -74], ["Chicago", -87.6], ["Denver", -105], ["Los Angeles", -118.2], ["Honolulu", -157.8]];
  function newYearLon(date) { const h = date.getUTCHours() + date.getUTCMinutes() / 60; return ((-h * 15 + 540) % 360) - 180; }
  $("#newYearBtn")?.addEventListener("click", () => {
    earth.newYear = { t: performance.now(), from: Date.UTC(new Date().getUTCFullYear(), 11, 31, 10) };
    $("#earthInfo").textContent = "🎆 Watch midnight roll around the planet: fireworks wherever the new year arrives.";
  });
  function drawNewYear(g, S, now) {                     // called by the Earth panel each frame while the wave is playing
    let date, sim = !!earth.newYear;
    if (sim) {
      const k = (now - earth.newYear.t) / 20000;
      if (k >= 1) { earth.newYear = null; return; }
      date = new Date(earth.newYear.from + k * 26 * 3600e3);
    } else {                                             // the real thing, from New Year's Eve morning (UTC) to New Year's Day noon
      const d = new Date(), m = d.getUTCMonth(), day = d.getUTCDate(), h = d.getUTCHours();
      if (!((m === 11 && day === 31 && h >= 10) || (m === 0 && day === 1 && h < 12))) return;
      date = d;
    }
    const mlon = newYearLon(date);
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 16; i++) {                       // fireworks along the midnight line
      const lat = -60 + Math.random() * 130, p = project(lat * DEG, (mlon + rnd(-4, 4)) * DEG, S);
      if (p.z <= 0.05) continue;
      glow(g, p.x, p.y, rnd(3, 9), `hsla(${rnd(0, 360)}, 100%, 70%, ALPHA)`, 0.9);
    }
    g.strokeStyle = "rgba(255, 220, 120, .7)"; g.lineWidth = 2; g.beginPath();
    for (let lat = -80; lat <= 80; lat += 4) { const p = project(lat * DEG, mlon * DEG, S); if (p.z > 0) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }
    g.stroke();
    g.globalCompositeOperation = "source-over";
    const city = NY_CITIES.find(([, lon]) => Math.abs(((lon - mlon + 540) % 360) - 180) < 6);
    if (city) $("#earthInfo").textContent = `🎆 It's midnight in ${city[0]}: happy New Year!`;
    if (sim) earth.lon = -mlon;                           // follow the wave
  }

  /* ---------------------------------------------------------
     19. COMMUNITY: rules, reporting, blocking
     --------------------------------------------------------- */
  // A random ID for this browser/app. It never leaves as-is: the server turns it into an
  // anonymous poster ID, so people can be blocked or banned without knowing who they are.
  const deviceId = (() => { let id = ls.get("glimpse:device", null); if (!id) { id = uid(); ls.set("glimpse:device", id); } return id; })();
  const blockKey = p => p.authorId || `name:${p.author || ""}`;
  function screen(list) { return list.filter(p => !state.hiddenIds.has(p.id) && !state.blocked.has(blockKey(p)) && !nightHidden(p)); }
  const rulesAccepted = () => ls.get("glimpse:rulesAccepted", false);

  let afterRules = null, rulesReturn = null;
  function openRules(then) {
    afterRules = then || null;
    rulesReturn = document.activeElement;
    const accepted = rulesAccepted();
    $("#rulesAccept").textContent = accepted && !then ? "Got it" : "I agree";
    const info = $("#blockedInfo");
    const nb = state.blocked.size, nh = state.hiddenIds.size;
    info.hidden = !nb && !nh;
    if (nb || nh) {
      info.innerHTML = `On this device you've blocked ${nb} ${nb === 1 ? "person" : "people"} and reported ${nh} ${nh === 1 ? "post" : "posts"}. <button type="button" class="link-btn" id="unblockAll">Show them again</button>`;
    }
    $("#rules").hidden = false;
    $("#rulesAccept").focus();
  }
  function closeRules() { $("#rules").hidden = true; afterRules = null; rulesReturn?.focus?.(); }
  $("#rulesAccept").addEventListener("click", () => {
    ls.set("glimpse:rulesAccepted", true);
    const then = afterRules;
    closeRules();
    then?.();
  });
  $("#rules").addEventListener("click", async e => {
    if (e.target.closest("[data-close]")) closeRules();
    if (e.target.id === "unblockAll") {
      state.blocked.clear(); state.hiddenIds.clear();
      ls.set("glimpse:blocked", []); ls.set("glimpse:hiddenPosts", []);
      try { state.posts = screen(await store.list()); } catch (_) {}
      buildWall(false);
      closeRules();
      toast("Everyone's posts are showing again");
    }
  });

  // Report
  const reportForm = $("#reportForm");
  let reporting = null;
  function closeReport() { $("#report").hidden = true; reporting = null; }
  $("#vReport").addEventListener("click", () => {
    reporting = viewing;
    $("#reportTitle").textContent = "Report this post";
    reportForm.reset();
    $("#reportSend").disabled = true;
    $("#reportUrgent").hidden = true;
    $("#report").hidden = false;
    reportForm.querySelector("input[name=reason]").focus();
  });
  reportForm.addEventListener("change", () => {
    const r = reportForm.querySelector("input[name=reason]:checked");
    $("#reportSend").disabled = !r;
    $("#reportUrgent").hidden = r?.value !== "self-harm";
  });
  reportForm.addEventListener("submit", async e => {
    e.preventDefault();
    const p = reporting, r = reportForm.querySelector("input[name=reason]:checked");
    if (!p || !r) return;
    $("#reportSend").disabled = true;
    if (p.kind === "reply") {                            // reporting a reply, not the post
      try { await store.reportReply(p.post.id, p.rid, r.value, $("#reportNote").value.trim()); }
      catch (err) { toast(err.message); $("#reportSend").disabled = false; return; }
      state.hiddenReplies.add(p.rid);
      ls.set("glimpse:hiddenReplies", [...state.hiddenReplies]);
      p.post._replies = (p.post._replies || []).filter(x => x.id !== p.rid);
      if (viewing === p.post) renderReplies(p.post);
      closeReport();
      toast("Thanks for reporting. That reply is now hidden for you.");
      return;
    }
    try {
      await store.report(p.id, r.value, $("#reportNote").value.trim());
    } catch (err) { toast(err.message); $("#reportSend").disabled = false; return; }
    state.hiddenIds.add(p.id);
    ls.set("glimpse:hiddenPosts", [...state.hiddenIds]);
    state.posts = screen(state.posts);
    closeReport();
    closeViewer();
    buildWall(false);
    toast("Thanks for reporting. That post is now hidden for you.");
  });
  $("#report").addEventListener("click", e => { if (e.target.closest("[data-close]")) closeReport(); });

  // Block: hide everything from this person, on this device
  $("#vBlock").addEventListener("click", () => {
    const p = viewing, name = p.author && p.author !== "Anonymous" ? p.author : "this person";
    if (!confirm(`Hide all posts from ${name}? You won't see their posts on this device. You can undo this from Community rules.`)) return;
    state.blocked.add(blockKey(p));
    ls.set("glimpse:blocked", [...state.blocked]);
    state.posts = screen(state.posts);
    closeViewer();
    buildWall(false);
    toast(`Posts from ${name} are hidden`);
  });
  /* ---------------------------------------------------------
     20. CREATIVE POSTING: photo filters, video trimming,
         voice notes, link-preview images
     --------------------------------------------------------- */

  // ----- Photo filters (pixel recipes; each theme has a matching look) -----
  const PHOTO_FILTERS = [
    { id: "none", label: "Original", themes: [] },
    { id: "noir", label: "Noir", themes: ["noir", "dark"] },
    { id: "vintage", label: "Vintage", themes: ["gallery", "light"] },
    { id: "neon", label: "Neon", themes: ["neon", "neotokyo"] },
    { id: "aurora", label: "Aurora", themes: ["aurora", "universe", "warp"] },
    { id: "ocean", label: "Ocean", themes: ["ocean"] },
    { id: "sakura", label: "Sakura", themes: ["sakura"] },
    { id: "golden", label: "Golden", themes: ["sahara"] },
    { id: "jungle", label: "Jungle", themes: ["amazon"] },
  ];
  const c255 = v => (v < 0 ? 0 : v > 255 ? 255 : v);
  function filterFn(id) {
    const vignette = (x, y, w, h, k) => { const dx = x / w - 0.5, dy = y / h - 0.5; return 1 - k * (dx * dx + dy * dy) * 2; };
    const sat = (r, g, b, s) => { const L = 0.299 * r + 0.587 * g + 0.114 * b; return [L + (r - L) * s, L + (g - L) * s, L + (b - L) * s]; };
    const per = fn => (d, w, h) => {
      for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
        const [r, g, b] = fn(d[i], d[i + 1], d[i + 2], x, y, w, h);
        d[i] = c255(r); d[i + 1] = c255(g); d[i + 2] = c255(b);
      }
    };
    switch (id) {
      case "noir": return per((r, g, b, x, y, w, h) => {
        let L = 0.299 * r + 0.587 * g + 0.114 * b;
        L = ((L - 128) * 1.4 + 128 + (Math.random() - 0.5) * 18) * vignette(x, y, w, h, 0.45);
        return [L, L, L];
      });
      case "vintage": return per((r, g, b, x, y, w, h) => {
        const v = vignette(x, y, w, h, 0.3);
        return [(20 + (0.393 * r + 0.769 * g + 0.189 * b) * 0.85) * v, (18 + (0.349 * r + 0.686 * g + 0.168 * b) * 0.85) * v, (14 + (0.272 * r + 0.534 * g + 0.131 * b) * 0.85) * v];
      });
      case "neon": return per((r, g, b) => {
        const t = Math.min(1, Math.max(0, ((0.299 * r + 0.587 * g + 0.114 * b) / 255 - 0.5) * 1.2 + 0.5));
        const A = [26, 6, 56], M = [255, 43, 214], Z = [127, 246, 255];
        const mix = (p, q, k) => p.map((v, i) => v + (q[i] - v) * k);
        return t < 0.5 ? mix(A, M, t * 2) : mix(M, Z, (t - 0.5) * 2);
      });
      case "aurora": return per((r, g, b) => sat(r * 0.85, g * 1.04 + 8, b * 1.12 + 18, 1.15));
      case "ocean": return per((r, g, b) => sat(r * 0.78, g * 0.98 + 8, b * 1.15 + 24, 1.05));
      case "sakura": return per((r, g, b) => [r * 0.94 + 26, g * 0.88 + 12, b * 0.92 + 26]);
      case "golden": return per((r, g, b) => { const [R, G, B] = sat(r, g, b, 1.1); return [(R * 1.12 + 14 - 128) * 1.06 + 128, G * 1.0 + 4, B * 0.8]; });
      case "jungle": return per((r, g, b) => sat(r * 0.88, g * 1.1 + 6, b * 0.86, 1.18));
      default: return null;
    }
  }
  function setupFilters() {
    const box = $("#filters"), src = prepared?.source;
    if (!src) return;
    const theme = document.documentElement.dataset.theme;
    box.innerHTML = PHOTO_FILTERS.map(f => {
      const match = f.themes.includes(theme);
      return `<button type="button" class="filter" role="radio" aria-checked="${f.id === photoFilter}" data-filter="${f.id}"${match ? ' title="Matches your theme"' : ""}>
        <canvas width="72" height="72"></canvas><span>${f.label}${match ? " ✨" : ""}</span></button>`;
    }).join("");
    // little previews of each look
    const sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight, side = Math.min(sw, sh);
    box.querySelectorAll(".filter").forEach(btn => {
      const cv = btn.querySelector("canvas"), g = cv.getContext("2d");
      g.drawImage(src, (sw - side) / 2, (sh - side) / 2, side, side, 0, 0, 72, 72);
      const fn = filterFn(btn.dataset.filter);
      if (fn) { const img = g.getImageData(0, 0, 72, 72); fn(img.data, 72, 72); g.putImageData(img, 0, 0); }
    });
    box.hidden = false;
  }
  $("#filters").addEventListener("click", async e => {
    const b = e.target.closest(".filter");
    if (!b || !prepared?.source) return;
    photoFilter = b.dataset.filter;
    $$("#filters .filter").forEach(x => x.setAttribute("aria-checked", String(x === b)));
    const t = await toJpeg(prepared.source, THUMB_MAX_PX, 0.85, filterFn(photoFilter));
    const img = $("#dropPreview img");
    if (img) { const old = img.src; img.src = URL.createObjectURL(t.blob); if (old !== prepared.previewUrl) URL.revokeObjectURL(old); }
  });

  // ----- Video trimmer: choose which 30 seconds to post -----
  function setupTrim() {
    const d = prepared.duration, start = $("#trimStart"), len = $("#trimLen");
    len.max = String(Math.min(MAX_VIDEO_SECONDS, Math.floor(d)));
    len.value = len.max;
    start.max = String(Math.max(0, d - Number(len.value)).toFixed(1));
    start.value = "0";
    $("#trimTitle").textContent = `This video is ${fmtDur(d)} long. Choose up to ${MAX_VIDEO_SECONDS} seconds to post:`;
    $("#trim").hidden = false;
    const vid = $("#dropPreview video");
    if (vid) vid.addEventListener("timeupdate", () => { const [a, b] = prepared?.clip || [0, 0]; if (vid.currentTime >= b || vid.currentTime < a - 0.3) vid.currentTime = a; });
    updateTrim(true);
  }
  function updateTrim(seek) {
    if (!prepared?.clip) return;
    const d = prepared.duration, start = $("#trimStart"), len = $("#trimLen");
    const L = Number(len.value);
    start.max = String(Math.max(0, d - L).toFixed(1));
    const a = Math.min(Number(start.value), d - L);
    prepared.clip = [Math.max(0, a), Math.max(0, a) + L];
    $("#trimRange").textContent = `${fmtDur(prepared.clip[0])} – ${fmtDur(prepared.clip[1])} (${Math.round(L)} seconds)`;
    const meta = $("#dropPreview .meta"); if (meta) meta.textContent = fmtDur(L);
    const vid = $("#dropPreview video");
    if (vid && seek) vid.currentTime = prepared.clip[0];
  }
  $("#trimStart").addEventListener("input", () => updateTrim(true));
  $("#trimLen").addEventListener("input", () => updateTrim(false));

  // ----- Voice notes: record (or upload) up to 30 seconds -----
  let rec = null;
  const recBtn = $("#recBtn"), recStatus = $("#recStatus"), recWave = $("#recWave");
  function recorderUI(mode) {
    $("#recorder").dataset.mode = mode;
    recBtn.setAttribute("aria-label", mode === "recording" ? "Stop recording" : "Start recording");
    $("#recorder").hidden = mode === "done";
    $("#recDone").hidden = mode !== "done";
    $("#recAgain").hidden = mode !== "done";
    $("#recOr").textContent = mode === "done" ? "· or" : "or";
    if (mode === "idle") recStatus.textContent = "Tap the red button to record up to 30 seconds.";
    if (mode === "busy") recStatus.textContent = "Preparing your voice note…";
    if (mode === "done" && voicePrepared) {
      $("#recDone").innerHTML = voicePlayerHTML({ ...voicePrepared, url: voicePrepared.previewUrl, author: authorName.value || "you", id: "preview" });
      bindVoicePlayer($("#recDone .vplayer"), voicePrepared, false);
    }
  }
  function clearVoice() {
    if (voicePrepared?.previewUrl) URL.revokeObjectURL(voicePrepared.previewUrl);
    voicePrepared = null;
    $("#recDone").innerHTML = "";
    $("#audioInput").value = "";
    recorderUI("idle");
    const g = recWave.getContext("2d"); g.clearRect(0, 0, recWave.width, recWave.height);
    updatePostBtn();
  }
  async function prepareVoice(blob, name = "voice-note") {
    if (blob.size > 12e6) throw new Error("That recording is too large (12 MB at most).");
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error("This browser can't read audio files.");
    const ac = new AC();
    let audio;
    try { audio = await ac.decodeAudioData(await blob.arrayBuffer()); }
    catch (_) { throw new Error("Couldn't read that audio. Try an M4A, MP3 or WAV file."); }
    finally { ac.close?.(); }
    const d = audio.duration;
    if (d > MAX_VIDEO_SECONDS + 0.5) throw new Error(`That's ${Math.round(d)} seconds long. Voice notes can be up to ${MAX_VIDEO_SECONDS} seconds.`);
    if (d < 0.4) throw new Error("That recording is too short.");
    const ch = audio.getChannelData(0), N = 48, step = Math.max(1, Math.floor(ch.length / N));
    let peaks = [];
    for (let i = 0; i < N; i++) { let m = 0; for (let j = i * step, end = Math.min(ch.length, (i + 1) * step); j < end; j += 8) m = Math.max(m, Math.abs(ch[j])); peaks.push(m); }
    const max = Math.max(...peaks, 0.01);
    peaks = peaks.map(v => Math.round(Math.pow(v / max, 0.8) * 100) / 100);
    const t = blob.type || "audio/webm";
    const ext = /mp4|m4a|aac/.test(t) ? "m4a" : /ogg/.test(t) ? "ogg" : /mpeg|mp3/.test(t) ? "mp3" : /wav/.test(t) ? "wav" : "weba";
    return { kind: "voice", media: new File([blob], `${name}.${ext}`, { type: t }), mediaName: `${name}.${ext}`, duration: Math.round(d * 100) / 100, peaks, previewUrl: URL.createObjectURL(blob) };
  }
  async function startRecording() {
    errorEl.textContent = "";
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { errorEl.textContent = "Recording isn't available in this browser. Upload an audio file instead."; return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (_) { errorEl.textContent = "Glimpse needs permission to use your microphone. Allow it in your browser or phone settings, or upload an audio file."; return; }
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"].find(m => MediaRecorder.isTypeSupported?.(m)) || "";
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC(), an = ac.createAnalyser();
    an.fftSize = 1024;
    ac.createMediaStreamSource(stream).connect(an);
    rec = { mr, stream, ac, an, t0: performance.now(), levels: [], raf: 0, timer: 0 };
    mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      const r = rec; rec = null;
      stream.getTracks().forEach(t => t.stop());
      cancelAnimationFrame(r.raf); clearTimeout(r.timer); ac.close?.();
      recorderUI("busy");
      try { voicePrepared = await prepareVoice(new Blob(chunks, { type: mr.mimeType || mime || "audio/webm" })); recorderUI("done"); }
      catch (err) { errorEl.textContent = err.message; recorderUI("idle"); }
      updatePostBtn();
    };
    mr.start(250);
    rec.timer = setTimeout(stopRecording, MAX_VIDEO_SECONDS * 1000);
    recorderUI("recording");
    drawLevels();
  }
  function stopRecording() { if (rec && rec.mr.state !== "inactive") rec.mr.stop(); }
  function drawLevels() {
    if (!rec) return;
    const g = recWave.getContext("2d"), W = recWave.width, H = recWave.height;
    const buf = new Uint8Array(rec.an.fftSize);
    rec.an.getByteTimeDomainData(buf);
    let sum = 0; for (const v of buf) sum += ((v - 128) / 128) ** 2;
    rec.levels.push(Math.min(1, Math.sqrt(sum / buf.length) * 4));
    const secs = (performance.now() - rec.t0) / 1000;
    recStatus.textContent = `Recording… ${fmtDur(secs)} / 0:${MAX_VIDEO_SECONDS}. Tap again to stop.`;
    g.clearRect(0, 0, W, H);
    const bars = Math.floor(W / 7), from = Math.max(0, rec.levels.length - bars);
    g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--danger").trim() || "#e5334b";
    rec.levels.slice(from).forEach((v, i) => { const bh = Math.max(3, v * H); g.fillRect(i * 7, (H - bh) / 2, 4, bh); });
    rec.raf = requestAnimationFrame(drawLevels);
  }
  recBtn.addEventListener("click", () => (rec ? stopRecording() : startRecording()));
  $("#recAgain").addEventListener("click", clearVoice);
  $("#audioInput").addEventListener("change", async () => {
    const f = $("#audioInput").files[0];
    if (!f) return;
    stopRecording();
    errorEl.textContent = "";
    recorderUI("busy");
    try { voicePrepared = await prepareVoice(f, (f.name || "voice").replace(/\.[^.]+$/, "")); recorderUI("done"); }
    catch (err) { errorEl.textContent = err.message; recorderUI("idle"); }
    updatePostBtn();
  });

  // ----- "Answer today's question" -----
  $("#promptText").textContent = PROMPTS[todayPrompt()];
  function answerToday() {
    const go = () => { openComposer(); setKind("thought"); $("#promptToggle").checked = true; thoughtText.focus(); };
    if (rulesAccepted()) go(); else openRules(go);
  }

  // ----- Link-preview image (1200×630), drawn at upload time -----
  async function makeOgImage(d) {
    const W = 1200, H = 630;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    const ui = '"Bricolage Grotesque", system-ui, sans-serif', serif = 'Fraunces, Georgia, serif';
    const wrap = (text, maxW, font, maxLines) => {
      g.font = font;
      const words = String(text).split(/\s+/), lines = [];
      let line = "";
      for (const w of words) {
        const t = line ? line + " " + w : w;
        if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
        if (lines.length === maxLines) break;
      }
      if (lines.length < maxLines && line) lines.push(line);
      if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…";
      return lines;
    };
    const fitText = (text, maxW, maxH, family, weight, start, min) => {
      for (let size = start; size >= min; size -= 4) {
        const lines = wrap(text, maxW, `${weight} ${size}px ${family}`, 20);
        if (lines.length * size * 1.15 <= maxH) return { size, lines };
      }
      return { size: min, lines: wrap(text, maxW, `${weight} ${min}px ${family}`, Math.floor(maxH / (min * 1.15))) };
    };
    const wordmark = (color = "rgba(255,255,255,.9)") => { g.font = `800 34px ${ui}`; g.fillStyle = color; g.textAlign = "right"; g.fillText("glimpse", W - 44, H - 40); g.textAlign = "left"; };
    const cover = img => { const k = Math.max(W / img.width, H / img.height); g.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k); };
    const by = d.author || "Anonymous";
    if (d.opensAt) {                                       // sealed: show the capsule, never the contents
      const gr = g.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, W * 0.7); gr.addColorStop(0, "#3b2a7a"); gr.addColorStop(1, "#08061a");
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      const cx = 300, cy = H / 2, cw = 130, ch = 230;
      const cg = g.createLinearGradient(cx - cw / 2, 0, cx + cw / 2, 0); cg.addColorStop(0, "#7d6ac9"); cg.addColorStop(0.35, "#f3eaff"); cg.addColorStop(1, "#4f3d9c");
      g.shadowColor = "rgba(190,160,255,.8)"; g.shadowBlur = 60; g.fillStyle = cg;
      g.beginPath(); g.roundRect(cx - cw / 2, cy - ch / 2, cw, ch, cw / 2); g.fill(); g.shadowBlur = 0;
      g.fillStyle = "#f4c45c"; g.fillRect(cx - cw / 2 - 8, cy - 14, cw + 16, 28);
      g.fillStyle = "#fff"; g.font = `700 26px ${ui}`; g.fillText("TIME CAPSULE", 500, 230);
      g.font = `800 56px ${ui}`; wrap(`from ${by}`, 640, g.font, 2).forEach((l, i) => g.fillText(l, 500, 300 + i * 64));
      g.fillStyle = "#ffe7ad"; g.font = `500 32px ${ui}`; g.fillText(`Opens ${new Date(d.opensAt).toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric" })}`, 500, 430);
      wordmark();
    } else if (d.type === "photo" || d.type === "video") {
      const img = await createImageBitmap(d.type === "photo" ? d.media : d.thumb);
      cover(img); img.close?.();
      const sh = g.createLinearGradient(0, H * 0.45, 0, H); sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,.75)");
      g.fillStyle = sh; g.fillRect(0, 0, W, H);
      if (d.type === "video") { g.fillStyle = "rgba(0,0,0,.45)"; g.beginPath(); g.arc(W / 2, H / 2 - 30, 64, 0, Math.PI * 2); g.fill(); g.fillStyle = "#fff"; g.beginPath(); g.moveTo(W / 2 - 18, H / 2 - 64); g.lineTo(W / 2 + 34, H / 2 - 30); g.lineTo(W / 2 - 18, H / 2 + 4); g.fill(); }
      g.fillStyle = "#fff";
      if (d.caption) { g.font = `700 48px ${ui}`; wrap(d.caption, W - 360, g.font, 2).forEach((l, i, a) => g.fillText(l, 48, H - 70 - (a.length - 1 - i) * 56)); }
      g.font = `500 28px ${ui}`; g.globalAlpha = 0.85; g.fillText(by, 48, H - 30); g.globalAlpha = 1;
      wordmark();
    } else if (d.type === "voice") {
      const hue = hashOf(by) % 360;
      const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, `hsl(${hue},55%,22%)`); gr.addColorStop(1, `hsl(${(hue + 50) % 360},60%,12%)`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      const peaks = JSON.parse(d.peaks || "[]"), n = 48, bw = (W - 200) / n;
      g.fillStyle = `hsl(${hue},90%,72%)`;
      for (let i = 0; i < n; i++) { const v = Math.max(0.06, peaks[Math.floor((i / n) * peaks.length)] || 0.2), bh = v * 260; g.beginPath(); g.roundRect(100 + i * bw, 250 - bh / 2, bw * 0.55, bh, 4); g.fill(); }
      g.fillStyle = "#fff"; g.font = `700 30px ${ui}`; g.fillText(`🎙  Voice note · ${fmtDur(d.duration || 0)}`, 100, 90);
      if (d.caption) { g.font = `700 44px ${ui}`; wrap(d.caption, W - 360, g.font, 2).forEach((l, i) => g.fillText(l, 100, 470 + i * 52)); }
      g.font = `500 28px ${ui}`; g.globalAlpha = 0.85; g.fillText(by, 100, H - 40); g.globalAlpha = 1;
      wordmark();
    } else {                                               // quote or thought: the words themselves
      const quote = d.type === "quote";
      const QB = { ink: ["#141210", "#f4efe6", serif, "italic 500"], paper: ["#f3ede2", "#1d1b19", serif, "500"], sun: ["#ffcf3a", "#1d1b19", 'Anton, Impact, sans-serif', "400"], bloom: ["#ffb3c7", "#2a1235", ui, "800"] };
      const TB = { cream: "#fbf3d5", mint: "#d6f0e0", sky: "#d9e7fa", blush: "#fadde1" };
      const [bg, fg, fam, wt] = quote ? (QB[d.style] || QB.ink) : [TB[d.tint] || TB.cream, "#2a2622", ui, "600"];
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      const text = d.style === "sun" ? d.text.toUpperCase() : d.text;
      const { size, lines } = fitText(quote ? `“${text}”` : text, W - 160, H - 230, fam, wt, 76, 30);
      g.fillStyle = fg; g.font = `${wt} ${size}px ${fam}`;
      lines.forEach((l, i) => g.fillText(l, 80, 110 + size + i * size * 1.15));
      g.font = `500 30px ${ui}`; g.globalAlpha = 0.75;
      g.fillText(quote ? `– ${d.quoteBy || by}` : by, 80, H - 50); g.globalAlpha = 1;
      wordmark(fg);
    }
    return new Promise(res => cv.toBlob(b => res(b), "image/jpeg", 0.86));
  }

  /* ---------------------------------------------------------
     21. LIVE, WALLS, REPLIES, DELIGHT
     --------------------------------------------------------- */
  state.replyTokens = ls.get("glimpse:replyTokens", {});
  state.hiddenReplies = new Set(ls.get("glimpse:hiddenReplies", []));
  state.prompt = null;                                   // "See answers" filter for the daily question
  state.wallName = "";

  // ----- Private walls -----
  const wallHosts = () => ls.get("glimpse:wallHosts", {});
  function wallHostToken() { return WALL ? wallHosts()[WALL] || null : null; }
  const myWalls = () => ls.get("glimpse:walls", []);
  function rememberWall(slug, name, host = false) {
    const list = myWalls().filter(w => w.slug !== slug);
    list.unshift({ slug, name, host: host || !!wallHosts()[slug] });
    ls.set("glimpse:walls", list.slice(0, 20));
  }
  const wallURL = slug => `${SHARE_ORIGIN}/w/${slug}`;
  function goWall(slug) {
    if (IN_APP || !location.protocol.startsWith("http")) { ls.set("glimpse:currentWall", slug || ""); location.reload(); }
    else location.href = slug ? `/w/${slug}` : "/";
  }
  const wallMenu = $("#wallMenu"), wallBtn = $("#wallBtn");
  function renderWallMenu() {
    const walls = myWalls(), server = store?.mode === "server";
    wallMenu.innerHTML = `
      <p class="menu__label">Walls</p>
      <button type="button" role="menuitemradio" aria-checked="${!WALL}" data-wall="">🌍 Everyone <small>the public wall</small></button>
      ${walls.map(w => `<button type="button" role="menuitemradio" aria-checked="${w.slug === WALL}" data-wall="${esc(w.slug)}">🔒 ${esc(w.name)}${w.host ? " <small>host</small>" : ""}</button>`).join("")}
      <hr>
      ${server ? `<button type="button" role="menuitem" data-wall-action="create">＋ Create a private wall</button>` : `<p class="menu__note">Private walls need the server.</p>`}
      ${WALL && server ? `<button type="button" role="menuitem" data-wall-action="share">⌁ Share this wall (QR code)</button>` : ""}
      ${server ? `<button type="button" role="menuitem" data-wall-action="join">↗ Join with a link…</button>` : ""}`;
  }
  wallBtn.addEventListener("click", e => {
    e.stopPropagation();
    const open = wallMenu.hidden;
    if (open) renderWallMenu();
    wallMenu.hidden = !open;
    wallBtn.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", e => { if (!wallMenu.hidden && !wallMenu.contains(e.target)) { wallMenu.hidden = true; wallBtn.setAttribute("aria-expanded", "false"); } });
  wallMenu.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    wallMenu.hidden = true;
    if (b.dataset.wall !== undefined) { if (b.dataset.wall !== WALL) goWall(b.dataset.wall); return; }
    const act = b.dataset.wallAction;
    if (act === "create") { if (rulesAccepted()) openWallCreate(); else openRules(openWallCreate); }
    if (act === "share") openWallShare();
    if (act === "join") {
      const link = prompt("Paste the wall's link:");
      const slug = (String(link || "").match(/\/w\/([a-z0-9-]{2,24})/) || [])[1];
      if (slug) goWall(slug); else if (link) toast("That doesn't look like a Glimpse wall link.");
    }
  });

  function openWallCreate() {
    const themes = Object.entries(THEMES).filter(([k]) => k !== "noir" && k !== "neotokyo" && k !== "andromeda");
    $("#wallThemes").innerHTML = themes.map(([k, n], i) => `<label class="theme-pick"><input type="radio" name="wallTheme" value="${k}" ${k === (currentTheme() || "light") || (!i && !THEMES[currentTheme()]) ? "checked" : ""}><span>${esc(n)}</span></label>`).join("");
    $("#wallNameInput").value = "";
    $("#wallError").textContent = "";
    $("#wallCreate").hidden = false;
    $("#wallNameInput").focus();
  }
  $("#wallCreateForm").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("#wallNameInput").value.trim();
    const theme = $("#wallCreateForm input[name=wallTheme]:checked")?.value || "light";
    if (name.length < 2) { $("#wallError").textContent = "Give your wall a name."; return; }
    $("#wallCreateBtn").disabled = true;
    try {
      const { wall, hostToken } = await store.createWall(name, theme);
      ls.set("glimpse:wallHosts", { ...wallHosts(), [wall.slug]: hostToken });
      rememberWall(wall.slug, wall.name, true);
      ls.set("glimpse:shareOnArrival", wall.slug);
      goWall(wall.slug);
    } catch (err) { $("#wallError").textContent = err.message; }
    finally { $("#wallCreateBtn").disabled = false; }
  });
  $("#wallCreate").addEventListener("click", e => { if (e.target.closest("[data-close]")) $("#wallCreate").hidden = true; });

  // QR code for the wall's link, drawn on a canvas
  function drawQR(canvasEl, text) {
    const qr = window.qrcode(0, "M");
    qr.addData(text); qr.make();
    const n = qr.getModuleCount(), quiet = 4, cell = Math.floor(320 / (n + quiet * 2)), size = cell * (n + quiet * 2);
    canvasEl.width = canvasEl.height = size;
    const g = canvasEl.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, size, size);
    g.fillStyle = "#111";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
  }
  function openWallShare() {
    if (!WALL) return;
    const url = wallURL(WALL);
    $("#wallShareTitle").textContent = state.wallName || "Your wall";
    $("#wallLink").value = url;
    try { drawQR($("#wallQR"), url); } catch (_) { $("#wallQR").hidden = true; }
    $("#wallShareHost").hidden = !wallHostToken();
    $("#wallShare").hidden = false;
    renderPortals();
  }
  $("#wallShare").addEventListener("click", async e => {
    if (e.target.closest("[data-close]")) { $("#wallShare").hidden = true; return; }
    const url = $("#wallLink").value;
    if (e.target.closest("#wallCopy")) { try { await navigator.clipboard.writeText(url); toast("Link copied"); } catch (_) { $("#wallLink").select(); } }
    if (e.target.closest("#wallNativeShare")) { try { await navigator.share({ title: state.wallName, text: `Add your photos, videos and thoughts to ${state.wallName}`, url }); } catch (_) {} }
    if (e.target.closest("#wallDownload")) {
      const a = document.createElement("a");
      a.href = $("#wallQR").toDataURL("image/png");
      a.download = `${(state.wallName || "glimpse-wall").replace(/[^\w-]+/g, "-")}-qr.png`;
      a.click();
    }
  });

  // ----- Live updates (Server-Sent Events) -----
  const live = { es: null, connected: false, seed: null };
  function connectLive() {
    if (store.mode !== "server" || !window.EventSource) return;
    const es = (live.es = new EventSource(`${API}/api/stream${wallQS() ? wallQS() + "&" : "?"}device=${encodeURIComponent(deviceId)}`));
    const on = (ev, fn) => es.addEventListener(ev, e => { try { fn(JSON.parse(e.data)); } catch (err) { console.warn(ev, err); } });
    on("hello", d => { live.seed = d.seed; live.connected = true; });
    on("post", d => onLivePost(absolute(d)));
    on("update", onLiveUpdate);
    on("remove", d => onLiveRemove(d.id));
    on("reply", onLiveReply);
    on("unreply", onLiveUnreply);
    on("presence", renderPresence);
    on("friends", onFriendsEvent);
    on("supernova", onSupernova);
    on("stroke", onStroke);
    on("comet", c => launchComet(false, c));
    on("portal", onPortalEvent);
    es.onerror = () => { live.connected = false; };
  }
  // A new post takes over a few spots on the wall and flies in (no reshuffle)
  function setCardPost(c, post, arrive) {
    c.post = post; c.ar = aspect(post);
    const el = c.el;
    el.className = `card card--${post.sealed ? "sealed" : post.type}` + (isNova(post) ? " card--nova" : "");
    el.dataset.id = post.id;
    el.setAttribute("aria-label", label(post));
    el.style.setProperty("--ar", c.ar.toFixed(3));
    el.innerHTML = `<div class="card__inner">${cardContent(post)}</div>`;
    if (arrive && !reduceMotion) { el.classList.add("arrive"); el.addEventListener("animationend", () => el.classList.remove("arrive"), { once: true }); }
  }
  function injectPost(post) {
    const counts = new Map();
    cards.forEach(c => counts.set(c.post.id, (counts.get(c.post.id) || 0) + 1));
    const n = clamp(Math.round(cards.length / Math.max(1, state.posts.length)), 2, 14);
    cards.slice().sort((a, b) => counts.get(b.post.id) - counts.get(a.post.id) || Math.random() - 0.5).slice(0, n)
      .forEach(c => setCardPost(c, post, true));
    applyFilter();
    render(true);
  }
  let livePillTimer = 0;
  function onLivePost(post) {
    if (state.posts.some(p => p.id === post.id) || !screen([post]).length) return;
    state.posts.unshift(post);
    if (!cards.length) buildWall(false); else injectPost(post);
    timelineSetup();
    earthArc(post);
    if (state.me && post.authorId === state.me.id) return;   // your own post: no need to announce it to you
    const pill = $("#newPill");
    pill.textContent = `✨ ${post.author || "Someone"} just added ${TYPE_NAMES[post.type] || "a post"}. See it`;
    pill.dataset.live = post.id;
    pill.hidden = false;
    clearTimeout(livePillTimer);
    livePillTimer = setTimeout(() => { if (pill.dataset.live === post.id) pill.hidden = true; }, 8000);
    Sound.sfx("arrive");
  }
  $("#newPill").addEventListener("click", e => {
    const id = e.currentTarget.dataset.live;
    if (!id) return;
    e.stopImmediatePropagation();
    e.currentTarget.hidden = true;
    delete e.currentTarget.dataset.live;
    glideTo(c => c.post.id === id);
  }, true);
  function onLiveUpdate({ id, likes, reactions }) {
    const p = postById(id);
    if (!p) return;
    if (likes !== undefined) p.likes = likes;
    if (reactions) p.reactions = reactions;
    refreshCards(id);
    if (viewing === p) { if (reactions) renderReacts(); else renderLike(); }
  }
  function onLiveRemove(id) {
    if (!postById(id) || postById(id)._devouring) return;
    state.posts = state.posts.filter(p => p.id !== id);
    if (viewing?.id === id) { closeViewer(); toast("That post was removed."); }
    if (!state.posts.length) { buildWall(false); return; }
    cards.filter(c => c.post.id === id).forEach(c => setCardPost(c, state.posts[Math.floor(Math.random() * state.posts.length)], false));
    applyFilter(); render(true); timelineSetup();
  }
  function onLiveReply({ postId, reply, replyCount }) {
    const p = postById(postId);
    if (!p) return;
    p.replyCount = replyCount;
    refreshCards(postId);
    if (viewing === p && p._replies && !p._replies.some(r => r.id === reply.id) && screenReplies([reply]).length) { p._replies.push(reply); renderReplies(p); }
  }
  function onLiveUnreply({ postId, replyId, replyCount }) {
    const p = postById(postId);
    if (!p) return;
    p.replyCount = replyCount;
    refreshCards(postId);
    if (viewing === p && p._replies) { p._replies = p._replies.filter(r => r.id !== replyId); renderReplies(p); }
  }

  // Everyone else on this wall, as soft drifting lights
  function renderPresence({ count, seeds }) {
    const others = (seeds || []).filter(s => s !== live.seed).slice(0, 30);
    const here = $("#hereCount");
    here.hidden = count < 2;
    here.textContent = `${count} here now`;
    const box = $("#visitors"), have = new Map([...box.children].map(el => [el.dataset.seed, el]));
    for (const seed of others) {
      if (have.has(seed)) { have.delete(seed); continue; }
      const h = parseInt(seed, 16) || 0, i = document.createElement("i");
      i.dataset.seed = seed;
      i.style.setProperty("--h", String(h % 360));
      i.style.setProperty("--x", `${8 + ((h >> 3) % 84)}%`);
      i.style.setProperty("--y", `${12 + ((h >> 9) % 70)}%`);
      i.style.setProperty("--dx", `${((h >> 5) % 160) - 80}px`);
      i.style.setProperty("--dy", `${((h >> 11) % 120) - 60}px`);
      i.style.setProperty("--t", `${14 + (h % 12)}s`);
      i.title = "Someone else is here";
      box.appendChild(i);
    }
    have.forEach(el => { el.classList.add("leaving"); setTimeout(() => el.remove(), 900); });
  }

  // ----- Replies on thoughts -----
  const screenReplies = list => list.filter(r => !state.hiddenReplies.has(r.id) && !state.blocked.has(r.authorId || `name:${r.author || ""}`));
  async function loadReplies(p) {
    const box = $("#vReplies"), list = $("#vReplyList");
    box.hidden = p.type !== "thought" || !!p.sealed;
    $("#replyText").value = ""; $("#replySend").disabled = true;
    if (box.hidden) return;
    list.innerHTML = `<li class="replies__empty">Loading replies…</li>`;
    try {
      const items = screenReplies(await store.replies(p.id));
      if (viewing !== p) return;
      p._replies = items;
      renderReplies(p);
    } catch (err) { list.innerHTML = `<li class="replies__empty">${esc(err.message)}</li>`; }
  }
  function renderReplies(p) {
    const list = $("#vReplyList"), items = p._replies || [], host = !!wallHostToken();
    list.innerHTML = items.length ? items.map(r => `<li class="reply" data-rid="${esc(r.id)}">
        <span class="avatar" style="--hue:${hashOf(r.author || "") % 360}">${esc(initialOf(r.author))}</span>
        <div class="reply__body">
          <p class="reply__meta"><strong>${esc(r.author || "Anonymous")}</strong> ${stampHTML(r)}</p>
          <p class="reply__text">${esc(r.text)}</p>
        </div>
        ${state.replyTokens[r.id] || host ? `<button type="button" class="text-btn" data-reply-delete>Delete</button>` : `<button type="button" class="text-btn text-btn--quiet" data-reply-report>Report</button>`}
      </li>`).join("") : `<li class="replies__empty">No replies yet. Say something kind.</li>`;
  }
  $("#replyText").addEventListener("input", () => { $("#replySend").disabled = !$("#replyText").value.trim(); });
  $("#replyForm").addEventListener("submit", async e => {
    e.preventDefault();
    const p = viewing, text = $("#replyText").value.trim();
    if (!p || !text) return;
    if (!rulesAccepted()) { openRules(() => $("#replyForm").requestSubmit()); return; }
    $("#replySend").disabled = true;
    try {
      const { reply, deleteToken } = await store.addReply(p.id, text, ls.get("glimpse:name", "") || "Anonymous");
      state.replyTokens[reply.id] = deleteToken;
      ls.set("glimpse:replyTokens", state.replyTokens);
      p._replies = p._replies || [];
      if (!p._replies.some(r => r.id === reply.id)) p._replies.push(reply);
      p.replyCount = Math.max(p.replyCount || 0, p._replies.length);
      renderReplies(p); refreshCards(p.id);
      $("#replyText").value = "";
      $("#vReplyList").lastElementChild?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } catch (err) { toast(err.message); $("#replySend").disabled = false; }
  });
  $("#vReplyList").addEventListener("click", async e => {
    const li = e.target.closest(".reply"), p = viewing;
    if (!li || !p) return;
    const rid = li.dataset.rid;
    if (e.target.closest("[data-reply-delete]")) {
      if (!confirm("Delete this reply?")) return;
      try {
        await store.removeReply(p.id, rid, state.replyTokens[rid]);
        p._replies = p._replies.filter(r => r.id !== rid);
        p.replyCount = Math.max(0, (p.replyCount || 1) - 1);
        renderReplies(p); refreshCards(p.id);
      } catch (err) { toast(err.message); }
    }
    if (e.target.closest("[data-reply-report]")) {
      reporting = { kind: "reply", post: p, rid };
      reportForm.reset();
      $("#reportTitle").textContent = "Report this reply";
      $("#reportSend").disabled = true; $("#reportUrgent").hidden = true;
      $("#report").hidden = false;
    }
  });

  // ----- Share a post -----
  $("#vShare").addEventListener("click", async () => {
    const p = viewing;
    if (!p) return;
    const url = `${SHARE_ORIGIN}/p/${p.id}`, title = `${p.author || "Someone"} on Glimpse`;
    if (navigator.share) { try { await navigator.share({ title, url }); return; } catch (err) { if (err.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(url); toast("Link copied. Paste it anywhere to share."); }
    catch (_) { prompt("Copy this link:", url); }
  });

  // ----- Tap the world: creatures react, and every theme answers with a little ripple -----
  function sceneTap(x, y) {
    if (Eggs.tap(x, y)) return;
    if (reduceMotion) return;
    const r = document.createElement("span");
    r.className = "tap-ripple";
    r.style.left = x + "px"; r.style.top = y + "px";
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 900);
    SCENES[currentTheme()]?.tap?.(x, y);
  }

  // ----- On this day -----
  function onThisDay() {
    const key = `glimpse:otd:${WALL}:${new Date().toDateString()}`;
    if (ls.get(key, false) || !state.posts.length) return;
    const now = Date.now(), DAY = 864e5;
    const spans = [[365, DAY, "a year ago today"], [30, DAY, "a month ago today"], [7, DAY / 2, "a week ago today"]];
    for (const [days, slack, words] of spans) {
      const target = now - days * DAY;
      const hits = state.posts.filter(p => !p.sealed && Math.abs(p.createdAt - target) < slack);
      if (!hits.length) continue;
      const p = hits[Math.floor(Math.random() * hits.length)];
      const box = $("#otd");
      $("#otdText").innerHTML = `<strong>On this day</strong>, ${words}, ${esc(p.author || "someone")} shared ${TYPE_NAMES[p.type] || "a post"}.`;
      box.hidden = false;
      $("#otdGo").onclick = () => {
        box.hidden = true; ls.set(key, true);
        const open = () => { glideTo(c => c.post.id === p.id, { instant: true }); setTimeout(() => openViewer(p.id), reduceMotion ? 50 : 1300); };
        if (reduceMotion || !cards.length) { glideTo(c => c.post.id === p.id); setTimeout(() => openViewer(p.id), 900); }
        else startFx("timewarp", null, { dir: -1, onMid: open });
      };
      $("#otdClose").onclick = () => { box.hidden = true; ls.set(key, true); };
      return;
    }
  }

  // ----- Today's question (in the Discover panel) -----
  function setupQuestion() {
    $("#qText").textContent = PROMPTS[todayPrompt()];
    $("#qAnswer").addEventListener("click", answerToday);
    $("#qSee").addEventListener("click", () => {
      state.prompt = state.prompt === null ? todayPrompt() : null;
      $("#qSee").setAttribute("aria-pressed", String(state.prompt !== null));
      $("#qSee").textContent = state.prompt !== null ? "Show everything" : "See answers";
      setFilter({ type: state.prompt !== null ? "thought" : "all" }, { effect: state.prompt !== null });
    });
  }

  // ----- Calm mode: pause the motion everywhere -----
  function setCalm(on) {
    calm = on;
    ls.set("glimpse:calm", on);
    reduceMotion = prefersReduced || calm;
    document.documentElement.classList.toggle("calm", calm);
    $("#calmToggle").setAttribute("aria-checked", String(calm));
    if (calm && fx) endFx();
    const t = currentTheme();
    if (SCENES[t]) { SCENES[t].stop(); SCENES[t].start(); }
  }
  $("#calmToggle").addEventListener("click", e => { e.stopPropagation(); setCalm(!calm); toast(calm ? "Calm mode on: animations paused" : "Calm mode off"); });
  document.documentElement.classList.toggle("calm", calm);
  $("#calmToggle").setAttribute("aria-checked", String(calm));

  /* ---------------------------------------------------------
     22. FRIENDS
     A friend code per device, requests, invite links/QR, and
     friends-only posts. The Friends panel opens through a
     hyperspace jump.
     --------------------------------------------------------- */
  state.me = null;
  state.friendIds = new Set();
  state.friendsOnly = false;
  state.onlyAuthor = null;
  let audience = ls.get("glimpse:audience", "public");

  function applyMe(me) {
    state.me = me;
    state.friendIds = new Set([me.id, ...me.friends.map(f => f.id)]);
    if (me.friends.length) Badges.award("friend");
    const n = me.incoming.length, badge = $("#friendsBadge");
    badge.hidden = !n; badge.textContent = String(n);
    $("#friendsBtn").setAttribute("aria-label", n ? `Friends (${n} request${n > 1 ? "s" : ""})` : "Friends");
  }
  async function refreshMe() {
    if (store?.mode !== "server") return null;
    try {
      let me = await store.me();
      const saved = ls.get("glimpse:name", "");
      if (!me.name && saved) me = await store.setName(saved);
      applyMe(me);
      return me;
    } catch (_) { return null; }
  }
  async function reloadPosts() {
    try { state.posts = screen(await store.list()); buildWall(false); } catch (_) {}
  }

  // ----- Open: hyperspace jump, then the panel -----
  function openFriends() {
    if (store?.mode !== "server") { toast("Friends need the server. Run Glimpse with “npm start”."); return; }
    if (reduceMotion || !cards.length) showFriendsPanel();
    else startFx("hyperspace", null, { onMid: showFriendsPanel });
  }
  $("#friendsBtn").addEventListener("click", openFriends);

  const inviteURL = () => (state.me && ls.get("glimpse:inviteK", "") ? `${SHARE_ORIGIN}/f/${state.me.code}?k=${ls.get("glimpse:inviteK", "")}` : "");
  async function makeInvite() {
    try { const r = await store.newInvite(); ls.set("glimpse:inviteK", r.k); state.me && (state.me.hasInvite = true); }
    catch (err) { toast(err.message); }
  }
  async function showFriendsPanel() {
    $("#friends").hidden = false;
    renderFriends();
    await refreshMe();
    if (state.me && (!state.me.hasInvite || !ls.get("glimpse:inviteK", ""))) await makeInvite();
    renderFriends();
    $("#friends .drawer").focus();
  }
  function closeFriends() { $("#friends").hidden = true; }
  $("#friends").addEventListener("click", e => { if (e.target.closest("[data-close]")) closeFriends(); });

  const personLI = (f, buttons) => `<li class="person">
      <span class="avatar" style="--hue:${hashOf(f.code || "") % 360}">${esc(initialOf(f.name || "?"))}</span>
      <span class="person__who"><strong>${esc(f.name || "Someone")} <span class="person__badges">${badgeEmojis(f.badges)}</span></strong><small>${esc(f.code || "")}</small></span>
      <span class="person__actions">${buttons}</span>
    </li>`;
  function renderFriends() {
    const me = state.me;
    $("#meCode").textContent = me ? me.code : "······";
    if (document.activeElement !== $("#meName")) $("#meName").value = me?.name || ls.get("glimpse:name", "");
    $("#meAvatar").textContent = initialOf($("#meName").value || "?");
    $("#meAvatar").style.setProperty("--hue", String(hashOf(me?.code || "") % 360));
    const url = inviteURL();
    if (url) { try { drawQR($("#inviteQR"), url); $("#inviteQR").hidden = false; } catch (_) { $("#inviteQR").hidden = true; } }
    if (!me) return;
    const btn = (act, code, text, cls = "chip") => `<button type="button" class="${cls}" data-fact="${act}" data-code="${esc(code)}">${text}</button>`;
    $("#reqIn").hidden = !me.incoming.length;
    $("#reqInList").innerHTML = me.incoming.map(f => personLI(f, btn("accept", f.code, "Accept", "chip chip--solid") + btn("decline", f.code, "Decline"))).join("");
    $("#reqOut").hidden = !me.outgoing.length;
    $("#reqOutList").innerHTML = me.outgoing.map(f => personLI(f, btn("cancel", f.code, "Cancel"))).join("");
    $("#friendCount").textContent = me.friends.length ? `(${me.friends.length})` : "";
    $("#friendList").innerHTML = me.friends.length
      ? me.friends.map(f => personLI(f, `<button type="button" class="chip" data-fposts="${esc(f.id)}" data-name="${esc(f.name || "")}">Their posts</button>` + btn("remove", f.code, "Remove", "text-btn text-btn--quiet"))).join("")
      : `<li class="people__empty">No friends here yet. Send someone your invite link or friend code.</li>`;
    $("#friendsOnlyToggle").checked = state.friendsOnly;
  }

  async function friendDo(action, code, extra = {}) {
    const before = state.me?.friends.length || 0;
    try {
      applyMe(await store.friend(action, code, extra));
      renderFriends();
      if ((state.me.friends.length || 0) !== before) reloadPosts();
      return true;
    } catch (err) { toast(err.message); return false; }
  }
  $("#friends").addEventListener("click", async e => {
    const b = e.target.closest("[data-fact]");
    if (b) {
      const act = b.dataset.fact, code = b.dataset.code;
      if (act === "remove" && !confirm("Remove this friend? You'll stop seeing each other's friends-only posts.")) return;
      b.disabled = true;
      if (await friendDo(act, code)) toast({ accept: "You're now friends 👥", decline: "Request declined", cancel: "Request cancelled", remove: "Friend removed" }[act]);
      b.disabled = false;
    }
    const fp = e.target.closest("[data-fposts]");
    if (fp) {
      state.onlyAuthor = { id: fp.dataset.fposts, name: fp.dataset.name };
      closeFriends();
      setFilter({ type: "all" }, { effect: true });
    }
  });
  $("#addFriendForm").addEventListener("submit", async e => {
    e.preventDefault();
    const code = $("#addCode").value.trim();
    if (!code) return;
    const before = state.me?.friends.length || 0;
    $("#addBtn").disabled = true;
    if (await friendDo("request", code)) {
      $("#addCode").value = "";
      toast(state.me.friends.length > before ? "You're now friends 👥" : "Friend request sent. They'll see it next time they open Friends.");
    }
    $("#addBtn").disabled = false;
  });
  let nameT;
  $("#meName").addEventListener("input", () => {
    $("#meAvatar").textContent = initialOf($("#meName").value || "?");
    clearTimeout(nameT);
    nameT = setTimeout(async () => {
      const name = $("#meName").value.trim();
      ls.set("glimpse:name", name);
      try { applyMe(await store.setName(name)); } catch (err) { toast(err.message); }
    }, 700);
  });
  $("#meCopy").addEventListener("click", async () => { try { await navigator.clipboard.writeText(state.me?.code || ""); toast("Friend code copied"); } catch (_) {} });
  $("#inviteCopy").addEventListener("click", async () => { try { await navigator.clipboard.writeText(inviteURL()); toast("Invite link copied"); } catch (_) { prompt("Copy your invite link:", inviteURL()); } });
  $("#inviteShare").addEventListener("click", async () => {
    const url = inviteURL();
    if (navigator.share) { try { await navigator.share({ title: "Be my friend on Glimpse", text: "Add me on Glimpse so we can see each other's friends-only posts:", url }); return; } catch (err) { if (err.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(url); toast("Invite link copied"); } catch (_) { prompt("Copy your invite link:", url); }
  });
  $("#inviteReset").addEventListener("click", async () => {
    if (!confirm("Make a new invite link? The old link and QR code will stop working.")) return;
    await makeInvite(); renderFriends(); toast("New invite link ready");
  });
  $("#friendsOnlyToggle").addEventListener("change", e => {
    state.friendsOnly = e.target.checked;
    state.onlyAuthor = null;
    closeFriends();
    setFilter({ type: "all" }, { effect: state.friendsOnly });
  });

  // Live: someone sent a request or accepted ours
  async function onFriendsEvent(d) {
    const before = state.me?.friends.length || 0;
    await refreshMe();
    if (!$("#friends").hidden) renderFriends();
    if (d.what === "request") toast(`${d.name || "Someone"} sent you a friend request 👥`);
    if ((d.what === "accepted" || d.what === "joined") && (state.me?.friends.length || 0) > before) {
      toast(`You're now friends with ${d.name || "someone new"} 👥`);
      reloadPosts();
    }
  }

  // ----- Composer: who can see this post? -----
  function setupAudience() {
    const box = $("#audience");
    box.hidden = store?.mode !== "server" || !!WALL;
    $$("#audience [data-aud]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.aud === audience)));
    const lonely = audience === "friends" && state.me && !state.me.friends.length;
    $("#audienceHint").hidden = !lonely;
  }
  $("#audience").addEventListener("click", e => {
    const b = e.target.closest("[data-aud]");
    if (!b) return;
    audience = b.dataset.aud;
    ls.set("glimpse:audience", audience);
    setupAudience();
  });

  // ----- Arriving through someone's invite link (/f/<code>?k=…) -----
  async function handleInviteLink() {
    const code = (location.pathname.match(/^\/f\/([A-Za-z0-9]{4,12})\/?$/) || [])[1];
    const k = new URLSearchParams(location.search).get("k");
    if (!code || !k || store.mode !== "server") return false;
    history.replaceState(null, "", "/");
    try {
      const info = await store.inviteInfo(code, k);
      if (state.me && info.code === state.me.code) { toast("That's your own invite link. Send it to a friend!"); return true; }
      $("#inviteName").textContent = info.name || "Someone";
      $("#inviteModal").hidden = false;
      $("#inviteYes").onclick = async () => {
        $("#inviteModal").hidden = true;
        if (await friendDo("join", info.code, { k })) { toast(`You're now friends with ${info.name || "them"} 👥`); openFriends(); }
      };
      $("#inviteNo").onclick = () => { $("#inviteModal").hidden = true; };
    } catch (err) { toast(err.message); }
    return true;
  }
  $("#inviteModal").addEventListener("click", e => { if (e.target.closest("[data-close]")) $("#inviteModal").hidden = true; });

  /* ---- 5. HYPERSPACE (Friends): engines charge, stars streak past light speed,
          a rainbow wormhole, a flash, and you arrive at your friends ---- */
  EFFECTS.hyperspace = {
    dur: 2800,
    midAt: 0.86,                                 // the Friends panel opens under the arrival flash
    init(fx) {
      for (let i = 0; i < 480; i++) fx.parts.push({ ang: rnd(0, TAU), z: Math.random(), sp: rnd(0.6, 1.4), hue: rnd(190, 240) });
    },
    mid(fx) { fx.opts.onMid?.(); },
    draw(fx, ctx, t, dt) {
      const { cx, cy, maxR } = fx;
      const charge = seg(t, 0, 0.22), jump = ease.inCubic(seg(t, 0.2, 0.38)), tunnel = seg(t, 0.36, 0.84);
      const dark = Math.min(1, charge * 1.5) * (1 - seg(t, 0.86, 1));
      ctx.fillStyle = `rgba(1, 2, 12, ${0.94 * dark})`;
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";

      // Stars → light-speed streaks (they stretch as you pass the speed of light)
      const speed = 0.12 + jump * 3.2 + tunnel * 1.6;
      const stretch = 1 + jump * 34 + tunnel * 20;
      for (const s of fx.parts) {
        s.z += dt * speed * s.sp;
        if (s.z > 1) s.z -= 1;
        const r = Math.pow(s.z, 2.1) * maxR * 1.35;
        const tail = r * Math.max(0.02, 1 - 0.03 * stretch * s.z);
        const a = Math.min(1, s.z * 1.6) * dark;
        const light = 70 + 25 * Math.min(1, jump + tunnel);
        ctx.strokeStyle = `hsla(${s.hue - jump * 30}, 100%, ${light}%, ${a})`;
        ctx.lineWidth = 0.6 + s.z * (1.5 + jump * 1.5);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(s.ang) * tail, cy + Math.sin(s.ang) * tail);
        ctx.lineTo(cx + Math.cos(s.ang) * r, cy + Math.sin(s.ang) * r);
        ctx.stroke();
      }

      // Inside the wormhole: rings rushing past, split into red/green/blue (beyond light speed)
      if (tunnel > 0) {
        const env = seg(tunnel, 0, 0.15) * (1 - seg(tunnel, 0.85, 1));
        const spin = t * 9;
        for (const [col, off] of [["255, 60, 90", -6], ["60, 255, 160", 0], ["80, 140, 255", 6]]) {
          for (let i = 0; i < 18; i++) {
            const z = mod(i / 18 + t * 3.2, 1), R = 6 + Math.pow(z, 2.4) * maxR * 1.3;
            ctx.strokeStyle = `rgba(${col}, ${env * z * (1 - z) * 2.4})`;
            ctx.lineWidth = 1 + z * 4;
            ctx.beginPath();
            ctx.ellipse(cx + off * z + Math.cos(spin + z * 6) * 18 * (1 - z), cy + Math.sin(spin + z * 6) * 18 * (1 - z), R, R * 0.92, spin * 0.2, 0, TAU);
            ctx.stroke();
          }
        }
        glow(ctx, cx, cy, 140 * env, "hsla(200, 100%, 90%, ALPHA)", 0.9);
      }

      // Engines charging: a growing blue glow
      if (t < 0.38) glow(ctx, cx, cy, 40 + charge * 110 + jump * 260, "hsla(205, 100%, 80%, ALPHA)", 0.5 + 0.4 * jump);

      // Cockpit display: corner brackets, crosshair, speed readout
      ctx.globalCompositeOperation = "source-over";
      const hud = seg(t, 0.04, 0.16) * (1 - seg(t, 0.8, 0.9));
      if (hud > 0) {
        ctx.strokeStyle = `rgba(120, 220, 255, ${0.7 * hud})`;
        ctx.lineWidth = 2;
        const m = 34, L = 46;
        for (const [x, y, sx, sy] of [[m, m, 1, 1], [vw - m, m, -1, 1], [m, vh - m, 1, -1], [vw - m, vh - m, -1, -1]]) {
          ctx.beginPath(); ctx.moveTo(x, y + sy * L); ctx.lineTo(x, y); ctx.lineTo(x + sx * L, y); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(cx, cy, 26, 0, TAU); ctx.moveTo(cx - 44, cy); ctx.lineTo(cx - 30, cy); ctx.moveTo(cx + 30, cy); ctx.lineTo(cx + 44, cy); ctx.stroke();
        const c = t < 0.2 ? (0.1 + charge * 0.89).toFixed(2) : t < 0.38 ? (1 + jump * 9).toFixed(1) : String(Math.round(10 + Math.pow(tunnel, 2) * 99990));
        const label = t < 0.2 ? "ENGINES CHARGING" : t < 0.38 ? "LIGHT SPEED" : `BEYOND LIGHT SPEED · DESTINATION: ${fx.opts.dest || "FRIENDS"}`;
        ctx.fillStyle = `rgba(150, 230, 255, ${hud})`;
        ctx.textAlign = "center";
        ctx.font = `700 ${Math.round(Math.min(vw, vh) * 0.06)}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
        ctx.fillText(`${c} c`, cx, vh - 150);
        ctx.font = `600 13px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
        ctx.fillText(label, cx, vh - 122);
        ctx.textAlign = "left";
      }
      // Arrival flash
      const f = seg(t, 0.8, 0.86) * (1 - seg(t, 0.86, 0.98));
      if (f > 0) { ctx.fillStyle = `rgba(235, 248, 255, ${f})`; ctx.fillRect(0, 0, vw, vh); }
      const sh = t > 0.2 && t < 0.36 ? 6 * jump : 0;
      canvas.style.transform = sh ? `translate(${rnd(-sh, sh).toFixed(1)}px, ${rnd(-sh, sh).toFixed(1)}px)` : "";
    },
    card(fx, c, t, bx, by) {
      const { r, th } = polar(fx, bx, by);
      if (t < 0.2) {                                 // the ship trembles as the engines charge
        const q = seg(t, 0, 0.2);
        return { x: bx + rnd(-1, 1) * q * 3, y: by + rnd(-1, 1) * q * 3, s: 1, a: 1 };
      }
      if (t < 0.84) {                                // everything streaks past at light speed
        const k = ease.inCubic(seg(t, 0.2 + c.seed * 0.05, 0.42));
        const p = fromPolar(fx, r * (1 + k * 7) + k * 200, th);
        return { ...p, s: 1 + k * 0.8, a: 1 - seg(k, 0.4, 1), stretch: 1 + k * 9, phi: th };
      }
      const k = ease.outCubic(seg(t, 0.86, 1));      // and settle back behind the panel
      return { x: bx, y: by, s: 0.6 + 0.4 * k, a: k };
    },
  };

  /* ---------------------------------------------------------
     10. THEME, NOTICE, POLLING, BOOT
     --------------------------------------------------------- */
  // Themes: light, dark, gallery (framed art on a museum wall) and universe (live space background)
  const THEMES = {
    light: "Light", dark: "Dark", gallery: "Gallery", universe: "Universe", amazon: "Amazon",
    ocean: "Deep Ocean", aurora: "Aurora", sakura: "Sakura Dusk", neon: "Neon City", sahara: "Sahara Night",
    noir: "Noir", neotokyo: "Neo Tokyo", warp: "Warp Drive", andromeda: "Andromeda",
  };

  // Every theme change is a little trip through time (direction follows the menu order)
  function travelTo(theme, { years = null, after } = {}) {
    const cur = currentTheme();
    if (theme === cur) { after?.(); return; }
    if (reduceMotion || !cards.length) { setTheme(theme); after?.(); return; }
    const keys = Object.keys(THEMES);
    const dir = years ? Math.sign(years[1] - years[0]) || 1 : keys.indexOf(theme) >= keys.indexOf(cur) ? 1 : -1;
    startFx("timewarp", null, { dir, years, onMid: () => { setTheme(theme); after?.(); } });
  }
  const themeBtn = $("#themeBtn");
  const themeMenu = $("#themeMenu");
  function setTheme(t) {
    if (!THEMES[t]) t = "light";
    document.documentElement.dataset.theme = t;
    themeBtn.setAttribute("aria-label", `Theme: ${THEMES[t]}`);
    for (const [name, scene] of Object.entries(SCENES)) if (name !== t) scene.stop();
    SCENES[t]?.start();
    updateShipPill();
    Sound.play(t);
    $$("[data-theme-choice]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.themeChoice === t)));
    ls.set("glimpse:theme", t);
  }
  function toggleThemeMenu(open) {
    themeMenu.hidden = !open;
    themeBtn.setAttribute("aria-expanded", String(open));
    if (open) themeMenu.querySelector("[aria-checked='true']")?.focus();
  }
  setTheme(ls.get("glimpse:theme", null) || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  themeBtn.addEventListener("click", e => { e.stopPropagation(); toggleThemeMenu(themeMenu.hidden); });
  themeMenu.addEventListener("click", e => {
    const b = e.target.closest("[data-theme-choice]");
    if (!b) return;
    const choice = b.dataset.themeChoice;
    setFromShip(false);
    // Picking a theme by hand leaves time travel
    if (state.when !== "all" && !Object.values(TIME_THEMES).includes(choice)) {
      state.when = "all";
      $$("#timeChips .chip").forEach(ch => ch.setAttribute("aria-pressed", String(ch.dataset.when === "all")));
      applyFilter();
    }
    travelTo(choice);
    toggleThemeMenu(false);
    themeBtn.focus();
  });
  themeMenu.addEventListener("keydown", e => {
    const items = $$("[data-theme-choice]", themeMenu);
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === "ArrowUp")   { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    if (e.key === "Escape")    { e.stopPropagation(); toggleThemeMenu(false); themeBtn.focus(); }
  });
  document.addEventListener("click", e => { if (!themeMenu.hidden && !themeMenu.contains(e.target)) toggleThemeMenu(false); });

  $("#noticeClose").addEventListener("click", () => { $("#notice").hidden = true; ls.set("glimpse:noticeClosed", true); });

  // Server mode: check for other people's posts and offer to show them
  let pending = null;
  async function poll() {
    if (live.connected) return;
    try {
      const latest = screen(await store.list());
      const known = new Set(state.posts.map(p => p.id));
      const fresh = latest.filter(p => !known.has(p.id));
      const byId = new Map(latest.map(p => [p.id, p]));
      for (const p of state.posts) {
        const fresh = byId.get(p.id);
        if (!fresh) continue;
        p.likes = fresh.likes;
        if (p.type === "thought" && JSON.stringify(fresh.reactions || {}) !== JSON.stringify(p.reactions || {})) {
          p.reactions = fresh.reactions || {};
          refreshCards(p.id);
          if (viewing === p) renderReacts();
        }
      }
      const pill = $("#newPill");
      if (fresh.length) {
        pending = latest;
        pill.textContent = `${fresh.length} new post${fresh.length > 1 ? "s" : ""}. Show them`;
        pill.hidden = false;
      }
    } catch (_) { /* try again next time */ }
  }
  $("#newPill").addEventListener("click", e => {
    if (!pending) return;
    const known = new Set(state.posts.map(p => p.id));
    const newest = pending.find(p => !known.has(p.id));
    state.posts = pending; pending = null;
    e.currentTarget.hidden = true;
    buildWall(false);
    if (newest) glideTo(c => c.post.id === newest.id);
  });

  // Android app: the back button closes what's open before leaving the app
  window.Capacitor?.Plugins?.App?.addListener?.("backButton", () => {
    if (CamelRun.isOpen()) CamelRun.close();
    else if (fx) endFx();
    else if (!$("#report").hidden) closeReport();
    else if (!$("#rules").hidden) closeRules();
    else if (!$("#sky").hidden) closeSky();
    else if (!$("#cometIn").hidden) $("#cometIn").hidden = true;
    else if (!$("#cometSend").hidden) $("#cometSend").hidden = true;
    else if (!$("#earth").hidden) { $("#earth").hidden = true; earth.open = false; }
    else if (!$("#channels").hidden) $("#channels").hidden = true;
    else if (!$("#void").hidden) $("#void").hidden = true;
    else if (!$("#stars").hidden) $("#stars").hidden = true;
    else if (!$("#inviteModal").hidden) $("#inviteModal").hidden = true;
    else if (!$("#friends").hidden) closeFriends();
    else if (!$("#wallShare").hidden) $("#wallShare").hidden = true;
    else if (!$("#wallCreate").hidden) $("#wallCreate").hidden = true;
    else if (!$("#viewer").hidden) closeViewer();
    else if (!$("#composer").hidden) closeComposer();
    else if (!$("#themeMenu").hidden) toggleThemeMenu(false);
    else if (state.until || state.when !== "all" || state.type !== "all" || state.query) { resetTimeline(); setFilter({ type: "all", query: "" }); if (state.when !== "all") setWhen("all"); }
    else window.Capacitor.Plugins.App.exitApp();
  });

  // Website: make it installable and quick to reopen (not needed inside the app)
  if ("serviceWorker" in navigator && location.protocol === "https:" && !IN_APP) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  async function boot() {
    // Phones: start with Discover folded so the wall gets the screen
    if (innerWidth < 700) { $("#discover").classList.add("collapsed"); $("#discoverToggle").setAttribute("aria-expanded", "false"); }
    store = await pickStore();
    if (store.mode === "local" && (IN_APP || API)) {
      $("#notice p").innerHTML = "<strong>Can't reach the wall.</strong> You're offline or the server is down. Posts you add now stay on this phone.";
      $("#notice").hidden = false;
    } else if (store.mode === "local" && !ls.get("glimpse:noticeClosed", false)) $("#notice").hidden = false;
    // Opening a shared post link (/p/<id>): find which wall it lives on
    const deepId = (location.pathname.match(/^\/p\/([\w-]{8,64})\/?$/) || [])[1] || new URLSearchParams(location.search).get("post");
    if (deepId && store.mode === "server") {
      try { const dp = await store.get(deepId); if (dp.wall) WALL = dp.wall; } catch (err) { toast(err.message); }
    }
    // Private wall: its name, its theme on your first visit
    if (WALL) {
      try {
        const info = await store.wallInfo(WALL);
        state.wallName = info.listed ? `${info.emoji || "🪐"} #${WALL}` : info.name;
        rememberWall(WALL, info.name);
        if (!ls.get(`glimpse:wallTheme:${WALL}`, null)) { ls.set(`glimpse:wallTheme:${WALL}`, info.theme); setTheme(info.theme); }
        document.title = `${info.name} · Glimpse`;
        $("#empty p").textContent = `Welcome to ${info.name}. Add the first post!`;
      } catch (err) {
        toast(err.message);
        WALL = ""; ls.set("glimpse:currentWall", "");
        if (/^\/w\//.test(location.pathname)) history.replaceState(null, "", "/");
      }
    }
    $("#wallName").textContent = WALL ? state.wallName : "Everyone";
    await refreshMe();                                   // friend code, friends (for friends-only posts)
    try {
      state.posts = screen(await store.list());
    } catch (err) {
      toast(err.message);
      state.posts = [];
    }
    // The wall bursts into view with a firework (or fades in if motion is reduced)
    buildWall(reduceMotion);
    if (!reduceMotion) startFx("fireworks", "all", { intro: true });
    requestAnimationFrame(tick);
    if (store.mode === "server") { setInterval(poll, POLL_MS); connectLive(); }
    if (location.hash === "#rules") openRules();
    setupQuestion();
    const invited = await handleInviteLink();
    if (deepId && postById(deepId)) {
      setTimeout(() => { glideTo(c => c.post.id === deepId, { instant: true }); openViewer(deepId); }, reduceMotion ? 50 : 2000);
    } else if (deepId) toast("This post isn't available any more.");
    else if (!invited) setTimeout(onThisDay, 3500);
    if (WALL && ls.get("glimpse:shareOnArrival", "") === WALL) { ls.set("glimpse:shareOnArrival", ""); setTimeout(openWallShare, reduceMotion ? 100 : 2600); }
  }
  boot();
})();
