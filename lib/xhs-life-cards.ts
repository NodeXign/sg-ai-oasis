import QRCode from 'qrcode';
import type { Company, SgEvent } from './types';
import { resolveEventGeo } from './sg-geo';

export type DiagrammeStyle = 'notionaly' | 'diagram-design' | 'hairline';

export interface XhsEventItem {
  id: string;
  title: string;
  startAt: string;
  endAt?: string | null;
  venue: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
  url: string;
  coverImageUrl?: string | null;
  organiser: string;
  isFree: boolean | null;
  price?: string | null;
  status: 'open' | 'approval' | 'waitlist' | 'sold_out';
  isOnline: boolean;
  tags: string[];
  companyIds: string[];
  isFriendEvent?: boolean;
  friendNote?: string;
  publishToSite?: boolean;
  hiringCompanyNames?: string[];
  hiringRolesTotal?: number;
  mrtLabel?: string;
}

export interface XhsDeckConfig {
  startDate: string; // YYYY-MM-DD (SGT)
  endDate: string;   // YYYY-MM-DD (SGT)
  kicker: string;
  footerTopic: string;
  coverTitle: string;
  coverIntro: string;
  siteUrl: string;
  searchKeywords: string;
  selectedEventIds: string[];
  pickEventIds: string[];
  audienceNotes: Record<string, string>;
  customPosters?: Record<string, string>; // eventId -> uploaded data URL poster override
  // Card 01 map snapshot (optional real 2D screenshot of website map; falls back to live GPS SVG map)
  coverMapSnapshotDataUrl?: string | null;
  // Card 03 optional custom stat highlight (e.g. real RSVP count checked from Luma)
  card3StatHighlight?: string;
  // Card 04 flexible per-post content + website/GO-NOGO screenshot
  card4Title?: string;
  card4Intro?: string;
  card4Point1Title?: string;
  card4Point1Body?: string;
  card4Point2Title?: string;
  card4Point2Body?: string;
  card4ScreenshotDataUrl?: string | null;
  // Optional extra full directory pages if > 8 events (default true so ALL selected dates & events appear)
  includeOverflowChecklist: boolean;
  // Route external https poster URLs through /api/admin/image-proxy for browser-side PNG export (CORS-safe)
  proxyExternalImages?: boolean;
  exceptionReason?: string;
  cardHtmlOverrides?: Record<string, string>; // key = "01", "02", ...
}

export interface GeneratedCard {
  pageNumber: string;       // "01"
  pageTotal: string;        // "05"
  filename: string;         // "01.html"
  pngFilename: string;      // "01.png"
  role: string;
  primaryStyle: DiagrammeStyle;
  titlePlain: string;
  html: string;
  warnings: string[];
}

export interface StyleRatioSummary {
  total: number;
  counts: Record<DiagrammeStyle, number>;
  percents: Record<DiagrammeStyle, number>;
  target: Record<DiagrammeStyle, number>;
  matchesTarget: boolean;
}

export interface GeneratedXhsPack {
  packSlug: string;
  cards: GeneratedCard[];
  captionMd: string;
  usageJson: string;
  ratio: StyleRatioSummary;
  footerViolations: string[];
}

const TZ = 'Asia/Singapore';

const FORBIDDEN_FOOTER_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /朋友口吻|口吻|语气/i, label: '口吻指令' },
  { re: /朋友分享版|分享版|受众指令/i, label: '受众版本指令' },
  { re: /给\s*AI|prompt\s*指令|人设/i, label: 'Agent 指令词' },
];

export function checkFooterTopic(topic: string): string[] {
  const issues: string[] = [];
  if (!topic.trim()) {
    issues.push('左下角主题不能为空');
    return issues;
  }
  for (const p of FORBIDDEN_FOOTER_PATTERNS) {
    if (p.re.test(topic)) {
      issues.push(`左下角页脚不能包含「${p.label}」，请只写内容主题`);
    }
  }
  return issues;
}

function esc(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(str: string, max: number): string {
  const clean = str.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function sgDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
}

function fmtShortDate(ymd: string): string {
  const parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

function fmtEventDateTime(iso: string): string {
  const d = new Date(iso);
  const md = fmtShortDate(sgDateKey(iso));
  const wd = new Intl.DateTimeFormat('zh-CN', { weekday: 'short', timeZone: TZ }).format(d);
  const tm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).format(d);
  return `${md} ${wd} ${tm}`;
}

function fmtEventTimeRange(startIso: string, endIso?: string | null): string {
  const base = fmtEventDateTime(startIso);
  if (!endIso) return base;
  const endTm = fmtTimeOnly(endIso);
  return `${base} – ${endTm}`;
}

function shortDisplayUrl(raw?: string): string {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, '');
    const pathPart = u.pathname.replace(/\/+$/, '');
    const combined = `${host}${pathPart}`;
    return combined.length > 34 ? `${combined.slice(0, 33)}…` : combined;
  } catch {
    return truncate(raw, 34);
  }
}

function selectBalancedOverview(events: XhsEventItem[], cap: number): {
  shown: XhsEventItem[];
  rest: XhsEventItem[];
} {
  if (events.length <= cap) return { shown: events, rest: [] };
  // Round-robin across every distinct SGT date so no day in the window is completely dropped
  const byDay = new Map<string, XhsEventItem[]>();
  for (const e of events) {
    const k = sgDateKey(e.startAt);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  const queues = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, list]) => [...list]);

  const pickedIds = new Set<string>();
  const picked: XhsEventItem[] = [];
  let progressed = true;
  while (picked.length < cap && progressed) {
    progressed = false;
    for (const q of queues) {
      if (picked.length >= cap) break;
      const next = q.shift();
      if (next) {
        picked.push(next);
        pickedIds.add(next.id);
        progressed = true;
      }
    }
  }
  picked.sort((a, b) => a.startAt.localeCompare(b.startAt));
  const rest = events.filter((e) => !pickedIds.has(e.id));
  return { shown: picked, rest };
}

function buildPreEventTip(e: XhsEventItem): string {
  const tips: string[] = [];
  if (e.status === 'sold_out') tips.push('当前显示已满，建议点官方页留意候补或现场释出名额');
  else if (e.status === 'waitlist') tips.push('当前候补状态，建议先提交登记');
  else if (e.status === 'approval') tips.push('主办方需审核报名，建议提前 1–2 天提交资料');
  else tips.push('开放报名中，建议尽早占位');

  if (e.isOnline) tips.push('线上活动，免通勤');
  else if (e.mrtLabel) tips.push(`近 ${e.mrtLabel}，出发前核对具体门牌/教室`);
  else if (!e.venue && !e.address) tips.push('具体地址报名通过后公开');

  return `${tips.join('；')}。`;
}

function renderPosterVisual(
  e: XhsEventItem,
  posterUrl: string | null | undefined,
  opts: { width: string; height: string; radius?: number },
): string {
  const r = opts.radius ?? 10;
  const md = fmtShortDate(sgDateKey(e.startAt));
  const place = shortVenue(e);
  if (posterUrl) {
    return `<div style="width:${opts.width};height:${opts.height};border-radius:${r}px;border:1.5px solid #231F20;overflow:hidden;background:#FAFAFA;flex-shrink:0;position:relative;">
      <img src="${esc(posterUrl)}" alt="${esc(truncate(e.title, 30))}" style="width:100%;height:100%;object-fit:cover;display:block;"/>
    </div>`;
  }
  return `<div style="width:${opts.width};height:${opts.height};border-radius:${r}px;border:1.5px solid #231F20;background:#231F20;color:#FFFFFF;flex-shrink:0;padding:16px;display:flex;flex-direction:column;justify-content:space-between;">
    <span style="font-size:15px;font-weight:700;letter-spacing:1px;opacity:0.75;">SG AI OASIS</span>
    <div>
      <div style="font-size:34px;font-weight:800;line-height:1.05;letter-spacing:-1px;">${esc(md)}</div>
      <div style="font-size:15px;margin-top:6px;opacity:0.86;line-height:1.3;">${esc(truncate(place, 16))}</div>
    </div>
  </div>`;
}

function fmtTimeOnly(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TZ,
  }).format(new Date(iso));
}

function statusZh(status: XhsEventItem['status']): string {
  if (status === 'approval') return '需审核';
  if (status === 'waitlist') return '候补';
  if (status === 'sold_out') return '已满';
  return '可报名';
}

function priceZh(e: XhsEventItem): string {
  if (e.isFree === true) return '免费';
  if (e.isFree === false) return e.price ? truncate(e.price, 12) : '收费';
  return '';
}

function shortVenue(e: XhsEventItem): string {
  if (e.isOnline) return '线上';
  if (e.mrtLabel) return e.mrtLabel;
  if (e.venue) return truncate(e.venue, 24);
  return '地址报名后公开';
}

// Deterministic rule-based audience & interest classifier (zero LLM, per AGENTS.md)
export function inferAudienceFit(e: XhsEventItem): { audience: string; interest: string } {
  const text = `${e.title} ${e.organiser} ${e.tags.join(' ')}`.toLowerCase();

  if (/职场|求职|职业|career/.test(text) && /创业|founder|startup/.test(text)) {
    return {
      audience: '探索 AI 职场进阶与创业路径的人',
      interest: 'AI 职场 · 创业对话',
    };
  }
  if (/robotics|embodied|physical ai|hardware/.test(text)) {
    return {
      audience: '机器人 / 具身智能研究者与工程师',
      interest: '具身智能 · 物理世界 AI',
    };
  }
  if (/hackathon|build|prototyping|hands-on|workshop|vibe cod|devfest/.test(text)) {
    return {
      audience: '开发者 / 产品构建者',
      interest: '动手实战 · Agent 工程',
    };
  }
  if (/enterprise|scaling ai|future of work|strategy|cio|cto|governance|safety/.test(text)) {
    return {
      audience: '企业转型 / AI 战略与 PM',
      interest: '企业落地 · 组织与治理',
    };
  }
  if (/walk|coffee|mixer|drinks|networking|social|unite|breakfast/.test(text)) {
    return {
      audience: '想认识新加坡 AI 同频伙伴的人',
      interest: '轻量社交 · 跨界连接',
    };
  }
  if (/founder|startup|vc|investor|pitch|demo day|创业|路演|投资/.test(text)) {
    return {
      audience: '创业者 / 早期项目观察者',
      interest: 'AI 创业 · 投资与路演',
    };
  }
  if (/职场|求职|职业|career/.test(text)) {
    return {
      audience: '关注 AI 时代职场转型与发展的从业者',
      interest: '职场转型 · 实战分享',
    };
  }
  if ((e.hiringCompanyNames?.length ?? 0) > 0) {
    return {
      audience: '关注新加坡 AI 岗位的求职/转型者',
      interest: `直连在招团队 · ${e.hiringCompanyNames![0]}`,
    };
  }
  return {
    audience: '关注 AI 趋势的从业者与学习者',
    interest: '前沿应用 · 社区分享',
  };
}

