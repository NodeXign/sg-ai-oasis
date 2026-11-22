import type { Company, Job } from './types';
import staticCompanies from '@/data/companies.json';
import staticJobs      from '@/data/jobs.json';
import staticMeta      from '@/data/jobs_meta.json';

export interface JobsData {
  companies: Company[];
  jobs: Job[];            // open roles only
  lastRun: string | null; // ISO timestamp of the last sync
  source: 'supabase' | 'static';
}

function loadStatic(): JobsData {
  return {
    companies: staticCompanies as Company[],
    jobs: (staticJobs as Job[]).filter((j) => j.status === 'open'),
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
      id: r.id, companyId: r.company_id, title: r.title, location: r.location,
      department: r.department, applyUrl: r.apply_url, linkedinSearchUrl: r.linkedin_search_url,
      postedAt: r.posted_at, category: r.category, seniority: r.seniority,
      isAiRelated: r.is_ai_related, verification: r.verification, status: r.status,
      firstSeen: r.first_seen, lastVerified: r.last_verified,
    }));
    const companies: Company[] = (companiesRes.data ?? []).map((r: any) => ({
      id: r.id, name: r.name, sector: r.sector, aiFocus: r.ai_focus,
      website: r.website, careersUrl: r.careers_url, organizerIds: r.organizer_ids ?? [],
    }));
    const lastRun = jobs.reduce((max, j) => (j.lastVerified > max ? j.lastVerified : max), '');
    return { companies, jobs, lastRun: lastRun || null, source: 'supabase' };
  } catch (err) {
    console.error('[jobs] Supabase read failed, using static data', err);
    return loadStatic();
  }
}

export interface HiringLink { companyId: string; companyName: string; openRoles: number }

// organizer id -> the company behind it and how many Singapore roles it has open.
export function hiringByOrganizer(data: JobsData): Record<string, HiringLink> {
  const counts = new Map<string, number>();
  data.jobs.forEach((j) => counts.set(j.companyId, (counts.get(j.companyId) ?? 0) + 1));
  const out: Record<string, HiringLink> = {};
  data.companies.forEach((c) => {
    const openRoles = counts.get(c.id) ?? 0;
    if (!openRoles) return;
    (c.organizerIds ?? []).forEach((orgId) => {
      out[orgId] = { companyId: c.id, companyName: c.name, openRoles };
    });
  });
  return out;
}
