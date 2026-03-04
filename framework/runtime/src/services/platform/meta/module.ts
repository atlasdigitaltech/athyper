/**
 * META Engine HTTP Module
 *
 * Registers all META Engine HTTP handlers and routes
 */

import { META_TOKENS } from "@athyper/core/meta";

import { TOKENS } from "../../../kernel/tokens.js";

import { ApprovalServiceImpl } from "./approval/approval.service.js";
import {
  SLA_JOB_TYPES,
  createSlaReminderHandler,
  createSlaEscalationHandler,
} from "./approval/index.js";
import {
  ListTemplatesHandler,
  CreateTemplateHandler,
  GetTemplateHandler,
  UpdateTemplateHandler,
  DeleteTemplateHandler,
  GetStagesHandler,
  GetRulesHandler,
  ValidateTemplateHandler,
  CompileTemplateHandler,
  ListVersionsHandler as ListTemplateVersionsHandler,
  RollbackHandler,
  DiffHandler,
  ImpactAnalysisHandler,
  TestResolutionHandler,
} from "./handlers/approval-template.handler.js";
import {
  ListRecordsHandler,
  GetRecordHandler,
  CountRecordsHandler,
  CreateRecordHandler,
  UpdateRecordHandler,
  DeleteRecordHandler,
  RestoreRecordHandler,
  PermanentDeleteRecordHandler,
  BulkCreateRecordsHandler,
  BulkUpdateRecordsHandler,
  BulkDeleteRecordsHandler,
} from "./handlers/data.handler.js";
import {
  StaticDescriptorHandler,
  DynamicDescriptorHandler,
  ActionExecutionHandler,
} from "./handlers/descriptor.handler.js";
import {
  CreateEntityHandler,
  ListEntitiesHandler,
  GetEntityHandler,
  UpdateEntityHandler,
  DeleteEntityHandler,
} from "./handlers/entities.handler.js";
import {
  ListFieldsHandler,
  ListRelationsHandler,
  ListIndexesHandler,
  GetEntityPoliciesHandler,
  GetCompiledHandler,
  GetLifecycleBindingsHandler,
  GetValidationHandler,
  ListEntityVersionsHandler as ListEntityVersionsSubHandler,
  GetDiffHandler,
  CompileEntityHandler,
  MutateFieldsHandler,
  DeleteFieldHandler,
  MutateRelationsHandler,
} from "./handlers/entity-sub.handler.js";
import {
  TransitionHandler,
  StateQueryHandler,
  HistoryHandler,
} from "./handlers/lifecycle.handler.js";
import {
  ListOverlaysHandler,
  CreateOverlayHandler,
  GetOverlayHandler,
  UpdateOverlayHandler,
  DeleteOverlayHandler,
  PreviewOverlayHandler,
  ValidateOverlayHandler,
  GetChangesHandler,
  AddChangeHandler,
  RemoveChangeHandler,
  ReorderChangesHandler,
} from "./handlers/overlay.handler.js";
import {
  CreateVersionHandler,
  ListVersionsHandler,
  GetVersionHandler,
  ActivateVersionHandler,
  DeleteVersionHandler,
} from "./handlers/versions.handler.js";
import { LifecycleTimerServiceImpl } from "./lifecycle/lifecycle-timer.service.js";
import {
  TIMER_JOB_TYPES,
  createAutoTransitionHandler,
} from "./lifecycle/workers/lifecycle-timer.worker.js";

import type { Container } from "../../../kernel/container.js";
import type { RuntimeModule } from "../../types.js";
import type { HttpHandlerContext } from "../foundation/http/types.js";
import type { RouteRegistry } from "../foundation/registries/routes.registry.js";
import type { JobQueue } from "@athyper/core";
import type {
  ApprovalService,
  LifecycleTimerService,
} from "@athyper/core/meta";

// ============================================================================
// RBAC Policy for Data API Routes
// ============================================================================

const META_DATA_RBAC_TOKEN = "meta.policy.dataRbac";

/**
 * Persona-based RBAC pre-check for all Generic Data API routes.
 * Resolves PolicyGateService from DI and checks authorizeWithPersona().
 * If the PolicyGateService is not registered, allows access (graceful degradation).
 * Throws with code "FORBIDDEN" on denial — handled by Express error middleware.
 */
