import { expect, it, vi } from "vitest";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { parseEntityRecordPresentation } from "@athyper/contract-platform-entity-runtime";
import { createEntityListService } from "./entity-list-service.js";
import { entityAuthorizationProfileHash } from "./entity-authorization-rollout.js";

it.each(["plain", "masked", "denied"] as const)(
  "protects enum options and header badges for %s fields",
  async (representation) => {
    const localization = {
      fields: {},
      options: {
        status: {
          active: {
            labelKey: "status.active",
            defaultText: "Sensitive option",
          },
        },
      },
    };
    const descriptor = {
      schema: "athyper.entity-runtime-descriptor/1.0",
      entityCode: "sample",
      planeKey: "neon",
      releaseId: "release",
      releaseNo: 1,
      contractHash: "a".repeat(64),
      compiledHash: "b".repeat(64),
      storage: { schema: "shared", object: "sample", idField: "id" },
      fields: [
        {
          key: "id",
          storagePath: "id",
          type: "uuid",
          required: true,
          writableOn: [],
        },
        {
          key: "status",
          storagePath: "status",
          type: "enum",
          required: true,
          writableOn: [],
          filterable: true,
          list: { semanticRole: "status", statusTones: { active: "success" } },
          validation: {
            options: ["active"],
            optionLabels: { active: "Sensitive option" },
          },
        },
      ],
      operations: {
        list: { code: "list", permissionCode: "sample.read" },
        read: { code: "read", permissionCode: "sample.read" },
      },
      transitions: [],
      listPresentation: { localizedLabels: localization },
      recordPresentation: parseEntityRecordPresentation({
        schemaVersion: 1,
        titleField: "id",
        localizedLabels: localization,
        badges: [{ field: "status", tones: { active: "success" } }],
        sections: [
          { key: "overview", label: "Overview", fields: ["id", "status"] },
        ],
      }),
      authorization: {
        schemaVersion: 1,
        entityCode: "sample",
        planeKey: "neon",
        ownership: "tenant.record.v1",
        directory: { operation: "list", population: "tenant" },
        recordReadOperation: "read",
        operations: ["list", "read"].map((key) => ({
          key,
          permissionCode: "sample.read",
          scope: "tenant.record.v1",
          target: key === "list" ? "collection" : "existing",
          effect: "read",
          requiresParentRead: false,
          requiresPreflight: false,
        })),
        fieldPolicies: [
          {
            key: "identity",
            fields: ["id"],
            readOperation: "read",
            representation: "plain",
            writeOperations: [],
            queryUses: [],
          },
          {
            key: "status",
            fields: ["status"],
            readOperation: "read",
            representation: representation === "masked" ? "masked" : "plain",
            writeOperations: [],
            queryUses: representation === "masked" ? [] : ["filter"],
          },
        ],
        surfaces: [],
        relationships: [],
      },
    } as unknown as EntityRuntimeDescriptor;
    const filterChoices = vi.fn(async () => ({}));
    const context = {
      tenantId: "tenant",
      principalId: "actor",
      planeKey: "neon",
      realmKey: "realm",
      authEpoch: 1,
      profileHash: "profile",
      requestId: "request",
      permissions: { principalFingerprint: "actor" },
    } as never;
    const service = createEntityListService({
      metadata: { getEntityDescriptor: async () => descriptor },
      listExecutor: {} as never,
      authorizer: {
        authorize: async (input: any) =>
          representation === "denied" && input.resource?.field === "status"
            ? { allowed: false, reason: "missing_permission" }
            : { allowed: true },
        enforcedEntityProfile: () =>
          entityAuthorizationProfileHash(descriptor.authorization!),
      } as never,
      filterChoices,
    });
    const detail = await service.detailDescriptor(context, "sample");
    const list = await service.descriptor(
      context,
      "sample",
      undefined,
      "status",
    );
    if (representation === "plain") {
      expect(
        detail.fields.find((field) => field.key === "status")?.options,
      ).toEqual([{ value: "active", label: "Sensitive option" }]);
      expect(detail.presentation?.badges).toHaveLength(1);
      expect(
        list.fields.find((field) => field.key === "status")?.filterOperators,
      ).toContain("eq");
      expect(
        list.fields.find((field) => field.key === "status")?.filterOperators,
      ).not.toContain("contains");
    } else {
      expect(JSON.stringify(detail)).not.toContain("Sensitive option");
      expect(JSON.stringify(list)).not.toContain("Sensitive option");
      expect(detail.presentation?.badges).toEqual([]);
      expect(
        list.fields.find((field) => field.key === "status")?.statusTones,
      ).toBeUndefined();
      expect(filterChoices).not.toHaveBeenCalled();
    }
  },
);
