# Reusable three-tenant Business Partner core fixture

One template, one independent partner per tenant: **Aster Research Services (Demo)**, code **BP-DEMO-CORE-001**, in **Athyper**, **Technostat**, and **CirrusAtlantic**. This is an explicit local demo pack, not production reference data and not an automatic startup seed.

## Run

From the repository root:

```sh
node tooling/fixtures/business-partner-core/seed.mjs --dry-run
node --test tooling/fixtures/business-partner-core/seed.test.mjs
pnpm exec tsx tooling/fixtures/business-partner-core/verify.disposable.mts
# Explicitly install in the local DEV Neon database:
node tooling/fixtures/business-partner-core/seed.mjs --apply --confirm=LOCAL-BP-CORE-SEED
```

The default is rollback. The local container is fixed to `athyper-dev-db-1`, database `athyper_neon`; no credentials are printed. Optional `--dry-run --disposable` targets the labelled BP2 acceptance container. Each run executes the pack twice within one transaction to verify repeatability. Deterministic tenant-specific IDs prevent duplicates. Existing rows are compared, not overwritten; changed fixtures or collisions fail and roll back the entire pack. All three tenants, their existing admin principals, owner registries and active ISIC 7210 must exist. No permissions are granted.

## Coverage: 25 explicit rows per tenant, 75 total

| Section | Tables / sample content |
| --- | --- |
| Overview / Identity | `business_partner`, two `business_partner_alias` rows; registered name, legal form, country, incorporation date, reserved `.example` website and description |
| Contacts | `contact_person`, five `contact_link` rows (email, phone, website, SMS, fax), `contact_email`, `contact_phone`; named general-enquiries contact and reserved example contact details |
| Addresses | Two `address` and two `address_link` rows; London registered address and Cambridge laboratory address, with tenant-specific normalized hashes |
| Identifiers / Tax | `business_partner_identifier`, `tax_jurisdiction`, `business_partner_tax_registration`; explicitly labelled demo numbers and masked display values |
| Banking | `payment_instrument`, shared-PK `bank_account`, generic `payment_instrument_link`, `bank_provisional_reference`; company-null partner ownership, **inactive** synthetic instrument, unresolved fictional bank |
| Industry evidence / Qualifications / Certificates | Two `business_partner_industry_classification` rows using existing ISIC 7210 and its broader ISIC 72 R&D classification; the latter has 13 existing crosswalk references. Two `certification` rows: current demonstration and expired example |

The seed targets the cleaned instrument DDL, deployed in the coordinated main DEV rebuild on 2026-09-24. All three demo graphs were reseeded successfully. It creates no banking usage, company acceptance or verification rows. Instrument and bank subtype intentionally share the same ID. Existing triggers maintain audit records. No shared bank directory entry is created. Shared industry, country and currency references are reused. Do not run this revised seed against an older banking schema.

## Deliberate boundaries

- **No company codes, company usage, organization assignments, customer or supplier roles/profiles, treasury setup or permission grants.** Existing runtime permissions continue to control visibility.
- Commodity declarations are role-independent and included through the classification extension below. No qualification decision is fabricated; Qualifications can legitimately be empty.
- Supplier-only profile fields such as business type, founding year or employee counts are not fabricated on the partner or stuffed into metadata. Those Overview fields may remain blank under the requested role-free boundary.
- Bank and tax values are **obviously synthetic demo values**, not production secrets. No fake protected-storage token, verification receipt or reveal audit is created. The instrument remains `inactive`, and its fictional directory reference remains `unresolved`. This pack supports masked display, not successful protected reveal or payment acceptance testing. Use normal protected capture and authorized reveal for those journeys; Neon bank verification has been removed.
- Contacts and addresses are not falsely marked independently verified/validated. Certificates are explicitly demonstration records, not real accreditation; `document_attachment_id` stays null. Upload actual synthetic evidence through the document service to test downloads—no nonexistent files, fake object keys or malware-scan attestations are seeded.
- This is provisioning data, not fabricated submit/approve/materialize history. It preserves database constraints and triggers.

## Partner coordinates

| Tenant | Partner ID |
| --- | --- |
| athyper | `a9d3f90c-27d5-5e02-8214-c648752def4d` |
| technostat | `6d469b31-53b7-54c1-8bfc-d93ce36f6341` |
| cirrusatlantic | `b4137225-4534-5469-8138-09d15a970271` |

After installation, open `/mdg/business-partner/<partner-id>` under the corresponding tenant, using an already-authorized account. Seed execution does not relax section permissions or MFA.

## Validation recorded 2026-09-23

