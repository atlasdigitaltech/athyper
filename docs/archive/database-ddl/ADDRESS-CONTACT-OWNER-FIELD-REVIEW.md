# Address, contact, consent, and owner-type field review

Date: 2026-07-30

Status: implemented in the Athyper, Neon, and Mesh plane-local foundation DDL.

Implementation scope:

- `control.owner_type`
- `control.owner_type_purpose`
- `master.address`
- `master.address_link`
- `master.contact_link`
- `master.contact_email`
- `master.contact_phone`

`contact_marketing_consent` remains parked for the later governance/event
review.

Accepted decision:

- use plane-local `control.owner_type`;
- permit customer-defined owner types through a guarded registration workflow;
- permit a registered custom table to own addresses and/or contacts;
- do not permit unrestricted direct writes to routing metadata.

## Executive decision

Instantiate the reusable address/contact contract in each plane database. Do
not put mutable tenant or account data in `common/shared`.

| Object | Athyper | Neon | Mesh | Recommendation |
|---|---|---|---|---|
| `master.address` | Yes | Yes | Yes | Common field contract, plane-local rows |
| `master.address_link` | Yes | Yes | Yes | Common polymorphic link contract |
| `master.contact_link` | Yes | Yes | Yes | Canonical contact channel |
| `master.contact_email` | Yes | Yes | Yes | Slim email operational extension |
| `master.contact_phone` | Yes | Yes | Yes | Slim phone enrichment extension |
| `master.contact_marketing_consent` | No | No as currently modelled | No | Redesign as Neon governance/event capability first |
| `master.owner_type` | No | No | No | Replace with guarded, plane-local `control.owner_type` |

The three planes can share the DDL shape while using different seeded and
customer-registered owner types. Neon needs ERP owners such as supplier,
customer, company code, and site. Mesh needs network/account owners. Athyper
needs tenant, workspace, module, and principal owners. This is why the registry
is plane-local rather than common data.

## Current-state findings that must be corrected

1. `master.contact_marketing_consent` has no RLS enablement, no policies, and
   no tenant foreign key. `athyperapp` currently has `SELECT`, so the table can
   expose consent evidence across tenants.
2. Marketing consent is unique only by owner. One mutable row plus a
   `channel_scope[]` cannot represent email opt-in and SMS opt-out
   simultaneously, cannot separate consent purposes, and does not retain a
   legally useful event history.
3. `contact_link.status` permits only `active` and `deprecated`, while runtime
   bounce handling writes `inactive`. That path will fail its check constraint.
4. `address_dedup_uq` omits `line2`, `line3`, and attention/addressee
   information. It can incorrectly merge distinct units at the same street and
   postal code.
5. Address primary periods are correctly protected by the
   `address_link_one_primary_excl` GiST exclusion constraint. Contact primary
   selection is correctly protected by `ux_contact_link_one_primary`. Preserve
   these guarantees in the new contract.
6. `owner_type.allowed_*_purposes` is advisory only. The service layer also
   hard-codes purpose sets, so the two sources can drift.
7. The current tenant-created owner-type path allows routing metadata to be
   written too freely. Identifier quoting prevents SQL injection, but a custom
   row marked non-tenant-scoped can still become an existence oracle for UUIDs
   outside its tenant. Customer extensions therefore require a guarded
   registration function, approved schema, mandatory tenant column, and forced
   RLS.
8. The `owner_type` in-use guard checks only contact and address links even
   though the discriminator is also used by bank-account links,
   certifications, commodity classifications, party identifiers, tax
   profiles, and consent. Deprecation/deletion can therefore break other
   polymorphic references.
9. The lookup seed for `master.owner_type_category` uses
   `principal/group/system/external`, while the table check and owner seeds use
   `identity/party/structure/asset/custom`. The lookup contract and physical
   constraint disagree.
10. The owner registry advertises broad extensibility, but the primary runtime
    route accepts only `tenant`, `legal_entity`, and `company_code`. The
    database and API contracts are not actually dynamic in the same way.
11. Mesh's current direct `account_code` model has real foreign keys and
    correctly enforces one current primary address/contact. It is stronger for
    account-only ownership, but cannot be reused once Mesh contacts also belong
    to principals, relationships, or other plane entities.

## 1. `master.address`

Recommended desired-state fields:

