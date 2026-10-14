/* ==========================================================
   Glimpse server
   Serves the front end, stores uploads on disk and keeps posts
   in a JSON file. Good for a small community wall; for heavy
   traffic, swap the JSON file for a database and the uploads
   folder for object storage (S3, R2, Cloudinary...).

   Run:  npm install  &&  npm start   →  http://localhost:3000
   ========================================================== */
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
// On a host with a persistent disk, point these at the disk (e.g. DATA_DIR=/var/data/data)
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(ROOT, "uploads");
const DB_FILE = path.join(DATA_DIR, "posts.json");

const MAX_VIDEO_SECONDS = 30;
const MAX_VIDEO_BYTES = 60 * 1e6;
const MAX_PHOTO_BYTES = 12 * 1e6;     // photos arrive already resized by the browser
const MAX_THUMB_BYTES = 2 * 1e6;
const QUOTE_MAX = 280;
const QUOTE_STYLES = ["ink", "paper", "sun", "bloom"];
const THOUGHT_MAX = 500;
const THOUGHT_TINTS = ["cream", "mint", "sky", "blush"];
const REACTIONS = ["love", "hug", "haha", "wow", "sad", "relate"];
const MAX_VOICE_SECONDS = 30;
const MAX_AUDIO_BYTES = 12 * 1e6;
const REPLY_MAX = 280;
const PROMPT_COUNT = 60;              // daily questions (the list lives in public/script.js)
const WALL_THEMES = ["light", "dark", "gallery", "universe", "amazon", "ocean", "aurora", "sakura", "neon", "sahara", "noir", "neotokyo", "warp"];
const POSTS_PER_10_MIN = Number(process.env.POSTS_PER_10_MIN) || 30;   // per IP address
const REACTIONS_PER_10_MIN = 300;     // per IP address

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ----- Tiny JSON "database" ----- */
const SEED = [
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

const SEED_THOUGHTS = [
  ["Moved to a new city three months ago. Today the guy at the coffee stand knew my order. Small thing, felt huge.", "Wanjiru", "mint", { love: 9, hug: 4, relate: 6 }],
  ["Does anyone else rehearse conversations in the shower that never end up happening?", "Anonymous", "cream", { haha: 14, relate: 21 }],
  ["Finished my first 10K this morning. A year ago I couldn't run to the bus stop.", "Otieno", "sky", { love: 12, wow: 5 }],
  ["Missing my grandmother's cooking today. Trying her recipe tonight and I'll probably get it wrong.", "Anonymous", "blush", { hug: 11, sad: 3, love: 7 }],
];
const seedThoughts = now => SEED_THOUGHTS.map(([text, author, tint, reactions], i) => ({
  id: "sample-thought-" + i, type: "thought", author, text, tint, reactions, likes: 0, createdAt: now - [0.15, 1.6, 4, 11][i] * 864e5,
}));

function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch (_) {
    const now = Date.now();
    const posts = SEED.map(([text, quoteBy, style], i) => ({
      id: "sample-" + i, type: "quote", author: "Glimpse", text, quoteBy, style,
      likes: 3 + ((i * 7) % 20), createdAt: now - (i + 1) * 2.4 * 864e5,
    })).concat(seedThoughts(now));
    save(posts);
    return posts;
  }
}
function save(list = posts) {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, DB_FILE);               // atomic replace
}
let posts = load();
// Walls created before thoughts existed get the sample thoughts once
const THOUGHTS_MARKER = path.join(DATA_DIR, ".thoughts-seeded");
if (!fs.existsSync(THOUGHTS_MARKER)) {
  if (!posts.some(p => p.type === "thought")) { posts.push(...seedThoughts(Date.now())); save(); }
  fs.writeFileSync(THOUGHTS_MARKER, "1");
}

/* ----- Places (for the Constellations map) -----
   Only the city of the device's time zone (e.g. "Africa/Nairobi" → Nairobi, Africa), never GPS. */
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
  if (!region) return null;
  return { region, city: rest[rest.length - 1].replace(/_/g, " ").slice(0, 40) };
}
// Give the sample posts a spread of places so the map isn't empty on day one
const SAMPLE_TZ = ["Africa/Nairobi", "Europe/London", "Asia/Tokyo", "America/New_York", "America/Sao_Paulo", "Australia/Sydney", "Africa/Lagos",
  "Europe/Paris", "Asia/Kolkata", "America/Mexico_City", "Pacific/Auckland", "Asia/Seoul", "Africa/Cairo", "Europe/Berlin", "America/Toronto", "America/Bogota"];
{
  let changed = false;
  posts.forEach((p, i) => { if (String(p.id).startsWith("sample") && !p.region) { Object.assign(p, placeFromTz(SAMPLE_TZ[i % SAMPLE_TZ.length])); changed = true; } });
  if (changed) save();
}

/* ----- The Void: deleted posts wait here for 30 days, then they're gone for good ----- */
const VOID_FILE = path.join(DATA_DIR, "void.json");
const VOID_DAYS = 30;
let voided = (() => { try { return JSON.parse(fs.readFileSync(VOID_FILE, "utf8")); } catch (_) { return []; } })();
const saveVoid = () => { const tmp = VOID_FILE + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(voided, null, 2)); fs.renameSync(tmp, VOID_FILE); };
function purgeVoid() {
  const cutoff = Date.now() - VOID_DAYS * 864e5;
  const gone = voided.filter(p => p.voidedAt < cutoff);
  if (!gone.length) return;
  gone.forEach(p => { for (const u of [p.url, p.thumb, p.og]) if (u) fs.unlink(path.join(UPLOAD_DIR, path.basename(u)), () => {}); });
  voided = voided.filter(p => p.voidedAt >= cutoff);
  saveVoid();
}
purgeVoid();
setInterval(purgeVoid, 3600e3).unref();

// Time capsules stay sealed: until they open, nobody gets their contents (not even the poster)
/* ----- Moderation basics -----
   Each poster gets an anonymous ID derived from a random device ID their browser/app keeps
   (or their IP if missing). It lets people block someone and lets you ban them, without
   storing who they are. */
const SECRET_FILE = path.join(DATA_DIR, ".secret");
const SECRET = process.env.GLIMPSE_SECRET || (() => {
  try { return fs.readFileSync(SECRET_FILE, "utf8").trim(); }
  catch (_) { const s = crypto.randomBytes(32).toString("hex"); fs.writeFileSync(SECRET_FILE, s); return s; }
})();
const keyFor = (deviceId, ip) => crypto.createHash("sha256").update(SECRET + "|" + (String(deviceId || "").slice(0, 80) || "ip:" + ip)).digest("hex");
const publicIdFor = key => key ? crypto.createHash("sha256").update("pub|" + key).digest("hex").slice(0, 16) : undefined;
const REPORT_HIDE_THRESHOLD = Number(process.env.REPORT_HIDE_THRESHOLD) || 3;
const REPORT_REASONS = ["spam", "harassment", "sexual", "violence", "self-harm", "illegal", "other"];
const BANS_FILE = path.join(DATA_DIR, "bans.json");
let bans = new Set((() => { try { return JSON.parse(fs.readFileSync(BANS_FILE, "utf8")); } catch (_) { return []; } })());
const saveBans = () => fs.writeFileSync(BANS_FILE, JSON.stringify([...bans], null, 2));

// What the public sees: no tokens, keys or reports, and sealed capsules stay sealed
const publicPost = ({ tokenHash, ip, authorKey, reports, hidden, replies, heat, ...p }) => {
  if (p.wall && walls[p.wall]) p.wallName = walls[p.wall].name;
  const authorId = publicIdFor(authorKey);
  const replyCount = (replies || []).filter(r => !r.hidden).length;
  if (replyCount) p.replyCount = replyCount;
  if (p.opensAt && p.opensAt > Date.now()) {
    return { id: p.id, type: p.type, author: p.author, authorId, createdAt: p.createdAt, opensAt: p.opensAt, sealed: true, likes: p.likes || 0, width: p.width, height: p.height, wall: p.wall, og: p.og };
  }
  return { ...p, authorId };
};
const publicReply = ({ tokenHash, authorKey, reports, hidden, ...r }) => ({ ...r, authorId: publicIdFor(authorKey) });
const isSealed = p => p.opensAt && p.opensAt > Date.now();

