'use client';

import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Lang } from '@/lib/types';
import { getDict } from '@/lib/i18n';
import type { EventEvalContext } from '@/lib/go-decision';

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  title: string;
  when: string;         // already formatted for the current language
  shortDate: string;    // compact date for map capsule, e.g. "11/28" or "Fri 28 Nov"
  venue: string;
  mrtName?: string;     // shown on capsule when within walking threshold (<= 15 min)
  mrtWalkText?: string; // formatted walking text for popup
  url: string;
  hiring: boolean;      // organiser has open roles
  hiringText?: string;
  evalContext: EventEvalContext;
}

// Basemap: OpenFreeMap "Positron" (OpenStreetMap data, no API key).
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const SINGAPORE: [number, number] = [103.84, 1.3];

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function overlapArea(a: Box, b: Box, pad = 4): number {
  const ox = Math.min(a.right + pad, b.right) - Math.max(a.left - pad, b.left);
  if (ox <= 0) return 0;
  const oy = Math.min(a.bottom + pad, b.bottom) - Math.max(a.top - pad, b.top);
  if (oy <= 0) return 0;
  return ox * oy;
}

const CANDIDATE_OFFSETS: [number, number][] = (() => {
  const list: [number, number][] = [[0, 0]];
  const rings = [
    { rx: 32, ry: 22, count: 8 },
    { rx: 64, ry: 38, count: 12 },
    { rx: 96, ry: 56, count: 14 },
  ];
  for (const ring of rings) {
    for (let i = 0; i < ring.count; i++) {
      // Start at -90deg (straight up) and fan out symmetrically
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / ring.count;
      list.push([Math.round(Math.cos(angle) * ring.rx), Math.round(Math.sin(angle) * ring.ry)]);
    }
  }
  return list;
})();

