import { parseEntityDirectoryScope } from "@athyper/server-contract-metadata/directory-scope";
/** Local development publication only; preserves prior releases and never changes IAM grants. */
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import {
  query,
  literal,
  hash,
  apply,
} from "./publish-development-list-experience.js";
import { parseEntityRuntimeDescriptor } from "@athyper/server-platform-metadata/descriptor-parser";
import { parseEntityRecordPresentation } from "../../../../packages/contracts/platform/entity-runtime/src/record-presentation.js";

const args = process.argv.slice(2),
  configPath = args.find((arg) => !arg.startsWith("--"));
if (!configPath) throw new Error("Supply a record-presentation JSON file");
const config = JSON.parse(readFileSync(configPath, "utf8"));
if (config.entityCode !== "business_partner")
  throw new Error(
    "This rollout targets the development Business Partner publication only",
  );
const presentation = parseEntityRecordPresentation(config.recordPresentation);
const directoryScope =
  config.directoryScope === undefined
    ? undefined
    : parseEntityDirectoryScope(config.directoryScope);
const file = "/tmp/business_partner-record-presentation-plan.json";
if (args.includes("--apply") || args.includes("--rehearse")) {
  const artifacts = JSON.parse(readFileSync(file, "utf8"));
  for (const artifact of artifacts) {
    if (
      artifact.projection.contract.entity_code !== config.entityCode ||
      JSON.stringify(
        artifact.projection.descriptor.compiled_json.directoryScope,
      ) !== JSON.stringify(directoryScope) ||
      JSON.stringify(
        artifact.projection.descriptor.compiled_json.recordPresentation,
      ) !== JSON.stringify(presentation)
    )
      throw new Error("Publication plan does not match configuration");
    parseEntityRuntimeDescriptor({
      entity_code: config.entityCode,
      release_id: artifact.releaseId,
      release_no: artifact.releaseNo,
      entity_contract_hash: artifact.manifest.contractHash,
      plane_code: "neon",
      compiled_hash: artifact.manifest.compiledHash,
      compiled_json: artifact.projection.descriptor.compiled_json,
    });
  }
  apply(artifacts, args.includes("--rehearse"));
  console.log(
    JSON.stringify({
      mode: args.includes("--rehearse") ? "rehearsed-rolled-back" : "applied",
      releases: artifacts.map((a: any) => ({
        publicationKey: a.publicationKey,
        releaseNo: a.releaseNo,
        previousAppliedReleaseId: a.oldAppliedReleaseId,
      })),
    }),
  );
} else {
  const rows = query(
    `SELECT json_build_object('contract',row_to_json(c),'descriptor',row_to_json(d)) FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id AND a.status='active' JOIN runtime_meta.entity_descriptor d ON d.applied_release_id=a.id AND d.status='active' JOIN runtime_meta.entity_contract c ON c.id=d.entity_contract_id WHERE c.entity_code=${literal(config.entityCode)} AND d.plane_code='neon' ORDER BY c.tenant_id NULLS FIRST`,
  )
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  if (!rows.length)
    throw new Error("No active development Business Partner publication");
  const artifacts = rows.flatMap(({ contract: old, descriptor: previous }) => {
    if (
      !String(old.signature_algorithm).startsWith("development") ||
      !String(old.signing_key_id).startsWith("local-")
    )
      throw new Error(
        "Only locally signed development releases can use this rollout",
      );
    const descriptor = structuredClone(previous.compiled_json);
    if (
      JSON.stringify(descriptor.recordPresentation) ===
        JSON.stringify(presentation) &&
      JSON.stringify(descriptor.directoryScope) ===
        JSON.stringify(directoryScope)
    )
      return [];
    const releaseId = randomUUID(),
      releaseNo = Number(old.release_no) + 1,
      now = new Date().toISOString();
    const contract = {
      ...old.contract_json,
      ...(directoryScope ? { directoryScope } : {}),
      recordPresentation: presentation,
      recordPresentationOperations: config.operationPermissions,
    };
    descriptor.directoryScope = directoryScope;
    const contractHash = hash(contract);
    const bindingIds = new Map<string, string>();
    descriptor.operation_scope_bindings = (
      descriptor.operation_scope_bindings ?? []
    ).map((binding: any) => {
      const bindingId =
        bindingIds.get(binding.sourceEntityOperationId) ?? randomUUID();
      bindingIds.set(binding.sourceEntityOperationId, bindingId);
      return {
        ...binding,
        bindingId,
        scopeBindingId: randomUUID(),
        ...(directoryScope?.mode === "tenant" && binding.operationKey === "read"
          ? {
              scopeKind: "tenant",
              coordinateSource: "tenant_context",
              coordinateKey: null,
              resolverKey: null,
              decisionMode: "entity_resource",
            }
          : {}),
      };
    });
    for (const action of presentation.actions) {
      const permissionCode = config.operationPermissions?.[action.operationKey];
      // The operation is a placement for the already registered governed request handler.
      if (
        permissionCode !== "neon.relationship.entity_case.create" ||
        ![
          "amend_partner",
          "add_role",
          "assign_organization",
          "configure_company",
        ].includes(action.operationKey)
      )
        throw new Error("Unregistered governed record action");
      if (descriptor.operations[action.operationKey]) {
        if (
          descriptor.operations[action.operationKey].permissionCode !==
          permissionCode
        )
          throw new Error("Published operation permission mismatch");
        continue;
      }
      const template = descriptor.operation_scope_bindings.find(
        (binding: any) =>
          binding.operationKey === "request_supplier" &&
          binding.permissionCode === permissionCode,
      );
      if (!template)
        throw new Error(
          "Existing governed request binding is required; no new permission or grant is created",
        );
      descriptor.operations[action.operationKey] = {
        code: action.operationKey,
        permissionCode,
      };
      descriptor.operation_scope_bindings.push({
        ...template,
        operationKey: action.operationKey,
        sourceEntityOperationId: randomUUID(),
        bindingId: randomUUID(),
        scopeBindingId: randomUUID(),
      });
    }
    descriptor.recordPresentation = presentation;
    descriptor.source = { ...descriptor.source, release_hash: contractHash };
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
      sourceVersion: "record-presentation-v1",
      publicationKey: old.publication_key,
      releaseId,
      releaseNo,
      targetPlane: "neon",
      contractHash,
      compiledHash,
    };
    return [
      {
        oldAppliedReleaseId: previous.applied_release_id,
        oldContractHash: old.contract_hash,
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
            compiler_version: "record-presentation-v1",
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
      },
    ];
  });
  writeFileSync(file, JSON.stringify(artifacts, null, 2), { mode: 0o600 });
  console.log(
    JSON.stringify({
      file,
      releases: artifacts.map((a) => ({
        publicationKey: a.publicationKey,
        releaseNo: a.releaseNo,
      })),
    }),
  );
}
