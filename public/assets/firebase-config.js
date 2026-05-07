// Live data sources for ProjectDaedalus.
//
// ----- Live REST mode (currently active) -----
// Donovan's Firestore mods/tools collections are publicly readable, so we can
// hit the REST API directly from the browser — no Firebase SDK, no apiKey, no
// secrets. Set FIRESTORE_PROJECT_ID and the loader will use it as the live data
// source. Falls back to bundled JSON if the REST call fails.
window.FIRESTORE_PROJECT_ID = "projectdaedalus-fb09f";

// ----- Optional: full Firebase Web SDK config (real-time onSnapshot) -----
// Only needed if you want sub-second pushed updates. With REST you get the
// same data on each fetch (browser polls on revisit). Leave null to use REST.
window.FIREBASE_CONFIG = null;
