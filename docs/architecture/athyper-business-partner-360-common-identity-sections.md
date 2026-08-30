# Business Partner 360 common identity sections — BS360-03

Status: In progress  
Build date: 2026-08-30

## Delivered increments

### Identity

The independently authorized Identity reader returns allowlisted canonical Business Partner fields, aliases, lifecycle, legal facts, parent identity, current industry classifications, person-safe canonical naming joins, and registered-owner external references. It never reads `person_sensitive_profile`.

### Contacts

The Contacts reader resolves the `business_partner` and `contact_person` owner types, then returns current named contacts, effective roles, title/department, and effective email/phone-family channels with primary, verification, and safe quality state.

### Addresses

The Addresses reader resolves the registered Business Partner owner type and returns current effective address links by purpose. Postal presentation, validation status/provider/confidence, primary state, and the five most recent allowlisted address events are included; event payloads are excluded.

### Identifiers and tax

The default reader selects masked presentation metadata only. It includes scheme, issuer/country, jurisdiction, verification, primary/effective state, and external integration coordinates. It does not select `identifier_value`, `registration_number`, protected tokens, or restricted person fields.

Tax reveal is a separate POST command guarded by the elevated reveal permission, a validated purpose, record visibility, a protected-value resolver port, transactional audit, `private, no-store`, and a 60-second response lifetime. Audit metadata contains coordinates, purpose, and expiry only—never the token or disclosed value. The default composition deliberately returns provider-unavailable until a production protected-value resolver is configured.

## Pagination and isolation

Each common section uses a record- and section-bound opaque cursor. The cursor preserves a snapshot timestamp and a `(created_at,id)` keyset, so later inserts do not move rows between pages. Current/effective predicates are evaluated against the resolved Business Partner `asOf` date.

The client loads each section independently with its own abort controller and permission-epoch query key. A section failure renders locally while the identity header, scope bar, navigation, and previously loaded summary remain mounted. No masked or revealed value is placed in URLs, telemetry, toast/error text, local storage, or session storage. Reveal state is cleared on close, expiry, and component disposal.

Propose-change links carry only Business Partner ID, request kind, and section code into the governed request entry point. BS360-09 remains responsible for definition-driven completeness and missing-field actions.

## Evidence and remaining gates

Contract, service, client, static security, host, relay, and NEON typechecks/tests cover section authorization, cursor validation, masked reads, typed-child table coverage, reveal audit hygiene, URL/storage exclusion, and local failure behavior.

Before this slice is marked complete, a disposable NEON database must prove applied BS360-01 fixtures across every section, concurrent-insert cursor behavior, expired/current/primary ordering, and owner collisions. Browser automation must prove drawer expiry and route-change cleanup. Production reveal remains disabled until a protected-value resolver and its step-up/replay operational tests are supplied.