// ─── Exact card-shell.html wrapper (PORTABLE_SPEC.md compliant) ─────────────

const STAY_SG_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 92 48" width="92" height="48">
        <rect x="4" y="4" width="84" height="30" rx="5" fill="#231F20"/>
        <text x="46" y="25" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system, 'Helvetica Neue', Arial, sans-serif" font-size="18" font-weight="800" font-style="italic" letter-spacing="-0.3">Stay SG</text>
        <g transform="translate(41, 25)">
          <path d="M4 2 C4 0.5 6.5 0.5 6.5 2 L6.5 7.5 L8 7.5 C9.2 7.5 10 8.3 10 9.5 L10 10.5 C11.2 10.5 12 11.3 12 12.5 L12 15.5 C12 18 10 20 7.5 20 L5.5 20 C3.2 20 1.5 18.2 1.5 15.8 L1.5 11.5 C1.5 10.2 2.5 9.5 4 9.5 Z" fill="#FFFFFF" stroke="#231F20" stroke-width="1.3" stroke-linejoin="round"/>
        </g>
      </svg>`;

function renderCardShell(opts: {
  titlePlain: string;
  kicker: string;
  titleHtml: string;
  bodyHtml: string;
  footerTopic: string;
  pageNum: string;
  pageTotal: string;
  extraCss?: string;
}): string {
  return `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<title>${esc(opts.titlePlain)}</title>
<style>
  :root {
    --ink: #231F20;
    --ink-pill: #141414;
    --tint: rgba(35, 31, 32, .20);
    --tint-8: rgba(35, 31, 32, .08);
    --paper: #FFFFFF;
    --paper-2: #FAFAFA;
    --muted: #616161;
    --line: #B8B8B8;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: 1080px;
    height: 1440px;
    padding: 50px 68px 86px;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: var(--paper);
    color: var(--ink);
    font-family: -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .brand-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--line);
    padding-bottom: 18px;
    margin-bottom: 20px;
    flex-shrink: 0;
  }
  .brand-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--ink-pill);
    color: #FFFFFF;
    border-radius: 999px;
    padding: 10px 28px;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 1px;
    line-height: 1.2;
  }
  .brand-logo {
    display: inline-flex;
    align-items: center;
    height: 46px;
  }
  .kicker {
    font-size: 21px;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: var(--muted);
    margin: 0 0 8px;
    flex-shrink: 0;
  }
  h1 {
    font-size: 62px;
    font-weight: 800;
    line-height: 1.14;
    letter-spacing: -1.8px;
    margin: 0 0 12px;
    flex-shrink: 0;
  }
  p {
    font-size: 28px;
    line-height: 1.48;
    margin: 0;
  }
  .page-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 14px;
  }
  footer {
    position: absolute;
    bottom: 40px;
    left: 68px;
    right: 68px;
    display: flex;
    justify-content: space-between;
    font-size: 20px;
    font-weight: 500;
    color: var(--muted);
  }
  .note {
    border-top: 1px solid var(--line);
    padding-top: 16px;
    font-size: 25px;
    line-height: 1.48;
  }
  .small {
    font-size: 21px;
    color: var(--muted);
    line-height: 1.45;
  }
  .frame-box {
    border: 1.75px solid var(--ink);
    border-radius: 12px;
    background: var(--paper);
    overflow: hidden;
  }
  .frame-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    background: var(--paper-2);
    border-bottom: 1px solid #D4D4D4;
    font-size: 21px;
    font-weight: 700;
  }
  .kpi-strip {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }
  .kpi-strip-4 {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  .kpi-cell {
    border: 1.5px solid var(--ink);
    border-radius: 10px;
    padding: 13px 18px;
    background: var(--paper-2);
  }
  .kpi-cell--dark {
    background: var(--ink);
    color: #FFFFFF;
  }
  .kpi-cell--dark .kpi-lbl { color: rgba(255,255,255,0.85); }
  .kpi-num {
    font-size: 44px;
    font-weight: 800;
    line-height: 1.06;
    letter-spacing: -1px;
  }
  .kpi-lbl {
    font-size: 21px;
    font-weight: 600;
    color: #404040;
    margin-top: 4px;
  }
  .district-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    border: 1.25px solid #C8C8C8;
    border-radius: 10px;
    padding: 13px 20px;
    background: var(--paper-2);
    font-size: 22px;
    font-weight: 500;
  }
  .tag-pill {
    display: inline-flex;
    align-items: center;
    font-size: 17.5px;
    font-weight: 700;
    padding: 3px 11px;
    border-radius: 999px;
    border: 1.25px solid var(--ink);
    background: var(--paper);
    color: var(--ink);
    white-space: nowrap;
  }
  .tag-pill--dark {
    background: var(--ink);
    color: #FFFFFF;
  }
  .tag-pill--soft {
    border-color: #B4B4B4;
    background: var(--paper-2);
    color: #2B2829;
  }
  .overview-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 10px;
  }
  .ov-row {
    border: 1.25px solid var(--ink);
    border-radius: 10px;
    padding: 12px 18px;
    background: var(--paper);
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .ov-row--friend {
    border-width: 2px;
    background: var(--paper-2);
  }
  .ov-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  .ov-title {
    font-size: 22px;
    font-weight: 700;
    line-height: 1.25;
  }
  .ov-fit {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    font-size: 18px;
    color: var(--muted);
  }
  .pick-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 14px;
  }
  .pick-card {
    flex: 1;
    border: 1.5px solid var(--ink);
    border-radius: 12px;
    padding: 18px 22px;
    background: var(--paper);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 8px;
  }
  .pick-card--hero {
    border-width: 2px;
    background: var(--paper-2);
  }
  .pick-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  .pick-time {
    font-size: 19px;
    font-weight: 700;
  }
  .pick-tags {
    display: flex;
    gap: 7px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .pick-title {
    font-size: 26px;
    font-weight: 700;
    line-height: 1.26;
  }
  .pick-meta {
    font-size: 19px;
    color: var(--muted);
  }
  .pick-fit {
    padding-top: 8px;
    border-top: 1px dashed var(--line);
    font-size: 19px;
    color: var(--ink);
  }
  .feature-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    flex: 1;
  }
  .feature-card {
    border: 1.5px solid var(--ink);
    border-radius: 12px;
    padding: 22px 24px;
    background: var(--paper);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 10px;
  }
  .feature-card--alt {
    background: var(--paper-2);
  }
  .feature-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .feature-num {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 1px;
    padding: 4px 13px;
    border-radius: 999px;
    background: var(--ink);
    color: #FFFFFF;
  }
  .feature-title {
    font-size: 34px;
    font-weight: 800;
    line-height: 1.18;
    margin-top: 6px;
  }
  .feature-desc {
    font-size: 24px;
    line-height: 1.46;
    color: #2E2B2C;
  }
  .feature-path {
    font-family: "SF Mono", Menlo, Monaco, Consolas, monospace;
    font-size: 19px;
    font-weight: 600;
    color: #4A4647;
  }
  .qr-cta-box {
    border: 2px solid var(--ink);
    border-radius: 14px;
    background: var(--paper-2);
    padding: 24px 28px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 28px;
  }
  .prompt-box {
    border: 1.75px solid var(--ink);
    border-radius: 10px;
    background: var(--paper-2);
    padding: 22px 26px;
  }
  .prompt-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #D4D4D4;
    padding-bottom: 12px;
    margin-bottom: 14px;
  }
  .prompt-title { font-size: 24px; font-weight: 700; }
  .prompt-tag {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 1px;
    padding: 4px 12px;
    border: 1px solid var(--ink);
    border-radius: 999px;
    background: var(--paper);
  }
  .prompt-code {
    font-family: "SF Mono", Menlo, Monaco, Consolas, "PingFang SC", "Microsoft YaHei", monospace;
    font-size: 20px;
    line-height: 1.62;
    color: var(--ink);
    white-space: pre-wrap;
    margin: 0;
  }
  ${opts.extraCss ?? ''}
</style>
<body>
  <header class="brand-header">
    <span class="brand-pill">人在坡岛</span>
    <span class="brand-logo" aria-label="Stay SG">
      ${STAY_SG_LOGO_SVG}
    </span>
  </header>
  <p class="kicker">${esc(opts.kicker)}</p>
  <h1>${opts.titleHtml}</h1>
  <div class="page-body">
    ${opts.bodyHtml}
  </div>
  <footer>
    <span>${esc(opts.footerTopic)}</span>
    <span>${esc(opts.pageNum)} / ${esc(opts.pageTotal)}</span>
  </footer>
