# DEV successor publication — 2026-09-27

The real platform.owner password/OTP session was verified after the separate
platform.admin proposal. The restricted control API activated policy
50c68cb8-dc24-438b-9054-d7936eb65bca version 1 with expected hash
d2583112edeec4dc6001972f65f066d726cc55adbd5aabd8d8f11b99e708834d.

Dedicated author/publisher workload credentials then executed that exact policy.
The execute endpoint returned HTTP 200 and dispatched successor release 2,
56a40636-4d27-411f-be7f-3263994e8c70. No direct runtime data population or
historical signed-release modification was performed.

Live publication deployment rows report activated for Studio, Neon and Mesh at
07:27:34 UTC. Each target activation head is now version 2 with two published
operation bindings. The new authoring release uses athyper-publication-dev-signing-v1.
The operations are list/collection and read/entity_resource, both requiring
common.platform.reference.view. Each plane retains 247 Country rows.

## Evidence and limits

- entity-successor-policy-activation-20260927.json: authenticated owner activation.
- entity-successor-live-20260927.json: independent read-only source/target inventory.
- entity-successor-installed-bindings-20260927.json: installed operation permission bindings.
- Unauthenticated list-descriptor requests returned 401 for all three plane headers.
- These local files are diagnostic evidence, not immutable audit storage.
- Package tests were not rerun this turn: no implementation changed; this was live
  enrollment/execution and verification of the previously tested implementation.
- Authenticated list/detail, sorting/paging, tenant isolation and collaboration
  acceptance are still outstanding. Platform-control login is not a tenant-app
  session. No claim of full manual acceptance is made.

Manual URLs (use separately authorized ordinary tenant accounts):

- https://studio.dev.athyper.test/app/entity/country/manage
- https://neon.dev.athyper.test/app/entity/country/manage
- https://mesh.dev.athyper.test/app/entity/country/manage

The user was asked to refresh Neon and report the actual result. Do not treat
successful activation as proof that all application behaviors pass.
