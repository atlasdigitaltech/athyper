# Partner bank disclosures and company acceptance

Bank facts remain with their owner. MESH publishes immutable masked disclosures; NEON receives them through the existing inbox/projection flow. Receipt never changes the preferred payment destination. New disclosures include the stable source bank account ID, owner verification, expiry and a fingerprint incorporating the protected identifier fingerprint and declared account/routing facts.

Verification pins the disclosure ID and version at creation, including the entity-case SQL entry point. Application rechecks the pinned version, fingerprint, expiry, revocation, account mapping, candidate verification, company eligibility and concurrent remittance changes. A changed disclosure becomes **Change pending review**. One company's application does not prevent another company from reviewing the same projection.

`master.bank_account_usage` declares `selected_companies` or `all_authorized_companies`. `master.bank_account_company_usage` stores dated, purpose-specific assignments, preference and acceptance, including source tenant/account identity and accepted disclosure/version/fingerprint. Eligibility is distinct from `master.bank_account_company_ready`. Changing a preferred remittance link requires company acceptance through a database guard. Company authorization remains required at the service boundary.

New protected registrations create a shared partner link and an explicit assignment for the registering company. Legacy link company restrictions remain enforced. Migration copies existing company assignments and primary flags, but does not infer acceptance or universal availability from NULL. Legacy open verifications without a pinned version must restart. Existing preferred destinations are retained; they are not rewritten during receipt or migration. House bank GL/payment/reconciliation configuration remains separate.

Banking opens without company context and shows masked local accounts and received disclosures. Selecting a company highlights applicability and exposes effective-dated usage settings. Owner verification, disclosure freshness and company acceptance are separate fields. Full identifiers remain in protected storage; MESH validates them in memory before publishing.

Both planes use `bank-account-identifiers.ts`, backed by IBANTools for IBAN country structure, length and checksum and BIC validation. IBAN and SWIFT/BIC are separate inputs. Domestic rules currently support GB sort code, US ABA (including routing checksum), and AU BSB; unsupported country/scheme combinations fail closed rather than pass generic alphanumeric validation. More domestic schemes require reviewed country/bank-specific rules. These checks establish syntax, not ownership.

## Rollout and validation

Apply `planes/neon/master/15_bank_account_company_usage.sql` and `planes/mesh/mesh/15_bank_disclosure_source.sql` before running the updated services. Both are included in the plane manifests. The MESH V2 source function retains the V1 function for compatibility and restricts its protected token/fingerprint output to the existing eligible owner/relationship boundary. The SecretStore adapter must resolve the source account token under `protected-values/<owner-tenant>/<token>`.

Company assignment: `POST /api/neon/bank-account-links/:linkId/company-usage` with company, purpose, effective dates and primary flag. Scope configuration: `POST /api/neon/bank-account-links/:linkId/usage-scope`; broadening requires tenant-wide bank application authority and is rejected for legacy company-restricted links. Neither operation grants acceptance.

Validation includes targeted identifier, disclosure, stale-application, policy and UI tests; type checks for the five affected packages; and PostgreSQL migration/query checks in rolled-back transactions. `server/db/scripts/tests/integration/bank-company-usage.sql` checks preservation, unscoped defaults and universal availability without acceptance on a populated fixture database. No live migration or deployment is performed by those checks.

References: [Swift BIC definition](https://www.swift.com/standards/data-standards/bic-business-identifier-code), [Swift IBAN registry](https://www.swift.com/swift-resource/249796/download), [IBANTools](https://github.com/Simplify/ibantools).
