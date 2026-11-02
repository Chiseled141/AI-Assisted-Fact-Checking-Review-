import { readFileSync, writeFileSync } from "node:fs";

const md = readFileSync(
  "/Users/chiseled/Documents/Github/AI-Assisted-Fact-Checking-Review-/TRUSTED_SOURCES.md",
  "utf8",
);

const lines = md.split("\n");
let section = null;
const rows = [];
for (const line of lines) {
  const h = line.match(/^##\s+(\d+)\./);
  if (h) section = Number(h[1]);
  if (section === null) continue;
  if (!line.trim().startsWith("|")) continue;
  const cells = line.split("|").slice(1, -1).map((c) => c.trim());
  if (cells.length < 2) continue;
  if (/^-+$/.test(cells[0].replace(/\s/g, ""))) continue;
  if (/^type$/i.test(cells[0])) continue;
  rows.push({ section, cells });
}

const tagOf = (text) => {
  if (text.includes("🟢")) return "green";
  if (text.includes("🟡")) return "yellow";
  if (text.includes("🔴")) return "red";
  return null;
};

const DOMAIN_RE =
  /^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}(\/[^\s,)]*)?/;

const out = [];
for (const { section, cells } of rows) {
  // find tag: either an explicit tag cell, or inferred from section 8/9
  let tag = null;
  let sourcesCell = null;
  const tagIdx = cells.findIndex((c) => tagOf(c) !== null);
  if (tagIdx !== -1) {
    tag = tagOf(cells[tagIdx]);
    sourcesCell = cells.filter((_, i) => i !== tagIdx && i !== 0).join(", ");
    if (cells.length === 2) sourcesCell = cells[1];
  } else {
    sourcesCell = cells[cells.length - 1];
  }
  if (!sourcesCell) continue;
  // split on commas that are not inside parentheses
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of sourcesCell) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  for (let p of parts) {
    p = p.replace(/\*\*/g, "").trim();
    if (!p) continue;
    const m = p.match(DOMAIN_RE);
    let domain = null;
    let rest = p;
    if (m) {
      domain = m[0].replace(/[.,;]$/, "").replace(/\(.*/, "");
      rest = p.slice(m[0].length).trim();
    }
    out.push({
      section,
      tag,
      raw: p,
      domain,
      rest,
    });
  }
}

const counts = { total: out.length, withDomain: 0, red: 0, bySection: {} };
for (const o of out) {
  if (o.domain) counts.withDomain++;
  if (o.tag === "red") counts.red++;
  counts.bySection[o.section] = (counts.bySection[o.section] || 0) + 1;
}
console.log(JSON.stringify(counts, null, 2));
writeFileSync(
  new URL("./work/raw.json", import.meta.url).pathname,
  JSON.stringify(out, null, 2),
);
console.log("--- name-only entries ---");
for (const o of out) if (!o.domain) console.log(o.section, "|", o.tag, "|", o.raw);
