# Entity Activity: earlier-phase source inventory

Inspected 2026-09-28. This maps the earlier implementation and its shared integration dependencies in the current working tree. It is not a release artifact manifest or a claim that every listed file was newly created by Activity. Deployment scope is taken from the saved rollout receipts; no live environment was queried for this inventory.

Country release 9 was recorded as active on Studio, Neon and Mesh with Audit log and manual Saved snapshots. Audit entries have a timeline-style presentation within Audit log. The separate grouped Timeline tab in `entity-activity-comparison-v2.html` is a newer design prototype, not part of that rollout. Versions/automatic recording infrastructure exists but is disabled for Country.

The shell-wide Activity Center/notification inbox is a different capability and is deliberately excluded. The Country metadata file is configuration only; the UI, API and providers are reusable.

## Reusable UI, navigation and localization

- [packages/platform/entity/runtime/form-detail/src/activity-workspace.tsx](../../../packages/platform/entity/runtime/form-detail/src/activity-workspace.tsx)
- [packages/platform/entity/runtime/form-detail/src/detail-collaboration.tsx](../../../packages/platform/entity/runtime/form-detail/src/detail-collaboration.tsx)
- [packages/platform/entity/runtime/form-detail/src/collaboration-surface.tsx](../../../packages/platform/entity/runtime/form-detail/src/collaboration-surface.tsx)
- [packages/platform/entity/runtime/form-detail/src/detail-workspace.tsx](../../../packages/platform/entity/runtime/form-detail/src/detail-workspace.tsx)
- [packages/platform/entity/runtime/form-detail/src/record/record-navigation.tsx](../../../packages/platform/entity/runtime/form-detail/src/record/record-navigation.tsx)
- [packages/platform/entity/runtime/form-detail/src/record/write-record-location.ts](../../../packages/platform/entity/runtime/form-detail/src/record/write-record-location.ts)
- [packages/platform/entity/runtime/form-detail/src/styles.css](../../../packages/platform/entity/runtime/form-detail/src/styles.css)
- [packages/platform/shell/shell/src/record-footer.tsx](../../../packages/platform/shell/shell/src/record-footer.tsx)
- [packages/platform/foundation/i18n/src/catalogs/collaboration.ts](../../../packages/platform/foundation/i18n/src/catalogs/collaboration.ts)

## Browser client and public contracts

- [packages/platform/entity/runtime/descriptor-client/src/activity-client.ts](../../../packages/platform/entity/runtime/descriptor-client/src/activity-client.ts)
- [packages/platform/entity/runtime/descriptor-client/src/index.ts](../../../packages/platform/entity/runtime/descriptor-client/src/index.ts)
- [packages/contracts/platform/entity-runtime/src/activity.ts](../../../packages/contracts/platform/entity-runtime/src/activity.ts)
- [packages/contracts/platform/entity-runtime/src/index.ts](../../../packages/contracts/platform/entity-runtime/src/index.ts)
- [packages/platform/gateway/bff-relay/src/index.ts](../../../packages/platform/gateway/bff-relay/src/index.ts)

## Activity API, authorization and host bindings

- [server/packages/platform/experience/src/entity-activity-routes.ts](../../../server/packages/platform/experience/src/entity-activity-routes.ts)
- [server/packages/platform/experience/src/entity-activity-service.ts](../../../server/packages/platform/experience/src/entity-activity-service.ts)
- [server/packages/platform/experience/src/entity-activity-policy.ts](../../../server/packages/platform/experience/src/entity-activity-policy.ts)
- [server/packages/platform/experience/src/entity-capability-policy.ts](../../../server/packages/platform/experience/src/entity-capability-policy.ts)
- [server/apps/platform-host/src/composition/shared/entity-runtime/activity-provider.ts](../../../server/apps/platform-host/src/composition/shared/entity-runtime/activity-provider.ts)
- [server/apps/platform-host/src/composition/activity-presentation.ts](../../../server/apps/platform-host/src/composition/activity-presentation.ts)
- [server/apps/platform-host/src/composition/register-services.ts](../../../server/apps/platform-host/src/composition/register-services.ts)
- [server/apps/platform-host/src/composition/shared/publication/capability-qualification.ts](../../../server/apps/platform-host/src/composition/shared/publication/capability-qualification.ts)

