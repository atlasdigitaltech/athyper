#!/usr/bin/env tsx
/** Explicit local-dev publication from a data file. Never changes IAM grants. */
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import {
  query,
  literal,
  hash,
  apply,
} from "./publish-development-list-experience.js";
import { parseEntityRuntimeDescriptor } from "@athyper/server-platform-metadata/descriptor-parser";
import { parsePublishedListExperience } from "../../../../packages/contracts/platform/entity-list/src/experience.js";

const args = process.argv.slice(2),
  configPath = args.find((arg) => !arg.startsWith("--"));
if (!configPath)
  throw new Error("Supply a standard-view publication JSON file");
const config = JSON.parse(readFileSync(configPath, "utf8"));
if (
  typeof config.entityCode !== "string" ||
  !/^[a-z][a-z0-9_.-]{0,126}$/.test(config.entityCode)
)
  throw new Error("Invalid entity reference");
const file = `/tmp/${config.entityCode}-standard-view-plan.json`;
if (args.includes("--apply") || args.includes("--rehearse")) {
  const artifacts = JSON.parse(readFileSync(file, "utf8"));
  for (const a of artifacts) {
    if (a.projection.contract.entity_code !== config.entityCode)
      throw new Error("Publication plan targets another entity");
    parseEntityRuntimeDescriptor({
      entity_code: a.projection.contract.entity_code,
      release_id: a.releaseId,
      release_no: a.releaseNo,
      entity_contract_hash: a.manifest.contractHash,
      plane_code: "neon",
      compiled_hash: a.manifest.compiledHash,
      compiled_json: a.projection.descriptor.compiled_json,
    });
  }
  apply(artifacts, args.includes("--rehearse"));
  console.log(
    JSON.stringify({
      mode: args.includes("--rehearse") ? "rehearsed-rolled-back" : "applied",
      releases: artifacts.map((a: any) => ({
        publicationKey: a.publicationKey,
        releaseNo: a.releaseNo,
      })),
    }),
  );
} else {
  const rows = query(
    `SELECT json_build_object('contract',row_to_json(c),'descriptor',row_to_json(d)) FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id AND a.status='active' JOIN runtime_meta.entity_descriptor d ON d.applied_release_id=a.id AND d.status='active' JOIN runtime_meta.entity_contract c ON c.id=d.entity_contract_id WHERE c.entity_code=${literal(config.entityCode)} AND d.plane_code='neon'`,
  )
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  if (!rows.length) throw new Error("No published collection");
  const artifacts = rows.flatMap(({ contract: old, descriptor: previous }) => {
    const descriptor = structuredClone(previous.compiled_json),
      presentation = descriptor.listPresentation;
    const experience = parsePublishedListExperience({
      ...(presentation.experience ?? {
        schemaVersion: 1,
        header: {
          title: { defaultLocale: "en", values: { en: presentation.title } },
        },
        routes: [],
        actions: [],
      }),
      standardViews: config.standardViews,
    });
    if (
      experience.standardViews?.some(
        (view) => view.entityCode !== config.entityCode,
      )
    )
      throw new Error("Cross-collection standard views require navigation");
    if (JSON.stringify(experience) === JSON.stringify(presentation.experience))
      return [];
    const releaseId = randomUUID(),
      releaseNo = Number(old.release_no) + 1,
      now = new Date().toISOString();
    const contract = {
      ...old.contract_json,
      standardViews: experience.standardViews,
    };
    const contractHash = hash(contract);
    presentation.experience = experience;
    descriptor.source = { ...descriptor.source, release_hash: contractHash };
    const bindingIds = new Map<string, string>();
    descriptor.operation_scope_bindings = (
      descriptor.operation_scope_bindings ?? []
    ).map((binding: any) => {
      const bindingId =
        bindingIds.get(binding.sourceEntityOperationId) ?? randomUUID();
      bindingIds.set(binding.sourceEntityOperationId, bindingId);
      return { ...binding, bindingId, scopeBindingId: randomUUID() };
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
      sourceVersion: "standard-view-relationships-v1",
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
            compiler_version: "standard-view-relationships-v1",
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
