/* Copies the website (../public) into www/ for the app, and points it at your server.
   Set the address in glimpse.config.json, or run:  GLIMPSE_SERVER=https://… npm run sync */
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "public");
const out = path.join(__dirname, "www");
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "glimpse.config.json"), "utf8"));
const server = String(process.env.GLIMPSE_SERVER || cfg.server || "").replace(/\/+$/, "");

if (!/^https:\/\//.test(server) || server.includes("YOUR-GLIMPSE-SERVER")) {
  console.warn("\n⚠  Set your server's https address in android-app/glimpse.config.json first.");
  console.warn("   Until then the app works offline only (posts stay on the phone).\n");
}

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });
fs.rmSync(path.join(out, "sw.js"), { force: true });              // not needed inside the app
fs.rmSync(path.join(out, "admin.html"), { force: true });          // moderation stays on the website
fs.writeFileSync(path.join(out, "config.js"),
  `window.GLIMPSE_CONFIG = { apiBase: ${JSON.stringify(server.includes("YOUR-GLIMPSE-SERVER") ? "" : server)} };\n`);
console.log(`www/ ready → server: ${server || "(none, offline only)"}`);
