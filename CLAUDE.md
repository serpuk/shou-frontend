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
  and never grant them to anon.
- **SEO:** the app canonicals every URL to `https://app.shou.be/`; per-event SEO lives
  on `shou.be/e/<slug>` (shou-landing / shou-backend). Don't make app deep links indexable.
- `fetchEvts()` rebuilds the global `all` array — re-add lazily loaded events after it.
- Display-side de-duplication (`dedupeByContent`, `collapseSeries`) folds same-title
  variants; keep it when changing list rendering.
- Analytics stays cookieless; anything that stores data on the device needs consent.
- **Event URLs are short**: `?event=<slug>`, falling back to the uuid; `findEvByRef`
  resolves either. Anything that writes an event URL uses `e.slug || id`.
- **Overlays** (`mov`, `signinMov`, `profileMov`, …) are moved to `<body>` by the hoist
  script before `</body>` — `.main-wrap` is a stacking context below the nav, so a new
  full-screen overlay must be added to that list.
- **Saved searches**: `savedSearches` + `renderSavedSearchesSection()`; the email bell
  stays hidden until `SS_EMAIL_LIVE` (testers open `?ssmail=1`); `?q=<search>` runs a search.
- **Dates**: compare with the local date (`todayLocalISO()`), never
  `toISOString().slice(0, 10)` (UTC).

## Workflow

- One branch + PR per change; **commit / push / deploy only when the user asks**.
  Commit trailer: `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Vercel builds (`vercel.json` `ignoreCommand`): branch previews are **never built**, and
  a `main` commit touching only `*.md` / `*.sql` / `test/` / `docs/` doesn't deploy —
  verify on production after merging.
- Preview with `.claude/launch.json`; check at 375 px width and in the browser console.
