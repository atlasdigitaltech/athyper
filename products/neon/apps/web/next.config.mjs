/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@neon/auth",
    "@neon/content",
    "@neon/ui",
    "@neon/theme",
    "@athyper/ui",
    "@athyper/theme",
    "@athyper/auth",
    "@athyper/api-client",
    "@athyper/workbench-admin",
    "@athyper/workbench-partner",
    "@athyper/workbench-user",
    "@athyper/i18n",
    "@athyper/dashboard",
    "@athyper/runtime",
  ],
  serverExternalPackages: ["pg", "kysely"],
  experimental: {
    serverActions: { allowedOrigins: ["neon.athyper.local", "localhost:3001"] },
  },
};

export default nextConfig;