// Strokes (handwriting, graffiti): points are whole numbers 0–1000 across the drawing area
const INK_COLORS = ["#1d1b19", "#2b59c3", "#c0392b", "#1e8449", "#7d3c98", "#ffffff", "#ff3dd6", "#00e5ff", "#ffe14d", "#7dff5a", "#ff8a1f", "#b18cff"];
function cleanStroke(st, maxPts = 240) {
  if (!st || !Array.isArray(st.p)) return null;
  const pts = st.p.slice(0, maxPts * 2).map(v => clamp(Math.round(Number(v) || 0), 0, 1000));
  if (pts.length < 4 || pts.length % 2) return null;
  return { c: INK_COLORS.includes(st.c) ? st.c : INK_COLORS[0], s: clamp(Math.round(Number(st.s) || 4), 1, 40), p: pts };
}
function cleanInk(raw) {
  let ink; try { ink = JSON.parse(raw); } catch (_) { return null; }
  if (!ink || !Array.isArray(ink.strokes) || String(raw).length > 60000) return null;
  const strokes = []; let total = 0;
  for (const st of ink.strokes.slice(0, 80)) { const c = cleanStroke(st); if (c) { total += c.p.length / 2; if (total > 6000) break; strokes.push(c); } }
  return strokes.length ? { strokes } : null;
}
const MAX_CAPSULE_YEARS = 10;
const sha256 = s => crypto.createHash("sha256").update(s).digest("hex");
// Like clean(), but keeps line breaks (for thoughts)
const cleanText = (v, max) => String(v ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
  .replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const httpError = (status, message) => Object.assign(new Error(message), { status });

/* ----- Uploads ----- */
const EXT = {
  "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
  "video/mp4": ".mp4", "video/x-m4v": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov",
  "video/3gpp": ".3gp", "video/x-matroska": ".mkv",
  "audio/webm": ".weba", "audio/ogg": ".ogg", "audio/mp4": ".m4a", "audio/x-m4a": ".m4a", "audio/aac": ".aac",
  "audio/mpeg": ".mp3", "audio/mp3": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/wave": ".wav",
};
const EXT_BY_NAME = { mp4: ".mp4", m4v: ".mp4", mov: ".mov", webm: ".webm", "3gp": ".3gp", mkv: ".mkv", jpg: ".jpg", jpeg: ".jpg", png: ".png", webp: ".webp",
  weba: ".weba", ogg: ".ogg", oga: ".ogg", m4a: ".m4a", aac: ".aac", mp3: ".mp3", wav: ".wav" };
const baseType = file => String(file.mimetype || "").split(";")[0].trim().toLowerCase();
// Use the browser's type, or the file name when the type is missing/generic
function extFor(file) {
  if (EXT[baseType(file)]) return EXT[baseType(file)];
  const ext = (file.originalname.split(".").pop() || "").toLowerCase();
  return EXT_BY_NAME[ext] || null;
}
const isAudioFile = file => baseType(file).startsWith("audio/") || /\.(weba|ogg|oga|m4a|aac|mp3|wav)$/i.test(file.originalname);
const isVideoFile = file => !isAudioFile(file) && (baseType(file).startsWith("video/") || /\.(mp4|m4v|mov|webm|3gp|mkv)$/i.test(file.originalname));
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + (extFor(file) || "")),
  }),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 3, fields: 30 },
  fileFilter: (req, file, cb) => {
    const okMedia = file.fieldname === "media" && extFor(file);
    const okThumb = (file.fieldname === "thumb" || file.fieldname === "og") && baseType(file) === "image/jpeg";
    if (okMedia || okThumb) return cb(null, true);
    console.warn(`Rejected upload: field=${file.fieldname} type=${file.mimetype} name=${file.originalname}`);
    cb(httpError(400, "That file type isn't supported. Use JPG, PNG, WebP, MP4, MOV, WebM, or an audio file (M4A, MP3, WebM, OGG, WAV)."));
  },
});

// Reads the real video length with ffprobe when it's installed.
function probeDuration(file) {
  return new Promise(resolve => {
    execFile("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { timeout: 15000 }, (err, out) => {
      const d = parseFloat(out);
      resolve(err || !isFinite(d) ? null : d);
    });
  });
}
let hasFfprobe = false;
execFile("ffprobe", ["-version"], err => {
  hasFfprobe = !err;
  if (!hasFfprobe) console.warn("ffprobe not found: video length is checked in the browser only. Install ffmpeg to check it on the server too.");
});

/* ----- Private walls -----
   A wall is a separate, unlisted space (a wedding, a class, an event). Anyone with its link can
   view and post; the person who made it gets a host key to remove posts from it. */
const WALLS_FILE = path.join(DATA_DIR, "walls.json");
let walls = (() => { try { return JSON.parse(fs.readFileSync(WALLS_FILE, "utf8")); } catch (_) { return {}; } })();
const saveWalls = () => { const tmp = WALLS_FILE + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(walls, null, 2)); fs.renameSync(tmp, WALLS_FILE); };
const SLUG_CHARS = "abcdefghijkmnpqrstuvwxyz23456789";
const newSlug = () => Array.from(crypto.randomBytes(10), b => SLUG_CHARS[b % SLUG_CHARS.length]).join("");
const wallOf = req => {
  const slug = String(req.query.wall || req.body?.wall || "").trim();
  if (!slug) return "";
  if (!walls[slug]) throw httpError(404, "That wall doesn't exist (check the link).");
  return slug;
};
const isWallHost = (slug, req) => {
  const w = slug && walls[slug];
  const t = String(req.get("X-Wall-Token") || "");
  return !!(w && t && sha256(t) === w.hostHash);
};

/* ----- Friends -----
   No accounts: each device's anonymous key (from its random device ID) gets a friend code.
   Friends-only posts are only ever sent to the poster and their friends. */
const USERS_FILE = path.join(DATA_DIR, "users.json");
let users = (() => { try { return JSON.parse(fs.readFileSync(USERS_FILE, "utf8")); } catch (_) { return {}; } })();
const saveUsers = () => { const tmp = USERS_FILE + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(users, null, 2)); fs.renameSync(tmp, USERS_FILE); };
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from(crypto.randomBytes(6), b => CODE_CHARS[b % CODE_CHARS.length]).join("");
const normCode = c => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
// Who's asking: the device ID comes in a header (or ?device= for the live stream)
const meKey = req => {
  const d = String(req.get("X-Device-Id") || req.query.device || req.body?.deviceId || "").trim();
  return d ? keyFor(d, req.ip) : null;
};
function userOf(key, create = false) {
  if (!key) return null;
  if (!users[key] && create) {
    let code; do code = newCode(); while (Object.values(users).some(u => u.code === code));
    users[key] = { code, name: "", friends: [], incoming: [], outgoing: [], createdAt: Date.now() };
    saveUsers();
  }
  return users[key] || null;
}
const byCode = code => Object.entries(users).find(([, u]) => u.code === normCode(code)) || [];
const isFriend = (a, b) => !!(a && b && users[a]?.friends.includes(b));
function canSee(p, key) {
  if (p.audience !== "friends") return true;
  return !!key && (p.authorKey === key || isFriend(p.authorKey, key));
}

