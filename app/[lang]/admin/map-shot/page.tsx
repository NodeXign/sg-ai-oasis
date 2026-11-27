import type { Company, Lang } from '@/lib/types';
import { fmtDatePill, fmtDay, fmtTime, getDict } from '@/lib/i18n';
import { getAdminEventsData, sgDayKey } from '@/lib/events';
import { getJobsData, openRolesByCompany } from '@/lib/jobs';
import { resolveEventGeo } from '@/lib/sg-geo';
import EventMap, { type MapPoint } from '@/components/EventMap';

export const dynamic = 'force-dynamic';

export default async function AdminMapShotPage({
  params,
  searchParams,
}: {
  params: { lang: Lang };
  searchParams: { start?: string; end?: string; ids?: string };
}) {
  const lang = params.lang;
  const dict = getDict(lang);
  const t = dict.home;

  const [{ syncedEvents, friendEvents }, { jobs, companies }] = await Promise.all([
    getAdminEventsData(),
    getJobsData(),
  ]);

  const map = new Map([...syncedEvents, ...friendEvents].map((e) => [e.id, e]));
  let events = Array.from(map.values()).sort((a, b) => a.startAt.localeCompare(b.startAt));

  if (searchParams.ids) {
    const idSet = new Set(searchParams.ids.split(',').map((s) => s.trim()).filter(Boolean));
    events = events.filter((e) => idSet.has(e.id));
  } else if (searchParams.start || searchParams.end) {
    events = events.filter((e) => {
      const d = sgDayKey(e.startAt);
      if (searchParams.start && d < searchParams.start) return false;
      if (searchParams.end && d > searchParams.end) return false;
      return true;
    });
  }

  const openRoles = openRolesByCompany(jobs);
  const companyById: Record<string, Company> = Object.fromEntries(companies.map((c) => [c.id, c]));
  const hiringOf = (ids: string[]) => ids.filter((id) => openRoles[id] && companyById[id]);

  const points: MapPoint[] = [];
  events.forEach((e) => {
    const geo = resolveEventGeo(e);
    if (!geo) return;
    const h = hiringOf(e.companyIds);
    const locationLabel =
      geo.precision === 'area' && geo.areaLabel
        ? t.mrtArea(geo.areaLabel)
        : geo.mrtName && geo.mrtWalkMins != null
          ? t.mrtShort(geo.mrtName, geo.mrtWalkMins)
          : e.venue || geo.areaLabel || '';

    points.push({
      id: e.id,
      index: points.length + 1,
      lat: geo.lat,
      lng: geo.lng,
      title: e.title,
      datePill: fmtDatePill(e.startAt, lang),
      when: e.endAt
        ? `${fmtDay(e.startAt, lang)} · ${fmtTime(e.startAt, lang)} – ${fmtTime(e.endAt, lang)}`
        : `${fmtDay(e.startAt, lang)} · ${fmtTime(e.startAt, lang)}`,
      venue: e.venue,
      address: e.address,
      locationLabel,
      precision: geo.precision,
      url: e.url,
      organiser: e.organiser || undefined,
      hiring: h.length > 0,
      hiringText: h.length ? dict.events.hiring(companyById[h[0]].name, openRoles[h[0]]) : undefined,
      hiringHref: h.length ? `/${lang}/jobs?company=${h[0]}` : undefined,
      evaluateHref: `/${lang}/gonogo?event=${encodeURIComponent(e.id)}`,
    });
  });

  const mapCopy = {
    register: dict.events.register,
    resetView: t.mapReset,
    expand: t.mapExpand,
    collapse: t.mapCollapse,
    mode3D: t.map3D,
    mode2D: t.map2D,
    clusterHint: t.mapClusterHint,
    legendExact: t.legendExact,
    legendArea: t.legendArea,
    legendHiring: t.legendHiring,
    legendEvent: t.legendEvent,
    hiringBadge: t.hiringBadge,
    viewRoles: t.viewRoles,
    evaluate: dict.gonogo.evaluateBtn,
    close: t.close,
  };

  return (
    <div id="map-shot-root" className="min-h-screen bg-white p-0">
      <style>{`
        .maplibregl-ctrl-top-left,
        .maplibregl-ctrl-top-right { display: none !important; }
        .map-stage { height: 630px !important; min-height: 630px !important; }
      `}</style>
      <EventMap points={points} copy={mapCopy} hideControls />
    </div>
  );
}
