import { createHash } from "node:crypto";
import type {
  EmailProviderSuppressionControlPlane,
  EmailProviderTenantControlPlane,
  EmailProviderTenantDesiredState,
  EmailSuppressionChange,
  EmailSuppressionSyncResult,
  EmailTenantReconciliationResult,
} from "@athyper/server-contract-notifications";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESOURCE_NAME = /^[A-Za-z0-9_.:@/+\-=]{1,512}$/;

/** Stable provider name that cannot reveal an Athyper tenant UUID or display name. */
export function deterministicEmailProviderTenantName(tenantId: string): string {
  const canonical = uuid(tenantId, "tenantId");
  return `t-${sha256(`athyper-email-tenant\u0000${canonical}`).slice(0, 40)}`;
}

export function createEmailTenantProvisioner(controlPlane: EmailProviderTenantControlPlane) {
  return {
    async reconcile(input: Omit<EmailProviderTenantDesiredState, "providerTenantName">): Promise<EmailTenantReconciliationResult> {
      const tenantId = uuid(input.tenantId, "tenantId");
      const providerTenantName = deterministicEmailProviderTenantName(tenantId);
      const identityResourceName = resource(input.identity.resourceName, "identity resource");
      const configurationSetResourceName = resource(input.configurationSet.resourceName, "configuration-set resource");
      if (input.identity.verified !== true) throw new TypeError("Email identity must be verified before association");
      if (input.lifecycle !== "active" && input.lifecycle !== "suspended") throw new TypeError("Invalid email tenant lifecycle");
      const suppressionReasons = reasons(input.suppressionReasons);
      const desired = {
        providerTenantName,
        lifecycle: input.lifecycle,
        identityResourceName,
        configurationSetResourceName,
        suppressionReasons,
      } as const;
      const desiredStateHash = sha256(stable(desired));
      const current = await controlPlane.read(providerTenantName);
      const created = current === undefined;
      let changed = created;

      if (!current || current.lifecycle !== desired.lifecycle) {
        await controlPlane.ensureTenant({
          providerTenantName,
          lifecycle: desired.lifecycle,
          idempotencyKey: operationKey(desiredStateHash, "tenant"),
        });
        changed = true;
      }
      if (!current?.identityResourceNames.includes(identityResourceName)) {
        await controlPlane.ensureResourceAssociation({
          providerTenantName,
          resourceType: "identity",
          resourceName: identityResourceName,
          idempotencyKey: operationKey(desiredStateHash, "identity"),
        });
        changed = true;
      }
      if (!current?.configurationSetResourceNames.includes(configurationSetResourceName)) {
        await controlPlane.ensureResourceAssociation({
          providerTenantName,
          resourceType: "configuration_set",
          resourceName: configurationSetResourceName,
          idempotencyKey: operationKey(desiredStateHash, "configuration-set"),
        });
        changed = true;
      }
      if (!current || !same(current.suppressionReasons, suppressionReasons)) {
        await controlPlane.ensureSuppressionPolicy({
          providerTenantName,
          reasons: suppressionReasons,
          idempotencyKey: operationKey(desiredStateHash, "suppression-policy"),
        });
        changed = true;
      }

      return {
        providerTenantName,
        outcome: created ? "created" : changed ? "updated" : "unchanged",
        desiredStateHash,
      };
    },
  };
}

export function createEmailSuppressionSynchronizer(controlPlane: EmailProviderSuppressionControlPlane) {
  return {
    async synchronize(change: EmailSuppressionChange): Promise<EmailSuppressionSyncResult> {
      const tenantId = uuid(change.tenantId, "tenantId");
      const recipientAddress = email(change.recipientAddress);
      const sourceEventId = bounded(change.sourceEventId, "sourceEventId", 512);
      if (change.operation !== "suppress" && change.operation !== "release") throw new TypeError("Invalid suppression operation");
      if (change.reason !== "bounce" && change.reason !== "complaint") throw new TypeError("Invalid suppression reason");
      const providerTenantName = deterministicEmailProviderTenantName(tenantId);
      const recipientRef = `sha256:${sha256(recipientAddress)}`;
      const idempotencyKey = `suppression-${sha256(stable({
        tenantId,
        recipientRef,
        operation: change.operation,
        reason: change.reason,
        sourceEventId,
      }))}`;
      const result = await controlPlane.apply({
        providerTenantName,
        recipientAddress,
        operation: change.operation,
        reason: change.reason,
        idempotencyKey,
      });
      return { providerTenantName, recipientRef, operation: change.operation, changed: result.changed };
    },
  };
}

function operationKey(hash: string, operation: string) { return `email-tenant-${operation}-${hash}`; }
function reasons(values: readonly string[]) {
  const result = [...new Set(values)];
  if (result.some((value) => value !== "bounce" && value !== "complaint")) throw new TypeError("Invalid suppression reason");
  return result.sort() as ("bounce" | "complaint")[];
}
function same(left: readonly string[], right: readonly string[]) {
  return [...left].sort().join("\u0000") === [...right].sort().join("\u0000");
}
function uuid(value: string, name: string) { const result = value.trim().toLowerCase(); if (!UUID.test(result)) throw new TypeError(`Invalid ${name}`); return result; }
function resource(value: string, name: string) { const result = value.trim(); if (!RESOURCE_NAME.test(result)) throw new TypeError(`Invalid ${name}`); return result; }
function bounded(value: string, name: string, max: number) { const result = value.trim(); if (!result || Buffer.byteLength(result, "utf8") > max) throw new TypeError(`Invalid ${name}`); return result; }
function email(value: string) { const result = value.trim().toLowerCase(); if (result.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new TypeError("Invalid suppression recipient"); return result; }
function sha256(value: string) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  return JSON.stringify(value);
}
