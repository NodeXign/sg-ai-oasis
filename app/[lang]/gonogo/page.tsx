import type { Company, Lang } from '@/lib/types';
import { fmtDay, fmtMapDate, fmtTime, getDict } from '@/lib/i18n';
import { getUpcomingEvents } from '@/lib/events';
import { getJobsData, openRolesByCompany } from '@/lib/jobs';
import { getNearestMrt } from '@/lib/mrt-stations';
import SiteHeader from '@/components/SiteHeader';
import GoNoGoStudio, { type StudioEventItem } from '@/components/GoNoGoStudio';

export const dynamic = 'force-dynamic';

export default async function GoNoGoPage({
  params,
  searchParams,
}: {
  params: { lang: Lang };
  searchParams: { event?: string };
}) {
  const lang = params.lang;
  const dict = getDict(lang);

  const events = await getUpcomingEvents(7);
  const { jobs, companies } = await getJobsData();
  const openRoles = openRolesByCompany(jobs);
  const companyById: Record<string, Company> = Object.fromEntries(companies.map((c) => [c.id, c]));

  const items: StudioEventItem[] = events.map((e) => {
    const hiring = e.companyIds.filter((id) => openRoles[id] && companyById[id]);
    const mrt = e.lat != null && e.lng != null ? getNearestMrt(e.lat, e.lng, 1)[0] : undefined;
    const nearMrt = mrt && mrt.walkMins <= 15 ? { name: mrt.name, walkMins: Math.max(mrt.walkMins, 1) } : undefined;
    const time = e.endAt
      ? `${fmtTime(e.startAt, lang)} – ${fmtTime(e.endAt, lang)}`
      : fmtTime(e.startAt, lang);
    const place = e.isOnline ? dict.events.online : e.venue || dict.events.addressHidden;

    return {
      shortDate: fmtMapDate(e.startAt, lang),
      dayHeading: fmtDay(e.startAt, lang),
      event: {
        id: e.id,
        title: e.title,
        startAt: e.startAt,
        endAt: e.endAt,
        whenLabel: `${fmtDay(e.startAt, lang)} · ${time}`,
        venue: place,
        isOnline: e.isOnline,
        mrtName: nearMrt?.name,
        mrtWalkMins: nearMrt?.walkMins,
        organiser: e.organiser,
        tags: e.tags,
        isFree: e.isFree,
        price: e.price,
        status: e.status,
        url: e.url,
        hiringCompanies: hiring.map((id) => ({
          id,
          name: companyById[id].name,
          sector: companyById[id].sector,
          aiFocus: companyById[id].aiFocus,
          openRoles: openRoles[id],
        })),
      },
    };
  });

  return (
    <>
      <SiteHeader lang={lang} active="gonogo" />
      <main className="container-page py-6 sm:py-8">
        <GoNoGoStudio items={items} lang={lang} initialEventId={searchParams.event} />
      </main>
    </>
  );
}
