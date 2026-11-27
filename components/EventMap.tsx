'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAP_MRT_STATIONS, SG_LANDMARKS, type MapMrtStation } from './SgLandmarks';
import { buildSgCity3DGeoJson } from './SgCity3D';

export type MapPrecision = 'exact' | 'area';

export interface MapPoint {
  id: string;
  index: number;          // 1-based strict chronological order
  lat: number;
  lng: number;
  title: string;          // original event title, never translated
  datePill: string;       // compact date + weekday capsule
  when: string;           // full formatted date + time
  venue: string;
  address: string;
  locationLabel: string;  // concise MRT or area string for floating card
  precision: MapPrecision;
  url: string;
  organiser?: string;
  hiring: boolean;        // organiser has open roles in Singapore
  hiringText?: string;
  hiringHref?: string;
  evaluateHref: string;
}

export interface MapCopy {
  register: string;
  resetView: string;
  expand: string;
  collapse: string;
  mode3D: string;
  mode2D: string;
  clusterHint: string;
  legendExact: string;
  legendArea: string;
  legendHiring: string;
  legendEvent: string;
  hiringBadge: string;
  viewRoles: string;
  evaluate: string;
  close: string;
}

// Basemap: OpenFreeMap "Positron" (OpenStreetMap data, no API key),
// styled as a minimalist Mapbox Light monochrome canvas with 3D extruded buildings.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const SINGAPORE_CENTER: [number, number] = [103.825, 1.298];
const DESKTOP_MIN_WIDTH = 720;
const PITCH_3D = 58;
const MOBILE_PITCH_3D = 48;
const BEARING_3D = -10;

interface ProjectedPoint {
  point: MapPoint;
  anchorX: number;
  anchorY: number;
  visible: boolean;
}

interface HubCluster {
  id: string;
  hubX: number;
  hubY: number;
  items: ProjectedPoint[];
  hasHiring: boolean;
}

interface PlacedCard {
  point: MapPoint;
  hubId: string;
  hubX: number;
  hubY: number;
  anchorX: number;
  anchorY: number;
  cardX: number;
  cardY: number;
  cardW: number;
  cardH: number;
  curveD: string;
  endX: number;
  endY: number;
}

interface ProjectedLandmark {
  id: string;
  x: number;
  y: number;
  visible: boolean;
}

interface ProjectedMrt {
  station: MapMrtStation;
  x: number;
  y: number;
  showLabel: boolean;
  labelLeft: boolean;
}

/**
 * Restyles OpenFreeMap Positron into a crisp Mapbox-Light monochrome "AI City" basemap
 * and injects 3D architectural extrusions (district skyline + street-level buildings).
 */
function applyMonochrome3DStyle(map: import('maplibre-gl').Map, enable3D: boolean) {
  const style = map.getStyle();
  if (!style?.layers) return;

  let vectorBuildingSource: string | null = null;
  let vectorBuildingSourceLayer: string | null = null;

  for (const layer of style.layers) {
    const id = layer.id.toLowerCase();
    const type = layer.type;

    if (id.includes('building') && 'source' in layer && 'source-layer' in layer) {
      vectorBuildingSource = String(layer.source);
      vectorBuildingSourceLayer = String(layer['source-layer']);
    }

    try {
      // Remove noisy GIS text / POI symbols so our true-GPS landmarks & MRT hubs shine
      if (type === 'symbol') {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
        continue;
      }

      // Crisp alabaster white-gray landmass (Mapbox Light monochrome)
      if (type === 'background') {
        map.setPaintProperty(layer.id, 'background-color', '#f7f8fa');
        continue;
      }

      // Cool minimalist silver-gray water
      if (id.includes('water')) {
        if (type === 'fill') {
          map.setPaintProperty(layer.id, 'fill-color', '#dce5ed');
          map.setPaintProperty(layer.id, 'fill-outline-color', '#b9c7d2');
        }
        else if (type === 'line') map.setPaintProperty(layer.id, 'line-color', '#dce1e8');
        continue;
      }

      // Ultra-subtle monochrome parks / greenery
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

      // Hide flat building footprints (replaced by 3D extrusions), railways, admin borders
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

      // Fine monochrome Mapbox Light road hierarchy (major white-silver + delicate urban grid)
      if (
        id.includes('road') ||
        id.includes('highway') ||
        id.includes('motorway') ||
        id.includes('trunk') ||
        id.includes('tunnel') ||
        id.includes('bridge')
      ) {
        if (id.includes('casing') || id.includes('link') || id.includes('ramp') || id.includes('path') || id.includes('track')) {
          map.setLayoutProperty(layer.id, 'visibility', 'none');
          continue;
        }
        if (type === 'line') {
          const isMajor = id.includes('motorway') || id.includes('trunk') || id.includes('primary');
          const isSecondary = id.includes('secondary') || id.includes('tertiary');
          if (isMajor) {
            map.setPaintProperty(layer.id, 'line-color', '#ffffff');
            map.setPaintProperty(layer.id, 'line-opacity', 0.95);
            map.setPaintProperty(layer.id, 'line-width', [
              'interpolate', ['linear'], ['zoom'],
              9, 0.8,
              12, 1.8,
              14, 3.0,
            ]);
          } else if (isSecondary) {
            map.setPaintProperty(layer.id, 'line-color', '#e4e7ec');
            map.setPaintProperty(layer.id, 'line-opacity', 0.72);
            map.setPaintProperty(layer.id, 'line-width', [
              'interpolate', ['linear'], ['zoom'],
              10, 0.35,
              12, 0.75,
              14, 1.4,
            ]);
          } else {
            map.setLayoutProperty(layer.id, 'visibility', 'none');
          }
        }
      }
    } catch {
      // Ignore layers whose properties differ across style updates
    }
  }

  // Soft architectural directional lighting for monochrome 3D shading
  try {
    map.setLight({
      anchor: 'viewport',
      color: '#ffffff',
      intensity: 0.48,
      position: [1.35, 210, 42],
    });
  } catch {
    // Fallback cleanly if WebGL light is unsupported
  }

  // 1. Custom 3D AI City architectural skyline massing (visible immediately at island zoom)
  if (!map.getSource('sg-city-3d')) {
    map.addSource('sg-city-3d', {
      type: 'geojson',
      data: buildSgCity3DGeoJson(),
    });
    map.addLayer({
      id: 'sg-city-3d-extrusion',
      type: 'fill-extrusion',
      source: 'sg-city-3d',
      layout: { visibility: enable3D ? 'visible' : 'none' },
      paint: {
        'fill-extrusion-color': [
          'case',
          ['==', ['get', 'accent'], 1],
          '#dde6fb',
          '#e8ebef',
        ],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': [
          'interpolate', ['linear'], ['zoom'],
          10, 0.78,
          12.8, 0.62,
          13.6, 0.0,
        ],
      },
    });
  }

  // 2. Real street-level OpenFreeMap 3D buildings fading in smoothly as user zooms into a district
  if (vectorBuildingSource && vectorBuildingSourceLayer && !map.getLayer('sg-osm-3d-buildings')) {
    try {
      map.addLayer({
        id: 'sg-osm-3d-buildings',
        type: 'fill-extrusion',
        source: vectorBuildingSource,
        'source-layer': vectorBuildingSourceLayer,
        minzoom: 12.6,
        layout: { visibility: enable3D ? 'visible' : 'none' },
        paint: {
          'fill-extrusion-color': [
            'interpolate', ['linear'],
            ['coalesce', ['get', 'render_height'], 12],
            0, '#eff1f5',
            40, '#e3e7ee',
            120, '#d5dce8',
          ],
          'fill-extrusion-height': [
            'interpolate', ['linear'], ['zoom'],
            12.6, 0,
            13.2, ['coalesce', ['get', 'render_height'], 14],
          ],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.82,
        },
      });
    } catch {
      // Skip if source-layer schema differs
    }
  }
}

