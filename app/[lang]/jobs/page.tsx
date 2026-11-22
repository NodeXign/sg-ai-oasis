import type { JobFunction, Lang } from '@/lib/types';
import { fmtStamp, getDict } from '@/lib/i18n';
import { getJobsData } from '@/lib/jobs';
import SiteHeader from '@/components/SiteHeader';
import JobsExplorer from '@/components/JobsExplorer';

// Reads the query string and a rolling date window, so render per request.
export const dynamic = 'force-dynamic';

export default async function JobsPage({
  params,
  searchParams,
}: {
  params: { lang: Lang };
  searchParams: { company?: string; fn?: string };
}) {
  const lang = params.lang;
  const dict = getDict(lang);
  const t = dict.jobs;
  const data = await getJobsData();
  const fn = searchParams.fn && searchParams.fn in dict.fn ? (searchParams.fn as JobFunction) : '';
  const company = data.companies.some((c) => c.id === searchParams.company) ? searchParams.company! : '';

  return (
    <>
      <SiteHeader lang={lang} active="jobs" />
      <main className="container-page pt-12 sm:pt-16">
        <h1 className="h-display !text-[30px] sm:!text-[36px]">{t.title}</h1>
        <p className="mt-2 max-w-2xl text-muted">{t.lead}</p>
        <p className="mb-10 mt-1 text-[13px] text-muted">{t.updated}: {fmtStamp(data.lastRun, lang)}</p>
        <JobsExplorer lang={lang} jobs={data.jobs} companies={data.companies} initialCompany={company} initialFn={fn} />
      </main>
    </>
  );
}
