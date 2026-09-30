# Atlas saved Business Partner case explanation (BP-AI-07)

Implemented in the working tree on 2026-09-09. No deployment or authenticated browser/live-model qualification is claimed.

`bp_explain_case_validation` and `bp_explain_case_diff` call the existing master-data case owner. Both accept `caseId` and an optional positive `expectedRowVersion`. The owner authorizes case reads in the saved organization/company scope. A mismatched version fails; reading never runs the mutating validation command.

The response identifies the actual case ID, row version, current immutable snapshot and contract hash. Validation is `passed`, `failed` or `not_evaluated`. Only an evaluation pinned to the current snapshot counts as current. The repository reads findings from the evaluation ID captured with that case view, preventing concurrent validation from mixing evidence. Persisted validation outcome is disclosed under case-read permission; detailed findings are limited to approved role/organization routing rules. Unknown rules, raw evidence, duplicate candidates/counts and identity/bank values are omitted. Coverage is always partial.

The diff compares routing fields (`requestedRole`, `operatingOrganizationId`, `companyCodeId`) with the previous saved snapshot, identified by snapshot ID and snapshot revision. This revision is not a command concurrency token. Both scopes require owner read authorization; unavailable or unauthorized baseline yields `unavailable`, without baseline coordinates or values. Empty partial changes never establish that the whole draft is unchanged. This capability does not compare the draft against the current master record or disclose protected identity/relationship/bank changes.

The repository baseline DTO remains internal: the public owner `getView` strips it. The owner explanation projects only the approved fields. Case page admission additionally verifies the case belongs to the open BP; tool calls and submission must match the admitted case ID. Historical contexts remain denied; dirty context means saved data only.

Submission uses the existing `bp_submit_case` command, proposal ledger and confirmation UI. After tool authorization and before issuing a confirmation, an owner preview guard checks exact case/version, draft status and current passed validation. It performs no validation or submission mutation. Confirmation retains its existing principal, tenant, authorization epoch, policy, argument hash and expiry bindings. The owner command checks validation, scope, version and workflow again. The existing durable idempotency key and receipts handle retries; an uncertain execution is not resubmitted by the explanation tools.

Read replay uses the existing fresh owner re-execution and result-hash check, so changed versions, evidence or access invalidate old explanations. No explanation cache was introduced. Local and full-provider compositions register the tools when the case owner is present; the metadata capability catalogue includes both read tools.

Validation: focused disclosure, case owner, case tool/context and preview/retry tests; platform AI, master-data and host typechecks; `pnpm qualify:business-partner-r9`. Live SQL snapshot-chain behavior and authenticated UI/model qualification remain deployment gates. Broader field diffs require explicit owner disclosure contracts.
