-- Migration 003: Companies + Jobs (Events × Companies × Jobs)
-- Run in the Supabase SQL editor after 001 and 002.
-- Written by scripts/jobs_sync.py (service role). Public access is read-only.

-- ─── Companies: the persistent watchlist ────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id             TEXT PRIMARY KEY,                -- e.g. "databricks"
  name           TEXT NOT NULL,
  sector         TEXT NOT NULL DEFAULT '',
  ai_focus       TEXT NOT NULL DEFAULT '',
  website        TEXT,
  careers_url    TEXT,                            -- official careers board
  linkedin_url   TEXT,
  ats            TEXT,                            -- greenhouse | lever | ashby
  ats_token      TEXT,
  organizer_ids  TEXT[] NOT NULL DEFAULT '{}',    -- links to organizers.id
  seed_source    TEXT,
  conferences    TEXT[] NOT NULL DEFAULT '{}',    -- conferences where the company was seen
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Jobs: verified against the company's own careers board ─
CREATE TABLE IF NOT EXISTS jobs (
  id                   TEXT PRIMARY KEY,          -- "<company_id>-<board job id>"
  company_id           TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title                TEXT NOT NULL,
  location             TEXT NOT NULL DEFAULT '',
  department           TEXT NOT NULL DEFAULT '',
  apply_url            TEXT NOT NULL,
  source_url           TEXT NOT NULL,
  linkedin_search_url  TEXT,
  posted_at            TIMESTAMPTZ,
  category             TEXT NOT NULL DEFAULT 'other'
                         CHECK (category IN ('product','design','ai_ml','data','software','infra','solutions','strategy','gtm','corporate','other')),
  role_family          TEXT NOT NULL DEFAULT '',            -- normalised title, e.g. "Product Manager"
  seniority            TEXT NOT NULL DEFAULT 'mid'
                         CHECK (seniority IN ('intern','junior','mid','senior','lead')),
  is_ai_related        BOOLEAN NOT NULL DEFAULT FALSE,
  verification         TEXT NOT NULL DEFAULT 'official'
                         CHECK (verification IN ('dual','official','pending','unknown')),
  status               TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  first_seen           DATE NOT NULL,
  last_verified        DATE NOT NULL,
  miss_count           SMALLINT NOT NULL DEFAULT 0,
  closed_at            DATE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS jobs_company_idx  ON jobs (company_id);
CREATE INDEX IF NOT EXISTS jobs_open_idx     ON jobs (category, first_seen DESC) WHERE status = 'open';

-- ─── Event ↔ Company junction (speakers, sponsors, hosts) ───
CREATE TABLE IF NOT EXISTS event_companies (
  event_id    TEXT REFERENCES events(id)    ON DELETE CASCADE,
  company_id  TEXT REFERENCES companies(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'host',       -- host | speaker | sponsor
  PRIMARY KEY (event_id, company_id)
);

-- ─── Triggers ────────────────────────────────────────────────
DROP TRIGGER IF EXISTS companies_updated_at ON companies;
CREATE TRIGGER companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS jobs_updated_at ON jobs;
CREATE TRIGGER jobs_updated_at BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Row Level Security: public read, writes via service role only ──
ALTER TABLE companies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read companies" ON companies;
CREATE POLICY "Public read companies" ON companies FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Public read jobs" ON jobs;
CREATE POLICY "Public read jobs" ON jobs FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Public read event_companies" ON event_companies;
CREATE POLICY "Public read event_companies" ON event_companies FOR SELECT USING (TRUE);

-- ─── The one join the product is built on ────────────────────
-- Companies that are hiring in Singapore AND appear at an upcoming event.
CREATE OR REPLACE VIEW hiring_and_showing_up AS
SELECT
  c.id   AS company_id,
  c.name AS company_name,
  COUNT(DISTINCT j.id) AS open_roles,
  COUNT(DISTINCT e.id) AS upcoming_events,
  MIN(e.start_at)      AS next_event_at
FROM companies c
JOIN jobs j   ON j.company_id = c.id AND j.status = 'open'
JOIN (
  SELECT ec.company_id, ec.event_id FROM event_companies ec
  UNION
  SELECT c2.id, eo.event_id
    FROM companies c2
    JOIN event_organizers eo ON eo.organizer_id = ANY (c2.organizer_ids)
) link        ON link.company_id = c.id
JOIN events e ON e.id = link.event_id AND e.start_at >= NOW()
GROUP BY c.id, c.name;

GRANT SELECT ON companies, jobs, event_companies, hiring_and_showing_up TO anon, authenticated;
