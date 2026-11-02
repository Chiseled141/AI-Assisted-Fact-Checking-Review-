// Build the fetch plan from the parsed TRUSTED_SOURCES.md rows.
// Emits work/plan.json: manifest entries + the unique hosts we actually scrape.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(path.join(here, "work/raw.json"), "utf8"));

// ---- organisation names for rows that give a name instead of a domain ----
const NAME_TO_DOMAIN = {
  "Reuters Fact Check": "reuters.com",
  "AFP Fact Check": "factcheck.afp.com",
  "AP Fact Check": "apnews.com",
  Snopes: "snopes.com",
  PolitiFact: "politifact.com",
  "Full Fact": "fullfact.org",
  "BBC Verify": "bbc.com",
  "Lead Stories": "leadstories.com",
  "Logically Facts": "logically.com",
  "Africa Check": "africacheck.org",
  "Check Your Fact": "checkyourfact.com",
  Newtral: "newtral.es",
  Correctiv: "correctiv.org",
  "Les Décodeurs": "lemonde.fr",
  "Taiwan FactCheck Center": "tfc.org.tw",
  "Rappler fact check": "rappler.com",
  Cekfakta: "cekfakta.com",
  BOOM: "boomabovehoax.com",
  "Pagella Politica": "pagellapolitica.it",
  Demagog: "demagog.org.pl",
  Teyit: "teyit.org",
  Factly: "factly.in",
  PesaCheck: "pesacheck.org",
  "Aos Fatos": "aosfatos.org",
  Chequeado: "chequeado.com",
  "IFCN signatories list": "ifcncodeofprinciples.poynter.org",
  "Duke Reporters' Lab fact-checker database": "reporterslab.duke.edu",
  EDMO: "edmo.eu",
  "Google Fact Check Tools": "toolbox.google.com",
  eurostat: "ec.europa.eu",
  // section 8 (the parser read the Notes column for these rows)
  "Media Bias/Fact Check": "mbfc.news",
  NewsGuard: "newsguardtech.com",
  "Ad Fontes Media": "adfontesmedia.com",
  // section 9 social platforms
  "Facebook pages and groups": "facebook.com",
  TikTok: "tiktok.com",
  "YouTube channels": "youtube.com",
  "Zalo channels": "zalo.me",
};

// ---- rows that are prose, not sources ----
const DROP = /^(not evidence itself|Notes|Volunteer-run.*|Commercial ratings.*|Reliability and bias chart|.*Wikipedia is a lead.*|but a story can still be a lead)$/i;

// ---- rows the file gives as a path or an alias: name overrides ----
const NAME_OVERRIDE = {
  "znews.vn": "Zing News",
  "baoquocte.vn": "Thế giới & Việt Nam",
  "vir.com.vn": "Vietnam Investment Review",
  "cand.com.vn": "Nhân Dân (CAND)",
  "nso.gov.vn": "General Statistics Office",
  "sbv.gov.vn": "State Bank of Vietnam",
  "hsx.vn": "Ho Chi Minh City Stock Exchange",
  "hnx.vn": "Hanoi Stock Exchange",
  "vr.org.vn": "Vietnam Register",
  "dsvn.vn": "Vietnam Railways",
  "evn.com.vn": "Electricity of Vietnam",
  "pvn.vn": "Petrovietnam",
  "vcci.com.vn": "Vietnam Chamber of Commerce and Industry",
  "vja.org.vn": "Vietnam Journalists Association",
  "vass.gov.vn": "Vietnam Academy of Social Sciences",
  "vast.vn": "Vietnam Academy of Science and Technology",
  "ciem.org.vn": "Central Institute for Economic Management",
  "vepr.org.vn": "Vietnam Institute for Economic Policy and Research",
  "vjol.info.vn": "Vietnam Journals Online",
  "vista.gov.vn": "National Agency for Science and Technology Information",
  "rsf.org": "Reporters Without Borders",
  "web.archive.org": "Internet Archive",
  "law.cornell.edu": "Cornell LII",
  "ourworldindata.org": "Our World in Data",
  "fred.stlouisfed.org": "FRED",
  "asia.nikkei.com": "Nikkei Asia",
  "ecb.europa.eu": "European Central Bank",
  "eur-lex.europa.eu": "EUR-Lex",
  "ema.europa.eu": "European Medicines Agency",
  "ecdc.europa.eu": "European Centre for Disease Prevention and Control",
  "data.europa.eu": "EU Open Data Portal",
  "data.un.org": "UN Data",
  "data.imf.org": "IMF Data",
  "worldbank.org": "World Bank",
  " FactCheck.org": "FactCheck.org",
  "factcheck.org": "FactCheck.org",
  "maldita.es": "Maldita.es",
  "pubmed.ncbi.nlm.nih.gov": "PubMed",
  "cochranelibrary.com": "Cochrane Library",
  "medrxiv.org": "medRxiv",
  "kcb.vn": "Vietnam Department of Medical Examination and Treatment",
  "tinnhiemmang.vn": "Tinnhiemmang.vn",
  "khonggianmang.vn": "Khonggianmang.vn",
  "hanoimetro.net.vn": "Hanoi Metro",
  "toolbox.google.com": "Google Fact Check Tools",
  "mbfc.news": "Media Bias/Fact Check",
  "newsguardtech.com": "NewsGuard",
  "adfontesmedia.com": "Ad Fontes Media",
  "facebook.com": "Facebook",
  "youtube.com": "YouTube",
  "zalo.me": "Zalo",
  "tiktok.com": "TikTok",
  "ifcncodeofprinciples.poynter.org": "IFCN Signatories List",
  "reporterslab.duke.edu": "Duke Reporters' Lab",
  "edmo.eu": "EDMO",
  "tfc.org.tw": "Taiwan FactCheck Center",
  "boomabovehoax.com": "BOOM Above Hoax",
  "leadstories.com": "Lead Stories",
  "logically.com": "Logically Facts",
  "checkyourfact.com": "Check Your Fact",
  "correctiv.org": "CORRECTIV",
  "newtral.es": "Newtral",
  "cekfakta.com": "CekFakta",
  "pagellapolitica.it": "Pagella Politica",
  "demagog.org.pl": "Demagog",
  "teyit.org": "Teyit",
  "factly.in": "Factly",
  "pesacheck.org": "PesaCheck",
  "aosfatos.org": "Aos Fatos",
  "chequeado.com": "Chequeado",
  "fullfact.org": "Full Fact",
  "politifact.com": "PolitiFact",
  "snopes.com": "Snopes",
  "lemonde.fr": "Les Décodeurs (Le Monde)",
  "congbao.chinhphu.vn": "Official Gazette (Chinh Phu)",
  "en.vietnamplus.vn": "Vietnam News Agency (English)",
  "vietnamnews.vn": "Vietnam News",
  "hanoitimes.vn": "Hanoi Times",
  "tuoitrenews.vn": "Tuoi Tre News",
  "e.vnexpress.net": "VnExpress International",
};

