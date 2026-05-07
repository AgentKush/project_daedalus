// Lazy-loads GitHub repo stats when the user opens the Analytics panel.
// Hits api.github.com unauthenticated (60 req/hr per IP). Caches per repo
// in localStorage for 1 hour, so navigating between mods that share a repo
// (Jimk72's 30+ mods all live in Jimk72/Icarus_Mods) costs one request.

const TTL_MS = 60 * 60 * 1000;

function parseRepoFromUrl(url) {
  if (!url) return null;
  const m = url.match(/(?:github\.com|raw\.githubusercontent\.com)\/([\w.-]+)\/([\w.-]+)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

function findRepoForMod() {
  const links = document.querySelectorAll('a[href*="github"], a[href*="raw.githubusercontent"]');
  for (const a of links) {
    const r = parseRepoFromUrl(a.href);
    if (r) return r;
  }
  return null;
}

async function fetchRepoStats(owner, repo) {
  const cacheKey = `daedalus.gh.${owner}/${repo}`;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (cached && (Date.now() - cached.cachedAt) < TTL_MS) return cached.data;
  } catch (e) {}

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { "Accept": "application/vnd.github+json" }
  });
  if (!res.ok) {
    if (res.status === 403) throw new Error("rate-limited (60/hr)");
    if (res.status === 404) throw new Error("repo not found");
    throw new Error(`HTTP ${res.status}`);
  }
  const d = await res.json();
  const stats = {
    repo_url: d.html_url,
    stars: d.stargazers_count,
    forks: d.forks_count,
    open_issues: d.open_issues_count,
    pushed_at: d.pushed_at,
    license: d.license && d.license.spdx_id,
    description: d.description
  };
  try { localStorage.setItem(cacheKey, JSON.stringify({ cachedAt: Date.now(), data: stats })); } catch (e) {}
  return stats;
}

function timeAgo(iso) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  if (s < 86400 * 30) return Math.floor(s / 86400) + "d ago";
  if (s < 86400 * 365) return Math.floor(s / (86400 * 30)) + "mo ago";
  return Math.floor(s / (86400 * 365)) + "y ago";
}

function renderCard(repoLabel, stats) {
  return `<div class="p-4 border rounded-lg border-slate-300/50 dark:border-slate-600/50 bg-slate-300/40 dark:bg-slate-900/40">
    <div class="flex items-center justify-between flex-wrap gap-2">
      <div class="text-xs font-medium tracking-wide uppercase text-icarus-500">GitHub Repository</div>
      <a href="${stats.repo_url}" target="_blank" rel="noopener noreferrer" class="text-xs text-icarus-500 hover:text-icarus-400">${repoLabel} ↗</a>
    </div>
    <div class="grid gap-4 mt-3 sm:grid-cols-4">
      <div><div class="text-xl font-bold text-icarus-500">${stats.stars}</div><div class="text-xs text-slate-500 dark:text-slate-400">Stars</div></div>
      <div><div class="text-xl font-bold text-icarus-500">${stats.forks}</div><div class="text-xs text-slate-500 dark:text-slate-400">Forks</div></div>
      <div><div class="text-xl font-bold text-icarus-500">${stats.open_issues}</div><div class="text-xs text-slate-500 dark:text-slate-400">Open Issues</div></div>
      <div><div class="text-xl font-bold text-icarus-500">${timeAgo(stats.pushed_at)}</div><div class="text-xs text-slate-500 dark:text-slate-400">Since Last Push</div></div>
    </div>
    ${stats.license ? `<div class="mt-2 text-xs text-slate-500 dark:text-slate-400">License: ${stats.license}</div>` : ""}
  </div>`;
}

(function init() {
  const slot = document.getElementById("github-stats-slot");
  if (!slot) return;
  const details = document.querySelector("details[data-mod-id]");
  if (!details) return;

  const repo = findRepoForMod();
  if (!repo) {
    slot.innerHTML = "";
    return;
  }

  let loaded = false;
  async function load() {
    if (loaded) return;
    loaded = true;
    slot.innerHTML = `<div class="p-4 border rounded-lg border-slate-300/50 dark:border-slate-600/50 bg-slate-300/40 dark:bg-slate-900/40 text-xs text-slate-500">Loading GitHub stats for <code>${repo.owner}/${repo.repo}</code>…</div>`;
    try {
      const stats = await fetchRepoStats(repo.owner, repo.repo);
      slot.innerHTML = renderCard(`${repo.owner}/${repo.repo}`, stats);
    } catch (err) {
      loaded = false;
      slot.innerHTML = `<div class="p-4 border rounded-lg border-slate-300/50 dark:border-slate-600/50 bg-slate-300/40 dark:bg-slate-900/40 text-xs text-slate-500">GitHub stats unavailable: ${err.message}</div>`;
    }
  }

  details.addEventListener("toggle", () => { if (details.open) load(); });
  if (details.open) load();
})();
