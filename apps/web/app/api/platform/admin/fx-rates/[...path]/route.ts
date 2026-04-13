/**
 * FX Rate admin relay — POST/PATCH/DELETE (platform-admin only).
 *
 * Proxies:
 *   POST   /api/platform/admin/fx-rates        → runtime POST   /api/platform/admin/fx-rates
 *   PATCH  /api/platform/admin/fx-rates/:id    → runtime PATCH  /api/platform/admin/fx-rates/:id
 *   DELETE /api/platform/admin/fx-rates/:id    → runtime DELETE /api/platform/admin/fx-rates/:id
 */
import { makeModuleRelay } from "@/lib/server/make-module-relay";

export const { POST, PATCH, DELETE } = makeModuleRelay("platform/admin/fx-rates");
