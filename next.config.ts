import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every screen reads the session, so Cache Components' static shell buys
  // little here; pages render per request.
  cacheComponents: false,
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
