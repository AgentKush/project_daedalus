// Anonymous mod ratings — localStorage now, aggregates across visitors when Firestore is wired.
//
// Storage shape (Firestore, when live):
//   ratings/{modId}/raters/{fingerprint} -> { rating: 1-5, timestamp: ms }
//
// Writes use a stable per-browser fingerprint UUID so a visitor can update their
// rating but not stuff the ballot. Same idea as the closed PR #99 design.

let firestoreApi = null;

async function loadFirestore() {
  if (firestoreApi !== null) return firestoreApi;
  if (!window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.projectId) return (firestoreApi = false);
  const { initializeApp, getApps } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js");
  const fs = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  const app = getApps().length ? getApps()[0] : initializeApp(window.FIREBASE_CONFIG);
  firestoreApi = { db: fs.getFirestore(app), ...fs };
  return firestoreApi;
}

function getFingerprint() {
  let fp = localStorage.getItem("daedalus.fingerprint");
  if (!fp) {
    fp = (crypto.randomUUID && crypto.randomUUID()) || (Date.now() + "-" + Math.random().toString(36).slice(2));
    localStorage.setItem("daedalus.fingerprint", fp);
  }
  return fp;
}

function getMyRating(modId) {
  try { return (JSON.parse(localStorage.getItem("daedalus.myRatings") || "{}"))[modId] || 0; } catch (e) { return 0; }
}

function setMyRating(modId, value) {
  let r = {};
  try { r = JSON.parse(localStorage.getItem("daedalus.myRatings") || "{}"); } catch (e) {}
  if (value === 0) delete r[modId];
  else r[modId] = value;
  localStorage.setItem("daedalus.myRatings", JSON.stringify(r));
}

function renderStars(container, current, onSelect) {
  container.innerHTML = "";
  for (let i = 1; i <= 5; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.style.cssText = "background:none;border:none;cursor:pointer;font-size:24px;line-height:1;padding:0 2px;transition:transform .1s ease, color .15s ease;";
    btn.style.color = i <= current ? "#f1ad1c" : "#64748b";
    btn.textContent = "★";
    btn.title = `${i} star${i !== 1 ? "s" : ""}` + (i === current ? " (click to clear)" : "");
    btn.addEventListener("mouseenter", () => { btn.style.transform = "scale(1.15)"; });
    btn.addEventListener("mouseleave", () => { btn.style.transform = ""; });
    btn.addEventListener("click", () => onSelect(i === current ? 0 : i));
    container.appendChild(btn);
  }
}

(async function init() {
  const widget = document.getElementById("rating-widget");
  if (!widget) return;
  const modId = widget.dataset.modId;
  const starsEl = document.getElementById("rating-stars");
  const summaryEl = document.getElementById("rating-summary");

  let myRating = getMyRating(modId);
  let agg = null;
  const fp = getFingerprint();

  function repaint() {
    renderStars(starsEl, myRating, async (newRating) => {
      myRating = newRating;
      setMyRating(modId, newRating);
      repaint();
      const fs = await loadFirestore();
      if (!fs) return;
      try {
        const ref = fs.doc(fs.db, `ratings/${modId}/raters/${fp}`);
        if (newRating === 0) await fs.deleteDoc(ref);
        else await fs.setDoc(ref, { rating: newRating, timestamp: Date.now() });
      } catch (err) {
        console.warn("[ratings] write failed:", err.message);
      }
    });
    if (agg && agg.count > 0) {
      const avg = (agg.sum / agg.count).toFixed(1);
      summaryEl.innerHTML = `<span style="color:#f1ad1c">★</span> ${avg} from ${agg.count} rating${agg.count !== 1 ? "s" : ""}` +
        (myRating ? ` <span class="text-slate-400">· your rating: ${myRating}</span>` : "");
    } else if (myRating > 0) {
      summaryEl.innerHTML = `Your rating: <span style="color:#f1ad1c">${"★".repeat(myRating)}</span> <span class="text-slate-400">— visible only to you until live Firestore is configured</span>`;
    } else {
      summaryEl.innerHTML = `<span class="text-slate-500">Be the first to rate this mod</span>`;
    }
  }

  repaint();

  // Subscribe to live aggregate when Firestore is configured
  const fs = await loadFirestore();
  if (!fs) return;
  try {
    fs.onSnapshot(fs.collection(fs.db, `ratings/${modId}/raters`), snap => {
      let sum = 0, count = 0;
      snap.forEach(d => { const r = d.data().rating; if (r) { sum += r; count += 1; } });
      agg = { sum, count };
      repaint();
    });
  } catch (err) {
    console.warn("[ratings] subscribe failed:", err.message);
  }
})();
