// Posts a Discord embed for each new or version-bumped mod since the last
// sync. Diffs public/data/mods.json against its parent revision in git.
//
// Required env: DISCORD_WEBHOOK_URL (skipped silently if missing)

import { execSync } from "node:child_process";
import fs from "node:fs";

const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
const SITE = "https://projectdaedalus.app";

if (!WEBHOOK) {
  console.log("[notify-discord] DISCORD_WEBHOOK_URL not set; skipping.");
  process.exit(0);
}

function loadFromGit(rev, path) {
  try {
    const buf = execSync(`git show ${rev}:${path}`, { encoding: "buffer" });
    return JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
}

function slug(s) {
  return (s || "").toString().toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const PATH = "public/data/mods.json";
const prev = loadFromGit("HEAD~1", PATH) || [];
const curr = loadFromGit("HEAD", PATH) || [];

const prevById = new Map(prev.map(m => [m.id, m]));
const newMods = [];
const updated = [];

for (const m of curr) {
  const before = prevById.get(m.id);
  if (!before) { newMods.push(m); continue; }
  if ((before.version || "") !== (m.version || "") ||
      (before.compatibility || "") !== (m.compatibility || "")) {
    updated.push({ before, after: m });
  }
}

console.log(`[notify-discord] new=${newMods.length} updated=${updated.length}`);
if (newMods.length === 0 && updated.length === 0) process.exit(0);

// Cap embeds per webhook call (Discord allows 10 per message)
const embeds = [];
for (const m of newMods.slice(0, 10)) {
  embeds.push({
    title: `🆕 ${m.name}`,
    url: `${SITE}/mods/${slug(m.author)}/${slug(m.name)}/`,
    description: (m.description || "").slice(0, 280),
    color: 0xf1ad1c,
    fields: [
      { name: "Author", value: m.author || "unknown", inline: true },
      { name: "Compat", value: m.compatibility || "—", inline: true },
      { name: "Files", value: Object.keys(m.files || {}).join(", ") || "—", inline: true }
    ]
  });
}
for (const { after: m, before } of updated.slice(0, 10 - embeds.length)) {
  const changes = [];
  if ((before.version || "") !== (m.version || "")) changes.push(`version ${before.version || "?"} → **${m.version || "?"}**`);
  if ((before.compatibility || "") !== (m.compatibility || "")) changes.push(`week ${before.compatibility || "?"} → **${m.compatibility || "?"}**`);
  embeds.push({
    title: `🔧 ${m.name}`,
    url: `${SITE}/mods/${slug(m.author)}/${slug(m.name)}/`,
    description: changes.join(" · "),
    color: 0x16a34a,
    fields: [
      { name: "Author", value: m.author || "unknown", inline: true }
    ]
  });
}

if (embeds.length === 0) process.exit(0);

const body = {
  username: "Project Daedalus",
  avatar_url: `${SITE}/assets/img/daedalus-logo.png`,
  content: `${newMods.length} new · ${updated.length} updated mod${(newMods.length + updated.length) === 1 ? "" : "s"} this sync`,
  embeds
};

const r = await fetch(WEBHOOK, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

if (!r.ok) {
  console.error(`[notify-discord] Discord rejected ${r.status}: ${await r.text()}`);
  process.exit(1);
}
console.log(`[notify-discord] posted ${embeds.length} embed(s)`);
