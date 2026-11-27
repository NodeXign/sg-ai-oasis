import Link from 'next/link';
import type { Company, JobFunction, Lang } from '@/lib/types';
import { fmtDatePill, fmtDay, fmtTime, getDict } from '@/lib/i18n';
import { getUpcomingEvents, groupByDay } from '@/lib/events';
import { getJobsData, openRolesByCompany } from '@/lib/jobs';
import { resolveEventGeo } from '@/lib/sg-geo';
import SiteHeader from '@/components/SiteHeader';
import EventMap, { type MapPoint } from '@/components/EventMap';

export const revalidate = 1800;

const FN_ORDER: JobFunction[] = ['software', 'gtm', 'solutions', 'product', 'ai_ml', 'data', 'infra', 'strategy', 'design'];

function Bars({ rows }: { rows: { label: string; value: number; href?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const inner = (
          <>
            <span className="w-[42%] shrink-0 truncate text-[13px]">{r.label}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
              <span className="block h-full rounded-full bg-[var(--foreground)] opacity-80" style={{ width: `${(r.value / max) * 100}%` }} />
            </span>
            <span className="w-8 shrink-0 text-right text-[13px] tabular-nums text-muted">{r.value}</span>
          </>
        );
        return (
          <li key={r.label}>
            {r.href
              ? <Link href={r.href} className="-mx-1.5 flex items-center gap-3 rounded-md px-1.5 py-0.5 transition-colors hover:bg-[var(--muted)]">{inner}</Link>
              : <div className="flex items-center gap-3 py-0.5">{inner}</div>}
          </li>
        );
      })}
    </ul>
  );
}

export default async function HomePage({ params }: { params: { lang: Lang } }) {
  const lang = params.lang;
  const dict = getDict(lang);
  const t = dict.home;

  const events = await getUpcomingEvents(7);
  const { jobs, companies } = await getJobsData();
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
  const offMap = events.filter((e) => !e.isOnline).length - points.length;

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

  const dayRows = groupByDay(events).map(([day, list]) => ({ label: fmtDay(day, lang), value: list.length }));
  const fnCount: Record<string, number> = {};
  jobs.forEach((j) => { fnCount[j.category] = (fnCount[j.category] ?? 0) + 1; });
  const fnRows = FN_ORDER.filter((f) => fnCount[f]).sort((a, b) => fnCount[b] - fnCount[a])
    .map((f) => ({ label: dict.fn[f], value: fnCount[f], href: `/${lang}/jobs?fn=${f}` }));

  const linked = events.flatMap((e) => hiringOf(e.companyIds).map((id) => ({ event: e, company: companyById[id], roles: openRoles[id] })));
  const stats = [
    { value: events.length, label: t.statEvents },
    { value: jobs.length, label: t.statJobs },
    { value: Object.keys(openRoles).length, label: t.statCompanies },
  ];

  return (
    <>
      <SiteHeader lang={lang} active="home" />
      <main>
        {/* Hero */}
        <section className="container-page pb-12 pt-14 sm:pb-16 sm:pt-20">
          <p className="eyebrow">{t.eyebrow}</p>
          <h1 className="h-display mt-3 max-w-3xl">{t.title}</h1>
          <p className="mt-4 max-w-2xl text-base text-muted sm:text-[17px]">{t.lead}</p>
          <div className="mt-7 flex flex-wrap gap-2.5">
            <Link href={`/${lang}/events`} className="btn btn-primary btn-lg">{t.ctaEvents}</Link>
            <Link href={`/${lang}/jobs`} className="btn btn-lg">{t.ctaJobs}</Link>
          </div>
          <dl className="mt-10 grid max-w-2xl grid-cols-3 gap-4 border-t border-[var(--border)] pt-6">
            {stats.map((s) => (
              <div key={s.label}>
                <dd className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{s.value}</dd>
                <dt className="mt-1 text-[13px] leading-snug text-muted">{s.label}</dt>
              </div>
            ))}
          </dl>
        </section>

        {/* Featured Map (wide breakout container so Singapore island has generous breathing room) */}
        <section className="mx-auto w-full max-w-[1280px] px-4 sm:px-6">
          <div className="card flex flex-col overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-[var(--border)] px-4 py-3">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-semibold">{t.mapTitle}</h2>
                <span className="badge badge-primary tabular-nums">{t.mapCount(points.length)}</span>
              </div>
              <Link href={`/${lang}/events`} className="link text-[13px]">{t.allEvents} →</Link>
            </div>
            <EventMap points={points} copy={mapCopy} />
            {offMap > 0 && (
              <p className="border-t border-[var(--border)] px-4 py-2.5 text-xs text-muted">{t.noCoords(offMap)}</p>
            )}
          </div>
        </section>

        {/* Distributions below the map in a balanced 2-column row */}
        <section className="container-page mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{t.byDay}</h2>
                <Link href={`/${lang}/events`} className="link text-[13px]">{t.allEvents} →</Link>
              </div>
              {dayRows.length ? <Bars rows={dayRows} /> : <p className="text-[13px] text-muted">{dict.events.empty}</p>}
            </div>
            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{t.byFunction}</h2>
                <Link href={`/${lang}/jobs`} className="link text-[13px]">{t.allJobs} →</Link>
              </div>
              <Bars rows={fnRows} />
            </div>
          </div>
        </section>

        {/* The link between events and jobs */}
        <section className="container-page mt-20 sm:mt-24">
          <h2 className="h-section">{t.linkTitle}</h2>
          <p className="mt-2 max-w-2xl text-muted">{t.linkLead}</p>
          {linked.length === 0 ? (
            <p className="card mt-6 p-5 text-sm text-muted">{t.linkEmpty}</p>
          ) : (
            <ul className="mt-6 grid gap-3 md:grid-cols-2">
              {linked.map(({ event, company, roles }) => (
                <li key={`${event.id}-${company.id}`} className="card hover-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] text-muted">{fmtDay(event.startAt, lang)} · {fmtTime(event.startAt, lang)}</p>
                      <h3 className="mt-1 text-[15px] font-semibold leading-snug">{event.title}</h3>
                      <p className="mt-1 text-[13px] text-muted">{company.name} · {company.sector}</p>
                    </div>
                    <span className="badge badge-primary shrink-0">{t.openRoles(roles)}</span>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <a href={event.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm">{dict.events.register} ↗</a>
                    <Link href={`/${lang}/jobs?company=${company.id}`} className="btn btn-primary btn-sm">{t.openRoles(roles)} →</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Tech for Good */}
        <section className="mt-20 border-y border-[var(--border)] bg-[#fafafa] py-16 sm:mt-24 sm:py-20">
          <div className="container-page">
            <h2 className="h-section max-w-2xl">{t.goodTitle}</h2>
            <p className="mt-2 max-w-2xl text-muted">{t.goodLead}</p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {t.good.map((g) => (
                <li key={g.title} className="card p-4">
                  <h3 className="text-[15px] font-semibold">{g.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{g.body}</p>
                </li>
              ))}
            </ul>

            <h3 className="mt-12 text-sm font-semibold">{t.stepsTitle}</h3>
            <ol className="mt-4 grid gap-6 sm:grid-cols-3">
              {t.steps.map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-white text-xs font-medium tabular-nums">{i + 1}</span>
                  <div>
                    <p className="text-[15px] font-medium">{s.title}</p>
                    <p className="mt-0.5 text-[13px] text-muted">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>
    </>
  );
}