function buildOrganicCurve(
  hx: number,
  hy: number,
  cardX: number,
  cardY: number,
  cardW: number,
  cardH: number,
): { curveD: string; endX: number; endY: number } {
  const cx = cardX + cardW / 2;
  const cy = cardY + cardH / 2;
  const dx = cx - hx;
  const dy = cy - hy;

  let endX: number;
  let endY: number;
  let c1x: number;
  let c1y: number;
  let c2x: number;
  let c2y: number;

  if (Math.abs(dx) * 0.85 >= Math.abs(dy) || cardX + cardW < hx - 6 || cardX > hx + 6) {
    // Horizontal knowledge-graph branch (left or right of MRT hub)
    const onLeft = cx < hx;
    endX = onLeft ? cardX + cardW : cardX;
    endY = Math.round(cardY + cardH / 2);
    const span = endX - hx;
    c1x = hx + span * 0.48;
    c1y = hy;
    c2x = hx + span * 0.52;
    c2y = endY;
  } else {
    // Vertical branch (below or above MRT hub)
    const above = cy < hy;
    endX = Math.round(cardX + cardW / 2);
    endY = above ? cardY + cardH : cardY;
    const span = endY - hy;
    c1x = hx;
    c1y = hy + span * 0.48;
    c2x = endX;
    c2y = hy + span * 0.52;
  }

  return {
    curveD: `M ${hx.toFixed(1)} ${hy.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${endX.toFixed(1)} ${endY.toFixed(1)}`,
    endX,
    endY,
  };
}

/**
 * Organic MRT-Hub Knowledge-Graph layout:
 * Clusters events by MRT hub, keeps cards intimately close (44–62px) to the left/right
 * of their MRT node in strict chronological order, and resolves collisions gracefully.
 */
