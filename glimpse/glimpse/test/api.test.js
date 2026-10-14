/* ==========================================================
   Glimpse API tests. Run with:  npm test
   Starts a real server on a spare port with throwaway folders,
   then checks posting, capsules, moderation, walls, replies,
   share pages and live updates. Nothing to install: uses
   Node's built-in test runner (Node 18+).
   ========================================================== */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = "test-admin-token";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "glimpse-test-"));
let server;

before(async () => {
  server = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: path.join(tmp, "data"), UPLOAD_DIR: path.join(tmp, "uploads"), ADMIN_TOKEN: ADMIN, POSTS_PER_10_MIN: "1000", SUPERNOVA_AT: "3", GRAFFITI_ALWAYS: "1" },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {                    // wait until it answers
    try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("The server didn't start");
});
after(() => { server?.kill(); fs.rmSync(tmp, { recursive: true, force: true }); });

/* ----- helpers ----- */
const fakeFile = (type, name, bytes = 2048) => new File([new Uint8Array(bytes).fill(7)], name, { type });
async function post(fields = {}, files = {}, query = "") {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ agreed: "1", deviceId: "dev-test", ...fields })) if (v !== undefined) fd.append(k, v);
  for (const [k, f] of Object.entries(files)) fd.append(k, f, f.name);
  const r = await fetch(`${BASE}/api/posts${query}`, { method: "POST", body: fd });
  return { status: r.status, body: await r.json() };
}
const json = async (url, opts = {}) => {
  const r = await fetch(BASE + url, opts);
  return { status: r.status, body: r.status === 204 ? null : await r.json().catch(() => null), headers: r.headers };
};
const send = (url, data, headers = {}) => json(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(data) });
const list = async (query = "") => (await json(`/api/posts${query}`)).body;
const thought = (text = "A test thought", extra = {}) => post({ type: "thought", text, ...extra });

/* ----- basics ----- */
test("health check answers", async () => {
  const { status, body } = await json("/api/health");
  assert.equal(status, 200);
  assert.equal(body.ok, true);
});

test("the wall starts with sample posts", async () => {
  const posts = await list();
  assert.ok(posts.some(p => p.type === "quote"));
  assert.ok(posts.some(p => p.type === "thought"));
});

test("posting requires accepting the community rules", async () => {
  const { status, body } = await post({ type: "thought", text: "hello", agreed: undefined });
  assert.equal(status, 400);
  assert.match(body.error, /community rules/);
});

test("a thought is posted and private fields never leak", async () => {
  const { status, body } = await thought("Hello from the tests");
  assert.equal(status, 201);
  assert.ok(body.deleteToken);
  const p = (await list()).find(x => x.id === body.post.id);
  assert.equal(p.text, "Hello from the tests");
  assert.ok(p.authorId, "anonymous poster ID is public");
  for (const secret of ["authorKey", "ip", "tokenHash", "reports", "replies"]) assert.ok(!(secret in p), `${secret} must stay private`);
});

test("text is validated", async () => {
  assert.equal((await post({ type: "thought", text: "x" })).status, 400);
  assert.equal((await post({ type: "nonsense" })).status, 400);
  const long = await thought("y".repeat(2000));
  assert.equal(long.body.post.text.length, 500, "thoughts are capped at 500 characters");
});

/* ----- media ----- */
test("videos longer than 30 seconds need a clip of at most 30 seconds", async () => {
  const files = () => ({ media: fakeFile("video/mp4", "v.mp4"), thumb: fakeFile("image/jpeg", "t.jpg") });
  assert.equal((await post({ type: "video", duration: "45" }, files())).status, 400);
  assert.equal((await post({ type: "video", duration: "45", clipStart: "0", clipEnd: "40" }, files())).status, 400);
  const ok = await post({ type: "video", duration: "45", clipStart: "10", clipEnd: "40" }, files());
  assert.equal(ok.status, 201);
  assert.deepEqual(ok.body.post.clip, [10, 40]);
  assert.equal((await post({ type: "video", duration: "12" }, files())).status, 201);
});

