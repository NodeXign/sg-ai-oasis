import type { Company, Job } from '@/lib/types';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Home-page summary of the jobs data: who is hiring in Singapore right now.
export default function HiringStrip({ jobs, companies }: { jobs: Job[]; companies: Company[] }) {
  if (!jobs.length) return null;

  const counts = new Map<string, number>();
  jobs.forEach((j) => counts.set(j.companyId, (counts.get(j.companyId) ?? 0) + 1));
  const top = companies
    .filter((c) => counts.has(c.id))
    .map((c) => ({ ...c, open: counts.get(c.id)! }))
    .sort((a, b) => b.open - a.open)
    .slice(0, 8);

  const now = Date.now();
  const fresh = jobs.filter((j) => j.postedAt && now - new Date(j.postedAt).getTime() <= WEEK_MS).length;

  return (
    <section className="card p-5 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-label">Who&apos;s hiring · 新加坡</p>
          <p className="text-lg font-bold tracking-tight mt-1">
            {counts.size} 家公司 · {jobs.length} 个官网已核实岗位
            {fresh > 0 && <span className="text-[var(--muted)] font-medium"> · 近 7 天新增 {fresh}</span>}
          </p>
        </div>
        <a href="/jobs" className="job-btn">查看全部岗位</a>
      </div>
      <div className="flex flex-wrap gap-2">
        {top.map((c) => (
          <a key={c.id} href={`/jobs?company=${c.id}`} className="job-chip">
            {c.name} <span className="job-chip-count">{c.open}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
