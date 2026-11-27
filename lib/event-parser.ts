import type { SgEvent } from './types';
import { resolveEventGeo } from './sg-geo';

export interface ParsedEventDraft {
  title?: string;
  date?: string;       // YYYY-MM-DD (SGT)
  startTime?: string;  // HH:MM (24h SGT)
  endTime?: string;    // HH:MM (24h SGT)
  organiser?: string;
  isOnline?: boolean;
  venue?: string;
  address?: string;
  lat?: number | null;
  lng?: number | null;
  url?: string;
  coverImageUrl?: string | null;
  isFree?: boolean;
  price?: string;
  status?: 'open' | 'approval' | 'waitlist' | 'sold_out';
  friendNote?: string;
}

const TZ = 'Asia/Singapore';

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const ZH_WEEKDAYS: Record<string, number> = {
  日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6,
};

const KNOWN_SG_PLACES: RegExp[] = [
  /lorong\s*ai(?:\s*@\s*one[-\s]?north)?/i,
  /google\s+developers?\s+space(?:\s*,?\s*singapore)?/i,
  /block\s*71|b71\s+ayer\s+rajah/i,
  /69\s+ayer\s+rajah\s+cres[^\n,;]*/i,
  /71\s+ayer\s+rajah\s+cres[^\n,;]*/i,
  /79\s+ayer\s+rajah\s+cres[^\n,;]*/i,
  /80\s+pasir\s+panjang[^\n,;]*/i,
  /capitaspring[^\n,;]*/i,
  /32\s+carpenter\s+st[^\n,;]*/i,
  /national\s+library(?:\s+building)?/i,
  /suntec\s+(?:city|singapore|convention)[^\n,;]*/i,
  /marina\s+bay\s+sands[^\n,;]*/i,
  /lifelong\s+learning\s+institute/i,
  /one[-\s]?north/i,
  /tanjong\s+pagar/i,
  /raffles\s+place/i,
  /clarke\s+quay/i,
  /marina\s+bay/i,
  /city\s+hall/i,
  /bugis/i,
  /orchard/i,
  /paya\s+lebar/i,
  /harbourfront/i,
  /buona\s+vista/i,
  /kent\s+ridge/i,
  /\bnus\b|\bntu\b|\bsmu\b/i,
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function addDaysYmd(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T12:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

export function isoToSgtDateAndTime(iso: string): { date: string; time: string } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString('en-CA', { timeZone: TZ });
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TZ,
  }).format(d);
  return { date, time };
}

function addHoursHm(hm: string, hours: number): string {
  const [hStr, mStr] = hm.split(':');
  const h = (Number(hStr) + hours) % 24;
  return `${pad2(h)}:${mStr ?? '00'}`;
}

function parse12hTo24h(hour: number, minute: number, meridiem?: string): string {
  let h = hour;
  const m = (meridiem ?? '').toLowerCase();
  if ((m === 'pm' || m === '下午' || m === '晚上' || m === '傍晚') && h < 12) {
    h += 12;
  } else if ((m === 'am' || m === '上午' || m === '早上') && h === 12) {
    h = 0;
  }
  return `${pad2(Math.min(23, Math.max(0, h)))}:${pad2(Math.min(59, Math.max(0, minute)))}`;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export function extractFirstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s)<>\]"'，。！？、]+/i);
  if (!m) return null;
  return m[0].replace(/[.,;:!?]+$/, '');
}