/* ----- Live updates (Server-Sent Events) ----- */
const streams = new Set();
// `post` (optional): if it's friends-only, only the poster and their friends hear about it
// Every wall a post shows up on: its own, any #channels it's tagged with, and walls linked by a portal
function wallsOf(p) {
  const out = new Set([p.wall || ""]);
  for (const t of p.tags || []) out.add(t);
  for (const w of [...out]) for (const linked of walls[w]?.portals || []) out.add(linked);
  return out;
}
function broadcast(wall, event, data, post = null) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const targets = post ? wallsOf(post) : new Set([wall || ""]);
  for (const c of streams) if (targets.has(c.wall) && (!post || canSee(post, c.key))) c.res.write(msg);
}
function sendToKey(key, event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of streams) if (c.key && c.key === key) c.res.write(msg);
}
let presenceTimer = null;
function presenceSoon() {                     // tell everyone how many people are here (batched)
  clearTimeout(presenceTimer);
  presenceTimer = setTimeout(() => {
    const byWall = {};
    for (const c of streams) (byWall[c.wall] = byWall[c.wall] || []).push(c.seed);
    for (const [wall, seeds] of Object.entries(byWall)) broadcast(wall, "presence", { count: seeds.length, seeds: seeds.slice(0, 40) });
  }, 400);
}

/* ----- Channels: public, listed walls anyone can find, join and post in -----
   Posting "#music" on the public wall also puts the post in the #music channel. */
const slugify = name => String(name || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
const STARTER_CHANNELS = [
  ["music", "Music", "🎵", "neon", "Songs, gigs, voice notes and whatever's on repeat."],
  ["football", "Football", "⚽", "light", "Goals, rivalries, match days."],
  ["food", "Food", "🍲", "sahara", "What's cooking, where to eat, family recipes."],
  ["travel", "Travel", "✈️", "aurora", "Places you've been, places you dream of."],
  ["art", "Art", "🎨", "gallery", "Drawings, photos, poems, anything you made."],
  ["study", "Study", "📚", "ocean", "Exams, notes, motivation, late nights."],
  ["tech", "Tech", "💻", "neotokyo", "Code, gadgets, the future."],
];
if (!Object.values(walls).some(w => w.listed)) {
  for (const [slug, name, emoji, theme, description] of STARTER_CHANNELS) {
    if (!walls[slug]) walls[slug] = { name, emoji, theme, description, listed: true, createdAt: Date.now(), hostHash: null };
  }
  saveWalls();
}
const tagsFrom = text => [...new Set((String(text || "").match(/#([\p{L}\p{N}_-]{2,24})/gu) || []).map(t => slugify(t.slice(1))))]
  .filter(t => walls[t]?.listed).slice(0, 3);

/* ----- Supernovas: a post that gets loved fast explodes for everyone ----- */
const SUPERNOVA_AT = Number(process.env.SUPERNOVA_AT) || 25;       // likes + reactions within an hour
function addHeat(p) {
  const now = Date.now();
  p.heat = (p.heat || []).filter(t => now - t < 3600e3).slice(-200);
  p.heat.push(now);
  if (p.heat.length >= SUPERNOVA_AT && !(p.supernovaUntil > now)) goSupernova(p);
}
function goSupernova(p) {
  p.supernovaUntil = Date.now() + 864e5;
  broadcast(p.wall, "supernova", { id: p.id, until: p.supernovaUntil }, p);
}

/* ----- Comets: messages in a bottle to a random stranger, and their replies ----- */
const COMETS_FILE = path.join(DATA_DIR, "comets.json");
let comets = (() => { try { return JSON.parse(fs.readFileSync(COMETS_FILE, "utf8")); } catch (_) { return []; } })();
const saveComets = () => { const tmp = COMETS_FILE + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(comets)); fs.renameSync(tmp, COMETS_FILE); };
const cometView = c => ({ id: c.id, text: c.text, region: c.region, city: c.city, reply: !!c.replyTo, createdAt: c.createdAt });
function pruneComets() {
  const week = Date.now() - 7 * 864e5;
  const before = comets.length;
  comets = comets.filter(c => c.createdAt > week);
  if (comets.length !== before) saveComets();
}
// Hand a comet to someone online right now (a stranger, or the person a reply is for)
function deliverComet(c) {
  if (c.deliveredTo) return false;
  const online = [...streams].filter(s => s.key && (c.to ? s.key === c.to : s.key !== c.from && !bans.has(s.key)));
  if (!online.length) return false;
  const target = c.to ? c.to : online[Math.floor(Math.random() * online.length)].key;
  c.deliveredTo = target; c.deliveredAt = Date.now();
  saveComets();
  sendToKey(target, "comet", cometView(c));
  return true;
}
// Someone just arrived: anything waiting for them? Otherwise maybe a stray comet from a stranger.
function cometsOnArrival(key) {
  if (!key) return;
  pruneComets();
  for (const c of comets.filter(c => c.to === key && !c.deliveredTo)) deliverComet(c);
  const stray = comets.find(c => !c.to && !c.deliveredTo && c.from !== key);
  if (stray) { stray.deliveredTo = key; stray.deliveredAt = Date.now(); saveComets(); setTimeout(() => sendToKey(key, "comet", cometView(stray)), 4000); }
}

/* ----- Simple per-IP rate limit for new posts ----- */
function makeLimiter(max, message) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now(), win = 10 * 60 * 1000;
    const list = (hits.get(req.ip) || []).filter(t => now - t < win);
    if (list.length >= max) return res.status(429).json({ error: message });
    list.push(now); hits.set(req.ip, list);
    next();
  };
}
const rateLimit = makeLimiter(POSTS_PER_10_MIN, "You're posting very fast. Wait a few minutes and try again.");
const reactLimit = makeLimiter(REACTIONS_PER_10_MIN, "That's a lot of reactions. Wait a few minutes and try again.");

/* ----- App ----- */
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "10kb" }));

// Let the Android app (and any sites you list in ALLOWED_ORIGINS) call the API
const ALLOWED = new Set(["https://localhost", "capacitor://localhost", "http://localhost",
  ...String(process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean)]);
