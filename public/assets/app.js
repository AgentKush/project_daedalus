import { subscribe, attachStatusBadge } from "./firebase-loader.js";

const PAGE_SIZE = 20;

function slug(s) { return (s || "unknown").toString().toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function escape(s) { return (s || "").toString().replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function preferredType(mod) { const f = mod.files || {}; if (f.pak) return "pak"; if (f.zip) return "zip"; if (f.exmodz) return "exmodz"; if (f.exmod) return "exmod"; return null; }
function isNexus(mod) { return mod.source === "nexus" || (!mod.files && mod.mod_page_url); }

function transformMod(d) {
  const id = d.id || `${slug(d.author)}--${slug(d.name)}`;
  return {
    id, name: d.name, author: d.author, version: d.version,
    compatibility: d.compatibility || null,
    description: d.description, files: d.files || {},
    image_url: d.image_url || d.imageURL || null,
    mod_page_url: d.mod_page_url || null,
    source: d.source || (d.mod_page_url && !d.files ? "nexus" : "curated")
  };
}

function dedup(mods) {
  const seen = new Set(), out = [];
  for (const m of mods.filter(m => !isNexus(m))) {
    const key = `${(m.name||"").toLowerCase()}::${slug(m.author)}`;
    if (!seen.has(key)) { seen.add(key); out.push(m); }
  }
  for (const m of mods.filter(isNexus)) {
    const key = `${(m.name||"").toLowerCase()}::${slug(m.author)}`;
    if (!seen.has(key)) { seen.add(key); out.push(m); }
  }
  return out.sort((a, b) => (a.name||"").localeCompare(b.name||""));
}

function detailHref(mod) {
  if (isNexus(mod)) return mod.mod_page_url;
  // Every curated mod has a pre-rendered detail page at /mods/<author-slug>/<name-slug>/
  return `./mods/${slug(mod.author)}/${slug(mod.name)}/`;
}

function renderRow(mod) {
  const nx = isNexus(mod), href = detailHref(mod);
  const action = nx
    ? `<a href="${escape(mod.mod_page_url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="inline-flex items-center px-2 py-1 sm:px-3 sm:py-1.5 text-xs font-medium text-white rounded-md shadow-sm bg-icarus-500 hover:bg-icarus-600"><span class="hidden sm:inline">View on&nbsp;</span>Nexus &nearr;</a>`
    : (() => {
        const type = preferredType(mod);
        if (!type) return `<span class="text-xs text-slate-500">&mdash;</span>`;
        return `<a href="${escape(mod.files[type])}" download onclick="event.stopPropagation()" class="inline-flex items-center px-2 py-1 sm:px-3 sm:py-1.5 text-xs font-medium text-white rounded-md shadow-sm bg-icarus-500 hover:bg-icarus-600"><span class="hidden sm:inline">Download&nbsp;</span>${type.toUpperCase()}</a>`;
      })();
  const compat = mod.compatibility
    ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-icarus-500/20 text-icarus-500">${escape(mod.compatibility.toLowerCase())}</span>`
    : `<span class="text-xs text-slate-500">&mdash;</span>`;
  const badge = nx ? `<span class="source-badge" title="Synced from Nexus Mods">NEXUS</span>` : "";
  const desc = (mod.description || "").length > 120 ? mod.description.slice(0, 120) + "…" : (mod.description || "");
  const cls = (href ? "cursor-pointer " : "") + "row-lift border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/70";
  const onclick = href ? ` onclick="window.location.href='${href}'"` : "";
  return `<tr class="${cls}"${onclick}>
    <td class="p-2 sm:p-3 font-medium text-slate-800 dark:text-slate-200">${escape(mod.name)}${badge}</td>
    <td class="p-2 sm:p-3 whitespace-nowrap">${action}</td>
    <td class="hidden p-3 text-sm sm:table-cell text-slate-600 dark:text-slate-400">${mod.author ? `<a href="./authors/${slug(mod.author)}/" class="hover:text-icarus-500 hover:underline" onclick="event.stopPropagation()">${escape(mod.author)}</a>` : "unknown"}</td>
    <td class="hidden p-3 text-sm text-right md:table-cell text-slate-600 dark:text-slate-400">${escape(mod.version || "")}</td>
    <td class="hidden p-3 text-sm text-center xl:table-cell">${compat}</td>
    <td class="hidden p-3 text-sm xl:table-cell text-slate-600 dark:text-slate-400 max-w-md truncate" title="${escape(mod.description || "")}">${escape(desc)}</td>
  </tr>`;
}

function renderPagination(totalPages, currentPage) {
  if (totalPages <= 1) return "";
  const btn = (label, page, opts = {}) => {
    const cls = `pag-btn${opts.active ? " active" : ""}${opts.disabled ? " disabled" : ""}`;
    if (opts.disabled || opts.active) return `<span class="${cls}">${label}</span>`;
    return `<a href="#page=${page}" class="${cls}" data-page="${page}">${label}</a>`;
  };
  const parts = [btn("« Prev", currentPage - 1, { disabled: currentPage <= 1 })];
  // Compact numbered set: 1, 2, ..., currentPage-1, currentPage, currentPage+1, ..., last
  const showNums = new Set([1, 2, totalPages, totalPages - 1, currentPage, currentPage - 1, currentPage + 1]);
  let prev = 0;
  for (let p = 1; p <= totalPages; p++) {
    if (!showNums.has(p)) continue;
    if (prev && p - prev > 1) parts.push(`<span class="pag-ellipsis">…</span>`);
    parts.push(btn(String(p), p, { active: p === currentPage }));
    prev = p;
  }
  parts.push(btn("Next »", currentPage + 1, { disabled: currentPage >= totalPages }));
  return parts.join("");
}

function readPageFromHash() {
  const m = (location.hash || "").match(/page=(\d+)/);
  return m ? Math.max(1, parseInt(m[1], 10)) : 1;
}

const state = { mods: [], nexusMods: [], page: readPageFromHash() };
const setStatus = attachStatusBadge();

function refresh() {
  const all = dedup([...state.mods, ...state.nexusMods]);
  const q = (document.getElementById("search").value || "").trim().toLowerCase();
  const author = document.getElementById("author-filter").value;
  const source = document.getElementById("source-filter").value;
  const weekBucket = document.getElementById("week-filter")?.value || "";
  const sortOrder = document.getElementById("sort-order")?.value || "name-asc";
  const weekNum = (m) => {
    const x = (m.compatibility || "").match(/^w(\d+)$/i);
    return x ? parseInt(x[1], 10) : null;
  };
  const filtered = all.filter(mod => {
    const nx = isNexus(mod);
    if (source === "nexus" && !nx) return false;
    if (source === "curated" && nx) return false;
    if (author && slug(mod.author) !== author) return false;
    if (q) {
      const hay = `${mod.name||""} ${mod.author||""} ${mod.description||""} ${mod.compatibility||""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (weekBucket) {
      const w = weekNum(mod);
      if (w == null) return false;
      if (weekBucket === "latest" && !(w >= 220)) return false;
      if (weekBucket === "recent" && !(w >= 200 && w < 220)) return false;
      if (weekBucket === "older"  && !(w < 200)) return false;
    }
    return true;
  });

  const cmp = (a, b) => (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase());
  if (sortOrder === "name-desc") filtered.sort((a, b) => cmp(b, a));
  else if (sortOrder === "week-desc") filtered.sort((a, b) => (weekNum(b) ?? -1) - (weekNum(a) ?? -1) || cmp(a, b));
  else if (sortOrder === "week-asc")  filtered.sort((a, b) => (weekNum(a) ?? Infinity) - (weekNum(b) ?? Infinity) || cmp(a, b));
  else filtered.sort(cmp);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (state.page > totalPages) state.page = totalPages;
  const start = (state.page - 1) * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);

  document.getElementById("rows").innerHTML = slice.length
    ? slice.map(renderRow).join("")
    : `<tr><td colspan="6" class="p-6 text-center text-icarus-500">No mods match your filters</td></tr>`;
  document.getElementById("count").textContent = `${total} mod${total === 1 ? "" : "s"}`;
  document.getElementById("page-info").textContent = total
    ? `Showing ${start + 1} to ${Math.min(start + PAGE_SIZE, total)} of ${total} mods`
    : "";
  document.getElementById("pagination").innerHTML = renderPagination(totalPages, state.page);

  document.querySelectorAll("#pagination [data-page]").forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault();
      state.page = parseInt(el.dataset.page, 10);
      location.hash = `page=${state.page}`;
      refresh();
    });
  });

  // Refresh author filter when the set of distinct authors changes
  const sel = document.getElementById("author-filter");
  const sortedAuthors = [...new Set(all.map(m => m.author).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const fingerprint = sortedAuthors.join("|");
  if (sel.dataset.fingerprint !== fingerprint) {
    const current = sel.value;
    sel.innerHTML = `<option value="">All authors</option>`;
    for (const a of sortedAuthors) {
      const opt = document.createElement("option");
      opt.value = slug(a); opt.textContent = a;
      sel.appendChild(opt);
    }
    sel.value = current;
    sel.dataset.fingerprint = fingerprint;
  }
}

// Pre-warm: load both bundled JSONs in parallel so the first paint includes
// curated AND nexus rows even before any live subscription has resolved.
// The subscribe() calls below then overlay live data once Firestore returns.
(async () => {
  try {
    const [curated, nexus] = await Promise.all([
      fetch("./data/mods.json").then(r => r.json()).catch(() => []),
      fetch("./data/nexus_mods.json").then(r => r.json()).catch(() => [])
    ]);
    if (state.mods.length === 0) state.mods = curated.map(d => ({ ...transformMod(d), source: "curated" }));
    if (state.nexusMods.length === 0) state.nexusMods = nexus.map(d => ({
      ...transformMod(d), source: "nexus",
      mod_page_url: d.mod_page_url || `https://www.nexusmods.com/icarus/mods/${d.nexus_id}`
    }));
    refresh();
  } catch (e) { /* silent — subscribe() will populate when REST returns */ }
})();

