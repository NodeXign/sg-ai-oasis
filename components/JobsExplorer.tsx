'use client';

import { useMemo, useRef, useState } from 'react';
import type { Company, Job, JobFunction, Lang } from '@/lib/types';
import { fmtShort, getDict } from '@/lib/i18n';

const FN_ORDER: JobFunction[] = [
  'product', 'ai_ml', 'data', 'software', 'infra', 'solutions', 'strategy', 'design', 'gtm', 'corporate', 'other',
];
const PAGE = 50;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const postedTime = (j: Job) => new Date(j.postedAt || `${j.firstSeen}T00:00:00+08:00`).getTime();

// ─── Graph 1: function → role titles (three-level tree) ───────
const G = { width: 1040, row: 46, top: 24, rootX: 18, fnX: 232, leafX: 452, chipH: 26, chipGap: 8 };
const chipWidth = (label: string, count: number) => Math.round(label.length * 6.7 + String(count).length * 7 + 30);

function FunctionGraph({
  rows, total, rootLabel, fnLabel, fn, family, onPick,
}: {
  rows: { fn: JobFunction; count: number; leaves: { name: string; count: number }[] }[];
  total: number;
  rootLabel: string;
  fnLabel: Record<JobFunction, string>;
  fn: JobFunction | '';
  family: string;
  onPick: (fn: JobFunction, family?: string) => void;
}) {
  const height = G.top * 2 + rows.length * G.row;
  const rootY = height / 2;
  const maxCount = Math.max(1, ...rows.map((r) => r.count));
  const act = (e: React.KeyboardEvent, run: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run(); }
  };

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${G.width} ${height}`} width={G.width} height={height} className="block" role="group" aria-label={rootLabel}>
        {/* links */}
        {rows.map((r, i) => {
          const y = G.top + i * G.row + G.row / 2;
          const on = fn === r.fn;
          return (
            <path key={r.fn}
              d={`M ${G.rootX + 120} ${rootY} C ${G.fnX - 60} ${rootY}, ${G.fnX - 70} ${y}, ${G.fnX - 8} ${y}`}
              fill="none" stroke={on ? '#1257fd' : '#e5e5e5'} strokeWidth={on ? 1.75 : 1.25} />
          );
        })}

        {/* root */}
        <g>
          <rect x={G.rootX} y={rootY - 22} width={120} height={44} rx={8} fill="#0a0a0a" />
          <text x={G.rootX + 60} y={rootY - 3} textAnchor="middle" fill="#fff" fontSize="16" fontWeight="600">{total}</text>
          <text x={G.rootX + 60} y={rootY + 13} textAnchor="middle" fill="#d4d4d4" fontSize="11">{rootLabel}</text>
        </g>

        {rows.map((r, i) => {
          const y = G.top + i * G.row + G.row / 2;
          const on = fn === r.fn;
          const radius = 5 + 7 * Math.sqrt(r.count / maxCount);
          let x = G.leafX;
          const chips = r.leaves.flatMap((leaf) => {
            const w = chipWidth(leaf.name, leaf.count);
            if (x + w > G.width - 8) return [];
            const item = { ...leaf, x, w };
            x += w + G.chipGap;
            return [item];
          });
          const lineEnd = chips.length ? chips[chips.length - 1].x : G.leafX;

          return (
            <g key={r.fn}>
              <line x1={G.fnX + 14} y1={y} x2={lineEnd} y2={y} stroke={on ? '#b9cdfe' : '#ededed'} strokeWidth="1.25" />
              <g className="graph-node" role="button" tabIndex={0} aria-pressed={on && !family}
                 onClick={() => onPick(r.fn)} onKeyDown={(e) => act(e, () => onPick(r.fn))}>
                <rect x={G.fnX - 16} y={y - 17} width={G.leafX - G.fnX - 6} height={34} rx={8} fill="#fff" stroke="transparent" />
                <circle cx={G.fnX} cy={y} r={radius} fill={on ? '#1257fd' : '#0a0a0a'} />
                <text x={G.fnX + 20} y={y + 4.5} fontSize="13.5" fontWeight="600" fill={on ? '#1257fd' : '#0a0a0a'}>
                  {fnLabel[r.fn]}
                  <tspan dx="7" fontWeight="400" fill="#8a8a8a" fontSize="12">{r.count}</tspan>
                </text>
              </g>
              {chips.map((c) => {
                const picked = on && family === c.name;
                return (
                  <g key={c.name} className="graph-node" role="button" tabIndex={0} aria-pressed={picked}
                     onClick={() => onPick(r.fn, c.name)} onKeyDown={(e) => act(e, () => onPick(r.fn, c.name))}>
                    <rect x={c.x} y={y - G.chipH / 2} width={c.w} height={G.chipH} rx={6}
                          fill={picked ? '#1257fd' : '#fff'} stroke={picked ? '#1257fd' : '#e0e0e0'} />
                    <text x={c.x + 10} y={y + 4} fontSize="12" fill={picked ? '#fff' : '#262626'}>
                      {c.name}
                      <tspan dx="6" fill={picked ? '#dbe6ff' : '#8a8a8a'}>{c.count}</tspan>
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Graph 2: companies as a word cloud, grouped by sector ────
function CompanyCloud({
  groups, max, company, onPick,
}: {
  groups: { sector: string; items: { id: string; name: string; count: number }[] }[];
  max: number;
  company: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="divide-y divide-[var(--border)]">
      {groups.map((g) => (
        <div key={g.sector} className="grid gap-x-6 gap-y-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[150px_1fr] sm:items-baseline">
          <p className="text-xs font-medium text-muted">{g.sector}</p>
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            {g.items.map((c) => {
              const on = company === c.id;
              return (
                <button key={c.id} type="button" aria-pressed={on} onClick={() => onPick(c.id)}
                        className="rounded-md px-1 leading-tight tracking-tight transition-colors hover:text-[var(--primary)]"
                        style={{
                          fontSize: `${Math.round(14 + 24 * Math.sqrt(c.count / max))}px`,
                          fontWeight: 600,
                          color: on ? 'var(--primary)' : undefined,
                        }}>
                  {c.name}
                  <sup className="ml-1 text-[11px] font-normal tabular-nums text-muted">{c.count}</sup>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Page body ────────────────────────────────────────────────
export default function JobsExplorer({
  lang, jobs, companies, initialCompany, initialFn,
}: {
  lang: Lang;
  jobs: Job[];
  companies: Company[];
  initialCompany: string;
  initialFn: JobFunction | '';
}) {
  const dict = getDict(lang);
  const t = dict.jobs;
  const [fn, setFn] = useState<JobFunction | ''>(initialFn);
  const [family, setFamily] = useState('');
  const [company, setCompany] = useState(initialCompany);
  const [aiOnly, setAiOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const tableRef = useRef<HTMLDivElement>(null);

  const companyById = useMemo(() => Object.fromEntries(companies.map((c) => [c.id, c])), [companies]);
  const now = useMemo(() => Date.now(), []);
  const pool = useMemo(() => (aiOnly ? jobs.filter((j) => j.isAiRelated) : jobs), [jobs, aiOnly]);

  const fnRows = useMemo(() => {
    const byFn = new Map<JobFunction, Map<string, number>>();
    pool.forEach((j) => {
      const m = byFn.get(j.category) ?? new Map<string, number>();
      m.set(j.roleFamily, (m.get(j.roleFamily) ?? 0) + 1);
      byFn.set(j.category, m);
    });
    return FN_ORDER.filter((f) => byFn.has(f)).map((f) => {
      const m = byFn.get(f)!;
      const leaves = Array.from(m.entries()).map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 6);
      return { fn: f, count: Array.from(m.values()).reduce((a, b) => a + b, 0), leaves };
    });
  }, [pool]);

  const cloud = useMemo(() => {
    const counts = new Map<string, number>();
    pool.forEach((j) => counts.set(j.companyId, (counts.get(j.companyId) ?? 0) + 1));
    const bySector = new Map<string, { id: string; name: string; count: number }[]>();
    companies.forEach((c) => {
      const count = counts.get(c.id);
      if (!count) return;
      bySector.set(c.sector, [...(bySector.get(c.sector) ?? []), { id: c.id, name: c.name, count }]);
    });
    const groups = Array.from(bySector.entries())
      .map(([sector, items]) => ({ sector, items: items.sort((a, b) => b.count - a.count) }))
      .sort((a, b) => b.items.reduce((s, i) => s + i.count, 0) - a.items.reduce((s, i) => s + i.count, 0));
    return { groups, max: Math.max(1, ...Array.from(counts.values())), companies: counts.size };
  }, [pool, companies]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pool
      .filter((j) => (!fn || j.category === fn) && (!family || j.roleFamily === family) && (!company || j.companyId === company))
      .filter((j) => !q || `${j.title} ${companyById[j.companyId]?.name ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => postedTime(b) - postedTime(a));
  }, [pool, fn, family, company, query, companyById]);

  const showTable = () => {
    setLimit(PAGE);
    requestAnimationFrame(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const pickFn = (f: JobFunction, fam?: string) => {
    const same = fn === f && family === (fam ?? '');
    setFn(same ? '' : f);
    setFamily(same ? '' : fam ?? '');
    if (!same) showTable();
  };
  const pickCompany = (id: string) => {
    setCompany(company === id ? '' : id);
    if (company !== id) showTable();
  };
  const clear = () => { setFn(''); setFamily(''); setCompany(''); setQuery(''); setLimit(PAGE); };
  const hasFilter = Boolean(fn || family || company || query);

  const stats = [
    { label: t.stats.roles, value: jobs.length },
    { label: t.stats.companies, value: new Set(jobs.map((j) => j.companyId)).size },
    { label: t.stats.ai, value: jobs.filter((j) => j.isAiRelated).length },
    { label: t.stats.fresh, value: jobs.filter((j) => now - postedTime(j) <= WEEK_MS).length },
  ];

  return (
    <div className="space-y-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <dl className="grid grid-cols-2 gap-x-10 gap-y-4 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label}>
              <dd className="text-2xl font-semibold tracking-tight tabular-nums">{s.value}</dd>
              <dt className="text-[13px] text-muted">{s.label}</dt>
            </div>
          ))}
        </dl>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={aiOnly} onChange={(e) => { setAiOnly(e.target.checked); setLimit(PAGE); }}
                 className="h-4 w-4 accent-[var(--primary)]" />
          {t.aiOnly}
        </label>
      </div>

      <section>
        <h2 className="h-section">{t.byFunctionTitle}</h2>
        <p className="mt-1.5 max-w-2xl text-sm text-muted">{t.byFunctionLead}</p>
        <div className="card mt-5 p-3 sm:p-4">
          <FunctionGraph rows={fnRows} total={pool.length} rootLabel={t.root} fnLabel={dict.fn}
                         fn={fn} family={family} onPick={pickFn} />
        </div>
      </section>

      <section>
        <h2 className="h-section">{t.byCompanyTitle}</h2>
        <p className="mt-1.5 max-w-2xl text-sm text-muted">{t.byCompanyLead}</p>
        <div className="card mt-5 p-4 sm:p-5">
          <CompanyCloud groups={cloud.groups} max={cloud.max} company={company} onPick={pickCompany} />
        </div>
      </section>

      <section ref={tableRef} className="scroll-mt-20">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="h-section">{t.tableTitle}</h2>
            <p className="mt-1.5 text-sm text-muted">{t.results(rows.length)}</p>
          </div>
          <input type="search" value={query} placeholder={t.search} aria-label={t.search}
                 onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
                 className="input sm:w-72" />
        </div>

        {hasFilter && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {fn && (
              <button type="button" className="badge badge-primary gap-1" onClick={() => { setFn(''); setFamily(''); }}>
                {dict.fn[fn]}{family ? ` · ${family}` : ''} <span aria-hidden>×</span>
              </button>
            )}
            {company && (
              <button type="button" className="badge badge-primary gap-1" onClick={() => setCompany('')}>
                {companyById[company]?.name ?? company} <span aria-hidden>×</span>
              </button>
            )}
            <button type="button" className="text-[13px] text-muted underline-offset-2 hover:underline" onClick={clear}>
              {t.clear}
            </button>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="card mt-5 p-6 text-sm text-muted">{t.empty}</p>
        ) : (
          <div className="card mt-5 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[13px] text-muted">
                  <th className="px-4 py-2.5 font-medium">{t.col.role}</th>
                  <th className="px-3 py-2.5 font-medium">{t.col.company}</th>
                  <th className="hidden px-3 py-2.5 font-medium lg:table-cell">{t.col.fn}</th>
                  <th className="hidden px-3 py-2.5 font-medium lg:table-cell">{t.col.level}</th>
                  <th className="px-3 py-2.5 font-medium">{t.col.posted}</th>
                  <th className="hidden px-3 py-2.5 font-medium md:table-cell">{t.col.verified}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t.col.apply}</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((j) => (
                  <tr key={j.id} className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[#fafafa]">
                    <td className="px-4 py-3">
                      <span className="font-medium leading-snug">{j.title}</span>
                      {j.isAiRelated && <span className="badge badge-primary ml-2 align-middle">AI</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">{companyById[j.companyId]?.name ?? j.companyId}</td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-muted lg:table-cell">{dict.fn[j.category]}</td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-muted lg:table-cell">{dict.level[j.seniority]}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums text-muted">{fmtShort(new Date(postedTime(j)).toISOString(), lang)}</td>
                    <td className="hidden whitespace-nowrap px-3 py-3 tabular-nums text-muted md:table-cell">{fmtShort(j.lastVerified, lang)}</td>
                    <td className="px-4 py-3 text-right">
                      <a href={j.applyUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
                        {t.apply} <span aria-hidden>↗</span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > limit && (
          <div className="mt-4 text-center">
            <button type="button" className="btn" onClick={() => setLimit(limit + PAGE)}>{t.more(rows.length - limit)}</button>
          </div>
        )}
        <p className="mt-5 max-w-2xl text-[13px] text-muted">{t.verifiedNote}</p>
      </section>
    </div>
  );
}
