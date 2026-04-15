/**
 * BFF relay — Document Services (Module 8)
 *
 * Proxies all /api/docservices/* requests to the backend runtime API
 * with session auth + tenant context headers injected automatically.
 *
 * Covered endpoints (all via catch-all):
 *   GET/POST/PATCH/DELETE /api/docservices/templates[/:id]
 *   GET/POST              /api/docservices/versions
 *   GET/POST/PATCH        /api/docservices/brands[/:id]
 *   GET/POST/PATCH        /api/docservices/letterheads[/:id]
 *   GET/POST/PATCH/DELETE /api/docservices/bindings[/:id]
 *   GET/POST              /api/docservices/outputs[/:id/deliver|revoke]
 *   GET                   /api/docservices/jobs[/:id/retry]
 *   GET                   /api/docservices/dlq[/:id/replay]
 *   GET/POST/PATCH        /api/docservices/profiles[/:id]
 *   POST                  /api/docservices/resolver
 */
import { makeModuleRelay } from "@/lib/server/make-module-relay";

export const { GET, POST, PUT, PATCH, DELETE } = makeModuleRelay("docservices");
