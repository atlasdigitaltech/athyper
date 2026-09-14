import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DurableGraphPreviewStore } from "../../../server/packages/planes/studio/meta-entity-authoring/src/durable-graph-preview.js";
import { readLocalGraphProjections } from "../../../server/packages/foundation/src/local-graph-preview.js";
import { compileNativeRuntimeProjection } from "../../../server/packages/platform/metadata/src/native-runtime-projection.js";
import { createMetadataService } from "../../../server/packages/platform/metadata/src/metadata-service.js";
import { overlayLocalGraphBindings } from "../../../server/packages/platform/iam/src/local-graph-bindings.js";
import { snapshotFromEvidence } from "../../../server/packages/platform/iam/src/kysely-permission-resolver.js";
import { createPermissionAuthorizer } from "../../../server/packages/platform/iam/src/permission-authorizer.js";

const profile = JSON.parse(
  readFileSync(
    new URL(
      "../../../packages/contracts/platform/fixtures/entity-authorization/company-invoice.v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
function projection() {
  const fields = [
    ...new Set<string>(
      profile.fieldPolicies.flatMap((policy: any) => policy.fields),
    ),
  ];
  const native = {
    entity: { entityCode: profile.entityCode },
    authorization: profile,
    fields: fields.map((key) => ({
      id: key,
      fieldKey: key,
      storagePath: key,
      dataType: "string",
      valueOrigin: "stored",
      writeMode: "read_only",
    })),
    operations: profile.operations.map((op: any) => ({
      id: op.key,
      operationKey: op.key,
    })),
    operationPermissions: profile.operations.map((op: any) => ({
      entityOperationId: op.key,
      targetPlane: "neon",
      permissionCode: op.permissionCode,
    })),
    operationScopeBindings: profile.operations.map((op: any) => ({
      entityOperationId: op.key,
      targetPlane: "neon",
      scopeKind: "company_code",
    })),
  };
  const registration = {
    entityCode: profile.entityCode,
    plane: "neon" as const,
    storage: {
      schema: "document",
      object: "invoice",
      idField: "id",
      tenantField: "tenant_id",
    },
    columns: fields,
  };
  const permissions = [
    ...new Map(
      profile.operations.map((op: any) => [
        op.permissionCode,
        { code: op.permissionCode, scopeKinds: ["company_code"] },
      ]),
    ).values(),
  ] as any[];
  const descriptor = compileNativeRuntimeProjection({
    native,
    registration,
    permissions,
  });
  const operationBindings = profile.operations.map((op: any) => ({
    entityCode: profile.entityCode,
    operationKey: op.key,
    permissionCode: op.permissionCode,
    decisionMode: "authorize",
    requiredScopeKinds: ["company_code"],
  }));
  return { descriptor, operationBindings, native, registration, permissions };
}

test("native projection rejects missing catalog/storage and unsupported policy lowering", () => {
  const { native, registration, permissions } = projection();
  assert.throws(
    () =>
      compileNativeRuntimeProjection({ native, registration, permissions: [] }),
    /CATALOG_REQUIRED/,
  );
  assert.throws(
    () =>
      compileNativeRuntimeProjection({
        native,
        registration: { ...registration, columns: [] },
        permissions,
      }),
    /STORAGE_COLUMN_MISSING/,
  );
  assert.throws(
    () =>
      compileNativeRuntimeProjection({
        native: { ...native, lifecycleBindings: [{ bindingKey: "status" }] },
        registration,
        permissions,
      }),
    /ADAPTER_REQUIRED/,
  );
});

test("signed metadata and authorization remain pinned through a concurrent activation; grants still deny", async () => {
  const root = mkdtempSync(join(tmpdir(), "graph-preview-integration-"));
  const names = [
    "ATHYPER_ENV",
    "ATHYPER_LOCAL_WORKSPACE",
    "ATHYPER_DOMAIN_SUFFIX",
    "ATHYPER_LOCAL_PREVIEW_ROOT",
  ];
  const original = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, {
    ATHYPER_ENV: "local",
    ATHYPER_LOCAL_WORKSPACE: "1",
    ATHYPER_DOMAIN_SUFFIX: "dev.athyper.test",
    ATHYPER_LOCAL_PREVIEW_ROOT: root,
  });
  const keys = generateKeyPairSync("ed25519"),
    publicKey = keys.publicKey
      .export({ format: "pem", type: "spki" })
      .toString(),
    privateKey = keys.privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString();
  writeFileSync(join(root, "public.pem"), publicKey);
  const store = new DurableGraphPreviewStore(
    join(root, "meta-entity.sqlite"),
    publicKey,
  );
  try {
    const { descriptor, operationBindings } = projection();
    const identity = {
      planeKey: "neon" as const,
      tenantId: "44444444-4444-4444-8444-444444444444",
      principalId: "11111111-1111-4111-8111-111111111111",
      realmKey: "athyper",
      authEpoch: 1,
    };
    const first = store.claim({
      tenantId: identity.tenantId,
      entityCode: profile.entityCode,
      changeSetId: "22222222-2222-4222-8222-222222222222",
      revision: 1,
      graphHash: "a".repeat(64),
    });
    store.commit(
      first,
      store.seal(
        first,
        { neon: { descriptor, operationBindings } },
        privateKey,
      ),
    );
    const previews = readLocalGraphProjections(identity.tenantId, "neon");
    const pins = Object.fromEntries(
      previews.map((preview) => [preview.entityCode, preview.artifactHash]),
    );
    const bindings = overlayLocalGraphBindings([], previews);
    const permissionCode = descriptor.operations["read"]!.permissionCode;
    const evidence = [
      {
        permissionCode,
        effect: "allow" as const,
        proof: "role" as const,
        scopeTargetId: "scope",
        scopeKind: "company_code",
        targetId: "company-A",
        propagationMode: "exact" as const,
      },
    ];
    const permissions = {
      ...snapshotFromEvidence(identity, evidence, Date.now(), [], bindings),
      localGraphPreview: pins,
    };
    const context = {
      ...identity,
      permissions,
      profileHash: permissions.profileHash,
      requestId: "test",
    };
    const metadata = createMetadataService({
      repository: {
        findActive: async () => {
          throw Error("Preview incorrectly fell back to database");
        },
      },
    });
    const prior = await metadata.getEntityDescriptor(
      context,
      profile.entityCode,
    );
    const next = store.claim({
      ...first,
      revision: 2,
      graphHash: "b".repeat(64),
    });
    store.commit(
      next,
      store.seal(
        next,
        {
          neon: {
            descriptor: {
              ...descriptor,
              fields: descriptor.fields.map((field) => ({
                ...field,
                list: { ...field.list, label: "Updated" },
              })),
            },
            operationBindings,
          },
        },
        privateKey,
      ),
    );
    assert.equal(
      (await metadata.getEntityDescriptor(context, profile.entityCode))
        ?.compiledHash,
      prior?.compiledHash,
    );
    assert.notEqual(
      readLocalGraphProjections(identity.tenantId, "neon")[0]?.artifactHash,
      previews[0]?.artifactHash,
    );
    assert.equal(readLocalGraphProjections("other-tenant", "neon").length, 0);
    assert.throws(
      () => readLocalGraphProjections("other-tenant", "neon", pins),
      /COORDINATE_MISMATCH/,
    );
    const authorizer = createPermissionAuthorizer();
    const resource = {
      tenantId: identity.tenantId,
      entityCode: profile.entityCode,
      operationKey: "read",
      companyCodeId: "company-A",
    };
    assert.equal(
      (await authorizer.authorize({ context, permissionCode, resource }))
        .allowed,
      true,
    );
    assert.equal(
      (
        await authorizer.authorize({
          context,
          permissionCode,
          resource: { ...resource, companyCodeId: "company-B" },
        })
      ).allowed,
      false,
    );
    const revoked = {
      ...context,
      permissions: snapshotFromEvidence(identity, [], Date.now(), [], bindings),
    };
    assert.equal(
      (
        await authorizer.authorize({
          context: revoked,
          permissionCode,
          resource,
        })
      ).allowed,
      false,
    );
    // Recovery republishes compatible metadata under a newer local revision.
    // It never restores an old permission snapshot alongside the artifact.
    const recovery = store.claim({
      ...first,
      revision: 3,
      graphHash: "c".repeat(64),
    });
    store.commit(
      recovery,
      store.seal(
        recovery,
        { neon: { descriptor, operationBindings } },
        privateKey,
      ),
    );
    const recovered = readLocalGraphProjections(identity.tenantId, "neon");
    const recoveredBindings = overlayLocalGraphBindings([], recovered);
    const recoveredPermissions = {
      ...snapshotFromEvidence(identity, [], Date.now(), [], recoveredBindings),
      localGraphPreview: Object.fromEntries(
        recovered.map((preview) => [preview.entityCode, preview.artifactHash]),
      ),
    };
    const recoveredContext = {
      ...context,
      permissions: recoveredPermissions,
      profileHash: recoveredPermissions.profileHash,
    };
    const recoveredDescriptor = await metadata.getEntityDescriptor(
      recoveredContext,
      profile.entityCode,
    );
    assert.deepEqual(recoveredDescriptor?.fields, prior?.fields);
    assert.deepEqual(recoveredDescriptor?.operations, prior?.operations);
    assert.notEqual(recoveredDescriptor?.compiledHash, prior?.compiledHash);
    assert.equal(
      (
        await authorizer.authorize({
          context: recoveredContext,
          permissionCode,
          resource,
        })
      ).allowed,
      false,
    );
    const removed = overlayLocalGraphBindings(bindings, [
      {
        ...previews[0]!,
        projection: { descriptor: { operations: {} }, operationBindings: [] },
      },
    ]);
    assert.equal(removed.length, 0);
  } finally {
    store.close();
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("registered presentation survives absent native surfaces and explicit native bindings override it", () => {
  const { native, registration, permissions } = projection();
  const field = native.fields[0]!;
  const registered = {
    ...registration,
    fieldPresentationDefaults: {
      [field.fieldKey]: {
        label: "Existing label",
        defaultOrder: 1,
        defaultVisible: true,
      },
    },
  };
  const first = compileNativeRuntimeProjection({
    native,
    registration: registered,
    permissions,
  });
  assert.equal(first.fields[0]!.list.label, "Existing label");
  assert.equal(first.fields[0]!.list.defaultVisible, true);
  const edited = {
    ...native,
    surfaces: [{ id: "list", surfaceKind: "list", isDefault: true }],
    surfaceFieldBindings: [
      {
        entitySurfaceId: "list",
        entityFieldId: field.id,
        labelOverride: "New label",
        position: 2,
      },
    ],
  };
  const second = compileNativeRuntimeProjection({
    native: edited,
    registration: registered,
    permissions,
  });
  assert.equal(second.fields[0]!.list.label, "New label");
  assert.equal(second.fields[0]!.list.defaultOrder, 2);
  assert.deepEqual(first.authorization, second.authorization);
});

test("invoice choice surfaces traverse the native compiler without adding stored fields or grants", async () => {
  const { withIntakeChoiceSurface, invoiceClassificationSurface } = await import("../../../server/db/scripts/provisioning/intake-choice-surfaces.js");
  const { native, registration, permissions, descriptor: before } = projection();
  const graph = withIntakeChoiceSurface(native as any, invoiceClassificationSurface);
  const after = compileNativeRuntimeProjection({native: graph as any, registration, permissions});
  assert.equal(after.intakeSurfaces?.[0]?.sections[0]?.fields[0]?.control, "choiceCards");
  assert.deepEqual(after.fields, before.fields);
  assert.deepEqual(after.authorization, before.authorization);
  assert.deepEqual(after.operations, before.operations);
  const unbound = {...graph, fields:[...graph.fields,{id:"orphan",fieldKey:"orphan",dataType:"enum",typeConfig:{kind:"enum"},valueOrigin:"runtime",writeMode:"mutable"}]};
  assert.throws(()=>compileNativeRuntimeProjection({native:unbound,registration,permissions}), /FIELD_ADAPTER_REQUIRED/);
});
