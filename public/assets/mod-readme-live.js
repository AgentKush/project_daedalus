// Live-render the README for the current mod.
// Fetches the mod's readmeURL from Firestore (via firebase-loader's subscribe()),
// downloads the markdown, renders it, replaces the prose body.
//
// Mirrors the Rails Convertable concern: converts github.com/X/raw/Y URLs to
// raw.githubusercontent.com/X/Y so the browser can fetch them with CORS.

import { subscribe } from "./firebase-loader.js";
import { marked } from "https://cdn.jsdelivr.net/npm/marked@13.0.0/lib/marked.esm.js";

function slug(s) {
  return (s || "").toString().toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function rawifyGithubUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.hostname === "github.com") {
      u.hostname = "raw.githubusercontent.com";
      u.pathname = u.pathname.replace(/\/raw\//, "/");
    }
    return u.toString();
  } catch { return url; }
}

// Strip the leading H1 from a README — production does this so the visible
// page heading isn't repeated below.
function stripLeadingH1(md) {
  return (md || "").replace(/^\s*#\s+.*\n+/, "");
}

(function init() {
  const det = document.querySelector("details[data-mod-id]");
  if (!det) return;
  const modId = det.dataset.modId;
  const [authorSlug, nameSlug] = modId.split("--");
  if (!authorSlug || !nameSlug) return;

  const proseEl = document.querySelector("section .prose");
  const fallbackNote = Array.from(document.querySelectorAll("p"))
    .find(p => p.textContent.includes("Full README will load dynamically"));

  // Already rendered build-time README? Then production already has it
  // baked in, no need to override. Detect via the italic fallback note.
  const hasBuildTimeReadme = !fallbackNote;

  subscribe("mods", "./../../../data/mods.json", d => d, async (mods, status) => {
    if (status.source !== "rest" && status.source !== "websdk") return;
    const me = mods.find(m => slug(m.author) === authorSlug && slug(m.name) === nameSlug);
    if (!me) return;

    const readmeUrl = me.readmeURL || me.readme_url;
    if (!readmeUrl) {
      // No README — leave the description in place, just remove the misleading note
      if (fallbackNote) fallbackNote.remove();
      return;
    }

    try {
      const url = rawifyGithubUrl(readmeUrl);
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const md = await r.text();
      marked.use({
        gfm: true,           // GFM tables, strikethrough, autolinks
        breaks: false,       // require blank line for paragraph breaks (like GitHub)
        mangle: false,
        headerIds: false,
      });
      const html = marked.parse(stripLeadingH1(md));
      if (proseEl) proseEl.innerHTML = html;
      if (fallbackNote) fallbackNote.remove();
    } catch (err) {
      console.warn(`[readme-live] ${me.name}: ${err.message}`);
      // On failure leave the description + the (now slightly inaccurate) note
      if (fallbackNote) fallbackNote.textContent = `Couldn't fetch README from ${readmeUrl} (${err.message}).`;
    }
  });
})();
