import type { NextConfig } from "next";

/**
 * Content Security Policy.
 *
 * Controls which external resources the browser is allowed to load.
 * This is the single most important header for preventing XSS attacks.
 *
 * Each directive whitelist is built from actual usage in the codebase:
 * - GTM, Meta Pixel, Stripe.js, Google Pay (scripts)
 * - Google Fonts (styles + fonts)
 * - Stripe Connect, GTM, Google Pay (iframes)
 * - Supabase, Stripe, Google Pay, Meta CAPI, Klaviyo (API calls)
 * - Payment Request API explicitly allowed via Permissions-Policy
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const cspDirectives = [
  "default-src 'self'",
  // Scripts: GTM, Meta Pixel, Stripe.js, Google Pay
  // 'unsafe-inline' required for GTM consent defaults in layout.tsx
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://connect.facebook.net https://js.stripe.com https://pay.google.com",
  // Styles: Google Fonts + inline styles (Tailwind, branding CSS vars)
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // Fonts: Google Fonts CDN
  "font-src 'self' https://fonts.gstatic.com",
  // Images: self + data URIs (QR codes, base64 logos) + Mux thumbnails
  `img-src 'self' data: blob: https://image.mux.com`,
  // Media: Mux HLS video segments + blob URIs for player internals
  "media-src 'self' blob: https://stream.mux.com https://*.mux.com",
  // Workers: Mux Player uses Web Workers for HLS parsing
  "worker-src 'self' blob:",
  // Iframes: GTM noscript, Stripe Connect onboarding, Stripe.js, Google Pay
  "frame-src 'self' https://www.googletagmanager.com https://connect.stripe.com https://js.stripe.com https://pay.google.com",
  // API calls: Supabase REST/Realtime, Stripe, Google Pay, Meta, Klaviyo, GTM, Mux streaming + analytics
  `connect-src 'self' ${supabaseUrl} wss://${supabaseUrl.replace("https://", "")} https://api.stripe.com https://pay.google.com https://www.googleapis.com https://www.gstatic.com https://www.googletagmanager.com https://connect.facebook.net https://graph.facebook.com https://manage.kmail-lists.com https://stream.mux.com https://*.mux.com https://inferred.litix.io`,
  // Forms only submit to same origin
  "form-action 'self'",
  // Prevent <base> tag hijacking
  "base-uri 'self'",
];
const contentSecurityPolicy = cspDirectives.join("; ");

const nextConfig: NextConfig = {
  // Keep trailing slashes to match existing URL structure (/event/liverpool-27-march/)
  trailingSlash: true,

  // Never serve source maps to browsers in production
  productionBrowserSourceMaps: false,

  // Image optimization for event banners and assets
  images: {
    formats: ["image/avif", "image/webp"],
  },

  // Security headers for all routes.
  // Additional headers (HSTS in production) are set by middleware for /admin/* and /api/*.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=*, interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
        ],
      },
    ];
  },

  // Rewrites for Apple Pay domain verification.
  // Apple checks /.well-known/apple-developer-merchantid-domain-association
  // on the domain before enabling Apple Pay. We proxy this from Stripe's CDN.
  async rewrites() {
    return [
      {
        source:
          "/.well-known/apple-developer-merchantid-domain-association",
        destination:
          "/api/stripe/apple-pay-verify",
      },
    ];
  },
};

export default nextConfig;
