// Fetch one logo per source host, following the ladder:
// brand/press page -> site header/footer logo -> apple-touch-icon/manifest icon
// -> Wikimedia Commons -> Google favicon fallback.
// Writes images to frontend/public/source-logos/ and details to work/results.json.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(here, "../../public/source-logos");
const WORK = path.join(here, "work");
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const args = process.argv.slice(2);
const only = args.includes("--only")
  ? new Set(args[args.indexOf("--only") + 1].split(","))
  : null;
const limit = args.includes("--limit")
  ? Number(args[args.indexOf("--limit") + 1])
  : Infinity;
const CONCURRENCY = args.includes("--concurrency")
  ? Number(args[args.indexOf("--concurrency") + 1])
  : 6;

const UA_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const UA_BOT =
  "ClaimTraceSourceBadges/1.0 (+logo collection for source attribution; contact: project maintainer)";

const MIN_PX = 128;
const MAX_BYTES = 4 * 1024 * 1024;
const REQ_TIMEOUT = 15000;
const HOST_GAP = 1100; // >= 1s between requests to the same host
const GLOBAL_GAP = 120; // gentle global pacing

if (!existsSync(path.join(WORK, "plan.json")))
  throw new Error("run 02-build-plan.mjs first");
const plan = JSON.parse(readFileSync(path.join(WORK, "plan.json"), "utf8"));
const results = existsSync(path.join(WORK, "results.json"))
  ? JSON.parse(readFileSync(path.join(WORK, "results.json"), "utf8"))
  : {};

// ---------------- politeness: per-host queue ----------------
const lastHit = new Map();
const chains = new Map();
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
let globalSlot = 0;
async function polite(host, fn) {
  const prev = chains.get(host) || Promise.resolve();
  // Wikimedia treats non-browser clients as 10 requests/minute; stay well under
  const gap = /(^|\.)(wikimedia|wikipedia)\.org$/.test(host) ? 6500 : HOST_GAP;
  const next = prev.then(async () => {
    const wait = gap - (Date.now() - (lastHit.get(host) || 0));
    if (wait > 0) await sleep(wait);
    const gwait = globalSlot - Date.now();
    if (gwait > 0) await sleep(gwait);
    globalSlot = Date.now() + GLOBAL_GAP;
    lastHit.set(host, Date.now());
    return fn();
  });
  chains.set(host, next.catch(() => {}));
  return next;
}

const TMP = path.join(WORK, "tmp");
if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });

// curl, not Node fetch: Vietnamese ministry sites often use legacy DH TLS that
// Node's OpenSSL rejects, and curl reports the effective URL after redirects.
async function curl(url, { binary = false, ua = UA_DESKTOP, accept, referer } = {}) {
  const id = createHash("sha1").update(url + Date.now() + Math.random()).digest("hex").slice(0, 16);
  const bodyFile = path.join(TMP, id);
  try {
    const { stdout } = await exec(
      "curl",
      [
        "-sS",
        "-L",
        "--compressed",
        "--max-redirs",
        "6",
        "--max-time",
        "25",
        "--connect-timeout",
        "12",
        "-A",
        ua,
        "-H",
        accept || (binary
          ? "Accept: image/svg+xml,image/png,image/*;q=0.8,*/*;q=0.5"
          : "Accept: text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"),
        "-H",
        "Accept-Language: vi,en;q=0.8",
        ...(referer ? ["-e", referer] : []),
        "-o",
        bodyFile,
        "-w",
        "%{http_code}\t%{url_effective}\t%{content_type}\t%{num_redirects}\t%{remote_ip}",
        url,
      ].filter(Boolean),
      { maxBuffer: 1 << 24 },
    );
    const [code, finalUrl, contentType, numRedirects, remoteIp] = stdout.split("\t");
    const status = Number(code);
    const loopback = /^(127\.|::1$|0\.0\.0\.0$)/.test(remoteIp || "");
    if (!existsSync(bodyFile))
      return { ok: false, status, finalUrl, contentType, remoteIp, loopback, error: "empty-body" };
    if (binary) {
      const buf = readFileSync(bodyFile);
      rmSync(bodyFile, { force: true });
      return {
        ok: status >= 200 && status < 300,
        status,
        finalUrl,
        contentType,
        buf,
        remoteIp,
        loopback,
        numRedirects: Number(numRedirects),
      };
    }
    const text = readFileSync(bodyFile, "utf8");
    rmSync(bodyFile, { force: true });
    return {
      ok: status >= 200 && status < 300,
      status,
      finalUrl,
      contentType,
      text,
      remoteIp,
      loopback,
      numRedirects: Number(numRedirects),
    };
  } catch (e) {
    rmSync(bodyFile, { force: true });
    const msg = `${e?.code || ""} ${e?.message || ""} ${(e?.stderr || "").slice(0, 120)}`;
    throw new Error(`CURL_FAIL ${msg.slice(0, 200)}`);
  }
}
// curl exit codes that mean the host itself is not answering
function classifyCurlError(err, url) {
  const m = String(err?.message || err);
  if (/CURL_FAIL.*(Could not resolve host)/i.test(m)) return "dns-nxdomain";
  if (/CURL_FAIL.*(Connection refused)/i.test(m)) return "conn-refused";
  if (/CURL_FAIL.*(Connection timed out|Operation timed out)/i.test(m)) return "conn-timeout";
  if (/CURL_FAIL.*(SSL|TLS|certificate|handshake)/i.test(m)) return "tls";
  if (/CURL_FAIL.*(Network is unreachable)/i.test(m)) return "net-unreachable";
  return "error";
}

async function req(url, opts = {}) {
  return curl(url, opts);
}
async function reqBot(url) {
  return curl(url, { ua: UA_BOT, accept: "text/html,application/xhtml+xml,*/*;q=0.8" });
}

// ---------------- robots.txt ----------------
const robotsCache = new Map();
async function robotsAllowed(host, pathname) {
  if (!robotsCache.has(host)) {
    robotsCache.set(
      host,
      polite(host, async () => {
        try {
          const r = await reqBot(`https://${host}/robots.txt`);
          if (!r.ok) return null;
          return parseRobots(r.text);
        } catch {
          return null;
        }
      }),
    );
  }
  const parsed = await robotsCache.get(host);
  if (!parsed) return { allowed: true, checked: false };
  return { allowed: allows(parsed, pathname), checked: true };
}
function parseRobots(text) {
  const groups = [];
  let cur = null;
  for (const line of text.split("\n")) {
    const l = line.trim();
    if (!l || l.startsWith("#")) continue;
    const [k, ...rest] = l.split(":");
    const key = k.trim().toLowerCase();
    const val = rest.join(":").trim();
    if (key === "user-agent") {
      if (cur && cur.rules.length) groups.push(cur);
      if (!cur || cur.rules.length) cur = { agents: [val.toLowerCase()], rules: [] };
      else cur.agents.push(val.toLowerCase());
    } else if (cur && (key === "disallow" || key === "allow")) {
      cur.rules.push({ type: key, path: val });
    }
  }
  if (cur && cur.rules.length) groups.push(cur);
  return groups;
}
function allows(groups, pathname) {
  const mine = groups.filter(
    (g) => g.agents.includes("*") || g.agents.some((a) => a.includes("claimtrace")),
  );
  if (!mine.length) return true;
  let best = null;
  for (const g of mine)
    for (const rule of g.rules) {
      if (!rule.path) continue; // "Disallow: " means allow everything
      if (!ruleMatches(rule.path, pathname)) continue;
      const len = rule.path.split("*")[0].length || 1;
      if (!best || len > best.len) best = { len, type: rule.type };
    }
  if (!best) return true;
  return best.type === "allow";
}
// robots.txt path patterns: prefix, "*" wildcards, optional "$" = exact
function ruleMatches(pattern, pathname) {
  const exact = pattern.endsWith("$");
  const p = exact ? pattern.slice(0, -1) : pattern;
  const parts = p.split("*");
  const prefix = parts[0];
  if (!pathname.startsWith(prefix)) return false;
  let rest = pathname.slice(prefix.length);
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    if (!seg) continue;
    const idx = rest.indexOf(seg);
    if (idx === -1) return false;
    rest = rest.slice(idx + seg.length);
  }
  return exact ? rest === "" : true;
}

