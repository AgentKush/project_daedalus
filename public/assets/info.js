import { subscribe, attachStatusBadge } from "./firebase-loader.js";

function escape(s) { return (s || "").toString().replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

function transform(d) {
  return {
    id: d.id,
    order: d.order ?? 999,
    icon: d.icon || "🔗",
    title: d.title || "Untitled",
    body: d.body || "",
    cta_label: d.cta_label || "Open",
    url: d.url || "#"
  };
}

function renderCard(c) {
  return `<a target="_blank" rel="noopener" class="info-card block rounded-xl p-6 text-center border-2 border-icarus-500 bg-slate-100 dark:bg-gradient-to-b dark:from-slate-800 dark:to-slate-900 no-underline" href="${escape(c.url)}">
    <div class="text-4xl mb-3">${c.icon}</div>
    <h3 class="text-xl font-bold mb-2 text-icarus-500">${escape(c.title)}</h3>
    <p class="text-sm text-slate-600 dark:text-slate-400 mb-4">${escape(c.body)}</p>
    <span class="inline-block px-5 py-2 rounded-md font-semibold text-sm text-white bg-icarus-500 hover:bg-icarus-600">${escape(c.cta_label)}</span>
  </a>`;
}

const setStatus = attachStatusBadge();
subscribe("info_content", "./data/info_content.json", transform, (cards, status) => {
  setStatus(status);
  cards.sort((a, b) => a.order - b.order);
  document.getElementById("info-grid").innerHTML = cards.map(renderCard).join("");
});
