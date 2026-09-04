# G2 NEON authority hardening — start report

**Status:** In progress  
**Date:** 2026-09-03  
**Authority:** `../decisions/governed-entity-lifecycle.md`

## Landed in this slice

The executable readiness matrix at `server/db/ddl/planes/neon/governed-lifecycle-g2-readiness.v1.json` classifies all eight G2 controls without treating repository inspection as live evidence. `db:verify:governed-lifecycle-g2` fails when a control lacks an owner, evidence, or exit gate.

Aggregate Business Partner governance percentages are now enforced across all active rows for a Business Partner:

- ownership percentage total must not exceed 100;
- voting percentage total must not exceed 100;
- beneficial-ownership percentage total must not exceed 100;
- the constraint is deferred so a multi-row correction can be atomic; and
- the supported-upgrade migration fails before installation when historical active totals already exceed a ceiling.

The migration does not clamp, discard, or reinterpret historical percentages.

## Current findings

- Qualification, preference, designation and credit review have tenant-composite FKs to Business Partner and, where present, supplier/customer roles. Preference, designation and credit review still need a composite pair FK proving the role belongs to that same Business Partner. Qualification needs a deliberate typed-role binding decision rather than two nullable role columns.
- Supplier and customer currently have one-lifetime-row uniqueness. Role-history requirements remain a product/architecture decision; effective-dated episode DDL must not be added speculatively.
- Customer lifecycle mutation is command-owned and S5-certified for `activate`, `suspend` and `reactivate`. It still conflates absent and invalid-transition outcomes, has no expected-version input, and lacks decided `deactivate`/`archive` semantics.
- Supplier/customer metadata uses prohibited-key blocklists, not contract allowlists. URL validation is prefix-based and remains open.
- Organization-only creation is prospective. Historical `person`/`group` rows and compatibility consumers must be measured before domain retirement.
- Address/contact ownership requires a focused polymorphic-owner inventory before DDL changes.

## Verification

The G2 readiness check, three-plane DDL model, database TypeScript typecheck and whitespace validation pass. Static S4/S5 tests remain available, but clean-build and supported-upgrade live probes have not been claimed by this report.

G2 is not removal- or exit-gate eligible. The next safe slice is composite role-pair certification and enforcement, followed by explicit customer lifecycle outcomes/versioning.
