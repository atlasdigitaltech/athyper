import type { Router } from "express";
import { createAuditRoutes, type AuditRouteDeps } from "./audit.route.js";
import { createGovernanceRoutes, type GovernanceRouteDeps } from "./governance.route.js";
import { createModerationRoutes, type ModerationRouteDeps } from "./moderation.route.js";
import { createLegalHoldRoutes, type LegalHoldRouteDeps } from "./legal-hold.route.js";
import { createPiiInventoryRoute, type PiiInventoryRouteDeps } from "./pii-inventory.route.js";
import { createIntegrityCheckRoute, type IntegrityCheckRouteDeps } from "./integrity-check.route.js";
import {
  createAuditHashChainRoutes,
  type AuditHashChainRouteDeps,
} from "./audit-hash-chain.route.js";
import {
  createReportPackRoutes,
  type ReportPackRouteDeps,
} from "./report-pack.route.js";
import {
  createAuditTimelineRoute,
  type AuditTimelineRouteDeps,
} from "./audit-timeline.route.js";

export type {
  AuditRouteDeps,
  GovernanceRouteDeps,
  ModerationRouteDeps,
  LegalHoldRouteDeps,
  PiiInventoryRouteDeps,
  IntegrityCheckRouteDeps,
  AuditHashChainRouteDeps,
  ReportPackRouteDeps,
  AuditTimelineRouteDeps,
};

export type AuditServiceDeps =
  AuditRouteDeps &
  GovernanceRouteDeps &
  ModerationRouteDeps &
  LegalHoldRouteDeps &
  PiiInventoryRouteDeps &
  IntegrityCheckRouteDeps &
  AuditHashChainRouteDeps &
  ReportPackRouteDeps &
  AuditTimelineRouteDeps;

export function registerAuditRoutes(router: Router, deps: AuditServiceDeps): void {
  createAuditRoutes(router, deps);
  createGovernanceRoutes(router, deps);
  createModerationRoutes(router, deps);
  createLegalHoldRoutes(router, deps);
  createPiiInventoryRoute(router, deps);
  createIntegrityCheckRoute(router, deps);
  createAuditHashChainRoutes(router, deps);
  createReportPackRoutes(router, deps);
  createAuditTimelineRoute(router, deps);
}
