# Codex prompt: check and regenerate the ClaimTrace source logos

Copy everything below this line into Codex, running from the repository root.

---

## Task

ClaimTrace is a fact-checking web app. Each evidence source shows a small logo beside its name. Look at every logo image in the project, compare it with the organisation it is meant to represent, and regenerate a clean file for any logo that is wrong, missing, blurry, or badly cropped.

"Regenerate" means producing a clean file from the organisation's real, official logo artwork. **Never draw, imitate, approximate, or AI-generate a logo.** If you can't find the real artwork, leave that source without a logo and report it. The app then shows a letter badge, which is better than a wrong logo.

## Files

| Path | What it is |
|---|---|
| `frontend/public/source-logos/` | The logo images |
| `frontend/public/source-logos/manifest.json` | One record per source: domain, name, file, size, origin URL, method, status, notes |
| `frontend/src/data/sourceRegistry.ts` | **What the app actually reads.** A source only shows a logo if its row here has `logo: '<file name>'` |
| `frontend/src/components/SourceLogo.tsx` | How logos are displayed (read it; don't change it) |
| `TRUSTED_SOURCES.md` | The human-readable source list (don't change it) |

## How logos are displayed

- On a source card: 24 px tall, up to 96 px wide, on a small white tile placed over a photo.
- On the Sources page: 40 px tall in an 80 px wide slot, on a white card.
- Both are shown at up to 3× on sharp screens, and always on white. A logo must be clearly visible on white and readable at 24 px tall.

## Step 1: back up

The logo folder is not in git, so overwritten files can't be recovered. Before changing anything, copy `frontend/public/source-logos/` to `frontend/scripts/source-logos/originals-before-regeneration/`.

## Step 2: read every logo

Open and actually look at every image file; don't rely on file names or the manifest. For each one, confirm:

1. It is this organisation's own logo, not a parent company, partner, web developer, advertisement, sub-brand, section logo, or generic icon. Earlier passes wrongly saved menu icons, house icons, and vendor logos.
2. It is current, as far as you can tell from the official site.
3. It is clearly visible on white, not white-on-transparent.
4. It is not surrounded by large empty margins that make it tiny.
5. It is sharp at the display sizes above.

Build a contact sheet to help with this if you like, but keep it out of `frontend/public/`.

## Step 3: replace these first

These problems are already confirmed.

### Wrong logo: the app currently hides these

| Domain | Name | What the file wrongly shows |
|---|---|---|
| cnn.com | CNN | Stellar logo |
| snopes.com | Snopes | an "Ad" icon |
| fao.org | FAO | UN goal "No Poverty" icon |
| icrc.org | ICRC | a house icon |
| kinhtedothi.vn | Kinh tế & Đô thị | a house icon |
| dsvn.vn | Đường sắt Việt Nam | FPT logo |
| vass.gov.vn | Viện Hàn lâm KHXH Việt Nam | VOV logo |
| pbs.org | PBS | PBS Kids logo |
| vietnamnews.vn | Vietnam News | Asia News Network logo |
| vietnamnet.vn | VietnamNet | its "Premium" section logo |
| ictnews.vietnamnet.vn | ICTNews | its "Premium" section logo |
| wikipedia.org | Wikipedia | Wikimedia Foundation logo |
| reporterslab.duke.edu | Duke Reporters' Lab | an unrelated arrow icon |
| ftu.edu.vn | Đại học Ngoại thương | an accreditation badge |

### National emblem used as a stand-in: the app currently hides these

These sites were unreachable, so the Vietnamese national emblem was saved in their place. Find each organisation's own logo. Use the emblem only if that organisation's official site really uses it as its logo, and say so in `notes`.

| Domain | Name |
|---|---|
| ciem.org.vn | CIEM |
| igp-vast.vn | Viện Vật lý Địa cầu |
| mod.gov.vn | Bộ Quốc phòng |
| monre.gov.vn | Bộ Nông nghiệp và Môi trường |
| most.gov.vn | Bộ Khoa học và Công nghệ |
| qdnd.vn | Quân đội nhân dân |
| quochoi.vn | Quốc hội |
| ssc.gov.vn | Ủy ban Chứng khoán Nhà nước |
| vast.vn | Viện Hàn lâm KH&CN Việt Nam |
| vinamarine.gov.vn | Cục Hàng hải Việt Nam |
| vncdc.gov.vn | Cục Y tế dự phòng |
| vr.org.vn | Cục Đăng kiểm Việt Nam |

### No logo at all

| Domain | Name |
|---|---|
| baomoi.vn | Báo Mới |
| hanoitimes.vn | Hanoi Times |
| khonggianmang.vn | Không gian mạng |
| nih.gov | NIH |
| presstv.ir | Press TV |
| pubmed.ncbi.nlm.nih.gov | PubMed |
| rt.com | RT |
| sputniknews.com | Sputnik |
| washingtonpost.com | The Washington Post |

### Low resolution or favicon fallback

These work but look soft. Replace them if the official site, press kit, or Wikimedia Commons has a better version.

| Domain | Name | Current file | Size (px) | Method |
|---|---|---|---|---|
| asean.org | ASEAN | `asean-org.png` | 128×128 | google-favicon-fallback |
| baocantho.com.vn | Báo Cần Thơ | `baocantho-com-vn.png` | 16×16 | favicon |
| bmj.com | The BMJ | `bmj-com.png` | 16×16 | google-favicon-fallback |
| britannica.com | Encyclopædia Britannica | `britannica-com.png` | 48×48 | google-favicon-fallback |
| congress.gov | Congress.gov | `congress-gov.png` | 16×16 | google-favicon-fallback |
| customs.gov.vn | Tổng cục Hải quan | `customs-gov-vn.png` | 32×32 | apple-touch-icon |
| data.imf.org | IMF Data | `data-imf-org.png` | 128×128 | google-favicon-fallback |
| data.un.org | UN Data | `data-un-org.png` | 50×50 | apple-touch-icon |
| demagog.org.pl | Demagog | `demagog-org-pl.png` | 128×128 | google-favicon-fallback |
| edmo.eu | EDMO | `edmo-eu.png` | 128×128 | google-favicon-fallback |
| eur-lex.europa.eu | EUR-Lex | `eur-lex-europa-eu.png` | 16×16 | favicon |
| facebook.com | Facebook | `facebook-com.png` | 128×128 | google-favicon-fallback |
| fred.stlouisfed.org | FRED | `fred-stlouisfed-org.png` | 16×16 | google-favicon-fallback |
| freedomhouse.org | Freedom House | `freedomhouse-org.png` | 128×128 | google-favicon-fallback |
| ft.com | Financial Times | `ft-com.png` | 128×128 | google-favicon-fallback |
| hanoimetro.net.vn | Hanoi Metro | `hanoimetro-net-vn.png` | 32×32 | favicon |
| hnx.vn | Sở Giao dịch Chứng khoán Hà Nội | `hnx-vn.png` | 32×32 | google-favicon-fallback |
| hsx.vn | Sở Giao dịch Chứng khoán TP.HCM | `hsx-vn.png` | 16×16 | google-favicon-fallback |
| iea.org | IEA | `iea-org.png` | 128×128 | google-favicon-fallback |
| ipcc.ch | IPCC | `ipcc-ch.png` | 128×128 | google-favicon-fallback |
| laodong.vn | Lao Động | `laodong-vn.png` | 128×128 | google-favicon-fallback |
| law.cornell.edu | Cornell LII | `law-cornell-edu.png` | 32×32 | favicon |
| luatvietnam.vn | Luật Việt Nam | `luatvietnam-vn.png` | 198×54 | site-header |
| mae.gov.vn | Bộ Nông nghiệp và Môi trường | `mae-gov-vn.png` | 31×32 | favicon |
| medium.com | Medium | `medium-com.png` | 128×128 | google-favicon-fallback |
| medrxiv.org | medRxiv | `medrxiv-org.png` | 32×32 | google-favicon-fallback |
| mofa.gov.vn | Bộ Ngoại giao | `mofa-gov-vn.png` | 32×32 | apple-touch-icon |
| moj.gov.vn | Bộ Tư pháp | `moj-gov-vn.png` | 128×128 | google-favicon-fallback |
| mpi.gov.vn | Bộ Kế hoạch và Đầu tư | `mpi-gov-vn.png` | 16×16 | google-favicon-fallback |
| mps.gov.vn | Bộ Công an | `mps-gov-vn.png` | 48×48 | favicon |
| nejm.org | NEJM | `nejm-org.png` | 128×128 | google-favicon-fallback |
| newsmax.com | Newsmax | `newsmax-com.png` | 48×48 | google-favicon-fallback |
| newtral.es | Newtral | `newtral-es.png` | 128×128 | google-favicon-fallback |
| nhandan.vn | Nhân Dân | `nhandan-vn.png` | 16×16 | favicon |
| nytimes.com | The New York Times | `nytimes-com.png` | 128×128 | google-favicon-fallback |
| pesacheck.org | PesaCheck | `pesacheck-org.png` | 128×128 | google-favicon-fallback |
| quora.com | Quora | `quora-com.png` | 128×128 | google-favicon-fallback |
| reddit.com | Reddit | `reddit-com.png` | 128×128 | google-favicon-fallback |
| science.org | Science | `science-org.png` | 128×128 | google-favicon-fallback |
| sggp.org.vn | Sài Gòn Giải Phóng | `sggp-org-vn.png` | 125×40 | site-header |
| tapchicongsan.org.vn | Tạp chí Cộng sản | `tapchicongsan-org-vn.png` | 16×16 | favicon |
| teyit.org | Teyit | `teyit-org.png` | 128×128 | google-favicon-fallback |
| thuvienphapluat.vn | Thư viện Pháp luật | `thuvienphapluat-vn.png` | 128×128 | google-favicon-fallback |
| toolbox.google.com | Google Fact Check Tools | `google-com.png` | 32×32 | favicon |
| vepr.org.vn | VEPR | `vepr-org-vn.png` | 16×16 | google-favicon-fallback |
| vista.gov.vn | Cục Thông tin KH&CN Quốc gia | `vista-gov-vn.png` | 128×128 | google-favicon-fallback |
| vja.org.vn | Hội Nhà báo Việt Nam | `vja-org-vn.png` | 16×16 | google-favicon-fallback |
| vjol.info.vn | Vietnam Journals Online | `vjol-info-vn.png` | 48×48 | google-favicon-fallback |
| vov.vn | VOV | `vov-vn.png` | 48×48 | google-favicon-fallback |
| voz.vn | VOZ | `voz-vn.png` | 128×128 | google-favicon-fallback |
| vss.gov.vn | Bảo hiểm xã hội Việt Nam | `vss-gov-vn.png` | 16×16 | google-favicon-fallback |
| web.archive.org | Internet Archive | `web-archive-org.png` | 32×32 | favicon |
| webtretho.com | Webtretho | `webtretho-com.png` | 48×40 | google-favicon-fallback |
| wsj.com | The Wall Street Journal | `wsj-com.png` | 128×128 | google-favicon-fallback |
| wto.org | WTO | `wto-org.png` | 48×48 | favicon |
| x.com | X | `x-com.png` | 128×128 | google-favicon-fallback |

### Too much empty space

`e-vnexpress-net.png` is a social-share image with big margins, so `e.vnexpress.net` currently borrows `vnexpress-net.svg`. Check all other logos for the same problem, and also check `vnexpress-net.svg`, whose tagline is unreadable when small.

## Where to get artwork, in order

1. The organisation's own press, brand, or media-kit page.
2. The logo in the site's header or footer (inline SVG or image).
3. The site's largest declared icon (`apple-touch-icon`, web manifest).
4. The organisation's logo file on Wikimedia Commons or its Wikipedia page. Check that it is current.

Don't use the Google favicon service for new files. It is the source of most of the blurry logos above.

## Cleaning rules

Allowed:

- Crop away empty margins, leaving roughly 4% padding.
- Remove a plain solid background to make it transparent.
- Resize in proportion, and convert file formats.
- Use the organisation's own icon or compact version when the full wordmark is unreadable at 24 px.
- For a white-only logo, use the organisation's own dark or coloured version if one exists.

Not allowed:

- Redrawing, tracing by hand, or generating a logo with AI.
- Recolouring, retouching, stretching, or adding effects or backgrounds.
- Changing any wording or proportions in the logo.

## File requirements

- Prefer SVG. Otherwise use PNG at least 120 px tall, with a transparent or white background.
- Keep each file under 100 KB where possible. Compress PNGs and shrink images embedded in SVGs.
- For SVGs, strip `<script>`, event handler attributes such as `onload`, and external references. Give the root element a `viewBox`.
- Keep the existing naming: the domain with dots replaced by hyphens, for example `vnexpress-net.svg`.
- If a new file has a different extension, delete the old one so nothing is orphaned.
- Sources that share an organisation may share one file.

## Update the data

For each logo you add, replace, or remove:

1. Update its row in `frontend/public/source-logos/manifest.json`, keeping the same fields: `file`, `format`, `width`, `height`, `origin_url` (the exact download URL), `method`, `status`, and `notes`. Set `status` to `ok`, `low-resolution`, `not-found`, or `needs-review`.
2. Update its row in `frontend/src/data/sourceRegistry.ts`: add, change, or remove only the `logo` field. **A new logo won't appear in the app without this.**
3. Add a manifest row for `rt.com`, `sputniknews.com`, and `presstv.ir` if you find their logos.

Don't change any source's `name`, `trust`, or `about` values.

## Rules

- **Never visit or download anything from these domains:** infowars.com, naturalnews.com, beforeitsnews.com, thegatewaypundit.com, mercola.com, dailymail.co.uk, thesun.co.uk, theepochtimes.com, breitbart.com, zerohedge.com.
- Download only image files, and never run anything you download.
- Respect robots.txt and wait at least 1 second between requests to the same site. Don't log in or bypass paywalls or bot protection. If a site blocks you, try the other sources above, then mark it `needs-review`.
- Confirm you're on the organisation's real domain, not a look-alike. Several Vietnamese ministries and provinces were reorganised in 2025, so if a domain redirects, follow it, save under the original domain's file name, and record the new domain in `notes`.
- Logos remain their owners' trademarks and are used only to identify sources. Note any stated usage restriction in `notes`.
- Change only the logo folder, the manifest, `sourceRegistry.ts`, and the backup and report files. Don't change app code or tests.
- Don't commit or push.

## Check your work

From `frontend/`, run these and make sure they pass:

```bash
npm run typecheck
```

```bash
npm test
```

Then confirm that:

- `manifest.json` is valid JSON, and every `file` in it exists on disk.
- Every `logo` in `sourceRegistry.ts` exists on disk, and no red-rated source has one.
- No image in the folder is left unused.

## Report

Write `frontend/scripts/source-logos/REGENERATION_REPORT.md` containing:

1. Counts: checked, kept, replaced, added, removed, still missing.
2. A table of every change: domain, old file, new file, size, and where the artwork came from.
3. Every source still without a logo, and why.
4. Any logo you're unsure about, for a human to check.
5. Domains that redirected to a new address.
6. The results of the checks above.
