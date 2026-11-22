-- Migration 004: align `events` with the daily open-source sync (scripts/events_sync.py).
-- Run after 003. Safe to run more than once.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS address     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS organiser   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_online   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reg_status  TEXT NOT NULL DEFAULT 'open'
    CHECK (reg_status IN ('open','approval','waitlist','sold_out')),
  ADD COLUMN IF NOT EXISTS source_ids  TEXT[] NOT NULL DEFAULT '{}',   -- ids from data/sources.json
  ADD COLUMN IF NOT EXISTS first_seen  DATE;

-- Synced events do not always carry these, so they can no longer be required.
ALTER TABLE events ALTER COLUMN platform DROP NOT NULL;
ALTER TABLE events ALTER COLUMN is_free  DROP NOT NULL;

-- Events with the companies linked to them, in the shape the site reads.
CREATE OR REPLACE VIEW events_open AS
SELECT
  e.id, e.title, e.start_at, e.end_at, e.venue, e.address,
  e.venue_lat, e.venue_lng, e.source_url, e.cover_image_url, e.organiser,
  e.is_free, e.price, e.reg_status, e.is_online, e.tags, e.source_ids, e.first_seen,
  COALESCE(
    (SELECT array_agg(ec.company_id) FROM event_companies ec WHERE ec.event_id = e.id),
    '{}'::text[]
  ) AS company_ids
FROM events e
WHERE e.source_ids <> '{}';

GRANT SELECT ON events_open TO anon, authenticated;
