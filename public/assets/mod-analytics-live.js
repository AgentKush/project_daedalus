// Live-fills the "Mod Age" / "Freshness" cards and "Most Recently Updated"
// on the analytics panel using Firestore data. Looks up the current page's
// mod in the live mods collection by (author-slug, name-slug) match.

import { subscribe } from "./firebase-loader.js";

const GH_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function slug(s) {
  return (s || "").toString().toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Pull (owner, repo, path) out of a github.com or raw.githubusercontent.com file URL.
// Examples:
//   https://github.com/AgentKush/Icarus-mods/raw/main/AbsoluteChaos_Core/AbsoluteChaos_Core.EXMODZ
//   https://raw.githubusercontent.com/Jimk72/Icarus_Mods/main/Bear_Mount.EXMODZ
function parseGithubFileUrl(url) {
  if (!url) return null;
  let m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/(?:refs\/heads\/)?[^/]+\/(.+)$/);
  if (m) return { owner: m[1], repo: m[2], path: m[3] };
  m = url.match(/^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(?:refs\/heads\/)?[^/]+\/(.+)$/);
  if (m) return { owner: m[1], repo: m[2], path: m[3] };
  return null;
}

// Fetch the date of the first AND most-recent commit touching `path` in the repo.
// Uses GitHub's commits-by-path endpoint (60 req/hr unauthenticated). Caches per
// (owner, repo, path) tuple in localStorage for 24h, so navigating across mods
// that share a repo/file barely costs anything.
async function getCommitRange(owner, repo, path) {
  const key = `daedalus.firstCommit.${owner}/${repo}:${path}`;
  try {
    const cached = JSON.parse(localStorage.getItem(key) || "null");
    if (cached && (Date.now() - cached.cachedAt) < GH_CACHE_TTL_MS) return cached.range;
  } catch {}

  const baseUrl = `https://api.github.com/repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}&per_page=1`;
  const r1 = await fetch(baseUrl, { headers: { "Accept": "application/vnd.github+json" } });
  if (!r1.ok) throw new Error(`GitHub API ${r1.status}`);
  const newestArr = await r1.json();
  if (!newestArr.length) return null;
  const newest = newestArr[0]?.commit?.author?.date || null;

  // Walk Link header to find the last page (oldest commit)
  const link = r1.headers.get("Link") || "";
  const m = link.match(/<[^>]+[?&]page=(\d+)[^>]*>;\s*rel="last"/);
  let oldest = newest;
  if (m) {
    const lastPage = parseInt(m[1], 10);
    const r2 = await fetch(`${baseUrl}&page=${lastPage}`, { headers: { "Accept": "application/vnd.github+json" } });
    if (r2.ok) {
      const oldestArr = await r2.json();
      if (oldestArr.length) oldest = oldestArr[0]?.commit?.author?.date || newest;
    }
  }

  const range = { oldest, newest };
  try { localStorage.setItem(key, JSON.stringify({ cachedAt: Date.now(), range })); } catch {}
  return range;
}

function timeAgo(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return null;
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + "s";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  if (s < 86400 * 30) return Math.floor(s / 86400) + " day" + (Math.floor(s / 86400) === 1 ? "" : "s");
  if (s < 86400 * 365) return Math.floor(s / (86400 * 30)) + " month" + (Math.floor(s / (86400 * 30)) === 1 ? "" : "s");
  const years = Math.floor(s / (86400 * 365));
  return years + " year" + (years === 1 ? "" : "s");
}

