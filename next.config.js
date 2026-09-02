/** @type {import('next').NextConfig} */

// Baseline security headers, applied to every response. This app has no external
// scripts/fonts/images (see app/layout.tsx — everything is served from itself), so a
// fairly strict Content-Security-Policy is safe here without an allowlist of third-party
// hosts to maintain. script-src/style-src still need 'unsafe-inline' because Next's App
// Router injects its own hydration bootstrap script and styled-jsx inline styles without
// a nonce by default — a nonce-based CSP is possible (see Next's docs on Content
// Security Policy) but needs a per-request nonce wired through middleware, which is a
// bigger, harder-to-verify change than this pass is trying to make. Since this app has
// no `dangerouslySetInnerHTML` and never renders user-supplied HTML anywhere (verified
// while auditing this), the realistic XSS surface these headers are defending against is
// already small; this CSP is still worth having for the things it does fully stop
// (framing, loading data from/to anywhere but this app's own origin) without betting the
// whole build on getting a stricter policy exactly right blind.
const securityHeaders = [
  // Clickjacking: refuse to be framed by any other site (frame-ancestors is the modern,
  // CSP-based replacement for X-Frame-Options; both are set since some older clients
  // only understand the header).
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Stops browsers from "helpfully" re-interpreting a response as a different content
  // type than the server declared (a classic MIME-sniffing XSS vector).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak the full URL (which can include an order number) to a third-party site
  // this app might ever link out to; same-origin navigations still get the full referrer.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // This app never needs the camera, microphone, or the visitor's location — say so
  // explicitly rather than leaving it to browser defaults.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Tells browsers to only ever reach this host over HTTPS for the next ~2 years, even
  // if someone types a plain http:// link. Railway/Cloudflare already redirect http ->
  // https at the edge; this is the origin's own header saying the same thing, so it
  // still holds even for a client hitting Railway directly. No includeSubDomains/preload
  // since this app doesn't own the whole parent domain (see README's custom domain
  // section) and shouldn't make that promise on the domain owner's behalf.
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
