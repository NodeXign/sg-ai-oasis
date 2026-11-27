'use client';

import type { Lang, SgEvent } from './types';
import { resolveEventGeo } from './sg-geo';
import { MAP_MRT_STATIONS } from '@/components/SgLandmarks';
import { sgDateKey, type XhsEventItem } from './xhs-life-cards';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const W = 944;
const H = 720;
const DPR = 2;

const DISTRICT_LABELS: { label: string; lat: number; lng: number }[] = [
  { label: 'NTU', lat: 1.3483, lng: 103.6831 },
  { label: 'one-north', lat: 1.2998, lng: 103.7871 },
  { label: 'Orchard', lat: 1.3040, lng: 103.8318 },
  { label: 'Chinatown', lat: 1.2836, lng: 103.8444 },
  { label: 'Marina Bay', lat: 1.2815, lng: 103.8585 },
];

function applyWebsiteMonochromeStyle(map: import('maplibre-gl').Map) {
  const style = map.getStyle();
  if (!style?.layers) return;

  for (const layer of style.layers) {
    const id = layer.id.toLowerCase();
    const type = layer.type;
    try {
      if (type === 'symbol') {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
        continue;
      }
      if (type === 'background') {
        map.setPaintProperty(layer.id, 'background-color', '#f7f8fa');
        continue;
      }
      if (id.includes('water')) {
        if (type === 'fill') {
          map.setPaintProperty(layer.id, 'fill-color', '#dce5ed');
          map.setPaintProperty(layer.id, 'fill-outline-color', '#b9c7d2');
        } else if (type === 'line') {
          map.setPaintProperty(layer.id, 'line-color', '#dce1e8');
        }
        continue;
      }
      if (
        id.includes('park') ||
        id.includes('wood') ||
        id.includes('forest') ||
        id.includes('grass') ||
        id.includes('green') ||
        id.includes('landcover')
      ) {
        if (type === 'fill') {
          map.setPaintProperty(layer.id, 'fill-color', '#eef0f2');
          map.setPaintProperty(layer.id, 'fill-opacity', 0.85);
        } else {
          map.setLayoutProperty(layer.id, 'visibility', 'none');
        }
        continue;
      }
      if (
        id.includes('building') ||
        id.includes('rail') ||
        id.includes('transit') ||
        id.includes('aero') ||
        id.includes('boundary') ||
        id.includes('border') ||
        id.includes('landuse') ||
        id.includes('residential') ||
        id.includes('industrial')
      ) {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
        continue;
      }
      if (
        id.includes('road') ||
        id.includes('highway') ||
        id.includes('motorway') ||
        id.includes('trunk') ||
        id.includes('tunnel') ||
        id.includes('bridge')
      ) {
        if (
          id.includes('casing') ||
          id.includes('link') ||
          id.includes('ramp') ||
          id.includes('path') ||
          id.includes('track')
        ) {
          map.setLayoutProperty(layer.id, 'visibility', 'none');
          continue;
        }
        if (type === 'line') {
          const isMajor = id.includes('motorway') || id.includes('trunk') || id.includes('primary');
          map.setPaintProperty(layer.id, 'line-color', isMajor ? '#ffffff' : '#e6eaef');
          map.setPaintProperty(layer.id, 'line-opacity', isMajor ? 0.95 : 0.72);
        }
      }
    } catch {
      // ignore unsupported properties
    }
  }
}

function fmtShortPillDate(iso: string, lang: Lang): string {
  const ymd = sgDateKey(iso);
  const parts = ymd.split('-');
  const md = parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : ymd;
  const wd = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-SG', {
    weekday: 'short',
    timeZone: 'Asia/Singapore',
  }).format(new Date(iso));
  return `${md} ${wd}`;
}

function truncText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let out = text;
  while (out.length > 2 && ctx.measureText(`${out}…`).width > maxW) {
    out = out.slice(0, -1);
  }
  return `${out.trimEnd()}…`;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

interface MappedHub {
  lat: number;
  lng: number;
  x: number;
  y: number;
  items: {
    event: XhsEventItem;
    index: number;
    precision: 'exact' | 'area';
    locationLabel: string;
    hiring: boolean;
    friend: boolean;
  }[];
  hasHiring: boolean;
  hasFriend: boolean;
  isAreaOnly: boolean;
}

