# Business Partner responsibility recommendations — DEV

Prepared for `catl.owner`, nominated for business and security review. **These are recommendations, not recorded approvals or active assignments.**

21 combinations: assign defined scoped responsibilities. 56: retain legacy only. 2: exclude acceptance fixtures from target mapping without revoking existing grants.

The review contains 9 equivalent batches (41 rows) and 38 individually reviewable exceptions. Every batch binds its exact member list and proposal revisions. Five exceptions concern the reviewer’s own memberships and require explicit acknowledgement; reviewer nomination alone is not approval.

Proposed assignment window: **11 September 2026 00:00 UTC through 10 December 2026 00:00 UTC** (90 days). Activation must occur within this window after separate release and enforcement approval. An expired window requires renewed review. For retention/exclusion, these are review dates only: existing grant validity does not change.

All mapped commands require normal issuer MFA, deny/revocation precedence, maker ≠ approver and approver ≠ applier. Organization subtree propagation is explicitly retained for current and future descendants. Named-principal approval does not authorize other or future group members.

No additions, removals or scope changes to grants are proposed. Unmapped capabilities remain legacy-only. Directory/global-read, stewardship, sensitive access and legal-entity/company-code boundaries remain separate migration gates.

[Machine-readable packet](../../governance/policy/reviews/business-partner-named-role-recommendations.dev.json) · [Gate assessment](../../governance/policy/reports/business-partner-named-role-recommendation-assessment.dev.json) · [Separate grant-change proposal](../../governance/policy/reviews/business-partner-role-grant-proposal.dev.json)

## Batch index

