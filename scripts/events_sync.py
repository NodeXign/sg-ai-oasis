#!/usr/bin/env python3
"""
SG AI Oasis — daily event sync.

Reads open Singapore event sources listed in data/sources.json and writes data/events.json:

  - luma-calendar   : public Luma calendar API
  - luma-place      : public Luma Singapore city discovery API
  - bevy-chapter    : public Bevy JSON API (e.g. GDG Singapore / GDG Cloud Singapore)
  - sginnovate-html : public SGInnovate upcoming events HTML + detail pages

Each event keeps its original name, time, venue and registration link.
Organisers are stored as the hosting calendar/organisation name only;
individual host profiles are not collected.
Events without a precise venue address/coordinates are kept off the map (lat/lng = null).

Events are linked to companies in data/companies.json when the company name or any of its
organizerIds appears in the event title or organiser name (rule-based, no LLM).

Usage: python3 scripts/events_sync.py [--dry-run]
"""

from __future__ import annotations

import html
import json
import os
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
UA = {'User-Agent': 'Mozilla/5.0 (compatible; sg-ai-oasis/1.0; +https://github.com/NodeXign/sg-ai-oasis)'}
BROWSER_UA = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/html;q=0.9, */*;q=0.8',
}
WINDOW_DAYS = 45

AI_PATTERN = re.compile(
    r'\bai\b|a\.i\.|artificial intelligence|machine learning|\bml\b|\bllm|genai|generative|\bagent|agentic|'
    r'\bgpt|claude|openai|gemini|copilot|\bcodex\b|\brag\b|\bmcp\b|deep learning|data scien|robot|'
    r'vibe cod|prompt|neural|hackathon|\bn8n\b|automation|devin', re.I)

NON_SG_LOC_PATTERN = re.compile(
    r'\b(malaysia|kuala lumpur|klcc|penang|johor|indonesia|jakarta|bali|thailand|bangkok|'
    r'vietnam|ho chi minh|hanoi|philippines|manila|japan|tokyo|korea|seoul|china|beijing|shanghai|'
    r'hong kong|taiwan|taipei|india|bengaluru|mumbai|australia|sydney|melbourne|united states|usa|london)\b', re.I)

HIDDEN_LOC_PATTERN = re.compile(r'revealed upon|tba\b|tbd\b|to be announced|000000', re.I)


def http_get(url: str, headers: dict | None = None, timeout: int = 25) -> bytes:
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def http_json(url: str, headers: dict | None = None, timeout: int = 25):
    return json.loads(http_get(url, headers=headers, timeout=timeout))


def to_utc_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')


def normalise_iso(raw: str | None) -> str | None:
    if not raw:
        return None
    dt = datetime.fromisoformat(raw.replace('Z', '+00:00'))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=SGT)
    return to_utc_iso(dt)


# ─── Luma ──────────────────────────────────────────────────────
def fetch_luma(source: dict) -> list[dict]:
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
    out = []
    for entry in entries:
        ev = normalise_luma(entry, source)
        if ev:
            out.append(ev)
    return out


def normalise_luma(entry: dict, source: dict) -> dict | None:
    ev = entry.get('event') or {}
    name = (ev.get('name') or '').strip()
    start = normalise_iso(ev.get('start_at'))
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
        'endAt': normalise_iso(ev.get('end_at')),
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


# ─── Bevy (GDG Singapore / GDG Cloud Singapore) ────────────────
def fetch_bevy_chapter(source: dict) -> list[dict]:
    base_host = source.get('host', 'https://gdg.community.dev').rstrip('/')
    cid = source['apiId']
    slim_url = f'{base_host}/api/event_slim/for_chapter/{cid}/?status=Live&page_size=50'
    data = http_json(slim_url, headers=BROWSER_UA)
    results = data.get('results') or []
    out = []
    for item in results:
        eid = item.get('id')
        if not eid:
            continue
        detail = http_json(f'{base_host}/api/event/{eid}/', headers=BROWSER_UA)
        ev = normalise_bevy(detail, source)
        if ev:
            out.append(ev)
    return out


def normalise_bevy(ev: dict, source: dict) -> dict | None:
    title = (ev.get('title') or '').strip()
    start = normalise_iso(ev.get('start_date_iso') or ev.get('start_date'))
    if not title or not start:
        return None

    hidden = bool(ev.get('hide_location'))
    venue_name = '' if hidden else (ev.get('venue_name') or '').strip()
    venue_addr = '' if hidden else (ev.get('venue_address') or '').strip()
    venue_city = (ev.get('venue_city') or '').strip()
    venue_zip = (ev.get('venue_zip_code') or '').strip()
    precise = bool(venue_addr) and not hidden

    addr_parts = [p for p in [venue_name, venue_addr, f"{venue_city} {venue_zip}".strip()] if p]
    address = ', '.join(dict.fromkeys(addr_parts)) if precise else ''

    lat = ev.get('venue_latitude') if precise else None
    lng = ev.get('venue_longitude') if precise else None
    if not (isinstance(lat, (int, float)) and isinstance(lng, (int, float))):
        lat, lng = None, None

    audience = (ev.get('audience_type') or '').upper()
    is_online = audience == 'VIRTUAL' or (bool(ev.get('is_virtual_event')) and not venue_name and audience != 'IN_PERSON')

    chapter = ev.get('chapter') or {}
    organiser = (chapter.get('title') or source.get('name') or '').strip()
    picture = ev.get('picture') or {}
    cover = picture.get('url') if isinstance(picture, dict) else None
    cover = cover or ev.get('cropped_picture_url') or ev.get('cropped_banner_url')

    tickets = ev.get('tickets') or []
    is_free, price_str, status = None, None, 'open'
    if tickets:
        prices = [t.get('price') for t in tickets if isinstance(t.get('price'), (int, float))]
        if prices:
            min_price = min(prices)
            is_free = min_price == 0
            if min_price > 0:
                cur = (ev.get('currency') or 'SGD').upper()
                price_str = f'{cur} {min_price:g}'
        if all(t.get('sold_out') for t in tickets if 'sold_out' in t):
            status = 'sold_out'

    tags = [t for t in (ev.get('tags') or []) if isinstance(t, str) and t.strip()]
    return {
        'id': f"bevy-{ev['id']}",
        'title': title,
        'startAt': start,
        'endAt': normalise_iso(ev.get('end_date_iso') or ev.get('end_date')),
        'venue': venue_name if precise else '',
        'address': address,
        'lat': lat,
        'lng': lng,
        'url': ev.get('url') or source['url'],
        'coverImageUrl': cover,
        'organiser': organiser,
        'isFree': is_free,
        'price': price_str,
        'status': status,
        'isOnline': is_online,
        'tags': tags,
        'sourceIds': [source['id']],
    }


# ─── SGInnovate (public HTML) ──────────────────────────────────
def _strip_tags(raw: str) -> str:
    cleaned = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', raw, flags=re.S | re.I)
    cleaned = re.sub(r'<[^>]+>', ' ', cleaned)
    return re.sub(r'\s+', ' ', html.unescape(cleaned)).strip()


def _parse_sginnovate_datetime(date_str: str, time_str: str | None) -> tuple[str | None, str | None]:
    # Examples: "01 Dec 2026, Tuesday", "Wednesday, 2 December 2026"
    m = re.search(r'(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})', date_str)
    if not m:
        return None, None
    day, mon_raw, year = int(m.group(1)), m.group(2)[:3].title(), int(m.group(3))
    try:
        base_date = datetime.strptime(f'{day:02d} {mon_raw} {year}', '%d %b %Y')
    except ValueError:
        return None, None

    def parse_hm(part: str, fallback_ampm: str | None = None) -> tuple[int, int] | None:
        tm = re.match(r'^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$', part.strip(), re.I)
        if not tm:
            return None
        hh, mm = int(tm.group(1)), int(tm.group(2) or 0)
        ap = (tm.group(3) or fallback_ampm or '').lower()
        if ap == 'pm' and hh < 12:
            hh += 12
        elif ap == 'am' and hh == 12:
            hh = 0
        return hh, mm

    start_dt = base_date.replace(hour=9, minute=0, tzinfo=SGT)
    end_dt = None
    if time_str:
        t_clean = re.sub(r'\(.*?\)', '', time_str)
        t_clean = re.sub(r'\b(sgt|gmt[^\s]*)\b', '', t_clean, flags=re.I).strip()
        rng = re.split(r'\s*[-–—]\s*', t_clean, maxsplit=1)
        end_ap = None
        if len(rng) == 2:
            m_ap = re.search(r'\b(am|pm)\b', rng[1], re.I)
            end_ap = m_ap.group(1) if m_ap else None
        s_hm = parse_hm(rng[0], fallback_ampm=end_ap)
        if s_hm:
            start_dt = base_date.replace(hour=s_hm[0], minute=s_hm[1], tzinfo=SGT)
        if len(rng) == 2:
            e_hm = parse_hm(rng[1])
            if e_hm:
                end_dt = base_date.replace(hour=e_hm[0], minute=e_hm[1], tzinfo=SGT)
    return to_utc_iso(start_dt), (to_utc_iso(end_dt) if end_dt else None)


def fetch_sginnovate(source: dict) -> list[dict]:
    listing_html = http_get(source['url'], headers=BROWSER_UA).decode('utf-8', 'replace')
    # Only scan after the "Upcoming Events" section heading
    heading_pos = listing_html.find('inner-body-heading')
    section = listing_html[heading_pos:] if heading_pos != -1 else listing_html
    blocks = section.split('card-block-hld')[1:]

    candidates = []
    seen_slugs = set()
    known_tags = ['Artificial Intelligence', 'Data Analytics', 'Cybersecurity', 'Quantum Computing',
                  'Robotics', 'Deep Tech', 'MedTech', 'SpaceTech', 'Blockchain', 'Internet-of-Things']
    for blk in blocks:
        lm = re.search(r'href="(/event/([^"]+))"', blk)
        if not lm:
            continue
        path, slug = lm.group(1), lm.group(2).strip('/')
        if slug in seen_slugs:
            continue
        seen_slugs.add(slug)
        img_m = re.search(r'<img[^>]+src="(https://central\.sginnovate\.com/[^"]+)"', blk)
        card_text = _strip_tags(blk[:3000])
        card_tags = [kw for kw in known_tags if kw.lower() in card_text.lower()]
        candidates.append((slug, f'https://www.sginnovate.com{path}', img_m.group(1) if img_m else None, card_tags))

    out = []
    for slug, url, cover, card_tags in candidates[:25]:
        try:
            detail_html = http_get(url, headers=BROWSER_UA).decode('utf-8', 'replace')
        except Exception:
            continue
        tm = re.search(r'<title>(.*?)</title>', detail_html, re.S | re.I)
        title = html.unescape(re.sub(r'\s*\|\s*SGInnovate\s*$', '', tm.group(1))).strip() if tm else ''
        if not title:
            continue

        # Scope to main body text around Schedule block
        text = _strip_tags(detail_html)
        sched_idx = text.find('Schedule')
        sched = text[sched_idx:sched_idx + 1200] if sched_idx != -1 else text[:2500]

        dm = re.search(r'Date:\s*(.+?)(?=End Date:|Time:|Location:|$)', sched, re.I)
        if not dm:
            continue
        tm_m = re.search(r'Time:\s*(.+?)(?=Location:|Program|Speakers|Technology:|$)', sched, re.I)
        loc_m = re.search(r'Location:\s*(.+?)(?=Speakers|Technology:|Industries:|Other events|Register|$)', sched, re.I)
        tech_m = re.search(r'Technology:\s*(.+?)(?=Industries:|Speakers|Other events|$)', text[sched_idx:] if sched_idx != -1 else text, re.I)

        start_iso, end_iso = _parse_sginnovate_datetime(dm.group(1), tm_m.group(1) if tm_m else None)
        if not start_iso:
            continue

        raw_loc = (loc_m.group(1) if loc_m else '').strip(' -–—,')
        is_online = bool(re.search(r'\bonline\b|\bvirtual\b|\bwebinar\b|\bzoom\b', raw_loc, re.I))
        # Exclude overseas physical events (e.g. Kuala Lumpur) unless Singapore or Online
        if raw_loc and NON_SG_LOC_PATTERN.search(raw_loc) and not re.search(r'\bsingapore\b', raw_loc, re.I) and not is_online:
            continue

        hidden_loc = (not raw_loc) or bool(HIDDEN_LOC_PATTERN.search(raw_loc)) or (is_online and not re.search(r'\d', raw_loc))
        address = '' if hidden_loc else raw_loc
        venue = '' if hidden_loc else raw_loc.split(',')[0].strip()

        tags = list(card_tags)
        if tech_m:
            raw_tech = tech_m.group(1).strip()
            for kw in known_tags:
                if kw.lower() in raw_tech.lower() and kw not in tags:
                    tags.append(kw)

        out.append({
            'id': f'sginnovate-{slug}',
            'title': title,
            'startAt': start_iso,
            'endAt': end_iso,
            'venue': venue,
            'address': address,
            'lat': None,  # SGInnovate pages do not publish coordinates
            'lng': None,
            'url': url,
            'coverImageUrl': cover,
            'organiser': 'SGInnovate',
            'isFree': None,
            'price': None,
            'status': 'open',
            'isOnline': is_online and not bool(address),
            'tags': tags,
            'sourceIds': [source['id']],
        })
    return out


def fetch_events(source: dict) -> list[dict]:
    kind = source['kind']
    if kind in ('luma-calendar', 'luma-place'):
        return fetch_luma(source)
    if kind == 'bevy-chapter':
        return fetch_bevy_chapter(source)
    if kind == 'sginnovate-html':
        return fetch_sginnovate(source)
    raise ValueError(f'Unsupported source kind: {kind}')


def supabase_upsert(table: str, rows: list[dict], on_conflict: str):
    if not rows:
        return
    base = os.environ['SUPABASE_URL'].rstrip('/')
    key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    req = urllib.request.Request(
        f'{base}/rest/v1/{table}?on_conflict={on_conflict}',
        data=json.dumps(rows).encode(), method='POST',
        headers={**UA, 'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json',
                 'Prefer': 'resolution=merge-duplicates,return=minimal'})
    urllib.request.urlopen(req, timeout=60).read()


def to_event_row(e: dict) -> dict:
    return {
        'id': e['id'], 'title': e['title'], 'start_at': e['startAt'], 'end_at': e['endAt'],
        'venue': e['venue'], 'address': e['address'], 'venue_lat': e['lat'], 'venue_lng': e['lng'],
        'source_url': e['url'], 'cover_image_url': e['coverImageUrl'], 'organiser': e['organiser'],
        'is_free': e['isFree'], 'price': e['price'], 'reg_status': e['status'], 'is_online': e['isOnline'],
        'tags': e['tags'], 'source_ids': e['sourceIds'], 'first_seen': e['firstSeen'],
    }


def _company_patterns(company: dict) -> list[re.Pattern]:
    terms = [company['name']] + list(company.get('organizerIds') or [])
    patterns = []
    for raw in terms:
        t = (raw or '').strip()
        if not t:
            continue
        # Convert slug separators (- / _) into flexible space/hyphen separators so
        # organizerIds like "claude-sg-community" match "Claude SG Community".
        parts = [re.escape(p) for p in re.split(r'[-_\s]+', t) if p]
        if not parts:
            continue
        expr = r'[\s_-]+'.join(parts)
        patterns.append(re.compile(rf'(?<![A-Za-z0-9]){expr}(?![A-Za-z0-9])', re.I))
    return patterns


def link_companies(event: dict, company_patterns: list[tuple[str, list[re.Pattern]]]) -> list[str]:
    haystack = f"{event['title']} {event['organiser']}"
    return [cid for cid, pats in company_patterns if any(p.search(haystack) for p in pats)]


def _dedupe_key(ev: dict) -> tuple[str, str]:
    norm_title = re.sub(r'[^a-z0-9]+', ' ', ev['title'].lower()).strip()
    return norm_title, ev['startAt'][:13]  # title + UTC date/hour


def main():
    dry_run = '--dry-run' in sys.argv
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=WINDOW_DAYS)
    sources = json.loads(SOURCES_PATH.read_text(encoding='utf-8'))
    companies = json.loads(COMPANIES_PATH.read_text(encoding='utf-8'))
    company_patterns = [(c['id'], _company_patterns(c)) for c in companies]
    previous = {e['id']: e for e in (json.loads(EVENTS_PATH.read_text(encoding='utf-8')) if EVENTS_PATH.exists() else [])}

    merged: dict[str, dict] = {}
    by_sig: dict[tuple[str, str], str] = {}
    per_source, failed = {}, []
    for source in sources:
        try:
            fetched = fetch_events(source)
        except Exception as exc:
            failed.append({'id': source['id'], 'error': f'{type(exc).__name__}: {exc}'})
            continue
        kept = 0
        for ev in fetched:
            if not ev or not ev.get('id'):
                continue
            start = datetime.fromisoformat(ev['startAt'].replace('Z', '+00:00'))
            if not (now - timedelta(hours=6) <= start <= horizon):
                continue
            if source.get('aiFilter'):
                text_for_ai = f"{ev['title']} {' '.join(ev.get('tags') or [])}"
                if not AI_PATTERN.search(text_for_ai):
                    continue
            sig = _dedupe_key(ev)
            existing_id = ev['id'] if ev['id'] in merged else by_sig.get(sig)
            if existing_id and existing_id in merged:
                merged[existing_id]['sourceIds'] = sorted(set(merged[existing_id]['sourceIds'] + ev['sourceIds']))
                continue
            merged[ev['id']] = ev
            by_sig[sig] = ev['id']
            kept += 1
        per_source[source['id']] = {'listed': len(fetched), 'kept': kept}

    # A source that failed must not erase the events it contributed last time.
    failed_ids = {f['id'] for f in failed}
    for old in previous.values():
        if old['id'] not in merged and failed_ids & set(old.get('sourceIds', [])):
            if datetime.fromisoformat(old['startAt'].replace('Z', '+00:00')) >= now:
                merged[old['id']] = old

    today = datetime.now(SGT).date().isoformat()
    events = []
    for ev in merged.values():
        ev['companyIds'] = link_companies(ev, company_patterns)
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
    EVENTS_PATH.write_text(json.dumps(events, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    META_PATH.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    if os.environ.get('SUPABASE_URL') and os.environ.get('SUPABASE_SERVICE_ROLE_KEY'):
        # Companies must already exist (jobs_sync.py runs first) for the links to insert.
        supabase_upsert('events', [to_event_row(e) for e in events], 'id')
        links = [{'event_id': e['id'], 'company_id': c, 'role': 'host'} for e in events for c in e['companyIds']]
        supabase_upsert('event_companies', links, 'event_id,company_id')
        print(f'Supabase: upserted {len(events)} events, {len(links)} event-company links')
    else:
        print('Supabase env not set: wrote JSON files only')


if __name__ == '__main__':
    main()
