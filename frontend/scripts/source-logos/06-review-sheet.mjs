// Build a contact sheet of every collected logo for visual review.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../../public/source-logos");
const manifestPath = path.join(OUT, "manifest.json");
if (!existsSync(manifestPath)) throw new Error("manifest.json missing; run 04-manifest.mjs");
const entries = JSON.parse(readFileSync(manifestPath, "utf8"));

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const order = { "not-found": 0, "domain-unreachable": 1, "needs-review": 2, "low-resolution": 3, ok: 4 };
const counts = {};
for (const e of entries) counts[e.status] = (counts[e.status] || 0) + 1;
const sorted = entries
  .slice()
  .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.domain.localeCompare(b.domain));

const cards = sorted
  .map((e) => {
    const img = e.file
      ? `<img src="./${e.file}" alt="${esc(e.name)}" loading="lazy">`
      : `<span class="none">no file</span>`;
    const dims = e.file ? `${e.format} ${e.width}×${e.height}${e.width && e.height ? "" : " (no intrinsic size)"}` : "";
    return `<figure data-status="${e.status}" data-tag="${e.tag}" title="${esc(e.notes)}">
      <div class="box">${img}</div>
      <figcaption>
        <b>${esc(e.name)}</b>
        <code>${esc(e.domain)}</code>
        <span class="row"><span class="tag ${e.tag}">${e.tag}</span><span class="st s-${e.status}">${e.status}</span></span>
        <span class="meta">${esc(dims)}${dims && e.method ? " · " : ""}${esc(e.method || "")}</span>
      </figcaption>
    </figure>`;
  })
  .join("\n");

const summary = Object.entries(counts)
  .map(([s, n]) => `<button data-f="${s}">${s} <b>${n}</b></button>`)
  .join("");

writeFileSync(
  path.join(OUT, "_review-sheet.html"),
  `<!doctype html><meta charset="utf-8"><title>Source logos review</title>
<style>
  body{font:13px/1.35 -apple-system,Segoe UI,Roboto,sans-serif;margin:24px;background:#fafaf9;color:#1c1917}
  h1{font-size:18px;margin:0 0 4px}
  p.sub{color:#78716c;margin:0 0 12px}
  .filters{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}
  .filters button{font:inherit;font-size:11px;padding:3px 8px;border:1px solid #d6d3d1;background:#fff;border-radius:999px;cursor:pointer}
  .filters button.on{background:#1c1917;color:#fff;border-color:#1c1917}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:12px}
  figure{margin:0;background:#fff;border:1px solid #e7e5e4;border-radius:10px;padding:8px}
  .box{height:76px;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:6px;
       background-color:#fff;background-image:linear-gradient(45deg,#f5f5f4 25%,transparent 25%,transparent 75%,#f5f5f4 75%),linear-gradient(45deg,#f5f5f4 25%,transparent 25%,transparent 75%,#f5f5f4 75%);
       background-size:14px 14px;background-position:0 0,7px 7px}
  .box img{max-width:100%;max-height:68px;object-fit:contain}
  .none{color:#b91c1c;font-size:11px}
  figcaption{display:flex;flex-direction:column;gap:1px;margin-top:6px}
  b{font-size:12px;font-weight:600;line-height:1.2;max-height:2.4em;overflow:hidden}
  code{font-size:10px;color:#57534e;word-break:break-all}
  .meta{font-size:10px;color:#a8a29e}
  .row{display:flex;gap:4px;align-items:center}
  .tag{font-size:9px;text-transform:uppercase;letter-spacing:.04em;padding:1px 5px;border-radius:999px;color:#fff}
  .tag.green{background:#0a7d43}.tag.yellow{background:#a16207}
  .st{font-size:9px;padding:1px 5px;border-radius:999px;background:#f5f5f4;color:#57534e}
  .st.s-not-found,.st.s-domain-unreachable{background:#fee2e2;color:#991b1b}
  .st.s-needs-review{background:#fef3c7;color:#92400e}
  .st.s-low-resolution{background:#e0f2fe;color:#075985}
  .st.s-ok{background:#dcfce7;color:#166534}
</style>
<h1>Source logos — visual review</h1>
<p class="sub">${entries.length} entries. Click a status to filter. Check identity, legibility at badge size, and backgrounds.</p>
<div class="filters"><button data-f="all" class="on">all <b>${entries.length}</b></button>${summary}</div>
<div class="grid">
${cards}
</div>
<script>
  const btns = [...document.querySelectorAll('.filters button')];
  btns.forEach((b) => b.addEventListener('click', () => {
    btns.forEach((x) => x.classList.toggle('on', x === b));
    const f = b.dataset.f;
    document.querySelectorAll('figure').forEach((el) => {
      el.style.display = f === 'all' || el.dataset.status === f ? '' : 'none';
    });
  }));
</script>`,
);
console.log("wrote", path.join(OUT, "_review-sheet.html"), "entries", entries.length, counts);
