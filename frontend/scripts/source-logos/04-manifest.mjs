// Assemble frontend/public/source-logos/manifest.json from the plan and the
// fetch results. Manual fixes live in work/overrides.json (domain -> fields).
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../../public/source-logos");
const plan = JSON.parse(readFileSync(path.join(here, "work/plan.json"), "utf8"));
const results = JSON.parse(readFileSync(path.join(here, "work/results.json"), "utf8"));
const overrides = existsSync(path.join(here, "work/overrides.json"))
  ? JSON.parse(readFileSync(path.join(here, "work/overrides.json"), "utf8"))
  : {};

const ALLOWED_METHODS = new Set([
  "press-kit",
  "site-header",
  "apple-touch-icon",
  "favicon",
  "wikimedia-commons",
  "google-favicon-fallback",
]);

// names the site's own markup cannot supply (dead / blocked hosts, and brands
// whose og:site_name is just the domain)
const NAMES = {
  "vtv.vn": "VTV",
  "vov.vn": "VOV",
  "nhandan.vn": "Nhân Dân",
  "qdnd.vn": "Quân đội nhân dân",
  "vnexpress.net": "VnExpress",
  "tuoitre.vn": "Tuổi Trẻ",
  "thanhnien.vn": "Thanh Niên",
  "dantri.com.vn": "Dân Trí",
  "vietnamnet.vn": "VietnamNet",
  "tienphong.vn": "Tiền Phong",
  "laodong.vn": "Lao Động",
  "nld.com.vn": "Người Lao Động",
  "plo.vn": "Pháp Luật TP.HCM",
  "thethaovanhoa.vn": "Thể thao & Văn hóa",
  "baovanhoa.vn": "Báo Văn hóa",
  "vietnamfinance.vn": "VietnamFinance",
  "cafef.vn": "CafeF",
  "vneconomy.vn": "VnEconomy",
  "baodautu.vn": "Báo Đầu tư",
  "thesaigontimes.vn": "The Saigon Times",
  "nhadautu.vn": "Nhà Đầu tư",
  "baophapluat.vn": "Báo Pháp luật Việt Nam",
  "tapchicongsan.org.vn": "Tạp chí Cộng sản",
  "congthuong.vn": "Công Thương",
  "baohaiquan.vn": "Báo Hải quan",
  "baoxaydung.vn": "Báo Xây dựng",
  "baogiaothong.vn": "Báo Giao thông",
  "baotainguyenmoitruong.vn": "Tài nguyên & Môi trường",
  "tapchitaichinh.vn": "Tạp chí Tài chính",
  "thanhtra.com.vn": "Báo Thanh tra",
  "vtc.vn": "VTC",
  "htv.com.vn": "HTV",
  "thvl.vn": "THVL",
  "sggp.org.vn": "Sài Gòn Giải Phóng",
  "hanoimoi.vn": "Hà Nội Mới",
  "kinhtedothi.vn": "Kinh tế & Đô thị",
  "baodanang.vn": "Báo Đà Nẵng",
  "baohaiphong.vn": "Báo Hải Phòng",
  "baocantho.com.vn": "Báo Cần Thơ",
  "baoquangninh.vn": "Báo Quảng Ninh",
  "baodongnai.com.vn": "Báo Đồng Nai",
  "baothanhhoa.vn": "Báo Thanh Hóa",
  "baotintuc.vn": "Báo Tin tức (VNA)",
  "vietnamplus.vn": "VietnamPlus (VNA)",
  "cand.com.vn": "Công an nhân dân",
  "congan.com.vn": "Báo Công an",
  "kiemsat.vn": "Kiểm sát",
  "suckhoedoisong.vn": "Sức khỏe & Đời sống",
  "giaoducthoidai.vn": "Giáo dục & Thời đại",
  "nongnghiep.vn": "Báo Nông nghiệp",
  "chinhphu.vn": "Chính phủ",
  "baochinhphu.vn": "Báo Chính phủ",
  "quochoi.vn": "Quốc hội",
  "vbpl.vn": "Cơ sở dữ liệu pháp luật",
  "dichvucong.gov.vn": "Cổng Dịch vụ công",
  "data.gov.vn": "Dữ liệu mở Quốc gia",
  "moh.gov.vn": "Bộ Y tế",
  "moet.gov.vn": "Bộ Giáo dục và Đào tạo",
  "monre.gov.vn": "Bộ Nông nghiệp và Môi trường",
  "moc.gov.vn": "Bộ Xây dựng",
  "mps.gov.vn": "Bộ Công an",
  "mpi.gov.vn": "Bộ Kế hoạch và Đầu tư",
  "moit.gov.vn": "Bộ Công Thương",
  "mofa.gov.vn": "Bộ Ngoại giao",
  "moj.gov.vn": "Bộ Tư pháp",
  "most.gov.vn": "Bộ Khoa học và Công nghệ",
  "mod.gov.vn": "Bộ Quốc phòng",
  "moha.gov.vn": "Bộ Nội vụ",
  "bvhttdl.gov.vn": "Bộ Văn hóa, Thể thao và Du lịch",
  "mae.gov.vn": "Bộ Nông nghiệp và Môi trường",
  "mof.gov.vn": "Bộ Tài chính",
  "sbv.gov.vn": "Ngân hàng Nhà nước",
  "gdt.gov.vn": "Tổng cục Thuế",
  "customs.gov.vn": "Tổng cục Hải quan",
  "nso.gov.vn": "Tổng cục Thống kê",
  "vss.gov.vn": "Bảo hiểm xã hội Việt Nam",
  "toaan.gov.vn": "Tòa án nhân dân tối cao",
  "vksndtc.gov.vn": "Viện kiểm sát nhân dân tối cao",
  "sav.gov.vn": "Kiểm toán Nhà nước",
  "thanhtra.gov.vn": "Thanh tra Chính phủ",
  "vncdc.gov.vn": "Cục Y tế dự phòng",
  "kcb.vn": "Cục Quản lý Khám, chữa bệnh",
  "vfa.gov.vn": "Cục An toàn thực phẩm",
  "dav.gov.vn": "Cục Quản lý Dược",
  "nihe.org.vn": "Viện Vệ sinh Dịch tễ",
  "nchmf.gov.vn": "Trung tâm Dự báo Khí tượng Thủy văn",
  "imh.ac.vn": "Viện Khí tượng Thủy văn",
  "igp-vast.vn": "Viện Vật lý Địa cầu",
  "drvn.gov.vn": "Cục Đường bộ Việt Nam",
  "caa.gov.vn": "Cục Hàng không Việt Nam",
  "vinamarine.gov.vn": "Cục Hàng hải Việt Nam",
  "vr.org.vn": "Cục Đăng kiểm Việt Nam",
  "ssc.gov.vn": "Ủy ban Chứng khoán Nhà nước",
  "hsx.vn": "Sở Giao dịch Chứng khoán TP.HCM",
  "hnx.vn": "Sở Giao dịch Chứng khoán Hà Nội",
  "hanoi.gov.vn": "Cổng thông tin Hà Nội",
  "hochiminhcity.gov.vn": "Cổng thông tin TP.HCM",
  "danang.gov.vn": "Cổng thông tin Đà Nẵng",
  "haiphong.gov.vn": "Cổng thông tin Hải Phòng",
  "cantho.gov.vn": "Cổng thông tin Cần Thơ",
  "quangninh.gov.vn": "Cổng thông tin Quảng Ninh",
  "dongnai.gov.vn": "Cổng thông tin Đồng Nai",
  "hanoimetro.net.vn": "Hanoi Metro",
  "dsvn.vn": "Đường sắt Việt Nam",
  "evn.com.vn": "EVN",
  "pvn.vn": "Petrovietnam",
  "vass.gov.vn": "Viện Hàn lâm KHXH Việt Nam",
  "vast.vn": "Viện Hàn lâm KH&CN Việt Nam",
  "ciem.org.vn": "CIEM",
  "vepr.org.vn": "VEPR",
  "vnu.edu.vn": "Đại học Quốc gia Hà Nội",
  "hust.edu.vn": "Đại học Bách khoa Hà Nội",
  "neu.edu.vn": "Đại học Kinh tế Quốc dân",
  "ftu.edu.vn": "Đại học Ngoại thương",
  "vjol.info.vn": "Vietnam Journals Online",
  "vista.gov.vn": "Cục Thông tin KH&CN Quốc gia",
  "vcci.com.vn": "VCCI",
  "vja.org.vn": "Hội Nhà báo Việt Nam",
  "thuvienphapluat.vn": "Thư viện Pháp luật",
  "luatvietnam.vn": "Luật Việt Nam",
  "tinnhiemmang.vn": "Tín nhiệm mạng",
  "khonggianmang.vn": "Không gian mạng",
  "znews.vn": "Zing News",
  "baoquocte.vn": "Thế giới & Việt Nam",
  "ictnews.vietnamnet.vn": "ICTNews",
  "baomoi.vn": "Báo Mới",
  "kenh14.vn": "Kenh14",
  "voz.vn": "VOZ",
  "webtretho.com": "Webtretho",
  "congbao.chinhphu.vn": "Công báo",
  "thanhnien.vn/english": "Thanh Niên (English)",
  "hanoitimes.vn": "Hanoi Times",
  "vietnamnews.vn": "Vietnam News",
  "tuoitrenews.vn": "Tuoi Tre News",
  "e.vnexpress.net": "VnExpress International",
  "en.vietnamplus.vn": "VietnamPlus English",
};

