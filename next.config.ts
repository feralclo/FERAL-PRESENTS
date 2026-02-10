import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep trailing slashes to match existing URL structure (/event/liverpool-27-march/)
  trailingSlash: true,

  // Image optimization for event banners and assets
  images: {
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
