import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import JobsBoard  from '@/components/JobsBoard';
import { getJobsData } from '@/lib/jobs';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Singapore AI Jobs — SG AI Oasis',
  description: 'Open roles in Singapore at AI and tech companies, checked daily against each company’s own careers page.',
};

function formatRun(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00+08:00` : iso);
  return d.toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore', dateStyle: 'medium', ...(iso.length === 10 ? {} : { timeStyle: 'short' }),
  });
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: { company?: string };
}) {
  const data = await getJobsData();
  const lastRun = formatRun(data.lastRun);

  return (
    <div className="min-h-dvh bg-[var(--bg)]">
      <SiteHeader active="jobs" note={`Last verified: ${lastRun}`} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">新加坡 AI 在招岗位</h1>
          <p className="text-sm text-[var(--muted)] mt-1 max-w-2xl">
            每个岗位都来自公司自己的招聘页，每天核对一次；连续两天找不到就下架。最近核对：{lastRun}
          </p>
        </div>
        <JobsBoard
          jobs={data.jobs}
          companies={data.companies}
          initialCompany={searchParams.company ?? ''}
        />
      </main>
      <footer className="border-t border-[var(--border)] mt-16 py-6 text-center text-xs text-[var(--muted)]">
        SG AI Oasis · 岗位数据每日核对 ·{' '}
        <a href="https://github.com/Gukki2021/sg-ai-oasis" target="_blank" rel="noopener noreferrer"
           className="text-[var(--violet-500)] hover:underline">View on GitHub</a>
      </footer>
    </div>
  );
}
