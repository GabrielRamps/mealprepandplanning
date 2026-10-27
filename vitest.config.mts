import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Same "@/..." imports as tsconfig.json paths.
      "@": root("."),
      // Server modules can be unit-tested; "server-only" only guards client bundles.
      "server-only": root("node_modules/server-only/empty.js"),
    },
  },
  test: { include: ["lib/**/*.test.ts"] },
});
