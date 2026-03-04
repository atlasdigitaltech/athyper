/**
 * UI HTTP Module
 *
 * Registers all dashboard and saved-view HTTP handlers, routes, and services.
 * Follows the RuntimeModule pattern (register + contribute).
 *
 * During contribute(), seeds system dashboards from contribution JSON files.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { TOKENS } from "../../../kernel/tokens.js";

import { DashboardContributionSeeder } from "./dashboard-seeder.js";
import { DashboardRepository } from "./dashboard.repository.js";
import { DashboardService } from "./dashboard.service.js";
import {
  AddAclHandler,
  CreateDashboardHandler,
  DeleteDashboardHandler,
  DiscardDraftHandler,
  DuplicateDashboardHandler,
  GetDashboardHandler,
  GetDraftHandler,
  ListAclHandler,
  ListDashboardsHandler,
  PublishDashboardHandler,
  RemoveAclHandler,
  SaveDraftLayoutHandler,
  UpdateDashboardHandler,
} from "./handlers/dashboards.handler.js";
import {
  CreateSavedViewHandler,
  DeleteSavedViewHandler,
  GetSavedViewHandler,
  ListSavedViewsHandler,
  UpdateSavedViewHandler,
} from "./handlers/saved-views.handler.js";
import { SavedViewRepository } from "./saved-view.repository.js";
import { SavedViewService } from "./saved-view.service.js";

import type { Container } from "../../../kernel/container.js";
import type { Logger } from "../../../kernel/logger.js";
import type { RuntimeModule } from "../../types.js";
import type { RouteRegistry } from "../foundation/registries/routes.registry.js";
import type { Kysely } from "kysely";

// ============================================================================
// Handler Tokens
// ============================================================================

const UI_HANDLER_TOKENS = {
  // Dashboards
  listDashboards: "ui.handler.dashboards.list",
  getDashboard: "ui.handler.dashboards.get",
  getDraft: "ui.handler.dashboards.getDraft",
  createDashboard: "ui.handler.dashboards.create",
  duplicateDashboard: "ui.handler.dashboards.duplicate",
  updateDashboard: "ui.handler.dashboards.update",
  saveDraftLayout: "ui.handler.dashboards.saveLayout",
  publishDashboard: "ui.handler.dashboards.publish",
  discardDraft: "ui.handler.dashboards.discardDraft",
  listAcl: "ui.handler.dashboards.listAcl",
  addAcl: "ui.handler.dashboards.addAcl",
  removeAcl: "ui.handler.dashboards.removeAcl",
  deleteDashboard: "ui.handler.dashboards.delete",
  // Saved Views
  listViews: "ui.handler.views.list",
  getView: "ui.handler.views.get",
  createView: "ui.handler.views.create",
  updateView: "ui.handler.views.update",
  deleteView: "ui.handler.views.delete",
} as const;

// ============================================================================
// Module Definition
// ============================================================================

export const module: RuntimeModule = {
  name: "platform.ui.dashboard",

  async register(c: Container) {
    // ── Core services ──────────────────────────────────────────────
    c.register(
      TOKENS.dashboardService,
      async () => {
        const db = await c.resolve<Kysely<any>>(TOKENS.db);
        const logger = await c.resolve<Logger>(TOKENS.logger);
        const repo = new DashboardRepository(db);
        return new DashboardService(repo, logger);
      },
      "singleton",
    );

    c.register(
      TOKENS.contributionLoader,
      async () => {
        const db = await c.resolve<Kysely<any>>(TOKENS.db);
        const logger = await c.resolve<Logger>(TOKENS.logger);
        const repo = new DashboardRepository(db);
        return new DashboardContributionSeeder(repo, logger);
      },
      "singleton",
    );

    c.register(
      TOKENS.savedViewService,
      async () => {
        const db = await c.resolve<Kysely<any>>(TOKENS.db);
        const logger = await c.resolve<Logger>(TOKENS.logger);
        const repo = new SavedViewRepository(db);
        return new SavedViewService(repo, logger);
      },
      "singleton",
    );

    // ── Dashboard HTTP handlers ─────────────────────────────────────
    c.register(
      UI_HANDLER_TOKENS.listDashboards,
      async () => new ListDashboardsHandler(),
      "singleton",
    );
    c.register(
      UI_HANDLER_TOKENS.getDashboard,
      async () => new GetDashboardHandler(),
      "singleton",
    );
    c.register(
      UI_HANDLER_TOKENS.getDraft,
      async () => new GetDraftHandler(),
      "singleton",
    );
    c.register(
      UI_HANDLER_TOKENS.createDashboard,
      async () => new CreateDashboardHandler(),
      "singleton",
    );
    c.register(
      UI_HANDLER_TOKENS.duplicateDashboard,
      async () => new DuplicateDashboardHandler(),
      "singleton",
    );
    c.register(
      UI_HANDLER_TOKENS.updateDashboard,
      async () => new UpdateDashboardHandler(),
      "singleton",
    );
    c.register(
      UI_HANDLER_TOKENS.saveDraftLayout,
      async () => new SaveDraftLayoutHandler(),
      "singleton",
    );
    c.register(
      UI_HANDLER_TOKENS.publishDashboard,
      async () => new PublishDashboardHandler(),
      "singleton",
    );
    c.register(
      UI_HANDLER_TOKENS.discardDraft,
      async () => new DiscardDraftHandler(),
      "singleton",
    );
    c.register(
      UI_HANDLER_TOKENS.listAcl,
      async () => new ListAclHandler(),
      "singleton",
    );
    c.register(
      UI_HANDLER_TOKENS.addAcl,
      async () => new AddAclHandler(),
      "singleton",
    );
    c.register(
      UI_HANDLER_TOKENS.removeAcl,
      async () => new RemoveAclHandler(),
      "singleton",
    );
    c.register(
      UI_HANDLER_TOKENS.deleteDashboard,
      async () => new DeleteDashboardHandler(),
      "singleton",
    );

    // ── Saved View HTTP handlers ────────────────────────────────────
    c.register(
      UI_HANDLER_TOKENS.listViews,
      async () => new ListSavedViewsHandler(),
      "singleton",
    );
    c.register(
      UI_HANDLER_TOKENS.getView,
      async () => new GetSavedViewHandler(),
      "singleton",
    );
    c.register(
      UI_HANDLER_TOKENS.createView,
      async () => new CreateSavedViewHandler(),
      "singleton",
    );
    c.register(
      UI_HANDLER_TOKENS.updateView,
      async () => new UpdateSavedViewHandler(),
      "singleton",
    );
    c.register(
      UI_HANDLER_TOKENS.deleteView,
      async () => new DeleteSavedViewHandler(),
      "singleton",
    );
  },

  async contribute(c: Container) {
    const routes = await c.resolve<RouteRegistry>(TOKENS.routeRegistry);

    // ====================================================================
    // Dashboard List & Read Routes
    // ====================================================================

    routes.add({
      method: "GET",
      path: "/api/ui/dashboards",
      handlerToken: UI_HANDLER_TOKENS.listDashboards,
      authRequired: true,
      tags: ["ui", "dashboards"],
    });

    routes.add({
      method: "GET",
      path: "/api/ui/dashboards/:id",
      handlerToken: UI_HANDLER_TOKENS.getDashboard,
      authRequired: true,
      tags: ["ui", "dashboards"],
    });

    routes.add({
      method: "GET",
      path: "/api/ui/dashboards/:id/draft",
      handlerToken: UI_HANDLER_TOKENS.getDraft,
      authRequired: true,
      tags: ["ui", "dashboards"],
    });

    // ====================================================================
    // Dashboard Write Routes
    // ====================================================================

    routes.add({
      method: "POST",
      path: "/api/ui/dashboards",
      handlerToken: UI_HANDLER_TOKENS.createDashboard,
      authRequired: true,
      tags: ["ui", "dashboards"],
    });

    routes.add({
      method: "POST",
      path: "/api/ui/dashboards/:id/duplicate",
      handlerToken: UI_HANDLER_TOKENS.duplicateDashboard,
      authRequired: true,
      tags: ["ui", "dashboards"],
    });

    routes.add({
      method: "PATCH",
      path: "/api/ui/dashboards/:id",
      handlerToken: UI_HANDLER_TOKENS.updateDashboard,
      authRequired: true,
      tags: ["ui", "dashboards"],
    });

    routes.add({
      method: "PUT",
      path: "/api/ui/dashboards/:id/layout",
      handlerToken: UI_HANDLER_TOKENS.saveDraftLayout,
      authRequired: true,
      tags: ["ui", "dashboards"],
    });

    routes.add({
      method: "POST",
      path: "/api/ui/dashboards/:id/publish",
      handlerToken: UI_HANDLER_TOKENS.publishDashboard,
      authRequired: true,
      tags: ["ui", "dashboards"],
    });

    routes.add({
      method: "DELETE",
      path: "/api/ui/dashboards/:id/draft",
      handlerToken: UI_HANDLER_TOKENS.discardDraft,
      authRequired: true,
      tags: ["ui", "dashboards"],
    });

    routes.add({
      method: "DELETE",
      path: "/api/ui/dashboards/:id",
      handlerToken: UI_HANDLER_TOKENS.deleteDashboard,
      authRequired: true,
      tags: ["ui", "dashboards"],
    });

    // ====================================================================
    // Dashboard ACL Routes
    // ====================================================================

    routes.add({
      method: "GET",
      path: "/api/ui/dashboards/:id/acl",
      handlerToken: UI_HANDLER_TOKENS.listAcl,
      authRequired: true,
      tags: ["ui", "dashboards", "acl"],
    });

    routes.add({
      method: "POST",
      path: "/api/ui/dashboards/:id/acl",
      handlerToken: UI_HANDLER_TOKENS.addAcl,
      authRequired: true,
      tags: ["ui", "dashboards", "acl"],
    });

    routes.add({
      method: "DELETE",
      path: "/api/ui/dashboards/:id/acl/:aclId",
      handlerToken: UI_HANDLER_TOKENS.removeAcl,
      authRequired: true,
      tags: ["ui", "dashboards", "acl"],
    });

    // ====================================================================
    // Saved View Routes
    // ====================================================================

    routes.add({
      method: "GET",
      path: "/api/ui/views",
      handlerToken: UI_HANDLER_TOKENS.listViews,
      authRequired: true,
      tags: ["ui", "views"],
    });

    routes.add({
      method: "GET",
      path: "/api/ui/views/:id",
      handlerToken: UI_HANDLER_TOKENS.getView,
      authRequired: true,
      tags: ["ui", "views"],
    });

    routes.add({
      method: "POST",
      path: "/api/ui/views",
      handlerToken: UI_HANDLER_TOKENS.createView,
      authRequired: true,
      tags: ["ui", "views"],
    });

    routes.add({
      method: "PATCH",
      path: "/api/ui/views/:id",
      handlerToken: UI_HANDLER_TOKENS.updateView,
      authRequired: true,
      tags: ["ui", "views"],
    });

    routes.add({
      method: "DELETE",
      path: "/api/ui/views/:id",
      handlerToken: UI_HANDLER_TOKENS.deleteView,
      authRequired: true,
      tags: ["ui", "views"],
    });

    // ====================================================================
    // Seed system dashboards from contribution files
    // ====================================================================

    const seeder = await c.resolve<DashboardContributionSeeder>(
      TOKENS.contributionLoader,
    );
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    const servicesDir = resolve(moduleDir, "../../");
    await seeder.seed(servicesDir);
  },
};
