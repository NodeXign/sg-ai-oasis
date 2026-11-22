#!/usr/bin/env python3
"""
SG AI Oasis — daily job sync.

For every company in data/companies.json, read its public careers board
(Greenhouse / Lever / Ashby JSON endpoints), keep roles located in Singapore,
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
UA = {'User-Agent': 'sg-ai-oasis/1.0 (+https://github.com/Gukki2021/sg-ai-oasis)'}


def http_json(url: str, method: str = 'GET', body=None, headers=None, timeout: int = 25):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={**UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
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


READERS = {'greenhouse': read_greenhouse, 'lever': read_lever, 'ashby': read_ashby}


# ─── Rule-based labels (zero LLM tokens) ──────────────────────
# Order matters: the first category whose pattern matches wins.
CATEGORY_RULES = [
    ('product',     r'product (manager|lead|owner|director|operations|strategist)|head of product|\bpm\b|product management'),
    ('gtm',         r'account (executive|manager|associate|director)|business development|'
                    r'\bsales (manager|director|development|specialist|representative|lead)'),
    ('solutions',   r'solution|forward deployed|deployed engineer|field (engineer|cto)|sales engineer|implementation|'
                    r'consultant|consulting|customer success|deployment strategist|engagement manager|adoption|'
                    r'legal engineer|professional services|technical account|developer (success|advoca)|agent development'),
    ('strategy',    r'strateg|transformation|enablement|chief of staff|business operations|program manager|'
                    r'project (manager|director)|policy|innovation|operations manager|bizops'),
    ('data',        r'data scien|machine learning|\bml\b|research|analyst|analytics|quant|business intelligence'),
    ('engineering', r'engineer|developer|architect|\bsre\b|devops|security|infrastructure|technician'),
    ('gtm',         r'account (executive|manager|associate|director)|sales|business development|partner|marketing|'
                    r'renewal|revenue|\bgtm\b|\bpr\b|communications|growth'),
]
AI_PATTERN = re.compile(
    r'\bai\b|a\.i\.|artificial intelligence|machine learning|\bml\b|\bllm|genai|generative|\bagent|aigc|'
    r'\bnlp\b|deep learning|data scien|applied (ai|research)|model', re.I)
AI_NATIVE_SECTORS = {'AI Lab', 'AI Product'}


def categorize(title: str) -> str:
    t = title.lower()
    for name, pattern in CATEGORY_RULES:
        if re.search(pattern, t):
            # "Data Platform Engineer, AI Enablement" is an engineering role, not a strategy one.
            if name == 'strategy' and re.search(r'engineer|developer', t):
                return 'engineering'
            return name
    return 'other'


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
        'category': j['category'], 'seniority': j['seniority'], 'is_ai_related': j['isAiRelated'],
        'verification': j['verification'], 'status': j['status'], 'first_seen': j['firstSeen'],
        'last_verified': j['lastVerified'], 'miss_count': j['missCount'], 'closed_at': j['closedAt'],
    }


def main():
    dry_run = '--dry-run' in sys.argv
    today = datetime.now(SGT).date().isoformat()
    companies = [c for c in json.loads(COMPANIES_PATH.read_text()) if c.get('active', True)]
    existing = json.loads(JOBS_PATH.read_text()) if JOBS_PATH.exists() else []

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
    JOBS_PATH.write_text(json.dumps(jobs, indent=1, ensure_ascii=False) + '\n')
    META_PATH.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + '\n')

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
