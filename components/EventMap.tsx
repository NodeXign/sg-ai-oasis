'use client';

import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  title: string;
  when: string;      // already formatted for the current language
  venue: string;
  url: string;
  hiring: boolean;   // organiser has open roles
  hiringText?: string;
}

// Basemap: OpenFreeMap "Positron" (OpenStreetMap data, no API key).
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const SINGAPORE: [number, number] = [103.84, 1.3];

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export default function EventMap({ points, registerLabel }: { points: MapPoint[]; registerLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    let map: import('maplibre-gl').Map | null = null;
    let cancelled = false;

    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !ref.current) return;

      map = new maplibregl.Map({
        container: ref.current,
        style: STYLE_URL,
        center: SINGAPORE,
        zoom: 10.5,
        cooperativeGestures: true,   // page scroll is not hijacked by the map
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

      // Events at the same venue would hide each other, so fan them out slightly.
      const seen = new Map<string, number>();
      const bounds = new maplibregl.LngLatBounds();
      points.forEach((p) => {
        const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
        const n = seen.get(key) ?? 0;
        seen.set(key, n + 1);
        const pos: [number, number] = [p.lng + n * 0.0012, p.lat + n * 0.0012];
        bounds.extend(pos);

        const dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('aria-label', p.title);
        dot.className = `map-dot${p.hiring ? ' map-dot--hiring' : ''}`;

        const popup = new maplibregl.Popup({ offset: 12, maxWidth: '280px' }).setHTML(
          `<div class="map-popup">
             <p class="map-popup-title">${esc(p.title)}</p>
             <p>${esc(p.when)}</p>
             <p>${esc(p.venue)}</p>
             ${p.hiringText ? `<p class="map-popup-hiring">${esc(p.hiringText)}</p>` : ''}
             <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(registerLabel)} ↗</a>
           </div>`,
        );
        new maplibregl.Marker({ element: dot }).setLngLat(pos).setPopup(popup).addTo(map!);
      });

      if (points.length > 1) map.fitBounds(bounds, { padding: 56, maxZoom: 14, animate: false });
      else if (points.length === 1) map.jumpTo({ center: bounds.getCenter(), zoom: 14 });
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points, registerLabel]);

  return (
    <div className="relative min-h-[360px] flex-1 sm:min-h-[460px]">
      <div ref={ref} className="absolute inset-0" />
    </div>
  );
}
