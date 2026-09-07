import { randomUUID } from "node:crypto";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import { compliancePermissions, type LegalHold, type LegalHoldRepository, type LegalHoldRetentionAdapter, type LegalHoldService } from "@athyper/server-contract-governance";
import type { ExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";

export function createLegalHoldService(options: { readonly authorizer: Authorizer; readonly repositories: ExactPlaneRepositoryProvider<LegalHoldRepository>; readonly retention: LegalHoldRetentionAdapter; readonly now?: () => Date; readonly createId?: () => string }): LegalHoldService {
  const now = () => options.now?.() ?? new Date();
  const id = () => options.createId?.() ?? randomUUID();
  const load = async (context: VerifiedRequestContext, holdId: string, repository = options.repositories.require(context.planeKey)) => {
    const hold = await repository.get(context.tenantId, holdId);
    if (!hold) throw coded("GOVERNANCE_NOT_FOUND");
    return hold;
  };
  return {
    async createDraft(command) {
      await permit(options.authorizer, command.context);
      const repository = options.repositories.require(command.context.planeKey);
      const issuedAt = command.issuedAt ? instant(command.issuedAt, "issuedAt") : undefined;
      const code = command.code.trim().toUpperCase();
      if (!/^[A-Z][A-Z0-9_.-]{1,62}$/u.test(code)) throw coded("GOVERNANCE_INVALID_COMMAND", { field: "code" });
      return repository.createDraft({ id: id(), tenantId: command.context.tenantId, code, name: required(command.name, "name"), ...(command.description?.trim() ? { description: command.description.trim() } : {}), ...(command.legalAuthority?.trim() ? { legalAuthority: command.legalAuthority.trim() } : {}), ...(issuedAt ? { issuedAt } : {}), ...(command.ownerPrincipalId ? { ownerPrincipalId: command.ownerPrincipalId } : {}), status: "draft", createdAt: now().toISOString(), createdBy: command.context.principalId });
    },
    async addResource(command) {
      await permit(options.authorizer, command.context);
      return options.repositories.require(command.context.planeKey).withHoldLock(command.context.tenantId, command.holdId, async (repository) => {
      validateResource(command.resource);
      const hold = await load(command.context, command.holdId, repository);
      if (hold.status !== "draft" && hold.status !== "active") throw coded("GOVERNANCE_INVALID_TRANSITION");
      if (hold.resources.some((item) => !item.releasedAt && item.kind === command.resource.kind && item.resourceId === command.resource.resourceId && item.uri === command.resource.uri)) throw coded("GOVERNANCE_INVALID_COMMAND", { field: "resource", reason: "duplicate_manifest_entry" });
      const resource = await repository.addResource(hold.tenantId, hold.id, { ...command.resource, id: id(), capturedAt: now().toISOString() }, command.context.principalId);
      if (hold.status === "active") await options.retention.apply({ context: command.context, hold, resource, effectiveAt: hold.effectiveAt! });
      return resource;
      });
    },
    async removeResource(context, holdId, resourceId) {
      await permit(options.authorizer, context);
      return options.repositories.require(context.planeKey).withHoldLock(context.tenantId, holdId, async (repository) => {
      const hold = await load(context, holdId, repository);
      if (hold.status !== "draft") throw coded("GOVERNANCE_INVALID_TRANSITION", { policy: "A manifest may only be reduced while its hold is draft" });
      if (!await repository.removeDraftResource(context.tenantId, holdId, resourceId)) throw coded("GOVERNANCE_NOT_FOUND");
      });
    },
    async activate(context, holdId, requestedEffectiveAt) {
      await permit(options.authorizer, context);
      return options.repositories.require(context.planeKey).withHoldLock(context.tenantId, holdId, async (repository) => {
      const hold = await load(context, holdId, repository);
      if (hold.status !== "draft") throw coded("GOVERNANCE_INVALID_TRANSITION");
      const effectiveAt = requestedEffectiveAt ? instant(requestedEffectiveAt, "effectiveAt") : now().toISOString();
      if (new Date(effectiveAt) > now()) throw coded("GOVERNANCE_INVALID_COMMAND", { field: "effectiveAt", reason: "future" });
      if (hold.issuedAt && new Date(effectiveAt) < new Date(hold.issuedAt)) throw coded("GOVERNANCE_INVALID_COMMAND", { field: "effectiveAt", reason: "before_issued_at" });
      if (hold.resources.length === 0) throw coded("GOVERNANCE_INVALID_COMMAND", { field: "manifest", reason: "empty" });
      for (const resource of hold.resources) await options.retention.apply({ context, hold, resource, effectiveAt });
      const activated = await repository.activate(context.tenantId, holdId, context.principalId, effectiveAt);
      if (!activated) throw coded("GOVERNANCE_INVALID_TRANSITION");
      return activated;
      });
    },
    async release(context, holdId, requestedReleasedAt) {
      await permit(options.authorizer, context);
      return options.repositories.require(context.planeKey).withHoldLock(context.tenantId, holdId, async (repository) => {
      const hold = await load(context, holdId, repository);
      if (hold.status !== "active") throw coded("GOVERNANCE_INVALID_TRANSITION");
      const releasedAt = requestedReleasedAt ? instant(requestedReleasedAt, "releasedAt") : now().toISOString();
      if (new Date(releasedAt) > now() || new Date(releasedAt) < new Date(hold.effectiveAt!)) throw coded("GOVERNANCE_INVALID_COMMAND", { field: "releasedAt" });
      for (const resource of hold.resources.filter((item) => !item.releasedAt)) await options.retention.release({ context, hold, resource, releasedAt });
      const released = await repository.release(context.tenantId, holdId, context.principalId, releasedAt);
      if (!released) throw coded("GOVERNANCE_INVALID_TRANSITION");
      return released;
      });
    },
    async get(context, holdId) { await permit(options.authorizer, context); return load(context, holdId); },
  };
}

function validateResource(resource: { readonly resourceId?: string; readonly uri?: string }): void { if (!resource.resourceId && !resource.uri?.trim()) throw coded("GOVERNANCE_INVALID_COMMAND", { field: "resource" }); }
function required(value: string, field: string): string { const result = value.trim(); if (!result) throw coded("GOVERNANCE_INVALID_COMMAND", { field }); return result; }
function instant(value: string, field: string): string { const parsed = new Date(value); if (!Number.isFinite(parsed.getTime())) throw coded("GOVERNANCE_INVALID_COMMAND", { field }); return parsed.toISOString(); }
async function permit(authorizer: Authorizer, context: VerifiedRequestContext): Promise<void> { if (!(await authorizer.authorize({ context, permissionCode: compliancePermissions.legalHoldManage })).allowed) throw coded("GOVERNANCE_PERMISSION_DENIED"); }
function coded(code: string, details?: unknown): Error { return Object.assign(new Error(code), { code, details }); }
