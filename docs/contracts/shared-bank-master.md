# Shared bank master data

Bank institutions, branches and routing identifiers are plain, directly maintained
master data in the `shared` schema. There is no release, publication, activation,
version or source-manifest model: rows are created and updated in place.

## Tables

- `shared.bank_institution` — id, name, country, `institution_type`
  (`bank`, `credit_union`, `payment_institution`, `other`), `status`
  (`active`, `retired`), `effective_from` / `effective_until`, optional
  `source` + `source_record_id` (both or neither).
- `shared.bank_branch` — child of an institution, keyed `(institution_id, id)`;
  carries name, country and a `location` JSON object.
- `shared.bank_identifier` — scheme-qualified identifier (`bic`,
  `national_bank_code`, `national_branch_code`, `clearing_member_id`) for an
  institution or branch; an exclusion constraint prevents overlapping validity.

Read views (`security_invoker`): `shared.v_bank_institution`,
`shared.v_bank_branch` and `shared.v_bank_directory` (one row per institution or
branch; an identifier is exposed only when unambiguous).

## Lifecycle rules

- Retire with `status = 'retired'` and `effective_until`; never delete a row that an
  account references.
- Names and identifiers are edited in place. Nothing pins a consumer to a point in
  time; history, when needed, belongs in audit.

## Consumers

- `master.bank_account` references `bank_institution_id` and `bank_branch_id`.
  A CHECK requires either a master institution or a manual bank
  (`bank_name_override` + `bank_country_override`, optional `bic_override`), so
  manual entry works without any master row.
- `master.bank_provisional_reference` records a bank a user typed in; once matched,
  `resolved_institution_id` / `resolved_branch_id` point at the master row.
- Mesh bank tables and the Neon and Mesh views read `shared.v_bank_directory`.
- Request capture validates a selected institution and branch against the current
  active rows.

## Schema files

`server/db/ddl/common/shared/03_bank_master.sql`, `04_bank_master_views.sql`, plus
the shared indexes, triggers and grants files.

## Migrating an existing local database

Run `server/db/scripts/operations/banking/drop-bank-directory-release-model.sql`
once per plane database, then re-apply the plane DDL. For Studio also run
`drop-studio-bank-directory-permissions.sql`.
