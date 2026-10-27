import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every screen reads the session, so Cache Components' static shell buys
  // little here; pages render per request.
  cacheComponents: false,
  experimental: {
    // Recipe saves carry a cover photo (resized in the browser, capped at
    // 4 MB in lib/photos.ts); Vercel's own request limit is 4.5 MB.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
