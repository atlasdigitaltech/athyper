# Authorization release gates

The authorization release is ready only when every gate in
`athyper.authorization.release-validation-gates.v1` is `pass`. `not_run` is
never success.

```powershell
# Static report; remains exit-code zero while live evidence is absent.
pnpm --filter @athyper/server-db run db:verify:authorization:release:report

# Strict static and live reports.
pnpm --filter @athyper/server-db run db:verify:authorization:release
pnpm --filter @athyper/server-db run db:verify:authorization:release:live

# Mutating proof against three distinct disposable plane databases.
pnpm --filter @athyper/server-db run db:verify:authorization:release:idempotency
```

The clean-slate baseline requires:

- no prohibited permission identity in source or live catalogs;
- no roles, role-permission grants, group-role grants, delegations, overrides,
  ACL allows, or deny rules in any reset plane;
- every admitted Keycloak subject projected only into a zero-grant quarantine
  group;
- exact scope declarations for every catalog permission;
- operation bindings that resolve one entity operation to one canonical
  permission and complete scope coordinates;
- Studio-owned projection provenance and function-only reconciler mutation;
- fail-closed evaluator coverage for tenant, permission, expiry, and generic
  mutation boundaries;
- byte-equivalent authorization snapshots after a second pack application;
- live three-plane RLS, suspension, projection ownership, and topology checks.

The application-demand catalog and reviewed role bundles are intentionally not
created by migration. Enforcement remains disabled until those business
contracts are authored and the full gate is green.
