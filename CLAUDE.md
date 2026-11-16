# shou-frontend

**app.shou.be** — the shou app (single-page `index.html`: browse, map, search /
AI concierge, event detail) and `admin/` (internal dashboard). Deployed by Vercel on
merge to `main`. Data comes from the API in the sibling repo **shou-backend**; the
public shou.be site and event pages live in **shou-landing**.

This repository is **public**: never commit secrets, tokens, internal URLs with
credentials, or personal data.

## Conventions

- **XSS:** event fields from the API are escaped once, at shape time, in
  `escEventFields`. Keep that invariant — don't double-escape and don't insert raw
  fields with `innerHTML` elsewhere.
- **Admin:** `admin/` reads `admin_*` data only through the backend's authenticated
  admin endpoint. Never call `admin_*` database functions with the public (anon) key
  and never grant them to anon. Some panels are computed in the backend's `admin-rpc.js`
  rather than SQL (Translation health, and the **Sources** panel = `admin_sources_overview`:
  one row per ingest source with health, range totals and its last 10 runs — keep it
  per source, never a "last N runs" list, which hides daily sources).
  **Event submissions** (`#submissions`): calendars venues sent via shou.be/add-your-events, each
  with its automatic check (verdict, signals, AI read, sample events); Approve / Reject call
  `admin_venue_submission_decide`. Escape every submitted field and only link http(s) URLs.
  Sources shows the last run's Fetched and Updated (not range sums). Panels start as
  `<div class="loading">`; `.loading:has(> *)` drops that placeholder look once content renders.
  **AI usage** (`#ai-usage`, 2026-11-11): searches per day by kind and Gemini calls / tokens per model
  from the backend's Redis counters (`admin_ai_usage`, backend `api/_shared/ai-meter.js`); search only.
  The Translations chart counts Gemini translations only (`admin_machine_translations_per_day`,
  falling back to `admin_translations_per_day`): agenda.brussels's own NL/EN texts aren't work.
- **SEO:** the app canonicals every URL to `https://app.shou.be/`; per-event SEO lives
  on `shou.be/e/<slug>` (shou-landing / shou-backend). Don't make app deep links indexable.
  `?q=` (and `?list=`, `?surprise=`) RUN a paid AI search on load (`maybeSearchFromUrl`), so
  `robots.txt` disallows them for crawlers; `?event=` links stay crawlable (canonical).
  Since 2026-11-13 shou.be pages never link `?q=`: their Ask buttons use `?ask=<question>` (`maybeAskFromUrl`:
  box pre-filled + hint, NO search until the visitor taps Ask Shou), and `?surprise=1` only highlights the
  Surprise chip. `?q=` runs at once ONLY with `run=1` (the saved-search email); without it, it pre-fills like `?ask=`.
  Searches send `geo: 'ip' | 'precise'` with lat/lng (the backend caches 'ip' ones per ~10 km). The automatic
  location arriving doesn't re-run a search that already answered (`syncGeoState`); a precise one does.
- `fetchEvts()` rebuilds the global `all` array — re-add lazily loaded events after it.
- Display-side de-duplication (`dedupeByContent`, `collapseSeries`) folds same-title
  variants; keep it when changing list rendering.
- Analytics stays cookieless; anything that stores data on the device needs consent.
  Vercel Web Analytics loads only on the first REAL tap / click / key / wheel (2026-11-11; trusted
  events, not scroll): ~2,800 bot loads a day (desktop Windows, US/CN/BR/CO, 97% bounce) were most
  of the visitors and billed page views. Numbers from 2026-11-11 on = engaged visitors; don't
  compare them with earlier days.
- **Event URLs are short**: `?event=<slug>`, falling back to the uuid; `findEvByRef`
  resolves either. Anything that writes an event URL uses `e.slug || id`.
- **Overlays** (`mov`, `signinMov`, `profileMov`, …) are moved to `<body>` by the hoist
  script before `</body>` — `.main-wrap` is a stacking context below the nav, so a new
  full-screen overlay must be added to that list.
