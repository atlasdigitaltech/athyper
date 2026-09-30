# CirrusAtlantic R4 qualification

The [current progress receipt](../../governance/evidence/business-partner/local/2026-09-05/cirrusatlantic-r4-qualification-progress.json) records preparation and blockers. No new case-contract approval, signed release, activation, browser qualification or bank reconciliation is claimed.

## Contract review input

The V1 target rerun on 2026-09-06 found that active release 3 rejects the
existing onboarding fields `partnerCategory` and `supplierType`. The refreshed
[V1/R4 additive review packet](../../governance/evidence/business-partner/local/2026-09-06/cirrusatlantic-v1-r4-case-contract-review.json)
is based on active release 3, preserves all 39 existing properties unchanged,
and adds `partnerCategory`, `legalClassification`, `supplierType`, and
`customerType`. Use this packet for the next publication. The older scoped R4
packet below is retained as historical input.

Use the [scoped unsigned candidate](../../governance/evidence/business-partner/local/2026-09-05/cirrusatlantic-r4-case-contract-review-scoped.json). The earlier unscoped packet is superseded. This candidate adds only eight R4 fields and removes `requestedRole` from the required list for partner-level lifecycle operations. Existing property definitions remain unchanged. Existing cases retain their pinned snapshots and contracts.

This is the tenant-specific `metadata.entity.master_business_partner.44444444444444448444444444444444` case contract. It is separate from the already published `business_partner.onboarding` 2.1.1 definition. Do not paste the case schema into the Business Partner definition-bundle editor.

The native validator in `server/db/ddl/planes/neon/document/07_functions.sql` includes enum and scalar-bound checks in the development baseline. Sixteen transactional checks, the R4 materialization matrix, and seven scoped candidate compatibility/rejection probes pass. These validate the supported scalar constraints; they do not establish general JSON Schema conformance.

## Native case-contract publication

The dedicated native case-contract path is implemented and deployed in development. It uses the existing scoped Business Partner author/read/publish permissions, with MFA and independent review. It stores immutable schema revisions, checks the current NEON source at authoring and approval, signs the schema and artifact with Ed25519, and sends only a NEON deployment. Consumer staging rejects a changed base; approved cases can continue using their exact superseded contract.

Use separate browser profiles for author and reviewer:

1. As `catl.admin` in CirrusAtlantic, refresh [Studio Publication](https://studio.dev.athyper.test/mdg/business-partner/publication). Use the new **Case contract publication** section above the onboarding definition editor.
2. Paste the entire [V1/R4 additive review packet](../../governance/evidence/business-partner/local/2026-09-06/cirrusatlantic-v1-r4-case-contract-review.json) into **Case contract review packet JSON**. Select **Validate case contract**, then **Save immutable case contract**. Retain the saved revision ID and hash.
3. As `catl.owner`, open the same page. Enter the saved ID under **Case contract revision ID**, then select **Load case contract for review**. Review the author, prior contract, schema and hash. Check the independent review confirmation and select **Approve and queue case contract**.
4. Retain the returned release ID and compilation job ID. The result explicitly says activation is pending. Wait for the real worker/deployment receipt and active NEON contract before creating new cases. If the source changed, refresh the review packet; do not bypass the conflict or rewrite old snapshots.

The API is `/api/studio/business-partner-case-contracts`, with `/simulations`, `/:revisionId`, and `/:revisionId/publish` operations. Browser relay allowlists expose these exact routes. The case contract remains separate from the existing onboarding bundle.

Do not use the development checksum bootstrap as native approval evidence. The automated integration proofs use synthetic actors and temporary keys and roll back both databases; those results do not constitute the manual owner's approval.

## Browser and bank qualification

Protected Studio author/reviewer and NEON maker/verifier Playwright session-file references are required for automation. Current repository storage-state files contain no authenticated sessions. Passwords, cookies and MFA material must stay outside retained evidence. Manual browser execution now uses the deployed controls described above.

1. Establish the intended test supplier's native MESH profile/account relationship and independently approve its link. Deliver the recipient-scoped bank disclosure through the normal producer/consumer flow. CirrusAtlantic currently has no active account link or received bank projection; its existing verified bank account alone is insufficient.
2. After the new contract is activated, create fresh bank/lifecycle cases pinned to that contract. Validate, submit, independently approve and materialize each through the authenticated application. Retain screenshots and sanitized response coordinates. Verify `deactivate → inactive`, `reactivate → active`, and `archive → archived` against the native partner record.
3. For bank change, retain the materialization's `bankVerificationId`. Assert its status is `pending_verification` and preferred remittance remains unchanged.
4. Open the test partner's supplier page at `https://neon.dev.athyper.test/mdg/business-partner/<businessPartnerId>/supplier`. Select the intended company. In **Review and apply bank verification**, enter the ID and select **Load bank verification**. An independent verifier must review the intended active local beneficiary bank link and real test verification evidence. Enter **Verified beneficiary bank link ID**, **Verification method**, and **Verification evidence JSON**, check the confirmation and select **Verify bank change**. The native decision API is `POST /api/neon/business-partner-bank-verifications/:verificationId/decisions`, accepting `decision: "verify"`, `candidateBankAccountLinkId`, `verificationMethod`, and `evidence`. The case maker cannot verify their own request.
5. Reload as an actor with company-scoped `neon.business_partner_bank.apply` if needed. Check the remittance-switch confirmation and select **Apply verified bank change**. This applies the verified change through `POST /api/neon/business-partner-bank-verifications/:verificationId/applications`. Authorization uses `neon.business_partner_bank.apply` in the company scope. Reconcile the verification's `applied` state and immutable decision/application evidence, the selected supplier company's preferred bank link, the projection's `linked` state, and unchanged unrelated companies.
6. Verify replay does not switch remittance twice, concurrent remittance/disclosure changes fail, and a maker cannot self-verify. Retain native receipts before marking the bank journey complete.

The browser relay now exposes verification read/decision/application routes. Controls appear only with the corresponding verify/apply permission and selected company. Browser component tests and transactional service/repository proofs pass; the manual authenticated qualification is still pending.

## Repeatable database checks

From `server/db`, with a protected `DATABASE_URL` supplied by the test environment:

```sh
pnpm test:integration:entity-case-payload-validation
pnpm test:integration:business-partner-r4-change-case
```

These SQL suites roll back test fixtures. The additional `test:integration:case-contract-publication` (Studio URL) and `test:integration:bank-verification` (NEON URL) commands prove signing/activation and bank reconciliation with rolled-back synthetic fixtures. Production qualification and the remaining Supplier-controls acceptance criteria remain separate.