export function parseEventText(raw: string, fallbackDateYmd?: string): ParsedEventDraft {
  const today = fallbackDateYmd || new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const yearNow = Number(today.slice(0, 4));
  const monthNow = Number(today.slice(5, 7));

  const text = raw.trim();
  if (!text) return {};

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: ParsedEventDraft = {};

  // 1. URL
  const foundUrl = extractFirstUrl(text);
  if (foundUrl) out.url = foundUrl;

  // 2. Date extraction (priority: explicit YYYY-MM-DD → M月D日 → Eng Month → M/D → relative Chinese)
  const ymd = text.match(/\b(202\d)[-/年.](\d{1,2})[-/月.](\d{1,2})[日号]?\b/);
  if (ymd) {
    const mo = Number(ymd[2]);
    const dy = Number(ymd[3]);
    if (mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) {
      out.date = `${ymd[1]}-${pad2(mo)}-${pad2(dy)}`;
    }
  }

  if (!out.date) {
    const zhMd = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/);
    if (zhMd) {
      const mo = Number(zhMd[1]);
      const dy = Number(zhMd[2]);
      if (mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) {
        const yr = mo < monthNow - 2 ? yearNow + 1 : yearNow;
        out.date = `${yr}-${pad2(mo)}-${pad2(dy)}`;
      }
    }
  }

  if (!out.date) {
    // e.g. "30 Nov 2026", "30 Nov", "Nov 30, 2026", "November 30"
    const engDmy = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)(?:\s*,?\s*(202\d))?\b/i);
    const engMdy = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(202\d))?\b/i);
    if (engDmy) {
      const dy = Number(engDmy[1]);
      const mo = MONTHS[engDmy[2].toLowerCase()];
      const yr = engDmy[3] ? Number(engDmy[3]) : mo < monthNow - 2 ? yearNow + 1 : yearNow;
      if (mo && dy >= 1 && dy <= 31) out.date = `${yr}-${pad2(mo)}-${pad2(dy)}`;
    } else if (engMdy) {
      const mo = MONTHS[engMdy[1].toLowerCase()];
      const dy = Number(engMdy[2]);
      const yr = engMdy[3] ? Number(engMdy[3]) : mo < monthNow - 2 ? yearNow + 1 : yearNow;
      if (mo && dy >= 1 && dy <= 31) out.date = `${yr}-${pad2(mo)}-${pad2(dy)}`;
    }
  }

  if (!out.date) {
    // Numeric M/D (e.g. 11/30 or 12/02), avoid matching URLs or 04 / 05 page numbers
    const textNoUrls = text.replace(/https?:\/\/\S+/gi, ' ');
    const slashMd = textNoUrls.match(/(?:^|[\s,，(（])(\d{1,2})\/(\d{1,2})(?=[\s,，.。)）周]|$)/);
    if (slashMd) {
      const a = Number(slashMd[1]);
      const b = Number(slashMd[2]);
      // Support both MM/DD and SG DD/MM when first number > 12
      const mo = a > 12 ? b : a;
      const dy = a > 12 ? a : b;
      if (mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) {
        const yr = mo < monthNow - 2 ? yearNow + 1 : yearNow;
        out.date = `${yr}-${pad2(mo)}-${pad2(dy)}`;
      }
    }
  }

  if (!out.date) {
    if (/明天/.test(text)) out.date = addDaysYmd(today, 1);
    else if (/后天/.test(text)) out.date = addDaysYmd(today, 2);
    else if (/今天/.test(text)) out.date = today;
    else {
      const wdMatch = text.match(/(本周|这周|下周)([一二三四五六日天])/);
      if (wdMatch) {
        const targetWd = ZH_WEEKDAYS[wdMatch[2]];
        const curWd = new Date(`${today}T12:00:00+08:00`).getUTCDay();
        let diff = (targetWd - curWd + 7) % 7;
        if (wdMatch[1] === '下周') diff += 7;
        out.date = addDaysYmd(today, diff);
      }
    }
  }

  // 3. Time extraction
  // 24h range: 19:00 - 21:00
  const range24 = text.match(/\b(\d{1,2}):(\d{2})\s*[-–—~至到]\s*(\d{1,2}):(\d{2})\b/);
  if (range24) {
    out.startTime = `${pad2(Number(range24[1]))}:${range24[2]}`;
    out.endTime = `${pad2(Number(range24[3]))}:${range24[4]}`;
  } else {
    // 12h range: 6:30 PM - 9:00 PM or 7pm-9pm
    const range12 = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–—~至到]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (range12) {
      const endMer = range12[6].toLowerCase();
      const startMer = (range12[3] || endMer).toLowerCase();
      out.startTime = parse12hTo24h(Number(range12[1]), Number(range12[2] ?? 0), startMer);
      out.endTime = parse12hTo24h(Number(range12[4]), Number(range12[5] ?? 0), endMer);
    } else {
      // Chinese time: 晚上7点-9点 / 下午2点半
      const zhRange = text.match(/(上午|早上|下午|傍晚|晚上)?\s*(\d{1,2})\s*[点時时](?:(\d{1,2})分?|(半))?\s*(?:[-–—~至到]\s*(上午|早上|下午|傍晚|晚上)?\s*(\d{1,2})\s*[点時时](?:(\d{1,2})分?|(半))?)?/);
      if (zhRange) {
        const sMin = zhRange[4] ? 30 : Number(zhRange[3] ?? 0);
        out.startTime = parse12hTo24h(Number(zhRange[2]), sMin, zhRange[1]);
        if (zhRange[6]) {
          const eMin = zhRange[8] ? 30 : Number(zhRange[7] ?? 0);
          out.endTime = parse12hTo24h(Number(zhRange[6]), eMin, zhRange[5] || zhRange[1]);
        }
      } else {
        const single12 = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
        const single24 = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
        if (single12) {
          out.startTime = parse12hTo24h(Number(single12[1]), Number(single12[2] ?? 0), single12[3]);
        } else if (single24) {
          out.startTime = `${pad2(Number(single24[1]))}:${single24[2]}`;
        }
      }
    }
  }
  if (out.startTime && !out.endTime) {
    out.endTime = addHoursHm(out.startTime, 2);
  }

  // 4. Online / Price / Status
  if (/\b(online|virtual|zoom|google\s+meet|webinar|teams|livestream)\b|线上|腾讯会议|直播/i.test(text)) {
    out.isOnline = true;
  }

  const priceMatch = text.match(/(?:S\$|SGD\s*|US\$|\$)\s*(\d+(?:\.\d{1,2})?)/i);
  if (priceMatch && Number(priceMatch[1]) > 0) {
    out.isFree = false;
    out.price = priceMatch[0].replace(/\s+/g, '');
  } else if (/\bfree\b|免费|公益|免票/i.test(text)) {
    out.isFree = true;
  }

  if (/sold\s*out|已满|满员|名额已满/i.test(text)) out.status = 'sold_out';
  else if (/waitlist|候补|排队/i.test(text)) out.status = 'waitlist';
  else if (/approval|需审核|审核制|筛选|invite\s*only|邀请制/i.test(text)) out.status = 'approval';
  else out.status = 'open';

  // 5. Venue / Address
  const venueLine = lines.find((l) => /^(?:📍\s*)?(地点|场地|地址|位置|venue|location|where|address)\s*[:：]/i.test(l));
  if (venueLine) {
    const cleaned = venueLine.replace(/^(?:📍\s*)?(地点|场地|地址|位置|venue|location|where|address)\s*[:：]\s*/i, '').trim();
    if (cleaned) {
      out.venue = cleaned;
      out.address = cleaned;
    }
  }
  if (!out.venue && !out.isOnline) {
    const atMatch = text.match(/(?:^|\s)@\s*([A-Za-z0-9\u4e00-\u9fa5][^\n|·]{2,48})/);
    if (atMatch) {
      out.venue = atMatch[1].trim();
      out.address = atMatch[1].trim();
    } else {
      for (const re of KNOWN_SG_PLACES) {
        const m = text.match(re);
        if (m) {
          out.venue = m[0].trim();
          out.address = m[0].trim();
          break;
        }
      }
    }
  }

  // 6. Organiser
  const orgLine = lines.find((l) => /^(?:👥|🏢)?\s*(主办方|主办|发起方|社群|host(?:ed)?\s*by|organis(?:er|ed\s*by)|organiz(?:er|ed\s*by)|by)\s*[:：]?/i.test(l));
  if (orgLine) {
    const cleaned = orgLine
      .replace(/^(?:👥|🏢)?\s*(主办方|主办|发起方|社群|host(?:ed)?\s*by|organis(?:er|ed\s*by)|organiz(?:er|ed\s*by)|by)\s*[:：]?\s*/i, '')
      .trim();
    if (cleaned) out.organiser = cleaned.slice(0, 60);
  }

  // 7. Title: prefer explicit "标题/活动:" or first meaningful headline line
  const explicitTitle = lines.find((l) => /^(活动名称|活动主题|活动|主题|标题|title|event)\s*[:：]/i.test(l));
  if (explicitTitle) {
    out.title = explicitTitle.replace(/^(活动名称|活动主题|活动|主题|标题|title|event)\s*[:：]\s*/i, '').trim();
  } else {
    const metaRe = /^(https?:\/\/|日期|时间|地点|场地|地址|主办|链接|报名|费用|门票|状态|date|time|venue|location|where|host|organis|link|register|rsvp|price|ticket)\b/i;
    const noiseRe = /^(人在坡岛|stay\s*sg|sg\s*ai\s*oasis|scan|qr\s*code|扫码|长按|点击|free|免费|\d{1,2}\s*\/\s*\d{1,2})$/i;
    const candidate = lines.find((l) => {
      const clean = l.replace(/^[【\[#\-\*•🔥✨🚀📅📍⏰]+\s*/, '').trim();
      if (clean.length < 4) return false;
      if (metaRe.test(clean) || noiseRe.test(clean)) return false;
      if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(clean)) return false;
      if (/^\d{1,2}:\d{2}/.test(clean)) return false;
      return true;
    });
    if (candidate) {
      out.title = candidate.replace(/^[【\[#\-\*•🔥✨🚀]+\s*/, '').replace(/[】\]]$/, '').trim().slice(0, 120);
    }
  }

  return out;
}

// ─── Luma API parser (https://api.lu.ma/url?url=<slug>) ──────────────────────

function extractProseMirrorText(node: any, out: string[] = []): string[] {
  if (!node || typeof node !== 'object') return out;
  if (typeof node.text === 'string' && node.text.trim()) {
    out.push(node.text.trim());
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      extractProseMirrorText(child, out);
      if (out.length >= 24) break;
    }
  }
  return out;
}

export function parseLumaApiPayload(payload: any, originalUrl: string): ParsedEventDraft | null {
  if (!payload || payload.kind !== 'event' || !payload.data?.event) return null;
  const data = payload.data;
  const ev = data.event;

  const start = ev.start_at ? isoToSgtDateAndTime(ev.start_at) : null;
  const end = ev.end_at ? isoToSgtDateAndTime(ev.end_at) : null;

  const geoInfo = ev.geo_address_info || {};
  const isShown = geoInfo.mode === 'shown' || Boolean(geoInfo.full_address || geoInfo.address);
  const isOnline = ev.location_type === 'online';

  const venue = isOnline
    ? 'Online'
    : isShown
      ? String(geoInfo.address || geoInfo.short_address || '').trim()
      : '';
  const address = isOnline
    ? ''
    : isShown
      ? String(geoInfo.full_address || geoInfo.short_address || geoInfo.address || '').trim()
      : '';

  const coord = ev.coordinate || {};
  const lat = !isOnline && isShown && typeof coord.latitude === 'number' ? coord.latitude : null;
  const lng = !isOnline && isShown && typeof coord.longitude === 'number' ? coord.longitude : null;

  const ticket = data.ticket_info || {};
  const isFree = ticket.is_free !== false;
  let price = '';
  if (!isFree && ticket.price?.cents) {
    const curr = ticket.price.currency?.toUpperCase() === 'SGD' ? 'S$' : `${ticket.price.currency?.toUpperCase() ?? ''} `;
    price = `${curr}${(Number(ticket.price.cents) / 100).toFixed(0)}`;
  }

  let status: ParsedEventDraft['status'] = 'open';
  if (ticket.is_sold_out || data.sold_out) status = 'sold_out';
  else if (data.waitlist_active) status = 'waitlist';
  else if (ticket.require_approval) status = 'approval';

  // Keep calendar/organisation name only (avoid personal host profiles per AGENTS.md)
  const organiser = String(data.calendar?.name || '').trim();

  // Extract a concise description snippet from Luma description_mirror if available
  const descPieces = extractProseMirrorText(data.description_mirror);
  const descSummary = descPieces
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  return {
    title: String(ev.name || '').trim() || undefined,
    date: start?.date,
    startTime: start?.time,
    endTime: end?.time,
    organiser: organiser || undefined,
    isOnline,
    venue,
    address,
    lat,
    lng,
    url: ev.url ? `https://luma.com/${ev.url}` : originalUrl,
    coverImageUrl: ev.cover_url || null,
    isFree,
    price,
    status,
    friendNote: descSummary || undefined,
  };
}

// ─── Generic HTML (JSON-LD Event + OpenGraph + visible text) parser ──────────

function extractMeta(html: string, key: string): string {
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, 'i');
  const m = html.match(re1) || html.match(re2);
  return m ? decodeHtmlEntities(m[1]).trim() : '';
}

function findEventObjects(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(findEventObjects);
  const t = node['@type'];
  const isEvent =
    typeof t === 'string'
      ? /Event$/i.test(t)
      : Array.isArray(t) && t.some((x) => typeof x === 'string' && /Event$/i.test(x));
  const out = isEvent ? [node] : [];
  if (node['@graph']) out.push(...findEventObjects(node['@graph']));
  return out;
}

export function parseHtmlEventPage(html: string, sourceUrl: string, fallbackDateYmd?: string): {
  draft: ParsedEventDraft;
  sourceLabel: string;
} {
  const out: ParsedEventDraft = { url: sourceUrl };
  let sourceLabel = '网页 Meta / 正文提取';

  // 1. JSON-LD @type: Event
  const ldMatches = Array.from(
    html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  );
  for (const m of ldMatches) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const events = findEventObjects(parsed);
      if (events.length > 0) {
        const ev = events[0];
        sourceLabel = '网页 JSON-LD 活动数据';
        if (ev.name) out.title = decodeHtmlEntities(String(ev.name)).trim();
        if (ev.startDate) {
          const s = isoToSgtDateAndTime(String(ev.startDate));
          if (s) {
            out.date = s.date;
            out.startTime = s.time;
          }
        }
        if (ev.endDate) {
          const e = isoToSgtDateAndTime(String(ev.endDate));
          if (e) out.endTime = e.time;
        }
        if (typeof ev.eventAttendanceMode === 'string' && /Online/i.test(ev.eventAttendanceMode)) {
          out.isOnline = true;
        }
        const loc = Array.isArray(ev.location) ? ev.location[0] : ev.location;
        if (loc && typeof loc === 'object') {
          if (loc['@type'] === 'VirtualLocation') {
            out.isOnline = true;
          } else {
            if (loc.name) out.venue = decodeHtmlEntities(String(loc.name)).trim();
            const addr = loc.address;
            if (typeof addr === 'string') {
              out.address = decodeHtmlEntities(addr).trim();
            } else if (addr && typeof addr === 'object') {
              out.address = [addr.streetAddress, addr.addressLocality, addr.postalCode, addr.addressCountry]
                .filter(Boolean)
                .map((x) => decodeHtmlEntities(String(x)).trim())
                .join(', ');
            }
            if (loc.geo?.latitude && loc.geo?.longitude) {
              const lat = Number(loc.geo.latitude);
              const lng = Number(loc.geo.longitude);
              if (Number.isFinite(lat) && Number.isFinite(lng)) {
                out.lat = lat;
                out.lng = lng;
              }
            }
          }
        }
        const org = Array.isArray(ev.organizer) ? ev.organizer[0] : ev.organizer;
        if (org) {
          out.organiser = decodeHtmlEntities(typeof org === 'string' ? org : String(org.name || '')).trim() || undefined;
        }
        const offer = Array.isArray(ev.offers) ? ev.offers[0] : ev.offers;
        if (offer && typeof offer === 'object') {
          const p = Number(offer.price);
          if (Number.isFinite(p)) {
            out.isFree = p === 0;
            if (p > 0) out.price = `${offer.priceCurrency || 'S$'}${p}`;
          }
          if (typeof offer.availability === 'string' && /SoldOut/i.test(offer.availability)) {
            out.status = 'sold_out';
          }
        }
        if (typeof ev.image === 'string') out.coverImageUrl = ev.image;
        else if (Array.isArray(ev.image) && typeof ev.image[0] === 'string') out.coverImageUrl = ev.image[0];
        break;
      }
    } catch {
      // ignore invalid JSON-LD blocks
    }
  }

  // 2. OpenGraph / Title fallbacks (especially useful for WeChat / Peatix / custom blogs)
  const ogTitle = extractMeta(html, 'og:title');
  const ogDesc = extractMeta(html, 'og:description') || extractMeta(html, 'description');
  const ogImage = extractMeta(html, 'og:image');
  const ogSite = extractMeta(html, 'og:site_name');
  const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const htmlTitle = titleTagMatch ? decodeHtmlEntities(titleTagMatch[1]).replace(/\s+/g, ' ').trim() : '';

  if (!out.title) {
    out.title = (ogTitle || htmlTitle).replace(/\s*[·|\-–]\s*(Luma|Eventbrite|Meetup|Peatix)$/i, '').trim() || undefined;
  }
  if (!out.coverImageUrl && ogImage) out.coverImageUrl = ogImage;
  if (!out.organiser && ogSite && !/^(Luma|Eventbrite|Meetup|WeChat|微信)$/i.test(ogSite)) {
    out.organiser = ogSite;
  }

  // 3. Fill any missing date/time/venue from page text + og:description
  if (!out.date || !out.startTime || !out.venue) {
    const plainBody = decodeHtmlEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, '\n'),
    )
      .replace(/\n{2,}/g, '\n')
      .slice(0, 8000);
    const fallback = parseEventText(`${ogTitle}\n${ogDesc}\n${plainBody}`, fallbackDateYmd);
    if (!out.date && fallback.date) out.date = fallback.date;
    if (!out.startTime && fallback.startTime) out.startTime = fallback.startTime;
    if (!out.endTime && fallback.endTime) out.endTime = fallback.endTime;
    if (!out.venue && fallback.venue) {
      out.venue = fallback.venue;
      out.address = fallback.address;
    }
    if (out.isOnline === undefined && fallback.isOnline) out.isOnline = true;
    if (out.isFree === undefined && fallback.isFree !== undefined) {
      out.isFree = fallback.isFree;
      out.price = fallback.price;
    }
  }

  return { draft: out, sourceLabel };
}

