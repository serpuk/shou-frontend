// ============================================================================
// shou-frontend / middleware.js
// ----------------------------------------------------------------------------
// Routes social-media crawler requests for /?event=<id> to the backend OG
// endpoint, which returns rich Open Graph meta for that specific event.
// Real users pass through to the SPA unchanged.
//
// Why middleware instead of vercel.json rewrites?
//   - Several iterations of vercel.json rewrites with `has` user-agent matching
//     didn't fire reliably in this project. Middleware is the supported, more
//     observable alternative — plain JS we can reason about and log.
//   - Vercel docs explicitly recommend middleware for header-based routing.
//
// Approach: proxy via fetch() rather than NextResponse.rewrite() to an external
// URL. fetch() is unambiguous, returns a Response we can pass through directly,
// and avoids the external-rewrite quirks documented in vercel/next.js issues.
//
// Failure modes — all degrade safely:
//   - Bot detection error → fall through (real user gets SPA)
//   - Fetch to backend fails → fall through (bot sees the SPA, no rich preview,
//     but no broken page either)
//   - Any exception → fall through, log to Vercel runtime
// ============================================================================

// Crawlers we care about. Match case-insensitive on the User-Agent header.
// Order matters for readability only; we use a single regex test.
const BOT_UA = /(facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|WhatsApp|Discordbot|TelegramBot|Pinterest|Applebot|redditbot|SkypeUriPreview|vkShare|Embedly|outbrain)/i;

// Backend OG endpoint. Same domain as the rest of our API.
const OG_BACKEND = 'https://shou-backend.vercel.app/api/og';

// The matcher tells Vercel which paths trigger this middleware. We only need
// to run on the root path — the SPA handles everything else client-side, and
// asset paths (favicon, fonts, etc.) shouldn't pay the middleware cost.
//
// Note: matcher is a sibling export to the default function. Vercel reads
// the config at deploy time to scope invocations.
export const config = {
  matcher: '/',
};

export default async function middleware(request) {
  try {
    const url = new URL(request.url);
    const ua = request.headers.get('user-agent') || '';
    const eventId = url.searchParams.get('event');

    // Defensive logging — Vercel's runtime logs surface these for debugging.
    // Useful when verifying via curl + Facebook Sharing Debugger that the
    // expected requests are reaching the middleware. Remove if noisy.
    console.log('[og-middleware]', {
      path: url.pathname,
      hasEvent: !!eventId,
      ua: ua.slice(0, 80),
      isBot: BOT_UA.test(ua),
    });

    // Three conditions must all hold to proxy:
    //   1. Request is from a known social crawler
    //   2. URL has an ?event=<id> param
    //   3. eventId is non-empty
    // If any fails, pass through silently (return nothing → SPA serves).
    if (!BOT_UA.test(ua) || !eventId) {
      return;
    }

    // Proxy: fetch the backend OG endpoint with the event id and return its
    // response directly. We deliberately don't forward all original headers
    // (e.g. cookies, auth) — the OG endpoint is public and doesn't need them.
    // We DO forward the user-agent so the backend can log who scraped what.
    const backendUrl = `${OG_BACKEND}?event=${encodeURIComponent(eventId)}`;
    const backendResponse = await fetch(backendUrl, {
      headers: {
        'user-agent': ua,
        'accept': 'text/html',
      },
    });

    // Return the backend's response directly. Body, status, content-type all
    // come from the backend. The browser/crawler sees this as the response
    // for the original URL — no redirect, no URL change.
    return new Response(backendResponse.body, {
      status: backendResponse.status,
      headers: {
        'content-type': backendResponse.headers.get('content-type') || 'text/html; charset=utf-8',
        'cache-control': backendResponse.headers.get('cache-control') || 'public, max-age=300',
      },
    });
  } catch (err) {
    // Anything goes wrong — log it and pass through. We never want middleware
    // to break the site. Worst case: bot sees the SPA, generic preview.
    console.error('[og-middleware] error:', err && err.message ? err.message : err);
    return;
  }
}
