import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadModel } from "./model.mjs";
import { createPlan } from "./plan.mjs";
import { qualificationRoot } from "./qualification.mjs";
import { readYaml } from "./io.mjs";
import { createValidator } from "./schema.mjs";

function digest(reference) {
  return String(reference).match(/@sha256:([a-f0-9]{64})$/u)?.[1] ?? null;
}

export function createRehearsalPlan(repoRoot, targetInstance, sourceInstance) {
  if(targetInstance==="production")return createProductionRehearsalPlan(repoRoot,sourceInstance);
  const contractPath = join(repoRoot, "deploy/rehearsals/stg.yaml");
  const validate = createValidator(repoRoot);
  const contract = validate(readYaml(contractPath), contractPath);
  if (contract.spec.targetInstance !== targetInstance || contract.spec.sourceInstance !== sourceInstance) {
    throw new Error(`Rehearsal contract permits only ${contract.spec.sourceInstance} -> ${contract.spec.targetInstance}.`);
  }

  const sourceModel = loadModel(repoRoot, sourceInstance);
  const targetModel = loadModel(repoRoot, targetInstance);
  if (sourceModel.instance.spec.mode !== "qa" || targetModel.instance.spec.mode !== "staging") {
    throw new Error("Staging rehearsal promotion requires a QA source and staging target.");
  }
  if (targetModel.instance.spec.dataPolicy !== "sanitized") {
    throw new Error("Staging rehearsal target must enforce the sanitized data policy.");
  }

  const sourceDeployment = createPlan(repoRoot, sourceInstance);
  const targetDeployment = createPlan(repoRoot, targetInstance);
  const sourceImages = new Map(sourceModel.imageSet.spec.images.map(({ id, reference }) => [id, reference]));
  const targetImages = new Map(targetModel.imageSet.spec.images.map(({ id, reference }) => [id, reference]));
  const comparisons = contract.spec.promotion.requiredImageIds.map((id) => {
    const sourceReference = sourceImages.get(id) ?? null;
    const targetReference = targetImages.get(id) ?? null;
    const sourceDigest = digest(sourceReference);
    const targetDigest = digest(targetReference);
    return {
      id,
      sourceReference,
      targetReference,
      match: Boolean(sourceDigest && targetDigest && sourceDigest === targetDigest && !/^0{64}$/u.test(sourceDigest)),
    };
  });
  const revisionMatch = sourceModel.imageSet.spec.sourceRevision === targetModel.imageSet.spec.sourceRevision
    && !/^0{40}$/u.test(sourceModel.imageSet.spec.sourceRevision);

  const evidence = {
    sanitizedDataManifest: join(qualificationRoot(), contract.spec.data.manifest),
    preMigrationBackup: join(qualificationRoot(), contract.spec.migration.backupReceipt),
    restoreDrill: join(qualificationRoot(), contract.spec.migration.restoreReceipt),
    providerReadiness: join(qualificationRoot(), contract.spec.notifications.providerReadiness),
    emailCanary: join(qualificationRoot(), contract.spec.notifications.emailCanary),
    webPushCanary: join(qualificationRoot(), contract.spec.notifications.webPushCanary),
    failureExercise: join(qualificationRoot(), contract.spec.notifications.failureExercise),
  };
  const blockers = [
    ...sourceDeployment.blockers.map((message) => `QA source: ${message}`),
    ...targetDeployment.blockers.map((message) => `STG target: ${message}`),
  ];
  const evidenceDocuments = {};
  for (const comparison of comparisons) {
    if (!comparison.match) blockers.push(`Promotion digest mismatch or absence: ${comparison.id}.`);
  }
  if (!revisionMatch) blockers.push("QA and STG source revisions are absent, placeholders, or different.");
  for (const [id, path] of Object.entries(evidence)) {
    if (!existsSync(path)) {
      blockers.push(`Required rehearsal evidence is absent: ${id} (${path}).`);
      continue;
    }
    try {
      evidenceDocuments[id] = validate(JSON.parse(readFileSync(path, "utf8")), path);
    } catch (error) {
      blockers.push(`Rehearsal evidence is invalid: ${id} (${error.message}).`);
    }
  }
  const backup = evidenceDocuments.preMigrationBackup;
  const restore = evidenceDocuments.restoreDrill;
  const sanitized = evidenceDocuments.sanitizedDataManifest;
  const notificationGates = {
    providerReadiness: "provider-readiness",
    emailCanary: "email-canary",
    webPushCanary: "web-push-canary",
    failureExercise: "failure-exercise",
  };
  for (const [id, expectedGate] of Object.entries(notificationGates)) {
    const document = evidenceDocuments[id];
    if (!document) continue;
    if (document.metadata.gate !== expectedGate) blockers.push(`Notification evidence has the wrong gate: ${id}.`);
    if (document.spec.sourceRevision !== targetModel.imageSet.spec.sourceRevision) {
      blockers.push(`Notification evidence source revision differs from STG: ${id}.`);
    }
    if (!Object.values(document.spec.assertions).every(Boolean)) {
      blockers.push(`Notification evidence contains a failed assertion: ${id}.`);
    }
  }
  for (const [id, timestamp] of [
    ["sanitized data", sanitized?.spec.createdAt],
    ["pre-migration backup", backup?.spec.createdAt],
    ["restore drill", restore?.spec.restoredAt],
  ]) {
    if (timestamp && !Number.isFinite(Date.parse(timestamp))) {
      blockers.push(`Rehearsal evidence has an invalid ${id} timestamp.`);
    }
  }
  if (backup && backup.spec.sourceRevision !== targetModel.imageSet.spec.sourceRevision) {
    blockers.push("Pre-migration backup source revision does not match the STG image set.");
  }
  if (backup && restore && restore.spec.backupSha256 !== backup.spec.database.sha256) {
    blockers.push("Restore drill did not consume the recorded pre-migration backup checksum.");
  }
  if (backup && restore
    && Number.isFinite(Date.parse(restore.spec.restoredAt))
    && Number.isFinite(Date.parse(backup.spec.createdAt))
    && Date.parse(restore.spec.restoredAt) <= Date.parse(backup.spec.createdAt)) {
    blockers.push("Restore drill timestamp does not follow the pre-migration backup timestamp.");
  }

  return {
    apiVersion: "athyper.io/v1alpha1",
    kind: "StagingRehearsalPlan",
    metadata: { sourceInstance, targetInstance },
    readOnly: true,
    executionAuthorized: false,
    status: blockers.length ? "blocked" : "ready-for-explicit-authorization",
    blockers,
    promotion: {
      rebuildAllowed: false,
      exactDigestMatch: comparisons.every(({ match }) => match),
      sourceRevisionMatch: revisionMatch,
      images: comparisons,
    },
    dataPolicy: {
      classification: "sanitized",
      prohibitedContent: contract.spec.data.prohibitedContent,
      manifest: evidence.sanitizedDataManifest,
    },
    integrationPolicy: contract.spec.integrations,
    isolation: {
      project: targetModel.instance.spec.composeProject,
      protectedProjects: ["athyper-dev", "athyper-qa"],
      hostBindings: targetModel.instance.spec.debugPorts,
      domainSuffix: targetModel.instance.spec.domainSuffix,
      receipt: join(qualificationRoot(), "stg", "active-instance-receipt.json"),
    },
    evidence,
    stages: [
      { id: "verify-exact-qa-digests", effect: "read-only" },
      { id: "verify-sanitized-data-manifest", effect: "read-only" },
      { id: "verify-default-deny-integrations", effect: "read-only" },
      { id: "capture-pre-migration-backup", effect: "mutating-stg-backup-only", execution: "controller-backup-requires-explicit-confirmation" },
      { id: "verify-backup-receipt", effect: "read-only" },
      { id: "run-stg-migration", effect: "mutating-stg-only", execution: "controller-up-runs-forward-migrations" },
      { id: "run-stg-smoke-suite", effect: "mutating-stg-only", execution: "deferred-until-test-runner-exists" },
      { id: "verify-notification-providers", effect: "read-only" },
      { id: "run-email-canary", effect: "mutating-stg-canary-only", execution: "requires-explicit-authorization" },
      { id: "run-web-push-canary", effect: "mutating-stg-canary-only", execution: "requires-explicit-authorization" },
      { id: "exercise-provider-failure", effect: "mutating-stg-canary-only", execution: "requires-explicit-authorization" },
      { id: "restore-backup-into-disposable-target", effect: "mutating-disposable-restore-only", execution: "controller-restore-requires-double-confirmation" },
      { id: "verify-restore-receipt", effect: "read-only" },
      { id: "verify-dev-and-qa-fingerprints-unchanged", effect: "read-only" },
    ],
    actions: [
      "This plan is read-only; use `athyper backup stg --confirm stg` only while the controller owns a running STG instance.",
      "Use `athyper restore stg <backup-id> --confirm stg --confirm-restore <backup-id>` for the retained isolated restore drill.",
      "Convert successful controller receipts with `pnpm stg:record-database-evidence` before re-running this plan.",
    ],
  };
}