test("voice notes: up to 30 seconds, waveform cleaned up", async () => {
  const ok = await post({ type: "voice", duration: "8", peaks: JSON.stringify([0.5, 2, -1, "x"]) }, { media: fakeFile("audio/webm;codecs=opus", "a.weba") });
  assert.equal(ok.status, 201);
  assert.deepEqual(ok.body.post.peaks, [0.5, 1, 0, 0]);
  const tooLong = await post({ type: "voice", duration: "50" }, { media: fakeFile("audio/mp4", "a.m4a") });
  assert.equal(tooLong.status, 400);
});

test("unsupported files are refused", async () => {
  const r = await post({ type: "photo" }, { media: fakeFile("application/x-msdownload", "x.exe"), thumb: fakeFile("image/jpeg", "t.jpg") });
  assert.equal(r.status, 400);
});

/* ----- time capsules ----- */
test("time capsules stay sealed: no contents, no likes, no past dates", async () => {
  const opensAt = Date.now() + 86400e3;
  const { body } = await thought("Secret message to the future", { opensAt: String(opensAt) });
  const p = (await list()).find(x => x.id === body.post.id);
  assert.equal(p.sealed, true);
  assert.equal(p.text, undefined, "contents hidden");
  assert.equal((await send(`/api/posts/${p.id}/like`, { delta: 1 })).status, 403);
  assert.equal((await thought("Too late", { opensAt: String(Date.now() - 1000) })).status, 400);
});

/* ----- likes, reactions, deleting ----- */
test("likes and one reaction per change", async () => {
  const { body } = await thought("React to me");
  const id = body.post.id;
  assert.equal((await send(`/api/posts/${id}/like`, { delta: 1 })).body.likes, 1);
  const r1 = await send(`/api/posts/${id}/react`, { add: "love" });
  assert.equal(r1.body.reactions.love, 1);
  const r2 = await send(`/api/posts/${id}/react`, { add: "haha", remove: "love" });
  assert.deepEqual([r2.body.reactions.love, r2.body.reactions.haha], [0, 1]);
});

test("only the poster (or the admin) can delete a post", async () => {
  const { body } = await thought("Delete me");
  const id = body.post.id;
  assert.equal((await json(`/api/posts/${id}`, { method: "DELETE", headers: { "X-Delete-Token": "wrong" } })).status, 403);
  assert.equal((await json(`/api/posts/${id}`, { method: "DELETE", headers: { "X-Delete-Token": body.deleteToken } })).status, 204);
  assert.ok(!(await list()).some(p => p.id === id));
});

/* ----- moderation ----- */
test("reports: the same person counts once; enough people hide the post", async () => {
  const { body } = await thought("Report me");
  const id = body.post.id;
  for (const deviceId of ["r1", "r1", "r2"]) await send(`/api/posts/${id}/report`, { reason: "spam", deviceId });
  assert.ok((await list()).some(p => p.id === id), "two different people: still visible");
  await send(`/api/posts/${id}/report`, { reason: "spam", deviceId: "r3" });
  assert.ok(!(await list()).some(p => p.id === id), "three different people: hidden");
});

test("admin: needs the token, can keep or ban", async () => {
  assert.equal((await json("/api/admin/queue", { headers: { "X-Admin-Token": "nope" } })).status, 401);
  const { body } = await post({ type: "thought", text: "Spam spam spam", deviceId: "spammer" });
  const id = body.post.id;
  for (const d of ["a", "b", "c"]) await send(`/api/posts/${id}/report`, { reason: "spam", deviceId: d });
  const q = await json("/api/admin/queue", { headers: { "X-Admin-Token": ADMIN } });
  assert.ok(q.body.queue.some(p => p.id === id && p.hidden && p.reporters === 3));
  assert.equal((await send(`/api/admin/posts/${id}/keep`, {}, { "X-Admin-Token": ADMIN })).status, 200);
  assert.ok((await list()).some(p => p.id === id), "kept posts come back");
  assert.equal((await send(`/api/admin/posts/${id}/ban`, {}, { "X-Admin-Token": ADMIN })).status, 200);
  const again = await post({ type: "thought", text: "I'm back", deviceId: "spammer" });
  assert.equal(again.status, 403, "banned device can't post");
});

