# Security Policy

## Supported Versions

This is a single live deployment at https://projectdaedalus.app/. Only the `main` branch is supported — there are no point releases or LTS branches.

## Reporting a Vulnerability

If you've found a security issue (XSS, secrets exposure, supply-chain risk, etc.), please **don't open a public issue**. Instead:

- **Open a private security advisory:** https://github.com/DonovanMods/project_daedalus/security/advisories/new
- Or DM the maintainer on the [Icarus Modding Discord](https://discord.gg/linkarus-icarus-modding-936621749733302292)

You'll usually get a response within 48 hours. If the issue is confirmed, we'll work on a fix and credit you in the patch (unless you'd prefer to stay anonymous).

## Scope

In scope:
- The static site at projectdaedalus.app/ and its source in this repo
- The hourly modinfo.json sync workflow
- Anonymous mod ratings (Firestore writes once configured)
- Giscus comment integration

Out of scope:
- Mods linked from the listing — please report issues with a specific mod to that mod's author directly.
- Cloudflare / GitHub Pages infrastructure itself — report to the respective platform.
- Vulnerabilities only exploitable with admin access to the deploying GitHub account (nothing to do here).
