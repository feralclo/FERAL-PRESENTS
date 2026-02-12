import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep trailing slashes to match existing URL structure (/event/liverpool-27-march/)
  trailingSlash: true,

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
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
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
