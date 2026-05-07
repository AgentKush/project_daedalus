# Project Daedalus

[![Live site](https://img.shields.io/badge/Live%20site-projectdaedalus.app-f1ad1c?style=flat-square)](https://projectdaedalus.app/)
[![Mod count](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fprojectdaedalus.app%2Fdata%2Fmods.json&query=%24.length&label=mods&color=f1ad1c&style=flat-square)](https://projectdaedalus.app/)
[![Modder sync](https://img.shields.io/github/actions/workflow/status/DonovanMods/project_daedalus/sync-mods.yml?label=hourly%20sync&style=flat-square)](https://github.com/DonovanMods/project_daedalus/actions/workflows/sync-mods.yml)
[![Discovery](https://img.shields.io/github/actions/workflow/status/DonovanMods/project_daedalus/discover-modders.yml?label=weekly%20discovery&style=flat-square)](https://github.com/DonovanMods/project_daedalus/actions/workflows/discover-modders.yml)
[![Pages deploy](https://img.shields.io/github/actions/workflow/status/DonovanMods/project_daedalus/deploy.yml?label=pages%20deploy&style=flat-square)](https://github.com/DonovanMods/project_daedalus/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)

Live site for Icarus mods and tools, deployed on GitHub Pages. Live data from Firestore, no application server.

## Live site

**https://projectdaedalus.app/**

## What it shows

| URL | Source |
|-----|--------|
| `/home/` | Production-style landing page (hero + 3 feature cards + Discord CTA) |
| `/` | Mods listing — search, author / source / **week** / **sort** filters, 25-page pagination, all live from Firestore |
| `/tools.html` | Community modding tools, live from Firestore |
| `/info.html` | Discord, Mod Requests, IMM Setup PDF, GPortal Install PDF |
| `/requests.html` | Mod Requests board powered by GitHub Discussions Ideas category, reactions = upvotes |
| `/mods/<author>/<slug>/` | Mod detail page for every mod — full PR #112 restyle, live README, ratings, analytics, GitHub stats, comments |

## Where the data comes from

```
production Firestore (projectdaedalus-fb09f)
                ↓
                ├── meta/repos          ─── 47 modder GitHub repo URLs
                ├── mods                ─── ~490 mod docs
                ├── tools               ─── 4 tool docs
                └── info_content        ─── info-page cards
                ↓
   Browser fetches via Firestore REST API directly (public-read)
                ↓
       Static site renders, polls every 60s for fresh data
```

The site **reads** the same data projectdaedalus.app reads, in real time. Status badge in the lower-right corner shows `● LIVE Firestore (REST)` when it's working, `○ Bundled snapshot` if fallback kicks in, and `◐ LIVE + bundled (empty collection)` when the live collection exists but is empty (used for `nexus_mods` until the Firestore collection is populated). Polling continues in this mode, so the moment the live collection fills, the listing automatically swaps over without anyone touching the site.

In the background, two workflows keep our offline fallback bundles fresh:

- **`sync-mods.yml`** runs every hour: pulls production's `meta/repos`, probes each repo's `modinfo.json` and `toolinfo.json` (across `main`/`master`/`EXMODZ`/`Icarus` branches), aggregates everything to `public/data/mods.json` + `public/data/tools.json`. Commits and triggers a Pages deploy if anything changed.
- **`discover-modders.yml`** runs every Monday morning: sweeps GitHub for Icarus mod repos that production doesn't know about yet (code search for `modinfo.json + EXMODZ`, repo-name patterns, URL extraction from production's mod data). Probes each candidate. If new ones turned up, opens a verified-commit PR titled "Auto: new candidate Icarus mod repos discovered" with the full URL list and per-candidate metadata in the body.

So even if production's Firestore is briefly unavailable, the bundled JSON fallback contains a fresh-within-the-hour snapshot. And if a new modder shows up, you'll see a PR within a week — usually less.

### Compatibility (game week) — 100% coverage

Production's `compatibility` field is hand-authored, so older mods often left it blank. The hourly sync fills any gap by walking the GitHub Commits API for each mod's file URL and converting the latest commit date to an Icarus game week (Apr 24 2026 = w229 anchor).

The URL parser handles the four shapes mods are linked from:

- `github.com/owner/repo/raw/branch/path`
- `github.com/owner/repo/blob/branch/path`
- `raw.githubusercontent.com/owner/repo/branch/path`
- `github.com/owner/repo/releases/download/tag/file` (falls back to repo HEAD)

Percent-encoded paths (`More%20Drop%20Ship%20Slots`) are decoded before the API call, and non-default branches (e.g. zailfyer's `EXMODZ`) are passed via `&sha=`. Mods derived this way carry a `compatibility_derived: true` marker on the JSON record so the UI can show them differently if it ever wants to. Result: 491/491 curated mods now show a week pill on the listing and detail pages.

## UI features

- Real `daedalus-logo.png` in the gradient header, links to `/home/`
- Real `bg-topography-dark.svg` / `bg-topography-light.svg` page backgrounds via `bg-topo-light dark:bg-topo-dark` Tailwind utilities
- Inter font, icarus-500 gold palette, paper card body
- **Theme toggle** (moon/sun emoji), persisted via `localStorage`, defaults to OS preference
- **Pagination** — 20 per page, 25 pages, `« Prev | 1 | 2 | … | last | Next »`, "Showing X to Y of N mods" counter, deep-linkable via `#page=N`
  - Mobile-aware wrap, no forced scroll on Next/Prev
- **Floating back-to-top button** appears once you've scrolled past 400 px
- **Search debounce** at 400 ms (matches the merged search-debounce-timing PR)
- **Author filter** with all 47 distinct authors in true alphabetical order (case-insensitive `localeCompare`)
- **Source filter** (Curated / Nexus / All) — Curated wins on name+author duplicates
- **Week filter** (Latest w220+ / Recent w200–219 / Older < w200 / Any) — backed by 100% game-week coverage across all 491 curated mods
- **Sort order** (Name A–Z / Name Z–A / Newest first / Oldest first) — newest/oldest sort by derived game week
- **NEXUS badge** + "View on Nexus ↗" link on Nexus rows (PR #119)
- All dropdowns use a custom inline-SVG chevron (slate-400) with `appearance-none`, so the rounded `rounded-lg` corner stays clean instead of being clipped by the browser-native arrow
- Full OG meta block including `og:image` per mod via `eleventyComputed`

## Mod detail page

Every mod has a pre-rendered detail page at `/mods/<author-slug>/<name-slug>/` matching PR #112's restyle:

- File-type badges (`exmodz` = gold, `pak` = green, others = slate) in the header
- One `DOWNLOAD <TYPE>` button per file type
- Author + version on a single flex row
- EXMODZ install note for mods that ship as EXMOD/EXMODZ
- Compatibility pill (with the right Icarus week computed from the data)
- Image floats right inside the prose at `md:` and up
- "Other mods by &lt;author&gt;" grid (up to 6 cards)
- Prev / Back to List / Next navigation, pre-computed at build time

Plus several things the static rebuild adds on top:

### Live README rendering

When the page loads, JS pulls the mod's `readmeURL` from Firestore, fetches the markdown, and renders it with [marked](https://marked.js.org/) v13. GFM tables, code blocks, shields.io badges, and links all style correctly against the dark theme via custom `.prose` CSS.

### Analytics for Mod Authors panel (collapsible)

- **File Types** — coloured badges from the mod's files map
- **Mod Age** — *first commit* on the mod's file in its GitHub repo (not the Firestore document timestamp). Computed via the GitHub Commits API.
- **Freshness** — *most recent commit* on the same file. Coloured Fresh/Recent/Aging/Stale label.
- **Your Activity** — views + downloads tracked in `localStorage`, per browser
- **Compatibility** + EXMOD-format note
- **Author Stats** — total mods + file-type breakdown + most-recently-updated mod by the same author (clickable)
- **GitHub Stats** card lazy-loads on panel open: stars, forks, open issues, since last push, license. Cached per repo for 1 hour.
- **Mod Status** — `All Clear`

### Anonymous mod ratings

Five-star widget below the README. Stable per-browser fingerprint UUID prevents ballot-stuffing. Without Firestore the rating is localStorage-only ("visible only to you"); with Firestore configured, ratings aggregate live across all visitors via `onSnapshot`.

### Comments via GitHub login (Giscus)

Discussion thread per mod, backed by GitHub Discussions on this repo. Visitors sign in with GitHub OAuth, comments land as Discussion comments under the General category, one thread per mod via the `mod-{modId}` term mapping.

The shared `<head>` warm-preconnects to `giscus.app`, `api.github.com`, `github.com`, and `avatars.githubusercontent.com`, and the giscus client script is loaded with `defer` (not `async`) so the iframe is initialised early and is fully authenticated by the time visitors scroll to it. First-click latency is noticeably better; per-click latency after the iframe is warm is still bounded by the GitHub Discussions GraphQL round-trip (the cost of using GitHub login without a custom backend).

## How GitHub-API rate limits work in this project

| Where | Auth | Limit | Cost in practice |
|---|---|---|---|
| Browser-side (Mod Age, Freshness, GitHub Stats card) | unauthenticated | **60/hr per visitor IP** | 24h `localStorage` cache means navigating across 30+ Jimk72 mods costs one round trip total |
| Server-side (sync-mods, discover-modders workflows) | `GITHUB_TOKEN` from Actions | **5,000/hr Core, 30/min Search** | Plenty for hourly + weekly cadence |

Embedding a PAT in the static-site JS would lift the browser-side limit to 5,000/hr — but anyone viewing source could exfiltrate the token. The pragmatic answer is: keep it unauthenticated, cache aggressively, fall back to Firestore timestamps if the rate limit ever kicks in. If traffic grows past that, add a Cloudflare Worker / Netlify Function that proxies the calls and hides the token, or pre-fetch commit data nightly via Actions and cache it in Firestore.

## Stack

- [Eleventy 3](https://www.11ty.dev/) — static site generator (per-page templates, build-time pagination of every mod detail page)
- [Tailwind CSS](https://tailwindcss.com/) via the CDN script (no build step)
- [marked](https://marked.js.org/) v13 for live README rendering
- Firestore REST API for live data (no Firebase SDK, no apiKey)
- Plain ES modules everywhere else
- [Giscus](https://giscus.app/) for comments + Mod Requests
- GitHub Pages + Actions

## Local dev

```sh
npm install
npm run serve   # http://localhost:8080
npm run build   # outputs to _site/
```

## Workflows

| File | Cadence | Purpose |
|---|---|---|
| `.github/workflows/deploy.yml` | on push to `main` | Build with Eleventy and deploy to Pages |
| `.github/workflows/sync-mods.yml` | hourly + manual | Pull production's `meta/repos`, aggregate every modder's `modinfo.json`/`toolinfo.json`, commit `mods.json` + `tools.json` if changed |
| `.github/workflows/discover-modders.yml` | weekly + manual | Search GitHub for Icarus mod repos not in production's registry, write `data/discovered-candidates.json`, open a verified-commit PR if any new candidates turned up |

The discovery workflow uses `peter-evans/create-pull-request@v8` with `sign-commits: true`, so the auto-PR commit is GitHub-API-signed and shows the green Verified badge. The PR body lists each candidate (clickable repo link, mod count, author, example mod, first-seen date) plus a copy-pasteable code block of all candidate URLs. PRs only fire when the candidate set actually changes — the JSON file is deterministic across runs.

## Going live with full Firebase Web SDK (optional)

The site already runs against live Firestore via REST. To upgrade to **real-time push updates** via `onSnapshot` instead of 60-second polling, drop a full `firebaseConfig` object into `public/assets/firebase-config.js`:

```js
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSy...",
  authDomain: "projectdaedalus-fb09f.firebaseapp.com",
  projectId: "projectdaedalus-fb09f",
  // ... etc
};
```

Configs are public-safe by design — security comes from Firestore Rules, not from hiding the apiKey. The loader prefers the Web SDK if present, falls back to REST otherwise.

For anonymous mod ratings to write back to Firestore, this rule needs to be in place:

```
match /ratings/{modId}/raters/{fingerprint} {
  allow read: if true;
  allow write: if request.resource.data.rating is int
                && request.resource.data.rating >= 1
                && request.resource.data.rating <= 5;
  allow delete: if true;
}
```

## Going live with Giscus comments

The Discussion section on every mod page (and the Mod Requests board) is wired against this repo's GitHub Discussions. After the migration to `DonovanMods/project_daedalus`, a one-time setup is needed:

1. Visit https://github.com/apps/giscus and **Install** on `DonovanMods/project_daedalus` (Only select repositories → tick this repo).
2. Enable Discussions on the repo (Settings → General → Features → Discussions).
3. Visit https://giscus.app — pick this repo, the **General** category for mod-detail comments, and the **Ideas** category for the Mod Requests board. Copy the generated `data-repo-id`, `data-category-id` (General), and `data-category-id` (Ideas).
4. Replace the `TODO_AFTER_GISCUS_INSTALL` placeholders in `src/mods/mod-detail.njk` (General category) and `src/requests.njk` (Ideas category) with the real IDs.

Once the placeholders are replaced and the change is deployed, per-mod threads + the Mod Requests board are fully functional.

## What changed from the previous Rails version

| | Rails (previous) | Live site (this branch) |
|---|---|---|
| Hosting cost | Container host | $0, GitHub Pages |
| Server maintenance | Yes | None |
| Mod data refresh | Cron on Donovan's local machine | GitHub Actions cron, hourly |
| Mod data freshness in browser | up to 5 min Rails cache | up to 60s Firestore polling (or sub-second with Web SDK) |
| Search | Server-side via Turbo Frame | Client-side over fetched JSON |
| Pagination | Server-rendered per page | Client-side over the same fetched array |
| Anonymous mod ratings | Server-handled | Browser writes directly, security rules enforce |
| Comments | None on production | GitHub Discussions via Giscus |
| Mod Requests | External Canny.io | GitHub Discussions Ideas category |
| Mod Age / Freshness | Static field | Live from GitHub commit history |
| Auto-discovery of new modders | None | Weekly workflow opens a PR with candidates |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The most useful contribution is getting added to production's `meta/repos` — once Donovan adds a repo, the hourly cron picks it up automatically.

## License

MIT — see [LICENSE](LICENSE).
