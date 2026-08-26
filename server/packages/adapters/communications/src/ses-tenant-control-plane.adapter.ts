import {
  CreateTenantCommand,
  CreateTenantResourceAssociationCommand,
  DeleteSuppressedDestinationCommand,
  GetSuppressedDestinationCommand,
  GetTenantCommand,
  ListTenantResourcesCommand,
  PutSuppressedDestinationCommand,
  PutTenantSuppressionAttributesCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import type {
  EmailProviderSuppressionControlPlane,
  EmailProviderTenantControlPlane,
  EmailProviderTenantSnapshot,
  EmailSuppressionReason,
} from "@athyper/server-contract-notifications";

export interface SesTenantControlPlaneClient {
  send(command: unknown): Promise<any>;
  destroy?(): void;
}

export interface SesTenantControlPlaneAdapter extends
  EmailProviderTenantControlPlane,
  EmailProviderSuppressionControlPlane {
  close(): void;
}

/** AWS SES v2 native-tenant administration adapter for a dedicated control-plane workload. */
export function createSesTenantControlPlaneAdapter(input: {
  readonly region: string;
  readonly client?: SesTenantControlPlaneClient;
}): SesTenantControlPlaneAdapter {
  const region = required(input.region, "SES tenant region");
  const client = input.client ?? new SESv2Client({ region });

  return {
    async read(providerTenantName): Promise<EmailProviderTenantSnapshot | undefined> {
      let tenant: any;
      try {
        tenant = (await client.send(new GetTenantCommand({ TenantName: providerTenantName }))).Tenant;
      } catch (error) {
        if (notFound(error)) return undefined;
        throw error;
      }
      if (!tenant?.TenantName) return undefined;
      const resources: Array<{ ResourceType?: string; ResourceArn?: string }> = [];
      let nextToken: string | undefined;
      do {
        const page = await client.send(new ListTenantResourcesCommand({
          TenantName: providerTenantName,
          ...(nextToken ? { NextToken: nextToken } : {}),
        }));
        resources.push(...(page.TenantResources ?? []));
        nextToken = page.NextToken;
      } while (nextToken);
      return {
        providerTenantName: tenant.TenantName,
        lifecycle: tenant.SendingStatus === "DISABLED" ? "suspended" : "active",
        identityResourceNames: resourceArns(resources, "EMAIL_IDENTITY"),
        configurationSetResourceNames: resourceArns(resources, "CONFIGURATION_SET"),
        suppressionReasons: fromAwsReasons(tenant.SuppressionAttributes?.SuppressedReasons),
      };
    },
    async ensureTenant(command) {
      // SES exposes tenant sending status as provider-managed reputation state;
      // it does not expose a tenant enable/disable mutation. Never pretend that a
      // requested suspension was enforced.
      if (command.lifecycle === "suspended") throw new Error("SES_TENANT_SUSPENSION_NOT_SUPPORTED");
      try {
        await client.send(new CreateTenantCommand({
          TenantName: command.providerTenantName,
          Tags: [{ Key: "athyper-managed", Value: "true" }],
        }));
      } catch (error) {
        if (!alreadyExists(error)) throw error;
      }
    },
    async ensureResourceAssociation(command) {
      await client.send(new CreateTenantResourceAssociationCommand({
        TenantName: command.providerTenantName,
        ResourceArn: arn(command.resourceName),
      }));
    },
    async ensureSuppressionPolicy(command) {
      await client.send(new PutTenantSuppressionAttributesCommand({
        TenantName: command.providerTenantName,
        SuppressionScope: "TENANT",
        SuppressedReasons: toAwsReasons(command.reasons),
      }));
    },
    async apply(command) {
      let existing: any;
      try {
        existing = (await client.send(new GetSuppressedDestinationCommand({
          TenantName: command.providerTenantName,
          EmailAddress: command.recipientAddress,
        }))).SuppressedDestination;
      } catch (error) {
        if (!notFound(error)) throw error;
      }
      if (command.operation === "release") {
        if (!existing) return { changed: false };
        await client.send(new DeleteSuppressedDestinationCommand({
          TenantName: command.providerTenantName,
          EmailAddress: command.recipientAddress,
        }));
        return { changed: true };
      }
      const desiredReason = command.reason === "bounce" ? "BOUNCE" : "COMPLAINT";
      if (existing?.Reason === desiredReason) return { changed: false };
      await client.send(new PutSuppressedDestinationCommand({
        TenantName: command.providerTenantName,
        EmailAddress: command.recipientAddress,
        Reason: desiredReason,
      }));
      return { changed: true };
    },
    close() { client.destroy?.(); },
  };
}

function resourceArns(resources: Array<{ ResourceType?: string; ResourceArn?: string }>, type: string) {
  return resources.filter(item => item.ResourceType === type && item.ResourceArn).map(item => item.ResourceArn!);
}
function toAwsReasons(reasons: readonly EmailSuppressionReason[]) {
  return reasons.map(reason => reason === "bounce" ? "BOUNCE" as const : "COMPLAINT" as const);
}
function fromAwsReasons(reasons?: readonly string[]): EmailSuppressionReason[] {
  return (reasons ?? []).flatMap(reason => reason === "BOUNCE" ? ["bounce" as const] : reason === "COMPLAINT" ? ["complaint" as const] : []);
}
function required(value: string, name: string) { const result = value.trim(); if (!result) throw new TypeError(`${name} is required`); return result; }
function arn(value: string) { const result = value.trim(); if (!/^arn:aws[a-z-]*:ses:[a-z0-9-]+:\d{12}:(identity|configuration-set)\/.+$/.test(result)) throw new TypeError("SES tenant resource must be an identity or configuration-set ARN"); return result; }
function errorName(error: unknown) { return typeof error === "object" && error !== null && "name" in error ? String(error.name) : ""; }
function notFound(error: unknown) { return errorName(error) === "NotFoundException"; }
function alreadyExists(error: unknown) { return errorName(error) === "AlreadyExistsException" || errorName(error) === "ConflictException"; }
