import type { Config } from "drizzle-kit";

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Supabase verwaltet Auth-Schema selbst — wir migrieren nur public
  schemaFilter: ["public"],
  verbose: true,
  strict: true,
} satisfies Config;
