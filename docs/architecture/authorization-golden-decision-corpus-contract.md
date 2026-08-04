# Authorization golden-decision corpus contract

- Contract version: 1
- Evidence classification: restricted
- Runtime behavior changed by capture: none
- Source authority mutated by capture: none

## Purpose

The Wave 0 corpus preserves authorization behavior at exact database
watermarks. It is both a migration comparison input and a release gate. A
generated JSON file is not "golden" merely because it can be written: strict
verification certifies it only after every engine, context, identity, boundary,
provenance, and disagreement gate passes.

The repository contracts are:

- `server/db/scripts/reports/capture-authorization-golden-corpus.ts`
- `server/db/scripts/reports/verify-authorization-golden-corpus.ts`
- `config/governance/authorization-golden-corpus.schema.json`
- `config/governance/authorization-external-identity-evidence.schema.json`
- `config/governance/authorization-supplemental-decision-evidence.schema.json`

Environment evidence contains stable principal UUIDs and must remain in the
restricted evidence store, not source control.

## Direct capture and supplemental evaluator evidence

The exporter captures these observations directly from read-only,
repeatable-read Neon and Mesh snapshots:

- all active Neon principals;
- all active high/critical Neon permissions and their enabled entity
  operations;
- legacy single, batch, and eligible Admin tenant-capability outcomes;
- all active Mesh principals, synchronized identity bindings, and active
  account grants;
- durable database identity and authorization change-capture watermarks.

Mesh evaluator outcomes and controlled resource-context scenarios are supplied
as one or more separately captured supplemental evidence files. The command
line option is repeatable. Each file is normalized, schema-validated, and
bound to:

- the checked-out repository revision;
- the checked-in governance catalog hash;
- exactly one plane;
- that plane's durable `source_database_id` and capture watermark;
- an evaluator identifier and revision;
- a hashed plane-local high-risk action catalog;
- hashed principals, actions, cases, and disagreement records.

Only supplemental evidence matching the direct snapshot boundary contributes
to coverage. Missing or stale evidence remains visible as a failed gate.
Editing stored gate booleans cannot certify a corpus because the verifier
recomputes all gates.

## Certification requirements

A strict corpus requires:

1. every active Neon principal and user and every selected high-risk action;
2. every active Mesh principal and user, with a Mesh decision for every
   active-principal/action pair;
3. every legacy engine named by the checked-in catalog;
4. every required context class, backed by deterministic fixtures where live
   production state cannot safely express a scenario;
5. every observed legacy-engine disagreement classified;
6. non-null durable capture watermarks and distinct Neon and Mesh
   `source_database_id` values;
7. enabled external-authority subjects reconciled to enabled, synchronized,
   active plane-local bindings;
8. a clean committed repository whose revision and catalog hash match all
   evidence.

Empty principal, user, action, or Mesh inventories never satisfy strict
coverage.

## Identity-authority evidence

External identity evidence contains no name, username, email, token,
credential, or raw subject identifier. It contains enabled subjects only. Its
normalized subject key is:

```text
sha256(canonical_json({
  realmKey,
  providerCode,
  subjectSha256
}))
```

Each subject declares one or more expected planes from `neon`, `admin`, and
`mesh`. Neon and Admin share one physical identity projection, so either
expectation reconciles against Neon DB. This does not replace the separate
Admin plane-membership and target-tenant shadow-principal controls. Mesh
expectations reconcile against Mesh DB.

Only bindings attached to active principals count:

- Neon/Admin: `idp_enabled = true` and `sync_status = 'synced'`;
- Mesh: `sync_status = 'synced'`.

Missing expected bindings, active local bindings absent from the enabled
authority snapshot, an empty enabled-user set, or a hash mismatch fails strict
verification.

## Decision identity and scenario coverage

Direct version 1 cases preserve the current permission-level capability
behavior. Supplemental cases provide the certifiable operation/context
identity:

```text
plane
+ authority_scope_id
+ plane_membership_id
+ principal_id
+ entity_operation_id
+ permission_id and permission_code
+ context_class
+ resource_type
+ hashed resource_id or deterministic sentinel
+ legacy engine
```

The evidence file separately binds the policy/evaluator revision, decision
catalog, repository revision, and source watermark. Multiple operations
sharing one permission remain distinct cases.

The live exhaustive cross-product and the controlled scenario corpus are
separate evidence sets:

- live coverage proves every active principal and high-risk action is present;
- deterministic fixtures prove owned/in-scope/out-of-scope, cross-boundary,
  missing-record, explicit-deny, expired-authority, entitlement-unavailable,
  and MFA/workflow/segregation-of-duties behavior without mutating production
  authority.

Fixture principals must be marked `certification_fixture`; production
principals must be marked `active_inventory`. Fixture cases can satisfy context
coverage but cannot satisfy the complete active Mesh principal inventory.

## Capture and verification

A complete boundary contains database identity, snapshot and WAL coordinates,
the durable authorization `source_database_id`, capture contract version,
installation time, and current commit-ordered watermark.

Example:

```powershell
pnpm.cmd --dir server/db exec tsx scripts/reports/capture-authorization-golden-corpus.ts `
  --identity-evidence=D:\restricted\enabled-identity-evidence.json `
  --supplemental-decision-evidence=D:\restricted\mesh-decisions.json `
  --supplemental-decision-evidence=D:\restricted\resource-contexts.json `
  --output=D:\restricted\golden-decision-corpus.json `
  --strict

pnpm.cmd --dir server/db exec tsx scripts/reports/verify-authorization-golden-corpus.ts `
  --corpus=D:\restricted\golden-decision-corpus.json `
  --strict
```

The exporter still writes a diagnostic corpus when non-strict capture has
gaps. Strict capture or verification exits non-zero until all derived gates
pass.