// the same domain can appear as two distinct sources in TRUSTED_SOURCES.md
const NAME_EXACT = {
  "reuters.com::Reuters": "Reuters",
  "reuters.com::Reuters Fact Check": "Reuters Fact Check",
  "apnews.com::Apnews": "Associated Press",
  "apnews.com::AP Fact Check": "AP Fact Check",
  "bbc.com::Bbc": "BBC",
  "bbc.com::BBC Verify": "BBC Verify",
  "rappler.com::Rappler": "Rappler",
  "rappler.com::Rappler fact check": "Rappler Fact Check",
  "factcheck.afp.com::AFP Fact Check": "AFP Fact Check",
  "ifcncodeofprinciples.poynter.org::IFCN Signatories List": "IFCN Signatories List",
  "reporterslab.duke.edu::Duke Reporters' Lab": "Duke Reporters' Lab",
  "toolbox.google.com::Google Fact Check Tools": "Google Fact Check Tools",
  "pubmed.ncbi.nlm.nih.gov::PubMed": "PubMed",
  "ictnews.vietnamnet.vn::Ictnews.vietnamnet": "ICTNews",
  "en.vietnamplus.vn::Vietnam News Agency (English)": "VietnamPlus English",
  "ec.europa.eu::eurostat": "Eurostat",
};

