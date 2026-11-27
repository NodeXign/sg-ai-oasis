import Link from 'next/link';
import type { Company, Lang, SgEvent } from '@/lib/types';
import { fmtDay, fmtTime, getDict } from '@/lib/i18n';
import { getNearestMrt } from '@/lib/mrt-stations';
import type { EventEvalContext } from '@/lib/go-decision';
import EventCardActions from './EventCardActions';

export default function EventCard({
  event,
  lang,
  companies,
  openRoles,
}: {
  event: SgEvent;
  lang: Lang;
  companies: Record<string, Company>;
  openRoles: Record<string, number>;
}) {
  const t = getDict(lang).events;
  const mrt = event.lat != null && event.lng != null ? getNearestMrt(event.lat, event.lng, 1)[0] : undefined;
  const nearMrt = mrt && mrt.walkMins <= 15 ? { name: mrt.name, walkMins: Math.max(mrt.walkMins, 1) } : undefined;
  const hiring = event.companyIds.filter((id) => openRoles[id] && companies[id]);
  const time = event.endAt
    ? `${fmtTime(event.startAt, lang)} – ${fmtTime(event.endAt, lang)}`
    : fmtTime(event.startAt, lang);
  const place = event.isOnline ? t.online : event.venue || t.addressHidden;

  const evalContext: EventEvalContext = {
    id: event.id,
    title: event.title,
    startAt: event.startAt,
    endAt: event.endAt,
    whenLabel: `${fmtDay(event.startAt, lang)} · ${time}`,
    venue: place,
    isOnline: event.isOnline,
    mrtName: nearMrt?.name,
    mrtWalkMins: nearMrt?.walkMins,
    organiser: event.organiser,
    tags: event.tags,
    isFree: event.isFree,
    price: event.price,
    status: event.status,
    url: event.url,
    hiringCompanies: hiring.map((id) => ({
      id,
      name: companies[id].name,
      sector: companies[id].sector,
      aiFocus: companies[id].aiFocus,
      openRoles: openRoles[id],
    })),
  };

  return (
    <article className="card hover-card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <span className="font-medium tabular-nums">{time}</span>
        <span className="flex items-center gap-1.5">
          {event.isFree != null && (
            <span className="badge">{event.isFree ? t.free : event.price ?? t.paid}</span>
          )}
          <span className={`badge ${event.status === 'sold_out' ? 'badge-muted' : ''}`}>{t.status[event.status]}</span>
        </span>
      </div>

      <h3 className="text-[15px] font-semibold leading-snug">{event.title}</h3>

      <div className="space-y-0.5 text-[13px] text-muted">
        <p>{place}</p>
        {nearMrt && <p>{t.walk(nearMrt.name, nearMrt.walkMins)}</p>}
        {event.organiser && <p>{t.by} {event.organiser}</p>}
      </div>

      {hiring.map((id) => (
        <Link key={id} href={`/${lang}/jobs?company=${id}`}
              className="flex items-center justify-between gap-2 rounded-md bg-[var(--primary-soft)] px-2.5 py-2 text-[13px] font-medium text-[var(--primary)] transition-colors hover:bg-[#e0e9ff]">
          <span>{t.hiring(companies[id].name, openRoles[id])}</span>
          <span aria-hidden>→</span>
        </Link>
      ))}

      <EventCardActions event={evalContext} lang={lang} registerLabel={t.register} />
    </article>
  );
}
