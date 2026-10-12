import type { NextConfig } from "next";

const apiUrl = (process.env.RUNSPECT_API_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
const isGitHubPages = process.env.GITHUB_PAGES === "true";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  turbopack: { root: __dirname },
  basePath,
  ...(isGitHubPages
    ? { output: "export", trailingSlash: true }
    : {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: `${apiUrl}/api/:path*`,
            },
            {
              source: "/healthz",
              destination: `${apiUrl}/healthz`,
            },
          ];
        },
      }),
};

export default nextConfig;