function computeOrganicGraphLayout(
  projected: ProjectedPoint[],
  width: number,
  height: number,
  expanded: boolean,
  stations: ProjectedMrt[],
  landmarks: ProjectedLandmark[],
): { cards: PlacedCard[]; hubs: HubCluster[] } {
  if (width < DESKTOP_MIN_WIDTH || height < 340 || projected.length === 0) {
    return { cards: [], hubs: [] };
  }

  const cardW = expanded ? 196 : width >= 1120 ? 178 : 168;
  const cardH = expanded ? 62 : 60;
  const gap = 8;

  // 1. Cluster visible points into geographic MRT hubs (~600m radius)
  const inView = projected.filter(
    (p) => p.anchorX >= -40 && p.anchorX <= width + 40 && p.anchorY >= -40 && p.anchorY <= height + 40,
  );
  const rawHubs: HubCluster[] = [];

  for (const item of inView) {
    const existing = rawHubs.find((h) => {
      const ref = h.items[0].point;
      return Math.abs(ref.lat - item.point.lat) < 0.006 && Math.abs(ref.lng - item.point.lng) < 0.006;
    });
    if (existing) {
      existing.items.push(item);
      if (item.point.hiring) existing.hasHiring = true;
    } else {
      rawHubs.push({
        id: `hub-${rawHubs.length}`,
        hubX: item.anchorX,
        hubY: item.anchorY,
        items: [item],
        hasHiring: item.point.hiring,
      });
    }
  }

  // Strictly sort each hub's events chronologically by index ascending (1 -> 2 -> 3...)
  for (const hub of rawHubs) {
    hub.items.sort((a, b) => a.point.index - b.point.index);
    hub.hubX = hub.items.reduce((s, it) => s + it.anchorX, 0) / hub.items.length;
    hub.hubY = hub.items.reduce((s, it) => s + it.anchorY, 0) / hub.items.length;
  }


  // Reserved UI zones (top-left zoom/3D controls, top-right attribution, bottom-right legend)
  const blockedZones = [
    { x1: 0, y1: 0, x2: 185, y2: 112 },
    { x1: width - 270, y1: 0, x2: width, y2: 36 },
    { x1: width - 252, y1: height - 114, x2: width, y2: height },
  ];
  // Reserve station symbols, their visible names and landmark illustrations.
  for (const m of stations) {
    const labelWidth = m.showLabel ? m.station.name.length * 7 + 18 : 8;
    blockedZones.push({
      x1: m.labelLeft ? m.x - labelWidth - 6 : m.x - 8,
      x2: m.labelLeft ? m.x + 8 : m.x + labelWidth + 6,
      y1: m.y - 12, y2: m.y + 12,
    });
  }
  for (const l of landmarks) {
    if (l.visible) blockedZones.push({ x1: l.x - 35, x2: l.x + 35, y1: l.y - 37, y2: l.y + 18 });
  }

  // 2. Seed each hub's cards organically around its MRT node
  interface DraftNode {
    hub: HubCluster;
    item: ProjectedPoint;
    x: number;
    y: number;
    w: number;
    h: number;
    side: 'left' | 'right' | 'bottom';
  }

  const drafts: DraftNode[] = [];

  // Place the busiest hubs first; score candidate positions against occupied cards,
  // controls and station markers. This keeps connections short without moving
  // an already placed card across the map during collision resolution.
  const orderedHubs = [...rawHubs].sort((a, b) => b.items.length - a.items.length);
  const overlap = (x: number, y: number, w: number, h: number, r: {x1:number; y1:number; x2:number; y2:number}) =>
    Math.max(0, Math.min(x + w, r.x2) - Math.max(x, r.x1)) *
    Math.max(0, Math.min(y + h, r.y2) - Math.max(y, r.y1));

  for (const hub of orderedHubs) {
    const rows = Math.ceil(hub.items.length / 2);
    hub.items.forEach((item, idx) => {
      const row = Math.floor(idx / 2);
      const preferredSide = idx % 2 === 0 ? -1 : 1;
      const preferredY = hub.hubY - (rows * cardH + (rows - 1) * gap) / 2 + row * (cardH + gap);
      let best: DraftNode | null = null;
      let bestScore = Infinity;
      let bestCollision = Infinity;
      for (const side of [preferredSide, -preferredSide]) {
        for (let ring = 0; ring < 9; ring++) {
          for (let dy = -8; dy <= 8; dy++) {
            const x = Math.max(14, Math.min(width - cardW - 14,
              side < 0 ? hub.hubX - 34 - cardW - ring * 42 : hub.hubX + 34 + ring * 42));
            const y = Math.max(46, Math.min(height - cardH - 14, preferredY + dy * (cardH + gap)));
            let collisions = 0;
            for (const z of blockedZones) collisions += overlap(x, y, cardW, cardH, z);
            for (const h of rawHubs) collisions += overlap(x, y, cardW, cardH,
              { x1: h.hubX - 18, y1: h.hubY - 18, x2: h.hubX + 18, y2: h.hubY + 18 });
            for (const d of drafts) collisions += overlap(x, y, cardW + gap, cardH + gap,
              { x1: d.x, y1: d.y, x2: d.x + d.w, y2: d.y + d.h });
            const previous = [...drafts].reverse().find((d) => d.hub.id === hub.id);
            const outOfOrder = previous && y < previous.y - 2 ? 100000 : 0;
            const score = collisions * 1000 + outOfOrder + Math.abs(y - preferredY) * 2 + ring * 50 +
              (side === preferredSide ? 0 : 35);
            if (collisions < bestCollision || (collisions === bestCollision && score < bestScore)) {
              bestScore = score;
              bestCollision = collisions;
              best = { hub, item, x, y, w: cardW, h: cardH, side: side < 0 ? 'left' : 'right' };
            }
          }
        }
      }
      if (best && bestCollision === 0) drafts.push(best);
    });
  }

  // 4. Build final PlacedCards with silky Bezier knowledge-graph connectors
  const cards: PlacedCard[] = drafts.map((d) => {
    const cardX = Math.round(d.x);
    const cardY = Math.round(d.y);
    const { curveD, endX, endY } = buildOrganicCurve(d.hub.hubX, d.hub.hubY, cardX, cardY, d.w, d.h);
    return {
      point: d.item.point,
      hubId: d.hub.id,
      hubX: d.hub.hubX,
      hubY: d.hub.hubY,
      anchorX: d.item.anchorX,
      anchorY: d.item.anchorY,
      cardX,
      cardY,
      cardW: d.w,
      cardH: d.h,
      curveD,
      endX,
      endY,
    };
  });

  cards.sort((a, b) => a.point.index - b.point.index);
  return { cards, hubs: rawHubs };
}

function PinIcon({ className = 'h-2.5 w-2.5 shrink-0' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <path
        d="M8 14s4.5-4.1 4.5-7.7A4.5 4.5 0 1 0 3.5 6.3C3.5 9.9 8 14 8 14Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="6.2" r="1.4" fill="currentColor" />
    </svg>
  );
}

