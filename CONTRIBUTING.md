# Contributing to Project Daedalus

Thanks for wanting to help out!

## Adding yourself as a modder

The site builds its mod list from each modder's `modinfo.json` file on GitHub. There are two paths in:

### Fast path: open a PR

1. Make sure your GitHub repo has a `modinfo.json` at a stable URL with this shape:
   ```json
   {
     "mods": [
       {
         "name": "Mod Name",
         "author": "Your Name",
         "version": "1.0",
         "compatibility": "w229",
         "description": "What the mod does, in plain English",
         "imageURL": "https://...",
         "readmeURL": "https://...",
         "files": { "exmodz": "https://..." }
       }
     ]
   }
   ```

   The `compatibility` field is optional — if you leave it blank, the hourly sync derives the game week from your latest GitHub commit on the linked file.

2. Open a PR adding your entry to [`data/modders.json`](data/modders.json):
   ```json
   { "author": "Your Name", "url": "https://raw.githubusercontent.com/you/your-mods-repo/main/modinfo.json" }
   ```
3. Once merged, the next hourly cron run picks you up. To see it sooner, a maintainer can manually trigger the **Sync mods from modinfo.json sources** workflow on the [Actions tab](https://github.com/DonovanMods/project_daedalus/actions).

### Slow path: do nothing, get auto-discovered

Every Monday morning the [`discover-modders.yml`](.github/workflows/discover-modders.yml) workflow searches GitHub for Icarus mod repos with a `modinfo.json` that we don't already track, probes each candidate, and opens a verified-commit PR titled "Auto: new candidate Icarus mod repos discovered" if anything new turns up. So if your repo is public and has a recognisable Icarus `modinfo.json`, you'll show up within a week without doing anything.

The PR path is still recommended if you want to be added immediately or if your repo's structure is unusual (private, monorepo, non-standard branch, etc.) — the discovery workflow has heuristics, not telepathy.

## Reporting issues with a mod listing

Open a [GitHub Discussion](https://github.com/DonovanMods/project_daedalus/discussions) under the General category, or comment directly on the mod's detail page (the comment box at the bottom is backed by Discussions).

## Requesting a new mod

Open a thread on the [Mod Requests board](https://projectdaedalus.app/requests.html) (or directly in the Ideas Discussion category). Other visitors upvote with 👍 reactions; mod authors sort by reaction count to find what's wanted.

## Code changes

This is the live site, built on Eleventy + Tailwind CDN. To work on it locally:

```sh
git clone https://github.com/DonovanMods/project_daedalus.git
cd project_daedalus
npm install
npm run serve   # http://localhost:8080
npm run build   # outputs to _site/
```

PRs welcome for:
- New pages or features that mirror what production has
- Bug fixes (broken styles on mobile, etc.)
- New modder feed URLs (see "Adding yourself as a modder" above)
- Doc fixes

PRs less likely to land:
- Breaking changes to the data shape — would also need to be coordinated with the production Rails app and other consumers of `modinfo.json`
- Adding heavyweight dependencies (the goal is "static, no backend")

## Commit conventions

- **Verified commits only.** This repo enforces it for `main` via ruleset (the green "Verified" badge). For direct pushes use a GPG/SSH-signed commit or push via the GitHub web UI / `gh` CLI, which sign automatically.
- The two automated workflows (`sync-mods.yml` and `discover-modders.yml`) use [`peter-evans/create-pull-request@v8`](https://github.com/peter-evans/create-pull-request) with `sign-commits: true`, so the bot's commits are auto-signed by GitHub's web-flow key and pass the verified-commits ruleset without any per-contributor setup.
- **No `Co-Authored-By: Claude` (or similar) trailers** — maintainer preference. Strip them from commit messages and PR bodies before submitting.

## Code of Conduct

Be respectful to other contributors and modders. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for the full text.
