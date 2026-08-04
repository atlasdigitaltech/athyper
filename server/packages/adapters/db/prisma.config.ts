import { defineConfig } from "prisma/config";

// PRISMA_TARGET selects which database URL to use for db pull.
// Set by scripts/prisma-pull.mjs; irrelevant for prisma generate.
const target = process.env.PRISMA_TARGET;

const url = (() => {
  if (target === "admin") {
    return (
      process.env.ATHYPER_PLATFORM_DATABASE_URL ??
      "postgresql://offline:offline@localhost:5432/offline"
    );
  }
  if (target === "mesh") {
    return (
      process.env.MESH_DATABASE_URL ??
      process.env.DATABASE_URL ??
      "postgresql://offline:offline@localhost:5432/offline"
    );
  }
  return (
    process.env.DATABASE_URL ??
    "postgresql://offline:offline@localhost:5432/offline"
  );
})();

export default defineConfig({
  schema: "src/prisma/schema.prisma",
  migrations: {
    path: "src/prisma/migrations",
  },
  datasource: { url },
});