| Batch | Mode | Tenant | Decision | Rows |
| --- | --- | --- | --- | --- |
| [bp-review-0011ad97ffebfd44](#bp-review-0011ad97ffebfd44) | individual_exception | 11111111-1111-4111-8111-111111111111 | retain_legacy_only | 1 |
| [bp-review-002dec0e75f6ee6c](#bp-review-002dec0e75f6ee6c) | individual_exception | 22222222-2222-4222-8222-222222222222 | retain_legacy_only | 1 |
| [bp-review-016e22874168d49f](#bp-review-016e22874168d49f) | individual_exception | 11111111-1111-4111-8111-111111111111 | retain_legacy_only | 1 |
| [bp-review-0dbff841d7c4090f](#bp-review-0dbff841d7c4090f) | individual_exception | 22222222-2222-4222-8222-222222222222 | retain_legacy_only | 1 |
| [bp-review-0e09c3e7318f803e](#bp-review-0e09c3e7318f803e) | equivalent_batch | 22222222-2222-4222-8222-222222222222 | approve_responsibilities | 3 |
| [bp-review-0faaf52bde6237fc](#bp-review-0faaf52bde6237fc) | individual_exception | 44444444-4444-4444-8444-444444444444 | approve_responsibilities | 1 |
| [bp-review-162dcf86eb803a25](#bp-review-162dcf86eb803a25) | individual_exception | 22222222-2222-4222-8222-222222222222 | retain_legacy_only | 1 |
| [bp-review-18e534de0b6cb799](#bp-review-18e534de0b6cb799) | individual_exception | 11111111-1111-4111-8111-111111111111 | retain_legacy_only | 1 |
| [bp-review-1af22b324f3b28fe](#bp-review-1af22b324f3b28fe) | equivalent_batch | 11111111-1111-4111-8111-111111111111 | retain_legacy_only | 17 |
| [bp-review-2171c56f6e3a63d7](#bp-review-2171c56f6e3a63d7) | individual_exception | 11111111-1111-4111-8111-111111111111 | retain_legacy_only | 1 |
| [bp-review-2f9adf27db58a2cb](#bp-review-2f9adf27db58a2cb) | individual_exception | 22222222-2222-4222-8222-222222222222 | retain_legacy_only | 1 |
| [bp-review-3568895fe14deb13](#bp-review-3568895fe14deb13) | individual_exception | 11111111-1111-4111-8111-111111111111 | retain_legacy_only | 1 |
| [bp-review-3dee4b0dddb72244](#bp-review-3dee4b0dddb72244) | individual_exception | 11111111-1111-4111-8111-111111111111 | retain_legacy_only | 1 |
| [bp-review-408250ff5877e6e7](#bp-review-408250ff5877e6e7) | individual_exception | 11111111-1111-4111-8111-111111111111 | retain_legacy_only | 1 |
| [bp-review-42cb62c2c4a4efc2](#bp-review-42cb62c2c4a4efc2) | individual_exception | 11111111-1111-4111-8111-111111111111 | retain_legacy_only | 1 |
| [bp-review-439168313e926862](#bp-review-439168313e926862) | individual_exception | 11111111-1111-4111-8111-111111111111 | retain_legacy_only | 1 |
| [bp-review-4634af9b2b55060d](#bp-review-4634af9b2b55060d) | equivalent_batch | 44444444-4444-4444-8444-444444444444 | retain_legacy_only | 1 |
| [bp-review-47e7df8a1551112a](#bp-review-47e7df8a1551112a) | individual_exception | 44444444-4444-4444-8444-444444444444 | retain_legacy_only | 1 |
| [bp-review-499a1504d4f5c237](#bp-review-499a1504d4f5c237) | individual_exception | 11111111-1111-4111-8111-111111111111 | retain_legacy_only | 1 |
| [bp-review-4cd381e66d858190](#bp-review-4cd381e66d858190) | individual_exception | 11111111-1111-4111-8111-111111111111 | retain_legacy_only | 1 |
| [bp-review-5ce791d3d6195398](#bp-review-5ce791d3d6195398) | individual_exception | 44444444-4444-4444-8444-444444444444 | retain_legacy_only | 1 |
| [bp-review-6ae817e63f67f5e6](#bp-review-6ae817e63f67f5e6) | equivalent_batch | 44444444-4444-4444-8444-444444444444 | approve_responsibilities | 3 |
| [bp-review-6c82dccac482697e](#bp-review-6c82dccac482697e) | individual_exception | 44444444-4444-4444-8444-444444444444 | retain_legacy_only | 1 |
| [bp-review-6e956eb4a0c9be4b](#bp-review-6e956eb4a0c9be4b) | individual_exception | 44444444-4444-4444-8444-444444444444 | approve_responsibilities | 1 |
| [bp-review-6fe7cf083039e76b](#bp-review-6fe7cf083039e76b) | equivalent_batch | 44444444-4444-4444-8444-444444444444 | approve_responsibilities | 1 |
| [bp-review-7da894fb2cb8caf3](#bp-review-7da894fb2cb8caf3) | individual_exception | 22222222-2222-4222-8222-222222222222 | retain_legacy_only | 1 |
| [bp-review-8764eb0589b46e47](#bp-review-8764eb0589b46e47) | individual_exception | 11111111-1111-4111-8111-111111111111 | retain_legacy_only | 1 |
| [bp-review-90bbc7908ef9f5a0](#bp-review-90bbc7908ef9f5a0) | individual_exception | 22222222-2222-4222-8222-222222222222 | retain_legacy_only | 1 |
| [bp-review-9184a5a0470cad97](#bp-review-9184a5a0470cad97) | individual_exception | 11111111-1111-4111-8111-111111111111 | retain_legacy_only | 1 |
| [bp-review-95af1c439382793d](#bp-review-95af1c439382793d) | individual_exception | 44444444-4444-4444-8444-444444444444 | retain_legacy_only | 1 |
| [bp-review-983f61f8e77f4157](#bp-review-983f61f8e77f4157) | individual_exception | 11111111-1111-4111-8111-111111111111 | retain_legacy_only | 1 |
| [bp-review-a12f1aabf522b638](#bp-review-a12f1aabf522b638) | individual_exception | 44444444-4444-4444-8444-444444444444 | approve_responsibilities | 1 |
| [bp-review-a2a1131d60502250](#bp-review-a2a1131d60502250) | equivalent_batch | 22222222-2222-4222-8222-222222222222 | retain_legacy_only | 4 |
| [bp-review-a6ffd2c3c31f38ce](#bp-review-a6ffd2c3c31f38ce) | individual_exception | 11111111-1111-4111-8111-111111111111 | retain_legacy_only | 1 |
| [bp-review-c096f28d853f27e2](#bp-review-c096f28d853f27e2) | individual_exception | 11111111-1111-4111-8111-111111111111 | exclude_from_target | 1 |
| [bp-review-d07c1366d7b88e00](#bp-review-d07c1366d7b88e00) | individual_exception | 11111111-1111-4111-8111-111111111111 | retain_legacy_only | 1 |
| [bp-review-d251ffd2818534ac](#bp-review-d251ffd2818534ac) | individual_exception | 44444444-4444-4444-8444-444444444444 | retain_legacy_only | 1 |
| [bp-review-d4abf633c2f6ebb8](#bp-review-d4abf633c2f6ebb8) | individual_exception | 11111111-1111-4111-8111-111111111111 | retain_legacy_only | 1 |
| [bp-review-d4f39b9814d73346](#bp-review-d4f39b9814d73346) | equivalent_batch | 44444444-4444-4444-8444-444444444444 | retain_legacy_only | 1 |
| [bp-review-da1e022b61a362c1](#bp-review-da1e022b61a362c1) | equivalent_batch | 44444444-4444-4444-8444-444444444444 | approve_responsibilities | 1 |
| [bp-review-e55882179c40eaad](#bp-review-e55882179c40eaad) | individual_exception | 11111111-1111-4111-8111-111111111111 | retain_legacy_only | 1 |
| [bp-review-e7ed9a3a4014d99a](#bp-review-e7ed9a3a4014d99a) | equivalent_batch | 11111111-1111-4111-8111-111111111111 | approve_responsibilities | 10 |
| [bp-review-eb17c622fa8096c7](#bp-review-eb17c622fa8096c7) | individual_exception | 22222222-2222-4222-8222-222222222222 | retain_legacy_only | 1 |
| [bp-review-f25088bd0d7bb277](#bp-review-f25088bd0d7bb277) | individual_exception | 11111111-1111-4111-8111-111111111111 | retain_legacy_only | 1 |
| [bp-review-f4bbc25cca3f264c](#bp-review-f4bbc25cca3f264c) | individual_exception | 44444444-4444-4444-8444-444444444444 | retain_legacy_only | 1 |
| [bp-review-fbdb34b22a6373de](#bp-review-fbdb34b22a6373de) | individual_exception | 11111111-1111-4111-8111-111111111111 | retain_legacy_only | 1 |
| [bp-review-fec66db181de3b79](#bp-review-fec66db181de3b79) | individual_exception | 11111111-1111-4111-8111-111111111111 | exclude_from_target | 1 |

## bp-review-0011ad97ffebfd44

Manifest SHA-256: `ae4104b6a6be483fc5885aaa286b8889e2fb6c266ab80ff625fea6116719c33e`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 3e2a198bacfb9cec26843152a71535ed6d106795f50dc52277415190b26acc8d | athyper.emea.procurement (4493ae4f-c856-577d-89b7-856f6f25a271) / demo.neon.athyper.emea.procurement | operating_organization: 06fe7343-59dc-576b-95aa-9fadf37b1cfd (3f4c595c-62fe-f400-6ed0-1182b9c92966); Athyper EMEA Procurement | subtree | b80de5b95e6f5c4fe071dbd7b3f46bc929adede9de590f9b5bc1137a63e67e29 |

## bp-review-002dec0e75f6ee6c

Manifest SHA-256: `b3bb536aca3725246a164462aff484bc9bb232c5ae076678469d15a47d0847ac`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 72d51aac9f43a542374bbf96bdda11fe1d1b9594f6c280c7573a36c2368d2cac | tech.people (8cabcfc3-ec93-5d2b-827d-45fe539b9e97) / demo.neon.tech.people | operating_organization: ae367d98-6b77-5760-8424-6a43196f3b9f (739a1009-88d3-9534-103d-cc474ae638fb); Technostat Shared People | subtree | db5e8d8b16c6c58e10a0315dba8763363d1566e4ab3445b485112424cc2fc93d |

## bp-review-016e22874168d49f

Manifest SHA-256: `80d63bb2813cfc681a08a252cec28e587841fc304e022c974beea504975b1571`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 1851900448e9a8f21b2bd067be81cfe9b5e37cb2557e9ae747f1dffbb6187b4e | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | operating_organization: b07b2544-67b9-5b03-8607-9c35d6886877 (c30cea16-551b-bd62-7bde-dc8928671a9b); Athyper APAC Procurement | subtree | 9b93c239a58adbc6f9db62c0aedccfd8fa83ce7516f56436ad36c15cf2f99c6b |

## bp-review-0dbff841d7c4090f

Manifest SHA-256: `103cb5511d1e96b2ce556c6daacadc1197897d649370744b18069e6a089ea61a`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| ed04b30b6d011750cd5a6d86f0a030e6005de3b68baf7a22776cc10e2aa79d25 | tksa.admin (58044322-4569-5169-9740-aacd987ae12f) / demo.neon.tksa.admin | operating_organization: da5b09db-9b64-57db-8768-ef71ccb50729 (c4be1efe-d918-eb86-2627-4703ae13ee1f); Technostat Shared Finance | subtree | dc1ee3e2da47a398b032ef8c7498ef53907e706d3916a49080e54a8dace96092 |

## bp-review-0e09c3e7318f803e

Manifest SHA-256: `769239e69219790283f9a4d1097ed6d4d1f4eb157ee162fe1c942ba9e5faecf7`

Decision: **approve_responsibilities**. Role: `demo.neon.testing-admin-operating_organization-subtree`. Reviewer: `catl.owner`, both domains.

Map existing organization-scoped case request/read/apply capabilities. Do not assign approver from this mixed administrator combination; preserve its legacy decide and BP mutations pending separate review. An applier cannot apply a case they approved, and cannot approve their own submission.

Proposed capabilities (the exact scope for each named principal is in the table):

- **case_requester:** `neon.relationship.entity_case.create`, `neon.relationship.entity_case.submit`, `neon.relationship.entity_case.update`, `neon.relationship.entity_case.validate`
- **case_reader:** `neon.relationship.entity_case.read`
- **case_applier:** `neon.relationship.entity_case.materialize`

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.activate`
- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.entity_case.decide`

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 8507f011e998c5fa93dbfb57a9da923340bb64a626dd0714ff66f2433072969d | tksa.admin (58044322-4569-5169-9740-aacd987ae12f) / demo.neon.tksa.admin | operating_organization: da5b09db-9b64-57db-8768-ef71ccb50729 (c4be1efe-d918-eb86-2627-4703ae13ee1f); Technostat Shared Finance | subtree | 4607f4e99d910c5744db414b2fa0c07fe0a5353bd2482703dbcf7d1079907696 |
| 995bd1ce27fadfceefa5f23e9a467c1dcbf93868c3885b909bd76337a9d4aa2f | tksa.admin (58044322-4569-5169-9740-aacd987ae12f) / demo.neon.tksa.admin | operating_organization: 3cdb2c1f-3d49-541e-867e-e0658765db26 (1c67189c-640d-b738-61c9-ad876ce857f1); Technostat Shared Procurement | subtree | f4b907e5a942ebf86a4a18c2049b0f8d97c98d39d0c912b6ec37f34727f1bfd5 |
| d6fd7365d084c668518f21462348714f5a4e86c1eb46e27e600232daa5be8b16 | tksa.admin (58044322-4569-5169-9740-aacd987ae12f) / demo.neon.tksa.admin | operating_organization: ae367d98-6b77-5760-8424-6a43196f3b9f (739a1009-88d3-9534-103d-cc474ae638fb); Technostat Shared People | subtree | e30643f5bfc7b0d86ba8c34778330586ec46ce1467f5693048f036fb71890e45 |

## bp-review-0faaf52bde6237fc

Manifest SHA-256: `8c57136b6dd4ef3a362d56bb509f3fdf889dd7db1bbbc26dfbccdae944c6bbfa`

Decision: **approve_responsibilities**. Role: `local.contact-verifier`. Reviewer: `catl.owner`, both domains.

Map contact verification only at the existing organization target. This confers neither sensitive-value reveal nor global BP write access; target parent admission remains an activation prerequisite.

Proposed capabilities (the exact scope for each named principal is in the table):

- **contact_verifier:** `neon.relationship.business_partner.verify_contact`

Individual-review reasons: reviewer_is_assignment_subject.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| e0698257c24caaf7f6bb064659990c57c2f5efcbda9c22fc98c7c8d7fe8a39e0 | catl.owner (645b6a55-3355-526a-9643-3900425bde47) / local.contact-verifiers | operating_organization: a478f9c0-8226-5d22-9599-b8fb27a45180 (bd7f1a62-5c32-5a9b-a984-c5adc3370a24); CirrusAtlantic Operations | exact | 612ab5858c70849d0e861da4b3e00c31f971a744bef06a17b1ee42f35c14f45f |

## bp-review-162dcf86eb803a25

Manifest SHA-256: `f7a0e5886ed791e3d300ad869d24d6f280a4a8d0d51829cdf530944d3a982c02`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 91d2610cad398c077f584bec7e524b331372a2f38ea46a20fd7c559be387689c | tksa.admin (58044322-4569-5169-9740-aacd987ae12f) / demo.neon.tksa.admin | operating_organization: ae367d98-6b77-5760-8424-6a43196f3b9f (739a1009-88d3-9534-103d-cc474ae638fb); Technostat Shared People | subtree | c314c6888a7847d48ccf85d79e6b6ef29759547ac1823ac62abeeb0f629947d9 |

## bp-review-18e534de0b6cb799

Manifest SHA-256: `f3e85b8b26f2607b360f4f8e4ebe9b6af986ae781d22fcbe21ceefec81ff79eb`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 6d6abc4c262555dfe3247cd5dedae4f3700376b0f9f779d69d51f934a33a51bb | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | operating_organization: b485586a-5753-5a62-ae70-a85fa4d19d10 (117847b0-de0f-280a-cae4-fefdcdbbc893); Athyper AMERICAS People | subtree | 6d6bc796f4aed26fad1e7add411b1d9b1b1a7f24c2e3bdc85b3d9109da5f9c8a |

## bp-review-1af22b324f3b28fe

Manifest SHA-256: `4d2b41064f82b51c77d53404b9f901a173775aecb43d4326675a7455999839e2`

Decision: **retain_legacy_only**. Role: `demo.neon.testing-admin-legal_entity-exact`. Reviewer: `catl.owner`, both domains.

Retain the existing legacy BP create/update grant only. Legal-entity scope cannot be reinterpreted as company-code scope; a company configurator requires an explicit ownership/capability proposal.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.update`

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 03f8b97a73234db8483718aad3c02d06a67e7738828bba93761051ba9a3aef02 | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | legal_entity: e88f0288-ea91-56d7-afa9-f0884a3bc69e (fad2a2aa-7538-1aa5-7dd1-0c529f8d2fab); Athyper UAE Trading | exact | 93ff04155370906223ea3e68dde91e19e2e2a0da980ecdde95193083fef8c9d9 |
| 06b4e088bf6bd2ccab3b57437893b13d1f30d69b71c220cfdeaf2b420972977f | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | legal_entity: 9bae80c5-8d11-584c-823c-c5f1295d4fad (c176e294-b40e-5049-be94-97db98607d81); Athyper Germany Pharmaceutical Mfg | exact | 14b79eaa6c9fd891b359cf95a5dafbf9715140095f65e75b04a081985fd0fbc0 |
| 165ce7915a19bf80fde65688dc6491c99bae6d405dc06c10dc8109adce549df6 | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | legal_entity: 1c63a83b-e902-5983-998d-2069c3324067 (c700212d-3ec4-caf1-541f-a5dfe4d39b2e); Athyper UK Agriculture | exact | c8bd5b111011aab032b3719b24b21a974d4386920724e2e27f3be7b06252f69f |
| 2c5de730de8b78849281687b50b50b30f527ea2b452063f987a19b56f87bce75 | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | legal_entity: 56926e3d-5561-5dae-a3e1-1632c1dbe69b (a48c1c61-4e8d-0088-86a6-f9f83f0c3016); Athyper Malaysia Real Estate | exact | b7f839349f6fdeaa1dd3098f787b50af8cbbf6d257251b583fa2e1fdf4047110 |
| 38ca6725a0de93ad5301899628f65f0338025c215635c190a70cb34ee0d28591 | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | legal_entity: 40ae3fdf-46d1-5104-be80-452753318503 (9383dbcb-472b-c4c7-44ba-d56ad1d25b39); Athyper Taiwan Electronics Mfg | exact | eb502ef99dd08299c024f2080cff83135e610aee1fdee7013e6567b8f6cbdfca |
| 3bf35cb1c7874df5152cf420e21766780d2161a1c18f7aa531a22583e28816a3 | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | legal_entity: 8b4e705d-8e8e-51a8-9849-839d4f962275 (b3a65590-fe16-06f3-26d8-ea9b70822dd9); Athyper Saudi Hospitality | exact | 384e2462c0a2238378ec7fd59f3283f25361804e4d2b37cd732619a87648bc53 |
| 4235fb6bb4a8c207168ee40df8f90e583263c0309e7c7d5ada12aff0640b311f | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | legal_entity: 740f6d7e-5d97-5d03-b4d6-2e82aaf531af (5294109d-4e1f-6e15-762e-73fb261b25a2); Athyper Qatar Transport & Storage | exact | cca1a0e9ca97cb388b8494d54bc1d7f57ac4499f4d7619838ade729707adf5a8 |
| 42492c561b4c3b8bc6d6dea98d77cf959925836bea340b999c7d71cef20c054a | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | legal_entity: a42d1e81-7e5d-5ecd-9294-d14b90a6b26f (43e6d346-a9ff-6cd3-31a7-6109532fc899); Athyper Canada Food & Beverage Mfg | exact | f797846f340f142ca8d1f8477225daeb7e651c1bde75b46dd5cf13a99ddb0add |
| 71ffb8e15fa4d9a9847a7a94b151fda21da6317e4342034f465d8dfdb6982330 | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | legal_entity: 08a11996-1497-582e-a2b5-d9f0bc8fc513 (e34e04dd-f866-394f-45bc-e6313a7e2fbe); Athyper Qatar Utilities | exact | c4b345c0899673ae16c5e1103e424ff7cbb0111a725dbed3d7b19152635f3f32 |
| 7d1da15f22788e0b3d4bc928cb4fa2fb63056d1c77b48abec7830a4126a38ceb | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | legal_entity: a97a642c-8453-5c0f-a436-05d94ef825f7 (358a974a-4d48-9e5c-3465-a07ce391070e); Athyper Singapore Financial Services | exact | b28ce6147715f925de3671c8cb8929e2fbb7381b6c1e167029103051f43b848c |
| 7e9dcc9a5cca38bdca7627cdf7abbfc7007e6e8808c031c347d1a25d8a364709 | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | legal_entity: e10f267f-500e-56f1-8f44-885bb07041e7 (f4f878cd-46d4-19f4-dd61-e969f5459ae5); Athyper South Africa Petroleum Extraction | exact | 8f1127563ec4f10e2aafa41d0ef5cea71a9b74a83307eab09a0e25ef8d5de5e9 |
| 892257b679adc36d8d33ff01ebde8d50f401f734c2de178ab14a626a05802e5b | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | legal_entity: 1f04edc8-ae67-5b7c-84e7-48ee092c4124 (cda5a219-da1a-42ce-19c6-168b569bb5f2); Athyper US Information & Communication | exact | 47e0e3c82777ac2f05e11b8d3e73e98f921bc918b5d3b45ca2a795796c84aea9 |
| ad109139bcd74ae0ce6aaf8509309f1c51b7fbebd57f6752f5e76d8eb5b4724e | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | legal_entity: 3d92d1b5-3b0e-51af-ac98-a918e82ce8e6 (fdaec1a9-f300-93df-fc68-e7d3e659c6d2); Athyper Saudi Construction | exact | cf4071952ed758bad7c6b5f9395afa068f4affccfe69d32bfbb724ac0e33c90a |
| ae064d9afca731e53d733e86f403f3bb087fdd754c31bf7592178665c82fcba8 | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | legal_entity: 072eb1c2-8d46-5e45-9ff9-51e4c438b9f6 (004eaa06-3c13-6f7e-f44f-1242402b330a); Athyper Philippines Hospital Services | exact | 4dc482790a4a0f70fa1825558c8038461b105cb508599c6eb34dfe120238d889 |
| d94dc7e41f8ebe6b4e18f40d3f52690c4c2b98cf7be8ce0f8d6676873588460d | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | legal_entity: daa0ffde-d701-511a-82cb-96c077707194 (e5720e4b-479e-a5da-55da-ceb20576cb79); Athyper Japan Education Services | exact | 743abb0c97e664e74b0d026dfcc460894d4a2a856fc292ed3dc34f4d390ac640 |
| e03d7ae663ff1cd4fa2d4c14b1d3aecc333ed2a6c16a539a5651c914bc3d4e2f | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | legal_entity: 254ba67f-10a6-577a-abc6-1719eaf1edd0 (dbbbb0a5-89d4-77eb-a7da-eefa62a97633); Athyper Group Holdings | exact | 4706418287907e2a1ed86f14bd45367b4eb0196a114870245924c614b52225ce |
| f267deb4e219b9d70089909ea6d97aa7549cdcbfe5eec8c04826cc6a2372d383 | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | legal_entity: f7ac7695-1d5b-5858-9863-a040ac8c89f0 (13cef21b-0c11-a3a5-16ef-64b9ad026cc9); Athyper India Textile & Leather Mfg | exact | 4b6ff6adec316cd23f8be6162ccb818ea0197aca9ff470fee9d989451d525058 |

## bp-review-2171c56f6e3a63d7

Manifest SHA-256: `4bda4651cf0b2189f27cff5cdcb3138c3ef7fabe6be654cb9d992687e534cd15`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| e379d41f80f4ee5f8a28182e8b707a9681863d8d8fc5b7c41d5c1be5d6aea69d | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | operating_organization: 5267f3a7-4113-5b94-bc1a-c67aa760916a (51b4fc2a-9312-7a96-264d-6e6e548ca21b); Athyper AMERICAS Finance | subtree | 192993aadcaca0b31d212ed8ee365da35daf8678e8b66e1642b158c13723745a |

## bp-review-2f9adf27db58a2cb

Manifest SHA-256: `66f5ccde53918d8df969e3cda5f2ce2792cdca75387578c795cb20134f72e36a`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 49c4ebb2bbac48da3a02fcc6a47d44d19f27609831921e40a44dd220bedcefc5 | tech.procurement (52347de9-38d6-531e-9aac-5affd7ba6893) / demo.neon.tech.procurement | operating_organization: 3cdb2c1f-3d49-541e-867e-e0658765db26 (1c67189c-640d-b738-61c9-ad876ce857f1); Technostat Shared Procurement | subtree | 6bf8db0ab1f6a72b42168684469b1849fe400e273cc4c467eaa7513c893cd479 |

## bp-review-3568895fe14deb13

Manifest SHA-256: `93fba7ed2a4467b667a73eb197a90fc29237aaf4be0633aa20bc6a4deacc2791`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 94a1fcfe71ecb3443670b2e2ef204ba7681aeb67650250731ba34270c5a96e24 | athyper.emea.finance (61b86b1f-d432-5d9c-85d7-b0bda0734868) / demo.neon.athyper.emea.finance | operating_organization: cee77cc4-b5c8-5e5e-a225-035f616e162c (fef9934a-aab0-6702-8705-bb23b517e19c); Athyper EMEA Finance | subtree | 5057f5ef5d4a75fa61aaa3391bd1d263fb9f3158e08c46ac989936680c16d5a8 |

## bp-review-3dee4b0dddb72244

Manifest SHA-256: `24527a6df6d93697f902064432738982f3f4cee62e6d00a23055b27ed54705ea`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| bf52d0df4a7c31920c4c9d6660dc88f31e11aea9c85b51bd270bfa5afb561c3e | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | operating_organization: c6d51f2a-198f-53c2-847d-aec000e5dfef (a8dbfe9b-2fdc-7dec-dfc8-7f2de7dbd3c7); Athyper Shared Services | subtree | dc2ba1506907bb9607e3fd3323799ff4a6df505667c66449840496c56bedfdac |

## bp-review-408250ff5877e6e7

Manifest SHA-256: `f97b39ca6a7004a5e048a95f0381eb547ae2eb6bd7f38016033f28c48ca23601`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 5ba7251e0bfca31122d238209e156917faa6dbf1d6832f277be9eeb8182ab63e | athyper.americas.people (3823b1d6-0f73-5a83-b637-a1599a94676e) / demo.neon.athyper.americas.people | operating_organization: b485586a-5753-5a62-ae70-a85fa4d19d10 (117847b0-de0f-280a-cae4-fefdcdbbc893); Athyper AMERICAS People | subtree | c6b05f5f244cf0493c42391d8b0f6d87027ea1a0fccdf4c474545d568d641d80 |

## bp-review-42cb62c2c4a4efc2

Manifest SHA-256: `a88a675470887eb8ee8a94b73a1022cd00317ee76cb58c7b6f62707e66afa6eb`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 4e1cc6af89c40044d5d15d4369a261fa117117f598310fe7bfdeb83e15315798 | athyper.americas.procurement (d955dc4e-0910-5706-ae7b-64daebffa2df) / demo.neon.athyper.americas.procurement | operating_organization: 51bbb2b9-c102-59a7-8b6c-ee7d23bb2b8d (ee56f8a4-0c12-b982-9019-35a8c7e0c20e); Athyper AMERICAS Procurement | subtree | ee60e2dfc8bc8d98f045f02813b4e4a34f8fec9b7087db8223e6972c8312156a |

## bp-review-439168313e926862

Manifest SHA-256: `b89e0d2b0060c78f4db392b84d77068ebe7b6f894fbf05966da5e146d8735029`

Decision: **retain_legacy_only**. Role: `demo.neon.testing-admin-tenant-exact`. Reviewer: `catl.owner`, both domains.

Retain tenant-scoped legacy create/update only. These permissions do not establish steward, global reader, requester, approver or materializer responsibilities.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.update`

Individual-review reasons: global_authority_boundary.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 32b1963b08daa3ff347d2c3512bcc1f0a822a824f031766c9d7acf236dc34971 | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | tenant: 11111111-1111-4111-8111-111111111111 (221b1592-790b-532c-9590-8b537000708e); Athyper Group Holdings | exact | 9b8856d5b8bab45730294b3a7e1f41d227012c9140eb5eacd499df15097b58e9 |

## bp-review-4634af9b2b55060d

Manifest SHA-256: `473d39d90e3f01f7029eae0a20404ec9d26c31b441c0b5e471d83f6233345447`

Decision: **retain_legacy_only**. Role: `local.master-data.root`. Reviewer: `catl.owner`, both domains.

Retain scoped legacy root read/update pending resolution of directory/global-read policy and governed mutation capabilities; do not widen scope or infer stewardship.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| b4da67570cf88bbdcdbf4b68285ab115145f09f9e1ea077a18581a95412787ae | catl.admin (cca94907-7519-5871-8e3c-6b11aa545c93) / local.master-data.catl.admin | operating_organization: a478f9c0-8226-5d22-9599-b8fb27a45180 (bd7f1a62-5c32-5a9b-a984-c5adc3370a24); CirrusAtlantic Operations | subtree | e2b2d52c60f806236f2498ee5e20686a686d10d70964e2b9ca68f97237d5edc8 |

## bp-review-47e7df8a1551112a

Manifest SHA-256: `c4f9e8756a71ba7cd3963c622ac8c9d9509aa32cec78da23957822a647989a51`

Decision: **retain_legacy_only**. Role: `local.master-data.sensitive`. Reviewer: `catl.owner`, both domains.

Retain existing sensitive read/write access pending purpose, data-class and parent-admission review. Do not copy these capabilities into global stewardship or an unrestricted reader responsibility.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.read_address_sensitive`
- `neon.relationship.business_partner.read_contact_sensitive`
- `neon.relationship.business_partner.write_address_sensitive`
- `neon.relationship.business_partner.write_contact_sensitive`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| b9f314c6a9e4589996f87f8247c9ef17b853a3f391dfa006e5bf040d7f5a7632 | catl.admin (cca94907-7519-5871-8e3c-6b11aa545c93) / local.master-data.catl.admin | operating_organization: a478f9c0-8226-5d22-9599-b8fb27a45180 (bd7f1a62-5c32-5a9b-a984-c5adc3370a24); CirrusAtlantic Operations | exact | 8415065245693f63c0bc3fc7ec34a7b1878c4fde28f53bbcaf82fb33ed71ddfd |

## bp-review-499a1504d4f5c237

Manifest SHA-256: `e8d27024b2e013780a94049760ac8a75c6750fa2c939ba1ba5c4dc2be5947d0a`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 56c65bd1325a2b1266eefa3065e8a1feb067074c56e82bc1beedcb69e9c3d450 | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | operating_organization: 06fe7343-59dc-576b-95aa-9fadf37b1cfd (3f4c595c-62fe-f400-6ed0-1182b9c92966); Athyper EMEA Procurement | subtree | fb4285aaa6e493fe2b85377970ac8482596de5e3f9e7d79233ef46596c440499 |

## bp-review-4cd381e66d858190

Manifest SHA-256: `a70ea64b4135096301a5f915fd12be77444574ab5f83ccd56f134b061a51221b`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| f1ec47430cfe74219bbb3b717a20e192c49390b8bd1db7227c9b1f2767c3e809 | athyper.apac.procurement (0e8a1539-d654-58e1-bddf-9cbf4170206a) / demo.neon.athyper.apac.procurement | operating_organization: b07b2544-67b9-5b03-8607-9c35d6886877 (c30cea16-551b-bd62-7bde-dc8928671a9b); Athyper APAC Procurement | subtree | 74091ea62ad92a2c64355d189b906d2d1cc4fdc660c63d25b48339e1ce46ec80 |

## bp-review-5ce791d3d6195398

Manifest SHA-256: `be7269c8161b1568e62dc69e15bdcb1403f5e33473f18c01620dce0ef887a108`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| fdc6b3265fe0402d7d9eec75f7f3bf2e5d67df6e2636fbfdff6f2af716327830 | acceptance.bp.v1.requester (6a0a6543-fb1b-500a-9acf-b6a054599e7e) / acceptance.bp.v1.requester | operating_organization: a478f9c0-8226-5d22-9599-b8fb27a45180 (bd7f1a62-5c32-5a9b-a984-c5adc3370a24); CirrusAtlantic Operations | subtree | 84544f962dd49122d89c3e5c5ee48e99ab88c478418b280e61437b4c023a3859 |

## bp-review-6ae817e63f67f5e6

Manifest SHA-256: `d22a7d56dcd90f7db8be57645438b4cd85970750e8f1d5203c8d5e8fa88c0351`

Decision: **approve_responsibilities**. Role: `demo.neon.testing-admin-operating_organization-subtree`. Reviewer: `catl.owner`, both domains.

Map existing organization-scoped case request/read/apply capabilities. Do not assign approver from this mixed administrator combination; preserve its legacy decide and BP mutations pending separate review. An applier cannot apply a case they approved, and cannot approve their own submission.

Proposed capabilities (the exact scope for each named principal is in the table):

- **case_requester:** `neon.relationship.entity_case.create`, `neon.relationship.entity_case.submit`, `neon.relationship.entity_case.update`, `neon.relationship.entity_case.validate`
- **case_reader:** `neon.relationship.entity_case.read`
- **case_applier:** `neon.relationship.entity_case.materialize`

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.activate`
- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.entity_case.decide`

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 0906e51999bfb4a6c5831787d4625209c16aef9ac6f9e69bd077583d495c48e0 | acceptance.bp.v1.materializer (4fa4f3ba-d4e6-5811-826c-a0ba323b4477) / acceptance.bp.v1.materializer | operating_organization: a478f9c0-8226-5d22-9599-b8fb27a45180 (bd7f1a62-5c32-5a9b-a984-c5adc3370a24); CirrusAtlantic Operations | subtree | d110729282689ed5a3c6132022edb11fc466c075caa4a032555c1d2afa64eec6 |
| 6cbfd46cd574bdfa8f574053ad85f7c0c65610774c166d3fc1a7faf4305e0b24 | acceptance.bp.v1.requester (6a0a6543-fb1b-500a-9acf-b6a054599e7e) / acceptance.bp.v1.requester | operating_organization: a478f9c0-8226-5d22-9599-b8fb27a45180 (bd7f1a62-5c32-5a9b-a984-c5adc3370a24); CirrusAtlantic Operations | subtree | e267153be75dea0e2d37fb5714508d35e93b17961a7617a9757a74c816bb3cac |
| d4a4bc4c6ef255c1c9b63bc563950e06684660ea04fd22f164b45e280a110be6 | catl.admin (cca94907-7519-5871-8e3c-6b11aa545c93) / demo.neon.catl.admin | operating_organization: a478f9c0-8226-5d22-9599-b8fb27a45180 (bd7f1a62-5c32-5a9b-a984-c5adc3370a24); CirrusAtlantic Operations | subtree | ea868e417ba302aae98b4e6b347aa02785f59a57f2c7af9e5c3d145f2b17876a |

## bp-review-6c82dccac482697e

Manifest SHA-256: `02865e9189a7ba5efb96f22abb18e691c3ea9b4f21741fdca3ced9c10cc78879`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 0e52f426770a418a4a6043388ed578b399bc854e3222bdc8abec457e5baa4e6a | catl.admin (cca94907-7519-5871-8e3c-6b11aa545c93) / demo.neon.catl.admin | operating_organization: a478f9c0-8226-5d22-9599-b8fb27a45180 (bd7f1a62-5c32-5a9b-a984-c5adc3370a24); CirrusAtlantic Operations | subtree | 6589ac8fc9f93ca72a72f0d3e28bdda9a222c28a8e08cfe9dd4a09f2c7fab8fc |

## bp-review-6e956eb4a0c9be4b

Manifest SHA-256: `129805cab43118898bb1215a6914b2b07817cc2474bb83827d810b17d27e4292`

Decision: **approve_responsibilities**. Role: `catl.demo.business_partner_case_approver`. Reviewer: `catl.owner`, both domains.

Map the dedicated existing case review responsibility in its exact organization scope. Retain independent work-item assignment and maker/checker authorization; scoped BP read is not promoted to global-record read.

Proposed capabilities (the exact scope for each named principal is in the table):

- **case_reader:** `neon.relationship.entity_case.read`
- **case_approver:** `neon.relationship.entity_case.decide`

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.read`

Individual-review reasons: reviewer_is_assignment_subject.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 0925060788a5fe9cdbb28e9a5a3ff632347d3727587a44111fa443aae1ee2dbe | catl.owner (645b6a55-3355-526a-9643-3900425bde47) / catl.demo.legal_entity_owners | operating_organization: a478f9c0-8226-5d22-9599-b8fb27a45180 (bd7f1a62-5c32-5a9b-a984-c5adc3370a24); CirrusAtlantic Operations | subtree | 50fd9966937c1fc59a43be5cccb4da3bd652e2e32f2dff3ece9901f7a38ae1c4 |

## bp-review-6fe7cf083039e76b

Manifest SHA-256: `e1a967cced1530c4e7c9ed6525b296fec0556aa033112b55171ad3cd0c530e0f`

Decision: **approve_responsibilities**. Role: `local.contact-verifier`. Reviewer: `catl.owner`, both domains.

Map contact verification only at the existing organization target. This confers neither sensitive-value reveal nor global BP write access; target parent admission remains an activation prerequisite.

Proposed capabilities (the exact scope for each named principal is in the table):

- **contact_verifier:** `neon.relationship.business_partner.verify_contact`

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 23d7aaac42a1fbeebcefaae46948f9059a5ca890d38119c6ab1b934187f26621 | catl.admin (cca94907-7519-5871-8e3c-6b11aa545c93) / local.contact-verifiers | operating_organization: a478f9c0-8226-5d22-9599-b8fb27a45180 (bd7f1a62-5c32-5a9b-a984-c5adc3370a24); CirrusAtlantic Operations | exact | c742e304dce81b93780b405f618210fa89fcd6c989981ecd534d5b6a8d54ea64 |

## bp-review-7da894fb2cb8caf3

Manifest SHA-256: `3fcb6782024c1584d897c1c003444bdb4b6ecf85b4b233197282d796c8642f0d`

Decision: **retain_legacy_only**. Role: `demo.neon.testing-admin-tenant-exact`. Reviewer: `catl.owner`, both domains.

Retain tenant-scoped legacy create/update only. These permissions do not establish steward, global reader, requester, approver or materializer responsibilities.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.update`

Individual-review reasons: global_authority_boundary.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| d7876c4ff7dd463a6f24591a052897b03be12e266ce5878a40d2edf17755d23c | tksa.admin (58044322-4569-5169-9740-aacd987ae12f) / demo.neon.tksa.admin | tenant: 22222222-2222-4222-8222-222222222222 (4b1d9aa9-9a7e-5f32-8b34-2b553bc5c962); Technostat Group Holdings | exact | 7e2ae7ccabf3170a06e3456cbda647f1eee88cce5346eef104609b847b4c8929 |

## bp-review-8764eb0589b46e47

Manifest SHA-256: `5d8e122cba3040c3958bcad2a82afb1f0ac943e86b0a3e57a8efbaa662067b80`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 6457c055abc355fcc533f73da2112a17a24d73aa2aeff12aef57212829da52a2 | athyper.emea.people (342df7d3-fc6b-514f-8a4d-bb3bf53fa679) / demo.neon.athyper.emea.people | operating_organization: cef5c9fd-61ad-59e9-b29f-0802dfff71a2 (50632ff2-70b6-2b7f-bbad-c2a4a4cbbe65); Athyper EMEA People | subtree | 0a80ef735498fc82661821c016eaf3ec21d4b803cc3e4b4809f5fbea09012bfa |

## bp-review-90bbc7908ef9f5a0

Manifest SHA-256: `b53ba2650f410160b7a4ad5586d345bf65eff1db0a27a54aaf54d0276d49b042`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| ada6c3f661a5caa559d3f50660dfa14ad10210add769e1ebd194065e899de084 | tech.finance (0531cb65-3d10-57d2-b941-828afb2865a9) / demo.neon.tech.finance | operating_organization: da5b09db-9b64-57db-8768-ef71ccb50729 (c4be1efe-d918-eb86-2627-4703ae13ee1f); Technostat Shared Finance | subtree | 14e9f4e7f175040eee2c88818490b1e7ed1fb33da8e6cc8f5fe7f0118f28b9c5 |

## bp-review-9184a5a0470cad97

Manifest SHA-256: `494a7d472875dae14e72c7fedbb7b64ee91a45f758c0179d3966bbf2ffd27de5`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 095261e09b6258a4ae25c22ca21341b51eb5f782cbb4a5890f8549aba8b9e134 | athyper.americas.finance (5e5b65cc-5993-5491-8cbc-448eacd63876) / demo.neon.athyper.americas.finance | operating_organization: 5267f3a7-4113-5b94-bc1a-c67aa760916a (51b4fc2a-9312-7a96-264d-6e6e548ca21b); Athyper AMERICAS Finance | subtree | 4d0446879cb8d39b32019e70b90de89cc30c11d65f151976a3e64869cad39a3e |

## bp-review-95af1c439382793d

Manifest SHA-256: `eb8cb11b4adccfacf069a9f965645b86af7c3e936acf85c413ce19f4cc173a21`

Decision: **retain_legacy_only**. Role: `demo.neon.testing-admin-tenant-exact`. Reviewer: `catl.owner`, both domains.

Retain tenant-scoped legacy create/update only. These permissions do not establish steward, global reader, requester, approver or materializer responsibilities.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.update`

Individual-review reasons: global_authority_boundary.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| a4a676b7d52739bdf69943991ebe71a6f67d08ab7adaf63cb2cbd3036b007805 | catl.admin (cca94907-7519-5871-8e3c-6b11aa545c93) / demo.neon.catl.admin | tenant: 44444444-4444-4444-8444-444444444444 (1d8314f6-8541-57cf-8748-679cbe318bc8); CirrusAtlantic | exact | a316625bd5147e3cb0f719060d55a833f74018e7521f68f3bfc566b11f57cc13 |

## bp-review-983f61f8e77f4157

Manifest SHA-256: `bf809686410eaa51881e30ae38b6b2e7185c4183f41bab68786871ff1df1609d`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| e7e1a81b7f04e46729e9afa138c7e6e15a581221f7100aba00b9b323815f0b50 | athyper.apac.finance (3d9061b2-5c5f-5412-819f-9f90c4de0f8e) / demo.neon.athyper.apac.finance | operating_organization: ce465b6b-192d-5211-a245-de1ad7fa4c44 (b0617d7c-1fcc-61b8-7d32-886f5b90120b); Athyper APAC Finance | subtree | 10c048d9aec2c0595567472cc8c2a531b0a58126926fb94b2085e82504478225 |

## bp-review-a12f1aabf522b638

Manifest SHA-256: `3a23c3e00767d34ee71e94777637ed21335c32902bc6b56c1621f8da692141dd`

Decision: **approve_responsibilities**. Role: `local.contact-verifier`. Reviewer: `catl.owner`, both domains.

Map contact verification only at the existing organization target. This confers neither sensitive-value reveal nor global BP write access; target parent admission remains an activation prerequisite.

Proposed capabilities (the exact scope for each named principal is in the table):

- **contact_verifier:** `neon.relationship.business_partner.verify_contact`

Individual-review reasons: reviewer_is_assignment_subject.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 517ca2b454935f93f207819255945687737d59826a4a35b9d72897f2a08ada98 | catl.owner (645b6a55-3355-526a-9643-3900425bde47) / local.master-data.catl.owner | operating_organization: 24267903-6196-5846-8322-43a8e35c9630 (0d96565b-f87d-37ab-f454-ccfdafbd1ee4); Local synthetic master-data organization B | exact | 4dd0bc783d1ea06eb5d4c405f257c7b143e9f647bfcb6684aba59884471c20ab |

## bp-review-a2a1131d60502250

Manifest SHA-256: `84c2bc494909a02912ee793d2d243c1737af3a5992d1c6ff424b3e4fce2f60ef`

Decision: **retain_legacy_only**. Role: `demo.neon.testing-admin-legal_entity-exact`. Reviewer: `catl.owner`, both domains.

Retain the existing legacy BP create/update grant only. Legal-entity scope cannot be reinterpreted as company-code scope; a company configurator requires an explicit ownership/capability proposal.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.update`

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 0fe3164d48614b65ff7b0a3dd90c747cfc6f5e3208b01962351cc6683c712cc4 | tksa.admin (58044322-4569-5169-9740-aacd987ae12f) / demo.neon.tksa.admin | legal_entity: 090a2fc0-9a37-5d81-86ac-5135885ff636 (587e1102-ed04-cad2-4e87-ab463446396e); Technostat Egypt | exact | b498a49bdef7e4d6ce6d73fd21aedbc97c6b45a9ec822444e078b4c1092d2bc8 |
| 5e0ab72b2897e266e57de5ec3280e04dd23a54c2b96b39073c7674944042606a | tksa.admin (58044322-4569-5169-9740-aacd987ae12f) / demo.neon.tksa.admin | legal_entity: b1907358-ec85-5c20-89a2-e8ed8f4d8dfa (42f7fb93-20de-d730-dc2b-9e697614740b); SSK Saudi | exact | 872a74f847307a75a5448cd94a12222a7bb25457dec0902fce3e45f6850091b4 |
| dd66f86d563797ca171db09b94ba2e71bd0a94f857754862d9c7bc016e806a01 | tksa.admin (58044322-4569-5169-9740-aacd987ae12f) / demo.neon.tksa.admin | legal_entity: d7d22a21-0854-529b-9666-20133950b2ac (772df290-f3fb-5cd3-37a3-3e4b25978656); Technostat Group | exact | a5d2c673db508db7f627cd7e346909cd29deb6a249f19cf87ee5861e4ff572e1 |
| fd80200fc52786578650cf103288036f1e6974f640c0c4b2a0b10ed1427cbec5 | tksa.admin (58044322-4569-5169-9740-aacd987ae12f) / demo.neon.tksa.admin | legal_entity: 5b3bf17c-49dc-5f43-856a-b03dac4a78ca (22320b38-22c9-da4f-ef1a-160fa98eb6da); Satellites for Digital Transformation | exact | 3543d02682be55525b36582bbc12b9799a6ebf33abe9ff7376cf729c60a140fb |

## bp-review-a6ffd2c3c31f38ce

Manifest SHA-256: `c3be32f8d0aa5e0dfa8afe99f78495fdabccbaf5e41572e50d380e0ff58c3b21`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| a41af090017132a91b434610e450015660cf8a69bcbf0bc0e1d1097791ca9628 | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | operating_organization: ce465b6b-192d-5211-a245-de1ad7fa4c44 (b0617d7c-1fcc-61b8-7d32-886f5b90120b); Athyper APAC Finance | subtree | 20ec9ffbffd6b16653e07a532280a5a9d2bd05ddc49715353d0cdcbf1223565e |

## bp-review-c096f28d853f27e2

Manifest SHA-256: `034f486a7598aaf4bb4c05c218dcb132b9678fdd4c08cf651e0ab4ca70ced54a`

Decision: **exclude_from_target**. Role: `acceptance.bp.r2.44f10c9b-b4fa-5155-9365-4bfcc22ff5fd`. Reviewer: `catl.owner`, both domains.

Acceptance fixture role and scope: exclude this test-only combination from the target business responsibility mapping. Existing grants remain untouched; any fixture cleanup requires a separate change.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.activate`
- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.entity_case.create`
- `neon.relationship.entity_case.decide`
- `neon.relationship.entity_case.materialize`
- `neon.relationship.entity_case.read`
- `neon.relationship.entity_case.submit`
- `neon.relationship.entity_case.update`
- `neon.relationship.entity_case.validate`

Individual-review reasons: test_fixture_exclusion.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| c5fc0344b104188b0f32c3c8b9f064422eeba61b824cb2299e2b89b641d9f993 | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | operating_organization: 8cb267f9-c30c-5c87-9c35-c0e4830ecb8c (16a8b151-afe6-1db6-91b3-db358b7da34a); Business Partner R2 acceptance | subtree | cd35b80b2247c05674393e30453786e29354f7c0080af8a05c31e6d413e4e382 |

## bp-review-d07c1366d7b88e00

Manifest SHA-256: `1631defe4e4c3df8d0ef05099a72f3f06557db50b14c3530c9b6a93ab558453e`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| c7733971cf8a4eff01c535398a0ada6949d9169f2a05bd3f38fe1b14f77f0dcf | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | operating_organization: cef5c9fd-61ad-59e9-b29f-0802dfff71a2 (50632ff2-70b6-2b7f-bbad-c2a4a4cbbe65); Athyper EMEA People | subtree | 822d3ac0d288e79738b8b699756526f9ff3e2f06529f19ab76c190d58ffad0ca |

## bp-review-d251ffd2818534ac

Manifest SHA-256: `89c7fa0e9047bde7433f471cfc570c8fdd2bb128fc707b20cafa9232ae1e196a`

Decision: **retain_legacy_only**. Role: `local.master-data.sensitive`. Reviewer: `catl.owner`, both domains.

Retain existing sensitive read/write access pending purpose, data-class and parent-admission review. Do not copy these capabilities into global stewardship or an unrestricted reader responsibility.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.read_address_sensitive`
- `neon.relationship.business_partner.read_contact_sensitive`
- `neon.relationship.business_partner.write_address_sensitive`
- `neon.relationship.business_partner.write_contact_sensitive`

Individual-review reasons: sensitive_or_mixed_reader, reviewer_is_assignment_subject.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| ed9757e8fe184b6e4e8dc008119c9c900678a397d81f8cf6be4c968795c0a201 | catl.owner (645b6a55-3355-526a-9643-3900425bde47) / local.master-data.catl.owner | operating_organization: 24267903-6196-5846-8322-43a8e35c9630 (0d96565b-f87d-37ab-f454-ccfdafbd1ee4); Local synthetic master-data organization B | exact | 02423995a2d322dc063a90c5d9929f63f4ee9dfe75a6d5958c008c2b44aef875 |

## bp-review-d4abf633c2f6ebb8

Manifest SHA-256: `eb01e806f01891cab936622a361b9ec515337930ac10b02a9f7dcd971b619510`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| e101bc6f0177aa615754122db001d0de020361f48f9ff12bdf3726c8b8e08676 | athyper.apac.people (1eb74519-15f3-56db-a036-dca05ab98d3d) / demo.neon.athyper.apac.people | operating_organization: 12169af1-7c53-5538-941e-45f136ccbe2f (f8676fee-278c-dc9d-c074-05c4e692bc01); Athyper APAC People | subtree | 1c275cf8acaae109c20365394314d1731f0b9f6839e5ff626a093733e97ed83d |

## bp-review-d4f39b9814d73346

Manifest SHA-256: `ecda5db93736199363a2c9ac394d6fe1ab135fde7b057565742c1a8ec46af353`

Decision: **retain_legacy_only**. Role: `demo.neon.testing-admin-legal_entity-exact`. Reviewer: `catl.owner`, both domains.

Retain the existing legacy BP create/update grant only. Legal-entity scope cannot be reinterpreted as company-code scope; a company configurator requires an explicit ownership/capability proposal.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.update`

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 500644ac1683bf71567b204580c5231459cde3ab21c4a0d2b2aefb179b881bcc | catl.admin (cca94907-7519-5871-8e3c-6b11aa545c93) / demo.neon.catl.admin | legal_entity: 9fa2d01f-d2c5-50c7-9a76-a243415c1872 (35a717a8-fa8f-3828-f9ff-ff51afe79bcc); CirrusAtlantic Ltd | exact | df1e31bd9416f34c01e2dbde7121eac9b97a07fca357590a8eac940eea557451 |

## bp-review-da1e022b61a362c1

Manifest SHA-256: `8d648d701924309f5d0c560b1e1d4916d70d641321dc1026d1f9f357812890d1`

Decision: **approve_responsibilities**. Role: `catl.demo.business_partner_case_approver`. Reviewer: `catl.owner`, both domains.

Map the dedicated existing case review responsibility in its exact organization scope. Retain independent work-item assignment and maker/checker authorization; scoped BP read is not promoted to global-record read.

Proposed capabilities (the exact scope for each named principal is in the table):

- **case_reader:** `neon.relationship.entity_case.read`
- **case_approver:** `neon.relationship.entity_case.decide`

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.read`

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| a69b2903c1217e622844ea9ecf97ce0fb784be9e25a3b84c0637d15774be3889 | acceptance.bp.v1.approver (1ee5151e-8296-57fc-9bb1-3ed1cc1537f4) / acceptance.bp.v1.approver | operating_organization: a478f9c0-8226-5d22-9599-b8fb27a45180 (bd7f1a62-5c32-5a9b-a984-c5adc3370a24); CirrusAtlantic Operations | subtree | 88aa7eb30976d2f9d9be738eab6fb00c7004d86960052fca7dc6bb62b72a3966 |

## bp-review-e55882179c40eaad

Manifest SHA-256: `971766eba62c7f59a16e774997e21def552113f92c77331c15d1b827cd2010a7`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 4b0eb34b80051a6b5e58e5d2909487ebd1bad834481e3b413d88e010498ea38d | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | operating_organization: 51bbb2b9-c102-59a7-8b6c-ee7d23bb2b8d (ee56f8a4-0c12-b982-9019-35a8c7e0c20e); Athyper AMERICAS Procurement | subtree | 4424e6136712d221ff0d955da1f57a82af2a3b673ef9f7653119fa6136772cb4 |

## bp-review-e7ed9a3a4014d99a

Manifest SHA-256: `6dd2655d8cfc18e2a2f9872828c4e32f6c93a1b467f57ba5ab691aa3cf7f9771`

Decision: **approve_responsibilities**. Role: `demo.neon.testing-admin-operating_organization-subtree`. Reviewer: `catl.owner`, both domains.

Map existing organization-scoped case request/read/apply capabilities. Do not assign approver from this mixed administrator combination; preserve its legacy decide and BP mutations pending separate review. An applier cannot apply a case they approved, and cannot approve their own submission.

Proposed capabilities (the exact scope for each named principal is in the table):

- **case_requester:** `neon.relationship.entity_case.create`, `neon.relationship.entity_case.submit`, `neon.relationship.entity_case.update`, `neon.relationship.entity_case.validate`
- **case_reader:** `neon.relationship.entity_case.read`
- **case_applier:** `neon.relationship.entity_case.materialize`

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.activate`
- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.entity_case.decide`

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 1351ab401b93c7e94419fb98af7b45b015c6a6e81af97a0b973d3d88504e10f7 | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | operating_organization: 51bbb2b9-c102-59a7-8b6c-ee7d23bb2b8d (ee56f8a4-0c12-b982-9019-35a8c7e0c20e); Athyper AMERICAS Procurement | subtree | 77cc00eba1a124b75701e9500f1ec796b2687d1e5d600d1aa9eb52dbec9f691d |
| 20e2dc4312e0f10b3f99d317378fbfa6a1e47615f36166cbb515d26a0de0d665 | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | operating_organization: c6d51f2a-198f-53c2-847d-aec000e5dfef (a8dbfe9b-2fdc-7dec-dfc8-7f2de7dbd3c7); Athyper Shared Services | subtree | ca249d2350200238166563dc7e3ebce5b507e777cf2fe184eace27cd603a37f8 |
| 2291b8ee870f9124ea845e09e11d0913e54f7ab604a9b32604e696c7a6b3d0ec | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | operating_organization: ce465b6b-192d-5211-a245-de1ad7fa4c44 (b0617d7c-1fcc-61b8-7d32-886f5b90120b); Athyper APAC Finance | subtree | 433f3bf24a7eee4de74afb6768319280ec56a0fecf6e059227521431cf5b4cf8 |
| 26902ddd70d6e4a640514a2afb3f16fe9ae02c817c08e531be8fc14379d7c7d1 | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | operating_organization: cef5c9fd-61ad-59e9-b29f-0802dfff71a2 (50632ff2-70b6-2b7f-bbad-c2a4a4cbbe65); Athyper EMEA People | subtree | 6117e532a08de9b8edc5cf15caeb9058fe228921c7e4e388fad7d690d05e6d9e |
| 326b9f68d72ea5be6036fe5c53a0caa612c8d01f1fd24344943e4b71fffbbd4e | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | operating_organization: b485586a-5753-5a62-ae70-a85fa4d19d10 (117847b0-de0f-280a-cae4-fefdcdbbc893); Athyper AMERICAS People | subtree | b7c221cfafc96ecca4223b4bf8286c3c4f3d5d90cd30b286c59bcec2c12bcf4d |
| 46f04d8ad06283465b3b34641b229118b85c2984118d4b1216c238213bffc778 | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | operating_organization: 06fe7343-59dc-576b-95aa-9fadf37b1cfd (3f4c595c-62fe-f400-6ed0-1182b9c92966); Athyper EMEA Procurement | subtree | 360fb3f3ac1022e6bce284874812b3cdf79ef500aaa9d65cb5ba1301ae95e113 |
| 49f0d0af7e2e6fd6dc2cbcaf5853f4fd054f67f762ca6e6256173b63dfdde1b8 | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | operating_organization: 12169af1-7c53-5538-941e-45f136ccbe2f (f8676fee-278c-dc9d-c074-05c4e692bc01); Athyper APAC People | subtree | c4232781b09bd5422d024462472de95710d33325879aa6355252dba7629ed592 |
| 54eb36ef4148fb172d32b4ab62b64ce3738d7419a648c8a1fa0949dbd5d82126 | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | operating_organization: cee77cc4-b5c8-5e5e-a225-035f616e162c (fef9934a-aab0-6702-8705-bb23b517e19c); Athyper EMEA Finance | subtree | 5c1149003d5842047661c8b74360f909a4089ed2d64ffb0271e3e15021cc699b |
| 5f547e80b132be9f5fac9db8b1b6010670eca2d98d4e8d5fe40824f8f21ee56a | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | operating_organization: 5267f3a7-4113-5b94-bc1a-c67aa760916a (51b4fc2a-9312-7a96-264d-6e6e548ca21b); Athyper AMERICAS Finance | subtree | 2bb837a4a011997276f0db0f072f25346b1a448b4752556fbd82a05cbb087dc9 |
| bcedaf5ec98df9b7be214442b0c51fc00c71d8f2f07a9eaf949ee70cb824cf3a | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | operating_organization: b07b2544-67b9-5b03-8607-9c35d6886877 (c30cea16-551b-bd62-7bde-dc8928671a9b); Athyper APAC Procurement | subtree | 70f45b72e19d6dd4db8856674ed907936d75de5572e3e9c79b2744d42c29dcff |

## bp-review-eb17c622fa8096c7

Manifest SHA-256: `98206785f6773f3328b7cc656beb2d8a179dc87615067c06952d05606d6e5477`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 8433694c1eb66dd71c7442c35e0e887062ca71f691afbad2764abfe81108f41c | tksa.admin (58044322-4569-5169-9740-aacd987ae12f) / demo.neon.tksa.admin | operating_organization: 3cdb2c1f-3d49-541e-867e-e0658765db26 (1c67189c-640d-b738-61c9-ad876ce857f1); Technostat Shared Procurement | subtree | e12d74a7bd9c31d296d040f7cfb3f2e6aebb0877ff988456f2a6039eb27ae8e6 |

## bp-review-f25088bd0d7bb277

Manifest SHA-256: `7f7942a5fb964d32940c3a3fd606b3b53e775d8a53d75bd0fe1b3f2dc1861c79`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| b56f729c05443c94cafc86a20ca689921cf08122553138805d7d0d374a17b9ed | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | operating_organization: 12169af1-7c53-5538-941e-45f136ccbe2f (f8676fee-278c-dc9d-c074-05c4e692bc01); Athyper APAC People | subtree | 5b190184e800e2127bc62a0ef4b0c6f684f6bedd87bc177894794a3c59705fc4 |

## bp-review-f4bbc25cca3f264c

Manifest SHA-256: `a40e92b5050fb383002fcda186f22add1e55c468b13f66f00072503a2e3cd635`

Decision: **retain_legacy_only**. Role: `local.master-data.root`. Reviewer: `catl.owner`, both domains.

Retain scoped legacy root read/update pending resolution of directory/global-read policy and governed mutation capabilities; do not widen scope or infer stewardship.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`

Individual-review reasons: reviewer_is_assignment_subject.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| 8bf3050729271d616281108414045ab23567cbd245f7e4b9767ddfdb8662c772 | catl.owner (645b6a55-3355-526a-9643-3900425bde47) / local.master-data.catl.owner | operating_organization: 24267903-6196-5846-8322-43a8e35c9630 (0d96565b-f87d-37ab-f454-ccfdafbd1ee4); Local synthetic master-data organization B | subtree | 6b17986d093bc79d1b3a762247034fe7a877624eced9639b24f466d9fb1044ec |

## bp-review-fbdb34b22a6373de

Manifest SHA-256: `311815ade571fa95a5f8367b0ddedc2191af30d6a16f176774bcc98ce173be5e`

Decision: **retain_legacy_only**. Role: `demo.neon.business-partner-reader`. Reviewer: `catl.owner`, both domains.

Retain the mixed legacy reader role pending explicit separation of directory discovery, global-record read, provider read, mutation and sensitive reveal. Its name is not a safe target responsibility definition.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| e9876f358d391a29ec1df26e95278ab9db466192aeb7e66d8c2661ac9969fdea | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | operating_organization: cee77cc4-b5c8-5e5e-a225-035f616e162c (fef9934a-aab0-6702-8705-bb23b517e19c); Athyper EMEA Finance | subtree | de984dc564d876da9377b6893cb4f19ce8ef64324ec6a0c7127836161ec6d9b2 |

## bp-review-fec66db181de3b79

Manifest SHA-256: `5a87142b0bb7b9314d21c2561b6ba1000dac5d710e8ae38b6b697e1f74ceca4b`

Decision: **exclude_from_target**. Role: `acceptance.bp.r2.4d6847c0-fcc3-5fa2-b039-2df3373fe4d3`. Reviewer: `catl.owner`, both domains.

Acceptance fixture role and scope: exclude this test-only combination from the target business responsibility mapping. Existing grants remain untouched; any fixture cleanup requires a separate change.

Retained legacy capabilities; no grant revocation:

- `neon.relationship.business_partner.create`
- `neon.relationship.business_partner.read`
- `neon.relationship.business_partner.update`
- `neon.relationship.business_partner_activity.read`
- `neon.relationship.business_partner_address.read`
- `neon.relationship.business_partner_amend.create`
- `neon.relationship.business_partner_bank.read_masked`
- `neon.relationship.business_partner_bank.reveal`
- `neon.relationship.business_partner_certificate.read`
- `neon.relationship.business_partner_contact.read`
- `neon.relationship.business_partner_credit.read`
- `neon.relationship.business_partner_identifier.read_masked`
- `neon.relationship.business_partner_identity.read`
- `neon.relationship.business_partner_network.read`
- `neon.relationship.business_partner_person.read`
- `neon.relationship.business_partner_person_sensitive.read`
- `neon.relationship.business_partner_qualification.read`
- `neon.relationship.business_partner_tax.read_masked`
- `neon.relationship.business_partner_tax.reveal`
- `neon.relationship.business_partner_workforce.read`
- `neon.relationship.entity_case.read`

Individual-review reasons: test_fixture_exclusion, sensitive_or_mixed_reader.

| Candidate | Named principal / group | Exact target (registry ID) | Propagation | Proposal SHA-256 |
| --- | --- | --- | --- | --- |
| e221e9cd8758c577ab881e9e47f1352667c499cc836d75275827864dca393520 | athyper.admin (d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c) / demo.neon.athyper.admin | operating_organization: 8cb267f9-c30c-5c87-9c35-c0e4830ecb8c (16a8b151-afe6-1db6-91b3-db358b7da34a); Business Partner R2 acceptance | subtree | 6c32c9153d77e3597106f5135eb0629baa48d7a8777f538fb3b1400d2c38a0d9 |
