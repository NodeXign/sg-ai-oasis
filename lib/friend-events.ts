import fs from 'node:fs/promises';
import path from 'node:path';
import type { FriendEvent } from './types';
import { resolveEventGeo } from './sg-geo';

const FRIEND_EVENTS_PATH = path.join(process.cwd(), 'data', 'friend_events.json');

export interface FriendEventInput {
  id?: string;
  title: string;
  startAt: string;
  endAt?: string | null;
  venue?: string;
  address?: string;
  lat?: number | null;
  lng?: number | null;
  url?: string;
  coverImageUrl?: string | null;
  organiser?: string;
  isFree?: boolean | null;
  price?: string | null;
  status?: 'open' | 'approval' | 'waitlist' | 'sold_out';
  isOnline?: boolean;
  tags?: string[];
  companyIds?: string[];
  friendNote?: string;
  publishToSite?: boolean;
}

export function isReadOnlyFsError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  return code === 'EROFS' || code === 'EACCES' || code === 'EPERM';
}

export async function readFriendEvents(): Promise<FriendEvent[]> {
  try {
    const raw = await fs.readFile(FRIEND_EVENTS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is FriendEvent => Boolean(item && typeof item.id === 'string' && typeof item.title === 'string'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return [];
    console.error('[friend-events] Failed to read data/friend_events.json', err);
    return [];
  }
}

export async function writeFriendEvents(events: FriendEvent[]): Promise<void> {
  const sorted = [...events].sort((a, b) => a.startAt.localeCompare(b.startAt));
  await fs.writeFile(FRIEND_EVENTS_PATH, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
}

export function normalizeFriendEvent(input: FriendEventInput, existing?: FriendEvent): FriendEvent {
  const title = (input.title ?? '').trim();
  if (!title) {
    throw new Error('Event title is required.');
  }

  const startDate = new Date(input.startAt);
  if (Number.isNaN(startDate.getTime())) {
    throw new Error('Valid startAt ISO timestamp is required.');
  }

  let endAt: string | null = null;
  if (input.endAt) {
    const endDate = new Date(input.endAt);
    if (!Number.isNaN(endDate.getTime()) && endDate.getTime() > startDate.getTime()) {
      endAt = endDate.toISOString();
    }
  }

  const nowIso = new Date().toISOString();
  const todaySg = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
  const isOnline = Boolean(input.isOnline);
  const venue = (input.venue ?? '').trim();
  const address = (input.address ?? '').trim();

  let lat = typeof input.lat === 'number' && Number.isFinite(input.lat) ? input.lat : null;
  let lng = typeof input.lng === 'number' && Number.isFinite(input.lng) ? input.lng : null;

  const base: FriendEvent = {
    id: existing?.id ?? (input.id?.trim() || `friend-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`),
    title,
    startAt: startDate.toISOString(),
    endAt,
    venue: isOnline ? (venue || 'Online') : venue,
    address: isOnline ? '' : address,
    lat: isOnline ? null : lat,
    lng: isOnline ? null : lng,
    url: (input.url ?? '').trim(),
    coverImageUrl: input.coverImageUrl?.trim() || null,
    organiser: (input.organiser ?? '').trim() || 'Friend Community',
    isFree: input.isFree === undefined ? true : input.isFree,
    price: input.isFree === false ? (input.price?.trim() || null) : null,
    status: input.status && ['open', 'approval', 'waitlist', 'sold_out'].includes(input.status) ? input.status : 'open',
    isOnline,
    tags: Array.isArray(input.tags)
      ? input.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 12)
      : [],
    sourceIds: ['friend-import'],
    companyIds: Array.isArray(input.companyIds)
      ? input.companyIds.map((c) => String(c).trim()).filter(Boolean)
      : [],
    firstSeen: existing?.firstSeen ?? todaySg,
    isFriendEvent: true,
    friendNote: (input.friendNote ?? '').trim() || undefined,
    publishToSite: input.publishToSite ?? existing?.publishToSite ?? false,
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };

  // Auto-resolve coordinates from known SG venues/areas if none provided
  if (!base.isOnline && base.lat == null && base.lng == null) {
    const geo = resolveEventGeo(base);
    if (geo && geo.precision === 'exact') {
      base.lat = geo.lat;
      base.lng = geo.lng;
    }
  }

  return base;
}