</body>
</html>`;
}

// ─── District aggregation ────────────────────────────────────────────────────

type DistrictKey = 'one_north' | 'cbd_marina' | 'bugis_city' | 'pasir_west' | 'other_online';

function classifyDistrict(e: XhsEventItem): DistrictKey {
  if (e.isOnline) return 'other_online';
  const text = `${e.venue} ${e.address} ${e.mrtLabel ?? ''}`.toLowerCase();
  if (/one[-\s]?north|ayer rajah|block\s*71|b71|lorong ai|launch\s*pad|buona vista|kent ridge|nus/.test(text)) {
    return 'one_north';
  }
  if (/pasir panjang|google developers|harbourfront|labrador|mapletree|ntu|jurong/.test(text)) {
    return 'pasir_west';
  }
  if (/marina bay|raffles|market st|capitaspring|tanjong pagar|shenton|cbd|robinson|telok ayer|chinatown|carpenter|clarke quay/.test(text)) {
    return 'cbd_marina';
  }
  if (/bugis|bras basah|city hall|victoria|national library|suntec|orchard|somerset|dhoby|esplanade|beach rd/.test(text)) {
    return 'bugis_city';
  }
  const geo = resolveEventGeo(e as SgEvent);
  if (geo) {
    if (geo.lng < 103.805) return geo.lat < 1.285 ? 'pasir_west' : 'one_north';
    if (geo.lat < 1.290) return 'cbd_marina';
    if (geo.lng < 103.868) return 'bugis_city';
  }
  return 'other_online';
}

// ─── Card 01: Live GPS-Linked Singapore Map SVG (Hairline) ──────────────────

function buildLinkedSgMapSvg(events: XhsEventItem[]): {
  svg: string;
  mappedCount: number;
  offMapCount: number;
} {
  // Real Singapore bounding box projected onto 936 x 560 SVG canvas
  const W = 936;
  const H = 560;
  const minLng = 103.655;
  const maxLng = 104.015;
  const minLat = 1.235;
  const maxLat = 1.445;

  const proj = (lat: number, lng: number) => {
    const x = ((lng - minLng) / (maxLng - minLng)) * (W - 96) + 48;
    const y = (1 - (lat - minLat) / (maxLat - minLat)) * (H - 92) + 46;
    return {
      x: Math.round(Math.max(44, Math.min(W - 44, x))),
      y: Math.round(Math.max(44, Math.min(H - 54, y))),
    };
  };

  // Real approximate Singapore main island polygon (lat, lng)
  const sgCoast: [number, number][] = [
    [1.334, 103.635], [1.378, 103.662], [1.412, 103.688], [1.438, 103.725],
    [1.452, 103.765], [1.468, 103.802], [1.462, 103.842], [1.434, 103.878],
    [1.412, 103.912], [1.392, 103.962], [1.364, 104.002], [1.326, 103.988],
    [1.312, 103.952], [1.300, 103.914], [1.292, 103.878], [1.278, 103.860],
    [1.268, 103.840], [1.265, 103.816], [1.276, 103.788], [1.292, 103.758],
    [1.304, 103.715], [1.315, 103.670],
  ];
  const coastPath =
    sgCoast
      .map(([lat, lng], i) => {
        const p = proj(lat, lng);
        return `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`;
      })
      .join(' ') + ' Z';

  // Sentosa small island silhouette
  const sentosaPts: [number, number][] = [
    [1.257, 103.810], [1.259, 103.828], [1.249, 103.842], [1.243, 103.825], [1.250, 103.808],
  ];
  const sentosaPath =
    sentosaPts
      .map(([lat, lng], i) => {
        const p = proj(lat, lng);
        return `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`;
      })
      .join(' ') + ' Z';

  // MRT trunk lines (East-West & North-South subtle dashed hairline)
  const ewLine: [number, number][] = [
    [1.333, 103.742], [1.307, 103.790], [1.290, 103.818], [1.284, 103.851], [1.301, 103.856], [1.318, 103.892], [1.353, 103.944],
  ];
  const nsLine: [number, number][] = [
    [1.429, 103.835], [1.351, 103.849], [1.304, 103.832], [1.293, 103.852], [1.276, 103.854],
  ];
  const polyStr = (pts: [number, number][]) =>
    pts
      .map(([lat, lng]) => {
        const p = proj(lat, lng);
        return `${p.x},${p.y}`;
      })
      .join(' ');

  // District reference captions
  const refDistricts: { label: string; lat: number; lng: number }[] = [
    { label: 'JURONG', lat: 1.336, lng: 103.726 },
    { label: 'ONE-NORTH', lat: 1.314, lng: 103.776 },
    { label: 'ORCHARD', lat: 1.314, lng: 103.832 },
    { label: 'BUGIS', lat: 1.312, lng: 103.868 },
    { label: 'MARINA BAY', lat: 1.266, lng: 103.875 },
    { label: 'EAST COAST', lat: 1.312, lng: 103.938 },
  ];

  // Cluster nearby mapped events so dense venues show clean badges ("01 +2")
  interface MapCluster {
    x: number;
    y: number;
    events: XhsEventItem[];
    isPriority: boolean;
    label: string;
  }

  const clusters: MapCluster[] = [];
  let mappedCount = 0;

  for (const e of events) {
    const geo = resolveEventGeo(e as SgEvent);
    if (!geo) continue;
    mappedCount += 1;
    const pt = proj(geo.lat, geo.lng);
    const isPriority = (e.hiringCompanyNames?.length ?? 0) > 0;
    const existing = clusters.find((c) => Math.hypot(c.x - pt.x, c.y - pt.y) < 34);
    if (existing) {
      existing.events.push(e);
      if (isPriority) existing.isPriority = true;
    } else {
      const placeShort = geo.mrtName || geo.areaLabel || truncate(e.venue, 12);
      clusters.push({
        x: pt.x,
        y: pt.y,
        events: [e],
        isPriority,
        label: placeShort,
      });
    }
  }

  // Place callout pills with generous radial offsets so dense south-coast clusters never collide
  const placedBoxes: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const pinCenters = clusters.slice(0, 10).map((c) => ({ x: c.x, y: c.y }));

  const leaderParts: string[] = [];
  const pinParts: string[] = [];
  const pillParts: string[] = [];

  clusters.slice(0, 10).forEach((c, idx) => {
    const countTag = c.events.length > 1 ? ` · ${c.events.length}场` : '';
    const baseName = truncate(c.label, 14);
    const pillText = `${String(idx + 1).padStart(2, '0')} ${baseName}${countTag}`;
    const pillW = Math.min(264, Math.max(150, pillText.length * 10.2 + 28));
    const pillH = 36;

    const offsets: [number, number][] = [
      [-pillW - 36, -98],
      [38, -94],
      [-pillW / 2, -118],
      [-pillW - 38, 44],
      [40, 44],
      [-pillW / 2, 68],
      [-pillW - 26, -34],
      [34, -34],
      [-pillW / 2, -168],
      [44, -150],
      [-pillW - 44, -150],
      [-pillW / 2, 114],
    ];

    let bx = Math.max(18, Math.min(W - pillW - 18, c.x - pillW / 2));
    let by = Math.max(18, Math.min(H - pillH - 60, c.y - 98));

    for (const [dx, dy] of offsets) {
      const tx = Math.max(18, Math.min(W - pillW - 18, c.x + dx));
      const ty = Math.max(18, Math.min(H - pillH - 60, c.y + dy));
      const overlapsPill = placedBoxes.some(
        (b) => !(tx + pillW + 10 < b.x1 || tx - 10 > b.x2 || ty + pillH + 10 < b.y1 || ty - 10 > b.y2),
      );
      const overlapsPin = pinCenters.some(
        (p) => p.x >= tx - 16 && p.x <= tx + pillW + 16 && p.y >= ty - 16 && p.y <= ty + pillH + 16,
      );
      if (!overlapsPill && !overlapsPin) {
        bx = tx;
        by = ty;
        break;
      }
    }
    placedBoxes.push({ x1: bx, y1: by, x2: bx + pillW, y2: by + pillH });

    const anchorX = bx + pillW / 2;
    const anchorY = by + pillH / 2;
    const fill = c.isPriority ? '#231F20' : '#FFFFFF';
    const txtFill = c.isPriority ? '#FFFFFF' : '#231F20';

    leaderParts.push(
      `<line x1="${c.x}" y1="${c.y}" x2="${anchorX}" y2="${anchorY}" stroke="#231F20" stroke-width="1.35" stroke-dasharray="4 4"/>`,
    );
    pinParts.push(
      `<circle cx="${c.x}" cy="${c.y}" r="13" fill="${fill}" stroke="#231F20" stroke-width="2.2"/>`,
      `<text x="${c.x}" y="${c.y + 4.8}" text-anchor="middle" font-size="13.5" font-weight="800" fill="${txtFill}">${c.events.length}</text>`,
    );
    pillParts.push(
      `<rect x="${bx}" y="${by}" width="${pillW}" height="${pillH}" rx="18" fill="${fill}" stroke="#231F20" stroke-width="1.7"/>`,
      `<text x="${bx + pillW / 2}" y="${by + 23}" text-anchor="middle" font-size="15.5" font-weight="700" fill="${txtFill}">${esc(pillText)}</text>`,
    );
  });

  const calloutsSvg = `${leaderParts.join('')}${pillParts.join('')}${pinParts.join('')}`;

  const offMapCount = events.length - mappedCount;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="width:100%;height:100%;display:block;background:#FAFAFA;" role="img" aria-label="新加坡 AI 活动实时联动位置图">
    <g font-family="-apple-system,'PingFang SC','Microsoft YaHei',sans-serif">
      <!-- Subtle architectural grid -->
      <g stroke="#EAEAEA" stroke-width="1">
        ${Array.from({ length: 11 }, (_, i) => `<line x1="${(i + 1) * 80}" y1="0" x2="${(i + 1) * 80}" y2="${H}"/>`).join('')}
        ${Array.from({ length: 7 }, (_, i) => `<line x1="0" y1="${(i + 1) * 76}" x2="${W}" y2="${(i + 1) * 76}"/>`).join('')}
      </g>

      <!-- Singapore main island & Sentosa -->
      <path d="${coastPath}" fill="#FFFFFF" stroke="#231F20" stroke-width="2" stroke-linejoin="round"/>
      <path d="${sentosaPath}" fill="#FFFFFF" stroke="#8A8A8A" stroke-width="1.4" stroke-linejoin="round"/>

      <!-- MRT reference corridors -->
      <polyline points="${polyStr(ewLine)}" fill="none" stroke="#D0D0D0" stroke-width="2.2" stroke-dasharray="6 5"/>
      <polyline points="${polyStr(nsLine)}" fill="none" stroke="#D0D0D0" stroke-width="2.2" stroke-dasharray="6 5"/>

      <!-- District reference labels -->
      ${refDistricts
        .map((d) => {
          const p = proj(d.lat, d.lng);
          return `<text x="${p.x}" y="${p.y}" text-anchor="middle" font-size="12" font-weight="600" letter-spacing="1.4" fill="#A0A0A0">${d.label}</text>`;
        })
        .join('')}

      <!-- Dynamic event pins & callout pills -->
      ${
        clusters.length > 0
          ? calloutsSvg
          : `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="22" fill="#616161">当前所选活动均为线上或报名后公开地址</text>`
      }

      <!-- Bottom-left & bottom-right crisp map legend -->
      <rect x="20" y="${H - 46}" width="470" height="32" rx="16" fill="#FFFFFF" stroke="#D4D4D4" stroke-width="1.2"/>
      <circle cx="40" cy="${H - 30}" r="6" fill="#231F20"/>
      <text x="54" y="${H - 25}" font-size="14" font-weight="600" fill="#231F20">主办方在招公司</text>
      <circle cx="212" cy="${H - 30}" r="6" fill="#FFFFFF" stroke="#231F20" stroke-width="2"/>
      <text x="226" y="${H - 25}" font-size="14" font-weight="600" fill="#231F20">社区活动</text>
      <text x="312" y="${H - 25}" font-size="14" fill="#616161">· 按所选活动实时联动</text>
    </g>
  </svg>`;

  return { svg, mappedCount, offMapCount };
}

