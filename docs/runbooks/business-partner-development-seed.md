# Business partner development seed

`server/db/scripts/provisioning/provision-development-business-partner-fixtures.ts`
populates the development-owned business partners in the local `athyper_neon`
database. It enriches existing deterministic IDs and adds `ATH-BP-SA` and
`CATL-BP-SA`. The pack identity remains `development.business-partner-two-tenant.v2`
for ownership and replay compatibility; detail metadata uses version `3.0.0`.

| Tenant | MY | DE | SG | GB | SA | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| athyper | 20 | 19 | 1 | 0 | 1 | 41 |
| cirrusatlantic | 0 | 0 | 0 | 31 | 1 | 32 |

Counts include one intentionally hidden partner per tenant. Hidden partners receive
identity, address, contact, registration, tax and classification data, and retain
zero operating-organization assignments. Draft partners retain their status and
receive no approved qualification or risk assessment.

Country profiles supply local currency, address geography, contact names and phone
prefixes, registration/tax authorities and legal-name suffixes. Malaysia uses the
existing `sales_tax` lookup for its synthetic SST registration; Singapore uses GST;
Germany, the UK and Saudi Arabia use VAT. These fixtures are not statutory tax or
registration-number validation examples. Generated identifiers explicitly carry
`DEMO` prefixes. Websites and emails use `.example.test`; bank details are synthetic.
The original Northwind identifier, contact and bank examples retain their values.

Scoped suppliers receive company profiles and Net 30 payment terms for every
currently effective company assignment in their operating organizations, remittance
bank links, governance examples, a relationship and a synthetic certification.
Active suppliers receive risk assessments and qualifications. Qualification scope
uses `control.business_partner_decision_scope`, matching the normalized schema.
Active, organization-assigned suppliers also receive pending preference designations
with normalized organization/company/commodity scopes. Existing decisions are
preserved; the seed does not approve preferences. Draft and hidden fixtures remain
excluded from preference creation.

For an existing database, apply
`server/db/migrations/20260908_supplier_preference_normalized_scope.sql` before
replaying the seed. Fresh database DDL includes the same repair. The trigger
validates overlapping approved scopes, keeps creation and scope evidence immutable,
and preserves version and lifecycle checks. Run
`server/db/scripts/tests/integration/supplier-preference-normalized-scope.sql`
to test the repair transactionally; regression writes are rolled back.

The script only enriches its own fixture pack. Separately managed R2/R5 acceptance
fixtures, imported journey records and manually created partners are preserved.
All writes execute in one transaction with tenant context and an advisory lock.
Reruns preserve unrelated partner metadata and existing detail rows.

## Apply and verify

Supply the local development admin URL through `ATHYPER_NEON_DATABASE_ADMIN_URL`.

```sh
pnpm --dir server/db run db:provision:neon:business-partner-fixtures --plan
pnpm --dir server/db run db:provision:neon:business-partner-fixtures --confirm=LOCAL-NEON-BUSINESS-PARTNER-FIXTURES
pnpm --dir server/db exec tsx --test scripts/__tests__/provisioning/development-business-partner-fixtures.test.ts
```

Run `server/db/scripts/tests/integration/development-business-partner-country-coverage.sql`
against that database to assert address/registration/tax country consistency,
company profile and bank currency coverage, preservation of draft approvals, and
Saudi fixtures in both tenants. The provisioning script also checks organization
visibility and detail coverage before committing.
