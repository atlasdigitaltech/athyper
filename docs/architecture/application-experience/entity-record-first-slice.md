# Entity-driven record page: first implementation slice

## Implemented boundary

The existing Business Partner URL now imports the narrow product `./record` entry. Its compatibility component delegates to `EntityRecordPage` with a typed Business Partner adapter. Public URLs, entity/operation identifiers, published artifacts, database schema and permissions are unchanged.

### Shared frontend

`packages/platform/entity/runtime/form-detail/src/record/`

- `entity-record-page.tsx`: page composition, header, action lifecycle; resets page-local state when entity, record or authorization identity changes.
- `record-contracts.ts`: entity adapter and operation contracts.
- `record-navigation.tsx`: metadata-admitted tabs/sections and action controls.
- `record-url-state.ts`: section/context/deep-link parsing.
- `record-view-preferences.ts`: explicit entity-specific storage keys; preserves BP's existing key.
- `use-record-collaboration.ts`: panel URL/state transitions and history restoration.
- `record-body.tsx`: content, section outline, summaries and collaboration placement.
- `protected-operation-registry.ts`: own-property allowlist dispatch; unknown/inherited operations and historical reveal fail before invoking a handler. This is not an authorization grant.
- `record.css`, `record-collaboration.css`: styles extracted from the BP stylesheet under entity-neutral selectors.
- `index.ts`: narrow `@athyper/platform-entity-form-detail/record` export.

The existing `EntityRuntimeWorkspace` remains the data/rendering engine. Continuous section mode is selected by metadata group membership, not a Business Partner tab key. Published field/lookup/protection definitions remain authoritative.

### Product adapter

`packages/planes/neon/business-partner/src/record/adapter.tsx` owns BP labels, public record/workflow destinations, legacy tab compatibility, and the identifier/tax/bank reveal registrations. The existing section/commercial clients and backend policy checks remain unchanged.

`src/record-runtime.tsx` is a small compatibility entry; it remains because existing exports still refer to it. The older `360/business-partner-360.tsx` and other workflow screens were not deleted: their remaining consumers/tests require separate retirement analysis. The duplicated record-page implementation and its extracted CSS were removed from the BP sources.

### Server composition adapters

`server/apps/platform-host/src/composition/entities/`

- `business-partner-record-providers.ts`: BP header, section and summary registrations/projections. All reads still call existing authorized domain services. Header reads explicitly reject another entity rather than interpreting its record ID as a partner ID.
- `record-display-choices.ts`: existing tenant-aware catalog lookup readers.

The host assembly now registers these factories instead of embedding their implementations. These are composition adapters, so they stay at the host boundary: the master-data domain package does not acquire a dependency on the presentation runtime. Generic comments/files service providers and unrelated operation registrations remain in the host for a later, separate extraction.

## Verification and limits

- Shared-page integration tests exercise `business_partner` and the existing `contact_person` entity using their real core field metadata, the same runtime/renderer, and mocked transport responses. They also test section navigation, preference isolation and reveal allowlist denial.
- This proves frontend reuse, **not** a deployed standalone Contact detail journey. No Contact route, standalone backend provider or new metadata surface was published. That rollout still requires its normal parent/record authorization contract.
- Protected-value UI tests, metadata section tests, BP projection/reveal tests and provider-boundary tests are retained/run alongside the new coverage.
- Existing DEV organization/person BP section APIs, navigation and protected bank reveal are smoke-tested with normal saved sessions. No reset, data reseed or permission expansion is part of this refactor.

## Next extraction, not included

Generic public-alias routing, further package renaming, a standalone second-entity deployment, and relocation of metadata files are separate changes. They should not be inferred from the source-folder cleanup or from transport-mocked component coverage.
