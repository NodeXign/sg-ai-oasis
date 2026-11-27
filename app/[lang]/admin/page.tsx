import type { Company, Lang } from '@/lib/types';
import { getAdminEventsData } from '@/lib/events';
import { getJobsData, openRolesByCompany } from '@/lib/jobs';
import { toXhsEventItem } from '@/lib/xhs-life-cards';
import SiteHeader from '@/components/SiteHeader';
import XhsAdminStudio from '@/components/XhsAdminStudio';

export const dynamic = 'force-dynamic';

function sgtTodayYmd(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
}

function addDaysYmd(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T12:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
}

export default async function AdminPage({ params }: { params: { lang: Lang } }) {
  const lang = params.lang;
  const [{ syncedEvents, friendEvents }, { jobs, companies }] = await Promise.all([
    getAdminEventsData(),
    getJobsData(),
  ]);

  const openRoles = openRolesByCompany(jobs);
  const companyById: Record<string, Company> = Object.fromEntries(companies.map((c) => [c.id, c]));

  const enrichedSynced = syncedEvents.map((e) => toXhsEventItem(e, companyById, openRoles));
  const enrichedFriends = friendEvents.map((e) => toXhsEventItem(e, companyById, openRoles));

  const today = sgtTodayYmd();
  const end = addDaysYmd(today, 6);

  return (
    <>
      <SiteHeader lang={lang} active="admin" />
      <main className="mx-auto w-full max-w-[1360px] px-4 py-6 sm:px-6 sm:py-8">
        <XhsAdminStudio
          lang={lang}
          syncedEvents={enrichedSynced}
          initialFriendEvents={enrichedFriends}
          defaultStartDate={today}
          defaultEndDate={end}
        />
      </main>
    </>
  );
}
