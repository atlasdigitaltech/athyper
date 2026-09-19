#!/usr/bin/env tsx
/** Local-only metadata rollout. Copies active releases; never edits grants or existing artifacts. */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { compileListExperience } from "@athyper/server-plane-studio-meta-entity-authoring/list-experience";
import { parseEntityRuntimeDescriptor } from "@athyper/server-platform-metadata/descriptor-parser";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring/model";

const CONTAINER = "athyper-dev-db-1";
const DATABASE = "athyper_neon";
const VERSION = "entity-application-v1";
export function query(sql: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "-u",
      "postgres",
      CONTAINER,
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-d",
      DATABASE,
      "-At",
    ],
    { input: sql, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  ).trim();
}
export function literal(value: unknown): string {
  return "'" + String(value).replaceAll("'", "''") + "'";
}
export const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const json = (value: unknown) => literal(JSON.stringify(value)) + "::jsonb";

export function businessPartnerHeaderGraph(
  entityCode: string,
): MetaEntityGraph {
  const operationId = randomUUID(),
    listId = randomUUID(),
    formId = randomUUID();
  const base: MetaEntityGraph = {
    contractSchema: "athyper.meta-entity-contract/2.1",
    entity: { entityCode },
    fields: [],
    operations: [
      {
        id: operationId,
        operationKey: "request_supplier",
        operationKind: "create",
        label: "New request",
        inputSurfaceKey: "supplier_request_form",
        auditEventCode: "business_partner.case.created",
      },
    ],
    surfaces: [
      {
        id: listId,
        surfaceKey: "partners",
        surfaceKind: "list",
        title: "Business Partners",
        description:
          "Organization-scoped partner master and governed onboarding.",
        layoutConfig: {
          experience: {
            defaultLocale: "en",
            header: {
              iconKey: "contact",
              title: {
                defaultLocale: "en",
                values: { en: "Business Partners", ms: "Rakan Perniagaan" },
              },
              description: {
                defaultLocale: "en",
                values: {
                  en: "Organization-scoped partner master and governed onboarding.",
                  ms: "Data induk rakan mengikut organisasi dan proses pendaftaran terkawal.",
                },
              },
            },
            routes: [
              {
                surfaceKey: "supplier_request_form",
                href: "/mdg/business-partner/new",
              },
            ],
            actionLabels: {
              new_supplier_request: {
                defaultLocale: "en",
                values: {
                  en: "New request",
                  ms: "Permohonan baharu",
                },
              },
            },
          },
        },
      },
      {
        id: formId,
        surfaceKey: "supplier_request_form",
        surfaceKind: "form",
        title: "New request",
      },
    ],
    surfaceOperations: [
      {
        entitySurfaceId: listId,
        entityOperationId: operationId,
        placementKey: "new_supplier_request",
        interactionTarget: "primary",
        selectionMode: "none",
        position: 0,
      },
    ],
    operationPermissions: [
      {
        entityOperationId: operationId,
        targetPlane: "neon",
        permissionCode: "neon.relationship.entity_case.create",
        permissionKind: "entity_operation",
      },
    ],
    operationScopeBindings: [
      {
        entityOperationId: operationId,
        bindingKey: "request_tenant",
        targetPlane: "neon",
        decisionMode: "entity_resource",
        scopeKind: "tenant",
        coordinateSource: "tenant_context",
        missingValueBehavior: "deny",
      },
    ],
  };
  const text = (en: string, ms: string) => ({
    defaultLocale: "en",
    values: { en, ms },
  });
  const definitions = [
    {
      key: "overview",
      surface: "overview",
      href: "/mdg/business-partner",
      label: text("Overview", "Gambaran keseluruhan"),
      permission: "neon.relationship.business_partner.read",
      kind: "overview",
      content: { kind: "overview" },
    },
    {
      key: "manage",
      surface: "partners",
      href: "/mdg/business-partner/manage",
      aliases: [
        "/mdg/business-partner/partners",
        "/mdg/business-partner/business-partners",
      ],
      label: text("Manage", "Urus"),
      permission: "neon.relationship.business_partner.read",
      kind: "manage",
      content: { kind: "entity_list", entityCode },
    },
    {
      key: "review",
      surface: "request_review",
      href: "/mdg/business-partner/requests",
      label: text("Review & Approval", "Semakan & Kelulusan"),
      permission: "neon.relationship.entity_case.read",
      kind: "review",
      content: { kind: "task_list", entityCode: "business_partner_request" },
      workflowKey: "supplier_onboarding",
    },
  ];
  const operations = definitions.map((item) => ({
    id: randomUUID(),
    operationKey: `navigate_${item.key}`,
    operationKind: "read",
    label: item.label.values.en,
    resultSurfaceKey: item.surface,
    auditEventCode: "entity.navigation.read",
  }));
  const list = base.surfaces![0]!;
  const config = list.layoutConfig!["experience"] as Record<string, any>;
  const surfaces = [
    list,
    ...base.surfaces!.slice(1),
    ...definitions
      .filter((item) => item.surface !== list.surfaceKey)
      .map((item) => ({
        id: randomUUID(),
        surfaceKey: item.surface,
        surfaceKind: "custom",
        title: item.label.values.en,
      })),
  ];
  const flowId = randomUUID();
  return {
    ...base,
    surfaces: surfaces.map((surface) =>
      surface.id === list.id
        ? {
            ...surface,
            layoutConfig: {
              experience: {
                ...config,
                application: {
                  key: "business_partner",
                  basePath: "/mdg/business-partner",
                  defaultSectionKey: "overview",
                },
                routes: [
                  ...config["routes"],
                  ...definitions.map((item) => ({
                    surfaceKey: item.surface,
                    href: item.href,
                    ...(item.aliases ? { aliases: item.aliases } : {}),
                  })),
                ],
                actionLabels: {
                  ...config["actionLabels"],
                  ...Object.fromEntries(
                    definitions.map((item) => [item.key, item.label]),
                  ),
                },
                navigation: Object.fromEntries(
                  definitions.map((item) => [
                    item.key,
                    {
                      kind: item.kind,
                      content: item.content,
                      ...(item.workflowKey
                        ? { workflowKey: item.workflowKey }
                        : {}),
                    },
                  ]),
                ),
              },
            },
          }
        : surface,
    ),
    operations: [...base.operations, ...operations],
    surfaceOperations: [
      ...base.surfaceOperations!,
      ...operations.map((operation, index) => ({
        entitySurfaceId: listId,
        entityOperationId: operation.id,
        placementKey: definitions[index]!.key,
        interactionTarget: "navigation",
        selectionMode: "none",
        position: index * 10,
      })),
    ],
    operationPermissions: [
      ...base.operationPermissions!,
      ...operations.map((operation, index) => ({
        entityOperationId: operation.id,
        targetPlane: "neon" as const,
        permissionKind: "entity_operation",
        permissionCode: definitions[index]!.permission,
      })),
    ],
    operationScopeBindings: [
      ...base.operationScopeBindings!,
      ...operations.map((operation) => ({
        entityOperationId: operation.id,
        bindingKey: `${operation.operationKey}_tenant`,
        targetPlane: "neon" as const,
        decisionMode: "entity_resource",
        scopeKind: "tenant",
        coordinateSource: "tenant_context",
        missingValueBehavior: "deny" as const,
      })),
    ],
    flows: [
      {
        id: flowId,
        flowKey: "supplier_onboarding",
        flowKind: "approval",
        title: "Supplier onboarding",
        entryOperationId: operationId,
      },
    ],
    flowSteps: [
      {
        entityFlowId: flowId,
        entitySurfaceId: formId,
        stepKey: "request",
        position: 0,
      },
      {
        entityFlowId: flowId,
        entitySurfaceId: surfaces.find(
          (surface) => surface.surfaceKey === "request_review",
        )!.id!,
        stepKey: "review",
        position: 10,
      },
    ],
  };
}

