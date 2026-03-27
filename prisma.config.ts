// prisma.config.ts
// =============================================================================
// MehmanGhar Financial OS — Prisma CLI Configuration
// Prisma 7 — replaces datasource block in schema.prisma
//
// This file is used exclusively by the Prisma CLI (migrate, studio, db pull,
// db seed). It is NOT imported by the Next.js application at runtime.
//
// Connection URL strategy:
//   - prisma.config.ts uses the DIRECT URL (port 5432, bypasses the pooler).
//     Migrations and db pull must go direct — they do not work through PgBouncer.
//   - The Next.js app (src/lib/db.ts) uses the POOLER URL (port 6543) via
//     @prisma/adapter-pg for all runtime queries. This is configured in Phase 3.
//
// Env file strategy:
//   - dotenv is pointed explicitly at .env.local so all secrets stay in one file.
//   - The .env file auto-created by `prisma init` should be deleted (or left
//     empty) — it is not used by this project.
// =============================================================================

import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Load .env.local explicitly — Prisma CLI does not follow Next.js conventions.
config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",

    // Seed command — replaces the "prisma.seed" key in package.json (removed in v7).
    // Run with: npx prisma db seed
    seed: "npx tsx prisma/seed.ts",
  },

  datasource: {
    // DIRECT_URL — port 5432, no pooler, no ?pgbouncer=true suffix.
    // Required for migrations and db pull. See .env.local template.
    url: process.env.DIRECT_URL as string,
  },
});