/**
 * Renders the exact SG AI Oasis 2D MapLibre Positron map + callout cards + MRT stations + legend
 * completely in the client browser (works on iPhone, Android, Desktop, Vercel — zero Playwright needed).
 */
export async function renderClientMapSnapshot(
  events: XhsEventItem[],
  lang: Lang,
): Promise<string> {
  const maplibregl = (await import('maplibre-gl')).default;

  // Build list of mapped events using exact sg-geo rules
  const mapped: {
    event: XhsEventItem;
    index: number;
    lat: number;
    lng: number;
    precision: 'exact' | 'area';
    locationLabel: string;
    hiring: boolean;
    friend: boolean;
  }[] = [];

  events.forEach((e, idx) => {
    const geo = resolveEventGeo(e as SgEvent);
    if (!geo) return;
    const locationLabel =
      geo.precision === 'area' && geo.areaLabel
        ? `${geo.areaLabel} 区域 · 地址待公布`
        : geo.mrtName && geo.mrtWalkMins != null
          ? `${geo.mrtName} 站 · 步行 ${geo.mrtWalkMins} 分`
          : e.venue || geo.areaLabel || '';

    mapped.push({
      event: e,
      index: idx + 1,
      lat: geo.lat,
      lng: geo.lng,
      precision: geo.precision,
      locationLabel,
      hiring: (e.hiringCompanyNames?.length ?? 0) > 0,
      friend: Boolean(e.isFriendEvent),
    });
  });

  // Offscreen fixed 944x630 container so mobile screens never shrink or collapse the 2D map!
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = `${W}px`;
  container.style.height = `${H}px`;
  container.style.pointerEvents = 'none';
  container.style.opacity = '0';
  document.body.appendChild(container);

  let map: import('maplibre-gl').Map | null = null;

  try {
    map = new maplibregl.Map({
      container,
      style: STYLE_URL,
      center: [103.818, 1.318],
      zoom: 10.9,
      pitch: 0,
      bearing: 0,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      preserveDrawingBuffer: true,
      pixelRatio: DPR,
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => resolve(), 7500);
      map!.on('error', (err) => {
        // Keep going if a single minor tile fails, only reject if style fails completely
        if (!map!.isStyleLoaded()) {
          clearTimeout(timeout);
          reject(err?.error ?? new Error('MapLibre failed to load style'));
        }
      });
      map!.on('load', () => {
        applyWebsiteMonochromeStyle(map!);

        // Compute generous bounds covering ALL Singapore island & ALL mapped events so nothing clips!
        let minLng = 103.655;
        let maxLng = 103.985;
        let minLat = 1.248;
        let maxLat = 1.425;
        for (const p of mapped) {
          minLng = Math.min(minLng, p.lng - 0.015);
          maxLng = Math.max(maxLng, p.lng + 0.015);
          minLat = Math.min(minLat, p.lat - 0.012);
          maxLat = Math.max(maxLat, p.lat + 0.012);
        }

        map!.fitBounds(
          [
            [minLng, minLat],
            [maxLng, maxLat],
          ],
          {
            padding: { top: 56, bottom: 68, left: 48, right: 48 },
            maxZoom: 11.75,
            duration: 0,
          },
        );

        map!.once('idle', () => {
          setTimeout(() => {
            clearTimeout(timeout);
            resolve();
          }, 220);
        });
      });
    });

    // Composite onto a 2x Retina canvas (1888x1260)
    const out = document.createElement('canvas');
    out.width = W * DPR;
    out.height = H * DPR;
    const ctx = out.getContext('2d')!;
    ctx.scale(DPR, DPR);

    // Layer 1: Exact MapLibre OpenFreeMap Positron WebGL basemap
    ctx.fillStyle = '#dce5ed';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(map.getCanvas(), 0, 0, W, H);

    const fontStack = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

    // Track occupied label boxes to keep everything collision-free
    const legendBox = { x1: W - 242, y1: H - 102, x2: W - 12, y2: H - 12 };

    // Cluster mapped events by screen proximity FIRST so callout cards reserve space before background labels
    const hubs: MappedHub[] = [];
    for (const item of mapped) {
      const pt = map.project([item.lng, item.lat]);
      const existing = hubs.find((h) => Math.hypot(h.x - pt.x, h.y - pt.y) < 22);
      if (existing) {
        existing.items.push(item);
        if (item.hiring) existing.hasHiring = true;
        if (item.friend) existing.hasFriend = true;
        if (item.precision === 'exact') existing.isAreaOnly = false;
      } else {
        hubs.push({
          lat: item.lat,
          lng: item.lng,
          x: pt.x,
          y: pt.y,
          items: [item],
          hasHiring: item.hiring,
          hasFriend: item.friend,
          isAreaOnly: item.precision === 'area',
        });
      }
    }

    // Build card descriptors: individual cards when total mapped <= 8, else 1 rich card per hub (all events counted!)
    interface CardDesc {
      hubX: number;
      hubY: number;
      badgeText: string;
      dateText: string;
      titleText: string;
      subText: string;
      hiring: boolean;
      friend: boolean;
      isArea: boolean;
      extraTag?: string;
    }

    const cardsToPlace: CardDesc[] = [];
    if (mapped.length <= 8) {
      for (const h of hubs) {
        for (const it of h.items) {
          cardsToPlace.push({
            hubX: h.x,
            hubY: h.y,
            badgeText: String(it.index).padStart(2, '0'),
            dateText: fmtShortPillDate(it.event.startAt, lang),
            titleText: it.event.title,
            subText: it.locationLabel,
            hiring: it.hiring,
            friend: it.friend,
            isArea: it.precision === 'area',
            extraTag: it.friend ? '朋友' : it.hiring ? '招人' : undefined,
          });
        }
      }
    } else {
      for (const h of hubs) {
        const first = h.items[0];
        const last = h.items[h.items.length - 1];
        const dateSpan =
          h.items.length === 1
            ? fmtShortPillDate(first.event.startAt, lang)
            : `${fmtShortPillDate(first.event.startAt, lang).split(' ')[0]}–${fmtShortPillDate(last.event.startAt, lang).split(' ')[0]}`;
        const badgeLabel =
          h.items.length === 1
            ? String(first.index).padStart(2, '0')
            : `${h.items.length}场`;
        cardsToPlace.push({
          hubX: h.x,
          hubY: h.y,
          badgeText: badgeLabel,
          dateText: dateSpan,
          titleText: first.event.title,
          subText:
            h.items.length === 1
              ? first.locationLabel
              : `${first.locationLabel} · 该点共 ${h.items.length} 场`,
          hiring: h.hasHiring,
          friend: h.hasFriend,
          isArea: h.isAreaOnly,
          extraTag: h.hasFriend ? '朋友' : h.hasHiring ? '招人' : undefined,
        });
      }
    }

    // Reserve anchor pin circles so cards never cover anchors
    const cardOccupied: { x1: number; y1: number; x2: number; y2: number }[] = [
      { ...legendBox },
      ...hubs.map((h) => ({ x1: h.x - 14, y1: h.y - 14, x2: h.x + 14, y2: h.y + 14 })),
    ];

    const cardW = cardsToPlace.length <= 6 ? 196 : 184;
    const cardH = 66;
    const placed: (CardDesc & { x: number; y: number; w: number; h: number })[] = [];

    // Multi-ring radial search strictly clamped inside [14, W - cardW - 14] x [14, H - cardH - 14]
    const rings = [62, 102, 144, 190, 238];
    const angles = [
      -Math.PI / 2,
      Math.PI / 2,
      Math.PI,
      0,
      (-3 * Math.PI) / 4,
      -Math.PI / 4,
      (3 * Math.PI) / 4,
      Math.PI / 4,
      (-5 * Math.PI) / 6,
      -Math.PI / 6,
      (5 * Math.PI) / 6,
      Math.PI / 6,
    ];

    for (const c of cardsToPlace) {
      let bestX = Math.max(14, Math.min(W - cardW - 14, c.hubX - cardW / 2));
      let bestY = Math.max(14, Math.min(H - cardH - 14, c.hubY - cardH - 26));
      let bestScore = Infinity;

      for (const dist of rings) {
        for (const ang of angles) {
          const cx = c.hubX + Math.cos(ang) * dist - cardW / 2;
          const cy = c.hubY + Math.sin(ang) * dist - cardH / 2;
          const tx = Math.max(14, Math.min(W - cardW - 14, Math.round(cx)));
          const ty = Math.max(14, Math.min(H - cardH - 14, Math.round(cy)));

          let penalty = Math.hypot(tx + cardW / 2 - c.hubX, ty + cardH / 2 - c.hubY);
          for (const b of cardOccupied) {
            const ox = Math.max(0, Math.min(tx + cardW + 8, b.x2) - Math.max(tx - 8, b.x1));
            const oy = Math.max(0, Math.min(ty + cardH + 8, b.y2) - Math.max(ty - 8, b.y1));
            if (ox > 0 && oy > 0) penalty += 10000 + ox * oy * 10;
          }
          if (penalty < bestScore) {
            bestScore = penalty;
            bestX = tx;
            bestY = ty;
          }
        }
        if (bestScore < 5000) break;
      }

      cardOccupied.push({ x1: bestX, y1: bestY, x2: bestX + cardW, y2: bestY + cardH });
      placed.push({ ...c, x: bestX, y: bestY, w: cardW, h: cardH });
    }

    // Reserve all placed callout cards + legend before drawing background MRT / district labels
    const occupied: { x1: number; y1: number; x2: number; y2: number }[] = [
      { ...legendBox },
      ...placed.map((c) => ({ x1: c.x - 4, y1: c.y - 4, x2: c.x + c.w + 4, y2: c.y + c.h + 4 })),
    ];

    // Layer 2: Key MRT stations (exact website style, strictly collision-free with callout cards)
    const sortedMrts = [...MAP_MRT_STATIONS].sort((a, b) => a.priority - b.priority);
    ctx.font = `500 11px ${fontStack}`;
    for (const st of sortedMrts) {
      const pt = map.project([st.lng, st.lat]);
      if (pt.x < 24 || pt.x > W - 24 || pt.y < 28 || pt.y > H - 28) continue;

      // Station colored dot with white halo
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = st.lineColor;
      ctx.fill();

      const tw = ctx.measureText(st.name).width;
      const box = { x1: pt.x + 6, y1: pt.y - 8, x2: pt.x + 12 + tw, y2: pt.y + 8 };
      const collides = occupied.some(
        (b) => !(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2),
      );
      if (!collides && box.x2 < W - 18) {
        occupied.push(box);
        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        ctx.fillText(st.name, pt.x + 8.5, pt.y + 3.5);
        ctx.fillStyle = '#64748b';
        ctx.fillText(st.name, pt.x + 7.5, pt.y + 3.5);
      }
    }

    // Layer 3: Key District Landmarks (skip any colliding with callout cards or MRT labels)
    ctx.font = `700 12px ${fontStack}`;
    for (const lm of DISTRICT_LABELS) {
      const pt = map.project([lm.lng, lm.lat]);
      if (pt.x < 28 || pt.x > W - 28 || pt.y < 24 || pt.y > H - 24) continue;
      const lw = ctx.measureText(lm.label).width;
      const box = { x1: pt.x - lw / 2 - 4, y1: pt.y - 24, x2: pt.x + lw / 2 + 4, y2: pt.y - 8 };
      const collides = occupied.some(
        (b) => !(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2),
      );
      if (collides) continue;
      occupied.push(box);
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.strokeText(lm.label, pt.x, pt.y - 12);
      ctx.fillStyle = '#18181b';
      ctx.fillText(lm.label, pt.x, pt.y - 12);
    }
    ctx.textAlign = 'left';

    // Draw smooth leader lines first
    for (const c of placed) {
      const nearX = Math.max(c.x, Math.min(c.hubX, c.x + c.w));
      const nearY = Math.max(c.y, Math.min(c.hubY, c.y + c.h));
      const mx = (c.hubX + nearX) / 2;
      const my = (c.hubY + nearY) / 2;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(c.hubX, c.hubY);
      ctx.quadraticCurveTo(mx, c.hubY, nearX, nearY);
      ctx.strokeStyle = c.hiring ? 'rgba(18, 87, 253, 0.72)' : 'rgba(100, 116, 139, 0.78)';
      ctx.lineWidth = c.hiring ? 1.5 : 1.25;
      if (c.isArea) ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.restore();
    }

    // Draw exact GPS hub rings (website blue anchor style)
    for (const h of hubs) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(h.x, h.y, 9.5, 0, Math.PI * 2);
      ctx.fillStyle = h.hasHiring ? 'rgba(18, 87, 253, 0.20)' : 'rgba(18, 87, 253, 0.14)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(h.x, h.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = h.hasHiring ? '#1257fd' : '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#1257fd';
      ctx.stroke();
      ctx.restore();
    }

    // Draw crisp website floating callout cards
    for (const c of placed) {
      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.10)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      drawRoundedRect(ctx, c.x, c.y, c.w, c.h, 8);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
      ctx.fill();
      ctx.restore();

      ctx.save();
      drawRoundedRect(ctx, c.x, c.y, c.w, c.h, 8);
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = c.isArea ? '#94a3b8' : c.friend ? '#141414' : '#d4d4d8';
      if (c.isArea) ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.restore();

      // Index / count pill badge
      const bx = c.x + 9;
      const by = c.y + 9;
      ctx.font = `700 10px ${fontStack}`;
      const bw = Math.max(20, Math.ceil(ctx.measureText(c.badgeText).width) + 10);
      drawRoundedRect(ctx, bx, by, bw, 17, 8.5);
      ctx.fillStyle = c.hiring ? '#1257fd' : '#141414';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(c.badgeText, bx + bw / 2, by + 12);
      ctx.textAlign = 'left';

      // Date pill
      ctx.font = `600 10.5px ${fontStack}`;
      ctx.fillStyle = c.hiring ? '#1257fd' : '#334155';
      ctx.fillText(c.dateText, bx + bw + 6, by + 12.5);

      // Right extra tag (招人 / 朋友)
      if (c.extraTag) {
        ctx.font = `700 10px ${fontStack}`;
        ctx.fillStyle = c.friend ? '#141414' : '#1257fd';
        ctx.textAlign = 'right';
        ctx.fillText(c.extraTag, c.x + c.w - 9, by + 12.5);
        ctx.textAlign = 'left';
      }

      // Event Title
      ctx.font = `700 11.5px ${fontStack}`;
      ctx.fillStyle = '#0a0a0a';
      ctx.fillText(truncText(ctx, c.titleText, c.w - 18), c.x + 9, c.y + 42);

      // MRT / venue subtitle
      ctx.font = `500 10px ${fontStack}`;
      ctx.fillStyle = '#64748b';
      ctx.fillText(truncText(ctx, `📍 ${c.subText}`, c.w - 18), c.x + 9, c.y + 57);
    }

    // Layer 5: Crisp bottom-right website semantic legend
    const lx = legendBox.x1;
    const ly = legendBox.y1;
    const lw = legendBox.x2 - legendBox.x1;
    const lh = legendBox.y2 - legendBox.y1;
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.08)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    drawRoundedRect(ctx, lx, ly, lw, lh, 9);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.fill();
    ctx.restore();
    drawRoundedRect(ctx, lx, ly, lw, lh, 9);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Row 1: exact address
    drawRoundedRect(ctx, lx + 12, ly + 13, 18, 11, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#71717a';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.font = `500 10.5px ${fontStack}`;
    ctx.fillStyle = '#334155';
    ctx.fillText('确定具体地址', lx + 38, ly + 22);

    // Row 2: area only
    ctx.save();
    drawRoundedRect(ctx, lx + 12, ly + 33, 18, 11, 3);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 2]);
    ctx.stroke();
    ctx.restore();
    ctx.fillText('仅确定区域位置（具体地址待公布）', lx + 38, ly + 42);

    // Divider
    ctx.beginPath();
    ctx.moveTo(lx + 12, ly + 56);
    ctx.lineTo(lx + lw - 12, ly + 56);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Row 3: hiring dot + community dot
    ctx.beginPath();
    ctx.arc(lx + 18, ly + 71, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#1257fd';
    ctx.fill();
    ctx.fillStyle = '#475569';
    ctx.fillText('主办方在招人', lx + 28, ly + 74.5);

    ctx.beginPath();
    ctx.arc(lx + 124, ly + 71, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#1257fd';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.fillStyle = '#475569';
    ctx.fillText('社区活动', lx + 134, ly + 74.5);

    // Subtle OpenFreeMap attribution
    ctx.font = `400 9px ${fontStack}`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Basemap © OpenFreeMap / OpenStreetMap', 12, H - 10);

    return out.toDataURL('image/png');
  } finally {
    if (map) {
      try {
        map.remove();
      } catch {
        // ignore
      }
    }
    container.remove();
  }
}