export default function EventMap({
  points,
  lang,
  registerLabel,
}: {
  points: MapPoint[];
  lang: Lang;
  registerLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const evaluateLabel = getDict(lang).gonogo.evaluateBtn;

  useEffect(() => {
    if (!ref.current) return;
    let map: import('maplibre-gl').Map | null = null;
    let cancelled = false;
    let rafId: number | null = null;

    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !ref.current) return;

      map = new maplibregl.Map({
        container: ref.current,
        style: STYLE_URL,
        center: SINGAPORE,
        zoom: 10.8,
        cooperativeGestures: true, // page scroll is not hijacked by the map
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

      // Group identical/same-building venues so their base coordinates fan out slightly even at high zoom.
      const venueCounts = new Map<string, number>();
      points.forEach((p) => {
        const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
        venueCounts.set(key, (venueCounts.get(key) ?? 0) + 1);
      });

      const venueIdx = new Map<string, number>();
      const bounds = new maplibregl.LngLatBounds();

      interface ManagedMarker {
        point: MapPoint;
        lngLat: [number, number];
        marker: import('maplibre-gl').Marker;
        el: HTMLElement;
        pill: HTMLButtonElement;
      }

      const managed: ManagedMarker[] = [];

      // Deterministic priority: hiring events first, then chronological.
      const ordered = [...points].sort((a, b) => {
        if (a.hiring !== b.hiring) return a.hiring ? -1 : 1;
        return a.evalContext.startAt.localeCompare(b.evalContext.startAt);
      });

      ordered.forEach((p) => {
        const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
        const count = venueCounts.get(key) ?? 1;
        const idx = venueIdx.get(key) ?? 0;
        venueIdx.set(key, idx + 1);

        let lng = p.lng;
        let lat = p.lat;
        if (count > 1) {
          const angle = (idx * 2 * Math.PI) / count;
          const radius = 0.00055;
          lng += Math.cos(angle) * radius;
          lat += Math.sin(angle) * radius;
        }
        const pos: [number, number] = [lng, lat];
        bounds.extend(pos);

        // Wrapper element owned by MapLibre (never apply CSS transform directly on wrap)
        const wrap = document.createElement('div');
        wrap.className = 'map-pill-wrap';

        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = `map-pill${p.hiring ? ' map-pill--hiring' : ''}`;
        pill.setAttribute(
          'aria-label',
          p.mrtName ? `${p.shortDate} ${p.mrtName} — ${p.title}` : `${p.shortDate} — ${p.title}`,
        );

        const dateSpan = document.createElement('span');
        dateSpan.className = 'map-pill-date';
        dateSpan.textContent = p.shortDate;
        pill.appendChild(dateSpan);

        if (p.mrtName) {
          const sep = document.createElement('span');
          sep.className = 'map-pill-sep';
          sep.setAttribute('aria-hidden', 'true');
          sep.textContent = '·';
          pill.appendChild(sep);

          const mrtSpan = document.createElement('span');
          mrtSpan.className = 'map-pill-mrt';
          mrtSpan.textContent = p.mrtName;
          pill.appendChild(mrtSpan);
        }

        const dot = document.createElement('span');
        dot.className = `map-pill-anchor${p.hiring ? ' map-pill-anchor--hiring' : ''}`;
        dot.setAttribute('aria-hidden', 'true');

        wrap.appendChild(pill);
        wrap.appendChild(dot);

        // Build popup with safe DOM nodes so we can attach the React Go/Not Go drawer trigger directly
        const popupRoot = document.createElement('div');
        popupRoot.className = 'map-popup';

        const titleEl = document.createElement('p');
        titleEl.className = 'map-popup-title';
        titleEl.textContent = p.title;
        popupRoot.appendChild(titleEl);

        const whenEl = document.createElement('p');
        whenEl.textContent = p.when;
        popupRoot.appendChild(whenEl);

        const venueEl = document.createElement('p');
        venueEl.textContent = p.venue;
        popupRoot.appendChild(venueEl);

        if (p.mrtWalkText) {
          const mrtEl = document.createElement('p');
          mrtEl.className = 'map-popup-mrt';
          mrtEl.textContent = p.mrtWalkText;
          popupRoot.appendChild(mrtEl);
        }

        if (p.hiringText) {
          const hiringEl = document.createElement('p');
          hiringEl.className = 'map-popup-hiring';
          hiringEl.textContent = p.hiringText;
          popupRoot.appendChild(hiringEl);
        }

        const actionsEl = document.createElement('div');
        actionsEl.className = 'map-popup-actions';

        const evalLink = document.createElement('a');
        evalLink.href = `/${lang}/gonogo?event=${encodeURIComponent(p.id)}`;
        evalLink.className = 'map-popup-eval';
        evalLink.textContent = `${evaluateLabel} →`;
        actionsEl.appendChild(evalLink);

        const regLink = document.createElement('a');
        regLink.href = p.url;
        regLink.target = '_blank';
        regLink.rel = 'noopener noreferrer';
        regLink.className = 'map-popup-reg';
        regLink.textContent = `${registerLabel} ↗`;
        actionsEl.appendChild(regLink);

        popupRoot.appendChild(actionsEl);

        const popup = new maplibregl.Popup({ offset: 16, maxWidth: '300px' }).setDOMContent(popupRoot);

        popup.on('open', () => {
          wrap.classList.add('map-pill-wrap--active');
        });
        popup.on('close', () => {
          wrap.classList.remove('map-pill-wrap--active');
        });

        const marker = new maplibregl.Marker({ element: wrap, anchor: 'bottom' })
          .setLngLat(pos)
          .setPopup(popup)
          .addTo(map!);

        managed.push({ point: p, lngLat: pos, marker, el: wrap, pill });
      });

      const layoutMarkers = () => {
        if (!map || cancelled) return;
        const placed: Box[] = [];

        managed.forEach((item) => {
          const pt = map!.project(item.lngLat);
          const w = item.pill.offsetWidth || 104;
          const h = (item.pill.offsetHeight || 24) + 6;

          let bestOffset: [number, number] = [0, 0];
          let bestOverlap = Number.POSITIVE_INFINITY;

          for (const [dx, dy] of CANDIDATE_OFFSETS) {
            const box: Box = {
              left: pt.x + dx - w / 2,
              right: pt.x + dx + w / 2,
              top: pt.y + dy - h,
              bottom: pt.y + dy,
            };
            let totalOv = 0;
            for (const existing of placed) {
              totalOv += overlapArea(box, existing, 4);
              if (totalOv >= bestOverlap) break;
            }
            if (totalOv === 0) {
              bestOffset = [dx, dy];
              bestOverlap = 0;
              break;
            }
            if (totalOv < bestOverlap) {
              bestOverlap = totalOv;
              bestOffset = [dx, dy];
            }
          }

          item.marker.setOffset(bestOffset);
          placed.push({
            left: pt.x + bestOffset[0] - w / 2,
            right: pt.x + bestOffset[0] + w / 2,
            top: pt.y + bestOffset[1] - h,
            bottom: pt.y + bestOffset[1],
          });
        });
      };

      const scheduleLayout = () => {
        if (rafId != null) window.cancelAnimationFrame(rafId);
        rafId = window.requestAnimationFrame(layoutMarkers);
      };

      if (points.length > 1) map.fitBounds(bounds, { padding: { top: 64, bottom: 52, left: 72, right: 72 }, maxZoom: 14, animate: false });
      else if (points.length === 1) map.jumpTo({ center: bounds.getCenter(), zoom: 14 });

      map.on('load', scheduleLayout);
      map.on('zoomend', scheduleLayout);
      map.on('moveend', scheduleLayout);
      scheduleLayout();
    })();

    return () => {
      cancelled = true;
      if (rafId != null) window.cancelAnimationFrame(rafId);
      map?.remove();
    };
  }, [points, lang, registerLabel, evaluateLabel]);

  return (
    <div className="relative min-h-[360px] flex-1 sm:min-h-[460px]">
      {/* Inline style on purpose: maplibre-gl.css sets `.maplibregl-map { position: relative }`,
          which beats a utility class in the production CSS order and collapses the map to 0px. */}
      <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}