- **Saved searches**: `savedSearches` + `renderSavedSearchesSection()`; the email bell
  stays hidden until `SS_EMAIL_LIVE` (testers open `?ssmail=1`); `?q=<search>` runs a search.
  `syncSavedSearchLang()` (on load and in `setLang`) sets every saved search of the signed-in user
  to the app's current language — the digest email follows it (2026-11-09).
- **Dates**: compare with the local date (`todayLocalISO()`), never
  `toISOString().slice(0, 10)` (UTC).
- **LIVE badge** = on right now: `eventWindow(e)` → start until its end time (no end, the
  "23:59" placeholder or > 12 h → start + 3 h); `isEventLive` also drives the "Live now"
  filter. Starting within 2 h → a quiet `soon-badge` ("In 45 min" / "At 20:00", strings
  `soonIn` / `soonAt`). `hasPassed` waits for the end (or 4 h), so a live show is never hidden.
- **Browse chips** (`#browseChips`, 2026-11-10): guided tours / workshops / talks & debates / markets open the EXACT list of the shou.be interest page (`browseKind` → `showList`, `?format=list&kind=…`, next 14 days; no AI search). Talks & markets hide outside their months (`data-months`). Their "Guided tour"/"Workshop"/… pill comes from the API's `seg` (backend `segLabel`).
- `?profile=1` opens the profile sheet (the saved-search digest's "Manage" link).

## Working from Claude Code in the cloud (claude.ai/code)

- **No local memory there.** Project knowledge lives in the CLAUDE.md files of shou-backend, shou-frontend,
  shou-landing and theshou.com, plus shou-backend `docs/project-notes.md` (product state, open follow-ups,
  how-tos) and `docs/theshou-global-plan.md`. Put new durable facts there, not in a session.
- **Pull requests:** the cloud GitHub proxy blocks `gh pr …` / `gh issue …` (GraphQL). Open the PR with the
  session's **Create PR** button, or REST:
  `gh api repos/serpuk/shou-frontend/pulls -f title='…' -f head=<branch> -f base=main -f body='…'`.
  Merge (only when the user asks): `gh api -X PUT repos/serpuk/shou-frontend/pulls/<n>/merge -f merge_method=merge`.
  Branch deletion and tags are refused by the proxy; leave merged branches.
- **No production access:** no Fly login, no database keys, no Vercel / Supabase dashboards. Write dry-run
  scripts and ask the user to run them; read public data through `https://shou-backend.vercel.app/api/…`.
  Never put a secret in the environment's plain variables (the model can read them).
- **Pages:** shou.be and app.shou.be challenge cloud-server traffic (Vercel Firewall), so checks from the cloud
  may get a 429 challenge; use `shou-backend.vercel.app` URLs or headless Chrome and say when a page could not
  be checked.
- **Strybai Build:** this repo syncs into the workspace "shou Apartments": `build#N` starts its task N and
  `closes build#N` in the PR closes it. Tasks of the workspace "theshou.com" (the global plan, which numbers
  its tasks separately) need its slug: `build#theshou/N` / `closes build#theshou/N` — a plain `build#N` would
  move the shou Apartments task with that number. Editing the board itself needs the user's login.

## Workflow

- One branch + PR per change; **commit / push / deploy only when the user asks**.
  Commit trailer: `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Vercel builds (`vercel.json` `ignoreCommand`): branch previews are **never built**, and
  a `main` commit touching only `*.md` / `*.sql` / `test/` / `docs/` doesn't deploy —
  verify on production after merging.
- Preview with `.claude/launch.json`; check at 375 px width and in the browser console.
- **Vercel Firewall** (dashboard, since 2026-11-09): Bot Protection = Challenge plus Deny/Challenge
  rules for useless crawlers and cloud-server networks (same as shou.be). Every app load calls the
  backend (`/api/categories`, `/api/events`), so bot loads cost database time: ~25k fake loads a day
  from Tencent Cloud from 2026-11-05 helped overload the database. Analytics before 2026-11-09 is
  mostly bots. `curl` against app.shou.be now gets 429 (challenge); use the browser pane.
