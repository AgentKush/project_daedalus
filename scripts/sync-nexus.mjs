#!/usr/bin/env node
// Bootstrap-walks the Nexus Mods catalog for Icarus and writes
// public/data/nexus_mods.json. Mirrors PR #119's NexusSync.bootstrap.
//
// Computes a game-week compatibility ("wNNN") from each mod's updated_time
// (or uploaded_time fallback) anchored to Icarus release week 1 = 2021-11-04.
//
// Requires NEXUS_API_KEY in the environment.

import fs from "node:fs";

const KEY = process.env.NEXUS_API_KEY;
if (!KEY) {
  console.error("NEXUS_API_KEY not set");
  process.exit(1);
}

const RANGE_END = parseInt(process.env.NEXUS_RANGE_END || "200", 10);
const CONCURRENCY = 10;
// Game-week anchor: per Steam, Apr 24 2026 was Week 229 (Atmospheric Update).
// Derive every other week relative to that known point.
const REFERENCE_MS = Date.UTC(2026, 3, 24); // Apr 24, 2026 (month 0-indexed)
const REFERENCE_WEEK = 229;

function gameWeek(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const offsetDays = Math.floor((t - REFERENCE_MS) / (24 * 3600 * 1000));
  // floorDiv on negative numbers: JS Math.floor handles this correctly
  const weeksOffset = Math.floor(offsetDays / 7);
  const wn = REFERENCE_WEEK + weeksOffset;
  return wn >= 1 ? `w${wn}` : null;
}

async function fetchMod(id) {
  const r = await fetch(`https://api.nexusmods.com/v1/games/icarus/mods/${id}.json`, {
    headers: {
      "apikey": KEY,
      "Application-Name": "ProjectDaedalus",
      "Application-Version": "1.0",
      "Accept": "application/json"
    }
  });
  if (!r.ok) return null;
  const d = await r.json();
  return d.available ? d : null;
}

async function main() {
  console.log(`[nexus] walking IDs 1..${RANGE_END} with concurrency ${CONCURRENCY}`);
  const results = [];
  for (let start = 1; start <= RANGE_END; start += CONCURRENCY) {
    const batch = Array.from({ length: Math.min(CONCURRENCY, RANGE_END - start + 1) }, (_, i) => start + i);
    const fetched = await Promise.all(batch.map(fetchMod));
    fetched.forEach((d, i) => { if (d) results.push(d); });
  }

  const mods = results.map(d => ({
    id: String(d.mod_id),
    nexus_id: d.mod_id,
    name: d.name || `Nexus mod #${d.mod_id}`,
    author: d.author || d.uploaded_by || "Unknown",
    version: d.version || "",
    compatibility: gameWeek(d.updated_time || d.uploaded_time),
    description: ((d.summary || d.description || "").replace(/\n/g, " ").trim()).slice(0, 200),
    summary: d.summary,
    image_url: d.picture_url,
    mod_page_url: `https://www.nexusmods.com/icarus/mods/${d.mod_id}`,
    endorsements: d.endorsement_count,
    downloads: d.mod_downloads,
    uploaded_time: d.uploaded_time,
    updated_time: d.updated_time,
    source: "nexus"
  })).sort((a, b) => (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase()));

  fs.writeFileSync("public/data/nexus_mods.json", JSON.stringify(mods));
  console.log(`[nexus] wrote ${mods.length} mods to public/data/nexus_mods.json`);
  const withWeek = mods.filter(m => m.compatibility).length;
  console.log(`[nexus] ${withWeek}/${mods.length} have a derived game week`);
}

main().catch(e => { console.error(e); process.exit(1); });
