// Data loader for the static POC. Three modes, in priority order:
//   1. Firebase Web SDK with onSnapshot — sub-second push updates (when FIREBASE_CONFIG is set)
//   2. Firestore REST API — public-read collections, no auth required (when FIRESTORE_PROJECT_ID is set)
//   3. Bundled JSON in /data/ — offline / fallback / empty-collection fallback
//
// Empty-collection fallback: if a REST collection returns 0 documents AND a
// bundled fallback URL is provided, we use the bundled JSON. This handles the
// case where production hasn't populated a collection yet (e.g. nexus_mods
// before PR #119 merges) — we still show data instead of an empty list, and
// the next poll will pick up the live collection once it's populated.

const REST_POLL_MS = 60_000;          // re-fetch live data every 60s
const subscriptions = new Map();

export function isLive() {
  return Boolean(
    (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.projectId) ||
    window.FIRESTORE_PROJECT_ID
  );
}

// ---- REST: flatten Firestore's typed-value format into a plain JS object ----
function flattenValue(v) {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return parseInt(v.integerValue, 10);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) return flattenFields(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(flattenValue);
  return null;
}
function flattenFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = flattenValue(v);
  return out;
}
function flattenDocument(doc) {
  const id = (doc.name || "").split("/").pop();
  return {
    id,
    _createTime: doc.createTime || null,
    _updateTime: doc.updateTime || null,
    ...flattenFields(doc.fields || {})
  };
}

async function fetchRestCollection(projectId, collection) {
  const items = [];
  let pageToken = null;
  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}`);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Firestore REST ${collection}: HTTP ${r.status}`);
    const j = await r.json();
    for (const d of j.documents || []) items.push(flattenDocument(d));
    pageToken = j.nextPageToken || null;
  } while (pageToken);
  return items;
}

async function fetchBundled(fallbackUrl) {
  const r = await fetch(fallbackUrl);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const raw = await r.json();
  return Array.isArray(raw) ? raw : Object.entries(raw).map(([id, v]) => ({ id, ...v }));
}


