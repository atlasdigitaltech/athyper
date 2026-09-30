# Authenticated reset BP draft — 11 September 2026

Studio authoring now works against the reset baseline. catl.admin completed normal login and separate authoring step-up; live identity verification confirmed elevated assurance and the five approved authoring permissions. No MFA values or session tokens are included in this evidence.

## Engineering and deployment

The native create-draft route previously required a pre-existing metadata entity identity, leaving the empty reset registry unable to create a draft. It now accepts an optional, strict `registration` v1 object with module code, entity class and tenant/overlay metadata ownership. Existing callers remain explicit existing-identity operations; they cannot silently register missing entities.

The normal `metadata.entity.author` check remains required. Tenant/principal identity comes from the verified server context. New identity registration and draft creation share one transaction, use an active module, and insert only draft status. Duplicate identities are not overwritten; retired entities and global/system/package registrations cannot be reactivated through this option. Runtime resource ownership remains a separate authorization-profile concern.

Four registration tests and the existing route-scope test passed. Contract and authoring packages build. The three compiled runtime files were deployed on the existing DEV image with no network dependency downloads. API and worker are healthy; combined Studio/NEON authorization and activation fingerprints stayed unchanged across deployment.

Image: `sha256:80f3ee96cf2232c5438d9a1d23cc865c920c17679e183a041040980ed7179f94`.

Deployment receipt: `governance/policy/reports/business-partner-reset-registration-deployment.dev.json`. The receipt retains the previous private compose path for configuration recovery; no grant snapshot is restored by configuration recovery.

## Authenticated native result

- Entity: `289732bb-45c2-49e6-abb3-70ff4b85336b`, `business_partner`, draft.
- Change set: `c617270b-cbc3-44ed-867e-31e55e819c3c`, draft.
- Author: `catl.admin` (`81cd1978-2df5-5c9a-938a-2f8c291aea13`).
- Native create, graph staging, validation and contract tests succeeded.
- No submit, independent review, signing, publication or activation was performed.

Receipt: `governance/policy/reports/business-partner-reset-native-draft.dev.json`. The historical graph and its hash are pinned as authoring input, not represented as a newly approved release. Original release-20 evidence remains unchanged.

## Remaining work

The staged graph still carries the historical successor marker. The predecessor materialization path cannot operate against the reset's absent source publication. Implement a reviewed reset runtime payload materializer preserving storage, list/record presentation, operations, fields, authorization and Atlas data. Do not strip the marker and publish the reduced native descriptor as a runtime replacement.

Independent review/signing, company-pilot lifecycle and field publication, exact-release business/ownership journeys, compatible recovery and renewed acceptance of the 66 dispositions remain open. The fresh authoring success is evidence for the registration path only.
