import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema/index.ts",
  out: "./src/lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://apoth:apoth@localhost:5432/apoth",
  },
  schemaFilter: ["apoth"],
  verbose: true,
  strict: true,
});
