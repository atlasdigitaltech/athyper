import type { Router } from "express";
import { createAuditRoutes, type AuditRouteDeps } from "./audit.route.js";
import { createGovernanceRoutes, type GovernanceRouteDeps } from "./governance.route.js";
import { createModerationRoutes, type ModerationRouteDeps } from "./moderation.route.js";
import {
  createAuditHashChainRoutes,
  type AuditHashChainRouteDeps,
} from "../../../../../src/foundation/audit/audit-hash-chain.route.js";
import {
  createReportPackRoutes,
  type ReportPackRouteDeps,
} from "../../../../../src/foundation/audit/report-pack.route.js";

export type {
  AuditRouteDeps,
  GovernanceRouteDeps,
  ModerationRouteDeps,
  AuditHashChainRouteDeps,
  ReportPackRouteDeps,
};

export type AuditServiceDeps =
  AuditRouteDeps &
  GovernanceRouteDeps &
  ModerationRouteDeps &
  AuditHashChainRouteDeps &
  ReportPackRouteDeps;

export function registerAuditRoutes(router: Router, deps: AuditServiceDeps): void {
  createAuditRoutes(router, deps);
  createGovernanceRoutes(router, deps);
  createModerationRoutes(router, deps);
  createAuditHashChainRoutes(router, deps);
  createReportPackRoutes(router, deps);
}
