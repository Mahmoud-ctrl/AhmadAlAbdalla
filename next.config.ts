import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "lebwork.b-cdn.net",
      },
      {
        protocol: "https",
        hostname: "idesignit.b-cdn.net",
      }
    ],
  },
};

export default nextConfig;
