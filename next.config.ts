import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  compress: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" }
    ]
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/fm",
        permanent: false
      }
    ];
  },
  async headers() {
    return [
      {
        source: "/fm",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, s-maxage=60, stale-while-revalidate=300" }
        ]
      },
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
      }
    ];
  }
};

export default nextConfig;
