#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

interface Inventory {
  contractVersion: string;
  realm: string;
  enabledSubjectCount: number;
  canonicalIdentitySha256: string;
  subjects: Array<{
    keycloakSubject: string;
    username: string;
    enabled: boolean;
  }>;
}
interface AssignmentTemplate {
  realm: string;
  subjectMappings: Record<string, {
    username: string;
    principalId: string;
    tenantCodes: string[];
    planes: unknown[];
    disposition: string;
  }>;
}

const inventoryPath = option("--inventory");
const templatePath = option("--template");
const outputPath = option("--output");
if (!inventoryPath || !templatePath || !outputPath) {
  throw new Error("--inventory, --template, and --output are required");
}
const inventory = JSON.parse(await readFile(inventoryPath, "utf8")) as Inventory;
const template = JSON.parse(await readFile(templatePath, "utf8")) as AssignmentTemplate;
if (
  inventory.contractVersion !== "authorization-v2.keycloak-subject-inventory.v1"
  || inventory.realm !== template.realm
) throw new Error("identity inventory/template contract mismatch");

const templatesByUsername = new Map(
  Object.values(template.subjectMappings).map((row) => [row.username.toLowerCase(), row]),
);
const subjectMappings: Record<string, unknown> = {};
const unmanagedSubjects: Array<Record<string, unknown>> = [];
for (const subject of inventory.subjects.filter((row) => row.enabled)) {
  const assignment = templatesByUsername.get(subject.username.toLowerCase());
  if (!assignment) {
    unmanagedSubjects.push({
      keycloakSubject: subject.keycloakSubject,
      username: subject.username,
      disposition: "unmanaged_unchanged",
    });
    continue;
  }
  subjectMappings[subject.keycloakSubject] = {
    keycloakSubject: subject.keycloakSubject,
    username: subject.username,
    principalId: assignment.principalId,
    tenantCodes: assignment.tenantCodes,
    planes: assignment.planes,
    disposition: assignment.disposition,
  };
}
const deliberatelyClassifiedCount =
  Object.keys(subjectMappings).length + unmanagedSubjects.length;
if (deliberatelyClassifiedCount !== inventory.enabledSubjectCount) {
  throw new Error("enabled Keycloak subject classification is incomplete");
}
const manifest = {
  contractVersion: "authorization-v2.approved-existing-user-groups.v1",
  realm: inventory.realm,
  approvalStatus: "approval_required_before_apply",
  inventoryCanonicalIdentitySha256: inventory.canonicalIdentitySha256,
  enabledSubjectCount: inventory.enabledSubjectCount,
  managedMappedSubjectCount: Object.keys(subjectMappings).length,
  unmanagedUnchangedSubjectCount: unmanagedSubjects.length,
  deliberatelyClassifiedCount,
  identityFieldConflictBehavior: "fail",
  subjectMappings,
  unmanagedSubjects,
  manifestSha256: sha256(JSON.stringify({ subjectMappings, unmanagedSubjects })),
};
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
process.stdout.write(
  `classified ${deliberatelyClassifiedCount}/${inventory.enabledSubjectCount}; `
    + `managed=${manifest.managedMappedSubjectCount}; unmanaged=${unmanagedSubjects.length}\n`,
);

function option(name: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
