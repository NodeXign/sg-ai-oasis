import Link from 'next/link';
import type { Company, Lang, SgEvent } from '@/lib/types';
import { fmtTime, getDict } from '@/lib/i18n';
import { getNearestMrt } from '@/lib/mrt-stations';

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
  const hiring = event.companyIds.filter((id) => openRoles[id] && companies[id]);
  const time = event.endAt
    ? `${fmtTime(event.startAt, lang)} – ${fmtTime(event.endAt, lang)}`
    : fmtTime(event.startAt, lang);
  const place = event.isOnline ? t.online : event.venue || t.addressHidden;

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
        {mrt && mrt.walkMins <= 15 && <p>{t.walk(mrt.name, Math.max(mrt.walkMins, 1))}</p>}
        {event.organiser && <p>{t.by} {event.organiser}</p>}
      </div>

      {hiring.map((id) => (
        <Link key={id} href={`/${lang}/jobs?company=${id}`}
              className="flex items-center justify-between gap-2 rounded-md bg-[var(--primary-soft)] px-2.5 py-2 text-[13px] font-medium text-[var(--primary)] transition-colors hover:bg-[#e0e9ff]">
          <span>{t.hiring(companies[id].name, openRoles[id])}</span>
          <span aria-hidden>→</span>
        </Link>
      ))}

      <div className="mt-auto pt-1">
        <a href={event.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm w-full">
          {t.register} <span aria-hidden>↗</span>
        </a>
      </div>
    </article>
  );
}
