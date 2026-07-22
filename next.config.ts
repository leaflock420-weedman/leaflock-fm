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
  async rewrites() {
    return [
      // Friendly mount: https://fm.leaflock.com.au/live.mp3
      { source: "/live.mp3", destination: "/api/fm/listen" },
      // Typo alias (pm3)
      { source: "/live.pm3", destination: "/api/fm/listen" }
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
        source: "/live.mp3",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache" },
          { key: "Access-Control-Allow-Origin", value: "*" }
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
