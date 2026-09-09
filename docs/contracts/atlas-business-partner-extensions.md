# Atlas Business Partner extensions (BP-AI-10)

Status: qualification build started; no extended runtime capability is release-qualified or registered by this change. BP-AI-09 target execution remains pending. This contract defines the required owner handoff and separate release evidence, not an implemented owner API.

The release manifest selects `enabledExtendedCapabilities` explicitly when `BP-AI-10` appears in `enabledPackages`. Supported identifiers are `duplicate_candidates`, `document_expiry`, and optional `draft_preview`. Each selected capability requires its own SHA-256 in `extendedOwnerContracts`; the digest identifies the reviewed owner API and disclosure contract artifact. Every receipt binds the exact selection and contract hashes. The deployment receipt also records `observedExtendedCapabilities`. Qualifying one capability grants no qualification to another.

Each selected capability adds four receipts: `extended:<capability>:owner_contract`, `:evidence_quality`, `:disclosure`, and `:workflow`. These supplement all applicable BP-AI-09 gates. Required assertion IDs are maintained in [the executable gate definitions](../../tooling/scripts/verification/bp-ai-extended-capabilities.mjs). A generic passing assertion cannot replace these checks. Receipts retain the existing target, run, source/model/policy/contract revisions, artifact digest, and zero-failure requirements. An owner-contract receipt must establish a versioned API, scope/disclosure policy, unavailable/freshness semantics, and owner review.

| Capability | Evidence quality | Disclosure | Workflow |
| --- | --- | --- | --- |
| Duplicate candidates | Versioned matching method, matching and conflicting evidence, bounded authorized coverage; candidates do not establish identity | Reauthorize target and each candidate/comparison field; withhold hidden existence and counts; reauthorize replay | Authorized compare action only; reject stale candidates; no merge or write |
| Document expiry | Owner expiry rule and business date, current document revision, accurate bounded passages/citations; missing dates and partial evidence cannot establish validity | Authorize BP parent, document and passages; exclude stale/deleted/unscanned documents; reauthorize replay; source instructions remain data | Authorized document navigation; expiry does not establish transaction eligibility; no renewal or write |
| Draft preview | Nonpersistent owner evaluation of an allowlisted patch bound to base and definition versions; explicitly label draft assessment | Admit each field and scope before evaluation; withhold restricted inputs and protected telemetry; reauthorize replay | No persistence or submission; reject stale base; actual submission still requires saved owner validation and existing confirmation |

## Owner gaps and implementation sequence

The existing master-data request validator uses an exact legal-name candidate reader and stores candidate IDs/counts in its duplicate summary. That internal workflow summary is not an Atlas disclosure projection. Build an owner projection that admits candidate membership and comparison fields before disclosure; do not forward that summary directly.

Atlas currently advertises the BP certificates section as unavailable through the generic section tool. Document search/storage/extraction infrastructure does not establish an expiry decision or parent BP authorization. Add the owner expiry projection and BP-scoped retrieval with current revision, scan, passage and citation checks before registering the capability. Plain text extraction cannot prove page coordinates.

Draft preview remains optional until a nonpersistent owner API is established. Existing persisted case validation must not be invoked as a substitute for a preview. The owner must define the patch allowlist, revision checks and no-write guarantee before an Atlas adapter is implemented.

Next implementation work is owner contracts/projections, authorized Atlas adapters, evidence and answer integration, then service/browser/live-model execution for each selected capability. Keep enablement pending until both these receipts and the applicable BP-AI-09 receipts pass on the same target and revision binding.

## Local verification

Run `node --test tooling/scripts/verification/business-partner-ai-qualification.test.mjs` for synthetic verifier regression tests. These exercise evidence admission, not live capability quality. The pending intake is `governance/config/governance/business-partner-ai-extensions.v1.json`; run the existing qualifier with that path to list outstanding receipts. Draft preview is deliberately absent from that intake.
