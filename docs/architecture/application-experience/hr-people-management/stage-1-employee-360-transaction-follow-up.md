# Employee 360 profile and lifecycle follow-up

> **Historical.** Written before commit `870f08f52` removed the bespoke Business Partner and workforce applications. Routes, packages and files named here may no longer exist, and de-linked paths were dead when this was cleaned up. New entity work goes through the shared Entity Framework ([onboarding guide](../../../runbooks/meta-entity-onboarding.md)); do not treat this as current instruction.

**Status (2026-09-22):** Education and prior-employment editing works locally. Approved-request offboarding now materializes an offboarding case and preserves replay evidence. Employee comment capability is prepared in source metadata and parent admission, but has not been published or activated in the local runtime.

## Delivered

- Employee 360 Profile exposes add/edit/archive controls for education and prior employment when the caller has `neon.workforce.profile.write`. The dedicated route and relay contract use explicit field allow-lists, tenant and employee ownership checks, all represented employment-company scopes, optimistic row versions and audit/outbox events without field values. The new permission has exact company scope. Runtime write grants cover only the two non-sensitive profile tables.
- Approved `offboard_employment` request application now locks the selected employment, creates and activates a case linked to its employment and workflow, records the case on the request, and includes it in materialization/replay responses. It sets termination and assignment end dates without deactivating a future-dated employment immediately. The employee end date and IAM deprovision intent are written only when no other valid employment remains. The case records whether IAM deprovisioning was requested. A new constraint requires a case reference on newly applied offboarding requests.
- Workforce source metadata declares a bounded comment capability (public or author-private text, create/reply/edit-own/archive-own; no mentions or attachments), and the platform parent admission resolves the employee from storage, checks Workforce read across all employment companies, and passes server-resolved company scope to the capability policy. Company-scoped collaboration permissions are installed. The current runtime has no published Workforce entity contract, so the generic collaboration API still denies Workforce mutations; the Employee 360 UI does not expose an action that would fail.

## Verification

- Local additive DDL was applied without resetting data. Migration layout, service/contract/Neon/Workforce/platform-host/gateway typechecks, master-data tests and Workforce UI tests pass.
- A rollback-only runtime probe covers profile create, stale-version rejection, cross-person rejection, update and archive.
- A rollback-only approved-request probe covers case creation, stable replay and future-dated employment remaining active. The existing direct offboard probe and authenticated Employee 360 allowed/denied browser proof still pass.
- The Workforce comment declaration and binding pass their contract parsers, and metadata layout resolves. The broad metadata validator currently stops at its DDL snapshot check after the additive HR DDL; no release was published.

## Remaining

- Publish and activate a scoped Workforce release that contains the comment binding, then add a capability-aware Employee 360 composer and prove create/edit/archive in an authenticated browser. The absence of a published runtime contract is an explicit fail-closed boundary.
- Add protected-value writing and audited edit flows for address, emergency contact, identity document and health records. Their current read-only foundation must not accept plaintext through the generic profile route.
- Extend request-driven exit tests for multi-employment and IAM execution timing, and add policy for statutory exit dates where jurisdiction rules require it.