| Field | Decision | Review |
|---|---|---|
| `id` | Keep/common | UUIDv7 primary key |
| plane scope | Keep/plane-specific | Neon/Athyper use `tenant_id`; Mesh must use its locked account/tenant scope, not a free text scope |
| `code` | Remove | Address identity is the UUID; business labels belong on the link/owner |
| `name` | Remove | Duplicates link purpose or role qualifier |
| `address_type` | Keep, tighten | Optional controlled physical classification; do not use it for bill-to/ship-to purpose |
| `attention_line` | Move to `address_link` | Addressee varies by owner even when the postal address is shared |
| `line1`, `line2`, `line3` | Keep/common | Postal lines |
| `city` | Keep/common | Locality |
| `region` | Keep, rename later if desired | Prefer the neutral name `administrative_area`; allow free text for global coverage |
| `postal_code` | Keep/common | Do not impose one global format |
| `country_code` | Keep/common | FK to `shared.country(code)` |
| `latitude`, `longitude` | Keep/common | Optional geocoding result with current range checks |
| `formatted_address` | Remove | Derived presentation value becomes stale; format at read time using locale/country rules |
| `tax_jurisdiction_id` | Remove from common core | Tax jurisdiction is transaction/use-context dependent; Neon tax logic should derive or own an extension |
| `metadata` | Keep/common | Require a JSON object |
| `status` and status audit | Keep/common | `active`/`deprecated`; do not hard-delete referenced addresses |
| creation/update audit | Keep/common | Standard UUID actor contract |

Required corrections:

- Remove the hard `address_dedup_uq`. If duplicate detection is useful, store
  or compute a normalized fingerprint and use a non-unique candidate index.
- Require enough address content for an active postal address. A practical
  rule is country plus at least one of `line1`, city, or postal code rather
  than assuming every country has the same structure.
- Keep tenant/scope plus ID uniqueness so composite foreign keys cannot cross
  ownership boundaries.

## 2. `master.address_link`

| Field | Decision | Review |
|---|---|---|
| `id` | Keep/common | UUIDv7 primary key |
| plane scope | Keep/plane-specific | Same scope as both the address and owner |
| `owner_type` | Replace | Use `owner_type_id`, referencing `control.owner_type(id)` |
| `owner_id` | Keep/common | UUID of the plane-local owning row |
| `address_id` | Keep/common | Composite scoped FK to `master.address` |
| `purpose` | Keep, required | Controlled use such as default, bill-to, ship-to, remit-to, correspondence |
| `role_qualifier` | Keep/common | Optional finer business role |
| `attention_line` | Add/common | Owner/link-specific recipient or addressee |
| `is_primary` | Keep/common | One primary for the same owner/purpose/qualifier and overlapping period |
| `effective_from`, `effective_until` | Keep/common | Half-open validity period `[from, until)` |
| `metadata` | Keep/common | Require JSON object |
| creation/update audit | Keep/common | UUID actors |

Preserve the current GiST exclusion pattern over owner, purpose, qualifier, and
date range. A simple partial unique index cannot correctly protect historical
or future-dated primary assignments.

Do not cascade-delete an owner merely to clean up links. Owner deletion should
normally be blocked or soft-retired; address deletion may cascade its link only
when the address is genuinely disposable.

## 3. `master.contact_link`

This table is the canonical contact value. Email/phone extensions must never
carry a second independently writable copy of that value.

| Field | Decision | Review |
|---|---|---|
| `id` | Keep/common | UUIDv7 primary key |
| plane scope | Keep/plane-specific | Composite ownership boundary |
| `code`, `name` | Remove | No distinct business identity beyond channel, purpose, and qualifier |
| `owner_type` | Replace | `owner_type_id` with FK to `control.owner_type(id)` |
| `owner_id` | Keep/common | Plane-local owning record |
| `channel_type` | Keep, required | Controlled code such as email, phone, SMS, WhatsApp, website |
| `value` | Keep, required | Canonical normalized value |
| `purpose` | Keep, make required | Default to `default`; avoid NULL/default dual semantics |
| `role_qualifier` | Keep/common | Optional role-specific routing |
| `is_primary` | Keep/common | Preserve one-primary unique guarantee |
| `is_verified`, `verified_at` | Keep, tighten | Enforce both directions: verified requires timestamp; unverified requires NULL |
| `metadata` | Keep/common | Require JSON object |
| `status` | Keep, correct | Use `active`, `inactive`, `deprecated`; align runtime and DDL |
| status and row audit | Keep/common | UUID actors |

Normalize by channel:

- email: trim and lower the domain; retain/display the user-entered form if
  product UX requires it;
- phone/SMS/WhatsApp: canonical E.164;
- website: normalized absolute HTTPS URL where policy requires it.

The database purpose lookup and API purpose allowlist need one authoritative
contract. Prefer plane-seeded control data used by both metadata/UI and
database validation, not arrays copied into every owner-type row.