## Snapshot persistence and existing snapshot service

- [server/packages/services/records/src/snapshots/activity-snapshot-repository.ts](../../../server/packages/services/records/src/snapshots/activity-snapshot-repository.ts)
- [server/packages/services/records/src/snapshots/kysely-snapshot-repository.ts](../../../server/packages/services/records/src/snapshots/kysely-snapshot-repository.ts)
- [server/packages/services/records/src/snapshots/snapshot-service.ts](../../../server/packages/services/records/src/snapshots/snapshot-service.ts)
- [server/packages/services/records/src/snapshots/snapshot-routes.ts](../../../server/packages/services/records/src/snapshots/snapshot-routes.ts)

## Authoritative history and automatic recording (not enabled for Country)

- [server/packages/services/records/src/record-history.ts](../../../server/packages/services/records/src/record-history.ts)
- [server/packages/services/records/src/entity-list-service.ts](../../../server/packages/services/records/src/entity-list-service.ts)
- [server/apps/platform-host/src/composition/shared/entity-runtime/activity-recording.ts](../../../server/apps/platform-host/src/composition/shared/entity-runtime/activity-recording.ts)
- [server/db/ddl/common/snapshot/12_record_history.sql](../../../server/db/ddl/common/snapshot/12_record_history.sql)
- [server/db/migrations/20260928_record_history.sql](../../../server/db/migrations/20260928_record_history.sql)

## Meta Entity profiles, enrollment and publication

- [metadata/profiles/activity/source-lock.json](../../../metadata/profiles/activity/source-lock.json)
- [metadata/profiles/activity/recorded-root.v1.json](../../../metadata/profiles/activity/recorded-root.v1.json)
- [metadata/profiles/activity/recorded-owned.v1.json](../../../metadata/profiles/activity/recorded-owned.v1.json)
- [metadata/profiles/activity/recorded-root.v2.json](../../../metadata/profiles/activity/recorded-root.v2.json)
- [metadata/profiles/activity/standard.v1.json](../../../metadata/profiles/activity/standard.v1.json)
- [metadata/products/shared/entities/country/activity.json](../../../metadata/products/shared/entities/country/activity.json)
- [server/packages/contracts/publication/src/activity-policy.ts](../../../server/packages/contracts/publication/src/activity-policy.ts)
- [server/packages/contracts/publication/src/activity-binding.ts](../../../server/packages/contracts/publication/src/activity-binding.ts)
- [server/packages/contracts/publication/src/activity-enrollment.ts](../../../server/packages/contracts/publication/src/activity-enrollment.ts)
- [server/packages/contracts/publication/src/activity-permissions.ts](../../../server/packages/contracts/publication/src/activity-permissions.ts)
- [server/packages/contracts/publication/src/entity-capabilities.ts](../../../server/packages/contracts/publication/src/entity-capabilities.ts)
- [server/packages/contracts/publication/src/artifact.ts](../../../server/packages/contracts/publication/src/artifact.ts)
- [server/packages/services/publication/src/compiled-entity-artifact-compiler.ts](../../../server/packages/services/publication/src/compiled-entity-artifact-compiler.ts)
- [server/packages/platform/metadata/src/compiled-entity-reader.ts](../../../server/packages/platform/metadata/src/compiled-entity-reader.ts)
- [server/packages/planes/studio/meta-entity-authoring/src/authoring/adopt-capability-profiles.ts](../../../server/packages/planes/studio/meta-entity-authoring/src/authoring/adopt-capability-profiles.ts)
- [server/packages/planes/studio/meta-entity-authoring/src/authoring/capability-profile-files.ts](../../../server/packages/planes/studio/meta-entity-authoring/src/authoring/capability-profile-files.ts)
- [server/packages/planes/studio/meta-entity-authoring/src/publication/amend-successor-capabilities.ts](../../../server/packages/planes/studio/meta-entity-authoring/src/publication/amend-successor-capabilities.ts)
- [server/db/scripts/provisioning/prepare-entity-activity.ts](../../../server/db/scripts/provisioning/prepare-entity-activity.ts)

