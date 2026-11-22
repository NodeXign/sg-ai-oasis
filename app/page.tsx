import { Suspense } from 'react';
import type { SgEvent, Organizer } from '@/lib/types';
import staticEventsRaw  from '@/data/events.json';
import staticOrgsRaw    from '@/data/organizers.json';
import EventCard        from '@/components/EventCard';
import StatsRow         from '@/components/StatsRow';
import DistributionPanel from '@/components/DistributionPanel';
import OrganizerCard    from '@/components/OrganizerCard';
import ViewSwitcher     from '@/components/ViewSwitcher';
import EventListView    from '@/components/EventListView';
import PlaybookSidebar   from '@/components/PlaybookSidebar';
import MapPanel          from '@/components/MapPanel';
import SiteHeader        from '@/components/SiteHeader';
import HiringStrip       from '@/components/HiringStrip';
import { getJobsData, hiringByOrganizer } from '@/lib/jobs';

const playbookEvents: SgEvent[] = [
  {
    id: 'ai-salon-singapore-2026-07-15',
    title: 'AI Salon Singapore (15 July 2026)',
    description: 'Founder and investor salon by StartupX, Lorong AI, BLOCK71 and AIMX.',
    oneLiner: 'High-signal founder and VC salon for reading where Singapore AI startups are heading.',
    targetAudience: 'Founders, product leaders, investors and operators tracking Singapore AI opportunities',
    findPartner: 'AI founders, early-stage investors, accelerator leads and startup operators',
    eventType: 'Founder / VC Salon',
    expectedTakeaway: 'A market read on what founders, VCs and operators are paying attention to now.',
    curatorTake: 'One of the strongest networking picks this window. Go with a clear question and follow-up list.',
    notIdealFor: 'people looking for hands-on technical instruction',
    opportunityPath: 'Event -> founder/investor conversations -> market thesis -> follow-up coffee.',
    startAt: '2026-07-15T18:00:00+08:00',
    venue: 'Queenstown, Singapore (address after registration)',
    venueLat: 1.2944,
    venueLng: 103.8056,
    mrtStations: [{ name: 'Queenstown', code: 'EW19', line: 'EW', lineColor: '#009645', lat: 1.2944, lng: 103.8056, walkMins: 8 }],
    platform: 'luma',
    sourceUrl: 'https://luma.com/AI-Salon-Singapore-July-2026',
    isFree: true,
    tags: ['Founders', 'VC', 'Startups', 'Networking'],
    levels: ['practitioner', 'builder'],
    score: 5,
    scoreNote: 'Top networking and market-signal event in this two-week window.',
    isCuratorPick: true,
    isNew: true,
    organizers: [],
    scrapedAt: '2026-07-11T10:24:00+08:00',
    createdAt: '2026-07-11T10:24:00+08:00',
  },
  {
    id: 'lorong-better-data-sea-language-2026-07-16',
    title: 'Better Data, Bolder AI - No SEA Language Left Behind',
    description: 'Session on Southeast Asian language data and better data foundations for regional AI products.',
    oneLiner: 'A strong local-context AI event on Southeast Asian language data and model inclusion.',
    targetAudience: 'Data practitioners, LLM builders, researchers and product people building for Southeast Asia',
    findPartner: 'NLP researchers, data builders and teams working on local-language AI',
    eventType: 'Technical / Research Talk',
    expectedTakeaway: 'Why local data quality matters if you want AI products that work in Southeast Asia.',
    curatorTake: 'Strong local moat signal. This is exactly the kind of event a Singapore AI navigator should surface.',
    notIdealFor: 'people looking for generic ChatGPT productivity tips',
    opportunityPath: 'Event -> local data problem -> product/research angle -> one reusable insight post.',
    startAt: '2026-07-16T18:30:00+08:00',
    venue: 'Lorong AI @ one-north',
    venueLat: 1.2998,
    venueLng: 103.7871,
    mrtStations: [{ name: 'one-north', code: 'CC23', line: 'CC', lineColor: '#FA9E0D', lat: 1.2998, lng: 103.7871, walkMins: 4 }],
    platform: 'luma',
    sourceUrl: 'https://lu.ma/lorongai',
    isFree: true,
    tags: ['SEA languages', 'Data', 'NLP', 'LLM'],
    levels: ['practitioner', 'builder'],
    score: 5,
    scoreNote: 'High local relevance and strong technical/product signal.',
    isCuratorPick: true,
    isNew: true,
    organizers: [],
    scrapedAt: '2026-07-11T10:24:00+08:00',
    createdAt: '2026-07-11T10:24:00+08:00',
  },
  {
    id: 'alibaba-qoder-hackathon-sg-2026',
    title: 'Alibaba Cloud x Qoder Hackathon Singapore 2026',
    description: 'Free AI hackathon with Alibaba Cloud, Qoder and SMU AI Club.',
    oneLiner: 'Free AI hackathon with a clear portfolio output path and USD 1500 prize pool.',
    targetAudience: 'Builders, product people, students and job seekers who want a concrete AI project artifact',
    findPartner: 'Hackathon teammates, student builders, cloud mentors and AI product collaborators',
    eventType: 'Hackathon',
    expectedTakeaway: 'A project brief, team signal and a portfolio-ready build direction.',
    curatorTake: 'Best career-output pick. Go if you want something concrete to show after the event.',
    notIdealFor: 'people who only want passive listening',
    opportunityPath: 'Event -> team/project -> demo -> GitHub or LinkedIn portfolio.',
    startAt: '2026-07-22T10:00:00+08:00',
    venue: 'Singapore (address after registration)',
    venueLat: 1.2966,
    venueLng: 103.85,
    mrtStations: [{ name: 'Bras Basah', code: 'CC2', line: 'CC', lineColor: '#FA9E0D', lat: 1.2964, lng: 103.8514, walkMins: 8 }],
    platform: 'luma',
    sourceUrl: 'https://luma.com/92h6pyl1',
    isFree: true,
    tags: ['Hackathon', 'Alibaba Cloud', 'Qoder', 'Portfolio'],
    levels: ['beginner', 'practitioner', 'builder'],
    score: 5,
    scoreNote: 'Best event for turning attendance into a visible project artifact.',
    isCuratorPick: true,
    isNew: true,
    organizers: [],
    scrapedAt: '2026-07-11T10:24:00+08:00',
    createdAt: '2026-07-11T10:24:00+08:00',
  },
  {
    id: 'lorong-redis-context-engine-2026-07-23',
    title: 'Building a Real-Time Context Engine w/ Redis',
    description: 'Technical session on using Redis and real-time data patterns to build context engines for AI systems.',
    oneLiner: 'Infrastructure session on real-time context engines for agent and retrieval-heavy AI apps.',
    targetAudience: 'Developers, AI infra builders and product engineers building agentic or context-aware systems',
    findPartner: 'Backend engineers, vector-search builders, AI infra founders and developer advocates',
    eventType: 'Technical Workshop',
    expectedTakeaway: 'How real-time context can support agents and retrieval-heavy AI apps.',
    curatorTake: 'Strong builder pick if you care about AI systems beyond prompt demos.',
    notIdealFor: 'non-technical attendees seeking general AI inspiration',
    opportunityPath: 'Event -> context-engine pattern -> small architecture sketch -> build demo.',
    startAt: '2026-07-23T14:30:00+08:00',
    venue: 'Lorong AI @ one-north',
    venueLat: 1.2998,
    venueLng: 103.7871,
    mrtStations: [{ name: 'one-north', code: 'CC23', line: 'CC', lineColor: '#FA9E0D', lat: 1.2998, lng: 103.7871, walkMins: 4 }],
    platform: 'luma',
    sourceUrl: 'https://lu.ma/lorongai',
    isFree: true,
    tags: ['Redis', 'Context engine', 'Agents', 'Real-time'],
    levels: ['builder'],
    score: 4,
    scoreNote: 'High implementation value for builders working on AI infrastructure.',
    isCuratorPick: false,
    isNew: true,
    organizers: [],
    scrapedAt: '2026-07-11T10:24:00+08:00',
    createdAt: '2026-07-11T10:24:00+08:00',
  },
];

