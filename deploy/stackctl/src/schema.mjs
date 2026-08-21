import { join } from "node:path";
import Ajv from "ajv";
import { readYaml } from "./io.mjs";

const schemaFiles = Object.freeze({
  Instance: "instance.schema.json",
  ServiceCatalog: "service-catalog.schema.json",
  ResourceProfile: "resource-profile.schema.json",
  ImageSet: "image-set.schema.json",
  ProviderCatalog: "provider-catalog.schema.json",
  StagingRehearsal: "staging-rehearsal.schema.json",
  SanitizedDataManifest: "sanitized-data-manifest.schema.json",
  PreMigrationBackupReceipt: "pre-migration-backup-receipt.schema.json",
  RestoreDrillReceipt: "restore-drill-receipt.schema.json",
  OrchestratorDecision: "orchestrator-decision.schema.json",
  ComposeAcceptance: "compose-acceptance.schema.json",
  TopologyRequirement: "topology-requirement.schema.json",
  ColdStartQualification: "cold-start-qualification.schema.json",
  StackV1ExportIntake: "stack-v1-export-intake.schema.json",
  StackV1RestoreReceipt: "stack-v1-restore-receipt.schema.json",
  StackV1Disposition: "stack-v1-disposition.schema.json",
});

export function createValidator(repoRoot) {
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validators = {};
  for (const [kind, file] of Object.entries(schemaFiles)) {
    validators[kind] = ajv.compile(readYaml(join(repoRoot, "deploy/instances/schemas", file)));
  }
  return (document, source) => {
    const validate = validators[document?.kind];
    if (!validate) throw new Error(`${source}: unsupported kind ${String(document?.kind)}`);
    if (!validate(document)) {
      const details = validate.errors
        .map((error) => `${error.instancePath || "/"} ${error.message}`)
        .join("; ");
      throw new Error(`${source}: ${details}`);
    }
    return document;
  };
}
