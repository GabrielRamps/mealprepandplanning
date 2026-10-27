import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Declare your Neon services here
  preview: {
    realtime: {
      allowedOrigins: ["http://localhost:3000", "https://mealprepandplanning.vercel.app"],
    },
  },
  auth: true,
  buckets: {
    // Recipe cover photos, served directly to the app (PRD 3, 9.2)
    "recipe-photos": { access: "public_read" },
    // Import uploads; deleted on approve/discard and by the 7-day cleanup (PRD 12)
    imports: { access: "private" },
  },
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});