## 4. `master.contact_email`

Keep this only as a 1:1 operational extension of an email `contact_link`.

| Field | Decision | Review |
|---|---|---|
| `contact_link_id` | Keep; make PK | Composite scoped FK; a separate surrogate `id` adds no identity |
| plane scope | Keep/plane-specific | Required for scoped composite FK and RLS |
| `local_part`, `domain` | Remove as writable fields | Derive from canonical `contact_link.value`; use an expression index for domain searches |
| `is_disposable` | Keep | Email-quality enrichment |
| `mx_checked_at`, `mx_valid` | Keep | Deliverability enrichment with freshness timestamp |
| `bounce_count` | Keep | Non-negative operational counter |
| `last_bounce_at`, `last_bounce_reason` | Keep | Last delivery outcome; detailed attempts belong in event/ops logs |
| `metadata` | Keep | JSON object |
| row audit | Keep | UUID actors |

The channel guard is still required: the referenced link must be `email`.
Bounce processing must not silently rewrite a verified login identity without
an explicit IAM recovery policy.

## 5. `master.contact_phone`

Keep this only as a 1:1 enrichment of a phone-like `contact_link`.

| Field | Decision | Review |
|---|---|---|
| `contact_link_id` | Keep; make PK | Composite scoped FK |
| plane scope | Keep/plane-specific | Required for scoped FK and RLS |
| `e164` | Remove duplicate | Canonical value belongs in `contact_link.value` |
| `calling_code`, `national_number` | Derive, do not direct-write | Parse from canonical E.164 using a maintained phone library |
| `carrier_hint` | Keep optional | Non-authoritative enrichment |
| `line_type` | Keep optional | Controlled mobile/landline/voip/unknown |
| `metadata` | Keep | JSON object |
| row audit | Keep | UUID actors |

The channel guard should allow the agreed phone family (`phone`, `sms`,
`whatsapp`) or require one shared phone link with separate routing capability;
do not create conflicting E.164 copies per extension row.

## 6. Marketing consent

Do not copy `master.contact_marketing_consent` into the three-plane foundation.
The current design should be retired rather than repaired in place.

Recommended Neon design when the marketing/governance capability is reviewed:

- `governance.contact_consent` — current projection keyed by scope, owner,
  channel, purpose, and jurisdiction/legal basis;
- `event.contact_consent_event` — append-only grant, withdraw, expire, and
  evidence events;
- evidence referenced by an attachment/document ID, not only a mutable URL;
- captured IP and user agent treated as restricted personal data with an
  explicit retention rule;
- RLS enabled and forced on both current state and events;
- absence of an applicable active grant remains deny-by-default.

This is Neon-only for now. Athyper and Mesh should add the capability only when
a real marketing/consent use case is installed.

## 7. `control.owner_type`

Keep the discriminator concept and customer extensibility, but replace direct
tenant mutation with a guarded registration contract.

Recommended fields:

| Field | Decision | Review |
|---|---|---|
| `id` | Add; primary key | UUIDv7; address/contact links use this real FK |
| `tenant_id` | Keep nullable | NULL for plane-owned types; tenant UUID for customer types |
| `code` | Keep | Immutable; globally unique for plane rows and unique per tenant for custom rows |
| `name`, `description` | Keep | UI/administrative label |
| `category` | Keep, fix taxonomy | One consistent lookup/check contract |
| `schema_name`, `table_name`, `pk_column` | Keep, guarded | Validated by registration; custom rows restricted to approved extension schemas |
| `is_tenant_scoped`, `tenant_column` | Keep, tighten | Must be true/`tenant_id` for every customer type |
| `supports_address`, `supports_contact` | Keep | Capability discovery |
| `sort_order` | Keep | UI ordering |
| `source_type` | Replace flags | Required `platform` or `customer`; derived consistently with `tenant_id` |
| `status` | Keep | `draft`, `active`, `deprecated`; no hard delete |
| `allowed_address_purposes`, `allowed_contact_purposes` | Remove | Normalize into `control.owner_type_purpose` |
| metadata/audit | Keep | JSON-object check and standard UUID audit actors |

Rules:

- Place the table in each plane's `control/03_tables.sql`.
- Seed only owner types whose backing tables exist in that plane.
- Store `owner_type_id` in `address_link` and `contact_link`, with an actual FK
  to `control.owner_type(id)`. APIs may continue accepting a code and resolve it
  to the accessible registry row.
- Add `control.owner_type_purpose(owner_type_id, capability, purpose_code)` for
  configurable address/contact purpose allowlists.
