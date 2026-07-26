import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  compress: true,
  // Keep heavy extractors out of the server bundle / edge traces.
  serverExternalPackages: ["@distube/ytdl-core", "@ybd-project/ytdl-core"],

  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }]
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/fm",
        permanent: false
      },
      // Permanent fix for the typo URL
      {
        source: "/live.pm3",
        destination: "/live.mp3",
        permanent: true
      }
    ];
  },
  async headers() {
    return [
      {
        source: "/fm",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
          }
        ]
      },
      {
        source: "/live",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache" },
          { key: "Access-Control-Allow-Origin", value: "*" }
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