function freshnessLabel(daysSinceUpdate) {
  if (daysSinceUpdate == null) return { label: "Unknown", css: "text-slate-400" };
  if (daysSinceUpdate < 14)  return { label: "Fresh",     css: "text-emerald-500" };
  if (daysSinceUpdate < 60)  return { label: "Recent",    css: "text-icarus-500" };
  if (daysSinceUpdate < 180) return { label: "Aging",     css: "text-yellow-500" };
  return                            { label: "Stale",     css: "text-red-400" };
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

(function init() {
  const det = document.querySelector("details[data-mod-id]");
  if (!det) return;
  const modId = det.dataset.modId;
  // modId is "<author-slug>--<name-slug>"
  const [authorSlug, nameSlug] = modId.split("--");
  if (!authorSlug || !nameSlug) return;

  // Subscribe to all mods (same call the listing makes — browser caches it)
  subscribe("mods", "./../../../data/mods.json", d => d, async (mods, status) => {
    if (!status.live) return; // need live data (covers rest/rest+backfill/websdk/websdk+backfill)

    // Find this mod by (author, name) slug match
    const me = mods.find(m =>
      slug(m.author) === authorSlug && slug(m.name) === nameSlug
    );
    if (!me) return;

    // Pick a representative file URL to pull git history for. Prefer the first
    // download URL (the actual mod file); fall back to the README URL.
    const firstFile = me.files && Object.values(me.files)[0];
    const probeUrl = firstFile || me.readmeURL || me.readme_url;
    const ghParts = parseGithubFileUrl(probeUrl);

    const ageEl = document.querySelector('[data-analytics="mod-age"]');
    const freshEl = document.querySelector('[data-analytics="freshness"]');

    // Set immediate placeholders from Firestore timestamps so the user isn't
    // staring at "loading…" while the GitHub call runs
    if (ageEl)   ageEl.innerHTML   = `<span class="text-slate-400">looking up first commit…</span>`;
    if (freshEl) freshEl.innerHTML = `<span class="text-slate-400">looking up last commit…</span>`;

    let oldest = null, newest = null;
    if (ghParts) {
      try {
        const range = await getCommitRange(ghParts.owner, ghParts.repo, ghParts.path);
        if (range) { oldest = range.oldest; newest = range.newest; }
      } catch (err) {
        console.warn(`[mod-age-live] ${me.name}: ${err.message} — falling back to Firestore timestamps`);
      }
    }

    // Fall back to Firestore document timestamps if git lookup failed
    if (!oldest) oldest = me._createTime;
    if (!newest) newest = me._updateTime;

    // Mod Age — first commit on the mod's file
    if (ageEl) {
      if (oldest) {
        ageEl.innerHTML = `${timeAgo(oldest)} old <div class="text-xs text-slate-500 dark:text-slate-400">Since ${fmtDate(oldest)}</div>`;
      } else {
        ageEl.innerHTML = `<span class="text-slate-400">Unknown</span>`;
      }
    }

    // Freshness — most recent commit
    if (freshEl) {
      if (newest) {
        const daysSince = Math.floor((Date.now() - new Date(newest).getTime()) / 86400000);
        const ind = freshnessLabel(daysSince);
        freshEl.innerHTML =
          `<div class="text-sm font-semibold ${ind.css}">${ind.label}</div>` +
          `<div class="text-xs text-slate-500 dark:text-slate-400">Updated ${daysSince} day${daysSince === 1 ? "" : "s"} ago</div>`;
      } else {
        freshEl.innerHTML = `<span class="text-slate-400">Unknown</span>`;
      }
    }

    // Author Stats: Most Recently Updated mod by this author
    const authorMods = mods.filter(m => slug(m.author) === authorSlug);
    if (authorMods.length) {
      authorMods.sort((a, b) => (b._updateTime || "").localeCompare(a._updateTime || ""));
      const newest = authorMods[0];
      const newestEl = document.querySelector('[data-analytics="newest-by-author"]');
      if (newestEl && newest && newest._updateTime) {
        const newestSlug = `${slug(newest.author)}/${slug(newest.name)}`;
        newestEl.innerHTML =
          `<a href="../../../mods/${newestSlug}/" class="text-sm font-medium text-icarus-400 hover:text-icarus-500 no-underline">${newest.name}</a>` +
          `<div class="text-xs text-slate-500 dark:text-slate-400">Most Recently Updated · ${fmtDate(newest._updateTime)}</div>`;
      }
    }
  });
})();