// several listed hosts belong to one organisation: fetch once, share the file
const FILE_DOMAIN_ALIAS = {
  "en.vietnamplus.vn": "vietnamplus.vn",
  "vietnamnet.vn": "vietnamnet.vn",
  "thanhnien.vn": "thanhnien.vn",
  "factcheck.afp.com": "afp.com",
  "reuters.com": "reuters.com",
  "apnews.com": "apnews.com",
  "bbc.com": "bbc.com",
  "rappler.com": "rappler.com",
  "lemonde.fr": "lemonde.fr",
  "ec.europa.eu": "europa.eu",
  "toolbox.google.com": "google.com",
  "ifcncodeofprinciples.poynter.org": "poynter.org",
  "reporterslab.duke.edu": "duke.edu",
  "ictnews.vietnamnet.vn": "vietnamnet.vn",
  "pubmed.ncbi.nlm.nih.gov": "nih.gov",
};

const EN_PREFIXES = ["en.", "e."]; // keep: these are separate hosts with own branding

const entries = [];
for (const row of raw) {
  if (row.section === 10 || row.tag === "red") continue;
  // section 8 has no trust-tag column; its rows are added explicitly below
  if (row.section === 8) continue;
  let domain = row.domain;
  let name = null;
  if (!domain) {
    const key = row.raw
      .replace(/\s*\(.*$/, "")
      .replace(/\s*—.*$/, "")
      .replace(/[.;:]+\s*$/, "")
      .trim();
    const mapped = NAME_TO_DOMAIN[key];
    if (!mapped) {
      if (DROP.test(key)) continue;
      console.log("UNRESOLVED NAME:", row.section, "|", row.raw);
      continue;
    }
    domain = mapped;
    name = key;
  }
  // strip any path, lowercase
  domain = domain.toLowerCase().replace(/^\/+/, "");
  const host = domain.split("/")[0];
  if (DROP.test(host)) continue;
  // keep any caution the list attaches to the row (e.g. "— confirm current operator")
  let note = "";
  const dash = (row.raw || "").match(/—\s*([^—]+)$/);
  if (dash) note = `From TRUSTED_SOURCES.md: ${dash[1].trim()}`;
  entries.push({
    section: row.section,
    domain: host,
    name: NAME_OVERRIDE[host] || name || null,
    tag: row.tag || (row.section === 8 ? "yellow" : "green"),
    fileDomain: FILE_DOMAIN_ALIAS[host] || host,
    notes: note,
  });
}

// section 8: reliability-rating references, no trust tag in the file.
// Tagged yellow (methodology debated / commercial) and noted as such.
for (const [domain, note] of [
  ["mbfc.news", "Section 8 reliability-rating reference, not evidence; methodology debated."],
  ["newsguardtech.com", "Section 8 reliability-rating reference, not evidence; commercial, paid access."],
  ["adfontesmedia.com", "Section 8 reliability-rating reference, not evidence."],
]) {
  entries.push({
    section: 8,
    domain,
    name: NAME_OVERRIDE[domain],
    tag: "yellow",
    fileDomain: FILE_DOMAIN_ALIAS[domain] || domain,
    notes: note,
  });
}

// de-duplicate (same host + name listed twice keeps one entry)
const seen = new Map();
for (const e of entries) {
  const k = `${e.domain}::${e.name}`;
  if (!seen.has(k)) seen.set(k, e);
}
const final = [...seen.values()];

// fill missing display names with a readable heuristic
function titleish(host) {
  const label = host.split(".").slice(0, -1).join(".").replace(/[-_]/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
let unnamed = 0;
for (const e of final) {
  if (!e.name) {
    e.name = titleish(e.domain);
    e.autoName = true;
    unnamed++;
  }
}

const targets = [...new Set(final.map((e) => e.fileDomain))].sort();
writeFileSync(
  path.join(here, "work/plan.json"),
  JSON.stringify({ entries: final, targets }, null, 2),
);
console.log(
  `entries: ${final.length}  unique fetch targets: ${targets.length}  auto-named: ${unnamed}`,
);