function createProductionRehearsalPlan(repoRoot,sourceInstance){
  const validate=createValidator(repoRoot),contractPath=join(repoRoot,"deploy/rehearsals/production.yaml"),contract=validate(readYaml(contractPath),contractPath);
  if(sourceInstance!==contract.spec.sourceInstance)throw new Error(`Production rehearsal contract permits only ${contract.spec.sourceInstance} -> production.`);
  const targetPath=join(repoRoot,contract.spec.targetContract),target=validate(readYaml(targetPath),targetPath),sourceModel=loadModel(repoRoot,sourceInstance),sourcePlan=createPlan(repoRoot,sourceInstance);
  if(sourceModel.instance.spec.mode!=="staging")throw new Error("Production rehearsal promotion requires a staging source.");
  const references=new Map(sourceModel.imageSet.spec.images.map(({id,reference})=>[id,reference]));
  const images=contract.spec.promotion.requiredImageIds.map(id=>{const reference=references.get(id)??null,value=digest(reference);return{id,reference,immutable:Boolean(value&&!/^0{64}$/u.test(value))};});
  const blockers=sourcePlan.blockers.map(message=>`STG source: ${message}`);
  for(const image of images)if(!image.immutable)blockers.push(`Production promotion image is absent, mutable, or a placeholder: ${image.id}.`);
  if(target.spec.secretAuthority.namespace.includes("stg")||target.spec.secretAuthority.prohibitedNamespaces.includes(target.spec.secretAuthority.namespace))blockers.push("Production secret authority is not isolated from staging.");
  const evidence=Object.fromEntries(Object.entries(contract.spec.evidence).map(([id,path])=>[id,join(qualificationRoot(),path)]));
  for(const [id,path] of Object.entries(evidence)){
    if(!existsSync(path)){blockers.push(`Required production evidence is absent: ${id} (${path}).`);continue;}
    try{const document=validate(JSON.parse(readFileSync(path,"utf8")),path);if(document.spec.sourceRevision!==sourceModel.imageSet.spec.sourceRevision)blockers.push(`Production evidence source revision differs from STG: ${id}.`);}catch(error){blockers.push(`Production evidence is invalid: ${id} (${error.message}).`);}
  }
  return{apiVersion:"athyper.io/v1alpha1",kind:"ProductionRehearsalPlan",metadata:{sourceInstance,targetInstance:"production"},readOnly:true,executionAuthorized:false,status:blockers.length?"blocked":"ready-for-explicit-authorization",blockers,target:{contract:targetPath,domainSuffix:target.spec.domainSuffix,deploymentTargetRef:target.spec.deploymentTargetRef,orchestrator:target.spec.orchestrator,dataClassification:target.spec.dataClassification},credentialPolicy:{...contract.spec.credentials,authority:target.spec.secretAuthority},promotion:{rebuildAllowed:false,sourceRevision:sourceModel.imageSet.spec.sourceRevision,images},rollout:contract.spec.rollout,evidence,stages:[{id:"verify-staging-qualification",effect:"read-only"},{id:"verify-production-secret-isolation",effect:"read-only"},{id:"verify-immutable-release-images",effect:"read-only"},{id:"verify-backup-and-restore",effect:"read-only"},{id:"run-email-canary",effect:"mutating-production-canary",execution:"requires-explicit-authorization"},{id:"run-web-push-canary",effect:"mutating-production-canary",execution:"requires-explicit-authorization"},{id:"verify-rollback-drill",effect:"read-only"},{id:"approve-progressive-rollout",effect:"release-approval",execution:"requires-explicit-authorization"}],actions:["No action: this command only validates and emits the production activation contract."]};
}