// ─── Static JSON hydration ────────────────────────────────────
function loadStaticEvents(): SgEvent[] {
  const orgMap = Object.fromEntries(
    (staticOrgsRaw as any[]).map((o) => [o.id, o as Organizer]),
  );
  return (staticEventsRaw as any[]).map((e) => ({
    ...e,
    organizers: (e.organizers ?? []).map((id: string) => orgMap[id]).filter(Boolean),
  })) as SgEvent[];
}

// ─── Fetch events (Supabase if configured, else static) ───────
async function getEvents(): Promise<SgEvent[]> {
  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) return loadStaticEvents();
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseAnon);
    const { data, error } = await supabase
      .from('events_full').select('*')
      .gte('start_at', new Date().toISOString())
      .order('start_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row: any): SgEvent => ({
      id: row.id, title: row.title, description: row.description,
      oneLiner: row.one_liner, targetAudience: row.target_audience,
      findPartner: row.find_partner,
      startAt: row.start_at, endAt: row.end_at,
      venue: row.venue, venueLat: row.venue_lat, venueLng: row.venue_lng,
      mrtStations: row.mrt_stations ?? [],
      platform: row.platform, sourceUrl: row.source_url,
      isFree: row.is_free, price: row.price,
      coverImageUrl: row.cover_image_url, externalId: row.external_id,
      attendeeCount: row.attendee_count, status: row.status,
      tags: row.tags ?? [], levels: row.levels ?? [],
      score: row.score, scoreNote: row.score_note,
      isCuratorPick: row.is_curator_pick, isNew: row.is_new,
      organizers: row.organizers ?? [],
      scrapedAt: row.scraped_at, createdAt: row.created_at,
    }));
  } catch { return loadStaticEvents(); }
}