// ─── Card 02: Notionaly Spot Illustration (Explorer sorting event cards) ─────

function buildNotionalySorterSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 148" width="190" height="134" style="flex-shrink:0;" aria-hidden="true">
  <g fill="none" stroke="#231F20" stroke-linecap="round" stroke-linejoin="round">
    <!-- Floating sorted event cards -->
    <rect x="14" y="24" width="66" height="44" rx="6" fill="#FAFAFA" stroke-width="2.4" transform="rotate(-7 47 46)"/>
    <line x1="25" y1="40" x2="62" y2="36" stroke-width="2"/>
    <line x1="26" y1="50" x2="54" y2="47" stroke-width="1.6" stroke="#616161"/>
    <rect x="28" y="82" width="68" height="44" rx="6" fill="#FFFFFF" stroke-width="2.4" transform="rotate(5 62 104)"/>
    <circle cx="44" cy="100" r="5" fill="#231F20" stroke="none"/>
    <line x1="56" y1="100" x2="84" y2="103" stroke-width="2"/>

    <!-- Expressive warm-black explorer figure pointing -->
    <g transform="translate(116, 16)">
      <circle cx="40" cy="24" r="18" fill="#FFFFFF" stroke-width="2.8"/>
      <path d="M22 22 C23 6, 42 2, 54 12 C59 17, 60 25, 57 30 C48 21, 34 20, 22 22 Z" fill="#231F20" stroke-width="1.6"/>
      <circle cx="34" cy="26" r="2" fill="#231F20" stroke="none"/>
      <circle cx="46" cy="26" r="2" fill="#231F20" stroke="none"/>
      <path d="M36 33 Q40 37 45 33" stroke-width="2"/>
      <path d="M20 48 C24 42, 56 42, 60 48 L68 112 C52 118, 28 118, 12 112 Z" fill="#231F20" stroke-width="2.4"/>
      <path d="M32 44 L40 58 L48 44" fill="#FFFFFF" stroke-width="2"/>
      <path d="M22 58 C6 64, -8 68, -22 60" stroke-width="4.2"/>
      <circle cx="-25" cy="59" r="5" fill="#FFFFFF" stroke-width="2.4"/>
      <path d="M58 60 C72 72, 74 88, 66 102" stroke-width="4"/>
    </g>
    <path d="M104 18 L104 30 M98 24 L110 24" stroke-width="2.2"/>
  </g>
</svg>`;
}

// ─── Card 04: Default GO/NOGO + Hiring Link Showcase Visual (when no screenshot) ─

function buildDefaultCard4ShowcaseSvg(hiringCount: number, sampleHiringName?: string): string {
  const companyLabel = sampleHiringName || 'Google / Grab / Anthropic 等';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 936 520" style="width:100%;height:100%;display:block;background:#FAFAFA;" role="img" aria-label="网站主办方直连与 GO/NOGO 决策小工具示意图">
  <defs>
    <marker id="c4-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10" fill="none" stroke="#231F20" stroke-width="1.8"/>
    </marker>
  </defs>
  <g font-family="-apple-system,'PingFang SC','Microsoft YaHei',sans-serif" fill="#231F20">
    <!-- Left mock panel: Event Card -> Hiring Link -->
    <rect x="24" y="24" width="424" height="472" rx="14" fill="#FFFFFF" stroke="#231F20" stroke-width="2.2"/>
    <rect x="24" y="24" width="424" height="52" rx="14" fill="#231F20"/>
    <rect x="24" y="58" width="424" height="18" fill="#231F20"/>
    <text x="48" y="58" font-size="23" font-weight="700" fill="#FFFFFF">① 活动页 · 直连在招主办方</text>

    <rect x="46" y="96" width="380" height="156" rx="10" fill="#FAFAFA" stroke="#231F20" stroke-width="1.6"/>
    <rect x="64" y="114" width="124" height="32" rx="16" fill="#231F20"/>
    <text x="126" y="136" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">主办方在招</text>
    <text x="64" y="182" font-size="24" font-weight="800">AI Builders Meetup SG</text>
    <text x="64" y="214" font-size="19" font-weight="600" fill="#404040">关联：${esc(truncate(companyLabel, 20))}</text>
    <text x="64" y="240" font-size="18.5" font-weight="600" fill="#404040">本期 ${hiringCount} 场活动可遇到在招团队</text>

    <path d="M236 252 V298" fill="none" stroke="#231F20" stroke-width="2.2" marker-end="url(#c4-arr)"/>

    <rect x="46" y="308" width="380" height="164" rx="10" fill="#FFFFFF" stroke="#231F20" stroke-width="1.8" stroke-dasharray="6 4"/>
    <text x="66" y="346" font-size="22" font-weight="800">一键跳公司官网岗位页 ↗</text>
    <text x="66" y="384" font-size="19.5" font-weight="500" fill="#2E2B2C">• 先看该公司此刻新加坡在招岗位</text>
    <text x="66" y="418" font-size="19.5" font-weight="500" fill="#2E2B2C">• 带着真实问题去现场跟团队聊</text>
    <text x="66" y="452" font-size="19.5" font-weight="500" fill="#2E2B2C">• 聊完合适，直接回官网直投</text>

    <!-- Right mock panel: GO / NOGO Coin Decision Maker -->
    <rect x="488" y="24" width="424" height="472" rx="14" fill="#FFFFFF" stroke="#231F20" stroke-width="2.2"/>
    <rect x="488" y="24" width="424" height="52" rx="14" fill="#231F20"/>
    <rect x="488" y="58" width="424" height="18" fill="#231F20"/>
    <text x="512" y="58" font-size="23" font-weight="700" fill="#FFFFFF">② GO / NOGO · 去不去决策器</text>

    <!-- 3D sliders -->
    <text x="514" y="118" font-size="21" font-weight="700">学习价值（权重 50%）</text>
    <rect x="514" y="130" width="372" height="14" rx="7" fill="#EAEAEA"/>
    <rect x="514" y="130" width="300" height="14" rx="7" fill="#231F20"/>
    <text x="514" y="180" font-size="21" font-weight="700">职业契合（权重 35%）</text>
    <rect x="514" y="192" width="372" height="14" rx="7" fill="#EAEAEA"/>
    <rect x="514" y="192" width="265" height="14" rx="7" fill="#231F20"/>
    <text x="514" y="242" font-size="21" font-weight="700">人脉潜力（权重 15%）</text>
    <rect x="514" y="254" width="372" height="14" rx="7" fill="#EAEAEA"/>
    <rect x="514" y="254" width="228" height="14" rx="7" fill="#231F20"/>

    <!-- Coin verdict -->
    <g transform="translate(700, 362)">
      <circle cx="0" cy="0" r="66" fill="#231F20"/>
      <circle cx="0" cy="0" r="56" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-dasharray="5 4"/>
      <text x="0" y="-2" text-anchor="middle" font-size="34" font-weight="800" fill="#FFFFFF">GO</text>
      <text x="0" y="28" text-anchor="middle" font-size="18" font-weight="700" fill="#F0F0F0">值得去一趟</text>
    </g>
    <text x="700" y="466" text-anchor="middle" font-size="19.5" font-weight="600" fill="#404040">自动估算往返通勤 + 活动总耗时</text>
  </g>
</svg>`;
}

// ─── Card 05: Real Scannable Inline SVG QR Code Generator ───────────────────

