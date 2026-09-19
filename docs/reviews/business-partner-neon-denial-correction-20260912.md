# NEON denial-response correction

Live revocation on the approved NEON release removed access correctly, but BP provider and reveal routes returned HTTP 500 when the Records admission layer threw its HTTP 403 error. The BP route handles `MasterDataError.status`; Records uses `RecordServiceError.statusCode`. This correction translates only recognized Records 403/404 failures at the injected directory-admission boundary, preserves the denial status and hides upstream detail. Unexpected failures remain errors. No permission check is removed or weakened.

The [image-only proposal](../../governance/policy/reviews/business-partner-neon-denial-image-20260912.proposal.dev.json), revision `5ffe103d2645a4428119bdf795988022bb7981121dce2a82c52ec2d4f4eadc39`, is ready for approval.

| Item                   | Binding                                                                   |
| ---------------------- | ------------------------------------------------------------------------- |
| Current approved image | `sha256:bb6946f9f7d4e771dbc2f27d045dc768a009d4ff26b97d6bd5710ee08b3f4084` |
| Corrected candidate    | `sha256:0a2546bd78a84e296dd43d1c59cd710e5e6c582f4ca8f089db056e62baafafd7` |
| Candidate release set  | `df0e005474db9b23ea476ff067e0172ddceff1b1bd9ef1fb86bb30275241bbde`        |
| Deployment             | Isolated NEON API/worker and pinned harness only                          |
| Artifact changes       | None; preserve the five signed artifacts                                  |
| Access changes         | None; preserve all revoked and expired grants                             |

Eight status-preservation tests failed before the fix; all nine new tests pass after it. Four independent-child tests and 31 focused BP service tests pass, as do Master Data source/test type checks and compilation. Comparison with the deployed compiled service found only the error-translation block; the image overlays its JavaScript and source map. Health and unauthenticated NEON denial smoke checks pass. The disposable canary was removed. Authenticated qualification against this new image has not been performed.

The guarded deployment script is `tooling/scripts/verification/isolated-enter/deploy-neon-denial-host.mjs`. It requires the exact proposal approval, verifies image/harness pins, and checks that the preceding qualification memberships and assignments remain revoked. After deployment, run authenticated record, provider, reveal-command and scoped Atlas negative checks and compatible recovery with access still revoked. This approval does not authorize new access, source grants, enforcement activation, compatibility retirement or disposition acceptance.

The [current completion checkpoint](../../governance/policy/reports/business-partner-neon-final-completion-checkpoint-20260912.dev.json) records the completed populated masking, independent-child, Atlas, revocation and bounded recovery checks. Positive reveals and nested company providers still require separately approved source authority in addition to target permissions. Positive business activity lacks an owning-module implementation; positive filtered count fixtures and all 66 final-release disposition comparisons/acceptance remain open.

## Approved and qualified — 12 September 2026

The user approved revision `5ffe103d2645a4428119bdf795988022bb7981121dce2a82c52ec2d4f4eadc39`. The isolated API and worker now run the corrected `0a2546bd...` image. [Completion evidence](../../governance/policy/reports/business-partner-neon-denial-completion-20260912.dev.json) binds all five artifacts, deployment, 36 authenticated checks, compatible recovery and cleanup. Both actors' identity checks returned 200; all 32 record/provider/reveal-command/Atlas checks returned 403 before and after recovery. Provider and reveal denials now use `BP_360_RECORD_FORBIDDEN`, resolving the earlier 500 responses. An incompatible artifact-byte probe was rejected before serving requests.

No grants were created, renewed or restored. Authorization and active-release fingerprints survived recovery unchanged; shared and isolated membership inventories remain unchanged with zero active qualification assignments. Publication waiting/active/delayed queues remain empty. Failed/completed jobs, synthetic records, approval history and stopped recovery containers remain retained; disposable probes are removed. The image amendment is complete. The broader positive journeys and disposition work listed above remain open.