export function enrichDraftWithGeo(draft: ParsedEventDraft): ParsedEventDraft & { matchedLocationLabel?: string } {
  if (draft.isOnline || (!draft.venue && !draft.address && draft.lat == null)) {
    return draft;
  }
  const dummy: SgEvent = {
    id: 'draft',
    title: draft.title || 'draft',
    startAt: new Date().toISOString(),
    venue: draft.venue || '',
    address: draft.address || '',
    lat: draft.lat ?? null,
    lng: draft.lng ?? null,
    url: draft.url || '',
    organiser: draft.organiser || '',
    isFree: draft.isFree ?? true,
    status: draft.status ?? 'open',
    isOnline: Boolean(draft.isOnline),
    tags: [],
    sourceIds: [],
    companyIds: [],
    firstSeen: '',
  };
  const geo = resolveEventGeo(dummy);
  if (!geo) return draft;
  return {
    ...draft,
    lat: draft.lat ?? (geo.precision === 'exact' ? geo.lat : null),
    lng: draft.lng ?? (geo.precision === 'exact' ? geo.lng : null),
    matchedLocationLabel: geo.mrtName
      ? `${geo.mrtName} 站（步行约 ${geo.mrtWalkMins} 分钟）`
      : geo.areaLabel
        ? `${geo.areaLabel} 区域`
        : undefined,
  };
}
