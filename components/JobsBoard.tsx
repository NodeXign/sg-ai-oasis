'use client';

import { useMemo, useState } from 'react';
import type { Company, Job, JobCategory } from '@/lib/types';
import { CATEGORY_LABEL } from '@/lib/job-labels';

const CATEGORY_ORDER: JobCategory[] = ['product', 'solutions', 'strategy', 'data', 'engineering', 'gtm', 'other'];
const SENIORITY_LABEL: Record<string, string> = {
  intern: 'Intern', junior: 'Junior', mid: 'Mid', senior: 'Senior', lead: 'Lead / Staff+',
};
const PAGE_SIZE = 40;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function postedTime(job: Job) {
  return new Date(job.postedAt || `${job.firstSeen}T00:00:00+08:00`).getTime();
}
function shortDate(ms: number) {
  return new Date(ms).toLocaleDateString('en-SG', { month: 'short', day: 'numeric', timeZone: 'Asia/Singapore' });
}

export default function JobsBoard({
  jobs,
  companies,
  initialCompany,
}: {
  jobs: Job[];
  companies: Company[];
  initialCompany: string;
}) {
  const [category, setCategory] = useState<JobCategory | 'all'>('all');
  const [company, setCompany]   = useState(initialCompany);
  const [seniority, setSeniority] = useState('');
  const [aiOnly, setAiOnly]     = useState(!initialCompany);
  const [newOnly, setNewOnly]   = useState(false);
  const [query, setQuery]       = useState('');
  const [limit, setLimit]       = useState(PAGE_SIZE);

  const companyById = useMemo(() => Object.fromEntries(companies.map((c) => [c.id, c])), [companies]);
  const now = useMemo(() => Date.now(), []);

  // Everything except the category filter, so the chips can show live counts.
  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((j) => {
      if (company && j.companyId !== company) return false;
      if (seniority && j.seniority !== seniority) return false;
      if (aiOnly && !j.isAiRelated) return false;
      if (newOnly && now - postedTime(j) > WEEK_MS) return false;
      if (q) {
        const name = companyById[j.companyId]?.name ?? '';
        if (!`${j.title} ${name} ${j.department}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [jobs, company, seniority, aiOnly, newOnly, query, companyById, now]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    base.forEach((j) => { m[j.category] = (m[j.category] ?? 0) + 1; });
    return m;
  }, [base]);

  const shown = useMemo(
    () => base.filter((j) => category === 'all' || j.category === category)
              .sort((a, b) => postedTime(b) - postedTime(a)),
    [base, category],
  );

  const hiringCompanies = useMemo(() => {
    const m = new Map<string, number>();
    jobs.forEach((j) => m.set(j.companyId, (m.get(j.companyId) ?? 0) + 1));
    return companies.filter((c) => m.has(c.id)).map((c) => ({ ...c, open: m.get(c.id)! }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [jobs, companies]);

  const stats = [
    { label: '在招岗位', value: jobs.length },
    { label: '招聘公司', value: hiringCompanies.length },
    { label: 'AI 相关', value: jobs.filter((j) => j.isAiRelated).length },
    { label: '近 7 天发布', value: jobs.filter((j) => now - postedTime(j) <= WEEK_MS).length },
  ];

  const reset = (fn: () => void) => { fn(); setLimit(PAGE_SIZE); };
  const selectedCompany = company ? companyById[company] : undefined;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-2xl font-bold tracking-tight tabular-nums">{s.value}</p>
            <p className="text-xs text-[var(--muted)] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="job-chip" aria-pressed={category === 'all'}
                  onClick={() => reset(() => setCategory('all'))}>
            全部 <span className="job-chip-count">{base.length}</span>
          </button>
          {CATEGORY_ORDER.map((c) => (
            <button key={c} type="button" className="job-chip" aria-pressed={category === c}
                    onClick={() => reset(() => setCategory(c))}>
              {CATEGORY_LABEL[c]} <span className="job-chip-count">{counts[c] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search" value={query} placeholder="搜索岗位或公司"
            aria-label="搜索岗位或公司"
            onChange={(e) => reset(() => setQuery(e.target.value))}
            className="job-input flex-1 min-w-[180px]"
          />
          <select value={company} aria-label="公司" className="job-input"
                  onChange={(e) => reset(() => setCompany(e.target.value))}>
            <option value="">全部公司</option>
            {hiringCompanies.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.open})</option>
            ))}
          </select>
          <select value={seniority} aria-label="资历" className="job-input"
                  onChange={(e) => reset(() => setSeniority(e.target.value))}>
            <option value="">全部资历</option>
            {Object.entries(SENIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label className="job-toggle">
            <input type="checkbox" checked={aiOnly} onChange={(e) => reset(() => setAiOnly(e.target.checked))} />
            只看 AI 相关
          </label>
          <label className="job-toggle">
            <input type="checkbox" checked={newOnly} onChange={(e) => reset(() => setNewOnly(e.target.checked))} />
            近 7 天发布
          </label>
        </div>
        {selectedCompany && (
          <p className="text-xs text-[var(--ink-500)]">
            <span className="font-semibold text-[var(--ink-700)]">{selectedCompany.name}</span>
            {' · '}{selectedCompany.sector}{' · '}{selectedCompany.aiFocus}
          </p>
        )}
      </div>

      {/* Results */}
      {shown.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[var(--muted)]">
          没有符合条件的岗位。试试取消“只看 AI 相关”或换一个类别。
        </div>
      ) : (
        <ul className="space-y-2">
          {shown.slice(0, limit).map((j) => {
            const c = companyById[j.companyId];
            const posted = postedTime(j);
            const isNew = now - posted <= WEEK_MS;
            return (
              <li key={j.id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="text-[15px] font-semibold leading-snug">{j.title}</h3>
                    {isNew && <span className="badge badge-new">New</span>}
                  </div>
                  <p className="text-xs text-[var(--ink-500)] mt-1">
                    <span className="font-semibold text-[var(--ink-700)]">{c?.name ?? j.companyId}</span>
                    {c?.sector ? ` · ${c.sector}` : ''} · {j.location}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="badge badge-luma">{CATEGORY_LABEL[j.category]}</span>
                    <span className="badge badge-luma">{SENIORITY_LABEL[j.seniority]}</span>
                    {j.isAiRelated && <span className="badge badge-free">AI</span>}
                    <span className="badge badge-open" title="在公司官方招聘页确认在招">
                      官网已核实 · {j.lastVerified.slice(5)}
                    </span>
                    <span className="text-[11px] text-[var(--muted)]">发布 {shortDate(posted)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {j.linkedinSearchUrl && (
                    <a href={j.linkedinSearchUrl} target="_blank" rel="noopener noreferrer"
                       className="job-btn job-btn--ghost">LinkedIn 查看</a>
                  )}
                  <a href={j.applyUrl} target="_blank" rel="noopener noreferrer" className="job-btn">
                    官网投递
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {shown.length > limit && (
        <div className="text-center">
          <button type="button" className="job-btn job-btn--ghost" onClick={() => setLimit(limit + PAGE_SIZE)}>
            显示更多（还有 {shown.length - limit} 个）
          </button>
        </div>
      )}
    </div>
  );
}