/* ----- replies ----- */
test("replies: on thoughts only, counted, deletable by their writer", async () => {
  const { body } = await thought("Reply to me");
  const id = body.post.id;
  const r = await send(`/api/posts/${id}/replies`, { text: "Nice!", author: "Tester", agreed: "1", deviceId: "dev-r" });
  assert.equal(r.status, 201);
  assert.ok(!("authorKey" in r.body.reply));
  assert.equal((await list()).find(p => p.id === id).replyCount, 1);
  assert.deepEqual((await json(`/api/posts/${id}/replies`)).body.map(x => x.text), ["Nice!"]);
  const quote = (await list()).find(p => p.type === "quote" && !p.sealed);
  assert.equal((await send(`/api/posts/${quote.id}/replies`, { text: "hi", agreed: "1" })).status, 400);
  const del = await json(`/api/posts/${id}/replies/${r.body.reply.id}`, { method: "DELETE", headers: { "X-Delete-Token": r.body.deleteToken } });
  assert.equal(del.status, 204);
});

/* ----- private walls ----- */
test("private walls: separate posts, host can remove, bad links fail", async () => {
  const w = await send("/api/walls", { name: "Test Wedding", theme: "sakura", agreed: "1" });
  assert.equal(w.status, 201);
  const { slug } = w.body.wall;
  const { body } = await post({ type: "thought", text: "Congrats!", wall: slug });
  assert.ok((await list(`?wall=${slug}`)).some(p => p.id === body.post.id));
  assert.ok(!(await list()).some(p => p.id === body.post.id), "not on the public wall");
  assert.equal((await json(`/api/walls/${slug}`)).body.name, "Test Wedding");
  assert.equal((await json("/api/posts?wall=doesnotexist")).status, 404);
  const removed = await json(`/api/posts/${body.post.id}`, { method: "DELETE", headers: { "X-Wall-Token": w.body.hostToken } });
  assert.equal(removed.status, 204);
});

/* ----- share pages ----- */
test("share links carry a preview (Open Graph) and load the app", async () => {
  const { body } = await thought("Look at this preview");
  const html = await (await fetch(`${BASE}/p/${body.post.id}`)).text();
  assert.match(html, /<meta property="og:description" content="Look at this preview">/);
  assert.match(html, /<base href="\/">/);
  assert.match(html, /<script src="script.js">/);
});

/* ----- live updates & the Android app ----- */
test("live stream announces new posts", async () => {
  const events = [];
  const req = http.get(`${BASE}/api/stream`, res => {
    res.setEncoding("utf8");
    res.on("data", chunk => { for (const m of chunk.matchAll(/event: (\w+)/g)) events.push(m[1]); });
  });
  await new Promise(r => setTimeout(r, 300));
  await thought("Live!");
  await new Promise(r => setTimeout(r, 500));
  req.destroy();
  assert.ok(events.includes("hello"));
  assert.ok(events.includes("post"));
});

test("the Android app is allowed to call the API; other sites aren't", async () => {
  const ok = await json("/api/posts", { headers: { Origin: "https://localhost" } });
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://localhost");
  const no = await json("/api/posts", { headers: { Origin: "https://evil.example" } });
  assert.equal(no.headers.get("access-control-allow-origin"), null);
});

/* ----- friends ----- */
const as = deviceId => ({ "X-Device-Id": deviceId });
const me = async d => (await json("/api/me", { headers: as(d) })).body;
const friendAct = (d, action, code, extra = {}) => send(`/api/friends/${action}`, { code, ...extra }, as(d));

test("friends: codes, requests, accepting, and removing", async () => {
  const amina = await me("dev-amina"), kevin = await me("dev-kevin");
  assert.match(amina.code, /^[A-Z0-9]{6}$/);
  assert.notEqual(amina.code, kevin.code);
  assert.equal((await friendAct("dev-amina", "request", amina.code)).status, 400, "can't befriend yourself");
  assert.equal((await friendAct("dev-amina", "request", "NOPE00")).status, 404);
  await friendAct("dev-amina", "request", kevin.code.toLowerCase());     // codes are case-insensitive
  assert.equal((await me("dev-kevin")).incoming[0].code, amina.code);
  const after = (await friendAct("dev-kevin", "accept", amina.code)).body;
  assert.equal(after.friends[0].code, amina.code);
  assert.equal((await me("dev-amina")).friends[0].code, kevin.code, "friendship goes both ways");
  await friendAct("dev-amina", "remove", kevin.code);
  assert.equal((await me("dev-kevin")).friends.length, 0);
});

