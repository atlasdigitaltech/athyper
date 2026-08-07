#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface Catalog {
  compiledCatalogVersion: string;
  operations: unknown[];
}
interface Authority {
  authorityVersion: string;
  permissionSets: unknown[];
  roles: unknown[];
  groups: unknown[];
  proofEdges: unknown[];
}
interface UserManifest {
  contractVersion: string;
  realm: string;
  sourceSha256: string;
  unmanagedKeycloakUsers: string;
  enabledSubjectCount: number;
  mappedSubjectCount: number;
  subjectMappings: Record<string, {
    keycloakSubject: string;
    username: string;
    principalId: string;
    tenantCodes: string[];
    disposition: string;
    planes: Array<Record<string, unknown> & { plane: string }>;
  }>;
}

const here = dirname(fileURLToPath(import.meta.url));
const databaseRoot = resolve(here, "../..");
const outputRoot = resolve(databaseRoot, "seed/packs/authorization-v2");
const semantic = await json<Record<string, unknown>>(resolve(
  databaseRoot,
  "seed/contracts/authorization/authority/authorization-authority-semantic-contract.v1.json",
));
const users = await json<UserManifest>(resolve(
  databaseRoot,
  "seed/contracts/authorization/authority/neon-admin/compiled/development-existing-user-group-manifest.v1.json",
));

const packs = [];
for (const target of ["neon-admin", "mesh"] as const) {
  const catalog = await json<Catalog>(resolve(
    databaseRoot,
    `seed/contracts/authorization/catalog/${target}/compiled/compiled-catalog.v1.json`,
  ));
  const authority = await json<Authority>(resolve(
    databaseRoot,
    `seed/contracts/authorization/authority/${target}/compiled/compiled-authority.v1.json`,
  ));
  const acceptedPlanes = target === "mesh" ? new Set(["mesh"]) : new Set(["neon", "admin"]);
  const subjectAssignments = Object.values(users.subjectMappings)
    .map((subject) => ({
      keycloakSubject: subject.keycloakSubject,
      username: subject.username,
      principalId: subject.principalId,
      tenantCodes: subject.tenantCodes,
      disposition: subject.disposition,
      planes: subject.planes.filter((plane) => acceptedPlanes.has(plane.plane)),
    }))
    .filter((subject) => subject.planes.length > 0)
    .sort((left, right) => left.keycloakSubject.localeCompare(right.keycloakSubject));
  const policy = target === "mesh"
    ? {
        accountEntitlement: {
          authority: "mesh.auth_account_entitlement",
          unavailableBehavior: "deny_before_role_or_override",
          neonPlanRead: "forbidden",
        },
      }
    : {
        adminPlatformManaged: {
          authority: "control.auth_permission.plane_code",
          required: true,
          unavailableBehavior: "deny",
        },
        neonEntitlement: {
          authority: "control.auth_entitlement_target_policy",
          unavailableBehavior: "deny_before_role_or_override",
        },
      };
  const content = {
    contractVersion: "authorization-v2.final-seed-pack.v1",
    planePack: target,
    semanticPermissionContract: semantic,
    permissionCatalog: {
      version: catalog.compiledCatalogVersion,
      operations: catalog.operations,
    },
    authority: {
      version: authority.authorityVersion,
      permissionSets: authority.permissionSets,
      roles: authority.roles,
      groups: authority.groups,
      proofEdges: authority.proofEdges,
    },
    subjectAssignments,
    policy,
    identityContract: {
      realm: users.realm,
      sourceSha256: users.sourceSha256,
      enabledSubjectCount: users.enabledSubjectCount,
      mappedSubjectCount: users.mappedSubjectCount,
      unmanagedKeycloakUsers: users.unmanagedKeycloakUsers,
      fieldConflictBehavior: "fail",
    },
    mutationPolicy: {
      truncate: "forbidden",
      authorizationWideDelete: "forbidden",
      apply: "idempotent_upsert_seed_owned_rows_only",
    },
  };
  const canonicalContent = canonical(content);
  const contentSha256 = sha256(canonicalContent);
  const output = resolve(outputRoot, target);
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, "seed-pack.v1.json"), `${JSON.stringify(content, null, 2)}\n`);
  await writeFile(resolve(output, "seed-pack.sha256"), `${contentSha256}\n`);
  packs.push({
    target,
    path: `seed/packs/authorization-v2/${target}/seed-pack.v1.json`,
    contentSha256,
    permissionCount: catalog.operations.length,
    roleCount: authority.roles.length,
    groupCount: authority.groups.length,
    mappedSubjectCount: subjectAssignments.length,
  });
}

const ledger = {
  contractVersion: "authorization-v2.final-seed-ledger.v1",
  generatedFrom: "canonical_json_sorted_keys",
  immutableContentDrift: "fail",
  packs,
  ledgerSha256: sha256(canonical(packs)),
};
await writeFile(
  resolve(outputRoot, "seed-ledger.v1.json"),
  `${JSON.stringify(ledger, null, 2)}\n`,
);
process.stdout.write(
  `${packs.map((pack) => `${pack.target}:${pack.contentSha256}`).join("\n")}\n`,
);

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