Both the labelled disposable database and current local DEV database accepted all three tenant graphs twice, with all rehearsal changes rolled back. Following explicit user authorization, the pack was **applied to local DEV on 2026-09-23**. Post-commit verification found all three active partners, zero customer/supplier roles and zero company bank assignments. A subsequent dry-run passed against the committed rows, confirming repeatability without overwriting them.

### Contacts, addresses and industry extension — 2026-09-23

Applied six additional rows per tenant without changing prior fixture rows: three channels, one address/link pair and one non-primary ISIC 72 classification. Shared crosswalk rows were reused, not invented or marked verified; their existing provenance/confidence remain authoritative, and they are reference evidence rather than additional partner classifications.

Two runtime defects were also fixed: timestamp-effective channels created during the selected day were previously excluded by a midnight comparison, and the compiled postal renderer incorrectly displayed raw link field names against a postal display DTO. Channels now display individually, with withheld values shown as restricted. Addresses render authorized postal fields; no permissions were broadened.

Validation: seed contract tests and two rendering tests passed; form-detail and master-data source typechecks passed. Transactional disposable reader acceptance confirms **five channels, two addresses and 13 industry crosswalk references for each tenant**, tomorrow-effective channels excluded and cross-tenant contact reads empty. The updated seed passed DEV dry-run and explicit application. Saved CATL test login was anonymous, so signed-in browser acceptance was not claimed.

### Independent commodity extension — 2026-09-23

The approved separation is now installed in DEV and published in release **21**. Each tenant has a `DEMO_LAB_RESEARCH` category, a category-to-UNSPSC `41100000` assignment and an active declared `business_partner_commodity_classification`. No customer/supplier role, company assignment or qualification is created. The existing partial, unverified crosswalk retains its original confidence/provenance; no shared catalog rows are inserted.

The same `seed.mjs` command detects the installed classification resource and includes `classification-seed.mjs` automatically: **28 explicit rows per tenant**, with the whole pack checked twice before commit/rollback. Older schemas retain the base pack until the explicit classification upgrade. Identity coordinates are shared in `seed-identity.mjs`; existing deterministic IDs are unchanged. Replays fail on changed category, assignment or fact rather than overwriting them.

CATL's signed-in compiled Commodities/Certificates/Qualifications panels and independent native declare/verify/archive journey pass. The acceptance fact was archived, not the reusable demo fact. Other tenants have database/RLS acceptance; their signed-in sessions remain an acceptance gap. See [rollout evidence](../../../docs/architecture/application-experience/partner-classification-separation.md).

### CATL organization/person 360 enrichment

Run against the existing DEV only, after the base organization/person fixtures:

```sh
node tooling/fixtures/business-partner-core/refresh-catl-360.mjs --apply
node --import tsx tooling/scripts/local-dev/protect-catl-demo-banks.mts --apply
node tooling/scripts/verification/verify-catl-360-refresh.live.mjs
node tooling/scripts/verification/verify-catl-bank-reveal.live.mjs
```

This additive refresh does not reset DEV or grant permissions. It fills missing organization characteristics, alias locale/source, person preferred name, identifier/tax validity, a synthetic tax-type reference, direct UNSPSC declarations, partner-wide contact responsibility, general/address channels, certificate-type references, provisional branch/address facts, and a synthetic partner relationship/director example. Existing industries, postal addresses and named-contact channels remain intact. Reruns preserve populated profile values and reuse deterministic enrichment IDs; collision checks reject unrelated records.

The protected-bank command creates replacement identities for the original synthetic bank fixtures, ends their original links, and preserves the old accounts. All three current accounts (two organization, one person) have full **synthetic, non-payable** values in the existing protected store. Normal section responses contain only masked suffixes; owner Reveal still requires the existing scoped authorization and identity verification. No real routing/account numbers or bank verification claims are invented.

Intentional blanks include inapplicable identity fields, ownership percentages for a director, unresolved directory references/BIC, verification evidence, document attachments, and company/site assignments. Open-ended relationships remain open-ended. Submitted provisional branch/address and general/address channels are stored, but the current 360 projection does not display all of them; populating data does not change metadata bindings. The provisional address uses the currently enabled `default` purpose (DEV does not register `bank_branch` for this owner type).

Validation: all nine sections for both demo categories return ready to CATL admin and owner; direct commodities, typed tax/certificate references and protected bank availability checked. Six seed contract tests pass. No other tenant fixtures are refreshed by these commands. Do not rerun the original strict base seed over enriched records: it intentionally reports fixture drift rather than reverting enrichment.
