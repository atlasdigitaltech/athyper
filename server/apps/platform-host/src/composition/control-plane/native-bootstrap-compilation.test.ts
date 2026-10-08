import { compileNativeRuntimeProjection } from "@athyper/server-platform-metadata";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  buildNativeReferenceProduct,
  parseSharedReferenceProduct,
  compileNativeRelease,
  sha256,
  type NativeReferenceProductInput,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import { assembleNativeBootstrapCompilation } from "./native-bootstrap-compilation.js";
// Real maintained definitions and production resolvers. Synthetic external storage
// and component contracts isolate compiler coverage; not installed DEV evidence.
it.each(["country", "state_region"])(
  "compiles the complete %s graph with production runtime registrations",
  (name) => {
    const product = parseSharedReferenceProduct(
      JSON.parse(
        readFileSync(
          new URL(
            "../../../../../../metadata/entities/common/reference/" +
              name +
              "/definition.json",
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    );
    const resource = {
      owner: "test",
      key: "test",
      version: 1,
      hash: "c".repeat(64),
    };
    const displays = Object.fromEntries(
      ["string", "enum", "boolean", "datetime"].map((k) => [k, randomUUID()]),
    );
    const input: NativeReferenceProductInput = {
      product,
      entityId: randomUUID(),
      changeSetId: randomUUID(),
      authorId: randomUUID(),
      createdAt: "2026-10-09T00:00:00.000Z",
      authoringSchemaHash: "a".repeat(64),
      catalogue: {
        hash: "b".repeat(64),
        plane: "studio",
        schema: "shared",
        object: product.definition.storageObject,
        columns: product.definition.fields.map((f) => ({
          path: f.key,
          storageType:
            f.type === "datetime"
              ? "timestamptz"
              : f.type === "enum"
                ? "text"
                : f.type === "string"
                  ? "text"
                  : f.type,
          nullable: !f.required,
          supportedDataTypes: [f.type],
          cardinalities: ["one"],
        })),
      },
      components: {
        list: randomUUID(),
        detail: randomUUID(),
        displays: { list: displays, detail: displays },
      },
      targets: [],
    };
    const targets = product.definition.fields.flatMap((f) =>
      f.keyReference
        ? [
            {
              entityId:
                f.keyReference.targetEntity === product.definition.entityCode
                  ? input.entityId
                  : randomUUID(),
              entityCode: f.keyReference.targetEntity,
              keyKey: "code",
              fieldKeys: f.keyReference.fields.map((m) => m.target),
              labelFieldKey: f.keyReference.labelField,
              resource,
            },
          ]
        : [],
    );
    input.targets = targets;
    const graph = buildNativeReferenceProduct(input);
    const command = {
      entityId: input.entityId,
      changeSetId: input.changeSetId,
      actorId: input.authorId,
      tenantId: null,
      proposalHash: sha256(graph),
      idempotencyKey: "compile-test",
    };
    const c = assembleNativeBootstrapCompilation({
      graph,
      command,
      catalogue: input.catalogue,
      targets,
      maximumMembers: 10000,
      identityResource: resource,
      referenceContract: {
        key: graph.runtimeProfiles[0]!.referenceCapabilityKey!,
        version: 1,
        hash: resource.hash,
      },
      domains: [
        { code: "shared.ref_status_d", values: ["active", "deprecated"] },
      ],
      components: {
        core: [
          {
            id: input.components.list,
            level: "surface",
            surfaceKinds: ["list"],
            modes: ["table", "compact"],
          },
          {
            id: input.components.detail,
            level: "surface",
            surfaceKinds: ["detail"],
            modes: [],
          },
        ],
        layout: Object.entries(displays).map(([type, id]) => ({
          id,
          level: "field_display",
          surfaceKinds: ["list", "detail"],
          dataTypes: [type],
          cardinalities: ["one", "zero_or_one"],
          options: [],
          filterOperators: [],
          compatibleDisplayIds: [],
          maskedRepresentationSafe: false,
        })),
        components: Object.values(displays).map((id) => ({
          id,
          runtimeKey: "text",
        })),
      },
    });
    const compiled = compileNativeRelease(
      graph,
      c,
      graph.operations.map((o) => ({ ...o, requiresMfa: false })),
    );
    const runtime = compileNativeRuntimeProjection({
      native: compiled.descriptor,
      registration: {
        entityCode: graph.entity.entityCode,
        plane: "studio",
        storage: {
          schema: input.catalogue.schema,
          object: input.catalogue.object,
          idField: "id",
        },
        columns: input.catalogue.columns.map((c) => c.path),
      },
      permissions: [
        ...new Set(
          c.authorization.permissions.flatMap((p) =>
            p.permissionCode ? [p.permissionCode] : [],
          ),
        ),
      ].map((code) => ({ code, scopeKinds: ["tenant"] })),
    });
    expect(runtime.entityCode).toBe(graph.entity.entityCode);
    expect(compiled.descriptor.ai).toEqual(product.definition.ai);
    expect(c.ai!.fields).toHaveLength(product.definition.fields.length);
  },
);
