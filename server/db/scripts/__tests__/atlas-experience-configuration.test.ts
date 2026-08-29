import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"../.."),migration=readFileSync(resolve(root,"migrations/20260829_atlas_experience_configuration.sql"),"utf8");

test("Atlas experience releases are tenant-scoped, versioned, bounded, and plane-local",()=>{assert.match(migration,/UNIQUE \(tenant_id, scope, revision\)/);assert.match(migration,/WHERE status = 'published'/);assert.match(migration,/octet_length\(definition::text\) <= 131072/);assert.match(migration,/FORCE ROW LEVEL SECURITY/);assert.match(migration,/tenant_id = shared\.current_tenant_id/);assert.doesNotMatch(migration,/GRANT SELECT, INSERT, UPDATE[^\n]+athyperapp/);for(const plane of ["studio","neon","mesh"]){const manifest=readFileSync(resolve(root,`migrations/manifests/${plane}.txt`),"utf8");assert.match(manifest,/20260829_atlas_experience_configuration\.sql/);}});
