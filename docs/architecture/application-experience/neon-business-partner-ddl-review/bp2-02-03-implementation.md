# BP2-02 and BP2-03 implementation record

This implementation extends the existing governed Business Partner request and materialization path. It does not add a generic write surface for addresses, contacts, channels, roles, validation events, or person identities.

## BP2-02 — address graph

- `address/core` now describes directory-backed subdivision codes, manual region text, IANA time zones, structured address fields, and the existing country reference. The former US-only postal-code metadata condition was removed. Country-specific labels, examples, and postal rules remain in the registered country address policy; validation is server-authoritative.
- A submitted directory subdivision is validated with its selected country and active state/region reference. A manual region cannot carry a subdivision code. Time zones are verified against the active shared registry in the same governed-capture transaction.
- The native address editor now has a declared country dependency: changing country clears the selected subdivision, clears a directory-derived region, and retains a manual region. It also exposes the bounded `shared.timezone` lookup. This is implemented through generic metadata conditions, not BP field-name checks.
- `address_link/core` now separates canonical address data from link purpose, role qualifier, attention, usage state, denial reason, primary selection, and effective dates. The existing polymorphic owner binding remains the authority boundary.
- The addresses detail DTO and registered presentation include `stateRegionCode`, `regionEntryMode`, and `timezoneCode`. Address events remain a read-only, safe timeline: it returns event type, time, result, confidence, and reason only—never insertion capability or provider payload.
- A governed materialization now invalidates the Addresses section and primary-address summary along with the existing header/action resources.
- The materializer persists the submitted `timezoneCode` to `master.address.timezone_code`; the integration SQL fixture asserts both subdivision and time-zone persistence.

## BP2-03 — contact graph

- `contact_person/core` now has an explicit polymorphic owner contract and typed relations to role and channel projections.
- `contact_person_role/core` and `contact_channel/core` describe the existing registered aggregate, including temporal role/channel state and email/phone quality indicators. They disable generic writes.
- The existing contact renderer remains the only Business Partner contact surface. It already resolves safe names, roles, verified state, normalized channel values, and quality from the registered aggregate.
- Native intake now captures an optional normalized contact role. The governed relationship payload carries it to the existing `master.contact_person_role` materialization path.
- `master.contact_person_identity_link` is deliberately absent from Business Partner projections. The authorized customer-portal delivery path remains its consumer; no person profile or protected identity field is joined into contact cards.
- A governed materialization now invalidates Contacts and the primary-contact summary without relying on an unrelated Business Partner version increment.

## Verification

- `python3 tooling/scripts/metadata/validate.py`
- `python3 -m unittest tooling/scripts/metadata/test_validate.py`
- `pnpm metadata:check-layout`
- `pnpm --filter @athyper/product-neon-business-partner exec vitest run src/data-surface.test.tsx src/request-relationships.test.ts --reporter=dot --pool=threads --maxWorkers=1` — 18 passing.
- `pnpm --filter @athyper/server-service-master-data exec vitest run src/__tests__/business-partner-case-service.test.ts src/__tests__/business-partner-related-presentation.test.ts src/business-partner-atlas-contacts.test.ts --reporter=dot --pool=threads --maxWorkers=1` — 86 passing.
- Contract, Business Partner UI, form-detail, and master-data typechecks pass.

## Environment-gated verification

The disposable PostgreSQL suite covers primary-address overlap, foreign-owner access, normalized contact duplicates, and verification evidence. It is intentionally skipped without `ATHYPER_MASTER_DATA_DB_TESTS=true` and `ATHYPER_MASTER_DATA_TEST_DATABASE_URL`; run it against the disposable DDL database before releasing the DDL change. The source changes are not published or activated.
