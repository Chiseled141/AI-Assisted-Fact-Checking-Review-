"""Cache party identity images locally. Run manually; review manifest changes before publishing.

party-sites.tsv supplies country-scoped names, aliases and party website domains.
Prefer an election authority's supplied logo. Otherwise cache the party site's icon
from Google's favicon service. Missing or generic icons stay missing. Never fetch
party images at app runtime. Rights remain with the parties and credited sources.
"""
import concurrent.futures
import csv
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
from datetime import date
import re
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'party-logos'
OUT.mkdir(exist_ok=True, parents=True)
CANADA = {
    'Liberal Party of Canada': 'lib.jpg', 'Conservative Party of Canada': 'cp.gif',
    'Bloc Québécois': 'bloc.gif', 'New Democratic Party': 'ndp.gif',
    'Green Party of Canada': 'green.gif', "People's Party of Canada": 'PPC2_BI.jpg',
}
UNSUITABLE_IMAGES = {'au-pauline-hanson-s-one-nation', 'au-jacqui-lambie-network', 'il-israeli-labor-party'}
ELECTIONS_CA = 'https://www.elections.ca/content.aspx?section=pol&dir=par&document=index&lang=e'
UA = 'ClaimTrace/0.1 (university project; image source attribution in party-logos/manifest.json)'


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=12) as r:
        content = r.read(2_000_001)
        return content, r.headers.get('Content-Type', '').split(';')[0], r.geturl()


def image_extension(data):
    if data.startswith(b'\x89PNG\r\n\x1a\n'): return 'png'
    if data.startswith((b'GIF87a', b'GIF89a')): return 'gif'
    if data.startswith(b'\xff\xd8\xff'): return 'jpg'
    if data.startswith(b'\x00\x00\x01\x00'): return 'ico'
    if re.search(rb'<svg\b', data[:2000]): return 'svg'
    return None


def slug(text):
    import unicodedata
    return re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode().lower()).strip('-')


# A generic globe or a service fallback must not be presented as a party logo.
GENERIC_HASHES = {
    # CMS/service icons shared by unrelated websites.
    "ea24570dd7740951432738e3db4477babeb01173f43f3f2d4e970aca1c3223bb",
    "5271f9e54cf1768d83ebab84f56e2a6b66e1aa3c9d13485d6b106da8eafa1c04",
    "2c5afe10de3355423ed2a1eefb0d80e58feb862e980487890c869bafa544cc07",

}
for domain in ['example.com', 'claimtrace-no-such-party.invalid']:
    try:
        data, _, _ = get('https://www.google.com/s2/favicons?' + urllib.parse.urlencode({'domain': domain, 'sz': 128}))
        GENERIC_HASHES.add(hashlib.sha256(data).hexdigest())
    except (OSError, ValueError):
        pass


class Icons(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == 'link' and 'icon' in attrs.get('rel', '').lower() and attrs.get('href'):
            self.urls.append(attrs['href'])


def download(row):
    country, name, domain, alias_text = row
    ident = country.lower() + '-' + slug(name)
    aliases = list(dict.fromkeys([name, *alias_text.split(',')]))
    record = {'country': country, 'id': ident, 'name': name, 'aliases': aliases,
              'website': 'https://' + domain, 'retrievedAt': date.today().isoformat()}
    if ident in UNSUITABLE_IMAGES:
        return {**record, 'missingAsset': True, 'reviewNote': 'Site icon is a portrait or successor mark, not this party logo.'}
    # Preserve a successful, reviewed download on subsequent runs.
    if ident in previous and previous[ident].get('website') == record['website']:
        old = previous[ident]
        if old.get('asset') and (OUT / old['asset']).is_file():
            return {**record, **{k: v for k, v in old.items() if k not in record}, 'retrievedAt': old['retrievedAt']}
    urls = []
    if country == 'CA' and name in CANADA:
        urls.append(('https://www.elections.ca/pol/par/images/' + CANADA[name], 'logo', ELECTIONS_CA))
    urls.append(('https://www.google.com/s2/favicons?' + urllib.parse.urlencode({'domain': domain, 'sz': 128}),
                 'site-icon', record['website']))
    urls.append(('https://icons.duckduckgo.com/ip3/' + domain + '.ico', 'site-icon', record['website']))
    urls.append((record['website'] + '/favicon.ico', 'site-icon', record['website']))
    for url, representation, source in urls:
        try:
            data, mime, final_url = get(url)
            if not data or len(data) > 2_000_000 or hashlib.sha256(data).hexdigest() in GENERIC_HASHES:
                continue
            extension = image_extension(data)
            if not extension:
                continue
            if extension == 'svg' and re.search(rb'<\s*(script|foreignObject)\b|(?:href|src)\s*=\s*[\x22\x27]\s*(?:https?:|//|javascript:)', data, re.I):
                continue
            asset = ident + '.' + extension
            (OUT / asset).write_bytes(data)
            return {**record, 'asset': asset, 'representation': representation,
                    'sourceUrl': source, 'downloadUrl': final_url,
                    'rights': 'Identity artwork belongs to the named party; supplied unmodified for identification.'}
        except (OSError, ValueError):
            continue
    # Cache the icon declared by the party's own website when search caches have none.
    try:
        html, mime, final_site = get(record['website'])
        parser = Icons()
        if mime == 'text/html':
            parser.feed(html.decode('utf8', errors='replace'))
        for href in parser.urls[:4]:
            url = urllib.parse.urljoin(final_site, href)
            parts = urllib.parse.urlsplit(url)
            if parts.scheme != 'https' or not parts.hostname or parts.hostname in {'localhost', '127.0.0.1'}:
                continue
            try:
                data, mime, final_url = get(url)
                extension = image_extension(data)
                if not extension or len(data) > 2_000_000 or hashlib.sha256(data).hexdigest() in GENERIC_HASHES:
                    continue
                if extension == 'svg' and re.search(rb'<\s*(script|foreignObject)\b|(?:href|src)\s*=\s*[\x22\x27]\s*(?:https?:|//|javascript:)', data, re.I):
                    continue
                asset = ident + '.' + extension
                (OUT / asset).write_bytes(data)
                return {**record, 'asset': asset, 'representation': 'site-icon', 'sourceUrl': final_site,
                        'downloadUrl': final_url, 'rights': 'Identity artwork belongs to the named party.'}
            except (OSError, ValueError):
                continue
    except (OSError, ValueError):
        pass
    return {**record, 'missingAsset': True}


if __name__ == '__main__':
    manifest = OUT / 'manifest.json'
    previous = {r['id']: r for r in json.loads(manifest.read_text())['parties']} if manifest.exists() else {}
    with (ROOT / 'scripts' / 'party-sites.tsv').open() as f:
        rows = list(csv.reader(f, delimiter='\t'))
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        parties = list(pool.map(download, rows))
    manifest.write_text(json.dumps({'countries': list(dict.fromkeys(r[0] for r in rows)), 'parties': parties},
                                   ensure_ascii=False, indent=2) + '\n')
    generated = [{k: r[k] for k in ['country', 'id', 'name', 'aliases', 'asset'] if k in r} for r in parties]
    (ROOT / 'src' / 'data' / 'partyRegistry.generated.ts').write_text(
        '// Generated by scripts/sync-party-logos.py. Attribution: public/party-logos/manifest.json.\n'
        'export const partyRegistry = ' + json.dumps(generated, ensure_ascii=False, separators=(',', ':')) + ';\n')
    missing = [r['id'] for r in parties if not r.get('asset')]
    print(json.dumps({'parties': len(parties), 'assets': len(parties) - len(missing), 'missing': missing}), flush=True)