// ---- Backfill helper: merge derived fields from bundled JSON onto live data ----
// Firestore is authoritative when populated; bundled JSON fills gaps for fields
// the modder didn't author (e.g. compatibility derived from git commit history).
function _mergeKey(item) {
  const slug = (s) => (s || "").toString().toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug(item.author)}::${(item.name || "").toLowerCase()}`;
}
function backfillFromBundled(liveItems, bundledItems) {
  if (!bundledItems || !bundledItems.length) return liveItems;
  const idx = new Map();
  for (const b of bundledItems) idx.set(_mergeKey(b), b);
  for (const live of liveItems) {
    const b = idx.get(_mergeKey(live));
    if (!b) continue;
    for (const [k, v] of Object.entries(b)) {
      const cur = live[k];
      if (cur === undefined || cur === null || cur === "") live[k] = v;
    }
  }
  return liveItems;
}

// ---- Web SDK init (only when explicitly configured) ----
let webSdk = null;
async function getWebSdk() {
  if (webSdk !== null) return webSdk;
  if (!window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.projectId) return (webSdk = false);
  const app = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js");
  const fs = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  const a = app.getApps().length ? app.getApps()[0] : app.initializeApp(window.FIREBASE_CONFIG);
  webSdk = { db: fs.getFirestore(a), ...fs };
  return webSdk;
}

// ---- Public API: same shape as before ----
//
//   subscribe(collection, fallbackUrl, transform, callback)
//
// callback(items, status) — status = { live: true|false, source: "websdk"|"rest"|"rest+bundled"|"bundled" }
export function subscribe(collection, fallbackUrl, transform, callback) {
  // Mode 1: Web SDK with onSnapshot
  (async () => {
    const sdk = await getWebSdk();
    if (sdk) {
      if (subscriptions.has(collection)) subscriptions.get(collection)();
      const unsub = sdk.onSnapshot(sdk.collection(sdk.db, collection),
        async snap => {
          const rawItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          if (rawItems.length === 0 && fallbackUrl) {
            // collection exists but is empty — supplement with bundled
            try {
              const bundled = await fetchBundled(fallbackUrl);
              callback(bundled.map(transform), { live: false, source: "websdk+bundled" });
              return;
            } catch (e) { /* fall through to empty live */ }
          }
          // Live data present — backfill missing fields from bundled JSON
          let bundled = null;
          if (fallbackUrl) {
            try { bundled = await fetchBundled(fallbackUrl); } catch (e) { /* live only */ }
          }
          const merged = bundled ? backfillFromBundled(rawItems, bundled) : rawItems;
          callback(merged.map(transform), { live: true, source: bundled ? "websdk+backfill" : "websdk" });
        },
        err => { console.warn(`[firestore-websdk] ${collection}: ${err.message}; falling through`); restMode(); }
      );
      subscriptions.set(collection, unsub);
      return;
    }
    restMode();
  })();

  function restMode() {
    if (window.FIRESTORE_PROJECT_ID) {
      const projectId = window.FIRESTORE_PROJECT_ID;
      let timer = null;
      const tick = async () => {
        try {
          const items = await fetchRestCollection(projectId, collection);
          if (items.length === 0 && fallbackUrl) {
            // collection doesn't exist yet on prod — fall back to bundled JSON
            // but keep polling so we pick up the live collection once it populates
            try {
              const bundled = await fetchBundled(fallbackUrl);
              callback(bundled.map(transform), { live: false, source: "rest+bundled" });
            } catch (e) {
              console.warn(`[firestore-rest] ${collection}: empty + bundled fetch failed: ${e.message}`);
              callback([], { live: true, source: "rest", empty: true });
            }
          } else {
            // Live data present — backfill missing fields from bundled JSON if available
            // (e.g. compatibility derived from git history, image_url, readme_url).
            let bundled = null;
            if (fallbackUrl) {
              try { bundled = await fetchBundled(fallbackUrl); } catch (e) { /* keep going with live only */ }
            }
            const merged = bundled ? backfillFromBundled(items, bundled) : items;
            callback(merged.map(transform), { live: true, source: bundled ? "rest+backfill" : "rest" });
          }
        } catch (err) {
          console.warn(`[firestore-rest] ${collection}: ${err.message}; falling back to bundled JSON`);
          loadBundled();
          return;
        }
        timer = setTimeout(tick, REST_POLL_MS);
      };
      tick();
      subscriptions.set(collection, () => { if (timer) clearTimeout(timer); });
    } else {
      loadBundled();
    }
  }

  async function loadBundled() {
    try {
      const items = await fetchBundled(fallbackUrl);
      callback(items.map(transform), { live: false, source: "bundled" });
    } catch (err) {
      console.error(`[bundled] ${collection}: ${err.message}`);
      callback([], { live: false, source: "error", error: err.message });
    }
  }
}

// ---- Status badge in the bottom-right ----
export function attachStatusBadge() {
  if (document.getElementById("data-status")) return () => {};
  const badge = document.createElement("div");
  badge.id = "data-status";
  badge.style.cssText = "position:fixed;bottom:12px;right:12px;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;color:#fff;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,.3);";
  badge.textContent = "…";
  document.body.appendChild(badge);
  return (status) => {
    if (status.source === "websdk")  { badge.style.background = "#16a34a"; badge.textContent = "● LIVE Firestore (WebSDK)"; }
    else if (status.source === "rest") { badge.style.background = "#16a34a"; badge.textContent = "● LIVE Firestore (REST)"; }
    else if (status.source === "rest+bundled" || status.source === "websdk+bundled") { badge.style.background = "#f59e0b"; badge.textContent = "◐ LIVE + bundled (empty collection)"; }
    else if (status.source === "rest+backfill" || status.source === "websdk+backfill") { badge.style.background = "#16a34a"; badge.textContent = "● LIVE + backfilled"; }
    else if (status.source === "bundled") { badge.style.background = "#64748b"; badge.textContent = "○ Bundled snapshot"; }
    else                             { badge.style.background = "#dc2626"; badge.textContent = "✕ Data error"; }
  };
}