## DDL, permission registration and rollout tooling

- [server/db/migrations/20260928_entity_activity_authoring.sql](../../../server/db/migrations/20260928_entity_activity_authoring.sql)
- [server/db/migrations/20260928_entity_activity_permissions.sql](../../../server/db/migrations/20260928_entity_activity_permissions.sql)
- [server/db/ddl/common/authz/19_common_activity_permissions.sql](../../../server/db/ddl/common/authz/19_common_activity_permissions.sql)
- [server/db/ddl/common/snapshot/02_domains.sql](../../../server/db/ddl/common/snapshot/02_domains.sql)
- [server/db/ddl/common/snapshot/03_tables.sql](../../../server/db/ddl/common/snapshot/03_tables.sql)
- [server/db/ddl/common/snapshot/05_constraints.sql](../../../server/db/ddl/common/snapshot/05_constraints.sql)
- [server/db/ddl/common/snapshot/06_indexes.sql](../../../server/db/ddl/common/snapshot/06_indexes.sql)
- [server/db/ddl/common/snapshot/07_functions.sql](../../../server/db/ddl/common/snapshot/07_functions.sql)
- [server/db/ddl/common/snapshot/08_triggers.sql](../../../server/db/ddl/common/snapshot/08_triggers.sql)
- [server/db/ddl/common/snapshot/09_views.sql](../../../server/db/ddl/common/snapshot/09_views.sql)
- [server/db/ddl/common/snapshot/10_rls.sql](../../../server/db/ddl/common/snapshot/10_rls.sql)
- [server/db/ddl/common/snapshot/11_grants.sql](../../../server/db/ddl/common/snapshot/11_grants.sql)
- [server/db/ddl/common/snapshot/12_record_history.sql](../../../server/db/ddl/common/snapshot/12_record_history.sql)
- [server/db/scripts/operations/publication/install-dev-activity.mjs](../../../server/db/scripts/operations/publication/install-dev-activity.mjs)
- [server/db/scripts/operations/authorization/refresh-dev-test-admin.mjs](../../../server/db/scripts/operations/authorization/refresh-dev-test-admin.mjs)

## Direct Activity tests

- [tests/foundation-browser/entity-activity.spec.ts](../../../tests/foundation-browser/entity-activity.spec.ts)
- [server/db/scripts/__tests__/activity/activity-ddl.test.ts](../../../server/db/scripts/__tests__/activity/activity-ddl.test.ts)
- [server/db/scripts/__tests__/activity/activity-permissions.test.ts](../../../server/db/scripts/__tests__/activity/activity-permissions.test.ts)
- [server/db/scripts/__tests__/activity/entity-activity-preparation.test.ts](../../../server/db/scripts/__tests__/activity/entity-activity-preparation.test.ts)
- [server/apps/platform-host/src/composition/__tests__/activity-presentation.test.ts](../../../server/apps/platform-host/src/composition/__tests__/activity-presentation.test.ts)
- [server/apps/platform-host/src/composition/__tests__/activity-qualification.test.ts](../../../server/apps/platform-host/src/composition/__tests__/activity-qualification.test.ts)
- [server/apps/platform-host/src/composition/__tests__/activity-recording.test.ts](../../../server/apps/platform-host/src/composition/__tests__/activity-recording.test.ts)
- [server/apps/platform-host/src/composition/__tests__/entity-activity-provider.test.ts](../../../server/apps/platform-host/src/composition/__tests__/entity-activity-provider.test.ts)
- [server/packages/platform/experience/src/entity-activity-policy.test.ts](../../../server/packages/platform/experience/src/entity-activity-policy.test.ts)
- [server/packages/platform/experience/src/entity-activity-routes.test.ts](../../../server/packages/platform/experience/src/entity-activity-routes.test.ts)
- [server/packages/platform/experience/src/entity-activity-service.test.ts](../../../server/packages/platform/experience/src/entity-activity-service.test.ts)
- [server/packages/services/records/src/__tests__/activity-snapshot.postgres.test.ts](../../../server/packages/services/records/src/__tests__/activity-snapshot.postgres.test.ts)
- [server/packages/services/records/src/__tests__/record-history.postgres-case.ts](../../../server/packages/services/records/src/__tests__/record-history.postgres-case.ts)
- [server/packages/services/publication/src/__tests__/activity-publication.test.ts](../../../server/packages/services/publication/src/__tests__/activity-publication.test.ts)
- [server/packages/platform/metadata/src/__tests__/activity-reader.test.ts](../../../server/packages/platform/metadata/src/__tests__/activity-reader.test.ts)
- [server/packages/contracts/publication/src/__tests__/activity-binding.test.ts](../../../server/packages/contracts/publication/src/__tests__/activity-binding.test.ts)
- [server/packages/contracts/publication/src/__tests__/activity-profile.test.ts](../../../server/packages/contracts/publication/src/__tests__/activity-profile.test.ts)

