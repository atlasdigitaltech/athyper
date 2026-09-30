import { describe, expect, it, vi } from "vitest";
import {
  CreateTenantCommand,
  CreateTenantResourceAssociationCommand,
  DeleteSuppressedDestinationCommand,
  GetSuppressedDestinationCommand,
  GetTenantCommand,
  ListTenantResourcesCommand,
  PutSuppressedDestinationCommand,
  PutTenantSuppressionAttributesCommand,
} from "@aws-sdk/client-sesv2";
import { createSesTenantControlPlaneAdapter } from "../ses-tenant-control-plane.adapter.js";

describe("SES tenant control plane adapter", () => {
  it("reads native tenant resources and suppression state", async () => {
    const send = vi.fn(async command => {
      if (command instanceof GetTenantCommand) return { Tenant: { TenantName: "t-safe", SendingStatus: "ENABLED", SuppressionAttributes: { SuppressedReasons: ["BOUNCE"] } } };
      if (command instanceof ListTenantResourcesCommand) return { TenantResources: [
        { ResourceType: "EMAIL_IDENTITY", ResourceArn: "arn:aws:ses:ap-southeast-1:123456789012:identity/notify.stg.athyper.com" },
        { ResourceType: "CONFIGURATION_SET", ResourceArn: "arn:aws:ses:ap-southeast-1:123456789012:configuration-set/athyper-stg" },
      ] };
      throw new Error("unexpected command");
    });
    const adapter = createSesTenantControlPlaneAdapter({ region: "ap-southeast-1", client: { send } });

    await expect(adapter.read("t-safe")).resolves.toEqual(expect.objectContaining({
      lifecycle: "active",
      suppressionReasons: ["bounce"],
      identityResourceNames: [expect.stringContaining(":identity/")],
      configurationSetResourceNames: [expect.stringContaining(":configuration-set/")],
    }));
  });

  it("issues native tenant, association, and policy commands", async () => {
    const send = vi.fn().mockResolvedValue({});
    const adapter = createSesTenantControlPlaneAdapter({ region: "ap-southeast-1", client: { send } });
    await adapter.ensureTenant({ providerTenantName: "t-safe", lifecycle: "active", idempotencyKey: "one" });
    await adapter.ensureResourceAssociation({ providerTenantName: "t-safe", resourceType: "identity", resourceName: "arn:aws:ses:ap-southeast-1:123456789012:identity/notify.stg.athyper.com", idempotencyKey: "two" });
    await adapter.ensureSuppressionPolicy({ providerTenantName: "t-safe", reasons: ["bounce", "complaint"], idempotencyKey: "three" });
    expect(send.mock.calls.some(([command]) => command instanceof CreateTenantCommand)).toBe(true);
    expect(send.mock.calls.some(([command]) => command instanceof CreateTenantResourceAssociationCommand)).toBe(true);
    expect(send.mock.calls.some(([command]) => command instanceof PutTenantSuppressionAttributesCommand)).toBe(true);
  });

  it("synchronizes tenant suppressions idempotently", async () => {
    const send = vi.fn(async command => {
      if (command instanceof GetSuppressedDestinationCommand) return {};
      return {};
    });
    const adapter = createSesTenantControlPlaneAdapter({ region: "ap-southeast-1", client: { send } });
    await expect(adapter.apply({ providerTenantName: "t-safe", recipientAddress: "canary@example.test", operation: "suppress", reason: "complaint", idempotencyKey: "one" })).resolves.toEqual({ changed: true });
    expect(send.mock.calls.some(([command]) => command instanceof PutSuppressedDestinationCommand)).toBe(true);
    expect(send.mock.calls.some(([command]) => command instanceof DeleteSuppressedDestinationCommand)).toBe(false);
  });
});