test("friends: an invite link makes you friends straight away, and can be replaced", async () => {
  await send("/api/me", { name: "Zawadi" }, as("dev-zawadi"));
  const inv = (await send("/api/friends-invite", {}, as("dev-zawadi"))).body;
  assert.equal((await json(`/api/friends-invite/${inv.code}?k=${inv.k}`)).body.name, "Zawadi");
  assert.equal((await friendAct("dev-otieno", "join", inv.code, { k: "wrong" })).status, 403);
  assert.equal((await friendAct("dev-otieno", "join", inv.code, { k: inv.k })).body.friends[0].name, "Zawadi");
  const html = await (await fetch(`${BASE}/f/${inv.code}?k=${inv.k}`)).text();
  assert.match(html, /Zawadi invited you to be friends/);
  await send("/api/friends-invite", {}, as("dev-zawadi"));              // new link: the old one stops working
  assert.equal((await friendAct("dev-wanjiru", "join", inv.code, { k: inv.k })).status, 403);
});

test("friends-only posts: friends see them, nobody else can (list, by id, likes, previews)", async () => {
  const a = await me("dev-poster"), b = await me("dev-friend");
  await me("dev-stranger");
  await friendAct("dev-poster", "request", b.code);
  await friendAct("dev-friend", "accept", a.code);
  const { body } = await post({ type: "thought", text: "Only for my friends", audience: "friends", deviceId: "dev-poster" });
  const id = body.post.id;
  const seen = async d => (await json("/api/posts", { headers: d ? as(d) : {} })).body.some(p => p.id === id);
  assert.equal(await seen("dev-poster"), true, "the poster");
  assert.equal(await seen("dev-friend"), true, "a friend");
  assert.equal(await seen("dev-stranger"), false, "a stranger");
  assert.equal(await seen(null), false, "someone with no device ID");
  assert.equal((await json(`/api/posts/${id}`, { headers: as("dev-stranger") })).status, 404);
  assert.equal((await send(`/api/posts/${id}/like`, { delta: 1 }, as("dev-stranger"))).status, 404);
  assert.equal((await send(`/api/posts/${id}/like`, { delta: 1 }, as("dev-friend"))).status, 200);
  const html = await (await fetch(`${BASE}/p/${id}`)).text();
  assert.ok(!html.includes("Only for my friends"), "link previews never show friends-only text");
  // unfriending removes access
  await friendAct("dev-friend", "remove", a.code);
  assert.equal(await seen("dev-friend"), false);
});

test("friends-only posts are only announced live to friends", async () => {
  const a = await me("dev-live-a"), b = await me("dev-live-b");
  await friendAct("dev-live-a", "request", b.code);
  await friendAct("dev-live-b", "accept", a.code);
  const listen = device => {
    const got = [];
    const req = http.get(`${BASE}/api/stream?device=${device}`, res => {
      res.setEncoding("utf8");
      res.on("data", chunk => { if (chunk.includes("Secret friends post")) got.push(true); });
    });
    return { got, stop: () => req.destroy() };
  };
  const friend = listen("dev-live-b"), stranger = listen("dev-live-c");
  await new Promise(r => setTimeout(r, 300));
  await post({ type: "thought", text: "Secret friends post", audience: "friends", deviceId: "dev-live-a" });
  await new Promise(r => setTimeout(r, 500));
  friend.stop(); stranger.stop();
  assert.equal(friend.got.length, 1, "friend hears it");
  assert.equal(stranger.got.length, 0, "stranger doesn't");
});

/* ----- places & The Void ----- */
test("posts carry the city of the device's time zone (and nothing finer)", async () => {
  const cases = [["Africa/Nairobi", "Africa", "Nairobi"], ["America/Sao_Paulo", "South America", "Sao Paulo"], ["America/New_York", "North America", "New York"], ["Pacific/Auckland", "Oceania", "Auckland"]];
  for (const [tz, region, city] of cases) {
    const { body } = await thought(`Hello from ${city}`, { tz });
    assert.deepEqual([body.post.region, body.post.city], [region, city]);
  }
  const bad = await thought("Nowhere", { tz: "<script>" });
  assert.equal(bad.body.post.region, undefined);
});

