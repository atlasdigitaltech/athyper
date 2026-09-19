import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const dbRoot = resolve(import.meta.dirname, "../../..");

test("keeps rejected migration tooling out of the active authorization build", async () => {
  const packageJson = JSON.parse(
    await readFile(resolve(dbRoot, "package.json"), "utf8"),
  ) as { scripts: Record<string, string> };
  assert.equal(
    Object.keys(packageJson.scripts).some(
      (name) =>
        name.includes("legacy-retirement") ||
        name.includes("inventory:authorization:legacy"),
    ),
    false,
  );
  for (const path of [
    "scripts/seed/inventory-legacy-permissions.ts",
    "scripts/seed/compile-legacy-permission-retirement.ts",
    "scripts/operations/authorization/migrate-legacy-permissions.ts",
    "seed/contracts/authorization/catalog/aliases/contextual-aliases.v2.json",
  ]) {
    await assert.rejects(access(resolve(dbRoot, path)));
  }
});

test("publishes only exact catalogs and zero-grant authority", async () => {
  for (const plane of ["studio", "neon", "mesh"] as const) {
    const catalog = JSON.parse(
      await readFile(
        resolve(
          dbRoot,
          `seed/contracts/authorization/catalog/${plane}/catalog.v2.json`,
        ),
        "utf8",
      ),
    ) as Record<string, unknown> & {
      permissions: Array<{ canonicalCode: string }>;
    };
    assert.equal("blockedLegacyPermissionCount" in catalog, false);
    assert.equal("excludedNonPermissionCount" in catalog, false);
    assert.equal(
      catalog.permissions.every(
        (permission) =>
          permission.canonicalCode.split(".").length === 4 &&
          permission.canonicalCode.startsWith(`${plane}.`),
      ),
      true,
    );
    const pack = JSON.parse(
      await readFile(
        resolve(
          dbRoot,
          `seed/packs/authorization-v2/${plane}/seed-pack.v1.json`,
        ),
        "utf8",
      ),
    ) as {
      contractVersion: string;
      authority: {
        version: string;
        roles: unknown[];
        groups: Array<{ zeroGrant: boolean }>;
      };
      tenantAuthorityProjection: {
        definitions: { roles: unknown[]; rolePermissions: unknown[] };
        assignments: { groupRoles: unknown[] };
      };
    };
    assert.equal(
      pack.contractVersion,
      "athyper.authorization.clean-slate-seed-pack.v1",
    );
    assert.equal(pack.authority.version, "authorization.clean-slate.v1");
    assert.equal(pack.authority.roles.length, 0);
    assert.deepEqual(
      pack.authority.groups.map((group) => group.zeroGrant),
      [true],
    );
    assert.equal(pack.tenantAuthorityProjection.definitions.roles.length, 0);
    assert.equal(
      pack.tenantAuthorityProjection.definitions.rolePermissions.length,
      0,
    );
    assert.equal(
      pack.tenantAuthorityProjection.assignments.groupRoles.length,
      0,
    );
  }
});

test("guards the destructive reset and reapplies the deny-all pack", async () => {
  const reset = await readFile(
    resolve(
      dbRoot,
      "scripts/operations/authorization/reset-authorization-clean-slate.ts",
    ),
    "utf8",
  );
  assert.match(reset, /assertDestructiveResetAllowed/);
  assert.match(reset, /pg_advisory_xact_lock/);
  assert.match(reset, /TRUNCATE TABLE[\s\S]*authz\.permission/);
  assert.doesNotMatch(reset, /CASCADE/);
  assert.match(reset, /applyAuthorizationSeedPack/);
  assert.match(reset, /SET auth_epoch = auth_epoch \+ 1/);
  assert.match(reset, /event\.fn_authorization_bump_epoch\('plane'/);
  assert.match(reset, /externalSessionRevocationRequired: true/);
  assert.match(reset, /clean-slate postcondition failed/);
});

test("accepts an explicit authorization-pack database target", async () => {
  const applicator = await readFile(
    resolve(dbRoot, "scripts/provisioning/apply-authorization-seed-pack.ts"),
    "utf8",
  );
  const planeApplicator = await readFile(
    resolve(dbRoot, "scripts/provisioning/authorization-pack-applicator.ts"),
    "utf8",
  );
  assert.match(applicator, /databaseUrl: option\(args, "--database-url"\)/);
  assert.match(
    planeApplicator,
    /assertTarget\(client, plane, definition\.databaseName\)/,
  );
});

test("supports catalog-only upgrades without reconciling populated identities", async () => {
  const command = await readFile(
    resolve(dbRoot, "scripts/provisioning/apply-authorization-seed-pack.ts"),
    "utf8",
  );
  const applicator = await readFile(
    resolve(dbRoot, "scripts/provisioning/authorization-pack-applicator.ts"),
    "utf8",
  );
  assert.match(command, /args\.includes\("--catalog-only"\)/);
  assert.match(command, /applyPlaneCatalog/);
  assert.match(applicator, /export async function applyPlaneCatalog/);
  const catalogOnlyBody = applicator.slice(
    applicator.indexOf("export async function applyPlaneCatalog"),
    applicator.indexOf("export async function applyPlaneSeed"),
  );
  assert.doesNotMatch(
    catalogOnlyBody,
    /applyPrincipal|applyMembership|applyRole/,
  );
});

test("limits scope reconciliation to authorization-pack-owned permissions", async () => {
  const applicator = await readFile(
    resolve(dbRoot, "scripts/provisioning/authorization-pack-applicator.ts"),
    "utf8",
  );
  const ownershipFilters =
    applicator.match(/permission\.metadata #>> '\{_seed,source\}'=\$\d/g) ?? [];
  assert.equal(ownershipFilters.length, 2);
  assert.match(
    applicator,
    /\[JSON\.stringify\(declarations\), SYSTEM_PRINCIPAL, SOURCE_REF\]/,
  );
  assert.match(
    applicator,
    /published permissions lack exact scope declarations/,
  );
});