class MetaDataRbacPolicy {
  async assertAllowed(ctx: HttpHandlerContext): Promise<void> {
    try {
      const gate = await ctx.container.resolve<{
        authorizeWithPersona(
          id: string,
          t: string,
          op: string,
          c?: { entityKey?: string },
        ): Promise<{ allowed: boolean; reason?: string }>;
      }>(TOKENS.policyGate);
      const principalId = ctx.auth.userId ?? ctx.auth.subject ?? "system";
      const tenantId = ctx.tenant.tenantKey ?? "default";

      // Extract entity from path: /api/data/:entity/...
      const pathParts = ctx.request.path.split("/");
      const entity = pathParts[3]; // ["", "api", "data", "entity_name", ...]

      // Derive operation from HTTP method + path context
      const method = ctx.request.method.toUpperCase();
      const path = ctx.request.path;
      const operation =
        method === "GET"
          ? "read"
          : method === "DELETE"
            ? "delete"
            : path.includes("/restore")
              ? "update"
              : method === "POST"
                ? "create"
                : "update"; // PUT, PATCH

      const decision = await gate.authorizeWithPersona(
        principalId,
        tenantId,
        operation,
        { entityKey: entity },
      );
      if (!decision.allowed) {
        const e = new Error(
          decision.reason ?? "Access denied by RBAC policy",
        ) as Error & { code?: string };
        e.code = "FORBIDDEN";
        throw e;
      }
    } catch (err) {
      // Re-throw FORBIDDEN (our own denial) so Express error middleware returns 403
      if (err && typeof err === "object" && (err as any).code === "FORBIDDEN")
        throw err;
      // PolicyGateService not registered or failed — graceful degradation (allow)
    }
  }
}

// Entity handlers

// Version handlers

// Data API handlers

// ============================================================================
// Handler Tokens
// ============================================================================

const META_HANDLER_TOKENS = {
  // Entity handlers
  createEntity: "meta.handler.entities.create",
  listEntities: "meta.handler.entities.list",
  getEntity: "meta.handler.entities.get",
  updateEntity: "meta.handler.entities.update",
  deleteEntity: "meta.handler.entities.delete",

  // Version handlers
  createVersion: "meta.handler.versions.create",
  listVersions: "meta.handler.versions.list",
  getVersion: "meta.handler.versions.get",
  activateVersion: "meta.handler.versions.activate",
  deleteVersion: "meta.handler.versions.delete",

  // Data API handlers
  listRecords: "meta.handler.data.list",
  getRecord: "meta.handler.data.get",
  countRecords: "meta.handler.data.count",
  createRecord: "meta.handler.data.create",
  updateRecord: "meta.handler.data.update",
  deleteRecord: "meta.handler.data.delete",
  restoreRecord: "meta.handler.data.restore",
  permanentDeleteRecord: "meta.handler.data.permanentDelete",

  // Bulk operation handlers
  bulkCreateRecords: "meta.handler.data.bulkCreate",
  bulkUpdateRecords: "meta.handler.data.bulkUpdate",
  bulkDeleteRecords: "meta.handler.data.bulkDelete",

  // Entity Page Descriptor handlers
  staticDescriptor: "meta.handler.descriptor.static",
  dynamicDescriptor: "meta.handler.descriptor.dynamic",
  actionExecution: "meta.handler.descriptor.action",

  // Lifecycle handlers
  transition: "meta.handler.lifecycle.transition",
  stateQuery: "meta.handler.lifecycle.stateQuery",
  lifecycleHistory: "meta.handler.lifecycle.history",

  // Approval Template handlers
  listTemplates: "meta.handler.approvalTemplate.list",
  createTemplate: "meta.handler.approvalTemplate.create",
  getTemplate: "meta.handler.approvalTemplate.get",
  updateTemplate: "meta.handler.approvalTemplate.update",
  deleteTemplate: "meta.handler.approvalTemplate.delete",
  getStages: "meta.handler.approvalTemplate.getStages",
  getRules: "meta.handler.approvalTemplate.getRules",
  validateTemplate: "meta.handler.approvalTemplate.validate",
  compileTemplate: "meta.handler.approvalTemplate.compile",
  listTemplateVersions: "meta.handler.approvalTemplate.listVersions",
  rollbackTemplate: "meta.handler.approvalTemplate.rollback",
  diffTemplate: "meta.handler.approvalTemplate.diff",
  impactAnalysis: "meta.handler.approvalTemplate.impactAnalysis",
  testResolution: "meta.handler.approvalTemplate.testResolution",

  // Overlay handlers (EPIC I)
  listOverlays: "meta.handler.overlays.list",
  createOverlay: "meta.handler.overlays.create",
  getOverlay: "meta.handler.overlays.get",
  updateOverlay: "meta.handler.overlays.update",
  deleteOverlay: "meta.handler.overlays.delete",
  previewOverlay: "meta.handler.overlays.preview",
  validateOverlay: "meta.handler.overlays.validate",
  getChanges: "meta.handler.overlays.getChanges",
  addChange: "meta.handler.overlays.addChange",
  removeChange: "meta.handler.overlays.removeChange",
  reorderChanges: "meta.handler.overlays.reorderChanges",

  // Entity sub-resource handlers (Schema Explorer)
  listFields: "meta.handler.entitySub.fields",
  listRelations: "meta.handler.entitySub.relations",
  listIndexes: "meta.handler.entitySub.indexes",
  getEntityPolicies: "meta.handler.entitySub.policies",
  getCompiled: "meta.handler.entitySub.compiled",
  getLifecycleBindings: "meta.handler.entitySub.lifecycle",
  getValidation: "meta.handler.entitySub.validation",
  listEntityVersionsSub: "meta.handler.entitySub.versions",
  getDiff: "meta.handler.entitySub.diff",
  compileEntity: "meta.handler.entitySub.compile",
  mutateFields: "meta.handler.entitySub.mutateFields",
  deleteField: "meta.handler.entitySub.deleteField",
  mutateRelations: "meta.handler.entitySub.mutateRelations",
} as const;

