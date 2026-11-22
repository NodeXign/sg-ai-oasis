import type { EventSource, SgEvent } from './types';
import staticEvents  from '@/data/events.json';
import staticSources from '@/data/sources.json';
import staticMeta    from '@/data/events_meta.json';

const DAY_MS = 24 * 60 * 60 * 1000;

export const eventSources = staticSources as EventSource[];
export const eventsLastRun = (staticMeta as { lastRun?: string }).lastRun ?? null;

// Supabase when configured (view `events_open`, migration 004), otherwise the JSON file.
async function loadEvents(): Promise<SgEvent[]> {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return staticEvents as SgEvent[];
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const { data, error } = await createClient(url, anon)
      .from('events_open').select('*')
      .gte('start_at', new Date(Date.now() - DAY_MS).toISOString());
    if (error) throw error;
    if (!data?.length) return staticEvents as SgEvent[];   // view exists but not synced yet
    return data.map((r: any): SgEvent => ({
      id: r.id, title: r.title, startAt: r.start_at, endAt: r.end_at,
      venue: r.venue ?? '', address: r.address ?? '', lat: r.venue_lat, lng: r.venue_lng,
      url: r.source_url, coverImageUrl: r.cover_image_url, organiser: r.organiser ?? '',
      isFree: r.is_free, price: r.price, status: r.reg_status, isOnline: r.is_online,
      tags: r.tags ?? [], sourceIds: r.source_ids ?? [], companyIds: r.company_ids ?? [],
      firstSeen: r.first_seen ?? '',
    }));
  } catch (err) {
    console.error('[events] Supabase read failed, using static data', err);
    return staticEvents as SgEvent[];
  }
}

// Upcoming events inside the next `days` days. An event that started in the
// last three hours still counts, so tonight's meetup stays visible.
export async function getUpcomingEvents(days: number): Promise<SgEvent[]> {
  const now = Date.now();
  return (await loadEvents())
    .filter((e) => {
      const t = new Date(e.startAt).getTime();
      return t >= now - 3 * 60 * 60 * 1000 && t <= now + days * DAY_MS;
    })
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

// Singapore calendar day, e.g. "2026-11-26"
export function sgDayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
}

export function groupByDay(events: SgEvent[]): [string, SgEvent[]][] {
  const map = new Map<string, SgEvent[]>();
  events.forEach((e) => {
    const key = sgDayKey(e.startAt);
    map.set(key, [...(map.get(key) ?? []), e]);
  });
  return Array.from(map.entries());
}
