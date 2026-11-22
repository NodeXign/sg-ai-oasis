import type { EventSource, SgEvent } from './types';
import staticEvents  from '@/data/events.json';
import staticSources from '@/data/sources.json';
import staticMeta    from '@/data/events_meta.json';

const DAY_MS = 24 * 60 * 60 * 1000;

export const eventSources = staticSources as EventSource[];
export const eventsLastRun = (staticMeta as { lastRun?: string }).lastRun ?? null;

// Upcoming events inside the next `days` days. An event that started in the
// last three hours still counts, so tonight's meetup stays visible.
export function getUpcomingEvents(days: number): SgEvent[] {
  const now = Date.now();
  return (staticEvents as SgEvent[])
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