test("The Void: deleting sends your post there; you can restore or erase it; others can't", async () => {
  const { body } = await post({ type: "thought", text: "Into the void", deviceId: "dev-voider" });
  const id = body.post.id, tok = body.deleteToken;
  assert.equal((await json(`/api/posts/${id}`, { method: "DELETE", headers: { "X-Delete-Token": tok } })).status, 204);
  assert.ok(!(await list()).some(p => p.id === id), "gone from the wall");
  const mine = await json("/api/void", { headers: as("dev-voider") });
  assert.ok(mine.body.some(p => p.id === id && p.text === "Into the void" && p.erasesAt > Date.now()));
  assert.equal((await json("/api/void", { headers: as("dev-someone-else") })).body.length, 0, "nobody else sees it");
  assert.equal((await send(`/api/void/${id}/restore`, {}, as("dev-someone-else"))).status, 404);
  const back = await send(`/api/void/${id}/restore`, {}, { "X-Delete-Tokens": tok });
  assert.equal(back.status, 200);
  assert.ok((await list()).some(p => p.id === id), "restored to the wall");
  await json(`/api/posts/${id}`, { method: "DELETE", headers: { "X-Delete-Token": tok } });
  assert.equal((await json(`/api/void/${id}`, { method: "DELETE", headers: as("dev-voider") })).status, 204);
  assert.equal((await json("/api/void", { headers: as("dev-voider") })).body.length, 0, "erased for good");
});

/* ----- channels, portals, supernovas, comets, translation ----- */
test("channels: starter channels, creating one, and #hashtags dropping posts in", async () => {
  const channels = (await json("/api/channels")).body;
  assert.ok(channels.some(c => c.slug === "music" && c.emoji));
  const made = await send("/api/channels", { name: "Nairobi Eats", emoji: "🌮", theme: "sahara", agreed: "1" });
  assert.equal(made.status, 201);
  assert.equal(made.body.wall.slug, "nairobi-eats");
  assert.equal((await send("/api/channels", { name: "nairobi eats", agreed: "1" })).status, 409, "no duplicates");
  const { body } = await thought("Best nyama choma in town #Nairobi-Eats #music");
  assert.deepEqual(body.post.tags.sort(), ["music", "nairobi-eats"]);
  assert.ok((await list()).some(p => p.id === body.post.id), "still on the public wall");
  assert.ok((await json("/api/posts?wall=nairobi-eats")).body.some(p => p.id === body.post.id), "and in the channel");
});

test("portals: two walls linked with a portal key share their posts", async () => {
  const a = (await send("/api/walls", { name: "Wedding Nairobi", agreed: "1" })).body;
  const b = (await send("/api/walls", { name: "Family London", agreed: "1" })).body;
  const hostA = { "X-Wall-Token": a.hostToken }, hostB = { "X-Wall-Token": b.hostToken };
  const key = (await send(`/api/walls/${b.wall.slug}/portal-key`, {}, hostB)).body.key;
  assert.equal((await send(`/api/walls/${a.wall.slug}/portals`, { to: b.wall.slug, key: "WRONG" }, hostA)).status, 403);
  assert.equal((await send(`/api/walls/${a.wall.slug}/portals`, { to: b.wall.slug, key }, hostA)).status, 200);
  const { body } = await post({ type: "thought", text: "Greetings from Nairobi!", wall: a.wall.slug });
  const inB = (await json(`/api/posts?wall=${b.wall.slug}`)).body.find(p => p.id === body.post.id);
  assert.equal(inB?.wallName, "Wedding Nairobi", "arrives through the portal, labelled with where it came from");
});

test("supernovas: enough love fast makes a post explode (and the admin can trigger one)", async () => {
  const { body } = await thought("Love me");
  const id = body.post.id;
  for (let i = 0; i < 3; i++) await send(`/api/posts/${id}/like`, { delta: 1 });
  const p = (await list()).find(x => x.id === id);
  assert.ok(p.supernovaUntil > Date.now());
  assert.ok(!("heat" in p));
  const other = (await thought("Admin's pick")).body.post.id;
  assert.equal((await send(`/api/admin/supernova/${other}`, {}, { "X-Admin-Token": ADMIN })).status, 200);
});