## Design, API and deployment evidence

- [docs/architecture/application-experience/entity-activity-implementation-plan.md](entity-activity-implementation-plan.md)
- [docs/architecture/application-experience/entity-activity-api.md](entity-activity-api.md)
- [docs/architecture/application-experience/entity-activity-recording.md](entity-activity-recording.md)
- [docs/reports/entity-activity-rollout-20260928.md](../../reports/entity-activity-rollout-20260928.md)
- [docs/reports/activity-dev-compiler-preflight-20260928.json](../../reports/activity-dev-compiler-preflight-20260928.json)
- [docs/reports/activity-dev-install-20260928.json](../../reports/activity-dev-install-20260928.json)
- [docs/reports/activity-dev-persistence-preflight-20260928.json](../../reports/activity-dev-persistence-preflight-20260928.json)
- [docs/reports/activity-dev-runtime-20260928.json](../../reports/activity-dev-runtime-20260928.json)
- [docs/reports/activity-full-admin-access-20260928.json](../../reports/activity-full-admin-access-20260928.json)
- [docs/reports/activity-successor-baseline-20260928.json](../../reports/activity-successor-baseline-20260928.json)
- [docs/reports/activity-successor-draft-20260928.json](../../reports/activity-successor-draft-20260928.json)
- [docs/reports/activity-successor-execution-20260928.json](../../reports/activity-successor-execution-20260928.json)
- [docs/reports/activity-successor-policy-activation-20260928.json](../../reports/activity-successor-policy-activation-20260928.json)
- [docs/reports/activity-successor-policy-candidate-20260928.json](../../reports/activity-successor-policy-candidate-20260928.json)
- [docs/reports/activity-successor-policy-proposal-20260928.json](../../reports/activity-successor-policy-proposal-20260928.json)
- [docs/reports/activity-successor-postflight-20260928.json](../../reports/activity-successor-postflight-20260928.json)
- [docs/reports/activity-successor-target-receipts-20260928.json](../../reports/activity-successor-target-receipts-20260928.json)
- [docs/reports/activity-full-admin-grants-20260928.jsonl](../../reports/activity-full-admin-grants-20260928.jsonl)

## Storage installation wrappers

The common snapshot DDL is installed through the plane-specific SQL wrappers in `server/db/ddl/planes/{studio,neon,mesh}/snapshot/`. Existing audit storage belongs to the corresponding audit DDL; the Activity provider reads that existing foundation.

## Newer design work, excluded from the earlier rollout

- `docs/prototypes/entity-activity-comparison-v2.html`, its `.checks.mjs`, and associated screenshots.
- `docs/architecture/application-experience/entity-activity-ux-requirements.md`.
- `docs/architecture/application-experience/entity-activity-ux-audit-review.md`.

Canonical permissions: `common.audit.event.query`, `common.records.snapshot.read`, `common.records.snapshot.capture`. Registration and role grants are separate; see the full-admin grant/access receipts for the DEV repair.
