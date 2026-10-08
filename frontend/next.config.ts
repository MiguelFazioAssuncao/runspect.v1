import type { NextConfig } from "next";

const apiUrl = (process.env.RUNSPECT_API_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;