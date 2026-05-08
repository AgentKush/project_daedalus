// Builds the per-author dataset for /authors/<slug>/ pages.
const mods = require("../../public/data/mods.json");

function slug(s) {
  return (s || "unknown").toString().toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Group mods by author (case-insensitive)
const byAuthor = new Map();
for (const m of mods) {
  if (!m.author) continue;
  const key = m.author.trim();
  const arr = byAuthor.get(key) || [];
  arr.push(m);
  byAuthor.set(key, arr);
}

// Sort authors alphabetically (case-insensitive)
const sorted = [...byAuthor.entries()].sort((a, b) =>
  a[0].localeCompare(b[0], undefined, { sensitivity: "base" })
);

module.exports = sorted.map(([author, list]) => {
  const fileTypeCounts = {};
  for (const m of list) {
    for (const t of Object.keys(m.files || {})) {
      if (m.files[t]) fileTypeCounts[t] = (fileTypeCounts[t] || 0) + 1;
    }
  }
  // Newest mod (by latest derived game-week, fallback to mod name)
  const weekNum = m => {
    const x = (m.compatibility || "").match(/^w(\d+)$/i);
    return x ? parseInt(x[1], 10) : -1;
  };
  const sortedMods = [...list].sort((a, b) => weekNum(b) - weekNum(a) || (a.name || "").localeCompare(b.name || ""));
  const newest = sortedMods[0];
  return {
    author,
    slug: slug(author),
    mods: sortedMods.map(m => ({
      name: m.name,
      description: m.description,
      version: m.version,
      compatibility: m.compatibility,
      author_slug: slug(m.author),
      slug: m.id?.split("--")[1] || slug(m.name),
      file_types: Object.keys(m.files || {}).filter(k => m.files[k]),
      image_url: m.image_url || m.imageURL || null,
    })),
    mod_count: list.length,
    file_type_counts: fileTypeCounts,
    newest_mod: newest ? {
      name: newest.name,
      author_slug: slug(newest.author),
      slug: newest.id?.split("--")[1] || slug(newest.name),
      compatibility: newest.compatibility
    } : null
  };
});
