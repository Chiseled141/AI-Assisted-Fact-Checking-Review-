// Validate manifest.json against the files on disk (and the schema the app expects).
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../../public/source-logos");
const entries = JSON.parse(readFileSync(path.join(OUT, "manifest.json"), "utf8"));

const TAGS = new Set(["green", "yellow"]);
const FORMATS = new Set(["svg", "png"]);
const METHODS = new Set([
  "press-kit",
  "site-header",
  "apple-touch-icon",
  "favicon",
  "wikimedia-commons",
  "google-favicon-fallback",
]);
const STATUSES = new Set([
  "ok",
  "low-resolution",
  "not-found",
  "domain-unreachable",
  "needs-review",
]);
const REQUIRED = [
  "domain",
  "name",
  "tag",
  "file",
  "format",
  "width",
  "height",
  "origin_url",
  "method",
  "status",
  "notes",
];

const errors = [];
const seenKeys = new Set();
const usedFiles = new Set();

function pngSize(buf) {
  if (buf.length < 24 || buf.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
function svgSize(svg) {
  // mirror 03-fetch: only plain numbers / px are intrinsic sizes; "100%",
  // "5in" etc. fall back to the viewBox
  const tag = (svg.match(/<svg[^>]*>/i) || [""])[0];
  let w = tag.match(/\swidth\s*=\s*"([\d.]+)(px)?"/i)?.[1];
  let h = tag.match(/\sheight\s*=\s*"([\d.]+)(px)?"/i)?.[1];
  const vb = tag.match(/\sviewBox\s*=\s*"[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)"/i);
  if (!w && vb) w = vb[1];
  if (!h && vb) h = vb[2];
  return { width: w ? Number(w) : 0, height: h ? Number(h) : 0 };
}

entries.forEach((e, i) => {
  const where = `#${i} ${e.domain}`;
  for (const k of REQUIRED) if (!(k in e)) errors.push(`${where}: missing field ${k}`);
  if (!TAGS.has(e.tag)) errors.push(`${where}: bad tag ${e.tag}`);
  if (!STATUSES.has(e.status)) errors.push(`${where}: bad status ${e.status}`);
  if (e.file) {
    if (!FORMATS.has(e.format)) errors.push(`${where}: bad format ${e.format}`);
    if (!METHODS.has(e.method)) errors.push(`${where}: bad method ${e.method}`);
    if (!e.origin_url) errors.push(`${where}: file without origin_url`);
    if (!Number.isFinite(e.width) || e.width < 0) errors.push(`${where}: bad width`);
    if (!Number.isFinite(e.height) || e.height < 0) errors.push(`${where}: bad height`);
  } else {
    if (e.format !== null || e.method !== null || e.origin_url !== null)
      errors.push(`${where}: no file but format/method/origin_url not null`);
    if (e.status === "ok" || e.status === "low-resolution")
      errors.push(`${where}: no file but status ${e.status}`);
  }
  const key = `${e.domain}::${e.name}`;
  if (seenKeys.has(key)) errors.push(`${where}: duplicate entry`);
  seenKeys.add(key);

  if (e.file) {
    const p = path.join(OUT, e.file);
    usedFiles.add(e.file);
    if (!existsSync(p)) {
      errors.push(`${where}: file ${e.file} missing on disk`);
      return;
    }
    const buf = readFileSync(p);
    if (buf.length === 0) errors.push(`${where}: ${e.file} is empty`);
    if (e.format === "png") {
      const d = pngSize(buf);
      if (!d) errors.push(`${where}: ${e.file} is not a valid PNG`);
      else if (d.width !== e.width || d.height !== e.height)
        errors.push(`${where}: PNG is ${d.width}x${d.height}, manifest says ${e.width}x${e.height}`);
    } else {
      const s = buf.toString("utf8");
      if (!/<svg\b/i.test(s)) errors.push(`${where}: ${e.file} is not an SVG`);
      if (/<script\b|\son[a-z]+\s*=|foreignObject|xlink:href\s*=\s*["']https?:|href\s*=\s*["']https?:/i.test(s))
        errors.push(`${where}: ${e.file} contains unsanitised active content`);
      const d = svgSize(s);
      const declared = e.width && e.height;
      if (
        declared &&
        d.width &&
        d.height &&
        (Math.abs(d.width - e.width) > 1 || Math.abs(d.height - e.height) > 1)
      )
        errors.push(`${where}: SVG is ${d.width}x${d.height}, manifest says ${e.width}x${e.height}`);
    }
  }
});

for (const f of readdirSync(OUT)) {
  if (f === "manifest.json" || f.startsWith("_")) continue;
  if (!usedFiles.has(f) && /\.(svg|png)$/i.test(f)) errors.push(`unreferenced file on disk: ${f}`);
}

const counts = entries.reduce((a, e) => ((a[e.status] = (a[e.status] || 0) + 1), a), {});
console.log("entries:", entries.length);
console.log("status:", counts);
console.log("files:", usedFiles.size);
console.log("errors:", errors.length);
for (const e of errors.slice(0, 80)) console.log(" -", e);
if (errors.length > 80) console.log(` ... ${errors.length - 80} more`);
process.exitCode = errors.length ? 1 : 0;