app.use("/api", (req, res, next) => {
  const origin = req.get("Origin");
  if (origin && ALLOWED.has(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, X-Delete-Token, X-Delete-Tokens, X-Admin-Token, X-Wall-Token, X-Device-Id");
    res.set("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});
app.use(express.static(path.join(ROOT, "public"), {
  setHeaders: (res, file) => { if (file.endsWith("sw.js") || file.endsWith("config.js")) res.set("Cache-Control", "no-cache"); },
}));
app.use("/uploads", (req, res, next) => { const o = req.get("Origin"); if (o && ALLOWED.has(o)) { res.set("Access-Control-Allow-Origin", o); res.set("Vary", "Origin"); } next(); });
app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "7d", immutable: true, setHeaders: r => r.set("Cross-Origin-Resource-Policy", "cross-origin") }));


// For the host's health checks
app.get("/api/health", (req, res) => res.json({ ok: true, posts: posts.length }));

app.get("/api/posts", (req, res, next) => {
  try {
    const wall = wallOf(req);
    const key = meKey(req);
    const here = new Set([wall, ...(walls[wall]?.portals || [])]);
    const listed = walls[wall]?.listed;
    res.json(posts.filter(p => !p.hidden && canSee(p, key) && (here.has(p.wall || "") || (listed && !p.wall && p.tags?.includes(wall)))).map(publicPost));
  } catch (err) { next(err); }
});

// One post (used when someone opens a share link)
app.get("/api/posts/:id", (req, res) => {
  const p = posts.find(x => x.id === req.params.id && !x.hidden && canSee(x, meKey(req)));
  if (!p) return res.status(404).json({ error: "This post isn't available any more." });
  res.json(publicPost(p));
});

// Live stream: new posts, likes/reactions/replies, removals, and who's here
app.get("/api/stream", (req, res, next) => {
  let wall;
  try { wall = wallOf(req); } catch (err) { return next(err); }
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders?.();
  res.write("retry: 4000\n\n");
  const client = { res, wall, seed: crypto.randomBytes(3).toString("hex"), key: req.query.device ? keyFor(req.query.device, req.ip) : null };
  streams.add(client);
  res.write(`event: hello\ndata: ${JSON.stringify({ seed: client.seed })}\n\n`);
  presenceSoon();
  cometsOnArrival(client.key);
  const beat = setInterval(() => res.write(": ping\n\n"), 25000);
  req.on("close", () => { clearInterval(beat); streams.delete(client); presenceSoon(); });
});

// Walls
const wallLimit = makeLimiter(6, "You've made several walls already. Try again in a few minutes.");
app.post("/api/walls", wallLimit, (req, res) => {
  const name = clean(req.body?.name, 60);
  if (name.length < 2) return res.status(400).json({ error: "Give your wall a name." });
  if (req.body?.agreed !== "1" && req.body?.agreed !== true) return res.status(400).json({ error: "Please accept the community rules first." });
  const theme = WALL_THEMES.includes(req.body?.theme) ? req.body.theme : "light";
  let slug; do slug = newSlug(); while (walls[slug]);
  const hostToken = crypto.randomBytes(18).toString("hex");
  walls[slug] = { name, theme, createdAt: Date.now(), hostHash: sha256(hostToken), by: keyFor(req.body?.deviceId, req.ip) };
  saveWalls();
  res.status(201).json({ wall: { slug, name, theme }, hostToken });
});
app.get("/api/walls/:slug", (req, res) => {
  const w = walls[req.params.slug];
  if (!w) return res.status(404).json({ error: "That wall doesn't exist (check the link)." });
  res.json({ slug: req.params.slug, name: w.name, theme: w.theme, createdAt: w.createdAt, listed: !!w.listed, emoji: w.emoji, description: w.description,
    portals: (w.portals || []).filter(s => walls[s]).map(s => ({ slug: s, name: walls[s].name })),
    posts: posts.filter(p => p.wall === req.params.slug && !p.hidden).length });
});

// Channels: the list (busiest first) and creating one
app.get("/api/channels", (req, res) => {
  const day = Date.now() - 864e5, here = {};
  for (const c of streams) here[c.wall] = (here[c.wall] || 0) + 1;
  const list = Object.entries(walls).filter(([, w]) => w.listed).map(([slug, w]) => {
    const mine = posts.filter(p => !p.hidden && p.audience !== "friends" && (p.wall === slug || (!p.wall && p.tags?.includes(slug))));
    return { slug, name: w.name, emoji: w.emoji || "🪐", theme: w.theme, description: w.description || "", posts: mine.length,
      today: mine.filter(p => p.createdAt > day).length, here: here[slug] || 0, lastPostAt: Math.max(0, ...mine.map(p => p.createdAt)) };
  }).sort((a, b) => (b.today * 3 + b.here * 5 + b.posts * 0.1) - (a.today * 3 + a.here * 5 + a.posts * 0.1));
  res.json(list);
});
const channelLimit = makeLimiter(4, "You've made several channels already. Try again later.");
app.post("/api/channels", channelLimit, (req, res) => {
  const b = req.body || {};
  if (b.agreed !== "1") return res.status(400).json({ error: "Please accept the community rules first." });
  const name = clean(b.name, 30), slug = slugify(name);
  if (slug.length < 2) return res.status(400).json({ error: "Give your channel a name (letters or numbers)." });
  if (walls[slug]) return res.status(409).json({ error: `There's already a #${slug}. Join that one!` });
  const hostToken = crypto.randomBytes(18).toString("hex");
  walls[slug] = { name, emoji: [...clean(b.emoji, 8)].slice(0, 2).join("") || "🪐", theme: WALL_THEMES.includes(b.theme) ? b.theme : "universe",
    description: clean(b.description, 140), listed: true, createdAt: Date.now(), hostHash: sha256(hostToken), by: keyFor(b.deviceId, req.ip) };
  saveWalls();
  res.status(201).json({ wall: { slug, name, theme: walls[slug].theme }, hostToken });
});

// Portals: two private walls (or channels) linked so posts flow between them
app.post("/api/walls/:slug/portal-key", (req, res) => {
  const w = walls[req.params.slug];
  if (!w || !isWallHost(req.params.slug, req)) return res.status(403).json({ error: "Only the wall's host can open portals." });
  const key = crypto.randomBytes(6).toString("hex").toUpperCase();
  w.portalKeyHash = sha256(key);
  saveWalls();
  res.json({ key });
});
app.post("/api/walls/:slug/portals", (req, res) => {
  const a = req.params.slug, b = String(req.body?.to || "").trim(), key = String(req.body?.key || "").trim().toUpperCase();
  if (!walls[a] || !isWallHost(a, req)) return res.status(403).json({ error: "Only the wall's host can open portals." });
  if (!walls[b] || b === a) return res.status(404).json({ error: "That wall doesn't exist (check the link)." });
  if (!walls[b].portalKeyHash || sha256(key) !== walls[b].portalKeyHash) return res.status(403).json({ error: "That portal key doesn't match. Ask the other wall's host for a fresh one." });
  for (const [x, y] of [[a, b], [b, a]]) { walls[x].portals = [...new Set([...(walls[x].portals || []), y])].slice(0, 6); }
  saveWalls();
  for (const s of [a, b]) broadcast(s, "portal", { slug: s === a ? b : a, name: walls[s === a ? b : a].name });
  res.json({ portals: walls[a].portals.map(s => ({ slug: s, name: walls[s].name })) });
});
app.delete("/api/walls/:slug/portals/:other", (req, res) => {
  const a = req.params.slug, b = req.params.other;
  if (!walls[a] || !isWallHost(a, req)) return res.status(403).json({ error: "Only the wall's host can close portals." });
  for (const [x, y] of [[a, b], [b, a]]) if (walls[x]) walls[x].portals = (walls[x].portals || []).filter(s => s !== y);
  saveWalls();
  res.status(204).end();
});

// Comets
const cometLimit = makeLimiter(10, "Your comets need a rest. Try again in a few minutes.");
app.post("/api/comets", cometLimit, (req, res) => {
  const b = req.body || {}, key = meKey(req);
  if (!key) return res.status(400).json({ error: "Couldn't tell who you are. Reload the page and try again." });
  if (b.agreed !== "1") return res.status(400).json({ error: "Please accept the community rules first." });
  if (bans.has(key)) return res.status(403).json({ error: "You can't send comets." });
  const text = cleanText(b.text, 280);
  if (text.length < 2) return res.status(400).json({ error: "Write something to send." });
  let to = null, replyTo = null;
  if (b.replyTo) {
    const orig = comets.find(c => c.id === b.replyTo && c.deliveredTo === key);
    if (!orig) return res.status(404).json({ error: "That comet has drifted away. Replies only work for a week." });
    to = orig.from; replyTo = orig.id;
  }
  const c = { id: crypto.randomUUID(), from: key, to, replyTo, text, ...(placeFromTz(b.tz) || {}), createdAt: Date.now() };
  comets.push(c);
  saveComets();
  const now = deliverComet(c);
  res.status(201).json({ id: c.id, delivered: now });
});
const cometReportLimit = makeLimiter(30, "You've sent a lot of reports. Wait a few minutes and try again.");
app.post("/api/comets/:id/report", cometReportLimit, (req, res) => {
  const c = comets.find(x => x.id === req.params.id && x.deliveredTo === meKey(req));
  if (!c) return res.status(404).json({ error: "That comet has drifted away." });
  c.reported = (c.reported || 0) + 1;
  saveComets();
  res.json({ ok: true });
});

// Translation through a LibreTranslate server, if you set one up (browsers that can translate on-device do it themselves)
const translateLimit = makeLimiter(120, "Too many translations. Try again in a few minutes.");
app.post("/api/translate", translateLimit, async (req, res) => {
  if (!process.env.LIBRETRANSLATE_URL) return res.status(501).json({ error: "Translation isn't set up on this server." });
  try {
    const r = await fetch(process.env.LIBRETRANSLATE_URL.replace(/\/+$/, "") + "/translate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: clean(req.body?.text, 2000), source: "auto", target: clean(req.body?.target, 8) || "en", format: "text", api_key: process.env.LIBRETRANSLATE_KEY || undefined }),
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || "failed");
    res.json({ text: body.translatedText, from: body.detectedLanguage?.language || null });
  } catch (_) { res.status(502).json({ error: "Couldn't translate that right now." }); }
});

app.post("/api/posts", rateLimit, upload.fields([{ name: "media", maxCount: 1 }, { name: "thumb", maxCount: 1 }, { name: "og", maxCount: 1 }]), async (req, res, next) => {
  const media = req.files?.media?.[0];
  const thumb = req.files?.thumb?.[0];
  const og = req.files?.og?.[0];
  const cleanup = () => [media, thumb, og].forEach(f => f && fs.unlink(f.path, () => {}));

  try {
    const b = req.body;
    const type = b.type;
    if (!["photo", "video", "voice", "quote", "thought"].includes(type)) throw httpError(400, "Choose a photo, video, voice note, quote or thought to post.");
    const wall = wallOf(req);

    if (b.agreed !== "1") throw httpError(400, "Please accept the community rules before posting.");
    const authorKey = keyFor(b.deviceId, req.ip);
    const ipKey = keyFor("", req.ip);
    if (bans.has(authorKey) || bans.has(ipKey)) throw httpError(403, "You can't post on this wall.");

    const post = {
      id: crypto.randomUUID(),
      type,
      author: clean(b.author, 40) || "Anonymous",
      authorKey,
      ip: ipKey,
      likes: 0,
      createdAt: Date.now(),
    };
    if (wall) post.wall = wall;
    if (b.night === "1") post.night = true;                 // only shows between sunset and sunrise where the viewer is
    if (b.remixOf && (type === "video" || type === "voice")) {
      const orig = posts.find(x => x.id === b.remixOf && !x.hidden && (x.type === "video" || x.type === "voice") && !isSealed(x) && canSee(x, keyFor(b.deviceId, req.ip)));
      if (!orig) throw httpError(400, "The post you're remixing isn't available any more.");
      post.remixOf = orig.id;
    }
    const place = placeFromTz(b.tz);
    if (place) Object.assign(post, place);
    if (!wall) { const tags = tagsFrom(`${b.text || ""} ${b.caption || ""}`); if (tags.length) post.tags = tags; }
    if (b.audience === "friends") {
      if (wall) throw httpError(400, "Posts on a private wall are for everyone on that wall.");
      if (!b.deviceId) throw httpError(400, "Couldn't tell who you are. Reload the page and try again.");
      userOf(authorKey, true);
      post.audience = "friends";
    }
    if (og) {
      if (og.size > MAX_THUMB_BYTES) throw httpError(413, "The preview image is too large.");
      post.og = "/uploads/" + og.filename;
    }

    if (type === "voice") {
      if (!media || !isAudioFile(media)) throw httpError(400, "Record or choose a voice note first.");
      if (media.size > MAX_AUDIO_BYTES) throw httpError(413, "That voice note is too large.");
      if (thumb) fs.unlink(thumb.path, () => {});
      const probed = hasFfprobe ? await probeDuration(media.path) : null;
      const duration = probed ?? Number(b.duration);
      if (!(duration > 0)) throw httpError(400, "Couldn't read the length of that recording.");
      if (duration > MAX_VOICE_SECONDS + 0.5) throw httpError(400, `Voice notes can be ${MAX_VOICE_SECONDS} seconds at most.`);
      post.duration = Math.round(duration * 100) / 100;
      post.url = "/uploads/" + media.filename;
      post.caption = clean(b.caption, 140);
      let peaks = [];
      try { peaks = JSON.parse(b.peaks || "[]"); } catch (_) {}
      post.peaks = (Array.isArray(peaks) ? peaks : []).slice(0, 64).map(v => Math.round(clamp(Number(v) || 0, 0, 1) * 100) / 100);
    } else if (type === "thought") {
      if (media || thumb) throw httpError(400, "Thoughts can't include files.");
      post.text = cleanText(b.text, THOUGHT_MAX);
      if (b.ink) {                                    // a handwritten thought (the text, if any, describes it)
        post.ink = cleanInk(b.ink);
        if (!post.ink) throw httpError(400, "Couldn't read that handwriting. Try again.");
        post.text = cleanText(b.text, 140);
      } else if (post.text.length < 2) throw httpError(400, "Write your thought before posting.");
      post.tint = THOUGHT_TINTS.includes(b.tint) ? b.tint : "cream";
      post.reactions = {};
      const prompt = Number(b.prompt);
      if (b.prompt !== undefined && b.prompt !== "" && Number.isInteger(prompt) && prompt >= 0 && prompt < PROMPT_COUNT) post.prompt = prompt;
    } else if (type === "quote") {
      if (media || thumb) throw httpError(400, "Quotes can't include files.");
      post.text = clean(b.text, QUOTE_MAX);
      if (post.text.length < 2) throw httpError(400, "Write a quote before posting.");
      post.quoteBy = clean(b.quoteBy, 60);
      post.style = QUOTE_STYLES.includes(b.style) ? b.style : "ink";
    } else {
      if (!media || !thumb) throw httpError(400, "The upload was incomplete. Choose the file again.");
      const isVideo = isVideoFile(media);
      if (isVideo !== (type === "video")) throw httpError(400, `That file doesn't look like a ${type}.`);
      if (!isVideo && media.size > MAX_PHOTO_BYTES) throw httpError(413, "That photo is too large.");
      if (thumb.size > MAX_THUMB_BYTES) throw httpError(413, "The preview image is too large.");

      post.caption = clean(b.caption, 140);
      post.width = Math.round(clamp(Number(b.width) || 0, 0, 10000));
      post.height = Math.round(clamp(Number(b.height) || 0, 0, 10000));
      post.url = "/uploads/" + media.filename;
      post.thumb = "/uploads/" + thumb.filename;

      if (isVideo) {
        const probed = hasFfprobe ? await probeDuration(media.path) : null;
        const duration = probed ?? Number(b.duration);
        if (!(duration > 0)) throw httpError(400, "Couldn't read the length of that video. Try an MP4 file.");
        // Longer videos can be posted as a chosen 30-second clip
        const cs = Number(b.clipStart), ce = Number(b.clipEnd);
        if (b.clipEnd !== undefined && b.clipEnd !== "") {
          if (!(cs >= 0 && ce > cs && ce - cs <= MAX_VIDEO_SECONDS + 0.5 && ce <= duration + 0.75)) throw httpError(400, `Pick a clip of up to ${MAX_VIDEO_SECONDS} seconds.`);
          post.clip = [Math.round(cs * 100) / 100, Math.round(Math.min(ce, duration) * 100) / 100];
        } else if (duration > MAX_VIDEO_SECONDS + 0.5) {
          throw httpError(400, `This video is ${Math.round(duration)} seconds long. Pick a ${MAX_VIDEO_SECONDS}-second clip from it.`);
        }
        post.duration = Math.round(duration * 100) / 100;
      }
    }

    if (b.opensAt) {
      const opensAt = Number(b.opensAt);
      if (!(opensAt > Date.now() + 30 * 1000)) throw httpError(400, "Pick an opening time in the future for your time capsule.");
      if (opensAt > Date.now() + MAX_CAPSULE_YEARS * 365.25 * 864e5) throw httpError(400, `Time capsules can stay sealed for up to ${MAX_CAPSULE_YEARS} years.`);
      post.opensAt = Math.round(opensAt);
    }

    const token = crypto.randomBytes(18).toString("hex");
    post.tokenHash = sha256(token);
    posts.unshift(post);
    save();
    const pub = publicPost(post);
    broadcast(post.wall, "post", pub, post);
    res.status(201).json({ post: pub, deleteToken: token });
  } catch (err) {
    cleanup();
    console.warn("Post rejected:", err.message);
    next(err);
  }
});

app.post("/api/posts/:id/like", (req, res) => {
  const p = posts.find(x => x.id === req.params.id && canSee(x, meKey(req)));
  if (!p) return res.status(404).json({ error: "That post no longer exists." });
  if (isSealed(p)) return res.status(403).json({ error: "This time capsule is still sealed." });
  const delta = req.body?.delta === -1 ? -1 : 1;
  p.likes = Math.max(0, (p.likes || 0) + delta);
  if (delta > 0) addHeat(p);
  save();
  broadcast(p.wall, "update", { id: p.id, likes: p.likes }, p);
  res.json({ likes: p.likes });
});

// One reaction per person per thought: the browser sends what it adds and what it removes
app.post("/api/posts/:id/react", reactLimit, (req, res) => {
  const p = posts.find(x => x.id === req.params.id && canSee(x, meKey(req)));
  if (!p) return res.status(404).json({ error: "That post no longer exists." });
  if (p.type !== "thought") return res.status(400).json({ error: "Only thoughts take reactions." });
  if (isSealed(p)) return res.status(403).json({ error: "This time capsule is still sealed." });
  const { add, remove } = req.body || {};
  p.reactions = p.reactions || {};
  if (REACTIONS.includes(remove)) p.reactions[remove] = Math.max(0, (p.reactions[remove] || 0) - 1);
  if (REACTIONS.includes(add)) { p.reactions[add] = (p.reactions[add] || 0) + 1; addHeat(p); }
  save();
  broadcast(p.wall, "update", { id: p.id, reactions: p.reactions }, p);
  res.json({ reactions: p.reactions });
});

// Report a post. Enough reports from different people hide it until an admin reviews it.
const reportLimit = makeLimiter(30, "You've sent a lot of reports. Wait a few minutes and try again.");
app.post("/api/posts/:id/report", reportLimit, (req, res) => {
  const p = posts.find(x => x.id === req.params.id && canSee(x, meKey(req)));
  if (!p) return res.status(404).json({ error: "That post no longer exists." });
  const reason = REPORT_REASONS.includes(req.body?.reason) ? req.body.reason : "other";
  const by = keyFor(req.body?.deviceId, req.ip);
  p.reports = p.reports || [];
  if (!p.reports.some(r => r.by === by)) {
    p.reports.push({ reason, note: clean(req.body?.note, 300), at: Date.now(), by });
    if (new Set(p.reports.map(r => r.by)).size >= REPORT_HIDE_THRESHOLD && !p.hidden) { p.hidden = true; broadcast(p.wall, "remove", { id: p.id }, p); }
    save();
    console.warn(`Post ${p.id} reported (${reason}); ${p.reports.length} report(s)${p.hidden ? ", now hidden" : ""}.`);
  }
  res.json({ ok: true });
});

/* ----- Replies (on thoughts) ----- */
const replyLimit = makeLimiter(40, "You're replying very fast. Wait a few minutes and try again.");
const findPost = (id, req) => posts.find(x => x.id === id && !x.hidden && (!req || canSee(x, meKey(req))));
app.get("/api/posts/:id/replies", (req, res) => {
  const p = findPost(req.params.id, req);
  if (!p) return res.status(404).json({ error: "That post no longer exists." });
  if (isSealed(p)) return res.json([]);
  res.json((p.replies || []).filter(r => !r.hidden).map(publicReply));
});
app.post("/api/posts/:id/replies", replyLimit, (req, res) => {
  const p = findPost(req.params.id, req);
  if (!p) return res.status(404).json({ error: "That post no longer exists." });
  if (p.type !== "thought") return res.status(400).json({ error: "Only thoughts take replies." });
  if (isSealed(p)) return res.status(403).json({ error: "This time capsule is still sealed." });
  const b = req.body || {};
  if (b.agreed !== "1") return res.status(400).json({ error: "Please accept the community rules first." });
  const authorKey = keyFor(b.deviceId, req.ip);
  if (bans.has(authorKey) || bans.has(keyFor("", req.ip))) return res.status(403).json({ error: "You can't post on this wall." });
  const text = cleanText(b.text, REPLY_MAX);
  if (text.length < 1) return res.status(400).json({ error: "Write a reply first." });
  if ((p.replies || []).length >= 500) return res.status(400).json({ error: "This thought has too many replies already." });
  const token = crypto.randomBytes(18).toString("hex");
  const reply = { id: crypto.randomUUID(), author: clean(b.author, 40) || "Anonymous", authorKey, text, createdAt: Date.now(), tokenHash: sha256(token) };
  (p.replies = p.replies || []).push(reply);
  save();
  const pub = publicReply(reply);
  broadcast(p.wall, "reply", { postId: p.id, reply: pub, replyCount: p.replies.filter(r => !r.hidden).length }, p);
  res.status(201).json({ reply: pub, deleteToken: token });
});
app.delete("/api/posts/:id/replies/:rid", (req, res) => {
  const p = posts.find(x => x.id === req.params.id);
  const r = p?.replies?.find(x => x.id === req.params.rid);
  if (!r) return res.status(404).json({ error: "That reply no longer exists." });
  const token = req.get("X-Delete-Token") || "";
  const ok = sha256(token) === r.tokenHash || isWallHost(p.wall, req) || (process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN);
  if (!ok) return res.status(403).json({ error: "Only the person who wrote this can delete it." });
  p.replies = p.replies.filter(x => x !== r);
  save();
  broadcast(p.wall, "unreply", { postId: p.id, replyId: r.id, replyCount: p.replies.filter(x => !x.hidden).length }, p);
  res.status(204).end();
});
app.post("/api/posts/:id/replies/:rid/report", reportLimit, (req, res) => {
  const p = posts.find(x => x.id === req.params.id);
  const r = p?.replies?.find(x => x.id === req.params.rid);
  if (!r) return res.status(404).json({ error: "That reply no longer exists." });
  const by = keyFor(req.body?.deviceId, req.ip);
  r.reports = r.reports || [];
  if (!r.reports.some(x => x.by === by)) {
    r.reports.push({ reason: REPORT_REASONS.includes(req.body?.reason) ? req.body.reason : "other", note: clean(req.body?.note, 300), at: Date.now(), by });
    if (new Set(r.reports.map(x => x.by)).size >= REPORT_HIDE_THRESHOLD && !r.hidden) {
      r.hidden = true;
      broadcast(p.wall, "unreply", { postId: p.id, replyId: r.id, replyCount: p.replies.filter(x => !x.hidden).length }, p);
    }
    save();
  }
  res.json({ ok: true });
});

/* ----- Share pages: /p/<post> and /w/<wall> get link previews (Open Graph) ----- */
const INDEX_FILE = path.join(ROOT, "public", "index.html");
const attr = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function sharePage(req, res, { title, description, image }) {
  const origin = `${req.protocol}://${req.get("host")}`;
  const tags = [
    `<base href="/">`,
    `<meta property="og:site_name" content="Glimpse">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${attr(title)}">`,
    `<meta property="og:description" content="${attr(description)}">`,
    `<meta property="og:url" content="${attr(origin + req.originalUrl)}">`,
    image ? `<meta property="og:image" content="${attr(origin + image)}">` : "",
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
    `<meta name="description" content="${attr(description)}">`,
  ].join("\n  ");
  const html = fs.readFileSync(INDEX_FILE, "utf8")
    .replace("<head>", `<head>\n  ${tags}`)
    .replace(/<title>[^<]*<\/title>/, `<title>${attr(title)}</title>`);
  res.set("Cache-Control", "no-cache").type("html").send(html);
}
const TYPE_WORD = { photo: "a photo", video: "a video", voice: "a voice note", quote: "a quote", thought: "a thought" };
app.get("/p/:id", (req, res) => {
  const p = findPost(req.params.id);
  if (!p) return sharePage(req, res, { title: "Glimpse", description: "This post isn't available any more." });
  if (p.audience === "friends") return sharePage(req, res, { title: `${p.author} shared something with friends`, description: "Only their friends on Glimpse can see it." });
  const where = p.wall && walls[p.wall] ? ` on ${walls[p.wall].name}` : " on Glimpse";
  if (isSealed(p)) {
    return sharePage(req, res, { title: `A time capsule from ${p.author}`, description: `Sealed until ${new Date(p.opensAt).toUTCString().slice(5, 16)}. Open Glimpse to watch the countdown.`, image: p.og });
  }
  const text = p.text || p.caption || "";
  sharePage(req, res, {
    title: `${p.author} shared ${TYPE_WORD[p.type] || "a post"}${where}`,
    description: text ? (text.length > 160 ? text.slice(0, 157) + "…" : text) : "Open Glimpse to see it.",
    image: p.og || p.thumb,
  });
});
app.get("/w/:slug", (req, res) => {
  const w = walls[req.params.slug];
  if (!w) return sharePage(req, res, { title: "Glimpse", description: "This wall doesn't exist. Check the link." });
  sharePage(req, res, { title: `${w.name} · Glimpse`, description: `Add your photos, videos, voice notes and thoughts to ${w.name}.` });
});

/* ----- Friends API ----- */
const friendLimit = makeLimiter(80, "That's a lot of friend activity. Wait a few minutes and try again.");
const BADGES = ["first-post", "voice", "comet", "supernova", "friend", "secrets-all", "secret", "graffiti", "void", "night", "remix", "story", "ink", "explorer", "newyear"];
function meView(key) {
  const u = users[key];
  const view = k => ({ code: users[k]?.code, name: users[k]?.name || "", id: publicIdFor(k), badges: users[k]?.badges || [] });
  return { code: u.code, name: u.name, id: publicIdFor(key), badges: u.badges || [], friends: u.friends.map(view), incoming: u.incoming.map(view), outgoing: u.outgoing.map(view), hasInvite: !!u.inviteHash };
}
const needMe = (req, res) => {
  const key = meKey(req);
  if (!key) { res.status(400).json({ error: "Couldn't tell who you are. Reload the page and try again." }); return null; }
  userOf(key, true);
  return key;
};
app.get("/api/me", (req, res) => { const key = needMe(req, res); if (key) res.json(meView(key)); });
app.post("/api/me", friendLimit, (req, res) => {
  const key = needMe(req, res); if (!key) return;
  if (typeof req.body?.name === "string") users[key].name = clean(req.body.name, 40);
  if (Array.isArray(req.body?.badges)) users[key].badges = [...new Set(req.body.badges.filter(b => BADGES.includes(b)))];
  saveUsers();
  res.json(meView(key));
});
const without = (list, k) => list.filter(x => x !== k);
function link(a, b) {
  for (const [x, y] of [[a, b], [b, a]]) {
    const u = users[x];
    if (!u.friends.includes(y)) u.friends.push(y);
    u.incoming = without(u.incoming, y); u.outgoing = without(u.outgoing, y);
  }
}
app.post("/api/friends/:action", friendLimit, (req, res) => {
  const key = needMe(req, res); if (!key) return;
  const me = users[key], action = req.params.action;
  const [tk, them] = byCode(req.body?.code);
  if (!them) return res.status(404).json({ error: "No one has that friend code. Check it and try again." });
  if (tk === key) return res.status(400).json({ error: "That's your own friend code." });
  let note = null;
  if (action === "request") {
    if (me.friends.includes(tk)) { /* already friends */ }
    else if (me.incoming.includes(tk)) { link(key, tk); note = "accepted"; }
    else if (!me.outgoing.includes(tk)) { me.outgoing.push(tk); them.incoming.push(key); note = "request"; }
  } else if (action === "accept") {
    if (!me.incoming.includes(tk)) return res.status(400).json({ error: "That request isn't there any more." });
    link(key, tk); note = "accepted";
  } else if (action === "decline") {
    me.incoming = without(me.incoming, tk); them.outgoing = without(them.outgoing, key);
  } else if (action === "cancel") {
    me.outgoing = without(me.outgoing, tk); them.incoming = without(them.incoming, key);
  } else if (action === "remove") {
    me.friends = without(me.friends, tk); them.friends = without(them.friends, key);
  } else if (action === "join") {                       // opened their invite link
    if (!them.inviteHash || sha256(String(req.body?.k || "")) !== them.inviteHash) return res.status(403).json({ error: "This invite link has expired. Ask for a new one." });
    link(key, tk); note = "joined";
  } else return res.status(400).json({ error: "Unknown action." });
  saveUsers();
  sendToKey(tk, "friends", { what: note, name: me.name || "" });
  res.json(meView(key));
});
// A fresh invite link (the old one stops working)
app.post("/api/friends-invite", friendLimit, (req, res) => {
  const key = needMe(req, res); if (!key) return;
  const token = crypto.randomBytes(12).toString("hex");
  users[key].inviteHash = sha256(token);
  saveUsers();
  res.json({ code: users[key].code, k: token });
});
// Who sent this invite? (only answers for a valid link)
app.get("/api/friends-invite/:code", (req, res) => {
  const [, them] = byCode(req.params.code);
  if (!them || !them.inviteHash || sha256(String(req.query.k || "")) !== them.inviteHash) return res.status(404).json({ error: "This invite link has expired. Ask for a new one." });
  res.json({ code: them.code, name: them.name || "" });
});
app.get("/f/:code", (req, res) => {
  const [, them] = byCode(req.params.code);
  const valid = them && them.inviteHash && sha256(String(req.query.k || "")) === them.inviteHash;
  sharePage(req, res, valid
    ? { title: `${them.name || "Someone"} invited you to be friends on Glimpse`, description: "Open the link to add them. Then you'll see each other's friends-only posts." }
    : { title: "Glimpse", description: "This invite link has expired." });
});

/* ----- Graffiti hour: once a day the wall becomes a shared canvas, then freezes into a mural ----- */
const GRAFFITI_HOUR = Number(process.env.GRAFFITI_HOUR_UTC ?? 18), GRAFFITI_MIN = Number(process.env.GRAFFITI_MINUTES) || 60;
function graffitiWindow(now = Date.now()) {
  if (process.env.GRAFFITI_ALWAYS === "1") return { open: true, startsAt: now - 1000, endsAt: now + 3600e3 };
  const d = new Date(now), start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), GRAFFITI_HOUR);
  const end = start + GRAFFITI_MIN * 60e3;
  if (now < start) return { open: false, startsAt: start, endsAt: end };
  if (now < end) return { open: true, startsAt: start, endsAt: end };
  return { open: false, startsAt: start + 864e5, endsAt: end + 864e5 };
}
const graffiti = new Map();                                 // wall → { strokes, artists }
const strokeLimit = makeLimiter(900, "You're drawing very fast. Take a breath and try again.");
app.get("/api/graffiti", (req, res, next) => {
  try {
    const wall = wallOf(req), g = graffiti.get(wall);
    res.json({ ...graffitiWindow(), strokes: g ? g.strokes : [], artists: g ? g.artists.size : 0 });
  } catch (err) { next(err); }
});
app.post("/api/graffiti/stroke", strokeLimit, (req, res, next) => {
  try {
    const wall = wallOf(req), win = graffitiWindow();
    if (!win.open) return res.status(403).json({ error: "The wall isn't open for graffiti right now." });
    const key = keyFor(req.body?.deviceId, req.ip);
    if (bans.has(key)) return res.status(403).json({ error: "You can't post on this wall." });
    const st = cleanStroke(req.body);
    if (!st) return res.status(400).json({ error: "That stroke didn't make sense." });
    const g = graffiti.get(wall) || { strokes: [], artists: new Set() };
    if (g.strokes.length >= 4000) return res.status(400).json({ error: "The wall is full of paint!" });
    g.strokes.push(st); g.artists.add(key); graffiti.set(wall, g);
    broadcast(wall, "stroke", st);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
function freezeGraffiti(force = false) {
  const win = graffitiWindow();
  for (const [wall, g] of graffiti) {
    if ((win.open && !force) || !g.strokes.length) continue;
    const mural = { id: crypto.randomUUID(), type: "mural", author: "Everyone", strokes: g.strokes, artists: g.artists.size, likes: 0, reactions: {}, createdAt: Date.now() };
    if (wall) mural.wall = wall;
    posts.unshift(mural);
    graffiti.delete(wall);
    save();
    broadcast(wall, "post", publicPost(mural));
  }
}
setInterval(freezeGraffiti, 30e3).unref();

/* ----- Admin (needs ADMIN_TOKEN) ----- */
function requireAdmin(req, res, next) {
  if (!process.env.ADMIN_TOKEN) return res.status(503).json({ error: "Set ADMIN_TOKEN on the server to use moderation." });
  const given = String(req.get("X-Admin-Token") || "");
  const a = Buffer.from(sha256(given)), b = Buffer.from(sha256(process.env.ADMIN_TOKEN));
  if (!crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "Wrong admin token." });
  next();
}
const removeFiles = p => { for (const u of [p.url, p.thumb, p.og]) if (u) fs.unlink(path.join(UPLOAD_DIR, path.basename(u)), () => {}); };

// Everything that needs a look: reported or hidden posts, most-reported first (full contents, even sealed)
app.get("/api/admin/queue", requireAdmin, (req, res) => {
  const queue = posts.filter(p => p.hidden || (p.reports && p.reports.length))
    .map(({ tokenHash, ip, authorKey, reports = [], ...p }) => ({
      ...p, authorId: publicIdFor(authorKey),
      reports: reports.map(({ by, ...r }) => r),
      reporters: new Set(reports.map(r => r.by)).size,
      postsByAuthor: posts.filter(x => x.authorKey && x.authorKey === authorKey).length,
    }))
    .map(p => ({ ...p, replies: undefined, wallName: p.wall && walls[p.wall] ? walls[p.wall].name : "" }))
    .sort((a, b) => b.reporters - a.reporters || b.createdAt - a.createdAt);
  const replies = [];
  for (const p of posts) for (const r of p.replies || []) {
    if (!r.hidden && !(r.reports && r.reports.length)) continue;
    replies.push({
      postId: p.id, postText: p.text, id: r.id, author: r.author, text: r.text, createdAt: r.createdAt, hidden: !!r.hidden,
      authorId: publicIdFor(r.authorKey), reports: (r.reports || []).map(({ by, ...x }) => x), reporters: new Set((r.reports || []).map(x => x.by)).size,
    });
  }
  replies.sort((a, b) => b.reporters - a.reporters);
  const reportedComets = comets.filter(c => c.reported).map(c => ({ id: c.id, text: c.text, city: c.city, region: c.region, reported: c.reported, createdAt: c.createdAt }));
  res.json({ queue, replies, comets: reportedComets, bans: bans.size, total: posts.length, walls: Object.keys(walls).length, threshold: REPORT_HIDE_THRESHOLD });
});
app.post("/api/admin/posts/:id/:action", requireAdmin, (req, res) => {
  const p = posts.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "That post no longer exists." });
  const action = req.params.action;
  if (action === "keep") {
    p.reports = []; p.hidden = false;
  } else if (action === "remove") {
    posts = posts.filter(x => x !== p); removeFiles(p);
    broadcast(p.wall, "remove", { id: p.id }, p);
  } else if (action === "ban") {
    if (p.authorKey) bans.add(p.authorKey);
    // IP bans are off by default: phone networks share one IP among many people
    if (p.ip && process.env.BAN_BY_IP === "true") bans.add(p.ip);
    saveBans();
    const gone = posts.filter(x => (p.authorKey && x.authorKey === p.authorKey) || x === p);
    gone.forEach(removeFiles);
    gone.forEach(x => broadcast(x.wall, "remove", { id: x.id }, x));
    posts = posts.filter(x => !gone.includes(x));
    save();
    return res.json({ ok: true, removed: gone.length });
  } else return res.status(400).json({ error: "Unknown action." });
  save();
  res.json({ ok: true });
});
app.post("/api/admin/replies/:postId/:rid/:action", requireAdmin, (req, res) => {
  const p = posts.find(x => x.id === req.params.postId);
  const r = p?.replies?.find(x => x.id === req.params.rid);
  if (!r) return res.status(404).json({ error: "That reply no longer exists." });
  const action = req.params.action;
  if (action === "keep") { r.reports = []; r.hidden = false; }
  else if (action === "remove" || action === "ban") {
    if (action === "ban" && r.authorKey) { bans.add(r.authorKey); saveBans(); }
    p.replies = p.replies.filter(x => x !== r);
    broadcast(p.wall, "unreply", { postId: p.id, replyId: r.id, replyCount: p.replies.filter(x => !x.hidden).length }, p);
  } else return res.status(400).json({ error: "Unknown action." });
  save();
  res.json({ ok: true });
});
app.post("/api/admin/supernova/:id", requireAdmin, (req, res) => {
  const p = posts.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "That post no longer exists." });
  goSupernova(p); save();
  res.json({ ok: true, until: p.supernovaUntil });
});
app.post("/api/admin/comets/:id/:action", requireAdmin, (req, res) => {
  const c = comets.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: "That comet is gone." });
  if (req.params.action === "ban") { bans.add(c.from); saveBans(); }
  comets = comets.filter(x => x !== c); saveComets();
  res.json({ ok: true });
});
app.post("/api/admin/graffiti/freeze", requireAdmin, (req, res) => { freezeGraffiti(true); res.json({ ok: true }); });
app.post("/api/admin/unban-all", requireAdmin, (req, res) => { bans = new Set(); saveBans(); res.json({ ok: true }); });

