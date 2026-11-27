#!/usr/bin/env python3
"""
SG AI Oasis — daily job sync.

For every company in data/companies.json, read its official public careers API
(Greenhouse / Lever / Ashby / SmartRecruiters / Workday / Amazon Jobs / Google /
Eightfold / WorkAtSea / ByteDance / Manus), keep roles located in Singapore,
and merge them into data/jobs.json:

  - new role          -> status "open", firstSeen = today
  - role still listed -> lastVerified = today
  - role missing      -> missCount += 1; closed after CLOSE_AFTER_MISSES runs
  - board unreachable -> that company's roles are left untouched

Categories, seniority and the AI flag are keyword rules: no LLM calls.
If SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, companies and jobs are
also upserted to Supabase. Standard library only.

Usage: python3 scripts/jobs_sync.py [--dry-run]
"""

import http.cookiejar
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMPANIES_PATH = ROOT / 'data' / 'companies.json'
JOBS_PATH = ROOT / 'data' / 'jobs.json'
META_PATH = ROOT / 'data' / 'jobs_meta.json'

SGT = timezone(timedelta(hours=8))
CLOSE_AFTER_MISSES = 2
UA = {'User-Agent': 'sg-ai-oasis/1.0 (+https://github.com/NodeXign/sg-ai-oasis)'}
BROWSER_UA = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/html;q=0.9, */*;q=0.8',
}


def http_raw(url: str, method: str = 'GET', body=None, headers=None, timeout: int = 25, opener=None) -> bytes:
    data = json.dumps(body).encode() if isinstance(body, (dict, list)) else (body.encode() if isinstance(body, str) else body)
    h = {**UA, **(headers or {})}
    if isinstance(body, (dict, list)) and 'Content-Type' not in h:
        h['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    fn = opener.open if opener else urllib.request.urlopen
    with fn(req, timeout=timeout) as resp:
        return resp.read()


def http_json(url: str, method: str = 'GET', body=None, headers=None, timeout: int = 25, opener=None):
    raw = http_raw(url, method=method, body=body, headers=headers, timeout=timeout, opener=opener)
    return json.loads(raw) if raw else None


# ─── Board readers: each returns [{extId, title, location, url, department, postedAt}] ──
def read_greenhouse(token: str) -> list[dict]:
    data = http_json(f'https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=false')
    return [{
        'extId': str(j['id']),
        'title': j.get('title', '').strip(),
        'location': (j.get('location') or {}).get('name', '') or '',
        'url': j.get('absolute_url', ''),
        'department': '',
        'postedAt': j.get('first_published') or j.get('updated_at'),
    } for j in data.get('jobs', [])]


def read_lever(token: str) -> list[dict]:
    data = http_json(f'https://api.lever.co/v0/postings/{token}?mode=json')
    out = []
    for j in data:
        cats = j.get('categories') or {}
        locs = [cats.get('location') or ''] + list(cats.get('allLocations') or [])
        created = j.get('createdAt')
        out.append({
            'extId': j['id'],
            'title': j.get('text', '').strip(),
            'location': ' / '.join(dict.fromkeys(l for l in locs if l)),
            'url': j.get('hostedUrl', ''),
            'department': cats.get('team') or cats.get('department') or '',
            'postedAt': datetime.fromtimestamp(created / 1000, timezone.utc).isoformat() if created else None,
        })
    return out


def read_ashby(token: str) -> list[dict]:
    data = http_json(f'https://api.ashbyhq.com/posting-api/job-board/{token}')
    out = []
    for j in data.get('jobs', []):
        if j.get('isListed') is False:
            continue
        locs = [j.get('location') or ''] + [s.get('location', '') for s in j.get('secondaryLocations') or []]
        out.append({
            'extId': j['id'],
            'title': j.get('title', '').strip(),
            'location': ' / '.join(dict.fromkeys(l for l in locs if l)),
            'url': j.get('jobUrl', ''),
            'department': j.get('department') or j.get('team') or '',
            'postedAt': j.get('publishedAt'),
        })
    return out


def read_smartrecruiters(token: str) -> list[dict]:
    out, offset, limit = [], 0, 100
    for _ in range(20):
        data = http_json(f'https://api.smartrecruiters.com/v1/companies/{token}/postings?limit={limit}&offset={offset}&country=sg')
        batch = data.get('content') or []
        for j in batch:
            loc_obj = j.get('location') or {}
            city = (loc_obj.get('city') or '').strip()
            country = (loc_obj.get('country') or '').strip().lower()
            loc_text = city or ('Singapore' if country == 'sg' else '')
            if country == 'sg' and 'singapore' not in loc_text.lower():
                loc_text = f'{loc_text}, Singapore' if loc_text else 'Singapore'
            out.append({
                'extId': str(j['id']),
                'title': (j.get('name') or '').strip(),
                'location': loc_text,
                'url': f"https://jobs.smartrecruiters.com/{token}/{j['id']}",
                'department': (j.get('department') or {}).get('label') or '',
                'postedAt': j.get('releasedDate'),
            })
        offset += len(batch)
        if not batch or offset >= int(data.get('totalFound') or 0):
            break
    return out


def _find_workday_sg_facets(facets: list[dict]) -> tuple[str | None, list[str]]:
    by_param: dict[str, list[str]] = {}

    def walk(nodes: list[dict]):
        for node in nodes or []:
            param = node.get('facetParameter')
            vals = node.get('values') or []
            if vals and isinstance(vals[0], dict) and 'facetParameter' in vals[0]:
                walk(vals)
            elif param:
                for v in vals:
                    desc = (v.get('descriptor') or '').lower()
                    if 'singapore' in desc and v.get('id'):
                        by_param.setdefault(param, []).append(v['id'])

    walk(facets)
    for preferred in ('locationHierarchy1', 'locations', 'locationCountry'):
        if by_param.get(preferred):
            return preferred, by_param[preferred]
    for param, ids in by_param.items():
        if ids:
            return param, ids
    return None, []


def read_workday(token: str) -> list[dict]:
    # token format: "<host>/<tenant>/<site>"
    host, tenant, site = token.split('/', 2)
    api_url = f'https://{host}/wday/cxs/{tenant}/{site}/jobs'
    probe = http_json(api_url, method='POST', body={'appliedFacets': {}, 'limit': 1, 'offset': 0, 'searchText': ''}, headers=BROWSER_UA)
    facet_param, sg_ids = _find_workday_sg_facets(probe.get('facets') or [])
    if not facet_param or not sg_ids:
        return []

    out, offset, limit = [], 0, 20
    applied = {facet_param: sg_ids}
    for _ in range(50):
        data = http_json(api_url, method='POST', body={'appliedFacets': applied, 'limit': limit, 'offset': offset, 'searchText': ''}, headers=BROWSER_UA)
        postings = data.get('jobPostings') or []
        for j in postings:
            ext_path = j.get('externalPath') or ''
            bullets = j.get('bulletFields') or []
            ext_id = str(bullets[0]) if bullets else ext_path.rstrip('/').split('/')[-1]
            loc = (j.get('locationsText') or '').strip()
            if 'singapore' not in loc.lower():
                loc = f'{loc} / Singapore' if loc else 'Singapore'
            out.append({
                'extId': ext_id,
                'title': (j.get('title') or '').strip(),
                'location': loc,
                'url': f'https://{host}/en-US/{site}{ext_path}' if ext_path else f'https://{host}/en-US/{site}',
                'department': '',
                'postedAt': None,
            })
        offset += len(postings)
        if not postings or offset >= int(data.get('total') or 0):
            break
    return out


def read_amazon(token: str) -> list[dict]:
    # token format: "<country_code>|<business_category>" e.g. "SGP|amazon-web-services"
    parts = token.split('|', 1)
    country = parts[0]
    biz = parts[1] if len(parts) > 1 else ''
    out, offset, limit = [], 0, 100
    for _ in range(20):
        params = [('offset', str(offset)), ('result_limit', str(limit)), ('country', country)]
        if biz:
            params.append(('business_category[]', biz))
        url = 'https://www.amazon.jobs/en/search.json?' + urllib.parse.urlencode(params)
        data = http_json(url, headers=BROWSER_UA)
        jobs = data.get('jobs') or []
        for j in jobs:
            loc = (j.get('location') or j.get('normalized_location') or '').strip()
            if country.upper() == 'SGP' and 'singapore' not in loc.lower():
                loc = 'Singapore' if loc.upper() in ('SGP', '') else f'{loc}, Singapore'
            posted = None
            raw_date = j.get('posted_date')
            if raw_date:
                try:
                    posted = datetime.strptime(raw_date.strip(), '%B %d, %Y').replace(tzinfo=timezone.utc).isoformat()
                except ValueError:
                    posted = None
            job_path = j.get('job_path') or ''
            out.append({
                'extId': str(j.get('id_icims') or j.get('id')),
                'title': (j.get('title') or '').strip(),
                'location': loc,
                'url': f'https://www.amazon.jobs{job_path}' if job_path.startswith('/') else job_path,
                'department': j.get('job_category') or j.get('business_category') or '',
                'postedAt': posted,
            })
        offset += len(jobs)
        if not jobs or offset >= int(data.get('hits') or 0):
            break
    return out


def read_google(token: str) -> list[dict]:
    # Parses Google Careers' public server-rendered AF_initDataCallback (ds:1) JSON
    out, seen = [], set()
    total = None
    for page in range(1, 20):
        q = urllib.parse.urlencode({'location': token, 'page': str(page)})
        html_txt = http_raw(
            f'https://www.google.com/about/careers/applications/jobs/results/?{q}',
            headers=BROWSER_UA, timeout=30
        ).decode('utf-8', 'replace')
        m = re.search(r"AF_initDataCallback\(\{key:\s*'ds:1',\s*hash:\s*'[^']+',\s*data:(.*?),\s*sideChannel:", html_txt, re.S)
        if not m:
            break
        data = json.loads(m.group(1))
        rows = data[0] if data and isinstance(data[0], list) else []
        if total is None and len(data) > 2 and isinstance(data[2], int):
            total = data[2]
        if not rows:
            break
        for j in rows:
            jid = str(j[0])
            if jid in seen:
                continue
            seen.add(jid)
            locs = [loc[0] for loc in (j[9] or []) if isinstance(loc, list) and loc and isinstance(loc[0], str)]
            ts = j[12][0] if len(j) > 12 and isinstance(j[12], list) and j[12] and isinstance(j[12][0], (int, float)) else None
            out.append({
                'extId': jid,
                'title': (j[1] or '').strip(),
                'location': ' / '.join(dict.fromkeys(locs)) or token,
                'url': f'https://www.google.com/about/careers/applications/jobs/results/{jid}',
                'department': '',
                'postedAt': datetime.fromtimestamp(ts, timezone.utc).isoformat() if ts else None,
            })
        if total is not None and len(out) >= total:
            break
    return out


def read_eightfold(token: str) -> list[dict]:
    # token format: "<host>|<domain>|<location>"
    host, domain, location = token.split('|', 2)
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    init_url = f'https://{host}/careers?' + urllib.parse.urlencode({'location': location})
    http_raw(init_url, headers=BROWSER_UA, opener=opener)

    out, start = [], 0
    for _ in range(30):
        q = urllib.parse.urlencode({
            'domain': domain, 'query': '', 'location': location,
            'start': str(start), 'sort_by': 'relevance',
        })
        data = http_json(
            f'https://{host}/api/pcsx/search?{q}',
            headers={**BROWSER_UA, 'Referer': init_url}, opener=opener
        )
        payload = (data or {}).get('data') or {}
        positions = payload.get('positions') or []
        for p in positions:
            locs = [l for l in (p.get('locations') or []) if isinstance(l, str) and l.strip()]
            ts = p.get('postedTs')
            pos_url = p.get('positionUrl') or ''
            out.append({
                'extId': str(p.get('displayJobId') or p.get('id')),
                'title': (p.get('name') or '').strip(),
                'location': ' / '.join(dict.fromkeys(locs)) or location,
                'url': f'https://{host}{pos_url}' if pos_url.startswith('/') else (pos_url or init_url),
                'department': (p.get('department') or '').strip(),
                'postedAt': datetime.fromtimestamp(ts, timezone.utc).isoformat() if isinstance(ts, (int, float)) else None,
            })
        start += len(positions)
        total = int(payload.get('count') or 0)
        if not positions or start >= total:
            break
    return out


def read_workatsea(token: str) -> list[dict]:
    # Unified public ATS for Sea Group / Shopee / Garena / Monee (ats.workatsea.com)
    city_data = http_json('https://ats.workatsea.com/ats/api/v1/user/city/job_count/', headers=BROWSER_UA)
    city_id = None
    for region in (city_data or {}).get('data') or []:
        for city in region.get('cities') or []:
            if (city.get('city_name') or '').lower() == token.lower():
                city_id = city.get('city_id')
                break
        if city_id is not None:
            break
    if city_id is None:
        return []

    out, offset, limit = [], 0, 100
    for _ in range(20):
        url = f'https://ats.workatsea.com/ats/api/v1/user/job/list/?limit={limit}&offset={offset}&city_ids={city_id}'
        data = http_json(url, headers=BROWSER_UA)
        payload = (data or {}).get('data') or {}
        jobs = payload.get('job_list') or []
        for j in jobs:
            jid = str(j.get('job_id') or j.get('id'))
            out.append({
                'extId': jid,
                'title': (j.get('job_name') or '').strip(),
                'location': token,
                'url': f'https://career.sea.com/position/{jid}',
                'department': '',
                'postedAt': None,
            })
        offset += len(jobs)
        total = int(payload.get('total_count') or payload.get('total') or 0)
        if not jobs or offset >= total:
            break
    return out


def read_bytedance(token: str) -> list[dict]:
    # token format: "<website-path>|<city_code>" e.g. "en|CT_163"
    wp, city_code = token.split('|', 1)
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    http_raw(f'https://jobs.bytedance.com/{wp}/position', headers=BROWSER_UA, opener=opener)
    csrf_resp = http_json(
        'https://jobs.bytedance.com/api/v1/csrf/token',
        method='POST', body={'portal_entrance': 1},
        headers={**BROWSER_UA, 'website-path': wp}, opener=opener
    )
    csrf_token = ((csrf_resp or {}).get('data') or {}).get('token')
    if not csrf_token:
        raise RuntimeError('ByteDance CSRF token missing')
    hdrs = {
        **BROWSER_UA,
        'x-csrf-token': csrf_token,
        'website-path': wp,
        'Portal-Channel': 'office',
        'Portal-Platform': 'pc',
        'Origin': 'https://jobs.bytedance.com',
        'Referer': f'https://jobs.bytedance.com/{wp}/position',
    }
    out, offset, limit = [], 0, 20
    for _ in range(40):
        resp = None
        for attempt in range(2):
            try:
                resp = http_json(
                    'https://jobs.bytedance.com/api/v1/search/job/posts',
                    method='POST',
                    body={
                        'keyword': '', 'limit': limit, 'offset': offset,
                        'job_category_id_list': [], 'location_code_list': [city_code],
                        'subject_id_list': [], 'recruitment_id_list': [],
                        'portal_type': 2, 'portal_entrance': 1,
                    },
                    headers=hdrs, timeout=30, opener=opener
                )
                break
            except Exception:
                if attempt == 1:
                    raise
        payload = (resp or {}).get('data') or {}
        posts = payload.get('job_post_list') or []
        for p in posts:
            city_info = p.get('city_info') or {}
            city_list = [c.get('en_name') or c.get('name') or '' for c in (p.get('city_list') or []) if isinstance(c, dict)]
            locs = [city_info.get('en_name') or city_info.get('name') or ''] + city_list
            pub_ms = p.get('publish_time')
            cat = p.get('job_category') or {}
            out.append({
                'extId': str(p['id']),
                'title': (p.get('title') or '').strip(),
                'location': ' / '.join(dict.fromkeys(l for l in locs if l)) or 'Singapore',
                'url': f"https://jobs.bytedance.com/{wp}/position/{p['id']}/detail",
                'department': cat.get('en_name') or cat.get('name') or '',
                'postedAt': datetime.fromtimestamp(pub_ms / 1000, timezone.utc).isoformat() if isinstance(pub_ms, (int, float)) else None,
            })
        offset += len(posts)
        total = int(payload.get('count') or 0)
        if not posts or offset >= total:
            break
    return out


def read_manus(token: str) -> list[dict]:
    inp = urllib.parse.quote(json.dumps({'0': {'json': {'locale': 'en'}}}))
    data = http_json(f'https://{token}/api/trpc/applications.publicJobs?batch=1&input={inp}', headers=BROWSER_UA)
    jobs = data[0]['result']['data']['json'] if data else []
    out = []
    for j in jobs:
        locs = [l for l in (j.get('locations') or []) if isinstance(l, str) and l.strip()]
        out.append({
            'extId': str(j['id']),
            'title': (j.get('title') or '').strip(),
            'location': ' / '.join(dict.fromkeys(locs)),
            'url': f'https://{token}/en',
            'department': (j.get('category') or '').strip(),
            'postedAt': None,
        })
    return out


READERS = {
    'greenhouse': read_greenhouse,
    'lever': read_lever,
    'ashby': read_ashby,
    'smartrecruiters': read_smartrecruiters,
    'workday': read_workday,
    'amazon': read_amazon,
    'google': read_google,
    'eightfold': read_eightfold,
    'workatsea': read_workatsea,
    'bytedance': read_bytedance,
    'manus': read_manus,
}


# ─── Rule-based labels (zero LLM tokens) ──────────────────────
# Order matters: the first function whose pattern matches wins.
FUNCTION_RULES = [
    ('product',   r'product (manager|lead|owner|director|operations|strategist|management)|head of product|\bpm\b'),
    ('design',    r'designer|\bux\b|\bui\b|design (lead|manager|director)|creative|content design'),
    ('gtm',       r'account (executive|manager|associate|director)|business development|partner(ship)?s? (manager|sales|specialist|lead)|'
                  r'\bsales (manager|director|development|specialist|representative|lead|enablement)|renewal|'
                  r'marketing|\bpr\b|communications|\bgtm\b|revenue|growth|brand|events manager'),
    ('solutions', r'solution|forward deployed|deployed engineer|field (engineer|cto)|sales engineer|implementation|'
                  r'consultant|consulting|customer success|deployment strategist|engagement manager|adoption|'
                  r'legal engineer|professional services|technical account|developer (success|advoca)|agent development|'
                  r'support engineer|customer (support|experience)|onboarding'),
    ('ai_ml',     r'\bai\b|machine learning|\bml\b|\bllm|research (scientist|engineer)|applied (scientist|ai|research)|'
                  r'\bnlp\b|deep learning|\bagent'),
    ('data',      r'data (scien|engineer|analyst|platform|infra|architect)|analytics|analyst|business intelligence|quant|\bbi\b'),
    ('infra',     r'infrastructure|\bsre\b|reliability|devops|security|network|cloud|platform engineer|performance engineer|'
                  r'database|production engineer|technician|\bbms\b|data cent(re|er)|mechanical|electrical|facilities'),
    ('software',  r'full ?stack|backend|back-end|frontend|front-end|software|developer|mobile|\bios\b|android|\bqa\b|'
                  r'engineer|architect'),
    ('strategy',  r'strateg|transformation|enablement|chief of staff|business operations|program manager|'
                  r'project (manager|director)|policy|innovation|operations manager|bizops|\bpmo\b'),
    ('corporate', r'finance|financ|accountant|accounting|tax|legal|counsel|compliance|\baml\b|risk|recruit|talent|people|'
                  r'\bhr\b|payroll|procurement|sourcing|treasury|audit|workplace|office|administrative|fp&a|fraud|fincrime'),
]
AI_PATTERN = re.compile(
    r'\bai\b|a\.i\.|artificial intelligence|machine learning|\bml\b|\bllm|genai|generative|\bagent|aigc|'
    r'\bnlp\b|deep learning|data scien|applied (ai|research)|model', re.I)
AI_NATIVE_SECTORS = {'AI Lab', 'AI Product'}


def categorize(title: str) -> str:
    t = title.lower()
    for name, pattern in FUNCTION_RULES:
        if re.search(pattern, t):
            return name
    return 'other'


SENIORITY_WORDS = (r'\b(senior|sr\.?|staff|principal|lead|junior|jr\.?|associate|intern(ship)?|graduate|'
                   r'i{1,3}|iv|manager ii|\d+)\b')
GENERIC_HEADS = {'manager', 'director', 'head', 'lead', 'vp', 'vice president', 'specialist', 'analyst',
                 'engineer', 'associate director', 'senior manager', 'senior director', 'expert', ''}


def role_family(title: str) -> str:
    """'Senior Product Manager, AI Risk (APAC)' -> 'Product Manager'. Used as a graph node label."""
    t = re.sub(r'[\(\[（【].*?[\)\]）】]', ' ', title)
    parts = [p.strip() for p in re.split(r'\s[-–—|/]\s|,|:| – | — ', t) if p.strip()]

    def clean(p: str) -> str:
        p = re.sub(SENIORITY_WORDS, ' ', p, flags=re.I)
        return re.sub(r'\s+', ' ', p).strip(' -–—&/.')

    head = clean(parts[0]) if parts else ''
    if head.lower() in GENERIC_HEADS and len(parts) > 1:
        tail = clean(parts[1])
        if tail:
            head = f'{tail} {head}'.strip() if head.lower() in ('engineer', 'analyst', 'specialist', 'manager', 'director', 'lead') else tail
    return (head or title.strip())[:48]


def seniority(title: str) -> str:
    t = title.lower()
    if re.search(r'\bintern|internship|graduate|trainee', t):
        return 'intern'
    if re.search(r'director|head of|\bvp\b|vice president|\brvp\b|chief|principal|staff|\blead\b|general manager', t):
        return 'lead'
    if re.search(r'senior|\bsr\b\.?|\biii\b', t):
        return 'senior'
    if re.search(r'associate|junior|\bjr\b|entry', t):
        return 'junior'
    return 'mid'


def linkedin_search_url(company: str, title: str) -> str:
    # A link for manual cross-checking on LinkedIn. Nothing is scraped from LinkedIn.
    q = urllib.parse.urlencode({'keywords': f'{company} {title}', 'location': 'Singapore'})
    return f'https://www.linkedin.com/jobs/search/?{q}'


# ─── Merge ────────────────────────────────────────────────────
def fetch_company(company: dict):
    try:
        rows = READERS[company['ats']](company['atsToken'])
        return company, [r for r in rows if 'singapore' in r['location'].lower()], None
    except Exception as exc:  # network error, board moved, bad JSON
        return company, None, f'{type(exc).__name__}: {exc}'


def merge(existing: list[dict], results, today: str) -> tuple[list[dict], dict]:
    by_id = {j['id']: j for j in existing}
    stats = {'new': 0, 'verified': 0, 'closed': 0, 'failedCompanies': []}

    for company, rows, error in results:
        cid = company['id']
        if rows is None:
            stats['failedCompanies'].append({'id': cid, 'error': error})
            continue

        seen = set()
        for r in rows:
            jid = f"{cid}-{r['extId']}"
            seen.add(jid)
            job = by_id.get(jid)
            if job is None:
                job = {'id': jid, 'companyId': cid, 'firstSeen': today}
                by_id[jid] = job
                stats['new'] += 1
            else:
                stats['verified'] += 1
            ai = bool(AI_PATTERN.search(f"{r['title']} {r['department']}")) or company['sector'] in AI_NATIVE_SECTORS
            job.update({
                'title': r['title'],
                'location': r['location'],
                'department': r['department'],
                'applyUrl': r['url'],
                'sourceUrl': r['url'],
                'linkedinSearchUrl': linkedin_search_url(company['name'], r['title']),
                'postedAt': r['postedAt'],
                'category': categorize(r['title']),
                'roleFamily': role_family(r['title']),
                'seniority': seniority(r['title']),
                'isAiRelated': ai,
                'verification': 'official',     # confirmed on the company's own careers board
                'status': 'open',
                'lastVerified': today,
                'missCount': 0,
                'closedAt': None,
            })

        for job in by_id.values():
            if job['companyId'] != cid or job['id'] in seen or job['status'] != 'open':
                continue
            job['missCount'] = job.get('missCount', 0) + 1
            if job['missCount'] >= CLOSE_AFTER_MISSES:
                job['status'] = 'closed'
                job['closedAt'] = today
                stats['closed'] += 1

    jobs = sorted(by_id.values(), key=lambda j: (j['status'] != 'open', j['companyId'], j['title'], j['id']))
    return jobs, stats


# ─── Supabase (optional) ──────────────────────────────────────
def supabase_upsert(table: str, rows: list[dict]):
    base = os.environ['SUPABASE_URL'].rstrip('/')
    key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    headers = {
        'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
    }
    for i in range(0, len(rows), 200):
        http_json(f'{base}/rest/v1/{table}?on_conflict=id', 'POST', rows[i:i + 200], headers, timeout=60)


def to_company_row(c: dict) -> dict:
    return {
        'id': c['id'], 'name': c['name'], 'sector': c['sector'], 'ai_focus': c['aiFocus'],
        'website': c['website'], 'careers_url': c['careersUrl'], 'linkedin_url': c.get('linkedinUrl'),
        'ats': c['ats'], 'ats_token': c['atsToken'], 'organizer_ids': c.get('organizerIds', []),
        'seed_source': c.get('seedSource'), 'conferences': c.get('conferences', []), 'active': c.get('active', True),
    }


def to_job_row(j: dict) -> dict:
    return {
        'id': j['id'], 'company_id': j['companyId'], 'title': j['title'], 'location': j['location'],
        'department': j['department'], 'apply_url': j['applyUrl'], 'source_url': j['sourceUrl'],
        'linkedin_search_url': j['linkedinSearchUrl'], 'posted_at': j['postedAt'],
        'category': j['category'], 'role_family': j['roleFamily'], 'seniority': j['seniority'], 'is_ai_related': j['isAiRelated'],
        'verification': j['verification'], 'status': j['status'], 'first_seen': j['firstSeen'],
        'last_verified': j['lastVerified'], 'miss_count': j['missCount'], 'closed_at': j['closedAt'],
    }


def main():
    dry_run = '--dry-run' in sys.argv
    today = datetime.now(SGT).date().isoformat()
    companies = [c for c in json.loads(COMPANIES_PATH.read_text(encoding='utf-8')) if c.get('active', True)]
    existing = json.loads(JOBS_PATH.read_text(encoding='utf-8')) if JOBS_PATH.exists() else []

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(fetch_company, companies))

    jobs, stats = merge(existing, results, today)
    open_jobs = [j for j in jobs if j['status'] == 'open']
    meta = {
        'lastRun': datetime.now(SGT).isoformat(timespec='seconds'),
        'companies': len(companies),
        'openJobs': len(open_jobs),
        'aiRelatedOpenJobs': sum(1 for j in open_jobs if j['isAiRelated']),
        **stats,
    }
    print(json.dumps(meta, indent=2))

    if dry_run:
        return
    JOBS_PATH.write_text(json.dumps(jobs, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    META_PATH.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    if os.environ.get('SUPABASE_URL') and os.environ.get('SUPABASE_SERVICE_ROLE_KEY'):
        supabase_upsert('companies', [to_company_row(c) for c in companies])
        supabase_upsert('jobs', [to_job_row(j) for j in jobs])
        print(f'Supabase: upserted {len(companies)} companies, {len(jobs)} jobs')
    else:
        print('Supabase env not set: wrote JSON files only')

    # A run where every board failed is a broken run, not an empty market.
    if len(stats['failedCompanies']) == len(companies):
        sys.exit(1)


if __name__ == '__main__':
    main()
