import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

const dbRoot = resolve(import.meta.dirname, "../../..");
const repositoryRoot = resolve(dbRoot, "../..");

test("reconciles expired trusted devices only at supplied tenant/time coordinates", async () => {
  const functions = await readFile(
    resolve(dbRoot, "ddl/common/authz/07_functions.sql"),
    "utf8",
  );
  const body = functions.slice(
    functions.indexOf(
      "CREATE OR REPLACE FUNCTION authz.fn_reconcile_expired_authority",
    ),
    functions.indexOf("-- Projection mutation routines"),
  );
  assert.match(body, /v_trusted_devices integer/);
  assert.match(
    body,
    /UPDATE authz\.trusted_device[\s\S]*WHERE tenant_id = p_tenant_id[\s\S]*expires_at <= p_effective_at[\s\S]*revoked_at IS NULL/,
  );
  assert.match(body, /GET DIAGNOSTICS v_trusted_devices = ROW_COUNT/);
  assert.match(body, /'trustedDevices',v_trusted_devices/);
  assert.doesNotMatch(body, /trusted_device[\s\S]{0,240}\bnow\s*\(/i);
});

test("runtime remembered-device lookup is exact-plane, exact-principal, and expiry bounded", async () => {
  const platform = await readFile(
    resolve(
      repositoryRoot,
      "server/apps/platform-host/src/composition/register-platform.ts",
    ),
    "utf8",
  );
  const bff = await readFile(
    resolve(repositoryRoot, "packages/platform/iam/auth-bff/src/index.ts"),
    "utf8",
  );
  assert.match(
    platform,
    /registerTrustedDeviceRoutes[\s\S]*tenantContextTransaction\(container, context\.planeKey\)/,
  );
  assert.match(
    platform,
    /UPDATE authz\.trusted_device[\s\S]*tenant_id=\$\{context\.tenantId\}[\s\S]*principal_id=\$\{context\.principalId\}[\s\S]*device_token_hash=\$\{hash\}[\s\S]*revoked_at IS NULL[\s\S]*expires_at>clock_timestamp\(\)/,
  );
  assert.match(
    platform,
    /principal_id=\$\{context\.principalId\}[\s\S]*auth_epoch=\$\{context\.authEpoch\}[\s\S]*device_token_hash=\$\{hash\}/,
  );
  assert.match(
    platform,
    /INSERT INTO authz\.trusted_device[\s\S]*auth_epoch[\s\S]*\$\{context\.authEpoch\}/,
  );
  assert.match(
    bff,
    /!decision\.active[\s\S]*decision\.expiresAt <= effectiveAt/,
  );
});
