import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep trailing slashes to match existing URL structure (/event/liverpool-27-march/)
  trailingSlash: true,

  // Image optimization for event banners and assets
  images: {
    formats: ["image/avif", "image/webp"],
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