subscribe("mods", "./data/mods.json", d => ({ ...transformMod(d), source: "curated" }), (mods, status) => {
  state.mods = mods;
  setStatus(status);
  refresh();
});
subscribe("nexus_mods", "./data/nexus_mods.json", d => ({ ...transformMod(d), source: "nexus", mod_page_url: d.mod_page_url || `https://www.nexusmods.com/icarus/mods/${d.nexus_id}` }), mods => {
  state.nexusMods = mods;
  refresh();
});

window.addEventListener("hashchange", () => { state.page = readPageFromHash(); refresh(); });

document.getElementById("search").addEventListener("input", debounce(() => { state.page = 1; refresh(); }, 400));
document.getElementById("author-filter").addEventListener("change", () => { state.page = 1; refresh(); });
document.getElementById("source-filter").addEventListener("change", () => { state.page = 1; refresh(); });
document.getElementById("week-filter")?.addEventListener("change", () => { state.page = 1; refresh(); });
document.getElementById("sort-order")?.addEventListener("change", () => { state.page = 1; refresh(); });
document.getElementById("reset").addEventListener("click", () => {
  document.getElementById("search").value = "";
  document.getElementById("author-filter").value = "";
  document.getElementById("source-filter").value = "";
  const wf = document.getElementById("week-filter"); if (wf) wf.value = "";
  const so = document.getElementById("sort-order"); if (so) so.value = "name-asc";
  state.page = 1;
  location.hash = "";
  refresh();
});
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
