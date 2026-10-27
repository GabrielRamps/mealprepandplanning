// Applies the SQL migrations in ./drizzle. Uses the direct connection over TCP,
// or Neon's HTTP driver when DATABASE_DRIVER=neon-http (no outbound TCP).
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { migrate as migrateHttp } from "drizzle-orm/neon-http/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set");
  const migrationsFolder = "./drizzle";

  if (process.env.DATABASE_DRIVER === "neon-http") {
    await migrateHttp(drizzleHttp(neon(url)), { migrationsFolder });
  } else {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      await migratePg(drizzlePg(client), { migrationsFolder });
    } finally {
      await client.end();
    }
  }
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