function plan() {
  const rows = query(
    `SELECT json_build_object('contract',row_to_json(c),'descriptor',row_to_json(d)) FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id AND a.status='active' JOIN runtime_meta.entity_descriptor d ON d.applied_release_id=a.id AND d.status='active' JOIN runtime_meta.entity_contract c ON c.id=d.entity_contract_id AND c.status='published' WHERE c.entity_code='business_partner' AND d.plane_code='neon' ORDER BY c.tenant_id NULLS FIRST;`,
  )
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  if (!rows.length) throw new Error("No active Business Partner metadata");
  const artifacts = rows
    .filter(
      (row) => row.contract.contract_json.listExperienceVersion !== VERSION,
    )
    .map(({ contract: old, descriptor: oldDescriptor }) => {
      if (
        !String(old.signature_algorithm).startsWith("development") &&
        !String(old.signing_key_id).startsWith("local-")
      )
        throw new Error(
          "Only local development artifacts may use this rollout",
        );
      const graph = businessPartnerHeaderGraph(old.entity_code),
        experience = compileListExperience(
          graph,
          graph.surfaces![0]!,
          [],
          ["business_partner_request"],
        );
      const publishedOperations = [
        ...experience.actions,
        ...(experience.navigation ?? []),
      ];
      const permissionIds = new Map<string, string>();
      for (const operation of publishedOperations) {
        const permission = operation.permissions[0]!;
        const id = query(
          `SELECT id FROM authz.permission WHERE canonical_code=${literal(permission.permissionCode)} AND status='published' AND permission_kind='entity_operation';`,
        );
        if (!/^[a-f0-9-]{36}$/.test(id))
          throw new Error(
            `Published permission missing: ${permission.permissionCode}`,
          );
        permissionIds.set(permission.permissionCode, id);
      }
      const releaseId = randomUUID(),
        releaseNo = Number(old.release_no) + 1,
        now = new Date().toISOString();
      const contract = {
        ...old.contract_json,
        listExperienceVersion: VERSION,
        listExperienceGraph: graph,
      };
      const contractHash = hash(contract),
        descriptor = structuredClone(oldDescriptor.compiled_json);
      descriptor.listPresentation.experience = experience;
      descriptor.listPresentation.title = graph.surfaces![0]!.title;
      descriptor.listPresentation.description = graph.surfaces![0]!.description;
      for (const operation of publishedOperations)
        descriptor.operations[operation.operationKey] = {
          code: operation.operationKey,
          permissionCode: operation.permissions[0]!.permissionCode,
        };
      descriptor.source = {
        ...descriptor.source,
        entity_id: old.entity_id,
        release_hash: contractHash,
      };
      const bindingIds = new Map<string, string>();
      descriptor.operation_scope_bindings = (
        descriptor.operation_scope_bindings ?? []
      )
        .filter(
          (binding: Record<string, unknown>) =>
            !publishedOperations.some(
              (operation) => operation.operationKey === binding.operationKey,
            ),
        )
        .map((binding: Record<string, unknown>) => {
          const source = String(binding.sourceEntityOperationId);
          if (!bindingIds.has(source)) bindingIds.set(source, randomUUID());
          return {
            ...binding,
            bindingId: bindingIds.get(source),
            scopeBindingId: randomUUID(),
          };
        });
      for (const operation of publishedOperations)
        descriptor.operation_scope_bindings.push({
          bindingId: randomUUID(),
          scopeBindingId: randomUUID(),
          sourceEntityOperationId: graph.operations.find(
            (item) => item.operationKey === operation.operationKey,
          )!.id,
          entityCode: old.entity_code,
          operationKey: operation.operationKey,
          permissionId: permissionIds.get(
            operation.permissions[0]!.permissionCode,
          ),
          permissionCode: operation.permissions[0]!.permissionCode,
          permissionKind: "entity_operation",
          decisionMode: "entity_resource",
          scopeKind: "tenant",
          coordinateSource: "tenant_context",
          coordinateKey: null,
          resolverKey: null,
        });
      const compiledHash = hash(descriptor);
      parseEntityRuntimeDescriptor({
        entity_code: old.entity_code,
        release_id: releaseId,
        release_no: releaseNo,
        entity_contract_hash: contractHash,
        plane_code: "neon",
        compiled_hash: compiledHash,
        compiled_json: descriptor,
      });
      const manifest = {
        schema: "athyper.development-runtime-publication/1.0",
        artifactKind: "entity_runtime",
        sourceVersion: VERSION,
        publicationKey: old.publication_key,
        releaseId,
        releaseNo,
        targetPlane: "neon",
        contractHash,
        compiledHash,
      };
      return {
        oldAppliedReleaseId: oldDescriptor.applied_release_id,
        oldContractHash: old.entity_contract_hash,
        publicationKey: old.publication_key,
        tenantId: old.tenant_id,
        releaseId,
        releaseNo,
        deploymentId: randomUUID(),
        artifactHash: hash({ manifest, contract, descriptor }),
        manifest,
        projection: {
          contract: {
            id: randomUUID(),
            tenant_id: old.tenant_id,
            entity_id: old.entity_id,
            entity_code: old.entity_code,
            release_id: releaseId,
            revision_id: randomUUID(),
            release_no: releaseNo,
            contract_schema_code: old.contract_schema_code,
            contract_schema_version: old.contract_schema_version,
            contract_hash: contractHash,
            contract_json: contract,
            publication_key: old.publication_key,
            signature_algorithm: "development-local-sha256",
            signing_key_id: "local-development-runtime-bootstrap",
            signature: hash({ contractHash, releaseId, targetPlane: "neon" }),
            published_at: now,
          },
          descriptor: {
            id: randomUUID(),
            plane_code: "neon",
            descriptor_kind: "entity_runtime",
            descriptor_schema_version: "1.0.0",
            source_contract_hash: contractHash,
            compiled_hash: compiledHash,
            compiled_json: descriptor,
            compiler_version: VERSION,
            compatibility_level: "backward_compatible",
            generated_at: now,
          },
        },
        verification: {
          signature_verified: true,
          manifest_valid: true,
          runtime_compatible: true,
          target_plane: "neon",
          contract_hash: contractHash,
          descriptor_source_hash: contractHash,
          contract_schema_version: old.contract_schema_version,
          descriptor_schema_version: "1.0.0",
          signature_algorithm: "development-local-sha256",
          signing_key_id: "local-development-runtime-bootstrap",
        },
      };
    });
  if (artifacts.length) {
    const existing = query(
      "SELECT count(*) FROM runtime_meta.release_activation_head WHERE publication_key='metadata.entity.business_partner_request'",
    );
    if (existing !== "0")
      throw new Error(
        "Request collection already published; prepare an explicit revision",
      );
    artifacts.unshift(
      requestCollectionArtifact(
        artifacts.find((item) => item.tenantId === null)!,
      ),
    );
  }
  return artifacts;
}
function requestCollectionArtifact(seed: any): any {
  const collectionRelationship = {
    schemaVersion: 1,
    sourceRef: "entity_case",
    subject: { fieldRef: "subject_entity", value: "master.business_partner" },
    scope: {
      fieldRef: "current_snapshot.organization",
      contextRef: "operatingOrganizationId",
    },
  };
  const result = structuredClone(seed),
    entityId = randomUUID(),
    releaseId = randomUUID();
  const publicationKey = "metadata.entity.business_partner_request",
    permissionCode = "neon.relationship.entity_case.read";
  const permissionId = query(
    `SELECT id FROM authz.permission WHERE canonical_code=${literal(permissionCode)} AND status='published'`,
  );
  const field = (
    key: string,
    type: string,
    label: string,
    position: number,
    extra: Record<string, unknown> = {},
  ) => ({
    key,
    storagePath: key,
    type,
    required: false,
    writableOn: [],
    sortable: true,
    filterable: true,
    searchable: type === "string",
    list: {
      label,
      defaultOrder: position,
      defaultVisible: key !== "id",
      ...extra,
    },
  });
  const fields = [
    field("id", "uuid", "Request ID", 99),
    field("case_code", "string", "Request number", 0, {
      semanticRole: "identity",
      defaultWidth: 260,
    }),
    field("operation_code", "enum", "Request type", 1, {
      groupable: true,
      defaultWidth: 220,
    }),
    {
      ...field("status", "enum", "Status", 2, {
        semanticRole: "status",
        groupable: true,
        defaultWidth: 160,
      }),
      validation: {
        options: [
          "draft",
          "submitted",
          "in_review",
          "approved",
          "rejected",
          "materializing",
          "materialized",
          "cancelled",
          "conflicted",
        ],
      },
    },
    field("created_at", "datetime", "Created", 3, { defaultWidth: 210 }),
    field("updated_at", "datetime", "Updated", 4, { defaultWidth: 210 }),
  ];
  const contract = {
    schema: "athyper.meta-entity-contract/2.1",
    entity: { entityCode: "business_partner_request", entityClass: "document" },
    collectionRelationship,
    listExperienceVersion: VERSION,
    operations: [{ code: "read", permissionCode }],
    fields,
  };
  const contractHash = hash(contract);
  const descriptor = {
    schema: "athyper.entity-runtime-descriptor/1.0",
    entityCode: "business_partner_request",
    collectionRelationship,
    planeKey: "neon",
    detailRouteTemplate: "/mdg/business-partner/requests/:recordId",
    storage: {
      schema: "document",
      object: "entity_case",
      idField: "id",
      tenantField: "tenant_id",
      statusField: "status",
    },
    fields,
    operations: { read: { code: "read", permissionCode } },
    source: { entity_id: entityId, release_hash: contractHash },
    operation_scope_bindings: [
      {
        bindingId: randomUUID(),
        scopeBindingId: randomUUID(),
        sourceEntityOperationId: randomUUID(),
        entityCode: "business_partner_request",
        operationKey: "read",
        permissionId,
        permissionCode,
        permissionKind: "entity_operation",
        decisionMode: "collection",
        scopeKind: "operating_organization",
        coordinateSource: "relation_resolver",
        coordinateKey: null,
        resolverKey: "platform.document_relationship.v1",
      },
    ],
    listPresentation: {
      schemaVersion: 1,
      title: "Review & Approval",
      identityField: "case_code",
      supportedModes: ["table", "compact"],
      defaultState: {
        columns: [
          "case_code",
          "operation_code",
          "status",
          "created_at",
          "updated_at",
        ],
        sort: [{ field: "created_at", direction: "desc" }],
        filters: [],
        mode: "table",
        density: "comfortable",
      },
      search: { minimumQueryLength: 1 },
      limits: {
        countMode: "exact",
        maxSortLevels: 3,
        defaultPageSize: 10,
        allowedPageSizes: [10, 25, 50, 100],
      },
      filterPresentation: {
        quickFields: [{ field: "status", defaultOperator: "eq" }],
        allowUserPinning: true,
      },
    },
  };
  const compiledHash = hash(descriptor);
  result.oldAppliedReleaseId = null;
  result.oldContractHash = null;
  result.publicationKey = publicationKey;
  result.tenantId = null;
  result.releaseId = releaseId;
  result.releaseNo = 1;
  result.deploymentId = randomUUID();
  result.manifest = {
    ...result.manifest,
    publicationKey,
    releaseId,
    releaseNo: 1,
    contractHash,
    compiledHash,
  };
  result.projection.contract = {
    ...result.projection.contract,
    id: randomUUID(),
    entity_id: entityId,
    entity_code: "business_partner_request",
    release_id: releaseId,
    revision_id: randomUUID(),
    release_no: 1,
    contract_hash: contractHash,
    contract_json: contract,
    publication_key: publicationKey,
    signature: hash({ contractHash, releaseId, targetPlane: "neon" }),
  };
  result.projection.descriptor = {
    ...result.projection.descriptor,
    id: randomUUID(),
    source_contract_hash: contractHash,
    compiled_hash: compiledHash,
    compiled_json: descriptor,
  };
  result.verification = {
    ...result.verification,
    contract_hash: contractHash,
    descriptor_source_hash: contractHash,
  };
  result.artifactHash = hash({
    manifest: result.manifest,
    contract,
    descriptor,
  });
  parseEntityRuntimeDescriptor({
    entity_code: "business_partner_request",
    release_id: releaseId,
    release_no: 1,
    entity_contract_hash: contractHash,
    plane_code: "neon",
    compiled_hash: compiledHash,
    compiled_json: descriptor,
  });
  return result;
}
export function apply(artifacts: ReturnType<typeof plan>, rehearse = false) {
  const tag = "$rollout_" + randomUUID().replaceAll("-", "") + "$";
  for (const a of artifacts) {
    const contract = a.projection.contract.contract_json;
    const descriptor = a.projection.descriptor.compiled_json;
    if (
      !["business_partner", "business_partner_request"].includes(
        a.projection.contract.entity_code,
      ) ||
      a.projection.descriptor.plane_code !== "neon" ||
      contract.listExperienceVersion !== VERSION ||
      a.manifest.contractHash !== hash(contract) ||
      a.manifest.compiledHash !== hash(descriptor) ||
      a.artifactHash !== hash({ manifest: a.manifest, contract, descriptor })
    )
      throw new Error("Publication plan integrity check failed");
    if (JSON.stringify(a).includes(tag))
      throw new Error("Invalid publication delimiter");
  }
  const statements = artifacts.map(
    (
      a,
    ) => `SELECT set_config('app.current_tenant_id',${literal(a.tenantId ?? "")},true);
DO ${tag} DECLARE staged runtime_meta.applied_release; verified runtime_meta.applied_release; BEGIN
${a.oldAppliedReleaseId ? `IF NOT EXISTS(SELECT 1 FROM runtime_meta.release_activation_head WHERE publication_key=${literal(a.publicationKey)} AND applied_release_id=${literal(a.oldAppliedReleaseId)}::uuid) THEN RAISE EXCEPTION 'Active release changed; regenerate plan'; END IF;` : `IF EXISTS(SELECT 1 FROM runtime_meta.release_activation_head WHERE publication_key=${literal(a.publicationKey)}) THEN RAISE EXCEPTION 'Release already exists'; END IF;`}
SELECT * INTO staged FROM runtime_meta.fn_stage_release_projection(${literal(a.publicationKey)},${literal(a.releaseId)}::uuid,${a.releaseNo},${literal(a.deploymentId)}::uuid,${literal(a.artifactHash)},${json(a.manifest)},${json(a.projection)});
SELECT * INTO verified FROM runtime_meta.fn_verify_release(staged.id,${literal(a.artifactHash)},${json(a.verification)});
IF verified.status<>'verified' THEN RAISE EXCEPTION 'Verification failed: %',verified.failure_code; END IF;
PERFORM runtime_meta.fn_activate_release(staged.id,'{"source":"local-development-entity-list-experience"}'::jsonb);
END ${tag};`,
  );
  query(
    "BEGIN; SELECT set_config('app.database_plane','neon',true),set_config('app.current_principal_id','',true),set_config('app.current_actor_type','system',true);\n" +
      statements.join("\n") +
      (rehearse ? "\nROLLBACK;" : "\nCOMMIT;"),
  );
}
function main() {
  const args = process.argv.slice(2),
    file =
      args.find((arg) => arg.startsWith("--file="))?.slice(7) ??
      "/tmp/entity-list-publication-plan.json";
  if (args.includes("--apply") || args.includes("--rehearse")) {
    const artifacts = JSON.parse(readFileSync(file, "utf8")) as ReturnType<
      typeof plan
    >;
    apply(artifacts, args.includes("--rehearse"));
    console.log(
      JSON.stringify({
        mode: args.includes("--rehearse") ? "rehearsed-rolled-back" : "applied",
        applied: artifacts.map((a) => ({
          publicationKey: a.publicationKey,
          releaseNo: a.releaseNo,
          previousAppliedReleaseId: a.oldAppliedReleaseId,
        })),
      }),
    );
  } else {
    const artifacts = plan();
    if (artifacts.length)
      writeFileSync(file, JSON.stringify(artifacts, null, 2), { mode: 0o600 });
    console.log(
      JSON.stringify({
        file,
        planned: artifacts.map((a) => ({
          publicationKey: a.publicationKey,
          releaseNo: a.releaseNo,
          entity: a.projection.contract.entity_code,
        })),
      }),
    );
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