// ============================================================================
// Module Definition
// ============================================================================

export const module: RuntimeModule = {
  name: "platform.meta",

  async register(c: Container) {
    // Register entity handlers
    c.register(
      META_HANDLER_TOKENS.createEntity,
      async () => new CreateEntityHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.listEntities,
      async () => new ListEntitiesHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.getEntity,
      async () => new GetEntityHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.updateEntity,
      async () => new UpdateEntityHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.deleteEntity,
      async () => new DeleteEntityHandler(),
      "singleton",
    );

    // Register version handlers
    c.register(
      META_HANDLER_TOKENS.createVersion,
      async () => new CreateVersionHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.listVersions,
      async () => new ListVersionsHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.getVersion,
      async () => new GetVersionHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.activateVersion,
      async () => new ActivateVersionHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.deleteVersion,
      async () => new DeleteVersionHandler(),
      "singleton",
    );

    // Register data API handlers
    c.register(
      META_HANDLER_TOKENS.listRecords,
      async () => new ListRecordsHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.getRecord,
      async () => new GetRecordHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.countRecords,
      async () => new CountRecordsHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.createRecord,
      async () => new CreateRecordHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.updateRecord,
      async () => new UpdateRecordHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.deleteRecord,
      async () => new DeleteRecordHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.restoreRecord,
      async () => new RestoreRecordHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.permanentDeleteRecord,
      async () => new PermanentDeleteRecordHandler(),
      "singleton",
    );

    // Register bulk operation handlers
    c.register(
      META_HANDLER_TOKENS.bulkCreateRecords,
      async () => new BulkCreateRecordsHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.bulkUpdateRecords,
      async () => new BulkUpdateRecordsHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.bulkDeleteRecords,
      async () => new BulkDeleteRecordsHandler(),
      "singleton",
    );

    // Register entity page descriptor handlers
    c.register(
      META_HANDLER_TOKENS.staticDescriptor,
      async () => new StaticDescriptorHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.dynamicDescriptor,
      async () => new DynamicDescriptorHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.actionExecution,
      async () => new ActionExecutionHandler(),
      "singleton",
    );

    // Register lifecycle handlers
    c.register(
      META_HANDLER_TOKENS.transition,
      async () => new TransitionHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.stateQuery,
      async () => new StateQueryHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.lifecycleHistory,
      async () => new HistoryHandler(),
      "singleton",
    );

    // Register approval template handlers
    c.register(
      META_HANDLER_TOKENS.listTemplates,
      async () => new ListTemplatesHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.createTemplate,
      async () => new CreateTemplateHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.getTemplate,
      async () => new GetTemplateHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.updateTemplate,
      async () => new UpdateTemplateHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.deleteTemplate,
      async () => new DeleteTemplateHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.getStages,
      async () => new GetStagesHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.getRules,
      async () => new GetRulesHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.validateTemplate,
      async () => new ValidateTemplateHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.compileTemplate,
      async () => new CompileTemplateHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.listTemplateVersions,
      async () => new ListTemplateVersionsHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.rollbackTemplate,
      async () => new RollbackHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.diffTemplate,
      async () => new DiffHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.impactAnalysis,
      async () => new ImpactAnalysisHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.testResolution,
      async () => new TestResolutionHandler(),
      "singleton",
    );

    // Register overlay handlers (EPIC I)
    c.register(
      META_HANDLER_TOKENS.listOverlays,
      async () => new ListOverlaysHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.createOverlay,
      async () => new CreateOverlayHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.getOverlay,
      async () => new GetOverlayHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.updateOverlay,
      async () => new UpdateOverlayHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.deleteOverlay,
      async () => new DeleteOverlayHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.previewOverlay,
      async () => new PreviewOverlayHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.validateOverlay,
      async () => new ValidateOverlayHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.getChanges,
      async () => new GetChangesHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.addChange,
      async () => new AddChangeHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.removeChange,
      async () => new RemoveChangeHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.reorderChanges,
      async () => new ReorderChangesHandler(),
      "singleton",
    );

    // Register entity sub-resource handlers (Schema Explorer)
    c.register(
      META_HANDLER_TOKENS.listFields,
      async () => new ListFieldsHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.listRelations,
      async () => new ListRelationsHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.listIndexes,
      async () => new ListIndexesHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.getEntityPolicies,
      async () => new GetEntityPoliciesHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.getCompiled,
      async () => new GetCompiledHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.getLifecycleBindings,
      async () => new GetLifecycleBindingsHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.getValidation,
      async () => new GetValidationHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.listEntityVersionsSub,
      async () => new ListEntityVersionsSubHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.getDiff,
      async () => new GetDiffHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.compileEntity,
      async () => new CompileEntityHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.mutateFields,
      async () => new MutateFieldsHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.deleteField,
      async () => new DeleteFieldHandler(),
      "singleton",
    );
    c.register(
      META_HANDLER_TOKENS.mutateRelations,
      async () => new MutateRelationsHandler(),
      "singleton",
    );

    // RBAC policy for Generic Data API routes
    c.register(
      META_DATA_RBAC_TOKEN,
      async () => new MetaDataRbacPolicy(),
      "singleton",
    );
  },

  async contribute(c: Container) {
    const routes = await c.resolve<RouteRegistry>(TOKENS.routeRegistry);

    // ========================================================================
    // Entity Routes
    // ========================================================================

    routes.add({
      method: "POST",
      path: "/api/meta/entities",
      handlerToken: META_HANDLER_TOKENS.createEntity,
      authRequired: true,
      tags: ["meta", "entities"],
    });

    routes.add({
      method: "GET",
      path: "/api/meta/entities",
      handlerToken: META_HANDLER_TOKENS.listEntities,
      authRequired: true,
      tags: ["meta", "entities"],
    });

    routes.add({
      method: "GET",
      path: "/api/meta/entities/:name",
      handlerToken: META_HANDLER_TOKENS.getEntity,
      authRequired: true,
      tags: ["meta", "entities"],
    });

    routes.add({
      method: "PUT",
      path: "/api/meta/entities/:name",
      handlerToken: META_HANDLER_TOKENS.updateEntity,
      authRequired: true,
      tags: ["meta", "entities"],
    });

    routes.add({
      method: "DELETE",
      path: "/api/meta/entities/:name",
      handlerToken: META_HANDLER_TOKENS.deleteEntity,
      authRequired: true,
      tags: ["meta", "entities"],
    });

    // ========================================================================
    // Entity Sub-Resource Routes (Schema Explorer)
    // ========================================================================

    routes.add({
      method: "GET",
      path: "/api/meta/entities/:name/fields",
      handlerToken: META_HANDLER_TOKENS.listFields,
      authRequired: true,
      tags: ["meta", "entities", "fields"],
    });

    routes.add({
      method: "POST",
      path: "/api/meta/entities/:name/fields",
      handlerToken: META_HANDLER_TOKENS.mutateFields,
      authRequired: true,
      tags: ["meta", "entities", "fields"],
    });

    routes.add({
      method: "PUT",
      path: "/api/meta/entities/:name/fields",
      handlerToken: META_HANDLER_TOKENS.mutateFields,
      authRequired: true,
      tags: ["meta", "entities", "fields"],
    });

    routes.add({
      method: "DELETE",
      path: "/api/meta/entities/:name/fields",
      handlerToken: META_HANDLER_TOKENS.deleteField,
      authRequired: true,
      tags: ["meta", "entities", "fields"],
    });

    routes.add({
      method: "GET",
      path: "/api/meta/entities/:name/relations",
      handlerToken: META_HANDLER_TOKENS.listRelations,
      authRequired: true,
      tags: ["meta", "entities", "relations"],
    });

    routes.add({
      method: "POST",
      path: "/api/meta/entities/:name/relations",
      handlerToken: META_HANDLER_TOKENS.mutateRelations,
      authRequired: true,
      tags: ["meta", "entities", "relations"],
    });

    routes.add({
      method: "GET",
      path: "/api/meta/entities/:name/indexes",
      handlerToken: META_HANDLER_TOKENS.listIndexes,
      authRequired: true,
      tags: ["meta", "entities", "indexes"],
    });

    routes.add({
      method: "GET",
      path: "/api/meta/entities/:name/policies",
      handlerToken: META_HANDLER_TOKENS.getEntityPolicies,
      authRequired: true,
      tags: ["meta", "entities", "policies"],
    });

    routes.add({
      method: "GET",
      path: "/api/meta/entities/:name/compiled",
      handlerToken: META_HANDLER_TOKENS.getCompiled,
      authRequired: true,
      tags: ["meta", "entities", "compiled"],
    });

    routes.add({
      method: "GET",
      path: "/api/meta/entities/:name/lifecycle",
      handlerToken: META_HANDLER_TOKENS.getLifecycleBindings,
      authRequired: true,
      tags: ["meta", "entities", "lifecycle"],
    });

    routes.add({
      method: "GET",
      path: "/api/meta/entities/:name/validation",
      handlerToken: META_HANDLER_TOKENS.getValidation,
      authRequired: true,
      tags: ["meta", "entities", "validation"],
    });

    routes.add({
      method: "GET",
      path: "/api/meta/entities/:name/diff",
      handlerToken: META_HANDLER_TOKENS.getDiff,
      authRequired: true,
      tags: ["meta", "entities", "diff"],
    });

    routes.add({
      method: "POST",
      path: "/api/meta/entities/:name/compile",
      handlerToken: META_HANDLER_TOKENS.compileEntity,
      authRequired: true,
      tags: ["meta", "entities", "compile"],
    });

    // ========================================================================
    // Version Routes
    // ========================================================================

    routes.add({
      method: "POST",
      path: "/api/meta/entities/:name/versions",
      handlerToken: META_HANDLER_TOKENS.createVersion,
      authRequired: true,
      tags: ["meta", "versions"],
    });

    routes.add({
      method: "GET",
      path: "/api/meta/entities/:name/versions",
      handlerToken: META_HANDLER_TOKENS.listVersions,
      authRequired: true,
      tags: ["meta", "versions"],
    });

    routes.add({
      method: "GET",
      path: "/api/meta/entities/:name/versions/:version",
      handlerToken: META_HANDLER_TOKENS.getVersion,
      authRequired: true,
      tags: ["meta", "versions"],
    });

    routes.add({
      method: "POST",
      path: "/api/meta/entities/:name/versions/:version/activate",
      handlerToken: META_HANDLER_TOKENS.activateVersion,
      authRequired: true,
      tags: ["meta", "versions"],
    });

    routes.add({
      method: "DELETE",
      path: "/api/meta/entities/:name/versions/:version",
      handlerToken: META_HANDLER_TOKENS.deleteVersion,
      authRequired: true,
      tags: ["meta", "versions"],
    });

    // ========================================================================
    // Generic Data API Routes (RBAC-gated via MetaDataRbacPolicy)
    // ========================================================================

    routes.add({
      method: "GET",
      path: "/api/data/:entity",
      handlerToken: META_HANDLER_TOKENS.listRecords,
      authRequired: true,
      policyToken: META_DATA_RBAC_TOKEN,
      tags: ["meta", "data"],
    });

    routes.add({
      method: "GET",
      path: "/api/data/:entity/:id",
      handlerToken: META_HANDLER_TOKENS.getRecord,
      authRequired: true,
      policyToken: META_DATA_RBAC_TOKEN,
      tags: ["meta", "data"],
    });

    routes.add({
      method: "GET",
      path: "/api/data/:entity/count",
      handlerToken: META_HANDLER_TOKENS.countRecords,
      authRequired: true,
      policyToken: META_DATA_RBAC_TOKEN,
      tags: ["meta", "data"],
    });

    // Write operations
    routes.add({
      method: "POST",
      path: "/api/data/:entity",
      handlerToken: META_HANDLER_TOKENS.createRecord,
      authRequired: true,
      policyToken: META_DATA_RBAC_TOKEN,
      tags: ["meta", "data"],
    });

    routes.add({
      method: "PUT",
      path: "/api/data/:entity/:id",
      handlerToken: META_HANDLER_TOKENS.updateRecord,
      authRequired: true,
      policyToken: META_DATA_RBAC_TOKEN,
      tags: ["meta", "data"],
    });

    routes.add({
      method: "DELETE",
      path: "/api/data/:entity/:id",
      handlerToken: META_HANDLER_TOKENS.deleteRecord,
      authRequired: true,
      policyToken: META_DATA_RBAC_TOKEN,
      tags: ["meta", "data"],
    });

    // Soft delete operations
    routes.add({
      method: "POST",
      path: "/api/data/:entity/:id/restore",
      handlerToken: META_HANDLER_TOKENS.restoreRecord,
      authRequired: true,
      policyToken: META_DATA_RBAC_TOKEN,
      tags: ["meta", "data", "soft-delete"],
    });

    routes.add({
      method: "DELETE",
      path: "/api/data/:entity/:id/permanent",
      handlerToken: META_HANDLER_TOKENS.permanentDeleteRecord,
      authRequired: true,
      policyToken: META_DATA_RBAC_TOKEN,
      tags: ["meta", "data", "soft-delete"],
    });

    // Bulk operations
    routes.add({
      method: "POST",
      path: "/api/data/:entity/bulk",
      handlerToken: META_HANDLER_TOKENS.bulkCreateRecords,
      authRequired: true,
      policyToken: META_DATA_RBAC_TOKEN,
      tags: ["meta", "data", "bulk"],
    });

    routes.add({
      method: "PATCH",
      path: "/api/data/:entity/bulk",
      handlerToken: META_HANDLER_TOKENS.bulkUpdateRecords,
      authRequired: true,
      policyToken: META_DATA_RBAC_TOKEN,
      tags: ["meta", "data", "bulk"],
    });

    routes.add({
      method: "DELETE",
      path: "/api/data/:entity/bulk",
      handlerToken: META_HANDLER_TOKENS.bulkDeleteRecords,
      authRequired: true,
      policyToken: META_DATA_RBAC_TOKEN,
      tags: ["meta", "data", "bulk"],
    });

    // ========================================================================
    // Entity Page Descriptor Routes
    // ========================================================================

    routes.add({
      method: "GET",
      path: "/api/entity-page/:entityName",
      handlerToken: META_HANDLER_TOKENS.staticDescriptor,
      authRequired: true,
      tags: ["entity-page"],
    });

    routes.add({
      method: "GET",
      path: "/api/entity-page/:entityName/:id",
      handlerToken: META_HANDLER_TOKENS.dynamicDescriptor,
      authRequired: true,
      tags: ["entity-page"],
    });

    routes.add({
      method: "POST",
      path: "/api/entity-page/:entityName/:id/actions/:actionCode",
      handlerToken: META_HANDLER_TOKENS.actionExecution,
      authRequired: true,
      tags: ["entity-page", "actions"],
    });

    // ========================================================================
    // Lifecycle Transition Routes (EPIC H — H3)
    // ========================================================================

    routes.add({
      method: "POST",
      path: "/api/data/:entity/:id/transition/:operationCode",
      handlerToken: META_HANDLER_TOKENS.transition,
      authRequired: true,
      policyToken: META_DATA_RBAC_TOKEN,
      tags: ["lifecycle", "transitions"],
    });

    routes.add({
      method: "GET",
      path: "/api/data/:entity/:id/lifecycle",
      handlerToken: META_HANDLER_TOKENS.stateQuery,
      authRequired: true,
      policyToken: META_DATA_RBAC_TOKEN,
      tags: ["lifecycle", "state"],
    });

    routes.add({
      method: "GET",
      path: "/api/data/:entity/:id/lifecycle/history",
      handlerToken: META_HANDLER_TOKENS.lifecycleHistory,
      authRequired: true,
      policyToken: META_DATA_RBAC_TOKEN,
      tags: ["lifecycle", "history"],
    });

    // ========================================================================
    // Approval Template Routes (EPIC G — G1+G2+G3+G4)
    // ========================================================================

    routes.add({
      method: "GET",
      path: "/api/approval-templates",
      handlerToken: META_HANDLER_TOKENS.listTemplates,
      authRequired: true,
      tags: ["approval", "templates"],
    });

    routes.add({
      method: "POST",
      path: "/api/approval-templates",
      handlerToken: META_HANDLER_TOKENS.createTemplate,
      authRequired: true,
      tags: ["approval", "templates"],
    });

    routes.add({
      method: "GET",
      path: "/api/approval-templates/:code",
      handlerToken: META_HANDLER_TOKENS.getTemplate,
      authRequired: true,
      tags: ["approval", "templates"],
    });

    routes.add({
      method: "PATCH",
      path: "/api/approval-templates/:code",
      handlerToken: META_HANDLER_TOKENS.updateTemplate,
      authRequired: true,
      tags: ["approval", "templates"],
    });

    routes.add({
      method: "DELETE",
      path: "/api/approval-templates/:code",
      handlerToken: META_HANDLER_TOKENS.deleteTemplate,
      authRequired: true,
      tags: ["approval", "templates"],
    });

    routes.add({
      method: "GET",
      path: "/api/approval-templates/:code/stages",
      handlerToken: META_HANDLER_TOKENS.getStages,
      authRequired: true,
      tags: ["approval", "templates", "stages"],
    });

    routes.add({
      method: "GET",
      path: "/api/approval-templates/:code/rules",
      handlerToken: META_HANDLER_TOKENS.getRules,
      authRequired: true,
      tags: ["approval", "templates", "rules"],
    });

    routes.add({
      method: "POST",
      path: "/api/approval-templates/:code/validate",
      handlerToken: META_HANDLER_TOKENS.validateTemplate,
      authRequired: true,
      tags: ["approval", "templates", "validation"],
    });

    routes.add({
      method: "POST",
      path: "/api/approval-templates/:code/compile",
      handlerToken: META_HANDLER_TOKENS.compileTemplate,
      authRequired: true,
      tags: ["approval", "templates", "compilation"],
    });

    routes.add({
      method: "GET",
      path: "/api/approval-templates/:code/versions",
      handlerToken: META_HANDLER_TOKENS.listTemplateVersions,
      authRequired: true,
      tags: ["approval", "templates", "versions"],
    });

    routes.add({
      method: "POST",
      path: "/api/approval-templates/:code/rollback",
      handlerToken: META_HANDLER_TOKENS.rollbackTemplate,
      authRequired: true,
      tags: ["approval", "templates", "versions"],
    });

    routes.add({
      method: "GET",
      path: "/api/approval-templates/:code/diff",
      handlerToken: META_HANDLER_TOKENS.diffTemplate,
      authRequired: true,
      tags: ["approval", "templates", "versions"],
    });

    routes.add({
      method: "GET",
      path: "/api/approval-templates/:code/impact",
      handlerToken: META_HANDLER_TOKENS.impactAnalysis,
      authRequired: true,
      tags: ["approval", "templates", "analysis"],
    });

    routes.add({
      method: "POST",
      path: "/api/approval-templates/:code/test-resolution",
      handlerToken: META_HANDLER_TOKENS.testResolution,
      authRequired: true,
      tags: ["approval", "templates", "testing"],
    });

    // ========================================================================
    // Overlay Routes (EPIC I)
    // ========================================================================

    routes.add({
      method: "GET",
      path: "/api/meta/entities/:entity/overlays",
      handlerToken: META_HANDLER_TOKENS.listOverlays,
      authRequired: true,
      tags: ["meta", "overlays"],
    });

    routes.add({
      method: "POST",
      path: "/api/meta/entities/:entity/overlays",
      handlerToken: META_HANDLER_TOKENS.createOverlay,
      authRequired: true,
      tags: ["meta", "overlays"],
    });

    routes.add({
      method: "GET",
      path: "/api/meta/entities/:entity/overlays/:id",
      handlerToken: META_HANDLER_TOKENS.getOverlay,
      authRequired: true,
      tags: ["meta", "overlays"],
    });

    routes.add({
      method: "PATCH",
      path: "/api/meta/entities/:entity/overlays/:id",
      handlerToken: META_HANDLER_TOKENS.updateOverlay,
      authRequired: true,
      tags: ["meta", "overlays"],
    });

    routes.add({
      method: "DELETE",
      path: "/api/meta/entities/:entity/overlays/:id",
      handlerToken: META_HANDLER_TOKENS.deleteOverlay,
      authRequired: true,
      tags: ["meta", "overlays"],
    });

    routes.add({
      method: "POST",
      path: "/api/meta/entities/:entity/overlays/preview",
      handlerToken: META_HANDLER_TOKENS.previewOverlay,
      authRequired: true,
      tags: ["meta", "overlays", "preview"],
    });

    routes.add({
      method: "POST",
      path: "/api/meta/entities/:entity/overlays/:id/validate",
      handlerToken: META_HANDLER_TOKENS.validateOverlay,
      authRequired: true,
      tags: ["meta", "overlays", "validation"],
    });

    routes.add({
      method: "GET",
      path: "/api/meta/entities/:entity/overlays/:id/changes",
      handlerToken: META_HANDLER_TOKENS.getChanges,
      authRequired: true,
      tags: ["meta", "overlays", "changes"],
    });

    routes.add({
      method: "POST",
      path: "/api/meta/entities/:entity/overlays/:id/changes",
      handlerToken: META_HANDLER_TOKENS.addChange,
      authRequired: true,
      tags: ["meta", "overlays", "changes"],
    });

    routes.add({
      method: "DELETE",
      path: "/api/meta/entities/:entity/overlays/:id/changes/:changeId",
      handlerToken: META_HANDLER_TOKENS.removeChange,
      authRequired: true,
      tags: ["meta", "overlays", "changes"],
    });

    routes.add({
      method: "POST",
      path: "/api/meta/entities/:entity/overlays/:id/changes/reorder",
      handlerToken: META_HANDLER_TOKENS.reorderChanges,
      authRequired: true,
      tags: ["meta", "overlays", "changes"],
    });

    // ========================================================================
    // SLA Timer Workers (approval reminders + escalations)
    // ========================================================================

    try {
      const jobQueue = await c.resolve<JobQueue>(TOKENS.jobQueue);
      const approvalService = await c.resolve<ApprovalService>(
        META_TOKENS.approvalService,
      );

      // Wire job queue into approval service for scheduling
      if (approvalService instanceof ApprovalServiceImpl) {
        approvalService.setJobQueue(jobQueue);
      }

      // Register SLA worker handlers
      await jobQueue.process(
        SLA_JOB_TYPES.REMINDER,
        3,
        createSlaReminderHandler(approvalService),
      );

      await jobQueue.process(
        SLA_JOB_TYPES.ESCALATION,
        3,
        createSlaEscalationHandler(approvalService),
      );
    } catch {
      // Job queue or approval service not registered — SLA workers disabled
    }

    // ========================================================================
    // Lifecycle Timer Workers (H4: Auto-Transitions)
    // ========================================================================

    try {
      const jobQueue = await c.resolve<JobQueue>(TOKENS.jobQueue);
      const timerService = await c.resolve<LifecycleTimerService>(
        META_TOKENS.lifecycleTimerService,
      );

      // Wire job queue into timer service for scheduling
      if (timerService instanceof LifecycleTimerServiceImpl) {
        timerService.setJobQueue(jobQueue);
      }

      // Register lifecycle timer worker handlers
      await jobQueue.process(
        TIMER_JOB_TYPES.AUTO_TRANSITION,
        5, // Higher concurrency for auto-transitions
        createAutoTransitionHandler(timerService),
      );

      console.log({ msg: "lifecycle_timer_workers_registered" });

      // Rehydrate timers after server restart
      // Note: This is a simple implementation that rehydrates all tenants
      // For production with many tenants, consider background rehydration
      try {
        // Get all tenant IDs from the database
        const db = await c.resolve<any>(TOKENS.db);
        const tenants = await db
          .selectFrom("core.tenant")
          .select("id")
          .execute();

        let totalRehydrated = 0;
        for (const tenant of tenants) {
          const count = await timerService.rehydrateTimers(tenant.id);
          totalRehydrated += count;
        }

        if (totalRehydrated > 0) {
          console.log({
            msg: "lifecycle_timers_rehydrated",
            count: totalRehydrated,
            tenantCount: tenants.length,
          });
        }
      } catch (error) {
        console.error({
          msg: "lifecycle_timer_rehydration_failed",
          error: String(error),
        });
      }
    } catch {
      // Job queue or timer service not registered — lifecycle timers disabled
    }
  },
};
