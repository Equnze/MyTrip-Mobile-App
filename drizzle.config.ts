import { defineConfig } from "drizzle-kit";

// drizzle-kit doesn't load .env on its own.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on variables already set in the environment.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Migrations use the direct (unpooled) connection.
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!,
  },
});
