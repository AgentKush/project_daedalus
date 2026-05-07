#!/usr/bin/env node
// Discovers Icarus mod repos on GitHub that aren't in production's meta/repos
// registry yet. Probes each candidate for a working modinfo.json or
// toolinfo.json, writes findings to data/discovered-candidates.json. The
// workflow opens a PR when this file changes.

import fs from "node:fs";

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error("GITHUB_TOKEN required"); process.exit(1); }
const HDRS = { "Authorization": `token ${TOKEN}`, "Accept": "application/vnd.github+json" };

const REGISTRY_URL = "https://firestore.googleapis.com/v1/projects/projectdaedalus-fb09f/databases/(default)/documents/meta/repos";
const OUT = "data/discovered-candidates.json";

// Repos that aren't mod feeds (own infra, validators, tools that already get
// surfaced via toolinfo.json under their proper paths)
const ALWAYS_EXCLUDE = new Set([
  "donovanmods/project_daedalus",
  "agentkush/icarus-modinfo-validator",
  "donovanmods/project_daedalus",
  "donovanmods/icarus-mod-tools",
]);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJson(url, headers = {}) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
  return r.json();
}

async function getKnownRepos() {
  const data = await fetchJson(REGISTRY_URL);
  const list = data?.fields?.list?.arrayValue?.values || [];
  const set = new Set(ALWAYS_EXCLUDE);
  for (const v of list) {
    const url = v.stringValue || "";
    set.add(url.toLowerCase().replace(/\/$/, "").replace("https://github.com/", ""));
  }
  return set;
}

async function ghSearch(endpoint, query, perPage = 100) {
  const url = `https://api.github.com/search/${endpoint}?q=${encodeURIComponent(query)}&per_page=${perPage}`;
  return fetchJson(url, HDRS);
}

async function findCandidates(known) {
  const candidates = new Map(); // repo -> Set of reasons
  const add = (repo, reason) => {
    const r = repo.toLowerCase();
    if (!r || known.has(r)) return;
    if (!candidates.has(r)) candidates.set(r, new Set());
    candidates.get(r).add(reason);
  };

  const codeQueries = [
    "filename:modinfo.json EXMODZ",
    "filename:modinfo.json D_ItemTemplate",
    "filename:modinfo.json D_WorkshopItems",
    "filename:modinfo.json Larkwell",
    "filename:modinfo.json D_ProcessorRecipes",
    "filename:modinfo.json D_Talents",
    "EXMODZ in:name",
    "filename:toolinfo.json icarus",
  ];
  for (const q of codeQueries) {
    try {
      const res = await ghSearch("code", q);
      for (const it of (res.items || [])) {
        const repo = it.repository?.full_name;
        if (repo) add(repo, `code:${q.slice(0, 40)}`);
      }
    } catch (e) { console.warn(`[discover] code search "${q}" failed: ${e.message}`); }
    await sleep(2200); // GitHub code search: ~30 req/min authenticated
  }

  const repoQueries = [
    'topic:icarus-mods', 'topic:icarus-modding', 'topic:icarus-mod',
    '"icarus_mods" in:name', '"icarus-mods" in:name', 'icarus modinfo',
  ];
  for (const q of repoQueries) {
    try {
      const res = await ghSearch("repositories", q, 50);
      for (const it of (res.items || [])) {
        const repo = it.full_name;
        if (repo) add(repo, `repo:${q.slice(0, 30)}`);
      }
    } catch (e) { console.warn(`[discover] repo search "${q}" failed: ${e.message}`); }
    await sleep(2200);
  }

  // Also check production mod URLs for repos not in the registry
  try {
    let pageToken = null;
    do {
      const base = "https://firestore.googleapis.com/v1/projects/projectdaedalus-fb09f/databases/(default)/documents/mods?pageSize=300";
      const url = base + (pageToken ? `&pageToken=${pageToken}` : "");
      const page = await fetchJson(url);
      for (const doc of (page.documents || [])) {
        const files = doc.fields?.files?.mapValue?.fields || {};
        const urls = [];
        for (const v of Object.values(files)) urls.push(v.stringValue || "");
        urls.push(doc.fields?.readmeURL?.stringValue || "");
        for (const u of urls) {
          const m = u.match(/(?:github\.com|raw\.githubusercontent\.com)\/([\w.-]+)\/([\w.-]+)/);
          if (m) add(`${m[1]}/${m[2]}`.replace(/\.git$/, ""), "url-extract:prod-data");
        }
      }
      pageToken = page.nextPageToken || null;
    } while (pageToken);
  } catch (e) { console.warn(`[discover] url-extract failed: ${e.message}`); }

  return candidates;
}

async function probeRepo(repo) {
  for (const branch of ["main", "master", "EXMODZ", "Icarus"]) {
    for (const fn of ["modinfo.json", "toolinfo.json"]) {
      const url = `https://raw.githubusercontent.com/${repo}/${branch}/${fn}`;
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        const d = await r.json();
        const mods = Array.isArray(d?.mods) ? d.mods : [];
        const tools = Array.isArray(d?.tools) ? d.tools : [];
        if (!mods.length && !tools.length) continue;
        const first = mods[0] || tools[0] || {};
        return {
          repo,
          branch,
          file: fn,
          mod_count: mods.length,
          tool_count: tools.length,
          primary_author: first.author || "?",
          first_name: first.name || "?",
        };
      } catch {}
    }
  }
  return null;
}