const NAME_EXTRA = {
  "vir.com.vn": "Vietnam Investment Review",
  "dangcongsan.vn": "Đảng Cộng sản Việt Nam",
  "reuters.com": "Reuters",
  "apnews.com": "Associated Press",
  "bbc.com": "BBC",
  "aljazeera.com": "Al Jazeera",
  "dw.com": "Deutsche Welle",
  "npr.org": "NPR",
  "theguardian.com": "The Guardian",
  "nytimes.com": "The New York Times",
  "wsj.com": "The Wall Street Journal",
  "straitstimes.com": "The Straits Times",
  "asia.nikkei.com": "Nikkei Asia",
  "washingtonpost.com": "The Washington Post",
  "ft.com": "Financial Times",
  "economist.com": "The Economist",
  "bloomberg.com": "Bloomberg",
  "cnn.com": "CNN",
  "pbs.org": "PBS",
  "france24.com": "France 24",
  "abc.net.au": "ABC News (Australia)",
  "propublica.org": "ProPublica",
  "theconversation.com": "The Conversation",
  "scmp.com": "South China Morning Post",
  "channelnewsasia.com": "CNA",
  "japantimes.co.jp": "The Japan Times",
  "koreaherald.com": "The Korea Herald",
  "bangkokpost.com": "Bangkok Post",
  "thejakartapost.com": "The Jakarta Post",
  "rappler.com": "Rappler",
  "worldbank.org": "World Bank",
  "imf.org": "IMF",
  "oecd.org": "OECD",
  "unicef.org": "UNICEF",
  "fao.org": "FAO",
  "ilo.org": "ILO",
  "wto.org": "WTO",
  "adb.org": "ADB",
  "iea.org": "IEA",
  "ipcc.ch": "IPCC",
  "data.un.org": "UN Data",
  "data.europa.eu": "EU Open Data Portal",
  "data.imf.org": "IMF Data",
  "ourworldindata.org": "Our World in Data",
  "federalreserve.gov": "Federal Reserve",
  "ecb.europa.eu": "European Central Bank",
  "fred.stlouisfed.org": "FRED",
  "cdc.gov": "CDC",
  "nih.gov": "NIH",
  "fda.gov": "FDA",
  "census.gov": "U.S. Census Bureau",
  "bls.gov": "Bureau of Labor Statistics",
  "nasa.gov": "NASA",
  "noaa.gov": "NOAA",
  "usgs.gov": "USGS",
  "epa.gov": "EPA",
  "congress.gov": "Congress.gov",
  "gov.uk": "GOV.UK",
  "ons.gov.uk": "Office for National Statistics",
  "nhs.uk": "NHS",
  "ema.europa.eu": "European Medicines Agency",
  "ecdc.europa.eu": "ECDC",
  "eur-lex.europa.eu": "EUR-Lex",
  "legislation.gov.uk": "UK Legislation",
  "law.cornell.edu": "Cornell LII",
  "rsf.org": "Reporters Without Borders",
  "w3.org": "W3C",
  "ietf.org": "IETF",
  "snopes.com": "Snopes",
  "politifact.com": "PolitiFact",
  "factcheck.org": "FactCheck.org",
  "fullfact.org": "Full Fact",
  "leadstories.com": "Lead Stories",
  "logically.com": "Logically Facts",
  "africacheck.org": "Africa Check",
  "checkyourfact.com": "Check Your Fact",
  "maldita.es": "Maldita.es",
  "newtral.es": "Newtral",
  "correctiv.org": "CORRECTIV",
  "lemonde.fr": "Les Décodeurs (Le Monde)",
  "tfc.org.tw": "Taiwan FactCheck Center",
  "cekfakta.com": "CekFakta",
  "boomabovehoax.com": "BOOM Above Hoax",
  "pagellapolitica.it": "Pagella Politica",
  "demagog.org.pl": "Demagog",
  "teyit.org": "Teyit",
  "factly.in": "Factly",
  "pesacheck.org": "PesaCheck",
  "aosfatos.org": "Aos Fatos",
  "chequeado.com": "Chequeado",
  "edmo.eu": "EDMO",
  "nature.com": "Nature",
  "science.org": "Science",
  "thelancet.com": "The Lancet",
  "nejm.org": "NEJM",
  "bmj.com": "The BMJ",
  "cochranelibrary.com": "Cochrane Library",
  "britannica.com": "Encyclopædia Britannica",
  "arxiv.org": "arXiv",
  "medrxiv.org": "medRxiv",
  "web.archive.org": "Internet Archive",
  "commoncrawl.org": "Common Crawl",
  "facebook.com": "Facebook",
  "tiktok.com": "TikTok",
  "youtube.com": "YouTube",
  "zalo.me": "Zalo",
  "wikipedia.org": "Wikipedia",
  "reddit.com": "Reddit",
  "quora.com": "Quora",
  "medium.com": "Medium",
  "substack.com": "Substack",
  "x.com": "X",
  "hrw.org": "Human Rights Watch",
  "amnesty.org": "Amnesty International",
  "transparency.org": "Transparency International",
  "freedomhouse.org": "Freedom House",
  "nypost.com": "New York Post",
  "foxnews.com": "Fox News",
  "newsmax.com": "Newsmax",
  "huffpost.com": "HuffPost",
  "buzzfeed.com": "BuzzFeed",
  "vice.com": "Vice",
  "mbfc.news": "Media Bias/Fact Check",
  "newsguardtech.com": "NewsGuard",
  "adfontesmedia.com": "Ad Fontes Media",
  "mpi.gov.vn": "Bộ Kế hoạch và Đầu tư",
  "afp.com": "AFP",
  "asean.org": "ASEAN",
  "iso.org": "ISO",
  "icrc.org": "ICRC",
  "unesco.org": "UNESCO",
};