function buildScannableQrSvg(urlText: string, sizePx = 186): string {
  const fullUrl = /^https?:\/\//i.test(urlText) ? urlText : `https://${urlText}`;
  const qr = QRCode.create(fullUrl, { errorCorrectionLevel: 'M' });
  const count = qr.modules.size;
  const data = qr.modules.data;
  const margin = 3;
  const total = count + margin * 2;

  const rects: string[] = [];
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (data[r * count + c]) {
        rects.push(`<rect x="${c + margin}" y="${r + margin}" width="1" height="1"/>`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges" role="img" aria-label="扫码访问 ${esc(fullUrl)}" style="display:block;border-radius:8px;border:1.5px solid #231F20;background:#FFFFFF;flex-shrink:0;">
    <rect width="${total}" height="${total}" fill="#FFFFFF"/>
    <g fill="#231F20">${rects.join('')}</g>
  </svg>`;
}

// Hairline mini icons for the 4 website modules on Card 05
const MODULE_ICONS: Record<'map' | 'events' | 'jobs' | 'gonogo', string> = {
  map: `<svg viewBox="0 0 40 40" width="34" height="34" fill="none" stroke="#231F20" stroke-width="1.8" stroke-linejoin="round"><polygon points="6,11 16,7 24,11 34,7 34,29 24,33 16,29 6,33" fill="#FAFAFA"/><line x1="16" y1="7" x2="16" y2="29"/><line x1="24" y1="11" x2="24" y2="33"/><circle cx="20" cy="18" r="3" fill="#231F20"/></svg>`,
  events: `<svg viewBox="0 0 40 40" width="34" height="34" fill="none" stroke="#231F20" stroke-width="1.8" stroke-linejoin="round"><rect x="6" y="9" width="28" height="24" rx="4" fill="#FAFAFA"/><line x1="6" y1="16" x2="34" y2="16"/><line x1="13" y1="5" x2="13" y2="12"/><line x1="27" y1="5" x2="27" y2="12"/><rect x="12" y="21" width="6" height="6" rx="1" fill="#231F20"/><line x1="22" y1="24" x2="29" y2="24"/></svg>`,
  jobs: `<svg viewBox="0 0 40 40" width="34" height="34" fill="none" stroke="#231F20" stroke-width="1.8" stroke-linejoin="round"><rect x="6" y="13" width="28" height="20" rx="4" fill="#FAFAFA"/><path d="M15 13 V9 C15 7.5 16 7 17.5 7 H22.5 C24 7 25 7.5 25 9 V13"/><line x1="6" y1="22" x2="34" y2="22"/><rect x="17" y="19" width="6" height="6" rx="1" fill="#231F20"/></svg>`,
  gonogo: `<svg viewBox="0 0 40 40" width="34" height="34" fill="none" stroke="#231F20" stroke-width="1.8"><circle cx="20" cy="20" r="14" fill="#FAFAFA"/><circle cx="20" cy="20" r="9.5" stroke-dasharray="3 2.5"/><path d="M16 20 L19 23 L25 17" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

// ─── Main Deck + Caption + Usage JSON Generator ─────────────────────────────

export function generateXhsLifePack(
  allEvents: XhsEventItem[],
  config: XhsDeckConfig,
): GeneratedXhsPack {
  const byId = new Map(allEvents.map((e) => [e.id, e]));
  const selectedEvents = config.selectedEventIds
    .map((id) => byId.get(id))
    .filter((e): e is XhsEventItem => Boolean(e))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  // Featured picks for Card 03 (1–3 hero picks; explicit stars first)
  const explicitPicks = config.pickEventIds
    .map((id) => byId.get(id))
    .filter((e): e is XhsEventItem => Boolean(e));

  const pickEvents: XhsEventItem[] =
    explicitPicks.length > 0
      ? explicitPicks.slice(0, 3)
      : [
          ...selectedEvents.filter((e) => e.isFriendEvent),
          ...selectedEvents.filter((e) => !e.isFriendEvent && (e.hiringCompanyNames?.length ?? 0) > 0),
          ...selectedEvents.filter((e) => !e.isFriendEvent && !(e.hiringCompanyNames?.length ?? 0)),
        ].slice(0, 3);

  const dateRangeText = `${fmtShortDate(config.startDate)} – ${fmtShortDate(config.endDate)}`;
  const footerViolations = checkFooterTopic(config.footerTopic);

  const hiringTotal = selectedEvents.filter((e) => (e.hiringCompanyNames?.length ?? 0) > 0).length;
  const hiringRolesSum = selectedEvents.reduce((acc, e) => acc + (e.hiringRolesTotal ?? 0), 0);
  const friendTotal = selectedEvents.filter((e) => e.isFriendEvent).length;
  const freeTotal = selectedEvents.filter((e) => e.isFree === true).length;
  const hotTotal = selectedEvents.filter((e) => e.status === 'sold_out' || e.status === 'waitlist').length;
  const approvalTotal = selectedEvents.filter((e) => e.status === 'approval').length;
  const uniqueDayCount = new Set(selectedEvents.map((e) => sgDateKey(e.startAt))).size;

  // District counts for Page 01 bottom strip
  const districtCounts: Record<DistrictKey, number> = {
    one_north: 0,
    cbd_marina: 0,
    bugis_city: 0,
    pasir_west: 0,
    other_online: 0,
  };
  for (const e of selectedEvents) districtCounts[classifyDistrict(e)] += 1;

  const districtSummaryParts = [
    districtCounts.one_north ? `One-North ${districtCounts.one_north}` : '',
    districtCounts.cbd_marina ? `CBD/Marina Bay ${districtCounts.cbd_marina}` : '',
    districtCounts.pasir_west ? `Pasir Panjang/西 ${districtCounts.pasir_west}` : '',
    districtCounts.bugis_city ? `Bugis/市中心 ${districtCounts.bugis_city}` : '',
    districtCounts.other_online ? `其他/线上/待公布 ${districtCounts.other_online}` : '',
  ].filter(Boolean);

  // Balanced pagination for Card 02 so ALL selected dates & events appear with even visual density:
  // - 1–8 events -> 1 page (exact 5-card 40/20/40 deck)
  // - 9–20 events -> 2 balanced pages (e.g. 19 -> 10 + 9 across Page 02 & 03, no sparse Page 04!)
  // - > 20 events -> Math.ceil(n / 10) evenly balanced pages (never a sparse tail page)
  const overviewPagesData: XhsEventItem[][] = [];
  let overviewHiddenCount = 0;

  if (selectedEvents.length <= 8) {
    overviewPagesData.push(selectedEvents);
  } else if (config.includeOverflowChecklist) {
    const pageCount = Math.ceil(selectedEvents.length / 10);
    let cursor = 0;
    for (let p = 0; p < pageCount; p++) {
      const remaining = selectedEvents.length - cursor;
      const pagesLeft = pageCount - p;
      const take = Math.ceil(remaining / pagesLeft);
      overviewPagesData.push(selectedEvents.slice(cursor, cursor + take));
      cursor += take;
    }
  } else {
    const balanced = selectBalancedOverview(selectedEvents, 8);
    overviewPagesData.push(balanced.shown);
    overviewHiddenCount = balanced.rest.length;
  }

  type DraftPage = {
    role: string;
    primaryStyle: DiagrammeStyle;
    titlePlain: string;
    titleHtml: string;
    bodyHtml: string;
    warnings: string[];
  };

  const drafts: DraftPage[] = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 01 — COVER WITH LIVE LINKED SINGAPORE MAP (Hairline · 1/2)
  // ═══════════════════════════════════════════════════════════════════════════
  const coverTitlePlain = (
    config.coverTitle || `新加坡 ${dateRangeText} AI 活动，\n先看这张联动地图。`
  ).trim();
  const coverTitleHtml = esc(coverTitlePlain).replace(/\n/g, '<br>');
  const coverIntro = (
    config.coverIntro ||
    `联动 ${dateRangeText} 共 ${selectedEvents.length} 场活动，全岛片区与地铁分布一张图看清。`
  ).trim();

  const linkedMap = buildLinkedSgMapSvg(selectedEvents);
  const mapStageHtml = config.coverMapSnapshotDataUrl
    ? `<div class="frame-box" style="flex:1;display:flex;flex-direction:column;">
         <div class="frame-bar">
           <span>SG AI Oasis · 2D 活动联动实景地图（${esc(dateRangeText)}）</span>
           <span style="color:#616161;">已定位 ${linkedMap.mappedCount} 场 · 另 ${linkedMap.offMapCount} 场线上/待公布</span>
         </div>
         <div style="flex:1;min-height:0;background:#dce5ed;display:flex;align-items:center;justify-content:center;overflow:hidden;">
           <img src="${esc(config.coverMapSnapshotDataUrl)}" alt="SG AI Oasis 首页实景地图" style="width:100%;height:100%;object-fit:cover;display:block;"/>
         </div>
       </div>`
    : `<div class="frame-box" style="flex:1;display:flex;flex-direction:column;">
         <div class="frame-bar">
           <span>新加坡 AI 活动实时分布（${esc(dateRangeText)}）</span>
           <span style="color:#616161;">地图已标 ${linkedMap.mappedCount} 场 · 另 ${linkedMap.offMapCount} 场线上/报名后见地址</span>
         </div>
         <div style="flex:1;min-height:0;">
           ${linkedMap.svg}
         </div>
       </div>`;

  drafts.push({
    role: '01 封面 · 联动活动地图 · Hairline',
    primaryStyle: 'hairline',
    titlePlain: coverTitlePlain.replace(/\n/g, ' '),
    titleHtml: coverTitleHtml,
    bodyHtml: `
      <p>${esc(coverIntro)}</p>
      ${mapStageHtml}
      <div class="kpi-strip">
        <div class="kpi-cell kpi-cell--dark">
          <div class="kpi-num">${selectedEvents.length}</div>
          <div class="kpi-lbl">本期精选/收录场次</div>
        </div>
        <div class="kpi-cell">
          <div class="kpi-num">${hiringTotal}</div>
          <div class="kpi-lbl">主办方在招公司场</div>
        </div>
        <div class="kpi-cell">
          <div class="kpi-num">${freeTotal}</div>
          <div class="kpi-lbl">免费公开场次</div>
        </div>
      </div>
      <div class="district-bar">
        <b>片区分布</b>
        <span style="color:#404040;text-align:right;">${esc(districtSummaryParts.join(' · ') || '待选择活动')}</span>
      </div>
    `,
    warnings: selectedEvents.length === 0 ? ['当前日期范围内未选中任何活动'] : [],
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 02 (+ auto-paginated continuations) — ALL SELECTED EVENTS BY AUDIENCE & INTEREST
  // Mobile-first 2-line high-legibility row layout (big title + clear time/venue/fit)
  // ═══════════════════════════════════════════════════════════════════════════
  let globalOvIndex = 0;
  overviewPagesData.forEach((pageEvents, pageIdx) => {
    const isMultiOv = overviewPagesData.length > 1;
    const ovCount = pageEvents.length;
    const isDenseOv = ovCount >= 9;
    const isCompactOv = ovCount >= 7;

    const ovRowStyle = isDenseOv
      ? 'padding:10px 16px;gap:6px;border-radius:10px;border-width:1.4px;'
      : isCompactOv
        ? 'padding:12px 18px;gap:7px;border-radius:10px;border-width:1.5px;'
        : 'padding:16px 20px;gap:9px;border-radius:12px;border-width:1.5px;';
    const ovTitleSize = isDenseOv ? 23 : isCompactOv ? 25 : 27;
    const ovMetaSize = isDenseOv ? 19.5 : isCompactOv ? 20.5 : 22;
    const ovPillPad = isDenseOv
      ? 'padding:2px 9px;font-size:15.5px;'
      : isCompactOv
        ? 'padding:3px 10px;font-size:16.5px;'
        : 'padding:3px 11px;font-size:17.5px;';
    const ovIdxSize = isDenseOv ? 16 : 18;
    const ovListGap = isDenseOv ? 8 : isCompactOv ? 10 : 16;
    const ovListJustify = ovCount <= 5 ? 'justify-content:flex-start;' : '';

    const firstDayMd = pageEvents.length ? fmtShortDate(sgDateKey(pageEvents[0].startAt)) : '';
    const lastDayMd = pageEvents.length ? fmtShortDate(sgDateKey(pageEvents[pageEvents.length - 1].startAt)) : '';
    const pageSpan = firstDayMd && lastDayMd && firstDayMd !== lastDayMd ? `${firstDayMd} – ${lastDayMd}` : firstDayMd;

    const overviewRowsHtml =
      pageEvents.length === 0
        ? `<div class="ov-row"><div class="ov-title">当前未选中活动</div><div class="ov-fit">请在左侧选择日期并勾选活动。</div></div>`
        : pageEvents
            .map((e) => {
              globalOvIndex += 1;
              const inferred = inferAudienceFit(e);
              const customNote = (config.audienceNotes[e.id] ?? e.friendNote ?? '').trim();
              const fitShort = customNote
                ? truncate(customNote, isDenseOv ? 20 : 24)
                : truncate(inferred.audience, isDenseOv ? 18 : 22);
              const pills: string[] = [];
              if (e.hiringCompanyNames?.length) pills.push(`<span class="tag-pill tag-pill--dark" style="${ovPillPad}">在招</span>`);
              pills.push(`<span class="tag-pill tag-pill--soft" style="${ovPillPad}">${esc(inferred.interest)}</span>`);

              return `<div class="ov-row" style="${ovRowStyle}">
                <div class="ov-top" style="gap:10px;align-items:center;">
                  <div style="display:flex;align-items:center;gap:9px;min-width:0;flex:1;">
                    <span style="display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:28px;padding:0 6px;border-radius:7px;background:#231F20;color:#FFFFFF;font-size:${ovIdxSize}px;font-weight:800;flex-shrink:0;">${String(globalOvIndex).padStart(2, '0')}</span>
                    <span class="ov-title" style="font-size:${ovTitleSize}px;font-weight:800;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(e.title)}</span>
                  </div>
                  <span style="display:flex;gap:5px;flex-shrink:0;">${pills.join('')}</span>
                </div>
                <div class="ov-fit" style="font-size:${ovMetaSize}px;gap:12px;">
                  <span style="color:#231F20;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(fmtEventDateTime(e.startAt))} · ${esc(shortVenue(e))}</span>
                  <span style="color:#4A4647;font-weight:500;flex-shrink:0;">适合：${esc(fitShort)}</span>
                </div>
              </div>`;
            })
            .join('');

    const ovArtScale = isDenseOv
      ? 'transform:scale(0.56);transform-origin:right center;margin:-36px 0 -36px -64px;'
      : isCompactOv
        ? 'transform:scale(0.68);transform-origin:right center;margin:-24px 0 -24px -40px;'
        : 'transform:scale(0.84);transform-origin:right center;margin:-10px 0 -10px -12px;';
    const pageTitlePlain = isMultiOv
      ? `本期活动总览（${pageIdx + 1}/${overviewPagesData.length}）：${pageSpan}`
      : '本期活动总览：按人群与兴趣挑场。';
    const pageTitleHtml = isMultiOv
      ? `<span style="font-size:54px;">本期活动总览（${pageIdx + 1}/${overviewPagesData.length}）· ${esc(pageSpan)}</span>`
      : `<span style="font-size:56px;">本期活动总览：按人群与兴趣挑场。</span>`;

    drafts.push({
      role: isMultiOv
        ? `活动总览 ${pageIdx + 1}/${overviewPagesData.length} · ${pageSpan} · ${pageIdx === 0 ? 'Notionaly' : 'Diagram Design'}`
        : '02 活动总览 · 人群与兴趣 · Notionaly',
      primaryStyle: pageIdx === 0 ? 'notionaly' : 'diagram-design',
      titlePlain: pageTitlePlain,
      titleHtml: pageTitleHtml,
      bodyHtml: `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <p style="flex:1;font-size:${isDenseOv ? 24 : 26}px;line-height:1.38;color:#3A3738;">${
            pageIdx === 0
              ? '按<b>时间顺序＋适合人群</b>一页扫清，在手机上直接圈出想去的场次。'
              : `承接上页，完整覆盖 <b>${esc(pageSpan)}</b> 共 ${pageEvents.length} 场已选活动。`
          }</p>
          ${pageIdx === 0 ? `<div style="${ovArtScale}">${buildNotionalySorterSvg()}</div>` : ''}
        </div>
        <div class="overview-list" style="gap:${ovListGap}px;${ovListJustify}">
          ${overviewRowsHtml}
        </div>
        <p class="small" style="font-size:${isDenseOv ? 19 : 21}px;font-weight:500;">${
          overviewHiddenCount > 0
            ? `以上按日期均衡展示 ${pageEvents.length} 场；其余 ${overviewHiddenCount} 场见 ${esc(config.siteUrl || 'sgaioasis.vercel.app/zh')}。`
            : isMultiOv
              ? `全套共 ${selectedEvents.length} 场（${esc(dateRangeText)}），保留官方原名，名额以官方报名页为准。`
              : `本期所选 ${pageEvents.length} 场已全部收录，保留官方原名，名额以官方报名页为准。`
        }</p>
      `,
      warnings: [],
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 03 — KEY STATS + 1–3 HERO PICKS WITH POSTER BOARDS (Diagram Design · 1/1)
  // ═══════════════════════════════════════════════════════════════════════════
  const hottestEvent =
    selectedEvents.find((e) => e.status === 'sold_out') ||
    selectedEvents.find((e) => e.status === 'waitlist') ||
    selectedEvents.find((e) => (e.hiringCompanyNames?.length ?? 0) > 0) ||
    selectedEvents[0];

  const defaultStatLine = config.card3StatHighlight?.trim()
    ? config.card3StatHighlight.trim()
    : hotTotal > 0 && hottestEvent
      ? `热度信号：本期有 ${hotTotal} 场已满/候补（如 ${truncate(hottestEvent.title, 28)}），${approvalTotal} 场需审核，建议尽早占位。`
      : `热度信号：本期 ${freeTotal} 场免费公开、${approvalTotal} 场需主办方审核；${hiringTotal} 场关联在招公司${hiringRolesSum > 0 ? `（合计 ${hiringRolesSum} 个在招岗）` : ''}。`;

  const posterOf = (e: XhsEventItem) => {
    const custom = config.customPosters?.[e.id];
    if (custom) return custom;
    if (!e.coverImageUrl) return null;
    if (config.proxyExternalImages && /^https:\/\//i.test(e.coverImageUrl)) {
      return `/api/admin/image-proxy?url=${encodeURIComponent(e.coverImageUrl)}`;
    }
    return e.coverImageUrl;
  };

  const buildPickBadges = (e: XhsEventItem, idx: number): string => {
    const pills: string[] = [`<span class="tag-pill tag-pill--dark">主推 0${idx + 1}</span>`];
    if (e.hiringCompanyNames?.length) {
      pills.push(
        `<span class="tag-pill tag-pill--dark">在招${e.hiringRolesTotal ? ` ${e.hiringRolesTotal} 岗` : ''}</span>`,
      );
    }
    const pText = priceZh(e);
    if (pText) pills.push(`<span class="tag-pill">${esc(pText)}</span>`);
    if (e.status !== 'open') pills.push(`<span class="tag-pill">${esc(statusZh(e.status))}</span>`);
    return pills.join('');
  };

  let heroPicksHtml = '';
  if (pickEvents.length === 0) {
    heroPicksHtml = `<div class="pick-card"><div class="pick-title">尚未选择主推活动</div><div class="pick-meta">请在后台第 1 页勾选 1–3 场「★ 主推」或导入朋友主办活动，此处将自动展示活动展板与详细信息。</div></div>`;
  } else if (pickEvents.length === 1) {
    // 1 Pick -> Deep Single Poster-Board Spotlight (zero blank void!)
    const e = pickEvents[0];
    const inferred = inferAudienceFit(e);
    const customNote = (config.audienceNotes[e.id] ?? e.friendNote ?? '').trim();
    const shortLink = shortDisplayUrl(e.url);
    const fullAddress = e.isOnline
      ? '线上参与'
      : [e.venue || shortVenue(e), e.address && e.address !== e.venue ? e.address : ''].filter(Boolean).join(' · ');

    heroPicksHtml = `
      <div class="frame-box" style="flex:1;display:flex;flex-direction:column;background:#FAFAFA;">
        <div style="display:grid;grid-template-columns:340px 1fr;gap:22px;padding:22px;background:#FFFFFF;border-bottom:1px solid #D4D4D4;align-items:stretch;">
          ${renderPosterVisual(e, posterOf(e), { width: '340px', height: '340px', radius: 10 })}
          <div style="display:flex;flex-direction:column;justify-content:space-between;gap:12px;">
            <div style="display:flex;flex-wrap:wrap;gap:8px;">${buildPickBadges(e, 0)}</div>
            <div style="font-size:35px;font-weight:800;line-height:1.2;letter-spacing:-0.6px;">${esc(truncate(e.title, 68))}</div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:23px;color:#231F20;">
              <div><b>时间：</b>${esc(fmtEventTimeRange(e.startAt, e.endAt))} (SGT)</div>
              <div><b>地点：</b>${esc(truncate(fullAddress || '地址报名后公开', 38))}</div>
              ${e.organiser ? `<div><b>主办：</b>${esc(truncate(e.organiser, 26))}</div>` : ''}
              ${shortLink ? `<div><b>入口：</b><span style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:20px;">${esc(shortLink)}</span></div>` : ''}
            </div>
          </div>
        </div>
        <div style="flex:1;padding:20px 22px;display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div style="grid-column:1 / -1;border:1.5px solid #231F20;border-radius:10px;background:#FFFFFF;padding:18px 20px;">
            <div style="font-size:20px;font-weight:700;color:#616161;margin-bottom:6px;">为什么主推 / 活动看点</div>
            <div style="font-size:25px;font-weight:600;line-height:1.45;color:#231F20;">${esc(
              customNote ||
                `本期高信号精选活动（${inferred.interest}），信息密度高，适合带着具体问题去现场交流。`,
            )}</div>
          </div>
          <div style="border:1.5px solid #231F20;border-radius:10px;background:#FFFFFF;padding:16px 18px;">
            <div style="font-size:19px;font-weight:700;color:#616161;margin-bottom:6px;">适合人群与兴趣</div>
            <div style="font-size:23px;line-height:1.42;font-weight:700;color:#231F20;">${esc(inferred.audience)}</div>
            <div style="margin-top:10px;"><span class="tag-pill tag-pill--soft">${esc(inferred.interest)}</span></div>
          </div>
          <div style="border:1.5px solid #231F20;border-radius:10px;background:#FFFFFF;padding:16px 18px;">
            <div style="font-size:19px;font-weight:700;color:#616161;margin-bottom:6px;">行前实用提醒</div>
            <div style="font-size:22px;line-height:1.45;color:#2E2B2C;">${esc(buildPreEventTip(e))}</div>
          </div>
        </div>
      </div>
    `;
  } else if (pickEvents.length === 2) {
    // 2 Picks -> Dual Editorial Poster-Board Cards
    heroPicksHtml = pickEvents
      .map((e, idx) => {
        const inferred = inferAudienceFit(e);
        const customNote = (config.audienceNotes[e.id] ?? e.friendNote ?? '').trim();
        const reason = customNote || `${inferred.interest} · 适合${inferred.audience}`;
        const shortLink = shortDisplayUrl(e.url);
        return `<div class="pick-card${idx === 0 ? ' pick-card--hero' : ''}" style="flex-direction:row;gap:20px;align-items:stretch;padding:18px 20px;">
          ${renderPosterVisual(e, posterOf(e), { width: '240px', height: '240px', radius: 10 })}
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between;gap:8px;">
            <div style="display:flex;flex-wrap:wrap;gap:7px;">${buildPickBadges(e, idx)}</div>
            <div style="font-size:30px;font-weight:800;line-height:1.22;">${esc(truncate(e.title, 56))}</div>
            <div style="font-size:22px;color:#2E2B2C;line-height:1.42;">
              <div><b>时间：</b>${esc(fmtEventTimeRange(e.startAt, e.endAt))}</div>
              <div><b>地点：</b>${esc(shortVenue(e))}${e.organiser ? ` · ${esc(truncate(e.organiser, 18))}` : ''}</div>
              ${shortLink ? `<div style="font-size:18px;color:#4A4647;font-family:'SF Mono',Menlo,Consolas,monospace;">${esc(shortLink)}</div>` : ''}
            </div>
            <div class="pick-fit" style="font-size:22px;"><b>看点：</b>${esc(truncate(reason, 48))}</div>
          </div>
        </div>`;
      })
      .join('');
  } else {
    // 3 Picks -> Triple Mobile-Readable Poster-Board Cards
    heroPicksHtml = pickEvents
      .map((e, idx) => {
        const inferred = inferAudienceFit(e);
        const customNote = (config.audienceNotes[e.id] ?? e.friendNote ?? '').trim();
        const reason = customNote || `${inferred.interest} · 适合${inferred.audience}`;
        return `<div class="pick-card${idx === 0 ? ' pick-card--hero' : ''}" style="flex-direction:row;gap:18px;align-items:center;padding:16px 18px;">
          ${renderPosterVisual(e, posterOf(e), { width: '166px', height: '166px', radius: 10 })}
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between;gap:7px;">
            <div class="pick-top">
              <span class="pick-time" style="font-size:21px;font-weight:800;">${esc(fmtEventTimeRange(e.startAt, e.endAt))}</span>
              <span class="pick-tags">${buildPickBadges(e, idx)}</span>
            </div>
            <div class="pick-title" style="font-size:26px;font-weight:800;line-height:1.24;letter-spacing:-0.4px;">${esc(truncate(e.title, 50))}</div>
            <div class="pick-meta" style="font-size:21px;color:#3A3738;font-weight:600;">${esc(shortVenue(e))}${e.organiser ? ` · 主办：${esc(truncate(e.organiser, 20))}` : ''}</div>
            <div class="pick-fit" style="font-size:20.5px;padding-top:6px;"><b>适合：</b>${esc(truncate(reason, 44))}</div>
          </div>
        </div>`;
      })
      .join('');
  }

  drafts.push({
    role: '03 数据统计与主推展板 · Diagram Design',
    primaryStyle: 'diagram-design',
    titlePlain: `本期重点主推：优先锁定这 ${pickEvents.length || 1} 场。`,
    titleHtml: `本期重点主推：<br>优先锁定这 ${pickEvents.length || 1} 场。`,
    bodyHtml: `
      <div class="kpi-strip-4">
        <div class="kpi-cell">
          <div class="kpi-num">${hotTotal > 0 ? hotTotal : approvalTotal}</div>
          <div class="kpi-lbl">${hotTotal > 0 ? '已满/候补热场' : '需审核筛选场'}</div>
        </div>
        <div class="kpi-cell">
          <div class="kpi-num">${hiringTotal}</div>
          <div class="kpi-lbl">在招公司关联</div>
        </div>
        <div class="kpi-cell">
          <div class="kpi-num">${freeTotal}</div>
          <div class="kpi-lbl">免费公开场次</div>
        </div>
        <div class="kpi-cell">
          <div class="kpi-num">${uniqueDayCount}</div>
          <div class="kpi-lbl">覆盖活动天数</div>
        </div>
      </div>
      <div class="district-bar" style="font-size:21.5px;font-weight:600;">
        <span>${esc(defaultStatLine)}</span>
      </div>
      <div class="pick-list">
        ${heroPicksHtml}
      </div>
    `,
    warnings: pickEvents.length === 0 ? ['第 03 页暂无主推活动，请在左侧勾选 1–3 场 ★ 主推'] : [],
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 04 — FLEXIBLE WEBSITE + GO/NOGO SHOWCASE (Notionaly · 2/2)
  // ═══════════════════════════════════════════════════════════════════════════
  const c4TitlePlain = (config.card4Title || '去现场前先看两件事：\n谁在招人？值不值得去？').trim();
  const c4Intro = (
    config.card4Intro ||
    '在 SG AI Oasis 网站上，点开任意一场活动就能直接跳去对应主办方官网岗位；刚更新的 GO/NOGO 小工具也能 30 秒帮你判断是否值得花这个时间。'
  ).trim();
  const c4P1Title = (config.card4Point1Title || '① 现场活动 → 直连主办方官网').trim();
  const c4P1Body = (
    config.card4Point1Body ||
    '不用靠人脉打听，直接看到哪家在招公司在办活动，点一下链接就能核对新加坡公开岗位。'
  ).trim();
  const c4P2Title = (config.card4Point2Title || '② GO / NOGO 去不去小工具').trim();
  const c4P2Body = (
    config.card4Point2Body ||
    '勾选你关心的主题，按学习 / 人脉 / 职业三维打分并估算通勤耗时，抛硬币帮你做清醒取舍。'
  ).trim();

  const sampleHiringName = selectedEvents.find((e) => e.hiringCompanyNames?.length)?.hiringCompanyNames?.[0];
  const card4VisualHtml = config.card4ScreenshotDataUrl
    ? `<div class="frame-box" style="flex:1;display:flex;flex-direction:column;">
         <div class="frame-bar">
           <span>SG AI Oasis · 网站实拍界面（主办方直连 + GO/NOGO）</span>
           <span style="color:#616161;">${esc(config.siteUrl)}/gonogo</span>
         </div>
         <div style="flex:1;min-height:0;background:#FFFFFF;padding:10px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
           <img src="${esc(config.card4ScreenshotDataUrl)}" alt="GO/NOGO 网站截图" style="width:100%;height:100%;object-fit:contain;display:block;"/>
         </div>
       </div>`
    : `<div class="frame-box" style="flex:1;display:flex;flex-direction:column;">
         <div class="frame-bar">
           <span>网站实操演示 · 主办方在招直连 × GO/NOGO 决策器</span>
           <span style="color:#616161;">免费 · 免登录</span>
         </div>
         <div style="flex:1;min-height:0;">
           ${buildDefaultCard4ShowcaseSvg(hiringTotal, sampleHiringName)}
         </div>
       </div>`;

  drafts.push({
    role: '04 网站亮点与 GO/NOGO · Notionaly',
    primaryStyle: 'notionaly',
    titlePlain: c4TitlePlain.replace(/\n/g, ' '),
    titleHtml: esc(c4TitlePlain).replace(/\n/g, '<br>'),
    bodyHtml: `
      <p>${esc(c4Intro)}</p>
      ${card4VisualHtml}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div class="kpi-cell" style="padding:18px 20px;">
          <div style="font-size:25px;font-weight:800;margin-bottom:6px;">${esc(c4P1Title)}</div>
          <div style="font-size:22px;line-height:1.45;color:#2E2B2C;">${esc(c4P1Body)}</div>
        </div>
        <div class="kpi-cell" style="padding:18px 20px;">
          <div style="font-size:25px;font-weight:800;margin-bottom:6px;">${esc(c4P2Title)}</div>
          <div style="font-size:22px;line-height:1.45;color:#2E2B2C;">${esc(c4P2Body)}</div>
        </div>
      </div>
    `,
    warnings: [],
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 05 — 4 CORE SITE FEATURES GUIDE + SCANNABLE QR CODE (Hairline · 2/2)
  // ═══════════════════════════════════════════════════════════════════════════
  const cleanSiteUrl = (config.siteUrl || 'sgaioasis.vercel.app/zh').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const qrSvg = buildScannableQrSvg(`https://${cleanSiteUrl}`, 186);
  const keywordsList = (config.searchKeywords || 'SG AI Oasis · sgaioasis · 人在坡岛')
    .split(/[·,，/]/)
    .map((s) => s.trim())
    .filter(Boolean);

  drafts.push({
    role: '05 网站 4 功能指南与二维码 · Hairline',
    primaryStyle: 'hairline',
    titlePlain: 'SG AI Oasis 网站指南：四个工具免费直接用。',
    titleHtml: 'SG AI Oasis 网站指南：<br>四个工具免费直接用。',
    bodyHtml: `
      <p>开源免费、不用注册、每天自动更新。把新加坡分散的 AI 活动与公开岗位整理在一处，方便随时查。</p>
      <div class="feature-grid">
        <div class="feature-card">
          <div>
            <div class="feature-head">
              <span class="feature-num">01</span>
              ${MODULE_ICONS.map}
            </div>
            <div class="feature-title">机会地图</div>
            <p class="feature-desc" style="margin-top:8px;">2D / 3D 全岛视图看清每场活动位置与最近地铁站，蓝色实心点一眼认出在招主办方。</p>
          </div>
          <div class="feature-path">${esc(cleanSiteUrl)}</div>
        </div>
        <div class="feature-card feature-card--alt">
          <div>
            <div class="feature-head">
              <span class="feature-num">02</span>
              ${MODULE_ICONS.events}
            </div>
            <div class="feature-title">近期活动</div>
            <p class="feature-desc" style="margin-top:8px;">覆盖本周与未来 30 天，同步 Luma、GDG、SGInnovate 与本地社群，一键跳官方报名页。</p>
          </div>
          <div class="feature-path">${esc(cleanSiteUrl)}/events</div>
        </div>
        <div class="feature-card feature-card--alt">
          <div>
            <div class="feature-head">
              <span class="feature-num">03</span>
              ${MODULE_ICONS.jobs}
            </div>
            <div class="feature-title">在招岗位</div>
            <p class="feature-desc" style="margin-top:8px;">直连新加坡 AI 与科技公司官方招聘页，按 11 个职能与公司词云筛选，每日核实。</p>
          </div>
          <div class="feature-path">${esc(cleanSiteUrl)}/jobs</div>
        </div>
        <div class="feature-card">
          <div>
            <div class="feature-head">
              <span class="feature-num">04</span>
              ${MODULE_ICONS.gonogo}
            </div>
            <div class="feature-title">GO / NOGO</div>
            <p class="feature-desc" style="margin-top:8px;">30 秒按学习 / 人脉 / 职业三维打分并估算通勤耗时，批量抛硬币帮自己做取舍。</p>
          </div>
          <div class="feature-path">${esc(cleanSiteUrl)}/gonogo</div>
        </div>
      </div>

      <div class="qr-cta-box">
        <div style="flex:1;display:flex;flex-direction:column;gap:10px;">
          <div style="font-size:28px;font-weight:800;letter-spacing:-0.3px;">扫码直达网站 · 欢迎关注「人在坡岛」</div>
          <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:23px;font-weight:700;color:#231F20;">https://${esc(cleanSiteUrl)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
            <span style="font-size:20px;font-weight:600;color:#4A4647;">搜索关键词：</span>
            ${keywordsList.map((k) => `<span class="tag-pill">${esc(k)}</span>`).join('')}
          </div>
          <div style="font-size:20.5px;color:#3A3738;line-height:1.45;">每周持续整理新加坡 AI 活动与岗位观察；如果你在坡办活动，欢迎评论或私信补录。</div>
        </div>
        ${qrSvg}
      </div>
    `,
    warnings: [],
  });

  // Finalize page numbers & apply optional user HTML overrides
  const totalStr = String(drafts.length).padStart(2, '0');
  const cards: GeneratedCard[] = drafts.map((d, idx) => {
    const numStr = String(idx + 1).padStart(2, '0');
    const override = config.cardHtmlOverrides?.[numStr];
    const html =
      override?.trim() ||
      renderCardShell({
        titlePlain: d.titlePlain,
        kicker: config.kicker,
        titleHtml: d.titleHtml,
        bodyHtml: d.bodyHtml,
        footerTopic: config.footerTopic,
        pageNum: numStr,
        pageTotal: totalStr,
      });

    return {
      pageNumber: numStr,
      pageTotal: totalStr,
      filename: `${numStr}.html`,
      pngFilename: `${numStr}.png`,
      role: d.role,
      primaryStyle: d.primaryStyle,
      titlePlain: d.titlePlain,
      html,
      warnings: [...d.warnings, ...footerViolations],
    };
  });

  // Compute Life style ratio (target: 40% Notionaly / 20% Diagram Design / 40% Hairline)
  const counts: Record<DiagrammeStyle, number> = {
    notionaly: 0,
    'diagram-design': 0,
    hairline: 0,
  };
  for (const c of cards) counts[c.primaryStyle] += 1;
  const total = Math.max(1, cards.length);
  const percents: Record<DiagrammeStyle, number> = {
    notionaly: Math.round((counts.notionaly / total) * 100),
    'diagram-design': Math.round((counts['diagram-design'] / total) * 100),
    hairline: Math.round((counts.hairline / total) * 100),
  };
  const target: Record<DiagrammeStyle, number> = {
    notionaly: 40,
    'diagram-design': 20,
    hairline: 40,
  };
  const matchesTarget =
    percents.notionaly === 40 && percents['diagram-design'] === 20 && percents.hairline === 40;

  const packSlug = `xhs-life-${config.startDate}_to_${config.endDate}`;

  // Mobile-scannable Xiaohongshu post caption (aligned with tone-and-caption.md: natural, restrained, zero hype)
  const overviewSlideRange = overviewPagesData.length > 1 ? `图 2–${1 + overviewPagesData.length}` : '图 2';
  const pickSlideNum = 2 + overviewPagesData.length;
  const siteSlideNum = 3 + overviewPagesData.length;
  const guideSlideNum = 4 + overviewPagesData.length;
  const topPickNames = pickEvents.slice(0, 3).map((e) => `· ${e.title}`).join('\n');

  const captionMd = [
    `【标题建议】新加坡 ${dateRangeText} 共 ${selectedEvents.length} 场 AI 活动｜全岛地图＋怎么选`,
    ``,
    `新加坡这周的 AI 活动散在 Luma、GDG、SGInnovate 和本地社群里，下班想挑一场顺路的听，光翻链接查地址就挺耗精力。`,
    ``,
    `我用自己维护的开源小站 SG AI Oasis 整理好了这 ${selectedEvents.length} 场活动（${freeTotal} 场免费公开 · ${hiringTotal} 场主办方在招 · 覆盖 ${uniqueDayCount} 天），按路上刷手机的习惯排成了 ${cards.length} 张图：`,
    ``,
    `📍 图 1｜全岛 2D 联动地图`,
    `先看活动集中在哪些片区和地铁站，挑下班顺路的。`,
    ``,
    `📋 ${overviewSlideRange}｜完整活动总览`,
    `按时间顺序和适合人群整理，不用挨个点链接猜内容。`,
    ``,
    `⭐ 图 ${pickSlideNum}｜本期重点主推（${pickEvents.length} 场）`,
    topPickNames || `· 挑出本期信号最强的重点场次，附展板与行前信息。`,
    ``,
    `🧭 图 ${siteSlideNum}｜去前先查两件事`,
    `活动页可直接点进主办方看新加坡在招岗位；新加的 GO/NOGO 小工具 30 秒按学习、人脉、职业帮你判断值不值得花通勤时间。`,
    ``,
    `🔗 图 ${guideSlideNum}｜网站 4 个免费工具＋直达二维码`,
    `浏览器搜「SG AI Oasis」或直接访问 https://${cleanSiteUrl} 就能用，不用注册登录。`,
    ``,
    `—`,
    `边界说明：部分活动需要审核或报名后才公布详细地址，实时席位以官方报名页为准；参加活动也不代表内推或面试承诺。`,
    ``,
    `你这周准备去哪一场？如果有漏掉的新加坡 AI 活动，欢迎评论区补充。`,
    ``,
    `#新加坡AI #人在坡岛 #新加坡生活 #新加坡活动 #新加坡科技 #SGAI`,
  ].join('\n');

  const autoException = matchesTarget
    ? null
    : config.exceptionReason?.trim() ||
      `本批共 ${cards.length} 页，因活动数量较多新增完整补录页，按内容适配调整为 Notionaly ${percents.notionaly}% / Diagram Design ${percents['diagram-design']}% / Hairline ${percents.hairline}%（仅记录本批，不代表长期配比）。`;

  const usageObj = {
    schema_version: 1,
    scope: 'current-project-only',
    generated_at: new Date().toISOString(),
    date_window: { start: config.startDate, end: config.endDate },
    selected_events_count: selectedEvents.length,
    friend_events_count: friendTotal,
    ratio_summary: {
      target_life: target,
      actual_percent: percents,
      actual_counts: counts,
    },
    artifacts: cards.map((c) => ({
      artifact_id: `${packSlug}-${c.pageNumber}`,
      domain: 'life',
      primary_style: c.primaryStyle,
      secondary_styles: [],
      version: 'v02',
      output: `src/${c.filename}`,
      rendered: c.pngFilename,
      validation: 'generated-pending-visual-review',
      note:
        c.pageNumber === '01' && config.coverMapSnapshotDataUrl
          ? '封面嵌入了当前所选活动联动的 2D 网站地图实拍截图。'
          : c.pageNumber === '04' && config.card4ScreenshotDataUrl
            ? '第 04 页嵌入了网站 / GO/NOGO 实拍截图。'
            : '由 SG AI Oasis 后台内置 Diagramme Life HTML/SVG 模板生成（遵循 personal-style.md 与 PORTABLE_SPEC.md）。',
      exception_reason: !matchesTarget && c.pageNumber === totalStr ? autoException : null,
    })),
  };

  return {
    packSlug,
    cards,
    captionMd,
    usageJson: `${JSON.stringify(usageObj, null, 2)}\n`,
    ratio: {
      total: cards.length,
      counts,
      percents,
      target,
      matchesTarget,
    },
    footerViolations,
  };
}

export function toXhsEventItem(
  e: SgEvent,
  companyById: Record<string, Company>,
  openRoles: Record<string, number>,
): XhsEventItem {
  const hiringIds = e.companyIds.filter((id) => openRoles[id] && companyById[id]);
  const hiringNames = hiringIds.map((id) => companyById[id].name);
  const hiringRolesTotal = hiringIds.reduce((sum, id) => sum + (openRoles[id] ?? 0), 0);
  const geo = resolveEventGeo(e);
  const mrtLabel =
    geo?.precision === 'area' && geo.areaLabel
      ? `${geo.areaLabel} 区域`
      : geo?.mrtName
        ? `${geo.mrtName} 站`
        : undefined;

  return {
    id: e.id,
    title: e.title,
    startAt: e.startAt,
    endAt: e.endAt,
    venue: e.venue,
    address: e.address,
    lat: e.lat,
    lng: e.lng,
    url: e.url,
    coverImageUrl: e.coverImageUrl ?? null,
    organiser: e.organiser,
    isFree: e.isFree,
    price: e.price,
    status: e.status,
    isOnline: e.isOnline,
    tags: e.tags,
    companyIds: e.companyIds,
    isFriendEvent: e.isFriendEvent,
    friendNote: e.friendNote,
    publishToSite: e.publishToSite,
    hiringCompanyNames: hiringNames,
    hiringRolesTotal,
    mrtLabel,
  };
}