async function probeAll(candidates, concurrency = 10) {
  const repos = [...candidates.keys()];
  const results = [];
  for (let i = 0; i < repos.length; i += concurrency) {
    const batch = repos.slice(i, i + concurrency);
    const probed = await Promise.all(batch.map(probeRepo));
    for (const r of probed) if (r) results.push(r);
  }
  return results;
}

async function main() {
  console.log("[discover] fetching production registry…");
  const known = await getKnownRepos();
  console.log(`[discover] ${known.size} repos in known/exclude set`);

  console.log("[discover] running GitHub searches…");
  const candidates = await findCandidates(known);
  console.log(`[discover] ${candidates.size} candidate repos to probe`);

  console.log("[discover] probing each for modinfo.json / toolinfo.json…");
  const found = await probeAll(candidates);
  found.sort((a, b) => (b.mod_count + b.tool_count) - (a.mod_count + a.tool_count));

  // Read existing file (if any) to preserve "first_seen" timestamps
  let existing = { discovered_at: null, candidates: [] };
  if (fs.existsSync(OUT)) {
    try { existing = JSON.parse(fs.readFileSync(OUT, "utf-8")); } catch {}
  }
  const existingByRepo = new Map((existing.candidates || []).map(c => [c.repo, c]));
  const today = new Date().toISOString().slice(0, 10);

  // Stable sort: by repo name, so the JSON diff is deterministic across runs
  found.sort((a, b) => a.repo.localeCompare(b.repo));
  const merged = found.map(f => {
    const prev = existingByRepo.get(f.repo);
    return {
      repo: f.repo,
      url: `https://github.com/${f.repo}`,
      branch: f.branch,
      file: f.file,
      mod_count: f.mod_count,
      tool_count: f.tool_count,
      primary_author: f.primary_author,
      first_seen: prev?.first_seen || today,
    };
  });

  const out = {
    _comment: "Repos found by GitHub search that publish modinfo.json or toolinfo.json but aren't in production's meta/repos registry. Refreshed weekly via .github/workflows/discover-modders.yml. To suggest one to Donovan, copy its URL into the production meta/repos document.",
    _registry_source: REGISTRY_URL,
    candidates: merged,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));

  console.log(`\n[discover] ${merged.length} candidates written to ${OUT}`);
  for (const c of merged) {
    const counts = [];
    if (c.mod_count) counts.push(`${c.mod_count} mod${c.mod_count===1?"":"s"}`);
    if (c.tool_count) counts.push(`${c.tool_count} tool${c.tool_count===1?"":"s"}`);
    console.log(`  - ${c.repo} (${counts.join(", ")}, by ${c.primary_author})`);
  }

  // Emit a Markdown body for the auto-PR step to pick up via body-path
  const lines = [];
  lines.push("## Discovered Icarus mod repos not in production's `meta/repos`");
  lines.push("");
  lines.push(`Found by the weekly GitHub-search scan. These ${merged.length} repos publish a working \`modinfo.json\` or \`toolinfo.json\` but aren't in production's registry yet. Forward any that look legitimate to Donovan to add to production's \`meta/repos\` Firestore document — once added, the hourly mod sync picks them up automatically.`);
  lines.push("");
  lines.push("### Candidates");
  lines.push("");
  for (const c of merged) {
    const counts = [];
    if (c.mod_count)  counts.push(`${c.mod_count} mod${c.mod_count===1?"":"s"}`);
    if (c.tool_count) counts.push(`${c.tool_count} tool${c.tool_count===1?"":"s"}`);
    lines.push(`- [\`${c.repo}\`](${c.url}) — **${counts.join(", ")}** by \`${c.primary_author}\` (e.g. _${c.first_name}_) · first seen ${c.first_seen}`);
  }
  lines.push("");
  lines.push("### URLs to copy/paste into production's `meta/repos`");
  lines.push("");
  lines.push("```");
  for (const c of merged) lines.push(c.url);
  lines.push("```");
  lines.push("");
  lines.push("### Review steps");
  lines.push("");
  lines.push("1. Eyeball the diff in `data/discovered-candidates.json` to verify the entries look right (real Icarus mods, not forks or test repos).");
  lines.push("2. For each one that looks legit, copy its URL above and ask Donovan to add it to production's `meta/repos`.");
  lines.push("3. Merge or close this PR — either way the next weekly run regenerates the file.");
  lines.push("");
  lines.push(`_Generated ${new Date().toISOString()} by \`.github/workflows/discover-modders.yml\`._`);

  fs.writeFileSync("/tmp/discovery-pr-body.md", lines.join("\n"));
  console.log(`\n[discover] PR body written to /tmp/discovery-pr-body.md`);
}

main().catch(e => { console.error(e); process.exit(1); });