// ---------------- image typing ----------------
function sniff(buf, contentType = "") {
  if (!buf || buf.length < 8) return null;
  const head = buf.subarray(0, 512).toString("utf8").replace(/^\uFEFF/, "").trimStart();
  if (head.startsWith("<") && /<svg[\s>]/i.test(head)) return "svg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  if (
    buf.length > 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "webp";
  if (buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return "ico";
  if (contentType.includes("svg")) return "svg";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("jpeg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return null;
}
function pngSize(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}
function webpSize(buf) {
  const fourcc = buf.subarray(12, 16).toString("ascii");
  if (fourcc === "VP8X")
    return {
      width: 1 + buf.readUIntLE(24, 3),
      height: 1 + buf.readUIntLE(27, 3),
    };
  if (fourcc === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (fourcc === "VP8 ")
    return {
      width: buf.readUInt16LE(26) & 0x3fff,
      height: buf.readUInt16LE(28) & 0x3fff,
    };
  return null;
}
function icoBest(buf) {
  const count = buf.readUInt16LE(4);
  let best = null;
  for (let i = 0; i < count; i++) {
    const off = 6 + i * 16;
    const w = buf[off] || 256;
    const h = buf[off + 1] || 256;
    const size = buf.readUInt32LE(off + 8);
    const offset = buf.readUInt32LE(off + 12);
    const isPng = buf.subarray(offset, offset + 4).toString("hex") === "89504e47";
    if (!best || w * h > best.w * best.h)
      best = { w, h, size, offset, isPng };
  }
  return best;
}
function svgSize(text) {
  const tag = (text.match(/<svg[^>]*>/i) || [""])[0];
  let w = tag.match(/\swidth\s*=\s*"([\d.]+)(px)?"/i)?.[1];
  let h = tag.match(/\sheight\s*=\s*"([\d.]+)(px)?"/i)?.[1];
  const vb = tag.match(/\sviewBox\s*=\s*"[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)"/i);
  if (!w && vb) w = vb[1];
  if (!h && vb) h = vb[2];
  return { width: w ? Number(w) : 0, height: h ? Number(h) : 0 };
}
function sipsInfo(file) {
  try {
    const out = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file], {
      encoding: "utf8",
    });
    return {
      width: Number(out.match(/pixelWidth:\s*(\d+)/)?.[1] || 0),
      height: Number(out.match(/pixelHeight:\s*(\d+)/)?.[1] || 0),
    };
  } catch {
    return { width: 0, height: 0 };
  }
}

// ---------------- SVG sanitising ----------------
function sanitizeSvg(text) {
  let out = text;
  const removed = [];
  // scripts
  out = out.replace(/<script\b[\s\S]*?<\/script>/gi, () => (removed.push("script"), ""));
  out = out.replace(/<script\b[^>]*\/?>/gi, () => (removed.push("script"), ""));
  // dangerous containers (keep <use>: internal symbol references are normal in logos)
  for (const tag of ["foreignObject", "iframe", "animate", "set"]) {
    out = out.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, "gi"), () =>
      removed.push(tag),
    );
  }
  // event handler attributes
  out = out.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, () => (removed.push("on*"), ""));
  // <use> may only point at a symbol inside this file; a relative sprite path
  // or an absolute URL makes the saved logo render nothing
  out = out.replace(
    /<use\b[^>]*(?:xlink:)?href\s*=\s*["'](?!\s*#)[^"']*["'][^>]*\/?>/gi,
    () => (removed.push("external-use"), ""),
  );
  // external references in href/xlink:href attributes
  out = out.replace(
    /\s+(?:xlink:)?href\s*=\s*"(?:https?:|javascript:|data:(?!image\/)[^"]*)"/gi,
    () => (removed.push("external-href"), ""),
  );
  out = out.replace(
    /\s+(?:xlink:)?href\s*=\s*'(?:https?:|javascript:|data:(?!image\/)[^']*)'/gi,
    () => (removed.push("external-href"), ""),
  );
  // external references inside CSS
  out = out.replace(/@import\s+url\((['"]?)https?:[^)]*\)?;?/gi, () => (removed.push("css-import"), ""));
  out = out.replace(/url\((['"]?)https?:\/\/[^)]*\)/gi, () => (removed.push("css-url"), ""));
  return { svg: out.trim() + "\n", removed: [...new Set(removed)] };
}

// ---------------- candidate extraction from HTML ----------------
// The site's own logo may be served from its CDN, so a different asset host is
// allowed unless it looks like an ad/analytics tracker.
const ASSET_BLOCKLIST =
  /(doubleclick|googlesyndication|adsystem|adnxs|casalemedia|criteo|taboola|outbrain|scorecardresearch|google-analytics|hotjar|cloudflareinsights|quantserve|amazon-adsystem|moatads|permutive|safeframe|facebook\.tr|twitter\.com\/i\/)/i;
function assetHostOk(candUrl, host) {
  let u;
  try {
    u = new URL(candUrl);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(u.protocol)) return false;
  if (ASSET_BLOCKLIST.test(`${u.host}${u.pathname}`)) return false;
  if (u.host === host || u.host.endsWith(`.${host}`)) return true;
  // a CDN whose name/path carries the brand is fine, and so is a file that
  // literally calls itself a logo (hnm.1cdn.vn/assets/images/logo.png)
  const path = decodeURIComponent(u.pathname).toLowerCase();
  if (/logo|wordmark|brand|identity/.test(path)) return true;
  const brand = host.split(".").slice(0, -2).join("") || host.split(".")[0];
  const token = brand.replace(/[^a-z0-9]/g, "").slice(0, 6);
  if (token.length < 3) return false;
  return (u.host + path).toLowerCase().includes(token);
}
function sameHost(candUrl, host) {
  try {
    const u = new URL(candUrl);
    return u.host === host || u.host.endsWith(`.${host}`);
  } catch {
    return false;
  }
}
function absUrl(ref, baseUrl) {
  if (!ref) return null;
  try {
    return new URL(ref.replace(/&amp;/g, "&"), baseUrl).href;
  } catch {
    return null;
  }
}
function parseSizes(s) {
  // "180x180" -> 180; returns 0 when unknown
  const m = (s || "").match(/(\d+)\s*x\s*(\d+)/);
  return m ? Math.min(Number(m[1]), Number(m[2])) : 0;
}
function extractCandidates(html, baseUrl) {
  const out = [];
  const push = (url, kind, score, meta = {}) => {
    if (!url) return;
    out.push({ url, kind, score, ...meta });
  };

  // inline SVG in the header / logo anchor
  const svgTags = [...html.matchAll(/<svg\b[\s\S]{0,20000}?<\/svg>/gi)];
  for (const m of svgTags) {
    const before = html.slice(Math.max(0, m.index - 600), m.index);
    const nearBefore = before.slice(-220);
    const tag = m[0].match(/<svg[^>]*>/i)?.[0] || "";
    // UI icons (search, menu, phone, social) often sit in the same header as
    // the logo: never let their surrounding labels qualify them
    if (
      /aria-label\s*=\s*["'][^"']*(search|menu|close|phone|call|email|hotline|share|facebook|youtube|zalo|tiktok|instagram|twitter|linkedin)/i.test(
        nearBefore,
      )
    )
      continue;
    const looksLogo =
      /logo/i.test(tag) ||
      /(?:class|id|alt)\s*=\s*["'][^"']*logo[^"']*["']/i.test(nearBefore) ||
      /<a\b[^>]*href\s*=\s*["'](?:\.?\/)["'][^>]*>/i.test(nearBefore);
    if (!looksLogo) continue;
    // Tailwind utility sizes such as w-4/w-5 mean a 16-24px icon, not a logo
    const sizeCls = `${tag} ${nearBefore.slice(-160)}`;
    const twSizes = [...sizeCls.matchAll(/\b(?:w|h)-(\d+)\b/g)].map((x) => Number(x[1]));
    if (twSizes.length && Math.min(...twSizes) <= 8) continue;
    if (process.env.DEBUG_EXTRACT)
      console.log("INLINE", m.index, (tag.match(/viewBox="([^"]+)"/i) || [])[1], JSON.stringify(nearBefore.slice(-150)));
    const vb = (m[0].match(/viewBox="([^"]+)"/i) || [])[1] || "";
    const vbDims = vb.match(/[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/);
    // tiny inline SVGs are UI icons (menu chevrons, social buttons), not the logo
    if (vbDims && Math.max(Number(vbDims[1]), Number(vbDims[2])) < 40) continue;
    push(
      `inline-svg://${out.length}`,
      "inline-svg",
      100 - m.index / 100000, // earlier in the document = more likely the header logo
      { svgText: m[0], viewBox: vb },
    );
  }

  // <img> whose name/class/alt says logo, or that sits inside a logo container
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const attr = (n) => (tag.match(new RegExp(`\\s${n}\\s*=\\s*["']([^"']+)["']`, "i")) || [])[1];
    const blob = `${attr("src") || ""} ${attr("srcset") || ""} ${attr("alt") || ""} ${attr("class") || ""} ${attr("id") || ""} ${attr("data-src") || ""}`;
    const context = html.slice(Math.max(0, m.index - 320), m.index);
    const inLogoBox = /(?:class|id)\s*=\s*["'][^"']*(?:logo|brand)[^"']*["']/i.test(context);
    if (!/logo|brand/i.test(blob) && !inLogoBox) continue;
    let src = attr("src") || attr("data-src");
    if (!src && attr("srcset")) src = attr("srcset").split(",").pop().trim().split(/\s+/)[0];
    const u = absUrl(src, baseUrl);
    const base = ((u || "").split("?")[0].split("/").pop() || "").toLowerCase();
    // social/UI icon files are never the masthead logo
    if (/^(?:icon[-_]?)?(youtube|facebook|zalo|tiktok|instagram|twitter|linkedin|google|apple|android)\.(svg|png|webp|jpe?g|ico)$/.test(base))
      continue;
    if (/\/icons?\//i.test(u || "") && !/logo/i.test(base)) continue;
    const isSvg = /\.svg(\?|$)/i.test(u || "") || /\.svg/i.test(src || "");
    // a real logo file beats a random header photo that happens to match "logo"
    let score = isSvg ? 90 : 55;
    if (/logo|brand|identity/i.test(`${src} ${attr("alt") || ""}`)) score += 12;
    if (/thumbnail|\/thumbs?\/|resize|crop|xdefault|watermark/i.test(u || "")) score -= 30;
    push(u, isSvg ? "img-svg" : "img-raster", score, {
      alt: attr("alt") || "",
      width: Number(attr("width") || 0),
      height: Number(attr("height") || 0),
    });
    // some CDNs (mediacdn etc.) serve a 112px thumb of a much larger original;
    // the un-thumbed path is the same untouched file
    const full = u && u.replace(/\/thumb_w\/\d+\//, "/");
    if (full && full !== u && /logo/i.test(base))
      push(full, isSvg ? "img-svg" : "img-raster", score + 8, { alt: attr("alt") || "" });
  }

  // organisation logo declared in JSON-LD (very common on news sites whose
  // header logo is text-only and drawn with CSS)
  for (const m of html.matchAll(/"logo"\s*:\s*(?:"([^"]+)"|\{[^}]*?"url"\s*:\s*"([^"]+)")/gi)) {
    const ref = (m[1] || m[2] || "").replace(/\\\//g, "/");
    const u = absUrl(ref, baseUrl);
    if (!u) continue;
    const isSvg = /\.svg(\?|$)/i.test(u);
    push(u, isSvg ? "img-svg" : "img-raster", 62, { via: "json-ld" });
    const full = u.replace(/\/thumb_w\/\d+\//, "/");
    if (full !== u && /logo/i.test(u))
      push(full, isSvg ? "img-svg" : "img-raster", 70, { via: "json-ld" });
  }

  // background-image logos (some sites do this)
  for (const m of html.matchAll(/(?:class|id)\s*=\s*["'][^"']*(?:logo|brand)[^"']*["'][\s\S]{0,400}?url\(["']?([^"')]+)["']?\)/gi)) {
    push(absUrl(m[1], baseUrl), "css-bg", 40);
  }

  // CSS rules whose selector or file name says logo (e.g. .header_logo .logo a{background:url(...)})
  for (const m of html.matchAll(/url\(\s*["']?([^"')\s]+\.(?:svg|png|webp|jpe?g)(?:\?[^"')]*)?)["']?\s*\)/gi)) {
    const before = html.slice(Math.max(0, m.index - 300), m.index);
    const fileNamed = /logo|brand|identity/i.test(m[1]);
    const selector = ([...before.matchAll(/([^{}]+)\{[^{}]*$/g)].pop() || [])[1] || before.slice(-120);
    if (!fileNamed && !/logo|brand/i.test(selector)) continue;
    const isSvg = /\.svg(\?|$)/i.test(m[1]);
    // a file literally named "logo" is stronger evidence than a selector that merely starts with .header_logo
    push(absUrl(m[1], baseUrl), isSvg ? "img-svg" : "css-bg", (isSvg ? 74 : 38) + (fileNamed ? 14 : 0), {
      width: Number((selector.match(/width\s*:\s*(\d+)px/i) || [])[1] || 0),
      height: Number((selector.match(/height\s*:\s*(\d+)px/i) || [])[1] || 0),
    });
  }

  // <link rel="apple-touch-icon" | "icon" | "mask-icon" | "shortcut icon">
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = (tag.match(/\srel\s*=\s*["']([^"']+)["']/i) || [])[1] || "";
    const href = (tag.match(/\shref\s*=\s*["']([^"']+)["']/i) || [])[1];
    const sizes = (tag.match(/\ssizes\s*=\s*["']([^"']+)["']/i) || [])[1];
    const type = (tag.match(/\stype\s*=\s*["']([^"']+)["']/i) || [])[1] || "";
    if (!href) continue;
    const r = rel.toLowerCase();
    if (r.includes("apple-touch-icon"))
      push(absUrl(href, baseUrl), "apple-touch-icon", parseSizes(sizes) >= 150 ? 72 : 66, {
        declared: parseSizes(sizes),
      });
    else if (r === "icon" || r === "shortcut icon")
      push(absUrl(href, baseUrl), "favicon", parseSizes(sizes) >= MIN_PX ? 70 : 30, {
        declared: parseSizes(sizes),
        type,
      });
    else if (r === "manifest" || r === "mask-icon")
      push(absUrl(href, baseUrl), r === "manifest" ? "manifest" : "mask-icon", r === "manifest" ? 10 : 45, {
        declared: parseSizes(sizes),
      });
  }
  return out;
}

async function expandManifest(url, baseUrl) {
  try {
    const r = await polite(new URL(url).host, () => req(url));
    if (!r.ok) return [];
    const j = JSON.parse(r.text.replace(/^\uFEFF/, ""));
    const icons = Array.isArray(j.icons) ? j.icons : [];
    return icons
      .map((i) => ({
        url: absUrl(i.src, new URL(url).origin),
        kind: "web-manifest",
        score: Math.min(80, parseSizes(i.sizes) >= MIN_PX ? 74 : 34),
        declared: parseSizes(i.sizes),
      }))
      .filter((i) => i.url);
  } catch {
    return [];
  }
}

// brand / press kit pages linked from the homepage
async function findBrandLogo(html, baseUrl, host) {
  const links = [
    ...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi),
  ]
    .map((m) => ({ href: m[1], text: m[2].replace(/<[^>]+>/g, " ") }))
    .filter(
      (l) =>
        /(brand|press[-\s]?kit|media[-\s]?kit|logo|identity|guideline|styleguide|style-guide)/i.test(
          `${l.href} ${l.text}`,
        ),
    )
    .slice(0, 4);
  for (const l of links) {
    const url = absUrl(l.href, baseUrl);
    if (!url) continue;
    let u;
    try {
      u = new URL(url);
    } catch {
      continue;
    }
    if (u.host !== host && !u.host.endsWith(`.${host}`)) continue;
    if (!(await robotsAllowed(host, u.pathname)).allowed) continue;
    let page;
    try {
      page = await polite(host, () => req(url));
    } catch {
      continue;
    }
    if (!page.ok) continue;
    const cands = extractCandidates(page.text, page.finalUrl)
      .concat(await expandManifestIfAny(page.text, page.finalUrl, host))
      .filter((c) => c.kind !== "manifest");
    const svg = cands.find((c) => c.kind === "inline-svg" || /\.svg($|\?)/i.test(c.url));
    if (svg) {
      svg.methodHint = "press-kit";
      svg.score += 30;
      return svg;
    }
    const big = cands
      .filter((c) => c.kind === "img-raster" && (c.width || 0) >= MIN_PX)
      .sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    if (big) {
      big.methodHint = "press-kit";
      big.score += 20;
      return big;
    }
  }
  return null;
}
async function expandManifestIfAny(html, baseUrl, host) {
  const mf = extractCandidates(html, baseUrl).find((c) => c.kind === "manifest");
  if (!mf) return [];
  return expandManifest(mf.url, baseUrl);
}

// ---------------- download + score a candidate ----------------
function svgIsUsable(svg) {
  if (!svg || svg.length < 150) return false;
  if (/<(path|rect|circle|polygon|polyline|ellipse|text|tspan)\b/i.test(svg)) return true;
  // a bare <image> without an embedded source draws nothing after sanitising
  if (/<image\b[^>]*(?:xlink:)?href\s*=\s*["']data:image\//i.test(svg)) return true;
  // a lone <use> is only drawable when its target symbol lives in this file
  const ids = new Set([...svg.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]));
  for (const m of svg.matchAll(/<use\b[^>]*(?:xlink:)?href\s*=\s*["']#([^"']+)["']/gi))
    if (ids.has(m[1])) return true;
  return false;
}
async function materialise(cand, host, baseUrl, diag) {
  if (cand.kind === "inline-svg") {
    const { svg, removed } = sanitizeSvg(cand.svgText);
    if (!svgIsUsable(svg)) {
      if (diag) diag.push({ url: "inline-svg", why: "no drawable content after sanitising" });
      return null;
    }
    const { width, height } = svgSize(svg);
    return {
      kind: "svg",
      svg,
      width,
      height,
      originUrl: baseUrl,
      sanitized: removed,
      score: cand.score,
      methodHint: cand.methodHint || "site-header",
    };
  }
  const u = new URL(cand.url);
  if (!/^https?:$/.test(u.protocol)) return null;
  if (!(await robotsAllowed(u.host, u.pathname)).allowed) return null;
  let r;
  try {
    // Referer: many news sites refuse image hotlinking without it
    r = await polite(u.host, () => req(cand.url, { binary: true, referer: baseUrl }));
  } catch (e) {
    if (diag) diag.push({ url: cand.url.slice(0, 100), err: String(e?.message || e).slice(0, 100) });
    return null;
  }
  if (!r.ok || !r.buf || r.buf.length > MAX_BYTES) {
    if (diag) diag.push({ url: cand.url.slice(0, 100), status: r.status, ct: r.contentType });
    return null;
  }
  const type = sniff(r.buf, "");
  if (!type) {
    if (diag)
      diag.push({ url: cand.url.slice(0, 100), status: r.status, why: "not an image", head: r.buf.subarray(0, 12).toString("hex") });
    return null;
  }
  if (!type) return null;
  if (type === "svg") {
    const { svg, removed } = sanitizeSvg(r.buf.toString("utf8"));
    if (!svgIsUsable(svg)) {
      if (diag) diag.push({ url: r.finalUrl.slice(0, 100), why: `svg unusable (${r.buf.length}B)` });
      return null;
    }
    const { width, height } = svgSize(svg);
    return {
      kind: "svg",
      svg,
      width,
      height,
      originUrl: r.finalUrl,
      sanitized: removed,
      score: cand.score,
      methodHint: cand.methodHint || kindToMethod(cand.kind),
    };
  }
  let width = 0,
    height = 0,
    pngBuf = null,
    needsConvert = false;
  if (type === "png") ({ width, height } = pngSize(r.buf));
  else if (type === "jpg") ({ width, height } = jpegSize(r.buf) || {});
  else if (type === "webp") ({ width, height } = webpSize(r.buf) || {});
  else if (type === "ico") {
    const best = icoBest(r.buf);
    if (!best) return null;
    width = best.w;
    height = best.h;
    if (best.isPng) {
      pngBuf = r.buf.subarray(best.offset, best.offset + best.size);
      ({ width, height } = pngSize(pngBuf));
    } else needsConvert = true;
  } else if (type === "gif") return null;
  if (!pngBuf) pngBuf = r.buf;
  return {
    kind: type === "png" || (type === "ico" && !needsConvert) ? "png" : type,
    buf: pngBuf,
    width,
    height,
    originUrl: r.finalUrl,
    score: cand.score + (cand.declared ? 0 : 0),
    methodHint: cand.methodHint || kindToMethod(cand.kind),
  };
}
function kindToMethod(kind) {
  if (kind === "img-svg" || kind === "img-raster" || kind === "inline-svg" || kind === "css-bg")
    return "site-header";
  if (kind === "apple-touch-icon") return "apple-touch-icon";
  if (kind === "web-manifest") return "apple-touch-icon";
  return "favicon";
}

// ---------------- Wikimedia Commons ----------------
const NAME_FIX = { "x.com": "X", "w3.org": "World Wide Web Consortium" };
// search terms for hosts whose own site we could not read (bots, local blocks)
const COMMONS_QUERY = {
  "reuters.com": "Reuters",
  "apnews.com": "Associated Press",
  "afp.com": "Agence France-Presse",
  "bbc.com": "BBC",
  "theguardian.com": "The Guardian",
  "nytimes.com": "The New York Times",
  "wsj.com": "The Wall Street Journal",
  "washingtonpost.com": "The Washington Post",
  "economist.com": "The Economist",
  "bloomberg.com": "Bloomberg L.P.",
  "cnn.com": "CNN",
  "ft.com": "Financial Times",
  "straitstimes.com": "The Straits Times",
  "asia.nikkei.com": "Nikkei",
  "scmp.com": "South China Morning Post",
  "japantimes.co.jp": "The Japan Times",
  "channelnewsasia.com": "CNA (TV network)",
  "abc.net.au": "Australian Broadcasting Corporation",
  "pbs.org": "PBS",
  "npr.org": "NPR",
  "aljazeera.com": "Al Jazeera",
  "dw.com": "Deutsche Welle",
  "france24.com": "France 24",
  "theconversation.com": "The Conversation (website)",
  "propublica.org": "ProPublica",
  "wikipedia.org": "Wikipedia",
  "reddit.com": "Reddit",
  "x.com": "X",
  "facebook.com": "Facebook",
  "youtube.com": "YouTube",
  "tiktok.com": "TikTok",
  "zalo.me": "Zalo",
  "who.int": "World Health Organization",
  "un.org": "United Nations",
  "worldbank.org": "World Bank",
  "imf.org": "International Monetary Fund",
  "oecd.org": "OECD",
  "europa.eu": "European Commission",
  "unesco.org": "UNESCO",
  "unicef.org": "UNICEF",
  "fao.org": "Food and Agriculture Organization",
  "ilo.org": "International Labour Organization",
  "wto.org": "World Trade Organization",
  "adb.org": "Asian Development Bank",
  "asean.org": "ASEAN",
  "iea.org": "International Energy Agency",
  "ipcc.ch": "IPCC",
  "federalreserve.gov": "Federal Reserve",
  "ecb.europa.eu": "European Central Bank",
  "cdc.gov": "Centers for Disease Control and Prevention",
  "nih.gov": "National Institutes of Health",
  "fda.gov": "Food and Drug Administration",
  "census.gov": "United States Census Bureau",
  "bls.gov": "Bureau of Labor Statistics",
  "nasa.gov": "NASA",
  "noaa.gov": "National Oceanic and Atmospheric Administration",
  "usgs.gov": "United States Geological Survey",
  "epa.gov": "Environmental Protection Agency",
  "congress.gov": "United States Congress",
  "gov.uk": "GOV.UK",
  "nhs.uk": "National Health Service",
  "icrc.org": "International Committee of the Red Cross",
  "rsf.org": "Reporters Without Borders",
  "iso.org": "International Organization for Standardization",
  "ietf.org": "Internet Engineering Task Force",
  "nature.com": "Nature (journal)",
  "science.org": "Science (journal)",
  "thelancet.com": "The Lancet",
  "nejm.org": "The New England Journal of Medicine",
  "bmj.com": "The BMJ",
  "britannica.com": "Encyclopædia Britannica",
  "arxiv.org": "arXiv",
  "web.archive.org": "Internet Archive",
  "commoncrawl.org": "Common Crawl",
  "snopes.com": "Snopes",
  "politifact.com": "PolitiFact",
  "fullfact.org": "Full Fact",
  "leadstories.com": "Lead Stories",
  "africacheck.org": "Africa Check",
  "newtral.es": "Newtral",
  "correctiv.org": "Correctiv",
  "teyit.org": "Teyit",
  "factly.in": "Factly",
  "pesacheck.org": "PesaCheck",
  "aosfatos.org": "Aos Fatos",
  "chequeado.com": "Chequeado",
  "maldita.es": "Maldita.es",
  "kenh14.vn": "Kenh14",
  "voz.vn": "Voz",
  "hrw.org": "Human Rights Watch",
  "amnesty.org": "Amnesty International",
  "transparency.org": "Transparency International",
  "freedomhouse.org": "Freedom House",
  "nypost.com": "New York Post",
  "foxnews.com": "Fox News",
  "newsmax.com": "Newsmax",
  "huffpost.com": "HuffPost",
  "buzzfeed.com": "BuzzFeed",
  "vice.com": "Vice Media",
  "quora.com": "Quora",
  "medium.com": "Medium (website)",
  "substack.com": "Substack",
  "mbfc.news": "Media Bias/Fact Check",
  "newsguardtech.com": "NewsGuard",
  "adfontesmedia.com": "Ad Fontes Media",
  "edmo.eu": "European Digital Media Observatory",
  "hanoimetro.net.vn": "Hanoi Metro",
  "poynter.org": "Poynter Institute",
  "htv.com.vn": "Ho Chi Minh City Television",
  "cochranelibrary.com": "Cochrane",
  "laodong.vn": "Lao Động",
  "moh.gov.vn": "Ministry of Health (Vietnam)",
  "chinhphu.vn": "Government of Vietnam",
  "quochoi.vn": "National Assembly of Vietnam",
  "dangcongsan.vn": "Communist Party of Vietnam",
  "nhandan.vn": "Nhân Dân",
  "vietnamplus.vn": "Vietnam News Agency",
  "evn.com.vn": "Electricity of Vietnam",
  "pvn.vn": "Petrovietnam",
  "dsvn.vn": "Vietnam Railways",
  "hsx.vn": "Ho Chi Minh City Stock Exchange",
  "hnx.vn": "Hanoi Stock Exchange",
  "sbv.gov.vn": "State Bank of Vietnam",
  "vnu.edu.vn": "Vietnam National University, Hanoi",
  "hust.edu.vn": "Hanoi University of Science and Technology",
  "vov.vn": "Voice of Vietnam",
  "vietnamnews.vn": "Vietnam News",
  "tuoitrenews.vn": "Tuổi Trẻ",
  "vtc.vn": "VTC Digital Television",
  "toaan.gov.vn": "Supreme People's Court of Vietnam",
  "vksndtc.gov.vn": "Supreme People's Procuracy of Vietnam",
  "sav.gov.vn": "State Audit Office of Vietnam",
  "thanhtra.gov.vn": "Government Inspectorate of Vietnam",
  "ssc.gov.vn": "State Securities Commission of Vietnam",
  "mod.gov.vn": "Ministry of Defence (Vietnam)",
  "moha.gov.vn": "Ministry of Home Affairs (Vietnam)",
  "most.gov.vn": "Ministry of Science and Technology (Vietnam)",
  "monre.gov.vn": "Ministry of Natural Resources and Environment (Vietnam)",
  "mae.gov.vn": "Ministry of Agriculture and Environment",
  "mpi.gov.vn": "Ministry of Planning and Investment (Vietnam)",
  "mof.gov.vn": "Ministry of Finance (Vietnam)",
  "moet.gov.vn": "Ministry of Education and Training (Vietnam)",
  "mps.gov.vn": "Ministry of Public Security (Vietnam)",
  "moit.gov.vn": "Ministry of Industry and Trade (Vietnam)",
  "mofa.gov.vn": "Ministry of Foreign Affairs (Vietnam)",
  "moj.gov.vn": "Ministry of Justice (Vietnam)",
  "bvhttdl.gov.vn": "Ministry of Culture, Sports and Tourism (Vietnam)",
  "nso.gov.vn": "General Statistics Office of Vietnam",
  "vss.gov.vn": "Vietnam Social Security",
  "vcci.com.vn": "Vietnam Chamber of Commerce and Industry",
  "vja.org.vn": "Vietnam Journalists Association",
};
function commonsQueryFor(host, nameHint) {
  if (COMMONS_QUERY[host]) return COMMONS_QUERY[host];
  if (NAME_FIX[host]) return NAME_FIX[host];
  const label = host.replace(/^www\./, "").split(".")[0];
  return nameHint && nameHint.length > 2 ? nameHint : label;
}
async function commonsSearch(name, host) {
  // intitle: keeps "BBC logo" from returning a hundred photos that merely
  // mention the words, and is what makes the identity filter below reliable
  const q = `intitle:${NAME_FIX[host] || name} logo`;
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search" +
    "&srsearch=" +
    encodeURIComponent(q) +
    "&srnamespace=6&srlimit=10";
  try {
    const r = await polite("commons.wikimedia.org", () => req(url));
    if (!r.ok) return [];
    const items = JSON.parse(r.text)?.query?.search || [];
    const titles = items
      .map((i) => i.title)
      .filter((t) => /\.(svg|png)$/i.test(t))
      .filter(
        (t) =>
          !/(font|flag|map|chart|photo|headshot|portrait|station|line \d|locator|location|signature|stamp|coat[- ]of[- ]arms)/i.test(
            t,
          ),
      )
      .filter((t) => !/\(\s*(until|old|former|previous|historical|retired|19\d\d|20\d\d)\b/i.test(t))
      .slice(0, 5);
    if (!titles.length) return [];
    const u2 =
      "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo" +
      "&iiprop=url|sizes|mime&titles=" +
      titles.map(encodeURIComponent).join("|");
    const r2 = await polite("commons.wikimedia.org", () => req(u2));
    if (!r2.ok) return [];
    const pages = JSON.parse(r2.text)?.query?.pages || {};
    const found = [];
    for (const p of Object.values(pages)) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      found.push({
        title: p.title,
        url: ii.url,
        descriptionUrl: ii.descriptionurl,
        mime: ii.mime,
        width: ii.width,
        height: ii.height,
      });
    }
    return found;
  } catch {
    return [];
  }
}

// ---------------- one host ----------------
// public DNS view, so a local ISP block is not mistaken for a dead domain
const dohCache = new Map();
async function dohLookup(host) {
  if (dohCache.has(host)) return dohCache.get(host);
  const p = (async () => {
    try {
      const r = await polite("dns.google", () =>
        req(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`),
      );
      const j = JSON.parse(r.text);
      const ips = (j.Answer || []).filter((a) => a.type === 1).map((a) => a.data);
      return { status: j.Status, ips, nxdomain: j.Status === 3, exists: j.Status === 0 };
    } catch {
      return null;
    }
  })();
  dohCache.set(host, p);
  return p;
}

async function tryHost(host) {
  const rec = { host, attempts: [], resolvedFrom: null, siteName: null, pageTitle: null };
  let page = null;
  const tryUrl = async (url, ua) =>
    polite(host, () => (ua === "bot" ? reqBot(url) : req(url)));

  const robot = await robotsAllowed(host, "/").catch(() => ({ allowed: true, checked: false }));
  rec.robots = robot.checked ? (robot.allowed ? "allowed" : "disallowed") : "none";
  if (!robot.allowed) {
    rec.robotsBlocked = true;
    return rec;
  }

  try {
    page = await tryUrl(`https://${host}/`);
    if (!page.ok || page.loopback) {
      // some hosts only answer on www; not a domain change, just resolution
      if (!host.startsWith("www.")) {
        const pWww = await tryUrl(`https://www.${host}/`);
        if (pWww.ok && !pWww.loopback) {
          page = pWww;
          rec.servedFromWww = true;
        }
      }
    }
    if ((!page.ok || page.loopback) && page.status !== 403 && page.status !== 429) {
      const p2 = await tryUrl(`https://${host}/`, "bot");
      if (p2.ok && !p2.loopback) page = p2;
    }
  } catch (e) {
    rec.fetchError = String(e?.message || e).slice(0, 180);
    rec.failKind = classifyCurlError(e, `https://${host}/`);
  }

  if (!page || !page.ok || page.loopback) {
    if (page?.loopback) rec.failKind = "dns-sink";
    if (!rec.failKind) rec.failKind = page?.status === 403 || page?.status === 429 ? "blocked" : "http";
    rec.fetchError = rec.fetchError || (page?.loopback ? `resolved to loopback ${page.remoteIp}` : `HTTP ${page?.status}`);
    const dns = await dohLookup(host);
    if (dns) {
      rec.publicDns = dns.nxdomain ? "nxdomain" : dns.ips.length ? `ok:${dns.ips[0]}` : "nodata";
      if (dns.nxdomain) rec.failKind = "dead-domain";
    }
    return rec;
  }

  const finalUrl = new URL(page.finalUrl);
  const finalHost = finalUrl.host;
  if (finalHost !== host && finalHost !== `www.${host}`) rec.resolvedFrom = finalHost;
  rec.finalUrl = page.finalUrl;
  const html = page.text;
  if (process.env.DEBUG_HOST === host) writeFileSync(path.join(WORK, `dbg-${host}.html`), html);
  rec.siteName =
    html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i)?.[1] ||
    null;
  rec.pageTitle = (html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i) || [])[1]?.trim() || null;

  let cands = extractCandidates(html, page.finalUrl);
  const mf = cands.find((c) => c.kind === "manifest");
  if (mf) cands = cands.concat(await expandManifest(mf.url, page.finalUrl));
  cands = cands.filter((c) => c.kind !== "manifest");
  // same host, or the site's own CDN; never ad/analytics hosts
  cands = cands.filter((c) => (c.kind === "inline-svg" ? true : assetHostOk(c.url, finalHost)));
  for (const c of cands)
    c.score += sameHost(c.kind === "inline-svg" ? `https://${host}/` : c.url, finalHost) ? 25 : 0;
  rec.candidateCount = cands.length;

  const brand = await findBrandLogo(html, page.finalUrl, finalHost).catch(() => null);
  if (brand) rec.brandPage = brand.url || "inline";

  // Nothing on the page: try the handful of conventional logo paths before
  // giving up on the site (all still subject to robots.txt in materialise()).
  if (!cands.length) {
    for (const [p, kind, score] of [
      ["/logo.svg", "img-svg", 32],
      ["/logo.png", "img-raster", 30],
      ["/apple-touch-icon.png", "apple-touch-icon", 28],
      ["/favicon.ico", "favicon", 24],
    ]) {
      cands.push({ url: new URL(p, page.finalUrl).href, kind, score, guessed: true });
    }
  }

  const pool = [...(brand ? [brand] : []), ...cands];
  pool.sort((a, b) => b.score - a.score);
  // mix kinds: otherwise a page full of inline UI SVGs starves the real logo file
  const selected = [];
  const perKind = new Map();
  for (const c of pool) {
    if (selected.length >= 10) break;
    const n = perKind.get(c.kind) || 0;
    const cap = c.kind === "inline-svg" ? 2 : c.kind === "css-bg" ? 1 : 3;
    if (n >= cap) continue;
    perKind.set(c.kind, n + 1);
    selected.push(c);
  }
  if (process.env.DEBUG_HOST === host) {
    console.log("POOL", pool.length, "selected", selected.length);
    for (const c of selected) console.log("  sel", c.kind, c.score, (c.url || "inline").slice(0, 110));
    for (const c of pool.slice(0, 25)) console.log("  pool", c.kind, c.score, (c.url || "inline").slice(0, 110));
  }
  const seenSvg = new Set();
  const taken = [];
  for (const c of selected) {
    if (c.kind === "inline-svg") {
      const sig = c.svgText.slice(0, 120);
      if (seenSvg.has(sig)) continue;
      seenSvg.add(sig);
    }
    const m = await materialise(c, host, page.finalUrl, (rec.failures ||= [])).catch((e) => {
      (rec.failures ||= []).push({ url: (c.url || c.kind).slice(0, 100), err: String(e?.message).slice(0, 80) });
      return null;
    });
    if (!m) continue;
    taken.push(m);
    rec.attempts.push({
      kind: c.kind,
      url: m.originUrl,
      type: m.kind,
      w: m.width,
      h: m.height,
      method: m.methodHint,
    });
  }
  rec.materialised = taken;
  if (process.env.DEBUG_HOST === host) {
    console.log("ATTEMPTS", JSON.stringify(taken.map((t) => [t.kind, Math.round(t.width), Math.round(t.height), t.methodHint])));
    console.log("FAILURES", JSON.stringify(rec.failures || []));
  }
  // a site with candidates but no usable image is different from a site with none
  if (!taken.length && pool.length) rec.whyNoLogo = "candidates found but none downloadable/usable";
  return rec;
}

// ---------------- pick the best result ----------------
function pick(rec) {
  const list = (rec.materialised || []).slice();
  const scoreOf = (m) => {
    const w = m.width || 0;
    const h = m.height || 0;
    const shorter = w && h ? Math.min(w, h) : 0;
    const aspect = w && h ? Math.max(w, h) / Math.min(w, h) : 1;
    // tier: vector or a genuinely large bitmap first, then mid, then small icons
    let tier = 1;
    // a vector wordmark can be 40px tall and still render crisply at 32px
    if (m.kind === "svg" && (!w || !h || shorter >= 64 || Math.max(w, h) >= 120)) tier = 3;
    else if (m.kind === "png" && shorter >= 128) tier = 3;
    else if (shorter >= 64) tier = 2;
    let s = tier * 1000;
    s += (m.score || 0) * 2; // candidate signals: "logo" in the name, not a thumbnail
    if (m.kind === "svg") s += 120;
    if (aspect <= 1.35) s += 60; // square mark, best at 24-32px
    else if (aspect > 5) s -= 40; // very wide wordmark still allowed
    if (/press-kit/.test(m.methodHint)) s += 50;
    if (/apple-touch/.test(m.methodHint)) s += 25;
    if (/favicon/.test(m.methodHint)) s -= 40;
    if (m.kind === "inline-svg") s -= 10;
    if (shorter) s += Math.min(shorter, 600) / 10;
    return s;
  };
  list.sort((a, b) => scoreOf(b) - scoreOf(a));
  return list[0] || null;
}

async function googleFetch(hostName) {
  const url = `https://www.google.com/s2/favicons?domain=${hostName}&sz=128`;
  const r = await polite("www.google.com", () => req(url, { binary: true }));
  if (!r.ok || !r.buf) return null;
  return { url, buf: r.buf };
}
let placeholderHash = null;
async function googlePlaceholderHash() {
  if (placeholderHash) return placeholderHash;
  const p = await googleFetch("qzz-no-such-domain-example.invalid");
  placeholderHash = p ? createHash("sha256").update(p.buf).digest("hex") : null;
  return placeholderHash;
}
async function googleFallback(host) {
  let g;
  try {
    g = await googleFetch(host);
  } catch {
    return null;
  }
  if (!g) return null;
  const type = sniff(g.buf, "");
  if (type !== "png") return null;
  const hash = createHash("sha256").update(g.buf).digest("hex");
  // Google serves a generic globe when it has nothing for the domain
  if (hash === (await googlePlaceholderHash())) return null;
  const { width, height } = pngSize(g.buf);
  return {
    kind: "png",
    buf: g.buf,
    width,
    height,
    originUrl: g.url,
    methodHint: "google-favicon-fallback",
  };
}
async function commonsPick(rec, nameHint) {
  const host = rec.host;
  const query = commonsQueryFor(host, nameHint);
  const allHits = await commonsSearch(query, host);
  // Strict identity check: a candidate file may only add generic logo words,
  // a year, or a token that appears in the domain. "ASEAN Exchanges logo" and
  // "Central African Airways" must not pass for ASEANS/africacheck.
  const norm = (s) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  const STOP = new Set([
    "logo", "wordmark", "icon", "symbol", "the", "of", "and", "de", "la", "en", "el",
    // words that describe any outlet/agency without identifying a different one
    "news", "newspaper", "media", "network", "tv", "channel", "company", "corporation",
    "corp", "group", "agency", "press", "online", "website", "official",
    "english", "french", "vietnamese", "chinese", "russian", "arabic", "spanish",
    "german", "japanese", "korean", "italian", "portuguese", "indonesian", "thai",
    "turkish", "polish", "greek",
  ]);
  const allowed = new Set([...norm(query), ...norm(host.replace(/^www\./, ""))]);
  const isRelevant = (title) => {
    const toks = norm(title.replace(/^File:/, "").replace(/\.(svg|png)$/i, ""));
    if (!toks.length) return false;
    return toks.every(
      (t) => allowed.has(t) || STOP.has(t) || /^(1[89]|20)\d\d$/.test(t) || /^\d{2}s$/.test(t),
    );
  };
  const hits = allHits.filter((h) => isRelevant(h.title));
  if (!hits.length) return null;
  // rank by closeness to "<Organisation> logo"; demote parent/subsidiary marks
  const rank = (h) => {
    const t = h.title.replace(/^File:/, "").toLowerCase();
    const q = query.toLowerCase();
    let s = 0;
    if (t.startsWith(q)) s += 100;
    if (t.startsWith(`${q} logo`)) s += 40;
    if (/\blogo\b|\bwordmark\b/.test(t)) s += 20;
    if (/\.svg$/i.test(t)) s += 30;
    for (const bad of ["thomson", "foundation", "institute", "group", "radio", "headquarters", "building", "former", "previous", "old", "money", "business", "sport", "weather", "shop", "store"])
      if (t.includes(bad) && !q.includes(bad)) s -= 80;
    // "BBC logo (1997-2021)" / "(pre97)" / "(80s)" are retired marks
    if (/\d{4}\s*[-–—]\s*(\d{4}|present)/.test(t)) s -= 220;
    if (/\b(pre[- ]?\d+|old|former|previous|historical|retired|until)\b/.test(t)) s -= 120;
    if (/\((\d{2}s|1[89]\d0|20[0-1]\d)\)/.test(t)) s -= 90;
    if (/english/i.test(t)) s += 4;
    else if (/french|chinese|russian|arabic|spanish|german|japanese|korean/i.test(t)) s -= 12;
    const years = (t.match(/\b(19|20)\d\d\b/g) || []).map(Number);
    if (years.length) s += Math.min(20, Math.max(...years) - 2000) / 2;
    // words that are neither the brand, a logo word, nor a year are usually another entity
    const brandWords = new Set(q.split(/[^a-z0-9]+/).filter(Boolean));
    const extra = t
      .replace(/\.(svg|png)$/, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w && !brandWords.has(w) && !/logo|wordmark|icon|symbol|the|of|and|1[89]\d0|20\d\d|s$/.test(w));
    s -= extra.length * 22;
    if (h.mime === "image/png") s += 5;
    s -= Math.abs(t.length - (q + " logo.svg").length) * 0.2;
    return s;
  };
  hits.sort((a, b) => rank(b) - rank(a));
  const chosen = hits[0];
  const r = await polite(new URL(chosen.url).host, () => req(chosen.url, { binary: true })).catch(
    () => null,
  );
  if (!r || !r.ok || !r.buf || r.buf.length > MAX_BYTES) return null;
  const type = sniff(r.buf, chosen.mime);
  if (!type) return null;
  if (type === "svg") {
    const { svg: s, removed } = sanitizeSvg(r.buf.toString("utf8"));
    if (!svgIsUsable(s)) return null;
    let { width, height } = svgSize(s);
    // file without intrinsic size: fall back to the dimensions Commons reports
    if (!width || !height) {
      width = chosen.width || 0;
      height = chosen.height || 0;
    }
    return {
      kind: "svg",
      svg: s,
      width,
      height,
      originUrl: chosen.url,
      commonsTitle: chosen.title,
      sanitized: removed,
      methodHint: "wikimedia-commons",
    };
  }
  if (type === "png") {
    const { width, height } = pngSize(r.buf);
    return {
      kind: "png",
      buf: r.buf,
      width,
      height,
      originUrl: chosen.url,
      commonsTitle: chosen.title,
      methodHint: "wikimedia-commons",
    };
  }
  return null;
}

// The lead image of the organisation's Wikipedia article is usually the current
// logo (and a better identity match than a Commons full-text search). Only
// accept it when its filename says logo/emblem, so photos are ignored.
async function wikipediaPick(rec, nameHint) {
  const host = rec.host;
  const title = commonsQueryFor(host, nameHint);
  if (!title || title.length < 2) return null;
  const langs = /\.vn$/.test(host) ? ["vi", "en"] : ["en"];
  for (const lang of langs) {
    const api =
      `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&redirects=1` +
      `&prop=pageimages&piprop=original%7Cname&titles=${encodeURIComponent(title)}`;
    let r;
    try {
      r = await polite(`${lang}.wikipedia.org`, () => req(api));
    } catch {
      continue;
    }
    if (!r.ok) continue;
    let page;
    try {
      page = Object.values(JSON.parse(r.text)?.query?.pages || {})[0];
    } catch {
      continue;
    }
    const img = page?.original?.source;
    const name = page?.pageimage || "";
    if (!img) continue;
    // the filename must say logo/emblem: a plain SVG lead image is often a
    // flag, a letter glyph or a map rather than the organisation's mark
    if (!/logo|wordmark|emblem|seal|icon|symbol/i.test(name)) continue;
    const m = await materialise(
      { url: img, kind: "img-svg", score: 60, methodHint: "wikimedia-commons" },
      host,
      rec.finalUrl || `https://${host}/`,
    ).catch(() => null);
    if (m) {
      m.commonsTitle = `${lang}.wikipedia:${name}`;
      m.viaWikipedia = lang;
      return m;
    }
  }
  return null;
}

// Domains verified to have no A or AAAA record at all (two public resolvers);
// the page cannot exist. data.gov.vn also collides with the US Data.gov site,
// so no Wikipedia/Commons substitute may be used for it.
const KNOWN_DEAD = new Set(["data.gov.vn"]);

const entriesByTarget = new Map();
for (const e of plan.entries) {
  if (!entriesByTarget.has(e.fileDomain)) entriesByTarget.set(e.fileDomain, []);
  entriesByTarget.get(e.fileDomain).push(e);
}
const targets = plan.targets.filter((t) => (only ? only.has(t) : true)).slice(0, limit);

let done = 0;
async function runTarget(host) {
  const nameHint = (entriesByTarget.get(host) || [])[0]?.name;
  const rec = await tryHost(host);
  if (KNOWN_DEAD.has(host)) {
    rec.failKind = "dead-domain";
    rec.deadNote =
      "No A/AAAA record via public DNS; the portal is offline (its name also collides with the US Data.gov site).";
  }
  let best = pick(rec);
  rec.chosen = best;
  const shorterOf = best ? Math.min(best.width || 0, best.height || 0) : 0;
  // only fall back to Commons when the site gave us nothing usable, or only a
  // favicon-sized raster (a real 96px+ header logo is better provenance)
  const weak = !best || (best.kind !== "svg" && shorterOf < MIN_PX);
  // a domain with no DNS answer is treated as dead: do not substitute a logo
  const dead = rec.failKind === "dead-domain";
  if (weak && !dead) {
    const fromWiki = await wikipediaPick(rec, nameHint).catch(() => null);
    const fromCommons =
      fromWiki ||
      (await commonsPick(rec, nameHint).catch((e) => {
        (rec.failures ||= []).push({ commons: String(e?.message || e).slice(0, 120) });
        return null;
      }));
    if (fromCommons) {
      const cs = Math.min(fromCommons.width || 0, fromCommons.height || 0);
      const better =
        !best ||
        (fromCommons.kind === "svg" && best.kind !== "svg") ||
        (fromCommons.kind === best.kind && cs > shorterOf);
      if (better) {
        rec.commonsUsed = true;
        best = fromCommons;
        rec.chosen = best;
      }
    }
  }
  if (!best && !dead) {
    const g = await googleFallback(host);
    if (g) {
      rec.googleUsed = true;
      best = g;
      rec.chosen = best;
    }
  }
  if (best) {
    // write the file
    const base = host.replace(/\./g, "-").toLowerCase();
    if (best.kind === "svg") {
      const file = `${base}.svg`;
      writeFileSync(path.join(OUT_DIR, file), best.svg);
      rec.file = file;
    } else if (best.kind === "png") {
      const file = `${base}.png`;
      writeFileSync(path.join(OUT_DIR, file), best.buf);
      rec.file = file;
    } else {
      // webp/jpg -> re-wrap in a PNG container with sips (no pixel edits)
      const tmp = path.join(WORK, "tmp-in");
      if (!existsSync(tmp)) mkdirSync(tmp, { recursive: true });
      const src = path.join(tmp, `${base}-src.${best.kind}`);
      writeFileSync(src, best.buf);
      const file = `${base}.png`;
      try {
        execFileSync("sips", ["-s", "format", "png", src, "--out", path.join(OUT_DIR, file)]);
        const dim = sipsInfo(path.join(OUT_DIR, file));
        best.width = dim.width || best.width;
        best.height = dim.height || best.height;
        rec.convertedFrom = best.kind;
        rec.file = file;
      } catch {
        rec.convertFailed = best.kind;
      }
    }
  }
  // never persist the image bytes themselves: results.json is state, the
  // pictures live in public/source-logos (a full page of inline SVGs would
  // otherwise exceed V8's maximum string length)
  const slim = (o) => {
    if (!o) return o;
    const { svg, buf, ...rest } = o;
    return rest;
  };
  rec.chosen = slim(rec.chosen);
  if (rec.materialised) rec.materialised = rec.materialised.map(slim);
  rec.fetchedAt = new Date().toISOString();
  results[host] = rec;
  done++;
  if (done % 10 === 0) {
    writeFileSync(path.join(WORK, "results.json"), JSON.stringify(results, null, 2));
    console.log(`${done}/${targets.length} ${host}`);
  }
}

const queue = targets.slice();
async function worker() {
  while (queue.length) {
    const t = queue.shift();
    try {
      await runTarget(t);
    } catch (e) {
      results[t] = { host: t, fatal: String(e?.message || e).slice(0, 200) };
    }
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
writeFileSync(path.join(WORK, "results.json"), JSON.stringify(results, null, 2));
console.log(`done: ${done} targets; results.json has ${Object.keys(results).length}`);
