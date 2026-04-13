/**
 * FX Rate reference relay — read-only tenant bearer endpoints.
 *
 * Proxies:
 *   GET /api/platform/ref/fx-rates           → runtime GET /api/platform/ref/fx-rates
 *   GET /api/platform/ref/fx-rates/lookup    → runtime GET /api/platform/ref/fx-rates/lookup
 *   GET /api/platform/ref/fx-rates/history   → runtime GET /api/platform/ref/fx-rates/history
 */
import { makeModuleRelay } from "@/lib/server/make-module-relay";

export const { GET } = makeModuleRelay("platform/ref/fx-rates");
