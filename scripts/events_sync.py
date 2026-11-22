#!/usr/bin/env python3
"""
SG AI Oasis — daily event sync.

Reads two open Luma listings (see data/sources.json) and writes data/events.json:

  - "AI @ Singapore" community calendar  -> every upcoming event
  - Luma's public Singapore city listing -> only events whose title matches AI keywords

Each event keeps its original name, time, venue and registration link.
Organisers are stored as the hosting calendar/organisation name only;
individual host profiles are not collected.

Events are linked to companies in data/companies.json when the company name
appears in the event title or organiser name (rule-based, no LLM).

Usage: python3 scripts/events_sync.py [--dry-run]
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EVENTS_PATH = ROOT / 'data' / 'events.json'
META_PATH = ROOT / 'data' / 'events_meta.json'
COMPANIES_PATH = ROOT / 'data' / 'companies.json'
SOURCES_PATH = ROOT / 'data' / 'sources.json'

SGT = timezone(timedelta(hours=8))
UA = {'User-Agent': 'Mozilla/5.0 (compatible; sg-ai-oasis/1.0; +https://github.com/Gukki2021/sg-ai-oasis)'}
WINDOW_DAYS = 45

AI_PATTERN = re.compile(
    r'\bai\b|a\.i\.|artificial intelligence|machine learning|\bml\b|\bllm|genai|generative|\bagent|agentic|'
    r'\bgpt|claude|openai|gemini|copilot|\bcodex\b|\brag\b|\bmcp\b|deep learning|data scien|robot|'
    r'vibe cod|prompt|neural|hackathon|\bn8n\b|automation', re.I)


def http_json(url: str):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=25) as resp:
        return json.load(resp)


def fetch_entries(source: dict) -> list[dict]:
    if source['kind'] == 'luma-calendar':
        base = f"https://api.lu.ma/calendar/get-items?calendar_api_id={source['apiId']}&period=future&pagination_limit=50"
    else:
        base = f"https://api.lu.ma/discover/get-paginated-events?discover_place_api_id={source['apiId']}&pagination_limit=50"
    entries, cursor = [], None
    for _ in range(6):  # hard stop: at most 300 entries per source
        data = http_json(base + (f'&pagination_cursor={cursor}' if cursor else ''))
        entries += data.get('entries', [])
        cursor = data.get('next_cursor')
        if not data.get('has_more') or not cursor:
            break
    return entries


def normalise(entry: dict, source: dict) -> dict | None:
    ev = entry.get('event') or {}
    name = (ev.get('name') or '').strip()
    start = ev.get('start_at')
    if not name or not start:
        return None

    raw_url = ev.get('url') or ''
    url = raw_url if raw_url.startswith('http') else f'https://luma.com/{raw_url}'
    geo = ev.get('geo_address_info') or {}
    # When the organiser hides the address, Luma returns only a city-level point.
    # Putting that on a map (or measuring MRT distance from it) would be misleading.
    precise = bool(geo.get('full_address'))
    coord = (ev.get('coordinate') or {}) if precise else {}
    ticket = entry.get('ticket_info') or {}
    calendar = entry.get('calendar') or {}
    organiser = (ev.get('host') or calendar.get('name') or '').strip()
    if organiser.lower() in ('personal', ''):
        organiser = ''

    price = ticket.get('price') or {}
    if ticket.get('is_sold_out'):
        status = 'sold_out'
    elif entry.get('waitlist_active'):
        status = 'waitlist'
    elif ticket.get('require_approval'):
        status = 'approval'
    else:
        status = 'open'

    return {
        'id': ev.get('api_id') or entry.get('api_id'),
        'title': name,
        'startAt': start,
        'endAt': ev.get('end_at'),
        'venue': (geo.get('address') or '') if precise else '',
        'address': geo.get('full_address') or geo.get('short_address') or '',
        'lat': coord.get('latitude'),
        'lng': coord.get('longitude'),
        'url': url,
        'coverImageUrl': ev.get('cover_url'),
        'organiser': organiser,
        'isFree': bool(ticket.get('is_free')) if ticket else None,
        'price': f"{price['currency'].upper()} {price['cents'] / 100:.0f}" if price.get('cents') else None,
        'status': status,
        'isOnline': ev.get('location_type') not in (None, 'offline'),
        'tags': [t['name'] for t in entry.get('tags') or [] if t.get('name')],
        'sourceIds': [source['id']],
    }


def link_companies(event: dict, companies: list[dict]) -> list[str]:
    haystack = f"{event['title']} {event['organiser']}"
    return [
        c['id'] for c in companies
        if re.search(rf"(?<![A-Za-z0-9]){re.escape(c['name'])}(?![A-Za-z0-9])", haystack, re.I)
    ]


def main():
    dry_run = '--dry-run' in sys.argv
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=WINDOW_DAYS)
    sources = json.loads(SOURCES_PATH.read_text())
    companies = json.loads(COMPANIES_PATH.read_text())
    previous = {e['id']: e for e in (json.loads(EVENTS_PATH.read_text()) if EVENTS_PATH.exists() else [])}

    merged: dict[str, dict] = {}
    per_source, failed = {}, []
    for source in sources:
        try:
            entries = fetch_entries(source)
        except Exception as exc:
            failed.append({'id': source['id'], 'error': f'{type(exc).__name__}: {exc}'})
            continue
        kept = 0
        for entry in entries:
            ev = normalise(entry, source)
            if not ev or not ev['id']:
                continue
            start = datetime.fromisoformat(ev['startAt'].replace('Z', '+00:00'))
            if not (now - timedelta(hours=6) <= start <= horizon):
                continue
            if source.get('aiFilter') and not AI_PATTERN.search(ev['title']):
                continue
            if ev['id'] in merged:
                merged[ev['id']]['sourceIds'] = sorted(set(merged[ev['id']]['sourceIds'] + ev['sourceIds']))
                continue
            merged[ev['id']] = ev
            kept += 1
        per_source[source['id']] = {'listed': len(entries), 'kept': kept}

    # A source that failed must not erase the events it contributed last time.
    failed_ids = {f['id'] for f in failed}
    for old in previous.values():
        if old['id'] not in merged and failed_ids & set(old.get('sourceIds', [])):
            if datetime.fromisoformat(old['startAt'].replace('Z', '+00:00')) >= now:
                merged[old['id']] = old

    today = datetime.now(SGT).date().isoformat()
    events = []
    for ev in merged.values():
        ev['companyIds'] = link_companies(ev, companies)
        ev['firstSeen'] = previous.get(ev['id'], {}).get('firstSeen', today)
        events.append(ev)
    events.sort(key=lambda e: (e['startAt'], e['title']))

    meta = {
        'lastRun': datetime.now(SGT).isoformat(timespec='seconds'),
        'events': len(events),
        'linkedToCompanies': sum(1 for e in events if e['companyIds']),
        'sources': per_source,
        'failedSources': failed,
    }
    print(json.dumps(meta, indent=2))
    if dry_run:
        return
    if failed and len(failed) == len(sources):
        sys.exit(1)  # nothing reachable: keep yesterday's file
    EVENTS_PATH.write_text(json.dumps(events, indent=1, ensure_ascii=False) + '\n')
    META_PATH.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