test("comets: a message in a bottle reaches a stranger online, and their reply comes back", async () => {
  const inbox = device => {
    const got = [];
    const req = http.get(`${BASE}/api/stream?device=${device}`, res => {
      res.setEncoding("utf8");
      res.on("data", chunk => { for (const m of chunk.matchAll(/event: comet\ndata: (.+)\n/g)) got.push(JSON.parse(m[1])); });
    });
    return { got, stop: () => req.destroy() };
  };
  const stranger = inbox("dev-stranger-comet");
  await new Promise(r => setTimeout(r, 300));
  const sent = await send("/api/comets", { text: "Hello, whoever you are 👋", tz: "Africa/Lagos", agreed: "1" }, as("dev-sender-comet"));
  assert.equal(sent.status, 201);
  await new Promise(r => setTimeout(r, 400));
  const c = stranger.got.find(x => x.text === "Hello, whoever you are 👋");
  assert.ok(c, "the stranger caught it");
  assert.equal(c.city, "Lagos");
  const sender = inbox("dev-sender-comet");
  await new Promise(r => setTimeout(r, 300));
  assert.equal((await send("/api/comets", { text: "Hi back from me", replyTo: c.id, agreed: "1" }, as("dev-stranger-comet"))).status, 201);
  await new Promise(r => setTimeout(r, 400));
  stranger.stop(); sender.stop();
  assert.ok(sender.got.some(x => x.text === "Hi back from me" && x.reply), "the reply comes back to the sender");
});

test("translation answers 501 until a translation server is configured", async () => {
  assert.equal((await send("/api/translate", { text: "Habari", target: "en" })).status, 501);
});

/* ----- night posts, handwriting, remixes, graffiti, badges ----- */
test("night posts, handwritten thoughts and remixes are stored and checked", async () => {
  const night = await thought("Only after dark", { night: "1" });
  assert.equal(night.body.post.night, true);
  const ink = JSON.stringify({ strokes: [{ c: "#2b59c3", s: 5, p: [10, 10, 200, 300, 999, 1200] }, { c: "javascript:", s: 3, p: [1, 2] }] });
  const hand = await post({ type: "thought", text: "", ink });
  assert.equal(hand.status, 201);
  assert.deepEqual(hand.body.post.ink.strokes, [{ c: "#2b59c3", s: 5, p: [10, 10, 200, 300, 999, 1000] }], "points clamped, junk dropped");
  assert.equal((await post({ type: "thought", text: "", ink: "not json" })).status, 400);
  const v = await post({ type: "video", duration: "8" }, { media: fakeFile("video/mp4", "v.mp4"), thumb: fakeFile("image/jpeg", "t.jpg") });
  const remix = await post({ type: "voice", duration: "5", remixOf: v.body.post.id }, { media: fakeFile("audio/webm", "a.weba") });
  assert.equal(remix.body.post.remixOf, v.body.post.id);
  const bad = await post({ type: "voice", duration: "5", remixOf: hand.body.post.id }, { media: fakeFile("audio/webm", "a.weba") });
  assert.equal(bad.status, 400, "only videos and voice notes can be remixed");
});

test("graffiti hour: strokes are shared live, then freeze into a mural", async () => {
  const win = (await json("/api/graffiti")).body;
  assert.equal(win.open, true);
  const got = [];
  const req = http.get(`${BASE}/api/stream`, r => { r.setEncoding("utf8"); r.on("data", c => { if (c.includes("event: stroke")) got.push(1); }); });
  await new Promise(r => setTimeout(r, 300));
  assert.equal((await send("/api/graffiti/stroke", { c: "#ff3dd6", s: 8, p: [100, 100, 400, 500, 600, 200], deviceId: "artist" })).status, 200);
  assert.equal((await send("/api/graffiti/stroke", { c: "#ff3dd6", s: 8, p: [1] })).status, 400);
  await new Promise(r => setTimeout(r, 300));
  req.destroy();
  assert.equal(got.length, 1, "other people see the stroke live");
  assert.equal((await json("/api/graffiti")).body.strokes.length, 1);
  await send("/api/admin/graffiti/freeze", {}, { "X-Admin-Token": ADMIN });
  const mural = (await list()).find(p => p.type === "mural");
  assert.ok(mural && mural.strokes.length === 1 && mural.author === "Everyone");
  assert.equal((await json("/api/graffiti")).body.strokes.length, 0, "a fresh canvas after freezing");
});

test("badges show on your friend card (only known ones)", async () => {
  const r = await send("/api/me", { badges: ["comet", "made-up", "secret"] }, as("dev-badger"));
  assert.deepEqual(r.body.badges, ["comet", "secret"]);
});