// ─── Filter to SG AI Oasis window (today → +14 days) ──────────
function filterOasisWindow(events: SgEvent[]): SgEvent[] {
  const now    = new Date();
  const cutoff = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  return events.filter((e) => {
    const d = new Date(e.startAt);
    return d >= now && d <= cutoff;
  });
}

// ─── Group events by day label ─────────────────────────────────
function groupByDay(events: SgEvent[]) {
  const groups = new Map<string, SgEvent[]>();
  events.forEach((e) => {
    const label = new Date(e.startAt).toLocaleDateString('en-SG', {
      weekday: 'long', month: 'short', day: 'numeric', timeZone: 'Asia/Singapore',
    });
    const arr = groups.get(label) ?? [];
    arr.push(e);
    groups.set(label, arr);
  });
  return groups;
}

// ─── Deduplicate organizers ───────────────────────────────────
function getUniqueOrganizers(events: SgEvent[]) {
  const map = new Map<string, { org: Organizer; count: number }>();
  events.forEach((e) => {
    (e.organizers ?? []).forEach((o: Organizer) => {
      const ex = map.get(o.id);
      if (ex) ex.count++;
      else map.set(o.id, { org: o, count: 1 });
    });
  });
  return Array.from(map.values()).sort((a, b) => b.org.score - a.org.score);
}

// ─── Page ─────────────────────────────────────────────────────
export default async function WeekPage({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
  const view       = searchParams.view || 'map';
  const allEvents  = [...playbookEvents, ...(await getEvents())];
  const events     = filterOasisWindow(allEvents);
  const byDay      = groupByDay(events);
  const organizers = getUniqueOrganizers(events);
  const jobsData   = await getJobsData();
  const hiring     = hiringByOrganizer(jobsData);
  const lastScan   = allEvents[0]?.scrapedAt
    ? new Date(allEvents[0].scrapedAt).toLocaleString('en-SG', {
        timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short',
      })
    : '—';

  return (
    <div className="min-h-dvh bg-[var(--bg)]">

      <SiteHeader active="week" note={`Last scan: ${lastScan}`} />

      {/* ── Main ─────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">

        {/* Title + view switcher */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              SG AI Oasis Playbook v2.0
            </h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              未来 14 天 · {events.length} 场活动 · 地图优先 · 主理人判断 + 职业信号
            </p>
          </div>
          <Suspense fallback={<div className="h-9 w-56 rounded-xl bg-[var(--ink-100)] animate-pulse" />}>
            <ViewSwitcher />
          </Suspense>
        </div>

        <HiringStrip jobs={jobsData.jobs} companies={jobsData.companies} />

        {/* ── Cards view ──────────────────────────────────────── */}
        {view === 'cards' && (
          <>
            <StatsRow events={events} />
            <DistributionPanel events={events} />
            <section className="space-y-8">
              <p className="section-label">未来 14 天活动</p>
              {Array.from(byDay.entries()).map(([day, dayEvents]) => (
                <div key={day} className="space-y-4">
                  <h2 className="text-base font-semibold text-[var(--ink-700)] flex items-center gap-2">
                    {day}
                    <span className="px-2 py-0.5 rounded-full bg-[var(--ink-100)] text-[var(--muted)] text-xs font-normal">
                      {dayEvents.length}
                    </span>
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {dayEvents.map((event) => <EventCard key={event.id} event={event} hiring={hiring} />)}
                  </div>
                </div>
              ))}
            </section>
            <section className="space-y-4">
              <p className="section-label">主办方</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {organizers.map(({ org, count }) => (
                  <OrganizerCard key={org.id} organizer={org} eventCount={count} />
                ))}
              </div>
            </section>
          </>
        )}

        {/* ── List view (完全版) ──────────────────────────────── */}
        {view === 'list' && (
          <section>
            <p className="section-label mb-4">完全版 · 全部详情</p>
            <EventListView events={events} />
          </section>
        )}

        {/* ── Map view (地图版) ───────────────────────────────── */}
        {view === 'map' && (
          <>
            <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)] gap-5 items-start">
              <MapPanel events={events} />
              <PlaybookSidebar events={events} />
            </section>
            <StatsRow events={events} />
            <section className="space-y-4">
              <p className="section-label">活动判断卡 · What / Where / Who / Takeaway</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {events.map((event) => <EventCard key={event.id} event={event} hiring={hiring} />)}
              </div>
            </section>
          </>
        )}
      </main>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border)] mt-16 py-6 text-center text-xs text-[var(--muted)]">
        SG AI Oasis · 岗位每日核对 via GitHub Actions ·{' '}
        <a href="https://github.com/Gukki2021/sg-ai-oasis" target="_blank" rel="noopener noreferrer"
           className="text-[var(--violet-500)] hover:underline">View on GitHub</a>
      </footer>
    </div>
  );
}
