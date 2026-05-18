// /api/og.js
//
// Serves per-event Open Graph meta tags to social media crawlers (Facebook,
// Twitter/X, LinkedIn, Slack, WhatsApp, etc). Real users who somehow land
// here get redirected to the SPA via meta refresh + JS.
//
// Routing: vercel.json has a rewrite rule that sends requests with
// known bot User-Agents AND ?event=<id> to this endpoint. Real users hit
// /index.html as usual — SPA behavior unchanged.
//
// Strategy:
//   - Query Supabase for the event by id, picking translations in the
//     preferred locale (fallback: source language)
//   - Build HTML with full OG meta tags
//   - Image must be absolute URL (relative paths break Facebook crawler)
//   - Description truncated to ~200 chars (Facebook shows ~300, Twitter ~200,
//     LinkedIn ~150 — 200 is a sensible middle ground)
//
// Failure modes:
//   - Event not found → return SPA HTML with generic shou OG tags
//   - Supabase down → return generic shou OG tags
//   - Either way, real users always end up at the SPA

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mpbrfnlmtdxnipyarsss.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// The canonical frontend URL — used in OG meta to point crawlers/users at
// the real SPA, not at this API endpoint. Must be the production URL,
// not a preview deployment.
const SHOU_FRONTEND_URL = process.env.SHOU_FRONTEND_URL || 'https://shou-frontend.vercel.app';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Escape attribute and text content for safe HTML embedding.
// We're building HTML manually rather than via a template engine; this
// prevents XSS via event titles or descriptions that contain quotes/angles.
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function truncate(s, max) {
  if (!s) return '';
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

// Build a generic shou OG HTML page — used when event lookup fails.
// Real users see this briefly then JS redirects them to the SPA root.
function genericHtml(targetUrl) {
  const url = targetUrl || SHOU_FRONTEND_URL;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>shou — belgium after dark</title>
<meta property="og:type" content="website">
<meta property="og:title" content="shou — belgium after dark">
<meta property="og:description" content="Concerts, clubs, festivals, theatre — the after-dark guide for Brussels, Antwerp, Ghent and beyond.">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:site_name" content="shou">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="shou — belgium after dark">
<meta name="twitter:description" content="Concerts, clubs, festivals, theatre — the after-dark guide for Brussels, Antwerp, Ghent and beyond.">
<meta http-equiv="refresh" content="0;url=${escapeHtml(url)}">
<script>window.location.replace(${JSON.stringify(url)});</script>
</head>
<body>
<p>Loading shou — <a href="${escapeHtml(url)}">click here if not redirected</a></p>
</body>
</html>`;
}

// Build the per-event OG HTML page with rich preview metadata.
function eventHtml(event, canonicalUrl) {
  const title = event.title ? `${event.title} — shou` : 'shou — belgium after dark';
  const baseDesc = event.description || 'Live event in Belgium tonight. Discover more on shou.';
  const description = truncate(baseDesc, 200);
  const image = event.image_url || `${SHOU_FRONTEND_URL}/og-default.png`;
  // Absolute URL required for og:image — crawlers won't follow relative paths
  const imageAbs = image.startsWith('http') ? image : `${SHOU_FRONTEND_URL}${image}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>

<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(imageAbs)}">
<meta property="og:url" content="${escapeHtml(canonicalUrl)}">
<meta property="og:site_name" content="shou">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(imageAbs)}">

<!-- Real users (not crawlers) get redirected to the SPA which renders
     the full interactive event view via client-side routing. -->
<meta http-equiv="refresh" content="0;url=${escapeHtml(canonicalUrl)}">
<script>window.location.replace(${JSON.stringify(canonicalUrl)});</script>
</head>
<body style="font-family:system-ui;background:#0a0a0c;color:#fff;padding:40px;text-align:center;">
<h1>${escapeHtml(event.title || 'shou')}</h1>
<p>${escapeHtml(description)}</p>
<p><a href="${escapeHtml(canonicalUrl)}" style="color:#0ef;">Open in shou →</a></p>
</body>
</html>`;
}

export default async function handler(req, res) {
  // CORS is not strictly necessary (crawlers don't enforce it) but
  // permitting all origins makes manual testing/curl easier.
  res.setHeader('Access-Control-Allow-Origin', '*');

  const eventId = (req.query?.event || '').toString().trim();
  const canonicalUrl = `${SHOU_FRONTEND_URL}/?event=${encodeURIComponent(eventId)}`;

  // No event id → serve generic SPA redirect
  if (!eventId) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).send(genericHtml(SHOU_FRONTEND_URL));
  }

  try {
    // Pick the EN translation if available, else fall back to source.
    // EN is the lingua franca of social previews — most international
    // shares benefit from English text. We could improve later by reading
    // Accept-Language header and serving locale-matched OG.
    const { data: event, error } = await supabase
      .from('events')
      .select(`
        id,
        title,
        description,
        image_url,
        language,
        event_translations ( language, title, description )
      `)
      .eq('id', eventId)
      .maybeSingle();

    if (error || !event) {
      console.error('og: event lookup failed', { eventId, error });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=60');  // short cache for misses
      return res.status(200).send(genericHtml(canonicalUrl));
    }

    // Pick translation: prefer EN if available, else first translation,
    // else fall back to events.title/description (the source).
    const trans = event.event_translations || [];
    const en = trans.find(t => t.language === 'en');
    const picked = en || trans[0];
    const eventForOg = {
      title:       picked?.title       || event.title,
      description: picked?.description || event.description,
      image_url:   event.image_url,
    };

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Cache aggressively — crawlers re-fetch periodically but per-event
    // metadata is stable. 1h cache is a good balance.
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    return res.status(200).send(eventHtml(eventForOg, canonicalUrl));
  } catch (ex) {
    console.error('og: handler error', ex);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(genericHtml(canonicalUrl));
  }
}
