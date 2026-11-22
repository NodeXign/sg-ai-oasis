import Link from 'next/link';
import type { Company, Lang } from '@/lib/types';
import { fmtDay, fmtStamp, getDict } from '@/lib/i18n';
import { eventSources, eventsLastRun, getUpcomingEvents, groupByDay } from '@/lib/events';
import { getJobsData, openRolesByCompany } from '@/lib/jobs';
import SiteHeader from '@/components/SiteHeader';
import EventCard from '@/components/EventCard';

// Reads the query string and a rolling date window, so render per request.
export const dynamic = 'force-dynamic';

export default async function EventsPage({
  params,
  searchParams,
}: {
  params: { lang: Lang };
  searchParams: { range?: string };
}) {
  const lang = params.lang;
  const t = getDict(lang).events;
  const isMonth = searchParams.range === 'month';

  const all = await getUpcomingEvents(45);
  const horizon = Date.now() + (isMonth ? 30 : 7) * 24 * 60 * 60 * 1000;
  const events = all.filter((e) => new Date(e.startAt).getTime() <= horizon);
    const { jobs, companies } = await getJobsData();
  const openRoles = openRolesByCompany(jobs);
  const companyById: Record<string, Company> = Object.fromEntries(companies.map((c) => [c.id, c]));
  const days = groupByDay(events);

  return (
    <>
      <SiteHeader lang={lang} active="events" />
      <main className="container-page pt-12 sm:pt-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="h-display !text-[30px] sm:!text-[36px]">{t.title}</h1>
            <p className="mt-2 max-w-2xl text-muted">{t.lead}</p>
          </div>
          <nav className="tabs" aria-label={t.title}>
            <Link href={`/${lang}/events`} className="tab" aria-current={!isMonth ? 'page' : undefined}>{t.week}</Link>
            <Link href={`/${lang}/events?range=month`} className="tab" aria-current={isMonth ? 'page' : undefined}>{t.month}</Link>
          </nav>
        </div>

        {days.length === 0 ? (
          <p className="card mt-10 p-6 text-sm text-muted">{t.empty}</p>
        ) : (
          <div className="mt-10 space-y-10">
            {days.map(([day, list]) => (
              <section key={day}>
                <h2 className="flex items-baseline gap-2 border-b border-[var(--border)] pb-2 text-[15px] font-semibold">
                  {fmtDay(day, lang)}
                  <span className="text-[13px] font-normal text-muted">{t.count(list.length)}</span>
                </h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((e) => (
                    <EventCard key={e.id} event={e} lang={lang} companies={companyById} openRoles={openRoles} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Sources */}
        <section className="mt-20 sm:mt-24">
          <h2 className="h-section">{t.sourcesTitle}</h2>
          <p className="mt-2 max-w-2xl text-muted">{t.sourcesLead}</p>
          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {eventSources.map((s) => (
              <li key={s.id} className="card p-4">
                <div className="flex items-center justify-between gap-3">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[15px] font-semibold hover:underline">
                    {s.name} <span aria-hidden className="text-muted">↗</span>
                  </a>
                  <span className="badge">{t.sourceCount(all.filter((e) => e.sourceIds.includes(s.id)).length)}</span>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{lang === 'zh' ? s.descZh : s.descEn}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[13px] text-muted">{t.sourceMissing}</p>
          <p className="mt-1 text-[13px] text-muted">{t.updated}: {fmtStamp(eventsLastRun, lang)}</p>
        </section>
      </main>
    </>
  );
}