app.delete("/api/posts/:id", (req, res) => {
  const p = posts.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "That post no longer exists." });
  const token = req.get("X-Delete-Token") || "";
  const adminOk = process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN;
  const ownerOk = p.tokenHash && sha256(token) === p.tokenHash;
  if (!adminOk && !ownerOk && !isWallHost(p.wall, req)) {
    return res.status(403).json({ error: "Only the person who posted this can delete it." });
  }
  posts = posts.filter(x => x !== p);
  save();
  if (ownerOk) {                                         // the poster's own delete: into The Void
    voided.unshift({ ...p, voidedAt: Date.now() });
    saveVoid();
  } else removeFiles(p);
  broadcast(p.wall, "remove", { id: p.id }, p);
  res.status(204).end();
});

// The Void: your deleted posts (found by your device, or by the delete keys you hold)
const voidView = p => ({ ...publicPost(p), sealed: undefined, text: p.text, caption: p.caption, url: p.url, thumb: p.thumb, voidedAt: p.voidedAt, erasesAt: p.voidedAt + VOID_DAYS * 864e5 });
const mineInVoid = (p, req) => {
  const key = meKey(req);
  const tokens = String(req.get("X-Delete-Tokens") || "").split(",").filter(Boolean).slice(0, 200);
  return (key && p.authorKey === key) || tokens.some(t => sha256(t) === p.tokenHash);
};
app.get("/api/void", (req, res) => {
  res.json(voided.filter(p => mineInVoid(p, req)).map(voidView));
});
app.post("/api/void/:id/restore", (req, res) => {
  const p = voided.find(x => x.id === req.params.id);
  if (!p || !mineInVoid(p, req)) return res.status(404).json({ error: "That post isn't in your Void." });
  voided = voided.filter(x => x !== p);
  const { voidedAt, ...back } = p;
  posts.push(back);
  posts.sort((a, b) => b.createdAt - a.createdAt);
  saveVoid(); save();
  const pub = publicPost(back);
  broadcast(back.wall, "post", pub, back);
  res.json({ post: pub });
});
app.delete("/api/void/:id", (req, res) => {
  const p = voided.find(x => x.id === req.params.id);
  if (!p || !mineInVoid(p, req)) return res.status(404).json({ error: "That post isn't in your Void." });
  voided = voided.filter(x => x !== p);
  saveVoid();
  for (const u of [p.url, p.thumb, p.og]) if (u) fs.unlink(path.join(UPLOAD_DIR, path.basename(u)), () => {});
  res.status(204).end();
});

// Errors (including multer's file-size errors) come back as friendly JSON
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === "LIMIT_FILE_SIZE"
      ? `That file is too large. Videos can be up to ${MAX_VIDEO_BYTES / 1e6} MB.`
      : "The upload couldn't be read. Try again.";
    return res.status(413).json({ error: msg });
  }
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "That's too long." });
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server. Try again." });
});

function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }

app.listen(PORT, () => console.log(`Glimpse is running at http://localhost:${PORT}`));