- Register and activate customer types only through
  `control.fn_register_owner_type(...)` and
  `control.fn_activate_owner_type(...)`; revoke direct application writes to
  routing fields.
- Require every customer target table to:
  - live in an approved extension schema;
  - have UUID `id` and UUID `tenant_id`;
  - have `UNIQUE (tenant_id, id)` or an equivalent composite primary key;
  - have a real tenant foreign key;
  - have RLS enabled and forced;
  - expose tenant-isolated policies approved by the registration validator.
- Reject customer registration against platform schemas such as `authz`,
  `audit`, `event`, `runtime_meta`, `ops`, `pg_catalog`, and
  `information_schema`.
- Keep dynamic owner existence validation only for validated registry targets.
  Use quoted identifiers, and always include both owner ID and tenant ID for a
  customer target.
- Make code, routing columns, tenant scope, and source type immutable after
  activation. A target change requires a new owner type and controlled
  relinking.
- Expand the in-use/deprecation check to every generic owner reference, or
  prohibit deletion entirely and allow only a controlled deprecation.
- Use one owner-type contract for database, API authorization, and metadata UI.

Access resolution:

- a tenant can read active plane-owned rows plus its own active/draft rows;
- a tenant can register and maintain only its own customer rows through the
  guarded functions;
- a tenant code may not shadow a plane-owned code;
- `owner_type_id` removes ambiguity from links even when two tenants use the
  same custom code;
- application roles cannot activate a type until structural and RLS validation
  succeeds.

Illustrative seeds, subject to the corresponding master-table reviews:

- Athyper: `tenant`, `workspace`, `module`, `principal`
- Neon: `tenant`, `principal`, `business_partner`, `customer`, `supplier`,
  `employee`, `legal_entity`, `company_code`, `site`, `warehouse`, `project`,
  `bank_party`
- Mesh: `tenant`, `principal`, `network_account`, `network_relationship`

Do not seed `commodity_category` merely because another generic table also uses
an `owner_type` column. That is a separate classification-owner contract and
should not automatically imply address/contact capability.

## 8. Final address/contact improvements

The following improvements are part of the finalized design:

1. Use `owner_type_id` instead of copying an owner code into every link.
2. Put `attention_line` on `address_link`, because it is owner/use-specific.
3. Remove stored `formatted_address`; format by country and locale at read time.
4. Remove `tax_jurisdiction_id` from the common address; derive it in Neon tax
   context.
5. Remove the unsafe hard address deduplication constraint. Duplicate detection
   may suggest reuse but must not merge automatically.
6. Keep the temporal GiST exclusion constraint for primary addresses.
7. Make contact purpose required with `default`, avoiding NULL/default dual
   semantics.
8. Align contact lifecycle with runtime: `active`, `inactive`, `deprecated`.
9. Enforce exact verification consistency between `is_verified` and
   `verified_at`.
10. Keep one canonical contact value in `contact_link`.
11. Make `contact_email.contact_link_id` and
    `contact_phone.contact_link_id` their primary keys; remove redundant
    surrogate IDs.
12. Derive email local/domain and phone number components rather than storing
    independently writable duplicates.
13. Keep delivery-attempt history in event/ops tables; retain only current
    email-quality summary in `contact_email`.
14. Apply enabled and forced RLS to every tenant/customer-scoped table,
    including all extensions.
15. Keep marketing consent outside this foundation until the governance/event
    redesign is approved.

## DDL placement

For each plane:

```text
planes/<plane>/master/
  03_tables.sql       address/contact tables
  04_pre_constraints.sql
  05_constraints.sql
  06_indexes.sql
  07_functions.sql
  08_triggers.sql
  09_views.sql
  10_rls.sql
  11_grants.sql

planes/<plane>/control/
  03_tables.sql       control.owner_type, control.owner_type_purpose
  05_constraints.sql
  06_indexes.sql
  08_triggers.sql
  10_rls.sql
  11_grants.sql
  12_reference_seed.sql
```

`common/shared` should contain only true reference dependencies such as country
and, if retained, state/region codes. It must not own addresses, contacts,
consent, or owner routing.

## Recommended implementation sequence

1. Implement `control.owner_type`, `control.owner_type_purpose`, guarded
   registration/activation, and the per-plane seed lists.
2. Lock the five address/contact table field contracts.
3. Add the owner-type FK and trusted owner-reference validation.
4. Add constraints, indexes, functions, triggers, RLS, and grants.
5. Update runtime status values and remove duplicate contact-value writes.
6. Migrate Neon and Mesh data only after table-by-table manual review.
7. Review marketing consent separately before creating any replacement DDL.