export default function EventMap({ points, copy }: { points: MapPoint[]; copy: MapCopy }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('maplibre-gl').Map | null>(null);
  const rafRef = useRef<number | null>(null);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [projectedPoints, setProjectedPoints] = useState<ProjectedPoint[]>([]);
  const [projectedLandmarks, setProjectedLandmarks] = useState<ProjectedLandmark[]>([]);
  const [projectedMrts, setProjectedMrts] = useState<ProjectedMrt[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [is3D, setIs3D] = useState(true);
  const is3DRef = useRef(true);
  const [expanded, setExpanded] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const isDesktop = size.width >= DESKTOP_MIN_WIDTH;
  const useCards = isDesktop && points.length <= 16;
  const activeId = hoveredId ?? selectedId;

  const selectedPoint = useMemo(
    () => points.find((p) => p.id === selectedId) ?? null,
    [points, selectedId],
  );

  const syncProjections = useCallback(() => {
    const map = mapRef.current;
    const stage = stageRef.current;
    if (!map || !stage) return;

    const rect = stage.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    setSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));

    // 1. Project event anchors (all points stay at their true projected GPS coords; hub beacons group them)
    const nextPoints: ProjectedPoint[] = points.map((p) => {
      const pt = map.project([p.lng, p.lat]);
      const visible = pt.x >= -30 && pt.x <= w + 30 && pt.y >= -30 && pt.y <= h + 30;
      return { point: p, anchorX: pt.x, anchorY: pt.y, visible };
    });
    nextPoints.sort((a, b) => a.point.index - b.point.index);
    setProjectedPoints(nextPoints);

    // 2. Project 6 architectural landmarks directly at their true GPS positions
    const occupiedBoxes: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const nextLandmarks: ProjectedLandmark[] = SG_LANDMARKS.map((lm) => {
      const pt = map.project([lm.lng, lm.lat]);
      const box = { x1: pt.x - 36, y1: pt.y - 40, x2: pt.x + 36, y2: pt.y + 18 };
      const inView = pt.x >= 40 && pt.x <= w - 40 && pt.y >= 40 && pt.y <= h - 20;
      const visible = inView && !occupiedBoxes.some((b) =>
        !(box.x2 <= b.x1 || box.x1 >= b.x2 || box.y2 <= b.y1 || box.y1 >= b.y2));
      if (visible) occupiedBoxes.push(box);
      return { id: lm.id, x: pt.x, y: pt.y, visible };
    });
    setProjectedLandmarks(nextLandmarks);

    // 3. Project common Singapore MRT stations at exact GPS with collision-free labels
    const sortedMrts = [...MAP_MRT_STATIONS].sort((a, b) => a.priority - b.priority);
    const nextMrts: ProjectedMrt[] = [];

    for (const st of sortedMrts) {
      const pt = map.project([st.lng, st.lat]);
      if (pt.x < 24 || pt.x > w - 24 || pt.y < 36 || pt.y > h - 36) continue;

      const labelW = st.name.length * 7 + 18;
      const labelLeft = pt.x + labelW > w - 24;
      const box = labelLeft
        ? { x1: pt.x - labelW, y1: pt.y - 11, x2: pt.x + 4, y2: pt.y + 11 }
        : { x1: pt.x - 4, y1: pt.y - 11, x2: pt.x + labelW, y2: pt.y + 11 };
      const collides = occupiedBoxes.some(
        (b) => !(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2),
      );
      if (!collides) occupiedBoxes.push(box);
      nextMrts.push({ station: st, x: pt.x, y: pt.y, showLabel: !collides, labelLeft });
    }
    setProjectedMrts(nextMrts);
  }, [points]);

  const scheduleSync = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      syncProjections();
    });
  }, [syncProjections]);

  const fitIslandView = useCallback(
    (map: import('maplibre-gl').Map, animate: boolean, use3D = is3DRef.current) => {
      const stage = stageRef.current;
      const w = stage?.clientWidth ?? 1160;
      const desktop = w >= DESKTOP_MIN_WIDTH;

      // Default to the active city belt shown in the reference; users can zoom out for the whole island.
      let minLng = 103.675;
      let maxLng = 103.96;
      let minLat = 1.26;
      let maxLat = 1.40;

      for (const p of points) {
        minLng = Math.min(minLng, p.lng);
        maxLng = Math.max(maxLng, p.lng);
        minLat = Math.min(minLat, p.lat);
        maxLat = Math.max(maxLat, p.lat);
      }

      map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        {
          padding: desktop
            ? { top: 58, bottom: 70, left: 58, right: 58 }
            : { top: 42, bottom: 28, left: 20, right: 20 },
          maxZoom: desktop ? 12.1 : 11.4,
          pitch: use3D ? (desktop ? PITCH_3D : MOBILE_PITCH_3D) : 0,
          bearing: use3D ? BEARING_3D : 0,
          animate,
          duration: animate ? 520 : 0,
        },
      );
    },
    [points],
  );

  // Initialize MapLibre instance in 3D Monochrome AI City mode
  useEffect(() => {
    if (!mapContainerRef.current) return;
    let cancelled = false;
    let map: import('maplibre-gl').Map | null = null;

    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !mapContainerRef.current) return;

      map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: STYLE_URL,
        center: SINGAPORE_CENTER,
        zoom: 11.4,
        pitch: PITCH_3D,
        bearing: BEARING_3D,
        minZoom: 8.7,
        maxZoom: 16.2,
        maxPitch: 62,
        cooperativeGestures: true,
        attributionControl: false,
      });

      map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-left');
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');
      mapRef.current = map;

      map.on('style.load', () => {
        if (!map) return;
        applyMonochrome3DStyle(map, true);
        setMapReady(true);
        fitIslandView(map, false, true);
        syncProjections();
      });

      map.on('move', scheduleSync);
      map.on('resize', scheduleSync);
      map.on('click', () => setSelectedId(null));

      fitIslandView(map, false, true);
      syncProjections();
    })();

    let lastDesktop = (stageRef.current?.clientWidth ?? 1160) >= DESKTOP_MIN_WIDTH;
    const ro = new ResizeObserver(() => {
      const m = mapRef.current;
      if (!m) return;
      m.resize();
      const nowDesktop = (stageRef.current?.clientWidth ?? 1160) >= DESKTOP_MIN_WIDTH;
      if (nowDesktop !== lastDesktop) {
        lastDesktop = nowDesktop;
        fitIslandView(m, false);
      }
      scheduleSync();
    });
    if (stageRef.current) ro.observe(stageRef.current);

    return () => {
      cancelled = true;
      ro.disconnect();
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
      map?.remove();
      mapRef.current = null;
    };
  }, [fitIslandView, scheduleSync, syncProjections]);

  // Toggle 3D / 2D camera pitch + extruded buildings smoothly
  const handleToggle3D = () => {
    const next = !is3D;
    is3DRef.current = next;
    setIs3D(next);
    const m = mapRef.current;
    if (!m) return;
    ['sg-city-3d-extrusion', 'sg-osm-3d-buildings'].forEach((layerId) => {
      try {
        if (m.getLayer(layerId)) {
          m.setLayoutProperty(layerId, 'visibility', next ? 'visible' : 'none');
        }
      } catch {
        // Ignore if layer not yet ready
      }
    });
    m.easeTo({
      pitch: next ? (isDesktop ? PITCH_3D : MOBILE_PITCH_3D) : 0,
      bearing: next ? BEARING_3D : 0,
      duration: 500,
    });
  };

  // Resize & re-fit map smoothly when toggling fullscreen
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const timer = window.setTimeout(() => {
      m.resize();
      fitIslandView(m, false);
      syncProjections();
    }, 60);
    return () => window.clearTimeout(timer);
  }, [expanded, fitIslandView, syncProjections]);

  // Escape closes detail card or fullscreen
  useEffect(() => {
    if (!selectedId && !expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedId) setSelectedId(null);
      else if (expanded) setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, expanded]);

  const { cards: placedCards, hubs } = useMemo(
    () => (useCards ? computeOrganicGraphLayout(projectedPoints, size.width, size.height, expanded, projectedMrts, projectedLandmarks) : { cards: [], hubs: [] }),
    [useCards, projectedPoints, size.width, size.height, expanded, projectedMrts, projectedLandmarks],
  );

  // On narrow screens, group nearby events and move their marker clear of
  // station names, landmark illustrations, controls and other markers.
  // The complete chronological event list stays below the map.
  const mobileMarkers = useMemo(() => {
    if (useCards) return [];
    const groups: ProjectedPoint[][] = [];
    for (const p of projectedPoints.filter((item) => item.visible)) {
      const group = groups.find((g) =>
        Math.abs(g[0].point.lat - p.point.lat) < 0.006 &&
        Math.abs(g[0].point.lng - p.point.lng) < 0.006);
      if (group) group.push(p); else groups.push([p]);
    }
    const occupied = [
      { x1: 0, y1: 0, x2: 155, y2: 145 },
      { x1: size.width - 160, y1: 0, x2: size.width, y2: 35 },
      ...projectedLandmarks.filter((l) => l.visible).map((l) =>
        ({ x1: l.x - 37, y1: l.y - 40, x2: l.x + 37, y2: l.y + 18 })),
      ...projectedMrts.map((m) => {
        const labelWidth = m.showLabel ? m.station.name.length * 7 + 18 : 8;
        return { x1: m.labelLeft ? m.x - labelWidth - 6 : m.x - 8,
          x2: m.labelLeft ? m.x + 8 : m.x + labelWidth + 6,
          y1: m.y - 13, y2: m.y + 13 };
      }),
    ];
    const result: { group: ProjectedPoint[]; x: number; y: number; ax: number; ay: number }[] = [];
    for (const group of groups) {
      const ax = group.reduce((sum, p) => sum + p.anchorX, 0) / group.length;
      const ay = group.reduce((sum, p) => sum + p.anchorY, 0) / group.length;
      const offsets = [[0,-27],[27,0],[-27,0],[0,27],[25,-25],[-25,-25],[25,25],[-25,25],
        [0,-52],[52,0],[-52,0],[0,52],[45,-45],[-45,-45],[45,45],[-45,45]];
      for (const [dx,dy] of offsets) {
        const x = ax + dx, y = ay + dy;
        const box = { x1: x-14, y1: y-14, x2: x+14, y2: y+14 };
        if (box.x1 < 4 || box.x2 > size.width-4 || box.y1 < 4 || box.y2 > size.height-4) continue;
        if (occupied.some((b) => !(box.x2 <= b.x1 || box.x1 >= b.x2 || box.y2 <= b.y1 || box.y1 >= b.y2))) continue;
        occupied.push(box);
        result.push({ group, x, y, ax, ay });
        break;
      }
    }
    return result;
  }, [useCards, projectedPoints, projectedMrts, projectedLandmarks, size.width, size.height]);

  const visibleMrts = projectedMrts;
  // Cards that cannot fit safely remain available in the ordered list below.
  const unplacedPoints = useCards
    ? points.filter((p) => !placedCards.some((c) => c.point.id === p.id))
    : points;

  const landmarkById = useMemo(
    () => Object.fromEntries(SG_LANDMARKS.map((l) => [l.id, l])),
    [],
  );

  const handleResetView = () => {
    setSelectedId(null);
    if (mapRef.current) fitIslandView(mapRef.current, true, is3D);
  };

  const mapContent = (
    <div className={expanded ? 'map-fullscreen' : 'flex flex-col'}>
      <div
        ref={stageRef}
        className={
          expanded
            ? 'map-stage relative w-full flex-1 overflow-hidden'
            : 'map-stage relative h-[450px] w-full overflow-hidden md:h-[560px] lg:h-[600px]'
        }
      >
        {/* Inline style on purpose: maplibre-gl.css sets `.maplibregl-map { position: relative }`,
            which beats a utility class in production CSS order and collapses the map to 0px. */}
        <div ref={mapContainerRef} style={{ position: 'absolute', inset: 0 }} />

        {/* Layer 1A: Common Singapore MRT station micro-anchors (exact real GPS) */}
        <div className="pointer-events-none absolute inset-0 z-[9] overflow-hidden" aria-hidden="true">
          {visibleMrts.map(({ station, x, y, showLabel, labelLeft }) => (
            <div
              key={station.id}
              className={`map-mrt absolute ${labelLeft ? 'flex-row-reverse' : ''}`}
              style={{
                left: `${x}px`,
                top: `${y}px`,
                transform: labelLeft ? 'translate(calc(-100% + 2.5px), -50%)' : 'translate(-2.5px, -50%)',
                opacity: mapReady ? 0.74 : 0.5,
              }}
            >
              <span className="map-mrt-dot" style={{ backgroundColor: station.lineColor }} />
              {showLabel && <span className="map-mrt-label">{station.name}</span>}
            </div>
          ))}
        </div>

        {/* Layer 1B: 6 compact hand-drawn architectural Line-Art Landmarks (exact real GPS) */}
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden="true">
          {projectedLandmarks.map((lm) => {
            if (!lm.visible) return null;
            const spec = landmarkById[lm.id];
            if (!spec) return null;
            const labelEl = (
              <span
                className="map-landmark-label"
                style={spec.labelNudgeX ? { transform: `translateX(${spec.labelNudgeX}px)` } : undefined}
              >
                {spec.label}
              </span>
            );
            return (
              <div
                key={lm.id}
                className="map-landmark absolute"
                style={{
                  left: `${lm.x}px`,
                  top: `${lm.y}px`,
                  transform: spec.labelPos === 'top' ? 'translate(-50%, -95%)' : 'translate(-50%, -70%)',
                  opacity: mapReady ? 0.9 : 0.72,
                }}
              >
                {spec.labelPos === 'top' && labelEl}
                {spec.icon}
                {spec.labelPos !== 'top' && labelEl}
              </div>
            );
          })}
        </div>

        {/* Layer 2: Organic Knowledge-Graph Bezier Connectors (hub -> nearby chronological cards) */}
        {useCards && placedCards.length > 0 && (
          <svg
            className="pointer-events-none absolute inset-0 z-[12] h-full w-full"
            width={size.width}
            height={size.height}
            aria-hidden="true"
          >
            {placedCards.map((c) => {
              const isActive = activeId === c.point.id;
              const isDimmed = activeId != null && !isActive;
              const isArea = c.point.precision === 'area';
              const stroke = isActive ? '#1257fd' : c.point.hiring ? '#5c86f6' : '#94a3b8';
              return (
                <g
                  key={c.point.id}
                  style={{
                    opacity: isDimmed ? 0.22 : isActive ? 1 : 0.82,
                    transition: 'opacity 150ms ease',
                  }}
                >
                  <path
                    d={c.curveD}
                    fill="none"
                    stroke="rgba(255,255,255,0.82)"
                    strokeWidth={isActive ? 4 : 2.6}
                    strokeLinecap="round"
                  />
                  <path
                    d={c.curveD}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={isActive ? 2 : 1.25}
                    strokeDasharray={isArea ? '4 3' : undefined}
                    strokeLinecap="round"
                  />
                  <circle cx={c.endX} cy={c.endY} r={isActive ? 3 : 2.2} fill={stroke} />
                </g>
              );
            })}
          </svg>
        )}

        {/* Layer 2B: Glowing MRT Hub Radar Beacons (game-like AI City nodes) */}
        {useCards && (
          <div className="pointer-events-none absolute inset-0 z-[13] overflow-hidden" aria-hidden="true">
            {hubs.map((hub) => (
              <div
                key={hub.id}
                className="map-hub-beacon"
                style={{ left: `${hub.hubX}px`, top: `${hub.hubY}px` }}
              />
            ))}
          </div>
        )}

        {!useCards && mobileMarkers.length > 0 && (
          <svg className="pointer-events-none absolute inset-0 z-[12] h-full w-full" aria-hidden="true">
            {mobileMarkers.map((m) => <line key={m.group[0].point.id} x1={m.ax} y1={m.ay}
              x2={m.x} y2={m.y} stroke="#7489ae" strokeWidth="1.2" />)}
          </svg>
        )}

        {/* Layer 3: Interactive Hub / Event Anchor Nodes */}
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
          {(useCards ? hubs : []).map((hub) => {
            const first = hub.items[0].point;
            const anyActive = hub.items.some((it) => it.point.id === activeId);
            const isArea = hub.items.every((it) => it.point.precision === 'area');
            return (
              <button
                key={hub.id}
                type="button"
                aria-label={`${first.index}. ${first.title}`}
                onMouseEnter={() => setHoveredId(first.id)}
                onMouseLeave={() => setHoveredId((prev) => (prev === first.id ? null : prev))}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId((prev) => (prev === first.id ? null : first.id));
                }}
                style={{ left: `${hub.hubX}px`, top: `${hub.hubY}px` }}
                className={[
                  'pointer-events-auto map-anchor',
                  hub.hasHiring ? 'map-anchor--hiring' : '',
                  isArea ? 'map-anchor--area' : '',
                  anyActive ? 'map-anchor--active' : '',
                ].join(' ')}
              />
            );
          })}

          {!useCards && mobileMarkers.map(({ group, x, y }) => {
            const point = group[0].point;
            const active = group.some((item) => item.point.id === activeId);
            return (
              <button
                key={point.id}
                type="button"
                aria-label={group.map((item) => `${item.point.index}. ${item.point.title}`).join('; ')}
                onClick={(e) => { e.stopPropagation(); setSelectedId(point.id); }}
                style={{ left: `${x}px`, top: `${y}px` }}
                className={[
                  'pointer-events-auto map-anchor !h-[24px] !w-[24px] flex items-center justify-center text-[10px] font-bold tabular-nums',
                  group.some((item) => item.point.hiring) ? 'map-anchor--hiring text-white' : 'text-[#1257fd]',
                  group.every((item) => item.point.precision === 'area') ? 'map-anchor--area' : '',
                  active ? 'map-anchor--active' : '',
                ].join(' ')}
              >
                {point.index}{group.length > 1 ? '+' : ''}
              </button>
            );
          })}

        </div>

        {/* Layer 4: Organic Knowledge-Graph Event Cards (strictly chronological) */}
        {useCards && (
          <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
            {placedCards.map((c) => {
              const p = c.point;
              const isActive = activeId === p.id;
              const isDimmed = activeId != null && !isActive;
              return (
                <button
                  key={p.id}
                  type="button"
                  onMouseEnter={() => setHoveredId(p.id)}
                  onMouseLeave={() => setHoveredId((prev) => (prev === p.id ? null : prev))}
                  onFocus={() => setHoveredId(p.id)}
                  onBlur={() => setHoveredId((prev) => (prev === p.id ? null : prev))}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId((prev) => (prev === p.id ? null : p.id));
                  }}
                  style={{
                    left: `${c.cardX}px`,
                    top: `${c.cardY}px`,
                    width: `${c.cardW}px`,
                    minHeight: `${c.cardH}px`,
                  }}
                  className={[
                    'pointer-events-auto map-callout',
                    p.precision === 'area' ? 'map-callout--area' : 'map-callout--exact',
                    isActive ? 'map-callout--active' : '',
                    isDimmed ? 'map-callout--dimmed' : '',
                  ].join(' ')}
                >
                  <div className="flex w-full items-center gap-1">
                    <span className={`map-index ${p.hiring ? 'map-index--hiring' : ''}`}>
                      {p.index}
                    </span>
                    <span className={`map-date-pill ${p.hiring ? 'map-date-pill--hiring' : ''}`}>
                      {p.datePill}
                    </span>
                    {p.hiring && (
                      <span className="ml-auto shrink-0 text-[9.5px] font-semibold text-[var(--primary)]">
                        {copy.hiringBadge}
                      </span>
                    )}
                  </div>

                  <p className="w-full truncate text-[11px] font-semibold leading-tight text-[var(--foreground)]">
                    {p.title}
                  </p>

                  <p className="flex w-full items-center gap-1 truncate text-[10px] leading-none text-[#64748b]">
                    <PinIcon className="h-2.5 w-2.5 shrink-0 text-[#94a3b8]" />
                    <span className="truncate">{p.locationLabel}</span>
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {/* Top-left Game-style 3D Toggle + Reset + Expand Toolbar */}
        <div className="absolute left-[10px] top-[108px] z-30 flex flex-col gap-1.5">
          <button
            type="button"
            aria-pressed={is3D}
            onClick={handleToggle3D}
            className={`map-3d-btn ${is3D ? 'map-3d-btn--active' : ''}`}
            title={is3D ? copy.mode2D : copy.mode3D}
          >
            {is3D ? copy.mode3D : copy.mode2D}
          </button>
        </div>

        <div className="absolute left-[48px] top-[10px] z-30 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleResetView}
            className="inline-flex h-[30px] items-center rounded-md border border-[var(--border)] bg-white/95 px-2.5 text-[11px] font-medium text-[#334155] shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-[var(--foreground)]"
          >
            {copy.resetView}
          </button>
          {isDesktop && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex h-[30px] items-center rounded-md border border-[var(--border)] bg-white/95 px-2.5 text-[11px] font-medium text-[#334155] shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-[var(--foreground)]"
            >
              {expanded ? copy.collapse : copy.expand}
            </button>
          )}
        </div>

        {/* Bottom-right semantic Legend (desktop) */}
        {isDesktop && (
          <aside
            aria-label="Map legend"
            className="map-legend absolute bottom-3 right-3 z-30 px-3 py-2 text-[10.5px] leading-tight text-[#334155]"
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-5 shrink-0 rounded-[3px] border-[1.5px] border-solid border-[#71717a] bg-white" />
                <span>{copy.legendExact}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-5 shrink-0 rounded-[3px] border-[1.5px] border-dashed border-[#94a3b8] bg-white/80" />
                <span>{copy.legendArea}</span>
              </div>
              <div className="flex items-center gap-3 border-t border-[#e2e8f0] pt-1.5 text-[10px] text-[#475569]">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-[var(--primary)]" />
                  {copy.legendHiring}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full border-2 border-[var(--primary)] bg-white" />
                  {copy.legendEvent}
                </span>
              </div>
            </div>
          </aside>
        )}

        {/* Clicked Event Detail Popover */}
        {selectedPoint && (
          <div
            role="dialog"
            aria-label={selectedPoint.title}
            onClick={(e) => e.stopPropagation()}
            className="map-detail-card absolute left-1/2 top-4 z-40 w-[min(340px,calc(100%-24px))] -translate-x-1/2 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`map-index ${selectedPoint.hiring ? 'map-index--hiring' : ''}`}>
                  {selectedPoint.index}
                </span>
                <span className={`map-date-pill ${selectedPoint.hiring ? 'map-date-pill--hiring' : ''}`}>
                  {selectedPoint.datePill}
                </span>
                <span
                  className={[
                    'inline-flex h-[18px] items-center rounded-full px-2 text-[10px] font-medium',
                    selectedPoint.precision === 'area'
                      ? 'border border-dashed border-[#94a3b8] text-[#475569]'
                      : 'border border-solid border-[#d4d4d8] text-[#475569]',
                  ].join(' ')}
                >
                  {selectedPoint.precision === 'area' ? copy.legendArea : copy.legendExact}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label={copy.close}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              >
                ×
              </button>
            </div>

            <h3 className="mt-2 text-[14px] font-semibold leading-snug text-[var(--foreground)]">
              {selectedPoint.title}
            </h3>

            <div className="mt-2 space-y-1 text-[12.5px] text-muted">
              <p className="tabular-nums">{selectedPoint.when}</p>
              <p className="flex items-start gap-1.5">
                <PinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#64748b]" />
                <span>
                  {selectedPoint.locationLabel}
                  {selectedPoint.venue ? ` · ${selectedPoint.venue}` : ''}
                </span>
              </p>
              {selectedPoint.organiser && <p>{selectedPoint.organiser}</p>}
            </div>

            {selectedPoint.hiringText && (
              <p className="mt-2.5 rounded-md bg-[var(--primary-soft)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--primary)]">
                {selectedPoint.hiringText}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={selectedPoint.evaluateHref} className="btn btn-sm">
                {copy.evaluate}
              </Link>
              <a
                href={selectedPoint.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-sm flex-1"
              >
                {copy.register} ↗
              </a>
              {selectedPoint.hiringHref && (
                <Link href={selectedPoint.hiringHref} className="btn btn-sm">
                  {copy.viewRoles} →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile / narrow viewport: docked semantic legend + chronologically ordered cards */}
      {unplacedPoints.length > 0 && (
        <>
          {!isDesktop && <aside
            aria-label="Map legend"
            className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--border)] bg-white px-3.5 py-2.5 text-[11px] text-[#334155]"
          >
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 shrink-0 rounded-[3px] border-[1.5px] border-solid border-[#71717a] bg-white" />
              {copy.legendExact}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 shrink-0 rounded-[3px] border-[1.5px] border-dashed border-[#94a3b8] bg-white" />
              {copy.legendArea}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--primary)]" />
              {copy.legendHiring}
            </span>
          </aside>}
          {!useCards && <p className="border-t border-[var(--border)] bg-white px-4 py-2 text-xs text-slate-600">{copy.clusterHint}</p>}
          <div className={`grid gap-2 border-t border-[var(--border)] bg-[#fafafa] p-3 sm:grid-cols-2 ${expanded ? 'max-h-40 overflow-y-auto' : ''}`}>
            {unplacedPoints.map((p) => {
              const isSelected = selectedId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(p.id);
                    mapRef.current?.easeTo({ center: [p.lng, p.lat], zoom: 13.5, pitch: 45, duration: 450 });
                  }}
                  className={[
                    'flex flex-col gap-1 rounded-lg bg-white p-2.5 text-left transition-colors',
                    p.precision === 'area' ? 'border-[1.5px] border-dashed border-[#94a3b8]' : 'border-[1.5px] border-solid border-[#d4d4d8]',
                    isSelected ? '!border-[var(--primary)] ring-2 ring-[var(--primary-soft)]' : '',
                  ].join(' ')}
                >
                  <div className="flex w-full items-center gap-1.5">
                    <span className={`map-index ${p.hiring ? 'map-index--hiring' : ''}`}>{p.index}</span>
                    <span className={`map-date-pill ${p.hiring ? 'map-date-pill--hiring' : ''}`}>{p.datePill}</span>
                    {p.hiring && (
                      <span className="ml-auto text-[10px] font-semibold text-[var(--primary)]">{copy.hiringBadge}</span>
                    )}
                  </div>
                  <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-[var(--foreground)]">
                    {p.title}
                  </p>
                  <p className="flex items-center gap-1 text-[11px] text-[#64748b]">
                    <PinIcon className="h-3 w-3 shrink-0 text-[#94a3b8]" />
                    <span className="truncate">{p.locationLabel}</span>
                  </p>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      {expanded && (
        <div
          className="map-fullscreen-backdrop"
          onClick={() => setExpanded(false)}
          aria-hidden="true"
        />
      )}
      {mapContent}
    </>
  );
}
