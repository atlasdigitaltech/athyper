# Country DEV policy enrollment

## Result

Policy `a048d0e2-dcdd-4827-8d1f-d53684209c84`, version **1**, is **active**.
Definition hash: `3757bed2ea06ffb4f13b3495a7cfdf87e079ce22b3cd48462bb5626decc9bb47`.

- `platform.admin` proposed through the restricted HTTPS control API, after
  verified password + OTP authentication. Proposal returned 200 at approximately
  `2026-09-27T04:27:02Z`.
- Admin activation returned **403**. No permission or MFA check was removed.
- `platform.owner` independently activated the exact proposed hash through the
  same restricted API. Activation returned 200 at approximately
  `2026-09-27T04:28:07Z`.
- Database readback confirms separate maker/checker principal IDs, active status,
  matching definition hash, and persisted proposal/activation audit events.
- Six policy tests passed during proposal and passed again during activation:
  exact positive match; wrong pin, tenant, QA, staging and production negatives.

See [sanitized database evidence](country-policy-enrollment-20260927.json).
The checked-in copy is editable, not immutable audit storage. The actual events
were recorded transactionally by the existing database audit service.

## Source and scope

The policy pins canonical draft `bded3c66-95b6-43b9-b8fd-df8e003e54e9`, its
baseline product/contract/descriptor hashes, Studio/Neon/Mesh targets, and the
platform-authority author/publisher workloads. Pins were reread before proposal
and unchanged. The older draft and original maker identity remain intact.

This completes policy enrollment only. No Country publication workload execution,
release signing, target activation or manual-test readiness is claimed here.

## Live defects corrected

1. The dedicated `athyper_control_api` role had table privileges but no matching
   RLS write policies for `metadata.publication`. Initial proposal failed and
   rolled back. Added role-specific policies scoped to the configured DEV authority
   tenant and publication entity type, with authenticated actor stamping. Existing
   policy immutability constraints remain. No administrator membership, bypass-RLS,
   customer policy writer access or RLS disabling was introduced.
2. The policy-test-result default required EXECUTE on `shared.uuidv7()`. Added that
   utility permission to the same dedicated role; the preceding failed transaction
   did not leave a partial policy.
3. The revision-ownership read stamped tenant but omitted principal. It therefore
   could not read the row under the new actor-scoped RLS. The generic revision
   authorizer now passes the authenticated principal to its lookup; the control
   API stamps both coordinates in its transaction. Owner activation then succeeded.

Provisioning source: `server/db/scripts/operations/authorization/prepare-dev-control-api.mjs`
uses the reusable `control-policy-rls.mjs` builder. Only the control API process
was restarted for the identity-context source correction.

## Fresh verification

- Host suite: **668 passed, 25 skipped**; 88 files passed, 3 skipped.
- Host source typecheck: only the pre-existing, deliberately held
  `entity-case-preflight.ts` missing repository import remains.
- RLS suite: **2 passed**, including a real DEV PostgreSQL transaction under
  `SET LOCAL ROLE athyper_control_api`: one permitted scoped draft and three
  rejected tenant/category/actor substitutions. The entire probe rolled back.
- Live control API: running, healthy.
- Updated the existing revision-authorizer assertion for the additional verified
  actor coordinate and added a dedicated regression test. No assertions were
  removed to accommodate the fix.

Reproduce the RLS checks explicitly against DEV:

```sh
CONTROL_POLICY_POSTGRES_TEST=1 node --test server/db/scripts/operations/authorization/control-policy-rls.test.mjs
```

The local active policy pin is retained privately at
`~/.athyper/instances/dev/secrets/dev-publication-athyper/policy-active.json` for
the workload execution step. It contains no bearer token.
