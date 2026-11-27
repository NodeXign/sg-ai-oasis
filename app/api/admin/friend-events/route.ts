import { NextResponse } from 'next/server';
import {
  isReadOnlyFsError,
  normalizeFriendEvent,
  readFriendEvents,
  writeFriendEvents,
  type FriendEventInput,
} from '@/lib/friend-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function checkAdminAuth(req: Request): NextResponse | null {
  const required = process.env.ADMIN_PASSWORD?.trim();
  if (!required) return null;
  const provided = req.headers.get('x-admin-token')?.trim() ?? '';
  if (provided !== required) {
    return NextResponse.json({ ok: false, error: 'Unauthorized: invalid admin passcode.' }, { status: 401 });
  }
  return null;
}

export async function GET() {
  const events = await readFriendEvents();
  return NextResponse.json({
    ok: true,
    events,
    authRequired: Boolean(process.env.ADMIN_PASSWORD?.trim()),
  });
}

export async function POST(req: Request) {
  const denied = checkAdminAuth(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const existing = await readFriendEvents();

    // Support bulk JSON import ({ events: [...] }) or single event creation
    if (Array.isArray(body?.events)) {
      const mergedMap = new Map(existing.map((e) => [e.id, e]));
      const imported = [];
      for (const raw of body.events as FriendEventInput[]) {
        const normalized = normalizeFriendEvent(raw, raw.id ? mergedMap.get(raw.id) : undefined);
        mergedMap.set(normalized.id, normalized);
        imported.push(normalized);
      }
      const nextList = Array.from(mergedMap.values()).sort((a, b) => a.startAt.localeCompare(b.startAt));
      try {
        await writeFriendEvents(nextList);
        return NextResponse.json({ ok: true, storageMode: 'file', importedCount: imported.length, events: nextList });
      } catch (err) {
        if (isReadOnlyFsError(err)) {
          return NextResponse.json({ ok: true, storageMode: 'readonly', importedCount: imported.length, events: nextList });
        }
        throw err;
      }
    }

    const created = normalizeFriendEvent(body as FriendEventInput);
    const nextList = [...existing.filter((e) => e.id !== created.id), created].sort((a, b) =>
      a.startAt.localeCompare(b.startAt),
    );
    try {
      await writeFriendEvents(nextList);
      return NextResponse.json({ ok: true, storageMode: 'file', event: created, events: nextList });
    } catch (err) {
      if (isReadOnlyFsError(err)) {
        return NextResponse.json({ ok: true, storageMode: 'readonly', event: created, events: nextList });
      }
      throw err;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create friend event.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  const denied = checkAdminAuth(req);
  if (denied) return denied;

  try {
    const body = (await req.json()) as FriendEventInput;
    if (!body?.id) {
      return NextResponse.json({ ok: false, error: 'Event id is required.' }, { status: 400 });
    }
    const existing = await readFriendEvents();
    const prev = existing.find((e) => e.id === body.id);
    const updated = normalizeFriendEvent(body, prev);
    const nextList = [...existing.filter((e) => e.id !== updated.id), updated].sort((a, b) =>
      a.startAt.localeCompare(b.startAt),
    );
    try {
      await writeFriendEvents(nextList);
      return NextResponse.json({ ok: true, storageMode: 'file', event: updated, events: nextList });
    } catch (err) {
      if (isReadOnlyFsError(err)) {
        return NextResponse.json({ ok: true, storageMode: 'readonly', event: updated, events: nextList });
      }
      throw err;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update friend event.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const denied = checkAdminAuth(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id')?.trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Query parameter id is required.' }, { status: 400 });
  }

  const existing = await readFriendEvents();
  const nextList = existing.filter((e) => e.id !== id);
  try {
    await writeFriendEvents(nextList);
    return NextResponse.json({ ok: true, storageMode: 'file', events: nextList });
  } catch (err) {
    if (isReadOnlyFsError(err)) {
      return NextResponse.json({ ok: true, storageMode: 'readonly', events: nextList });
    }
    const message = err instanceof Error ? err.message : 'Failed to delete friend event.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