function cleanName(raw) {
  if (!raw) return null;
  let n = raw.replace(/\s+/g, " ").trim();
  if (!n || n.length > 60) return null;
  if (/^[a-z0-9.-]+$/i.test(n) && n.includes(".")) return null; // bare domain
  if (/^(just a moment|access denied|home|trang chủ|error|403 forbidden)/i.test(n)) return null;
  for (const part of n.split(/\s[|–—-]\s/)) {
    const p = part.trim();
    if (p.length >= 2 && p.length <= 48) return p;
  }
  return n;
}

function heuristic(host) {
  const core = host
    .replace(/^www\./, "")
    .replace(/\.(com|net|org|gov|edu|ac|info|biz)(\.(vn|au|uk|jp|sg|my|id|ph|cn|hk|tw|kr))?$/, "")
    .replace(/\.(vn|int|ch|eu|es|it|pl|tw|in|br|ar|pe|co|ke|ng|za|ma|tn|eg|us|ca|mx|fr|de|uk|au|jp|sg|my|id|ph|cn|hk|kr|il|ir|tr|ru|ua|by|kz|th|lk|np|bd|pk|fj|nz|ws|to|eu|org|com|net|gov|edu|ac|info|dev|me|co|io|news|media|watch|site|online|tv|radio|press|world|today|times|post|report|network|agency|foundation|institute|center|centre|group|fund|bank|exchange|stock|portal|vn)$/i, "");
  const first = core.split(".")[0] || host;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

// explicit usage restrictions worth surfacing next to the badge
const RESTRICTED = {
  "un.org": "UN emblem: use is restricted by UN guidelines.",
  "who.int": "WHO emblem: use is restricted by WHO.",
  "unesco.org": "UNESCO logo: use is restricted by UNESCO.",
  "icrc.org": "Red Cross emblem: protected under the Geneva Conventions; use is restricted.",
  "iso.org": "ISO logo: use requires ISO permission.",
  "europa.eu": "EU emblem: use is governed by EU rules.",
  "ec.europa.eu": "EU emblem: use is governed by EU rules.",
  "asean.org": "ASEAN emblem: use is restricted by ASEAN.",
  "chinhphu.vn": "Vietnamese national emblem: use is restricted by law.",
};

const entries = [];
const redirects = [];
const seenFiles = new Map();

// Removed at the user's request: dead domains that could only appear as
// file-less "no file" cards.
const DROP = new Set([
  "baohaiquan.vn",
  "boomabovehoax.com",
  "data.gov.vn",
  "mbfc.news",
  "tfc.org.tw",
]);

for (const e of plan.entries) {
  if (DROP.has(e.domain)) continue;
  const rec = results[e.fileDomain] || {};
  const c = rec.chosen;
  const ov = overrides[e.domain] || {};
  let file = rec.file || null;
  let format = file ? (file.endsWith(".svg") ? "svg" : "png") : null;
  let width = c?.width ? Math.round(c.width) : 0;
  let height = c?.height ? Math.round(c.height) : 0;
  let originUrl = c?.originUrl || null;
  let method = c?.methodHint || null;
  let status;
  const notes = [];

  if (e.notes) notes.push(e.notes);
  if (rec.deadNote) notes.push(rec.deadNote);
  if (c?.viaWikipedia) notes.push("Wikipedia lead image used; verify it is current.");
  if (rec.resolvedFrom) {
    notes.push(`Redirects to ${rec.resolvedFrom}; logo saved under the original domain.`);
    redirects.push({ from: e.domain, to: rec.resolvedFrom });
  } else if (rec.servedFromWww) notes.push(`Only ${"www." + e.domain} answered; same site.`);
  if (e.fileDomain !== e.domain)
    notes.push(`Shares the ${e.fileDomain} logo (same organisation).`);
  if (c?.commonsTitle) notes.push(`Wikimedia Commons file: ${c.commonsTitle}.`);
  if (c?.sanitized?.length) notes.push(`SVG sanitised (removed ${c.sanitized.join(", ")}).`);
  if (rec.convertedFrom) notes.push(`Converted from ${rec.convertedFrom.toUpperCase()} to PNG (pixels unchanged).`);

  // status ladder
  if (!file) {
    status = rec.failKind === "dead-domain" ? "domain-unreachable" : "not-found";
    if (rec.robotsBlocked || rec.failKind === "blocked" || rec.failKind === "dns-sink")
      status = "needs-review";
    if (rec.fetchError) notes.push(`Fetch failed: ${rec.fetchError}.`);
    if (rec.publicDns === "nxdomain") notes.push("No DNS record (NXDOMAIN) when checked via DNS-over-HTTPS.");
    if (rec.publicDns?.startsWith("ok:")) notes.push(`Domain exists publicly (${rec.publicDns.slice(3)}); not reachable from this network.`);
    if (rec.robotsBlocked) notes.push("robots.txt disallows the site; not crawled.");
  } else {
    const shorter = Math.min(width || 0, height || 0);
    status = "ok";
    if (method === "google-favicon-fallback") {
      status = "low-resolution";
      notes.push("Google favicon service fallback; low-resolution raster.");
    } else if (format === "png" && shorter > 0 && shorter < 128) {
      status = "low-resolution";
      notes.push(`PNG is ${width}x${height}, below the 128 px guideline.`);
    }
    if (rec.robotsBlocked) {
      status = "needs-review";
      notes.push("Site robots.txt disallows fetching; logo obtained via Wikimedia Commons - verify it is current.");
    } else if (rec.failKind === "dns-sink") {
      status = "needs-review";
      notes.push("Domain is blocked by local DNS (resolves to loopback); logo obtained via Wikimedia Commons.");
    } else if (rec.failKind === "blocked") {
      status = "needs-review";
      notes.push("Site returns 403/429 to non-browser clients; logo obtained via Wikimedia Commons or favicon service.");
    } else if (rec.failKind && rec.failKind !== "dead-domain") {
      status = "needs-review";
      notes.push(`Site unreachable (${rec.failKind}); logo from fallback.`);
    }
    if (method === "wikimedia-commons" && !rec.robotsBlocked && !rec.failKind)
      notes.push("Site yielded no usable logo; Wikimedia Commons used.");
  }
  if (originUrl && e.fileDomain === e.domain) {
    try {
      const assetHost = new URL(originUrl).host;
      if (assetHost !== e.domain && !assetHost.endsWith(`.${e.domain}`))
        if (method !== "wikimedia-commons" && method !== "google-favicon-fallback")
          notes.push(`Served from the site's asset host ${assetHost}.`);
    } catch {}
  }
  if (seenFiles.has(rec.file) && rec.file) {
    const owner = seenFiles.get(rec.file);
    if (owner !== e.domain) notes.push(`Same file as ${owner}.`);
  } else if (rec.file) seenFiles.set(rec.file, e.domain);
  if (file && RESTRICTED[e.domain]) notes.push(RESTRICTED[e.domain]);

  // manual override wins
  const merged = {
    domain: e.domain,
    name:
      ov.name ||
      NAME_EXACT[`${e.domain}::${e.name}`] ||
      NAMES[e.domain] ||
      NAME_EXTRA[e.domain] ||
      cleanName(rec.siteName) ||
      cleanName(rec.pageTitle) ||
      e.name ||
      heuristic(e.domain),
    tag: e.tag,
    file: ov.file ?? file,
    format: ov.format ?? format,
    width: ov.width ?? width,
    height: ov.height ?? height,
    origin_url: ov.origin_url ?? originUrl,
    method: ov.method ?? method ?? null,
    status: ov.status ?? status,
    notes: ov.notes ?? notes.join(" "),
  };
  if (merged.method && !ALLOWED_METHODS.has(merged.method)) merged.method = "favicon";
  if (!merged.file) {
    merged.file = null;
    merged.format = null;
    merged.width = 0;
    merged.height = 0;
    merged.origin_url = null;
    merged.method = null;
  }
  entries.push(merged);
}

// stable order: by tag then domain
entries.sort((a, b) => a.tag.localeCompare(b.tag) || a.domain.localeCompare(b.domain));
writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(entries, null, 2) + "\n");

const counts = entries.reduce((acc, e) => ((acc[e.status] = (acc[e.status] || 0) + 1), acc), {});
const files = new Set(entries.map((e) => e.file).filter(Boolean));
console.log("entries", entries.length, "unique files", files.size);
console.log(counts);
console.log("missing on disk:", [...files].filter((f) => !existsSync(path.join(OUT, f))));
console.log("redirects:", redirects.length);
const uniqRedirects = [...new Map(redirects.map((r) => [`${r.from}>${r.to}`, r])).values()];
writeFileSync(path.join(here, "work/redirects.json"), JSON.stringify(uniqRedirects, null, 2));
