import type { Company, Job } from './types';
import staticCompanies from '@/data/companies.json';
import staticJobs      from '@/data/jobs.json';
import staticMeta      from '@/data/jobs_meta.json';

export interface JobsData {
  companies: Company[];
  jobs: Job[];            // open roles only
  lastRun: string | null; // ISO timestamp or date of the last sync
  source: 'supabase' | 'static';
}

const pickCompany = (c: any): Company => ({
  id: c.id, name: c.name, sector: c.sector, aiFocus: c.aiFocus ?? c.ai_focus ?? '',
  website: c.website, careersUrl: c.careersUrl ?? c.careers_url,
});

function loadStatic(): JobsData {
  return {
    companies: (staticCompanies as any[]).map(pickCompany),
    jobs: (staticJobs as any[]).filter((j) => j.status === 'open').map((j): Job => ({
      id: j.id, companyId: j.companyId, title: j.title, roleFamily: j.roleFamily,
      location: j.location, applyUrl: j.applyUrl, linkedinSearchUrl: j.linkedinSearchUrl,
      postedAt: j.postedAt, category: j.category, seniority: j.seniority,
      isAiRelated: j.isAiRelated, status: j.status, firstSeen: j.firstSeen, lastVerified: j.lastVerified,
    })),
    lastRun: (staticMeta as { lastRun?: string }).lastRun ?? null,
    source: 'static',
  };
}

// Supabase when configured, otherwise the JSON files the daily sync commits.
export async function getJobsData(): Promise<JobsData> {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return loadStatic();

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(url, anon);
    const [companiesRes, jobsRes] = await Promise.all([
      supabase.from('companies').select('*').eq('active', true),
      supabase.from('jobs').select('*').eq('status', 'open').range(0, 4999),
    ]);
    if (companiesRes.error) throw companiesRes.error;
    if (jobsRes.error) throw jobsRes.error;
    if (!jobsRes.data?.length) return loadStatic();   // tables exist but not synced yet

    const jobs: Job[] = jobsRes.data.map((r: any) => ({
      id: r.id, companyId: r.company_id, title: r.title, roleFamily: r.role_family,
      location: r.location, applyUrl: r.apply_url, linkedinSearchUrl: r.linkedin_search_url,
      postedAt: r.posted_at, category: r.category, seniority: r.seniority,
      isAiRelated: r.is_ai_related, status: r.status,
      firstSeen: r.first_seen, lastVerified: r.last_verified,
    }));
    const lastRun = jobs.reduce((max, j) => (j.lastVerified > max ? j.lastVerified : max), '');
    return { companies: (companiesRes.data ?? []).map(pickCompany), jobs, lastRun: lastRun || null, source: 'supabase' };
  } catch (err) {
    console.error('[jobs] Supabase read failed, using static data', err);
    return loadStatic();
  }
}

// company id -> number of open Singapore roles
export function openRolesByCompany(jobs: Job[]): Record<string, number> {
  const out: Record<string, number> = {};
  jobs.forEach((j) => { out[j.companyId] = (out[j.companyId] ?? 0) + 1; });
  return out;
}
