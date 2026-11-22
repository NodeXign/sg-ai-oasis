# SG AI Oasis

Singapore AI opportunity map: AI events and open roles, linked. Meet the team at an event, then apply on their own careers page.

Two language versions: `/zh` and `/en`.

| Page | What it shows |
|---|---|
| `/[lang]` | This week's event map, events by day, roles by function, hiring companies you can meet this week |
| `/[lang]/events` | Events grouped by day (this week by default, `?range=month` for 30 days) and the open sources they come from |
| `/[lang]/jobs` | Roles by function (graph), by company (word cloud), and the full table |

## Run

```bash
npm install
npm run dev
```

## Data

Everything the site shows lives in `data/` and is refreshed daily by `.github/workflows/daily-sync.yml`.

| File | Written by | Source |
|---|---|---|
| `companies.json` | by hand | the company watchlist |
| `jobs.json` | `scripts/jobs_sync.py` | each company's public careers board (Greenhouse, Lever, Ashby) |
| `events.json` | `scripts/events_sync.py` | open Luma listings in `sources.json` |

Both scripts use the Python standard library only and label data with keyword rules, with no LLM calls.
`python3 scripts/weekly_jobs_report.py` writes the weekly report to `reports/`.

## Supabase

Run `supabase/migrations/001` to `003` in the SQL editor. With `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set, `jobs_sync.py` also upserts companies and jobs. With `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` set, the jobs page reads from Supabase; otherwise it reads the JSON files. Events are read from JSON for now.

## Design

shadcn-style neutral tokens in `app/globals.css`, one accent colour (`#1257FD`). Map: MapLibre GL with the OpenFreeMap Positron basemap (OpenStreetMap data, no API key).
